import { ref } from 'vue';

export const BADGE_CLASSES = {
  'badge-subagent': 'bg-[#8957e5] text-white',
  'badge-tool': 'bg-[#9e6a03] text-white',
  'badge-turn': 'bg-success-emphasis text-white',
  'badge-read': 'bg-accent-subtle text-accent border border-[rgba(88,166,255,0.3)]',
  'badge-write': 'bg-[rgba(63,185,80,0.15)] text-success border border-[rgba(63,185,80,0.3)]',
  'badge-edit': 'bg-warning-subtle text-warning border border-[rgba(210,153,34,0.3)]',
  'badge-create': 'bg-[rgba(63,185,80,0.15)] text-success border border-[rgba(63,185,80,0.3)]',
  'badge-bash': 'bg-[rgba(139,148,158,0.15)] text-text-muted border border-[rgba(139,148,158,0.3)]',
  'badge-search': 'bg-[rgba(191,57,137,0.15)] text-[#f778ba] border border-[rgba(191,57,137,0.3)]',
  'badge-other': 'bg-[rgba(110,118,129,0.15)] text-text-muted border border-[rgba(110,118,129,0.3)]',
};
export const BADGE_BASE = 'inline-block px-2 py-0.5 rounded-badge text-2xs font-semibold whitespace-nowrap';

export function useGanttInteraction(sessionStart, totalDuration, sessionId, unifiedTimelineItems, normalizeMessage, formatDuration) {
  const ganttCrosshairX = ref(null);
  const ganttCrosshairTime = ref('');
  const copyLabel = ref('📊 Copy as Mermaid Gantt');

  const getToolBadgeClass = (toolName) => {
    const lower = (toolName || '').toLowerCase();
    let key;
    if (['bash', 'exec'].includes(lower)) key = 'badge-bash';
    else if (lower === 'read') key = 'badge-read';
    else if (lower === 'write' || lower === 'notebookedit') key = 'badge-write';
    else if (lower === 'edit') key = 'badge-edit';
    else if (lower === 'glob' || lower === 'grep') key = 'badge-search';
    else if (lower === 'task') key = 'badge-subagent';
    else key = 'badge-other';
    return BADGE_BASE + ' ' + BADGE_CLASSES[key];
  };

  const getOpBadgeClass = (opType) => {
    const keys = {
      read: 'badge-read',
      write: 'badge-write',
      edit: 'badge-edit',
      create: 'badge-create',
      search: 'badge-search'
    };
    const key = keys[opType] || 'badge-other';
    return BADGE_BASE + ' ' + BADGE_CLASSES[key];
  };

  const onGanttMouseMove = (e) => {
    const container = e.currentTarget;
    const barArea = container.querySelector('.gantt-bar-area');
    if (!barArea) return;
    const barRect = barArea.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    const barLeft = barRect.left - containerRect.left;
    const barRight = barLeft + barRect.width;
    const mouseX = e.clientX - containerRect.left;

    if (mouseX >= barLeft && mouseX <= barRight) {
      ganttCrosshairX.value = mouseX;
      const pct = (mouseX - barLeft) / barRect.width;
      const ts = sessionStart.value + pct * totalDuration.value;
      const d = new Date(ts);
      const h = String(d.getHours()).padStart(2, '0');
      const m = String(d.getMinutes()).padStart(2, '0');
      const s = String(d.getSeconds()).padStart(2, '0');
      ganttCrosshairTime.value = h + ':' + m + ':' + s;
    } else {
      ganttCrosshairX.value = null;
    }
  };

  const onGanttMouseLeave = () => {
    ganttCrosshairX.value = null;
  };

  const copyTimelineMarkdown = async () => {
    const items = unifiedTimelineItems.value;
    if (!items.length) return;

    const toEpochMs = (ts) => {
      if (!ts) return 0;
      return new Date(ts).getTime();
    };

    const sanitize = (str) => (str || '').replace(/[`\n\r]/g, '').replace(/[:;#]/g, '-').replace(/\s+/g, ' ').trim().substring(0, 100);

    const usedIds = {};
    const uniqueId = (base) => {
      const clean = base.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 30);
      if (!usedIds[clean]) { usedIds[clean] = 1; return clean; }
      usedIds[clean]++;
      return clean + '_' + usedIds[clean];
    };

    const lines = [];
    lines.push('```mermaid');
    lines.push('gantt');
    lines.push('    title Session Timeline – ' + sanitize(sessionId.value));
    lines.push('    dateFormat x');
    lines.push('    axisFormat %H:%M:%S');
    lines.push('');

    for (const item of items) {
      if (item.rowType === 'user-req') {
        const msg = sanitize(normalizeMessage(item.message) || 'No message').substring(0, 40);
        const label = 'UserReq ' + item.userReqNumber + ' – ' + msg + ' (' + formatDuration(item.duration) + ')';
        const id = uniqueId('userreq_' + item.userReqNumber);
        const start = toEpochMs(item.startTime);
        const end = toEpochMs(item.endTime);
        lines.push('    ' + label + '    :milestone, ' + id + ', ' + start + ', ' + end);
      } else if (item.rowType === 'subagent') {
        const start = toEpochMs(item.startTime);
        const end = toEpochMs(item.endTime);
        const toolInfo = (item.toolCalls ?? 0) + ' tools';
        const label = sanitize(item.name) + ' – ' + formatDuration(item.duration) + ' (' + toolInfo + ')';
        const id = uniqueId(item.name);
        const tag = item.status === 'failed' ? 'crit, '
          : item.status === 'incomplete' ? 'active, ' : '';
        lines.push('    ' + label + '    :' + tag + id + ', ' + start + ', ' + end);
      } else if (item.rowType === 'main-agent') {
        const start = toEpochMs(item.startTime);
        const end = toEpochMs(item.endTime);
        const detail = sanitize(item.summary || 'idle');
        const label = 'Main Agent – ' + formatDuration(item.duration) + ' (' + detail + ')';
        const id = uniqueId('main_agent');
        lines.push('    ' + label + '    :' + id + ', ' + start + ', ' + end);
      }
    }

    lines.push('```');
    lines.push('');

    const md = lines.join('\n');

    try {
      await navigator.clipboard.writeText(md);
      copyLabel.value = '✅ Copied!';
    } catch (_err) {
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

  return {
    ganttCrosshairX, ganttCrosshairTime,
    onGanttMouseMove, onGanttMouseLeave,
    copyLabel, copyTimelineMarkdown,
    getToolBadgeClass, getOpBadgeClass,
  };
}
