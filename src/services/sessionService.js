const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { isValidSessionId, buildMetadata } = require('../utils/helpers');
const SessionRepository = require('./sessionRepository');
const EventNormalizer = require('./eventNormalizer');

class SessionService {
  constructor(sessionDir) {
    // If sessionDir is provided, use it (for backward compatibility)
    // Otherwise, use SessionRepository's default multi-source configuration
    if (sessionDir) {
      this.SESSION_DIR = sessionDir;
      this.sessionRepository = new SessionRepository(sessionDir);
    } else {
      // Use default configuration (Copilot + Claude + Pi-Mono)
      this.sessionRepository = new SessionRepository();
    }

    // Initialize EventNormalizer for unified tool format
    this.eventNormalizer = new EventNormalizer();
  }

  async getAllSessions(sourceFilter = null) {
    const sessions = await this.sessionRepository.findAll(sourceFilter);
    return sessions.map(s => s.toJSON());
  }

  async getPaginatedSessions(page = 1, limit = 20, sourceFilter = null) {
    const allSessions = await this.sessionRepository.findAll(sourceFilter);
    const sessions = allSessions.map(s => s.toJSON());

    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedSessions = sessions.slice(startIndex, endIndex);

    return {
      sessions: paginatedSessions,
      totalSessions: sessions.length,
      currentPage: page,
      totalPages: Math.ceil(sessions.length / limit),
      hasNextPage: endIndex < sessions.length,
      hasPrevPage: page > 1
    };
  }

  async getSessionById(sessionId) {
    if (!isValidSessionId(sessionId)) {
      return null;
    }

    const sessions = await this.getAllSessions();
    return sessions.find(s => s.id === sessionId);
  }

  async getSessionEvents(sessionId, options = null) {
    if (!isValidSessionId(sessionId)) {
      return options ? { events: [], total: 0 } : [];
    }

    // First, find the session to get its source and type
    const session = await this.sessionRepository.findById(sessionId);
    if (!session) {
      return options ? { events: [], total: 0 } : [];
    }

    const adapter = this._getSourceAdapter(session.source);
    const sourceConfig = this.sessionRepository.sources.find(s => s.type === session.source);
    let resolvedSourceDir = sourceConfig?.dir || null;

    if (!resolvedSourceDir && adapter) {
      resolvedSourceDir = await adapter.resolveDir();
    }
    
    // Support legacy single source dir mode
    if (this.SESSION_DIR && session.source === 'copilot') {
      resolvedSourceDir = this.SESSION_DIR;
    }

    const eventsFile = adapter && !adapter.hasCustomPipeline
      ? await adapter.resolveEventsFile(session, resolvedSourceDir)
      : null;

    let events = [];
    if (!adapter) {
      console.warn(
        `SessionService.getSessionEvents: No adapter found for source '${session.source}'. Returning no events.`
      );
    } else {
      events = (await adapter.readEvents(session, resolvedSourceDir)) || [];
    }

    // Sanitize the adapter-provided base stream before sub-agent merging.
    // Note: regular sessions intentionally still include merged sub-agent events
    // added later by _mergeSubAgentEvents() for timeline/detail analysis.
    if (events.length > 0) {
      const isSubAgentOnlySession = session.source === 'claude' && session.type === 'directory';

      if (isSubAgentOnlySession) {
        // Claude directory sessions represent sub-agent-only views.
        // If the adapter returns any mixed events, keep only sub-agent entries.
        events = events.filter(e => e._subagent);
      } else {
        // For regular sessions, remove sub-agent-tagged events from the adapter's
        // base stream so sub-agents are added in one place via _mergeSubAgentEvents().
        events = events.filter(e => !e._subagent);
      }
    }


    // Sort by timestamp with stable tiebreaker on original file order
    events.sort((a, b) => {
      const timeA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
      const timeB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
      if (timeA !== timeB) return timeA - timeB;
      return (a._fileIndex ?? 0) - (b._fileIndex ?? 0);
    });

    // Normalize events to unified format (convert Claude format to standard)
    events = events.map(event => this._normalizeEvent(event, session.source));
    
    // Load and merge sub-agent events (for both Copilot and Claude)
    // For Claude sessions without main events.jsonl, this will load subagents from correct path
    if (adapter && !adapter.hasCustomPipeline) {
      await this._mergeSubAgentEvents(events, eventsFile, sessionId, session.source);
    }
    
    // Re-run tool matching after merging subagents (subagent events need matching too)
    if (adapter && !adapter.hasCustomPipeline && session.source === 'copilot') {
      this._matchCopilotToolCalls(events);
      this._mergeHookEvents(events);
      events = this._expandCopilotToTimelineFormat(events);
    } else if (adapter && !adapter.hasCustomPipeline && session.source === 'claude') {
      this._matchClaudeToolResults(events);
      events = this._expandClaudeToTimelineFormat(events);
    } else if (adapter && !adapter.hasCustomPipeline && session.source === 'pi-mono') {
      // Pi-Mono: Keep original event structure, no transformation
      // Events are already normalized with type="message" + role in data
      // But we need to merge toolResult events into their parent assistant messages
      this._mergePiMonoToolResults(events);
    }
    
    // Clean up events for timeline rendering
    events = events.filter(e => {
      // Keep events with valid timestamps
      const ts = e.timestamp || e.snapshot?.timestamp;
      if (!ts) {
        console.warn('[SessionService] Filtered event without timestamp:', e.type, e.id || e._fileIndex);
        return false;
      }
      return true;
    });
    
    // Fix fileIndex for subagent events (999999 is too large and breaks sorting)
    events.forEach(e => {
      if (e._fileIndex === 999999 && e.timestamp) {
        // Use timestamp for sorting instead
        delete e._fileIndex;
      }
    });

    // Apply unified tool schema normalization (adds startTime, endTime, status, etc.)
    events = this.eventNormalizer.normalizeEvents(events, session.source);

    // Apply pagination if requested
    if (options && typeof options.limit === 'number' && typeof options.offset === 'number') {
      const total = events.length;
      const paginatedEvents = events.slice(options.offset, options.offset + options.limit);
      return {
        events: paginatedEvents,
        total
      };
    }

    // Backward compatibility: return array when no pagination options
    return events;
  }

