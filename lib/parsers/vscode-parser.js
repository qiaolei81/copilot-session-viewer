const BaseSessionParser = require('./base-parser');

/**
 * VSCode Copilot Chat Session Parser
 *
 * Parses chat sessions stored by VS Code's GitHub Copilot Chat extension.
 * Location: ~/Library/Application Support/Code/User/workspaceStorage/<hash>/chatSessions/<uuid>.json
 *
 * Format: A single JSON object with a `requests` array. Each request has
 * a `message` (user input) and a `response` array of typed content items.
 */
class VsCodeParser extends BaseSessionParser {
  /**
   * VSCode sessions are passed as a plain JS object (already parsed JSON),
   * not as an array of events. We detect them by the presence of `requests`.
   * The ParserFactory passes raw events arrays for JSONL sources, so we
   * keep canParse() returning false — VSCode sessions are loaded differently.
   */
  canParse(_events) {
    // VSCode sessions are JSON objects, not event arrays.
    // SessionRepository calls parseVsCode() directly; canParse is unused here.
    return false;
  }

  /**
   * Parse a VSCode chat session JSON object into the normalised format.
   * @param {Object} sessionJson - Parsed JSON from chatSessions/<uuid>.json
   * @returns {Object} Normalised session data
   */
  parseVsCode(sessionJson) {
    const metadata = this._getMetadata(sessionJson);
    const events = this._toEvents(sessionJson);
    return {
      metadata,
      turns: this._extractTurns(events),
      toolCalls: this._extractToolCalls(events),
      allEvents: events,
    };
  }

  // ---- required abstract methods (not used for VsCode path) ----
  parse(_events) { return null; }
  getMetadata(_events) { return null; }
  extractTurns(_events) { return []; }
  extractToolCalls(_events) { return []; }

  // ---- private helpers ----

  _getMetadata(sessionJson) {
    const requests = sessionJson.requests || [];
    const firstReq = requests[0] || {};
    const lastReq = requests[requests.length - 1] || {};

    // Derive workspace label from agent name or fallback
    const agentName = firstReq.agent?.name || firstReq.agent?.id || 'vscode-copilot';

    return {
      sessionId: sessionJson.sessionId,
      startTime: sessionJson.creationDate
        ? new Date(sessionJson.creationDate).toISOString()
        : (firstReq.timestamp ? new Date(firstReq.timestamp).toISOString() : null),
      endTime: sessionJson.lastMessageDate
        ? new Date(sessionJson.lastMessageDate).toISOString()
        : (lastReq.timestamp ? new Date(lastReq.timestamp).toISOString() : null),
      model: firstReq.modelId || null,
      producer: 'vscode-copilot-chat',
      version: firstReq.agent?.extensionVersion || null,
      agentName,
      requestCount: requests.length,
    };
  }

