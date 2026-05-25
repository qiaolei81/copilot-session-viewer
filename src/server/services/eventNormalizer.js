/**
 * EventNormalizer - Unified Event Format Transformer
 *
 * Converts tool events from different AI session formats (Copilot, Claude, Pi-Mono)
 * into a single, consistent schema for frontend consumption.
 *
 * Key transformations:
 * - Normalizes tool call structure to UnifiedToolCall schema
 * - Computes consistent status fields ('pending' | 'running' | 'completed' | 'error')
 * - Adds timing metadata (startTime, endTime, duration)
 * - Handles edge cases (orphaned events, missing fields)
 *
 * Usage:
 *   const normalizer = new EventNormalizer();
 *   const normalizedEvents = normalizer.normalizeEvents(rawEvents, 'copilot');
 */

class EventNormalizer {
  /**
   * Normalize all events to unified format
   * @param {Array} events - Raw events from parsers (after matching)
   * @param {string} _source - 'copilot' | 'claude' | 'pi-mono'
   * @returns {Array} - Normalized events
   */
  normalizeEvents(events, _source) {
    if (!Array.isArray(events)) {
      console.warn('[EventNormalizer] normalizeEvents: events is not an array', typeof events);
      return [];
    }

    return events
      .filter(event => {
        // Filter out Claude tool_result wrappers (marked by sessionService._matchClaudeToolResults)
        if (event._isToolResultWrapper) {
          return false;
        }
        return true;
      })
      .map(event => this.normalizeEvent(event, _source));
  }

  /**
   * Normalize a single event
   * @param {Object} event - Raw event
   * @param {string} source - Source format
   * @returns {Object} - Normalized event
   */
  normalizeEvent(event, source) {
    if (!event || typeof event !== 'object') {
      console.warn('[EventNormalizer] normalizeEvent: invalid event', event);
      return event;
    }

    // Handle assistant messages with tools
    if (this._isAssistantMessage(event)) {
      return this._normalizeAssistantMessage(event, source);
    }

    // Handle timeline events (tool.execution_start/complete, subagent events)
    if (this._isTimelineEvent(event)) {
      return this._normalizeTimelineEvent(event, source);
    }

    // Pass through other events unchanged
    return event;
  }

  /**
   * Check if event is an assistant message with tools (needs normalization)
   * @private
   */
  _isAssistantMessage(event) {
    // Check if event has tools array (works for all sources)
    if (event.data?.tools && Array.isArray(event.data.tools) && event.data.tools.length > 0) {
      return true;
    }
    // Fallback: check specific types (Copilot/Claude legacy)
    return event.type === 'assistant.message' || event.type === 'assistant' || event.type === 'user.message' || event.type === 'user';
  }

  /**
   * Check if event is a timeline event (tool/subagent events)
   * @private
   */
  _isTimelineEvent(event) {
    return event.type?.startsWith('tool.') || event.type?.startsWith('subagent.');
  }

  /**
   * Normalize assistant message with embedded tools
   * @private
   */
  _normalizeAssistantMessage(event, source) {
    const normalized = { ...event };

    // Normalize tools array if present
    if (event.data?.tools && Array.isArray(event.data.tools)) {
      normalized.data = {
        ...event.data,
        tools: event.data.tools
          .filter(tool => tool.type !== 'tool_result')  // Filter out orphan tool_result
          .map(tool => this._normalizeToolCall(tool, source, event.timestamp))
      };
    }

    return normalized;
  }