  /**
   * Load and merge sub-agent events into main event stream
   * @private
   * @param {Array} events - Main events array
   * @param {string|null} mainEventsFile - Path to main events file (null if doesn't exist)
   * @param {string} sessionId - Session ID
   * @param {string} source - Session source ('copilot' or 'claude')
   */
  async _mergeSubAgentEvents(events, mainEventsFile, sessionId, source) {
    let subagentsDir;
    
    if (source === 'claude') {
      // For Claude sessions, look in .claude/projects/*/sessionId/subagents
      const claudeSource = this.sessionRepository.sources.find(s => s.type === 'claude');
      if (!claudeSource) return;
      
      try {
        const projects = await fs.promises.readdir(claudeSource.dir);
        for (const project of projects) {
          const candidateDir = path.join(claudeSource.dir, project, sessionId, 'subagents');
          try {
            const stats = await fs.promises.stat(candidateDir);
            if (stats.isDirectory()) {
              subagentsDir = candidateDir;
              break;
            }
          } catch {
            // Not in this project, continue
          }
        }
      } catch (err) {
        console.error('Error searching Claude subagents:', err);
        return;
      }
    } else if (source === 'copilot' && mainEventsFile) {
      // For Copilot sessions, detect from main events file path
      const eventsDir = path.dirname(mainEventsFile);
      const eventsBasename = path.basename(mainEventsFile);
      
      if (eventsBasename === 'events.jsonl') {
        // .copilot/session-state/<sessionId>/events.jsonl → check <sessionId>/subagents
        subagentsDir = path.join(eventsDir, 'subagents');
      } else {
        // <sessionId>.jsonl alongside session directory → check <parent>/<sessionId>/subagents
        subagentsDir = path.join(eventsDir, sessionId, 'subagents');
      }
    }
    
    if (!subagentsDir) {
      return;
    }
    
    try {
      const stats = await fs.promises.stat(subagentsDir);
      if (!stats.isDirectory()) {
        return;
      }
    } catch (err) {
      // No subagents directory
      return;
    }
    
    try {
      const files = await fs.promises.readdir(subagentsDir);
      const subagentFiles = files.filter(f => f.startsWith('agent-') && f.endsWith('.jsonl'));
      
      if (subagentFiles.length === 0) return;
      
      // Process each sub-agent
      for (const file of subagentFiles) {
        const subagentId = file.replace('.jsonl', '');
        const subagentPath = path.join(subagentsDir, file);
        
        try {
          // Stream-based reading for subagent files
          const fileStream = fs.createReadStream(subagentPath, { encoding: 'utf-8' });
          const rl = readline.createInterface({
            input: fileStream,
            crlfDelay: Infinity
          });
          
          const lines = [];
          for await (const line of rl) {
            const trimmedLine = line.trim();
            if (trimmedLine) {
              lines.push(trimmedLine);
            }
          }
          
          if (lines.length === 0) continue;
          
          // Parse first event to get metadata (slug, agentId, first message)
          let agentName = subagentId.replace('agent-', '');
          let agentDisplayName = agentName.toUpperCase();
          let agentDescription = `Sub-agent ${subagentId}`;
          
          try {
            const firstEvent = JSON.parse(lines[0]);
            // Use agentId (unique per sub-agent) instead of slug (same for all)
            if (firstEvent.agentId) {
              agentName = firstEvent.agentId;
              agentDisplayName = `agent-${firstEvent.agentId}`;
            }
            if (firstEvent.message?.content) {
              // Use first message as description (truncate if too long)
              const content = typeof firstEvent.message.content === 'string' 
                ? firstEvent.message.content 
                : JSON.stringify(firstEvent.message.content);
              agentDescription = content.length > 100 ? content.slice(0, 100) + '...' : content;
            }
          } catch (err) {
            // Fall back to file-based name
          }
          
          const subagentEvents = lines.map((line, index) => {
            try {
              const event = JSON.parse(line);
              event._fileIndex = 1000000 + index; // Offset to avoid collision
              
              // Mark as sub-agent event
              event._subagent = {
                id: subagentId,
                name: agentName
              };
              
              return event;
            } catch (err) {
              console.error(`Error parsing sub-agent ${subagentId} line ${index + 1}:`, err.message);
              return null;
            }
          }).filter(e => e !== null);
          
          if (subagentEvents.length === 0) continue;
          
          // Normalize sub-agent events (use same source as parent session)
          const normalizedSubEvents = subagentEvents.map(event => this._normalizeEvent(event, source));
          
          // Get first and last event timestamps
          const firstEvent = normalizedSubEvents[0];
          const lastEvent = normalizedSubEvents[normalizedSubEvents.length - 1];
          
          const startTime = firstEvent.timestamp || new Date().toISOString();
          const endTime = lastEvent.timestamp || new Date().toISOString();
          
          // Generate subagent.started event
          const startEvent = {
            type: 'subagent.started',
            id: `${subagentId}-start`,
            timestamp: startTime,
            _fileIndex: firstEvent._fileIndex - 1,
            _subagent: { id: subagentId, name: agentName },
            data: {
              toolCallId: subagentId,
              agentName: agentName,
              agentDisplayName: agentDisplayName,
              agentDescription: agentDescription
            }
          };
          
          // Generate subagent.completed event
          const endEvent = {
            type: 'subagent.completed',
            id: `${subagentId}-end`,
            timestamp: endTime,
            _fileIndex: lastEvent._fileIndex + 1,
            _subagent: { id: subagentId, name: agentName },
            data: {
              toolCallId: subagentId,
              result: `Sub-agent ${agentDisplayName} completed`
            }
          };
          
          // Add to main events array
          events.push(startEvent, ...normalizedSubEvents, endEvent);
          
        } catch (err) {
          console.error(`Error reading sub-agent ${subagentId}:`, err);
        }
      }
      
      // Re-sort all events by timestamp
      events.sort((a, b) => {
        const timeA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
        const timeB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
        if (timeA !== timeB) return timeA - timeB;
        return a._fileIndex - b._fileIndex;
      });
      
    } catch (err) {
      console.error('Error processing sub-agents:', err);
    }
  }

  /**
   * Match tool_result events with tool_use for Claude format
   * @private
   */
  _matchClaudeToolResults(events) {
    // Build map of tool_result by tool_use_id
    const toolResultMap = new Map();
    
    events.forEach(event => {
      if (event.data?.tools) {
        event.data.tools.forEach(tool => {
          if (tool.type === 'tool_result') {
            // Bug fix #1: Validate tool_use_id exists
            if (tool.tool_use_id) {
              toolResultMap.set(tool.tool_use_id, tool);
            } else {
              console.warn('[sessionService] tool_result missing tool_use_id:', tool);
            }
          }
        });
      }
    });
    
    // Mark user events that are entirely tool_result responses (will be filtered out in normalizer)
    events.forEach(event => {
      if (event.type === 'user' && Array.isArray(event.message?.content)) {
        const allToolResults = event.message.content.length > 0 &&
          event.message.content.every(block => block?.type === 'tool_result');
        if (allToolResults) {
          event._isToolResultWrapper = true;
        }
      }
    });

    // Match tool_use with tool_result
    events.forEach(event => {
      if (event.data?.tools) {
        event.data.tools = event.data.tools.map(tool => {
          if (tool.type === 'tool_use') {
            const result = toolResultMap.get(tool.id);
            if (result) {
              return {
                ...tool,
                result: result.content,
                _matched: true
              };
            }
            // Bug fix #4: Add _matched: false for unmatched Claude tools (consistency with Copilot)
            return {
              ...tool,
              _matched: false
            };
          }
          return tool;
        });
        
        // Bug fix: Only remove tool_result from assistant messages
        // Mark user messages that consist entirely of tool_results as wrappers (will be filtered out)
        if (event.type === 'assistant' || event.type === 'assistant.message') {
          event.data.tools = event.data.tools.filter(tool => tool.type !== 'tool_result');
        } else if (event.type === 'user' || event.type === 'user.message') {
          const allToolResults = event.data.tools.length > 0 &&
            event.data.tools.every(tool => tool.type === 'tool_result');
          if (allToolResults) {
            event._isToolResultWrapper = true;
          }
        }
      }
    });
  }

