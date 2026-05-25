import { ref } from 'vue';
import { formatDuration } from './useFormatters.js';

function normalizeMessage(msg) {
  if (!msg) return '';
  if (typeof msg === 'string') return msg;
  if (Array.isArray(msg)) return msg.map(c => c.text || c.content || '').join(' ');
  if (typeof msg === 'object' && msg.text) return msg.text;
  return String(msg);
}

export function useMermaidExport(sessionId, unifiedTimelineItems) {
  const copyLabel = ref('📊 Copy as Mermaid Gantt');

  const copyTimelineMarkdown = async () => {
    const items = unifiedTimelineItems.value;
    if (!items.length) return;

    const toEpochMs = (ts) => ts ? new Date(ts).getTime() : 0;
    const sanitize = (str) => (str || '').replace(/[`\n\r]/g, '').replace(/[:;#]/g, '-').replace(/\s+/g, ' ').trim().substring(0, 100);

    const usedIds = {};
    const uniqueId = (base) => {
      const clean = base.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 30);
      if (!usedIds[clean]) { usedIds[clean] = 1; return clean; }
      usedIds[clean]++;
      return clean + '_' + usedIds[clean];
    };

    const lines = ['```mermaid', 'gantt',
      '    title Session Timeline – ' + sanitize(sessionId.value),
      '    dateFormat x', '    axisFormat %H:%M:%S', ''];

    for (const item of items) {
      if (item.rowType === 'user-req') {
        const msg = sanitize(normalizeMessage(item.message) || 'No message').substring(0, 40);
        const label = 'UserReq ' + item.userReqNumber + ' – ' + msg + ' (' + formatDuration(item.duration) + ')';
        const id = uniqueId('userreq_' + item.userReqNumber);
        lines.push('    ' + label + '    :milestone, ' + id + ', ' + toEpochMs(item.startTime) + ', ' + toEpochMs(item.endTime));
      } else if (item.rowType === 'subagent') {
        const toolInfo = (item.toolCalls ?? 0) + ' tools';
        const label = sanitize(item.name) + ' – ' + formatDuration(item.duration) + ' (' + toolInfo + ')';
        const id = uniqueId(item.name);
        const tag = item.status === 'failed' ? 'crit, ' : item.status === 'incomplete' ? 'active, ' : '';
        lines.push('    ' + label + '    :' + tag + id + ', ' + toEpochMs(item.startTime) + ', ' + toEpochMs(item.endTime));
      } else if (item.rowType === 'main-agent') {
        const detail = sanitize(item.summary || 'idle');
        const label = 'Main Agent – ' + formatDuration(item.duration) + ' (' + detail + ')';
        const id = uniqueId('main_agent');
        lines.push('    ' + label + '    :' + id + ', ' + toEpochMs(item.startTime) + ', ' + toEpochMs(item.endTime));
      }
    }

    lines.push('```', '');
    const md = lines.join('\n');

    try {
      await navigator.clipboard.writeText(md);
      copyLabel.value = '✅ Copied!';
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = md;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      copyLabel.value = '✅ Copied!';
    }
    setTimeout(() => { copyLabel.value = '📊 Copy as Mermaid Gantt'; }, 2000);
  };

  return { copyLabel, copyTimelineMarkdown };
}
