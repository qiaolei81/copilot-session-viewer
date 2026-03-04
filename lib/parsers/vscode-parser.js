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
  canParse(events) {
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

      // Flatten response items
      const responseItems = req.response || [];
      let assistantText = '';
      let itemIndex = 0;

      const flushText = () => {
        const trimmed = assistantText.trim().replace(/^`{3,}$/gm, '').trim();
        assistantText = '';
        if (!trimmed) return;
        events.push({
          type: 'assistant.message',
          id: `${req.requestId}-text-${itemIndex}`,
          timestamp: ts,
          parentId: req.requestId,
          data: {
            message: trimmed,
            content: trimmed,
            tools: [],
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
            const tool = this._normalizeTool(item);
            if (tool) {
              events.push({
                type: 'tool.invocation',
                id: tool.id || `${req.requestId}-tool-${itemIndex}`,
                timestamp: ts,
                parentId: req.requestId,
                data: {
                  tool,
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
              timestamp: ts,
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
                  result: `file edit`,
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