  /**
   * Match Pi-Mono tool results with tool calls by order (parentId chain)
   * Pi-Mono format: toolResult messages form a parentId chain starting from assistant message
   * After matching, removes tool.result events from the stream (they're attached to tools)
   * @private
   */
  /**
   * Merge Pi-Mono toolResult messages into their parent assistant messages
   * Pi-Mono has message events with role: user/assistant/toolResult
   * After normalization: user.message, assistant.message, and message (toolResult only)
   * toolResult events are chained via parentId (first points to assistant, rest chain to previous)
   * @private
   */
  _mergePiMonoToolResults(events) {
    const toolResultIdsToRemove = new Set();

    // Find all assistant messages with tool calls
    events.forEach(assistantEvent => {
      if (assistantEvent.type === 'assistant.message' &&  // After normalization
          assistantEvent.data.tools && 
          assistantEvent.data.tools.length > 0) {
        
        const tools = assistantEvent.data.tools;
        
        // Collect toolResult events by following parentId chain
        const resultEvents = [];
        let currentId = assistantEvent.id;
        
        // Follow the chain: find events whose parentId points to current
        let foundMore = true;
        while (foundMore && resultEvents.length < tools.length) {
          foundMore = false;
          for (const event of events) {
            if (event.type === 'message' && 
                event.data.role === 'toolResult' && 
                event.parentId === currentId && 
                !resultEvents.includes(event)) {
              resultEvents.push(event);
              currentId = event.id;
              foundMore = true;
              break;
            }
          }
        }

        // Match results to tools by order
        resultEvents.forEach((resultEvent, index) => {
          if (index < tools.length) {
            const tool = tools[index];
            tool.result = resultEvent.data.result;
            tool.resultId = resultEvent.id;
            tool.status = 'completed';
            toolResultIdsToRemove.add(resultEvent.id);
          }
        });
      }
    });

    // Remove toolResult events from the stream (they're now merged into assistant messages)
    const originalLength = events.length;
    for (let i = events.length - 1; i >= 0; i--) {
      if (events[i].type === 'message' && 
          events[i].data.role === 'toolResult' && 
          toolResultIdsToRemove.has(events[i].id)) {
        events.splice(i, 1);
      }
    }
    
    if (toolResultIdsToRemove.size > 0) {
      console.log(`[PI-MONO] Merged ${toolResultIdsToRemove.size} toolResult events into assistant messages (${originalLength} → ${events.length} events)`);
    }
  }

  /**
   * OLD METHOD - kept for reference, not used anymore
   * Match Pi-Mono tool results (old format with tool.result type)
   * @private
   */
  _matchPiMonoToolResults_OLD(events) {
    const matchedResultIds = new Set(); // Track matched tool.result event IDs to remove

    // Find all assistant messages with tool calls
    events.forEach(assistantEvent => {
      if (assistantEvent.type === 'assistant.message' && assistantEvent.data.tools && assistantEvent.data.tools.length > 0) {
        const tools = assistantEvent.data.tools;
        
        // Collect toolResult events by following parentId chain
        const resultEvents = [];
        let currentId = assistantEvent.id;
        
        // Follow the chain: find events whose parentId points to current
        let foundMore = true;
        while (foundMore && resultEvents.length < tools.length) {
          foundMore = false;
          for (const event of events) {
            if (event.type === 'tool.result' && event.parentId === currentId && !resultEvents.includes(event)) {
              resultEvents.push(event);
              currentId = event.id;
              foundMore = true;
              break;
            }
          }
        }

        // Match results to tools by order
        resultEvents.forEach((resultEvent, index) => {
          if (index < tools.length) {
            const tool = tools[index];
            tool.status = 'completed';
            tool._matched = true;
            tool.result = resultEvent.data.result;
            tool.resultId = resultEvent.id;
            matchedResultIds.add(resultEvent.id); // Mark for removal
          }
        });
      }
    });

    // Remove matched tool.result events from the stream (like Claude does)
    // These are now attached to assistant messages, don't need separate display
    const originalLength = events.length;
    for (let i = events.length - 1; i >= 0; i--) {
      if (events[i].type === 'tool.result' && matchedResultIds.has(events[i].id)) {
        events.splice(i, 1);
      }
    }
    
    if (matchedResultIds.size > 0) {
      console.log(`[PI-MONO] Removed ${matchedResultIds.size} matched tool.result events (${originalLength} → ${events.length} events)`);
    }
  }

