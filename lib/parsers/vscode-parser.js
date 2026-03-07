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
   * VSCode sessions can be either:
   * 1. Old format: Plain JSON object with `requests` array
   * 2. New format: JSONL with ObjectMutationLog entries (kind: 0|1|2|3)
   *
   * For JSONL format, the first line has kind=0 with v.sessionId
   */
  canParse(lines) {
    if (!Array.isArray(lines) || lines.length === 0) return false;

    // Check if this is JSONL format (array of parsed lines)
    const firstLine = lines[0];

    // New JSONL format: first line has kind=0 and v.sessionId
    if (firstLine && typeof firstLine === 'object' &&
        firstLine.kind === 0 &&
        firstLine.v &&
        firstLine.v.sessionId) {
      return true;
    }

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

  /**
   * Parse JSONL format (ObjectMutationLog) - new VS Code format
   * @param {Array} lines - Array of parsed JSON objects from JSONL file
   * @returns {Object} Normalised session data
   */
  parseJsonl(lines) {
    // Replay mutations to reconstruct the session state
    const sessionState = this.replayMutations(lines);

    // Use existing methods to convert to events
    const metadata = this._getMetadata(sessionState);
    const events = this._toEvents(sessionState);

    return {
      metadata,
      turns: this._extractTurns(events),
      toolCalls: this._extractToolCalls(events),
      allEvents: events,
    };
  }

  /**
   * Replay ObjectMutationLog entries to reconstruct session state
   * @param {Array} lines - Array of mutation entries { kind, k, v, i }
   * @returns {Object} Reconstructed session state
   */
  replayMutations(lines) {
    let state = null;

    for (const entry of lines) {
      if (!entry || typeof entry !== 'object') continue;

      const { kind, k, v, i } = entry;

      switch (kind) {
        case 0: // Initial - set entire state
          state = v;
          break;

        case 1: // Set - update property at path
          if (k && Array.isArray(k)) {
            this._applySet(state, k, v);
          }
          break;

        case 2: // Push - append to array (with optional truncate)
          if (k && Array.isArray(k)) {
            this._applyPush(state, k, v, i);
          }
          break;

        case 3: // Delete - remove property at path
          if (k && Array.isArray(k)) {
            this._applyDelete(state, k);
          }
          break;

        default:
          console.warn(`[VsCodeParser] Unknown mutation kind: ${kind}`);
      }
    }

    return state;
  }

  /**
   * Apply Set mutation: set value at path k in state
   * @private
   */
  _applySet(state, path, value) {
    if (!state || path.length === 0) return;

    let current = state;
    for (let i = 0; i < path.length - 1; i++) {
      const key = path[i];
      if (!current[key]) {
        // Create intermediate object or array based on next key type
        current[key] = typeof path[i + 1] === 'number' ? [] : {};
      }
      current = current[key];
    }

    const lastKey = path[path.length - 1];
    current[lastKey] = value;
  }

  /**
   * Apply Push mutation: append items to array at path k
   * If i is set, truncate array to index i first
   * @private
   */
  _applyPush(state, path, values, startIndex) {
    if (!state || path.length === 0) return;

    let current = state;
    for (let i = 0; i < path.length - 1; i++) {
      const key = path[i];
      if (!current[key]) {
        current[key] = typeof path[i + 1] === 'number' ? [] : {};
      }
      current = current[key];
    }

    const lastKey = path[path.length - 1];
    if (!current[lastKey]) {
      current[lastKey] = [];
    }

    const arr = current[lastKey];
    if (!Array.isArray(arr)) {
      console.warn(`[VsCodeParser] Push target is not an array: ${path.join('.')}`);
      return;
    }

    // Truncate if startIndex is specified
    if (startIndex !== undefined && startIndex !== null) {
      arr.length = startIndex;
    }

    // Append new values
    if (values && Array.isArray(values) && values.length > 0) {
      arr.push(...values);
    }
  }

  /**
   * Apply Delete mutation: remove property at path k
   * @private
   */
  _applyDelete(state, path) {
    if (!state || path.length === 0) return;

    let current = state;
    for (let i = 0; i < path.length - 1; i++) {
      const key = path[i];
      if (!current[key]) return; // Path doesn't exist
      current = current[key];
    }

    const lastKey = path[path.length - 1];
    delete current[lastKey];
  }

  // ---- required abstract methods (for ParserFactory interface) ----
  parse(events) {
    // For JSONL format, use parseJsonl
    if (Array.isArray(events) && events.length > 0 && this.canParse(events)) {
      return this.parseJsonl(events);
    }
    return null;
  }

  getMetadata(events) {
    const parsed = this.parse(events);
    return parsed ? parsed.metadata : null;
  }

  extractTurns(events) {
    const parsed = this.parse(events);
    return parsed ? parsed.turns : [];
  }

  extractToolCalls(events) {
    const parsed = this.parse(events);
    return parsed ? parsed.toolCalls : [];
  }

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


      // Build subAgentInvocationId → agent name map from this request's response items
      const responseItems = Array.isArray(req.response) ? req.response : [];
      const subAgentNames = this._buildSubAgentNameMap(responseItems);

      // Note: VS Code JSONL does not record per-subagent timestamps.
      // All subagents in a request span the same wall-clock window (they run in parallel).
      // Use request start as START and request completedAt as COMPLETE for all subagents,
      // which is accurate for parallel dispatch and avoids interleaved/crossed timelines.

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
        const agentName = sid ? (subAgentNames[sid] || sid.slice(0, 8)) : null;
        events.push({
          type: 'assistant.message',
          id: `${req.requestId}-text-${itemIndex}`,
          timestamp: completedAt,
          parentId: req.requestId,
          data: {
            message: trimmed,
            content: trimmed,
            tools: [],
            subAgentId: sid || null,
            subAgentName: agentName,
            parentToolCallId: null,
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
            if (text) assistantText += text;
            break;
          }

          case 'inlineReference': {
            // File/folder reference inline in markdown — append name as code reference
            const name = item.name || '';
            if (name) assistantText += '`' + name + '`';
            break;
          }

          case 'toolInvocationSerialized': {
            flushText();
            // runSubagent items: toolId='runSubagent', toolCallId=subagent-id, subAgentInvocationId=null
            // Regular tool items: toolId=e.g. 'copilot_readFile', subAgentInvocationId=owning-subagent-id
            const sid = item.toolId === 'runSubagent'
              ? item.toolCallId   // the subagent being launched
              : item.subAgentInvocationId; // the subagent that launched this tool
            if (item.toolId === 'runSubagent') {
              // Mark current context as this subagent (for subsequent tool items)
              currentSubAgentId = sid;
            }
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
    }

    return events;
  }

  /**
   * Build a map of subagent id → agent name from runSubagent tool invocations.
   * runSubagent items: toolId='runSubagent', toolCallId=subagent-id
   * Agent name is extracted from invocationMessage or resultDetails.
   */
  _buildSubAgentNameMap(items) {
    const nameMap = {};
    for (const item of items) {
      if (!item || typeof item !== 'object') continue;
      if (item.kind !== 'toolInvocationSerialized') continue;
      if (item.toolId !== 'runSubagent') continue;

      const sid = item.toolCallId;
      if (!sid || nameMap[sid]) continue;

      // Prefer agentName from toolSpecificData (e.g. "FoundationAgent")
      const agentName = item.toolSpecificData?.agentName;
      if (agentName) { nameMap[sid] = agentName; continue; }

      // Fallback: Use invocationMessage as agent display name
      const msgObj = item.invocationMessage;
      const msg = typeof msgObj === 'string' ? msgObj
        : (msgObj && typeof msgObj === 'object') ? (msgObj.value || '') : '';
      if (msg) { nameMap[sid] = msg; continue; }

      // Fallback: try agent file path in message
      let m = msg.match(/agents\/([^/\]]+?)\.agent\.md/);
      if (m) { nameMap[sid] = m[1]; continue; }

      // Try resultDetails
      const resultDetails = item.resultDetails;
      const rdList = Array.isArray(resultDetails) ? resultDetails : (resultDetails ? [resultDetails] : []);
      for (const rd of rdList) {
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
    let input = tsd.input || tsd.parameters || tsd.request || {};
    let result = tsd.output || tsd.result || null;
    const isError = item.isConfirmed === false;

    // vscode tools don't serialize input/result into toolSpecificData.
    // Use invocationMessage as a human-readable description of what the tool did,
    // and generatedTitle / resultDetails as the result summary.
    if (!result && (item.generatedTitle || item.resultDetails)) {
      // resultDetails is an array of URIs (e.g. files found/read)
      if (item.resultDetails) {
        const rdList = Array.isArray(item.resultDetails) ? item.resultDetails : [item.resultDetails];
        const paths = rdList.map(rd => rd.fsPath || rd.path || rd.external || JSON.stringify(rd)).filter(Boolean);
        result = paths.length > 0 ? paths.join('\n') : item.generatedTitle || null;
      } else {
        result = item.generatedTitle || null;
      }
    }
    // Use invocationMessage (plain text) as input description if input is empty
    if (Object.keys(input).length === 0 && item.invocationMessage) {
      const msg = item.invocationMessage;
      const msgText = typeof msg === 'string' ? msg
        : (msg && typeof msg === 'object') ? (msg.value || '') : '';
      if (msgText) input = { description: msgText };
    }

    // Simplify URI objects: replace {$mid, fsPath, external, path, scheme} with just the filename
    const simplifyUri = (uri) => {
      if (!uri || typeof uri !== 'object') return uri;
      const p = uri.fsPath || uri.path || uri.external || '';
      return p ? p.replace(/.*\//, '') : JSON.stringify(uri);
    };
    const simplifyInput = (obj) => {
      if (!obj || typeof obj !== 'object') return obj;
      const out = {};
      for (const [k, v] of Object.entries(obj)) {
        if (k === '$mid' || k === 'external' || k === 'scheme') continue; // skip internal URI fields
        if (k === 'fsPath' || k === 'path') { out['file'] = v.replace(/.*\//, ''); continue; }
        if (v && typeof v === 'object' && ('fsPath' in v || '$mid' in v)) {
          out[k] = simplifyUri(v);
        } else if (Array.isArray(v) && k === 'edits') {
          out['edits'] = `${v.length} edit(s)`;
        } else {
          out[k] = v;
        }
      }
      return out;
    };
    if (input && typeof input === 'object' && !input.description) {
      input = simplifyInput(input);
    }

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