  /**
   * Convert VSCode session JSON into a flat event array that matches the
   * normalised event schema used by the rest of the viewer.
   */
  _toEvents(sessionJson) {
    const events = [];
    const requests = sessionJson.requests || [];

    // session.start synthetic event
    events.push({
      type: 'session.start',
      id: `${sessionJson.sessionId}-start`,
      timestamp: sessionJson.creationDate
        ? new Date(sessionJson.creationDate).toISOString()
        : null,
      data: {
        sessionId: sessionJson.sessionId,
        producer: 'vscode-copilot-chat',
        selectedModel: requests[0]?.modelId || null,
      },
    });

    for (const req of requests) {
      const ts = req.timestamp ? new Date(req.timestamp).toISOString() : null;
      // Use completedAt for assistant events — more accurate than request start time
      const completedAt = req.modelState?.completedAt
        ? new Date(req.modelState.completedAt).toISOString()
        : ts;
      const reqStartMs = ts ? new Date(ts).getTime() : null;
      const reqEndMs = completedAt ? new Date(completedAt).getTime() : reqStartMs;
      const reqDurationMs = (reqStartMs && reqEndMs) ? (reqEndMs - reqStartMs) : 0;

      // Build subAgentInvocationId → agent name map from this request's response items
      const responseItems = req.response || [];
      const subAgentNames = this._buildSubAgentNameMap(responseItems);

      // Count items per subagent (in first-appearance order) for proportional time estimation
      const subAgentItemCounts = new Map(); // sid → count
      const subAgentOrder = []; // ordered unique sids
      for (const item of responseItems) {
        if (!item || typeof item !== 'object') continue;
        const sid = item.subAgentInvocationId;
        if (!sid) continue;
        if (!subAgentItemCounts.has(sid)) { subAgentItemCounts.set(sid, 0); subAgentOrder.push(sid); }
        subAgentItemCounts.set(sid, subAgentItemCounts.get(sid) + 1);
      }
      const totalSubAgentItems = [...subAgentItemCounts.values()].reduce((a, b) => a + b, 0);

      // Compute estimated start/end timestamps per subagent (proportional to item count)
      const subAgentTimestamps = new Map(); // sid → { startTime, endTime }
      if (reqStartMs && totalSubAgentItems > 0) {
        let cursor = reqStartMs;
        for (const sid of subAgentOrder) {
          const fraction = subAgentItemCounts.get(sid) / totalSubAgentItems;
          const duration = Math.round(reqDurationMs * fraction);
          subAgentTimestamps.set(sid, {
            startTime: new Date(cursor).toISOString(),
            endTime: new Date(cursor + duration).toISOString(),
          });
          cursor += duration;
        }
      }

      const seenSubAgents = new Set();

      // user.message
      const userText = this._extractUserText(req.message);
      events.push({
        type: 'user.message',
        id: req.requestId,
        timestamp: ts,
        data: {
          message: userText,
          content: userText,
        },
      });

      // assistant.turn_start
      events.push({
        type: 'assistant.turn_start',
        id: `${req.requestId}-turn`,
        timestamp: ts,
        parentId: req.requestId,
        data: {},
      });

      let assistantText = '';
      let itemIndex = 0;
      let currentSubAgentId = null;

      const flushText = () => {
        const trimmed = assistantText.trim().replace(/^`{3,}$/gm, '').trim();
        assistantText = '';
        if (!trimmed) return;
        const sid = currentSubAgentId;
        const _agentName = sid ? (subAgentNames[sid] || sid.slice(0, 8)) : null;
        events.push({
          type: 'assistant.message',
          id: `${req.requestId}-text-${itemIndex}`,
          timestamp: completedAt,
          parentId: req.requestId,
          data: {
            message: trimmed,
            content: trimmed,
            tools: [],
            subAgentId: null,
            subAgentName: null,
            parentToolCallId: null,
          },
        });
      };

      const emitSubAgentStart = (sid, _itemIdx) => {
        if (!sid || seenSubAgents.has(sid)) return;
        seenSubAgents.add(sid);
        const agentName = subAgentNames[sid] || `subagent-${sid.slice(0, 8)}`;
        const times = subAgentTimestamps.get(sid);
        const startTs = times?.startTime || completedAt;
        events.push({
          type: 'subagent.started',
          id: `${req.requestId}-subagent-${sid}`,
          timestamp: startTs,
          parentId: req.requestId,
          data: {
            subAgentId: sid,
            subAgentName: agentName,
            agentName: agentName,
            agentDisplayName: agentName,
            toolCallId: sid,
            badgeLabel: agentName,
            badgeClass: 'badge-subagent',
          },
        });
      };

      for (const item of responseItems) {
        itemIndex++;
        switch (item.kind) {
          case 'thinking': {
            const text = item.content?.value || item.content || '';
            if (text) assistantText += text + '\n';
            break;
          }

          case 'markdownContent': {
            const text = item.content?.value || item.content || '';
            if (text) assistantText += text + '\n';
            break;
          }

          case undefined:
          case null: {
            // Plain markdown text item (no kind field, has 'value')
            const text = item.value || '';
            if (text) assistantText += text + '\n';
            break;
          }

          case 'toolInvocationSerialized': {
            flushText();
            // Emit subagent.start on first appearance of this subagent
            const sid = item.subAgentInvocationId;
            emitSubAgentStart(sid, itemIndex);
            if (sid) currentSubAgentId = sid;
            const tool = this._normalizeTool(item);
            if (tool) {
              const agentName = sid ? (subAgentNames[sid] || sid.slice(0, 8)) : null;
              events.push({
                type: 'tool.invocation',
                id: tool.id || `${req.requestId}-tool-${itemIndex}`,
                timestamp: completedAt,
                parentId: req.requestId,
                data: {
                  tool,
                  subAgentId: sid || null,
                  subAgentName: agentName,
                  parentToolCallId: sid || null,
                  badgeLabel: tool.name,
                  badgeClass: tool.status === 'error' ? 'badge-error' : 'badge-tool',
                },
              });
            }
            break;
          }

          case 'textEditGroup': {
            flushText();
            const edits = item.edits || item.uri ? [item] : [];
            events.push({
              type: 'tool.invocation',
              id: `${req.requestId}-edit-${itemIndex}`,
              timestamp: completedAt,
              parentId: req.requestId,
              data: {
                tool: {
                  type: 'tool_use',
                  id: `${req.requestId}-edit-${itemIndex}`,
                  name: 'textEdit',
                  startTime: ts,
                  endTime: ts,
                  status: 'completed',
                  input: { uri: item.uri, edits },
                  result: 'file edit',
                  error: null,
                },
                badgeLabel: 'textEdit',
                badgeClass: 'badge-tool',
              },
            });
            break;
          }

          case 'prepareToolInvocation':
          case 'inlineReference':
          case 'undoStop':
          case 'codeblockUri':
          case 'mcpServersStarting':
            // Skip non-visible items
            break;

          default:
            break;
        }
      }

      flushText(); // flush any trailing text

      // Emit subagent.completed events (proportional estimated endTime) after all items
      for (const sid of seenSubAgents) {
        const agentName = subAgentNames[sid] || `subagent-${sid.slice(0, 8)}`;
        const times = subAgentTimestamps.get(sid);
        const endTs = times?.endTime || completedAt;
        events.push({
          type: 'subagent.completed',
          id: `${req.requestId}-subagent-${sid}-end`,
          timestamp: endTs,
          parentId: req.requestId,
          data: {
            toolCallId: sid,
            agentDisplayName: agentName,
            agentName: agentName,
          },
        });
      }
    }

    return events;
  }

  /**
   * Extract agent name from the first toolInvocationSerialized item for a given subAgentInvocationId.
   * Looks for .agent.md filename in invocationMessage or resultDetails URIs.
   */
  _buildSubAgentNameMap(items) {
    const nameMap = {};
    for (const item of items) {
      if (!item || typeof item !== 'object') continue;
      const sid = item.subAgentInvocationId;
      if (!sid || nameMap[sid]) continue;
      if (item.kind !== 'toolInvocationSerialized') continue;

      // Try invocationMessage text for agent file path
      const msgObj = item.invocationMessage;
      const msg = (msgObj && typeof msgObj === 'object') ? (msgObj.value || '') : '';
      let m = msg.match(/agents\/([^/\]]+?)\.agent\.md/);
      if (m) { nameMap[sid] = m[1]; continue; }

      // Try resultDetails
      for (const rd of (item.resultDetails || [])) {
        if (typeof rd !== 'object') continue;
        const fp = rd.fsPath || rd.path || '';
        m = fp.match(/agents\/([^/]+?)\.agent\.md/);
        if (m) { nameMap[sid] = m[1]; break; }
      }
    }
    return nameMap;
  }

  _extractUserText(message) {
    if (!message) return '';
    if (typeof message.text === 'string') return message.text;
    // parts[] may contain text fragments
    if (Array.isArray(message.parts)) {
      return message.parts
        .filter(p => p.kind === 'text')
        .map(p => p.text || '')
        .join('');
    }
    return '';
  }

  _normalizeTool(item) {
    if (!item.toolCallId) return null;

    // toolSpecificData may hold input/output depending on tool type
    const tsd = item.toolSpecificData || {};
    const input = tsd.input || tsd.parameters || tsd.request || {};
    const result = tsd.output || tsd.result || item.resultDetails || null;
    const isError = item.isConfirmed === false;

    return {
      type: 'tool_use',
      id: item.toolCallId,
      name: item.toolId || 'unknown',
      startTime: null,
      endTime: null,
      status: isError ? 'error' : (item.isComplete ? 'completed' : 'pending'),
      input,
      result: typeof result === 'string' ? result : JSON.stringify(result),
      error: isError ? (item.resultDetails || 'Tool invocation not confirmed') : null,
    };
  }

  _extractTurns(events) {
    const turns = [];
    let current = null;

    for (const event of events) {
      if (event.type === 'user.message') {
        if (current) turns.push(current);
        current = { userMessage: event, assistantMessages: [], toolCalls: [] };
      } else if (current) {
        if (event.type === 'assistant.message') {
          current.assistantMessages.push(event);
        } else if (event.type === 'tool.invocation') {
          current.toolCalls.push(event.data?.tool);
        }
      }
    }
    if (current) turns.push(current);
    return turns;
  }

  _extractToolCalls(events) {
    return events
      .filter(e => e.type === 'tool.invocation' && e.data?.tool)
      .map(e => e.data.tool);
  }
}

module.exports = VsCodeParser;