  /**
   * Merge hook.start/hook.end pairs: attach end result to start, mark end for removal.
   * @private
   */
  _mergeHookEvents(events) {
    const pending = new Map(); // hookInvocationId → index in events array

    for (let i = 0; i < events.length; i++) {
      const ev = events[i];
      const invId = ev.data?.hookInvocationId;
      if (!invId) continue;

      if (ev.type === 'hook.start') {
        pending.set(invId, i);
      } else if (ev.type === 'hook.end') {
        const startIdx = pending.get(invId);
        if (startIdx !== undefined) {
          // Merge end result into start event
          const start = events[startIdx];
          const success = ev.data?.success !== false;
          start.data.hookSuccess = success;
          start.data.hookError = ev.data?.error || null;
          // Calculate duration
          if (start.timestamp && ev.timestamp) {
            const ms = new Date(ev.timestamp) - new Date(start.timestamp);
            start.data.hookDurationMs = ms;
            // Append duration to message
            const durationStr = ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(2)}s`;
            if (start.data.message) {
              start.data.message += `\n**Duration:** ${durationStr}`;
            }
          }
          // Update badge to show result
          start.data.badgeLabel = success ? '✓ HOOK' : '✗ HOOK';
          start.data.badgeClass = success ? 'badge-tool' : 'badge-error';
          pending.delete(invId);
        }
        // Mark hook.end for removal
        ev._remove = true;
      }
    }

    // Remove hook.end events in-place
    for (let i = events.length - 1; i >= 0; i--) {
      if (events[i]._remove) events.splice(i, 1);
    }
  }

  /**
   * Match Copilot tool.execution_start/complete events and attach to assistant.message
   * @private
   */
  _matchCopilotToolCalls(events) {
    // Step 1: Build tool execution map (start + complete paired by toolCallId)
    const toolExecutions = new Map();
    
    events.forEach(event => {
      if (event.type === 'tool.execution_start') {
        const toolId = event.data?.toolCallId;
        if (toolId) {
          toolExecutions.set(toolId, {
            name: event.data.toolName,
            input: event.data.arguments || {},
            start: event
          });
        }
      } else if (event.type === 'tool.execution_complete') {
        const toolId = event.data?.toolCallId;
        if (toolId) {
          if (toolExecutions.has(toolId)) {
            const exec = toolExecutions.get(toolId);
            exec.complete = event;
            exec.result = event.data?.result;
            exec.status = event.data?.error ? 'error' : 'completed';
            exec.error = event.data?.error;
          } else {
            // Bug fix #3: Handle orphaned execution_complete events (no matching start)
            console.warn(`[sessionService] Orphaned tool.execution_complete for toolCallId=${toolId}`);
            toolExecutions.set(toolId, {
              name: event.data.toolName || 'unknown',
              input: {},
              start: null, // No start event
              complete: event,
              result: event.data?.result,
              status: event.data?.error ? 'error' : 'completed',
              error: event.data?.error
            });
          }
        }
      }
    });
    
    // Step 2: Match toolRequests in assistant.message with tool executions
    events.forEach(event => {
      if (event.type === 'assistant.message' && event.data?.toolRequests) {
        const tools = [];
        
        event.data.toolRequests.forEach(req => {
          const toolId = req.toolCallId;
          if (toolExecutions.has(toolId)) {
            const exec = toolExecutions.get(toolId);
            tools.push({
              type: 'tool_use',
              id: toolId,
              name: req.name || exec.name,
              input: req.arguments || exec.input,
              result: exec.result,
              status: exec.status || 'running',
              error: exec.error,
              _matched: !!exec.complete,
              _startTime: exec.start?.timestamp,
              _endTime: exec.complete?.timestamp
            });
          } else {
            // Tool request but no execution found (shouldn't happen normally)
            tools.push({
              type: 'tool_use',
              id: toolId,
              name: req.name,
              input: req.arguments || {},
              status: 'running',
              _matched: false
            });
          }
        });
        
        if (tools.length > 0) {
          event.data.tools = tools;
        }
      }
    });
  }

  /**
   * Generate badge display information for an event
   * @private
   */
  _generateBadgeInfo(normalized) {
    const type = normalized.type;
    const data = normalized.data || {};
    
    // Special case: toolResult still uses type='message'
    if (type === 'message' && data.role === 'toolResult') {
      normalized.data.badgeLabel = 'TOOL RESULT';
      normalized.data.badgeClass = 'badge-tool';
      return;
    }
    
    // Special cases for specific event types
    if (type === 'session.model_change' || type === 'model.change') {
      normalized.data.badgeLabel = 'MODEL CHANGE';
      normalized.data.badgeClass = 'badge-session';
      return;
    }
    if (type === 'session.truncation') {
      normalized.data.badgeLabel = 'TRUNCATION';
      normalized.data.badgeClass = 'badge-truncation';
      return;
    }
    if (type === 'session.compaction_start' || type === 'session.compaction_complete' || type === 'compaction') {
      normalized.data.badgeLabel = 'COMPACTION';
      normalized.data.badgeClass = 'badge-compaction';
      return;
    }
    if (type === 'thinking.change') {
      normalized.data.badgeLabel = 'THINKING';
      normalized.data.badgeClass = 'badge-session';
      return;
    }
    if (type === 'system.notification') {
      normalized.data.badgeLabel = 'SYSTEM';
      normalized.data.badgeClass = 'badge-system';
      return;
    }
    
    // Extract category from type (e.g., 'user.message' → 'user')
    const parts = (type || '').split('.');
    const category = parts[0] || 'unknown';
    
    const badgeMap = {
      user: { label: 'USER', class: 'badge-user' },
      assistant: { label: 'ASSISTANT', class: 'badge-assistant' },
      reasoning: { label: 'REASONING', class: 'badge-reasoning' },
      turn: { label: 'TURN', class: 'badge-turn' },
      tool: { label: 'TOOL', class: 'badge-tool' },
      subagent: { label: 'SUBAGENT', class: 'badge-subagent' },
      skill: { label: 'SKILL', class: 'badge-skill' },
      session: { label: 'SESSION', class: 'badge-session' },
      error: { label: 'ERROR', class: 'badge-error' },
      abort: { label: 'ABORT', class: 'badge-error' }
    };
    
    const badge = badgeMap[category] || { label: category.toUpperCase(), class: 'badge-info' };
    normalized.data.badgeLabel = badge.label;
    normalized.data.badgeClass = badge.class;
  }

  /**
   * Normalize event to unified format for frontend
   * @private
   */
  _normalizeEvent(event, source) {
    const normalized = { ...event };
    normalized.data = normalized.data || {};

    if (source === 'copilot') {
      // Copilot format normalization

      // system-sourced user.message → system.notification (separate type for display)
      if (event.type === 'user.message' && event.data?.source === 'system') {
        normalized.type = 'system.notification';
        // Extract text from <system_notification>...</system_notification> tag if present
        const raw = event.data.content || event.data.message || '';
        const match = raw.match(/<system_notification>([\s\S]*?)<\/system_notification>/);
        normalized.data.message = match ? match[1].trim() : raw.trim();
        this._generateBadgeInfo(normalized);
        return normalized;
      }
      if (event.type === 'request') {
        normalized.type = 'user';
        // Extract message from payload.messages (Anthropic API format)
        if (event.payload?.messages && Array.isArray(event.payload.messages)) {
          const userMessage = event.payload.messages.find(m => m.role === 'user');
          if (userMessage) {
            normalized.message = {
              role: 'user',
              content: userMessage.content || ''
            };
          }
        }
      } else if (event.type === 'response') {
        normalized.type = 'assistant';
        // Extract message from payload.content (Anthropic API format)
        if (event.payload?.content && Array.isArray(event.payload.content)) {
          const textBlocks = event.payload.content.filter(block => block.type === 'text');
          if (textBlocks.length > 0) {
            normalized.message = {
              role: 'assistant',
              content: textBlocks.map(block => block.text).join('\n')
            };
          }
        }
      }
      
      // New format: assistant.message data normalization
      if (event.type === 'assistant.message') {
        // Convert data.content → data.message for consistency
        if (event.data?.content && event.data.content.trim()) {
          normalized.data.message = event.data.content;
        }
        // If only toolcalls, leave message empty (don't create placeholder)
      }
      
      // subagent.selected: rename data.tools to data.allowedTools to avoid collision with tool rendering
      if (event.type === 'subagent.selected' && Array.isArray(event.data?.tools)) {
        normalized.data.allowedTools = event.data.tools;
        delete normalized.data.tools;
        if (event.data.agentDisplayName || event.data.agentName) {
          normalized.data.message = `Agent: ${event.data.agentDisplayName || event.data.agentName}`;
          if (normalized.data.allowedTools.length > 0 && normalized.data.allowedTools[0] !== '*') {
            normalized.data.message += `\nTools: ${normalized.data.allowedTools.join(', ')}`;
          }
        }
      }

      // Hook events (hook.start / hook.end)
      if (event.type === 'hook.start') {
        const d = event.data || {};
        const parts = [];
        if (d.hookType) parts.push(`**Hook:** ${d.hookType}`);
        if (d.input?.toolName) parts.push(`**Tool:** ${d.input.toolName}`);
        if (d.input?.toolArgs && Object.keys(d.input.toolArgs).length > 0) {
          const argsStr = Object.entries(d.input.toolArgs)
            .map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`)
            .join(', ');
          parts.push(`**Args:** ${argsStr}`);
        }
        if (d.input?.toolResult?.textResultForLlm) {
          const preview = d.input.toolResult.textResultForLlm.slice(0, 200);
          parts.push(`**Result:** ${preview}${d.input.toolResult.textResultForLlm.length > 200 ? '…' : ''}`);
        }
        if (parts.length > 0) normalized.data.message = parts.join('\n');
        normalized.data.badgeLabel = 'HOOK';
        normalized.data.badgeClass = 'badge-tool';
        this._generateBadgeInfo(normalized);
        return normalized;
      }
      if (event.type === 'hook.end') {
        const d = event.data || {};
        const parts = [];
        if (d.hookType) parts.push(`**Hook:** ${d.hookType}`);
        parts.push(d.success ? '**Status:** ✓ success' : '**Status:** ✗ failed');
        if (d.error) parts.push(`**Error:** ${d.error}`);
        normalized.data.message = parts.join('\n');
        normalized.data.badgeLabel = 'HOOK END';
        normalized.data.badgeClass = d.success ? 'badge-tool' : 'badge-error';
        this._generateBadgeInfo(normalized);
        return normalized;
      }

      // Generate badge display info
      this._generateBadgeInfo(normalized);
      return normalized;
    }

