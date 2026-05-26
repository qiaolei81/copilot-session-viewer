/**
 * Tool helpers composable — status, errors, duration, commands, grouping.
 */

export function useToolHelpers() {
  const getToolStatus = (group) => {
    if (!group.complete) return { icon: '⏳', color: 'text-warning', text: '' };
    const completeData = group.complete.data || {};
    if (completeData.error || completeData.isError) return { icon: '❌', color: 'text-danger', text: '' };
    return { icon: '✓', color: 'text-success-emphasis', text: '' };
  };

  const getToolErrorMessage = (group) => {
    if (!group.complete?.data?.error) return '';
    const error = group.complete.data.error;
    if (typeof error === 'object' && error.message) return error.message;
    if (typeof error === 'string') {
      try { const parsed = JSON.parse(error); if (parsed.message) return parsed.message; } catch (_e) { /* noop */ }
      return error;
    }
    return String(error);
  };

  const getToolDuration = (group) => {
    if (!group.complete) return '';
    const durationMs = new Date(group.complete.timestamp).getTime() - new Date(group.start.timestamp).getTime();
    if (durationMs >= 100) return `${parseFloat((durationMs / 1000).toPrecision(3))}s`;
    return '';
  };

  const getToolCommand = (group) => {
    if (!group.start) return '';
    const args = group.start.data?.arguments || {};
    const toolName = group.start.data?.toolName || group.tool || '';
    let command;
    if (toolName === 'bash' || toolName === 'exec') command = args.command || args.description || '';
    else if (toolName === 'ask_user') command = args.question || args.message || '';
    else if (toolName === 'read' || toolName === 'write' || toolName === 'edit') command = args.file_path || args.path || '';
    else if (toolName === 'view') command = args.path || args.file || '';
    else if (toolName === 'create') command = args.path || args.name || '';
    else if (toolName === 'report_intent') command = args.intent || args.message || '';
    else if (toolName === 'web_search') command = args.query || '';
    else if (toolName === 'web_fetch') command = args.url || '';
    else if (toolName === 'browser') {
      const action = args.action || '';
      const url = args.targetUrl || args.url || '';
      command = url ? `${action} ${url}` : action;
    } else {
      command = args.description || args.command || args.message || args.path || args.file_path || args.query || '';
    }
    if (command && command.length > 200) command = command.substring(0, 200) + '...';
    return command;
  };

  const hasTools = (event) => event.data?.tools && event.data.tools.length > 0;

  const getToolGroups = (event) => {
    if (event.data?.tools && Array.isArray(event.data.tools)) {
      return event.data.tools
        .filter(tool => tool && typeof tool === 'object' && tool.name)
        .map(tool => {
          const hasResult = tool.result !== undefined || tool.status === 'completed' || tool.status === 'error';
          const timingResult = {};
          if (tool.startTime) timingResult.startTime = tool.startTime;
          if (tool.endTime) timingResult.endTime = tool.endTime;
          if (timingResult.startTime && timingResult.endTime) {
            const durationMs = new Date(timingResult.endTime).getTime() - new Date(timingResult.startTime).getTime();
            if (durationMs >= 0) timingResult.duration = `${parseFloat((durationMs / 1000).toPrecision(3))}s (${durationMs}ms)`;
          }
          return {
            tool: tool.name,
            timing: timingResult,
            start: { timestamp: tool.startTime, data: { toolName: tool.name, arguments: tool.input || tool.arguments || {} } },
            complete: hasResult ? { timestamp: tool.endTime, data: { result: tool.result, error: tool.status === 'error' ? tool.error : null } } : null
          };
        });
    }
    return [];
  };

  return {
    getToolStatus,
    getToolErrorMessage,
    getToolDuration,
    getToolCommand,
    hasTools,
    getToolGroups
  };
}