  /**
   * Normalize a tool call to unified schema
   *
   * UnifiedToolCall schema:
   * {
   *   id: string,
   *   name: string,
   *   startTime: string (ISO 8601),
   *   endTime: string | null,
   *   status: 'pending' | 'running' | 'completed' | 'error',
   *   input: Record<string, any>,
   *   result: string | null,
   *   error: string | null,
   *   metadata: {
   *     source: string,
   *     duration?: number,
   *     ...
   *   }
   * }
   *
   * @private
   */
  _normalizeToolCall(tool, source, messageTimestamp) {
    // Handle Copilot/Claude format with _matched flag
    if (tool.type === 'tool_use') {
      const status = this._computeStatus(tool);
      const startTime = tool._startTime || messageTimestamp;
      const endTime = tool._matched ? (tool._endTime || messageTimestamp) : null;

      return {
        type: 'tool_use',  // Preserve type for frontend compatibility
        id: tool.id,
        name: tool.name,
        startTime,
        endTime,
        status,
        input: tool.input || {},
        result: tool.result || null,
        error: tool.error || null,
        metadata: {
          source,
          matched: tool._matched,
          duration: this._computeDuration(startTime, endTime)
        }
      };
    }

    // Handle Pi-Mono format (already has status)
    if (tool.name && tool.status) {
      const startTime = messageTimestamp;
      // Normalize 'success' to 'completed' for backward compatibility
      const normalizedStatus = tool.status === 'success' ? 'completed' : tool.status;
      const endTime = normalizedStatus === 'completed' || normalizedStatus === 'error'
        ? messageTimestamp
        : null;

      return {
        id: tool.id || this._generateToolId(),
        name: tool.name,
        startTime,
        endTime,
        status: normalizedStatus,
        input: tool.input || {},
        result: tool.isError ? null : (tool.result || null),
        error: tool.isError ? tool.result : null,
        metadata: {
          source,
          duration: this._computeDuration(startTime, endTime)
        }
      };
    }

    // Fallback: minimal normalization for unknown formats
    console.warn('[EventNormalizer] Unknown tool format, applying fallback normalization', tool);
    return {
      id: tool.id || this._generateToolId(),
      name: tool.name || 'unknown',
      startTime: messageTimestamp,
      endTime: null,
      status: 'running',
      input: tool.input || {},
      result: null,
      error: null,
      metadata: {
        source,
        fallback: true
      }
    };
  }

  /**
   * Compute tool status from tool object
   * @private
   */
  _computeStatus(tool) {
    // Explicit error indication
    if (tool.error) {
      return 'error';
    }

    // Has result = completed (regardless of _matched flag)
    if (tool.result !== undefined && tool.result !== null && tool.result !== '') {
      return 'completed';
    }

    // Explicitly unmatched with no result
    if (tool._matched === false) {
      return 'running';
    }

    // Matched = completed
    if (tool._matched) {
      return 'completed';
    }

    // No match info: assume running
    return 'running';
  }

  /**
   * Compute duration in milliseconds from start/end timestamps
   * @private
   */
  _computeDuration(startTime, endTime) {
    if (!startTime || !endTime) {
      return undefined;
    }

    try {
      const start = new Date(startTime);
      const end = new Date(endTime);

      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        return undefined;
      }

      const duration = end.getTime() - start.getTime();
      return duration >= 0 ? duration : undefined;
    } catch (err) {
      return undefined;
    }
  }

  /**
   * Generate a unique tool ID
   * @private
   */
  _generateToolId() {
    return `tool-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Normalize timeline events (tool.execution_start/complete, subagent events)
   * Ensures consistent schema for these events
   * @private
   */
  _normalizeTimelineEvent(event) {
    // For tool.execution_start/complete, ensure consistent schema
    if (event.type === 'tool.execution_start' || event.type === 'tool.execution_complete') {
      return {
        ...event,
        data: {
          ...event.data,
          // Normalize field names for consistency
          toolCallId: event.data?.toolCallId || event.data?.id,
          toolName: event.data?.toolName || event.data?.tool || event.data?.name,
          // Preserve original fields
          ...event.data
        }
      };
    }

    // Subagent events: pass through (already have consistent schema)
    if (event.type?.startsWith('subagent.')) {
      return event;
    }

    // Unknown timeline event: pass through
    return event;
  }
}

module.exports = EventNormalizer;