    if (source === 'pi-mono') {
      // Pi-Mono format normalization - TRANSFORM TO UNIFIED TYPE
      if (event.type === 'message') {
        const { message } = event;
        
        // Transform type to unified format (like Copilot/Claude)
        if (message.role === 'user') {
          normalized.type = 'user.message';
        } else if (message.role === 'assistant') {
          normalized.type = 'assistant.message';
        } else if (message.role === 'toolResult') {
          // toolResult keeps 'message' type - will be merged by _mergePiMonoToolResults
          normalized.type = 'message';
        }
        normalized.data.role = message.role;
        
        // Extract text content
        if (Array.isArray(message.content)) {
          const textBlocks = message.content.filter(block => block.type === 'text');
          if (textBlocks.length > 0) {
            normalized.data.message = textBlocks.map(block => block.text).join('\n');
          }
          
          // Extract tool calls (for assistant messages)
          if (message.role === 'assistant') {
            const toolCalls = message.content.filter(block => block.type === 'toolCall');
            if (toolCalls.length > 0) {
              normalized.data.tools = toolCalls.map(tool => ({
                type: 'tool_use',
                id: tool.id,
                name: tool.name,
                input: tool.arguments
              }));
            }
          }
          
          // Extract tool result (for toolResult messages)
          if (message.role === 'toolResult') {
            normalized.data.result = textBlocks.map(block => block.text).join('\n');
          }
        }
        
        // Preserve usage metadata if available
        if (message.usage) {
          normalized.usage = message.usage;
        }
      } else if (event.type === 'model_change') {
        // Normalize to model.change format
        normalized.type = 'model.change';
        normalized.data = {
          provider: event.provider,
          model: event.modelId
        };
        // Generate readable message
        if (event.provider && event.modelId) {
          normalized.data.message = `Model changed to ${event.provider}/${event.modelId}`;
        } else if (event.modelId) {
          normalized.data.message = `Model changed to ${event.modelId}`;
        }
      } else if (event.type === 'thinking_level_change') {
        // Normalize to thinking.change format
        normalized.type = 'thinking.change';
        normalized.data = {
          level: event.thinkingLevel
        };
        // Generate readable message
        if (event.thinkingLevel) {
          normalized.data.message = `Thinking level: ${event.thinkingLevel}`;
        }
      } else if (event.type === 'session') {
        // Session metadata
        normalized.data = {
          cwd: event.cwd,
          version: event.version
        };
        // Generate readable message
        const parts = [];
        if (event.cwd) {
          parts.push(`Working directory: ${event.cwd}`);
        }
        if (event.version) {
          parts.push(`Session version: ${event.version}`);
        }
        if (parts.length > 0) {
          normalized.data.message = parts.join('\n');
        }
      }
      
      // Generate badge display info
      this._generateBadgeInfo(normalized);
      return normalized;
    }

    // Claude format normalization
    // Handle different event types
    switch (event.type) {
      case 'user':
      case 'assistant':
        // Convert Claude user/assistant messages to standard format
        if (event.message) {
          // Extract text content from message.content
          if (event.message.content) {
            const textContent = this._extractClaudeTextContent(event.message.content);
            if (textContent) {
              normalized.data.message = textContent;
            }
          }

          // Extract tool calls from message.content
          if (Array.isArray(event.message.content)) {
            // Gap #6 fix: Add null safety check for block objects
            const toolBlocks = event.message.content.filter(block => 
              block && typeof block === 'object' && 
              (block.type === 'tool_use' || block.type === 'tool_result')
            );
            
            if (toolBlocks.length > 0) {
              normalized.data.tools = toolBlocks.map(block => {
                if (block.type === 'tool_use') {
                  return {
                    type: 'tool_use',
                    id: block.id,
                    name: block.name,
                    input: block.input
                  };
                } else {
                  return {
                    type: 'tool_result',
                    tool_use_id: block.tool_use_id,
                    content: block.content
                  };
                }
              });
            }
          }

          // Preserve original message for reference
          normalized._originalMessage = event.message;
        }
        break;

      case 'file-history-snapshot':
        // Extract file list from snapshot
        if (event.snapshot?.trackedFileBackups) {
          const files = Object.entries(event.snapshot.trackedFileBackups);
          if (files.length > 0) {
            const fileList = files.map(([filename, backup]) => 
              `${filename} (v${backup.version})`
            ).join('\n');
            normalized.data.message = `Tracked files:\n${fileList}`;
          } else {
            normalized.data.message = 'No files tracked';
          }
        }
        break;

      case 'progress':
        // Extract progress information
        if (event.data) {
          const parts = [];
          if (event.data.hookName) parts.push(`Hook: ${event.data.hookName}`);
          if (event.data.hookEvent) parts.push(`Event: ${event.data.hookEvent}`);
          if (event.data.command) parts.push(`Command: ${event.data.command}`);
          if (parts.length > 0) {
            normalized.data.message = parts.join('\n');
          }
          
          // Extract nested tool_use from progress events (subagent messages)
          // Progress events from subagents contain message.message.content with tool_use blocks
          if (event.data.message?.message?.content && Array.isArray(event.data.message.message.content)) {
            const toolBlocks = event.data.message.message.content.filter(block =>
              block && typeof block === 'object' && (block.type === 'tool_use' || block.type === 'tool_result')
            );
            
            if (toolBlocks.length > 0) {
              normalized.data.tools = toolBlocks.map(block => {
                if (block.type === 'tool_use') {
                  return {
                    type: 'tool_use',
                    id: block.id,
                    name: block.name,
                    input: block.input
                  };
                } else {
                  return {
                    type: 'tool_result',
                    tool_use_id: block.tool_use_id,
                    content: block.content
                  };
                }
              });
            }
          }
        }
        break;

      case 'hook.start': {
        // Extract hook invocation info
        const d = event.data || {};
        const parts = [];
        if (d.hookType) parts.push(`**Hook:** ${d.hookType}`);
        if (d.input?.toolName) parts.push(`**Tool:** ${d.input.toolName}`);
        if (d.input?.toolArgs && Object.keys(d.input.toolArgs).length > 0) {
          const argsStr = Object.entries(d.input.toolArgs)
            .map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`)
            .join(', ');
          parts.push(`**Args:** ${argsStr}`);
        }
        if (d.input?.toolResult?.textResultForLlm) {
          const preview = d.input.toolResult.textResultForLlm.slice(0, 200);
          parts.push(`**Result:** ${preview}${d.input.toolResult.textResultForLlm.length > 200 ? '…' : ''}`);
        }
        if (parts.length > 0) normalized.data.message = parts.join('\n');
        normalized.data.badgeLabel = 'HOOK';
        normalized.data.badgeClass = 'badge-tool';
        break;
      }

      case 'hook.end': {
        const d = event.data || {};
        const parts = [];
        if (d.hookType) parts.push(`**Hook:** ${d.hookType}`);
        parts.push(d.success ? '**Status:** ✓ success' : '**Status:** ✗ failed');
        if (d.error) parts.push(`**Error:** ${d.error}`);
        normalized.data.message = parts.join('\n');
        normalized.data.badgeLabel = 'HOOK END';
        normalized.data.badgeClass = d.success ? 'badge-tool' : 'badge-error';
        break;
      }

      // Add more event types as needed
      default:
        // For unknown types, try to extract any reasonable text
        if (event.data?.message && !normalized.data.message) {
          normalized.data.message = event.data.message;
        }
    }

    // Generate badge display info
    this._generateBadgeInfo(normalized);
    return normalized;
  }

  /**
   * Extract text content from Claude message.content
   * @private
   */
  _extractClaudeTextContent(content) {
    if (typeof content === 'string') {
      return content;
    }
    
    if (Array.isArray(content)) {
      const textParts = [];
      
      for (const block of content) {
        if (block.type === 'text') {
          // Direct text block
          textParts.push(block.text);
        } else if (block.type === 'tool_result') {
          // Extract text from tool_result content
          if (typeof block.content === 'string') {
            // Format 2: direct string
            textParts.push(block.content);
          } else if (Array.isArray(block.content)) {
            // Format 1: nested array with text blocks
            const nestedText = block.content
              .filter(item => item.type === 'text')
              .map(item => item.text)
              .join('\n');
            if (nestedText) {
              textParts.push(nestedText);
            }
          }
        }
      }
      
      return textParts.join('\n');
    }
    
    return '';
  }

  async getSessionWithEvents(sessionId) {
    const session = await this.getSessionById(sessionId);
    if (!session) {
      return null;
    }

    const events = await this.getSessionEvents(sessionId);
    const metadata = buildMetadata(session);

    // Extract model from events
    const sessionStartEvent = events.find(e => e.type === 'session.start');
    if (sessionStartEvent?.data?.selectedModel) {
      metadata.model = sessionStartEvent.data.selectedModel;
    }

    const modelChangeEvent = events.find(e => e.type === 'session.model_change');
    if (modelChangeEvent?.data) {
      metadata.model = modelChangeEvent.data.newModel || modelChangeEvent.data.model;
    }

    // Derive "updated" from last event timestamp (more accurate than filesystem mtime)
    if (events.length) {
      const lastEvent = events[events.length - 1];
      if (lastEvent?.timestamp) {
        metadata.updated = lastEvent.timestamp;
      }
    }

    // Derive "created" from first event timestamp if available
    if (events.length) {
      const firstEvent = events[0];
      if (firstEvent?.timestamp) {
        metadata.created = firstEvent.timestamp;
      }
    }

    return { session, events, metadata };
  }

  /**
   * Get unified timeline structure (source-agnostic)
   * Converts raw events into standardized turns/tools/subagents structure
   * @param {string} sessionId
   * @returns {Promise<Object>} Unified timeline data
   */
  async getTimeline(sessionId) {
    const session = await this.getSessionById(sessionId);
    if (!session) {
      return null;
    }

    const events = await this.getSessionEvents(sessionId);
    const adapter = this._getSourceAdapter(session.source);

    if (adapter) {
      const timeline = adapter.buildTimeline(events, session);
      if (timeline && (timeline.turns?.length > 0 || Object.keys(timeline.summary || {}).length > 0)) {
        return timeline;
      }
    }

    // Dispatch to source-specific builder
    if (session.source === 'copilot') {
      return this._buildCopilotTimeline(events, session);
    } else if (session.source === 'claude') {
      return this._buildClaudeTimeline(events, session);
    } else if (session.source === 'pi-mono') {
      return this._buildPiMonoTimeline(events, session);
    }

    return { turns: [], summary: {} };
  }

  /**
   * Build Pi-Mono timeline from normalized events
   * Pi-Mono uses user.message/assistant.message (unified with Copilot/Claude)
   * @private
   */
  _buildPiMonoTimeline(events, _session) {
    const turns = [];
    let turnId = 0;

    // Find consecutive user -> assistant pairs
    for (let i = 0; i < events.length; i++) {
      const event = events[i];
      
      // After normalization, Pi-Mono uses unified type 'user.message'
      if (event.type === 'user.message') {
        turnId++;
        const turn = {
          id: `turn-${turnId}`,
          type: 'user-request',
          message: event.data.message || '',
          startTime: event.timestamp,
          endTime: event.timestamp,
          assistantTurns: [],  // Group assistant messages
          subagents: []
        };

        // Find all assistant responses until next user message
        let j = i + 1;
        let assistantId = 0;
        while (j < events.length && events[j].type !== 'user.message') {
          const nextEvent = events[j];
          
          if (nextEvent.type === 'assistant.message') {
            assistantId++;
            turn.endTime = nextEvent.timestamp;
            
            // Create assistant turn with its tools
            const assistantTurn = {
              id: `assistant-${assistantId}`,
              startTime: nextEvent.timestamp,
              endTime: nextEvent.timestamp,
              tools: []
            };

            // Extract tools from this assistant message
            if (nextEvent.data.tools && Array.isArray(nextEvent.data.tools)) {
              for (const tool of nextEvent.data.tools) {
                assistantTurn.tools.push({
                  name: tool.name,
                  startTime: nextEvent.timestamp,
                  endTime: nextEvent.timestamp, // Pi-Mono doesn't have separate end time
                  status: tool.status || 'completed',
                  input: tool.input,
                  result: tool.result
                });
              }
            }

            turn.assistantTurns.push(assistantTurn);
          }
          
          j++;
        }

        turns.push(turn);
      }
    }

    // Calculate summary statistics
    const totalTools = turns.reduce((sum, t) => 
      sum + t.assistantTurns.reduce((aSum, at) => aSum + at.tools.length, 0), 0
    );

    const summary = {
      totalTurns: turns.length,
      totalAssistantTurns: turns.reduce((sum, t) => sum + t.assistantTurns.length, 0),
      totalTools,
      totalSubagents: 0,
      startTime: events[0]?.timestamp,
      endTime: events[events.length - 1]?.timestamp
    };

    return { turns, summary };
  }

  /**
   * Build Copilot timeline from normalized events
   * Copilot has explicit turn_start/complete and tool.execution_start/complete
   * @private
   */
  _buildCopilotTimeline(events, _session) {
    const turns = [];
    let currentTurn = null;
    let turnId = 0;

    for (const event of events) {
      if (event.type === 'assistant.turn_start') {
        turnId++;
        currentTurn = {
          id: `turn-${turnId}`,
          type: 'assistant-turn',
          message: event.data.message || '',
          startTime: event.timestamp,
          endTime: null,
          tools: [],
          subagents: []
        };
      } else if (event.type === 'assistant.turn_complete' && currentTurn) {
        currentTurn.endTime = event.timestamp;
        turns.push(currentTurn);
        currentTurn = null;
      } else if (event.type === 'tool.execution_start' && currentTurn) {
        const tool = {
          name: event.data.tool || event.data.name,
          startTime: event.timestamp,
          endTime: null,
          status: 'running',
          input: event.data.arguments || event.data.input
        };
        currentTurn.tools.push(tool);
      } else if (event.type === 'tool.execution_complete' && currentTurn) {
        // Find matching tool by name and update
        const tool = currentTurn.tools.find(t => 
          t.name === (event.data.tool || event.data.name) && !t.endTime
        );
        if (tool) {
          tool.endTime = event.timestamp;
          tool.status = (event.data?.error || event.data?.isError) ? 'error' : 'completed';
          tool.result = event.data?.result;
        }
      }
    }

    // Close any open turn
    if (currentTurn) {
      currentTurn.endTime = events[events.length - 1]?.timestamp;
      turns.push(currentTurn);
    }

    const summary = {
      totalTurns: turns.length,
      totalTools: turns.reduce((sum, t) => sum + t.tools.length, 0),
      totalSubagents: 0,
      startTime: events[0]?.timestamp,
      endTime: events[events.length - 1]?.timestamp
    };

    return { turns, summary };
  }

  /**
   * Build Claude timeline from normalized events
   * Claude has tool_use/tool_result embedded in messages
   * @private
   */
  _buildClaudeTimeline(events, session) {
    // Similar to Pi-Mono but may have different patterns
    // For now, delegate to Pi-Mono logic (can refine later)
    return this._buildPiMonoTimeline(events, session);
  }

  /**
   * Expand Pi-Mono format (assistant.message with embedded tools) to Copilot-compatible event stream
   * This allows time-analyze.ejs to work with Pi-Mono sessions without modification
   * @private
   * @param {Array} events - Normalized Pi-Mono events
   * @returns {Array} Expanded events in Copilot format
   */
  _expandPiMonoToCopilotFormat(events) {
    const expanded = [];
    let turnCounter = 0;
    let toolCallCounter = 0;

    for (let i = 0; i < events.length; i++) {
      const event = events[i];

      // Keep non-message events as-is
      if (event.type !== 'user.message' && event.type !== 'assistant.message') {
        expanded.push(event);
        continue;
      }

      // Track user messages for turn grouping
      if (event.type === 'user.message') {
        turnCounter++;
        expanded.push({
          ...event,
          _turnNumber: turnCounter
        });
        continue;
      }

      // Expand assistant.message to turn_start + tool events + turn_complete
      if (event.type === 'assistant.message') {
        const tools = event.data.tools || [];
        const turnStartTime = event.timestamp;
        const turnId = `pi-turn-${i}`;

        // Insert assistant.turn_start
        expanded.push({
          type: 'assistant.turn_start',
          id: `${turnId}-start`,
          timestamp: turnStartTime,
          parentId: event.parentId,
          data: {
            message: event.data.message || '',
            model: event.data.model,
            tools: tools.length > 0 ? tools : undefined
          },
          _synthetic: true,
          _turnNumber: turnCounter,
          _fileIndex: event._fileIndex
        });

        // Keep the original assistant.message event
        expanded.push({
          ...event,
          _fileIndex: event._fileIndex + 0.05
        });

        // Insert tool.execution_start and tool.execution_complete for each tool
        tools.forEach((tool, idx) => {
          const toolCallId = `pi-tool-${toolCallCounter++}`;
          const toolStartTime = turnStartTime; // Pi-Mono doesn't have separate timestamps
          const toolEndTime = turnStartTime; // Same timestamp

          expanded.push({
            type: 'tool.execution_start',
            id: `${toolCallId}-start`,
            timestamp: toolStartTime,
            parentId: turnId,
            data: {
              toolCallId,
              toolName: tool.name,
              tool: tool.name, // Alias for compatibility
              arguments: tool.input || {}
            },
            _synthetic: true,
            _fileIndex: event._fileIndex + 0.1 + (idx * 0.01)
          });

          expanded.push({
            type: 'tool.execution_complete',
            id: `${toolCallId}-complete`,
            timestamp: toolEndTime,
            parentId: toolCallId,
            data: {
              toolCallId,
              toolName: tool.name,
              tool: tool.name, // Alias
              result: tool.result,
              error: tool.status === 'error' ? 'Tool execution failed' : null,
              isError: tool.status === 'error'
            },
            _synthetic: true,
            _fileIndex: event._fileIndex + 0.15 + (idx * 0.01)
          });
        });

        // Insert assistant.turn_complete
        expanded.push({
          type: 'assistant.turn_complete',
          id: `${turnId}-complete`,
          timestamp: event.timestamp,
          parentId: turnId,
          data: {
            message: event.data.message || ''
          },
          _synthetic: true,
          _turnNumber: turnCounter,
          _fileIndex: event._fileIndex + 0.9
        });
      }
    }

    return expanded;
  }

  /**
   * Expand Copilot format (user/assistant) to timeline format with turn_start/complete
   * @private
   /**
   * Convert VSCode tool.invocation events into assistant.message events with data.tools,
   * so they render using the same frontend tool-list component.
   * Groups consecutive tool.invocation events under a single assistant.message when possible.
   */
  _expandVsCodeEvents(events) {
    const result = [];
    let pendingTools = [];
    let pendingParentId = null;
    let pendingTs = null;
    let pendingIdx = 0;
    let pendingSubAgentId = null;
    let pendingSubAgentName = null;

    const flushTools = () => {
      if (pendingTools.length === 0) return;
      result.push({
        type: 'assistant.message',
        id: `vscode-tools-${pendingIdx}`,
        timestamp: pendingTs,
        parentId: pendingParentId,
        data: {
          message: '',
          content: '',
          tools: pendingTools,
          subAgentId: pendingSubAgentId,
          subAgentName: pendingSubAgentName,
        },
        _synthetic: true,
      });
      pendingTools = [];
      pendingSubAgentId = null;
      pendingSubAgentName = null;
    };

    for (let i = 0; i < events.length; i++) {
      const ev = events[i];
      if (ev.type === 'tool.invocation') {
        const evSubAgentId = ev.data?.subAgentId || null;
        // Flush if switching to a different subagent's tool group
        if (pendingTools.length > 0 && evSubAgentId !== pendingSubAgentId) {
          flushTools();
        }
        if (pendingTools.length === 0) {
          pendingParentId = ev.parentId;
          pendingTs = ev.timestamp;
          pendingIdx = i;
          pendingSubAgentId = evSubAgentId;
          pendingSubAgentName = ev.data?.subAgentName || null;
        }
        if (ev.data?.tool) pendingTools.push(ev.data.tool);
      } else {
        flushTools();
        result.push(ev);
      }
    }
    flushTools();
    return result;
  }

  /**
   * @param {Array} events - Normalized Copilot events
   * @returns {Array} Expanded events with turn_start/complete
   */
  _expandCopilotToTimelineFormat(events) {
    const expanded = [];
    let turnCounter = 0;

    for (let i = 0; i < events.length; i++) {
      const event = events[i];

      // Convert user → user.message
      if (event.type === 'user') {
        turnCounter++;
        expanded.push({
          ...event,
          type: 'user.message',
          _turnNumber: turnCounter,
          data: {
            ...event.data,
            message: event.message?.content || event.data?.message || ''
          }
        });
        continue;
      }

      // Convert assistant → turn_start + (optional tools) + turn_complete
      if (event.type === 'assistant') {
        const assistantId = event.uuid || `copilot-assistant-${i}`;
        const timestamp = event.timestamp;

        // Extract message content
        let messageText = '';
        if (event.message?.content) {
          if (Array.isArray(event.message.content)) {
            // Claude-style content array
            messageText = event.message.content
              .filter(block => block && block.type === 'text')
              .map(block => block.text)
              .join('\n');
          } else if (typeof event.message.content === 'string') {
            // Simple string content
            messageText = event.message.content;
          }
        } else if (event.data?.message) {
          messageText = event.data.message;
        }

        // Insert assistant.turn_start
        expanded.push({
          type: 'assistant.turn_start',
          id: `${assistantId}-start`,
          timestamp,
          parentId: event.parentId,
          uuid: event.uuid,
          data: {
            message: messageText,
            turnId: assistantId
          },
          _synthetic: true,
          _turnNumber: turnCounter,
          _fileIndex: event._fileIndex
        });

        // Insert assistant.message (for Timeline rendering)
        expanded.push({
          type: 'assistant.message',
          id: assistantId,
          timestamp,
          parentId: event.parentId,
          uuid: event.uuid,
          data: {
            message: messageText,
            tools: event.data?.tools || []
          },
          _synthetic: true,
          _turnNumber: turnCounter,
          _fileIndex: event._fileIndex + 0.05
        });

        // Insert tool events if they exist (already matched by _matchCopilotToolCalls)
        // Tools are attached to assistant event as data.tools array
        if (event.data?.tools && event.data.tools.length > 0) {
          event.data.tools.forEach((tool, idx) => {
            // tool.execution_start
            if (tool.start) {
              expanded.push({
                ...tool.start,
                _fileIndex: event._fileIndex + 0.1 + (idx * 0.02)
              });
            }
            
            // tool.execution_complete
            if (tool.complete) {
              expanded.push({
                ...tool.complete,
                _fileIndex: event._fileIndex + 0.15 + (idx * 0.02)
              });
            }
          });
        }

        // Insert assistant.turn_complete
        expanded.push({
          type: 'assistant.turn_complete',
          id: `${assistantId}-complete`,
          timestamp,
          parentId: assistantId,
          uuid: event.uuid,
          data: {
            message: messageText
          },
          _synthetic: true,
          _turnNumber: turnCounter,
          _fileIndex: event._fileIndex + 0.9
        });

        continue;
      }

      // Keep other events as-is
      expanded.push(event);
    }

    return expanded;
  }

  /**
   * Expand Claude format (user/assistant) to timeline format with turn_start/complete
   * @private
   * @param {Array} events - Normalized Claude events
   * @returns {Array} Expanded events with turn_start/complete
   */
  _expandClaudeToTimelineFormat(events) {
    const expanded = [];
    let turnCounter = 0;

    for (let i = 0; i < events.length; i++) {
      const event = events[i];

      // Convert user → user.message
      if (event.type === 'user') {
        turnCounter++;
        expanded.push({
          ...event,
          type: 'user.message',
          _turnNumber: turnCounter,
          data: {
            ...event.data,
            message: event.data?.message || ''
          }
        });
        continue;
      }

      // Convert assistant → turn_start + (optional tools) + turn_complete
      if (event.type === 'assistant') {
        const assistantId = event.id || `claude-assistant-${i}`;
        const timestamp = event.timestamp;

        // Extract message content (already normalized in _normalizeEvent)
        const messageText = event.data?.message || '';

        // Insert assistant.turn_start
        expanded.push({
          type: 'assistant.turn_start',
          id: `${assistantId}-start`,
          timestamp,
          parentId: event.parentId,
          data: {
            message: messageText,
            turnId: assistantId
          },
          _synthetic: true,
          _turnNumber: turnCounter,
          _fileIndex: event._fileIndex
        });

        // Insert assistant.message (for Timeline rendering)
        expanded.push({
          type: 'assistant.message',
          id: assistantId,
          timestamp,
          parentId: event.parentId,
          data: {
            message: messageText,
            tools: event.data?.tools || []
          },
          _synthetic: true,
          _turnNumber: turnCounter,
          _fileIndex: event._fileIndex + 0.05
        });

        // Insert tool events if they exist (already matched by _matchClaudeToolResults)
        if (event.data?.tools && event.data.tools.length > 0) {
          event.data.tools.forEach((tool, idx) => {
            if (tool.type === 'tool_use') {
              // Tool call
              expanded.push({
                type: 'tool.execution_start',
                id: `${tool.id}-start`,
                timestamp,
                data: {
                  toolCallId: tool.id,
                  toolName: tool.name,
                  arguments: tool.input || {}
                },
                _synthetic: true,
                _fileIndex: event._fileIndex + 0.1 + (idx * 0.02)
              });

              // Tool result (if matched)
              if (tool.result) {
                expanded.push({
                  type: 'tool.execution_complete',
                  id: `${tool.id}-complete`,
                  timestamp,
                  data: {
                    toolCallId: tool.id,
                    toolName: tool.name,
                    result: tool.result,
                    isError: false
                  },
                  _synthetic: true,
                  _fileIndex: event._fileIndex + 0.15 + (idx * 0.02)
                });
              }
            }
          });
        }

        // Insert assistant.turn_complete
        expanded.push({
          type: 'assistant.turn_complete',
          id: `${assistantId}-complete`,
          timestamp,
          parentId: assistantId,
          data: {
            message: messageText
          },
          _synthetic: true,
          _turnNumber: turnCounter,
          _fileIndex: event._fileIndex + 0.9
        });

        continue;
      }

      // Keep other events as-is
      expanded.push(event);
    }

    return expanded;
  }

  /**
   * Expand VSCode format to timeline format with tool.execution_start/complete events
   * VSCode events already have assistant.message events with data.tools arrays (from _expandVsCodeEvents)
   * This method generates tool.execution_start/complete events for the time-analyze page
   * @private
   * @param {Array} events - VSCode events with assistant.message events containing data.tools
   * @returns {Array} Expanded events with tool execution events
   */
  _expandVsCodeToTimelineFormat(events) {
    const expanded = [];

    for (let i = 0; i < events.length; i++) {
      const event = events[i];

      // Keep the original event
      expanded.push(event);

      // Generate tool.execution_start and tool.execution_complete for assistant.message events with tools
      if (event.type === 'assistant.message' && event.data?.tools && event.data.tools.length > 0) {
        event.data.tools.forEach((tool, idx) => {
          // Skip if tool doesn't have required fields
          if (!tool.id || !tool.name) return;

          const toolStartTime = tool.startTime || event.timestamp;
          const toolEndTime = tool.endTime || event.timestamp;

          // Generate tool.execution_start event
          expanded.push({
            type: 'tool.execution_start',
            id: `${tool.id}-start`,
            timestamp: toolStartTime,
            parentId: event.id,
            data: {
              toolCallId: tool.id,
              toolName: tool.name,
              tool: tool.name, // Alias for compatibility
              arguments: tool.input || {}
            },
            _synthetic: true,
            _fileIndex: event._fileIndex ? event._fileIndex + 0.1 + (idx * 0.02) : undefined
          });

          // Generate tool.execution_complete event
          expanded.push({
            type: 'tool.execution_complete',
            id: `${tool.id}-complete`,
            timestamp: toolEndTime,
            parentId: tool.id,
            data: {
              toolCallId: tool.id,
              toolName: tool.name,
              tool: tool.name, // Alias
              result: tool.result || null,
              error: tool.error || (tool.status === 'error' ? 'Tool execution failed' : null),
              isError: tool.status === 'error'
            },
            _synthetic: true,
            _fileIndex: event._fileIndex ? event._fileIndex + 0.15 + (idx * 0.02) : undefined
          });
        });
      }
    }

    return expanded;
  }

  _getSourceAdapter(source) {
    const registry = this.sessionRepository.registry || require('../adapters').registry;
    return registry?.get ? registry.get(source) : null;
  }
}

module.exports = SessionService;

