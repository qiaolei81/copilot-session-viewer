/**
 * Time Analysis composable — ported from src/frontend/time-analyze.js
 *
 * Contains ALL computation logic for the time-analyze page.
 */
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue';

// ── Usage utils (inlined from src/frontend/usage-utils.js) ──
function getDisplayInputTokens(usage) {
  if (!usage || typeof usage !== 'object') return 0;
  const inputTokens = Number.isFinite(usage.inputTokens) ? usage.inputTokens : 0;
  const cacheReadTokens = Number.isFinite(usage.cacheReadTokens) ? usage.cacheReadTokens : 0;
  const cacheWriteTokens = Number.isFinite(usage.cacheWriteTokens) ? usage.cacheWriteTokens : 0;
  return Math.max(inputTokens - cacheReadTokens - cacheWriteTokens, 0);
}

function getUsageCacheHitRatio(usage) {
  if (!usage || typeof usage !== 'object') return null;
  const cacheReadTokens = Number.isFinite(usage.cacheReadTokens) ? usage.cacheReadTokens : 0;
  const totalReadableInput = getDisplayInputTokens(usage) + cacheReadTokens;
  if (cacheReadTokens === 0 || totalReadableInput === 0) return null;
  return Math.round((cacheReadTokens / totalReadableInput) * 100);
}

// ── Event marker categories ──
const EVENT_MARKER_CATEGORIES = {
  'tool.execution_start':        { color: '#d29922', shape: 'diamond', label: 'Tool Start' },
  'tool.execution_complete':     { color: '#e3b341', shape: 'diamond', label: 'Tool Complete' },
  'assistant.message':           { color: '#8b949e', shape: 'circle',  label: 'Message' },
  'user.message':                { color: '#79c0ff', shape: 'square',  label: 'User Message' },
  'session.start':               { color: '#56d364', shape: 'square',  label: 'Session Start' },
  'session.resume':              { color: '#56d364', shape: 'square',  label: 'Session Resume' },
  'session.error':               { color: '#f85149', shape: 'triangle', label: 'Error' },
  'session.truncation':          { color: '#f0883e', shape: 'triangle', label: 'Truncation' },
  'session.compaction_start':    { color: '#a371f7', shape: 'square',  label: 'Compaction Start' },
  'session.compaction_complete': { color: '#bc8cff', shape: 'square',  label: 'Compaction End' },
  'session.model_change':        { color: '#f778ba', shape: 'square',  label: 'Model Change' },
  'abort':                       { color: '#ff7b72', shape: 'triangle', label: 'Abort' },
};
const TRACKABLE_EVENT_TYPES = new Set(Object.keys(EVENT_MARKER_CATEGORIES));

export function useTimeAnalyze(sessionId, metadata) {
  const events = ref([]);
  const loading = ref(true);
  const error = ref(null);
  const activeTab = ref('timeline');
  const sortField = ref('timestamp');
  const sortDir = ref('asc');
  const insightReport = ref(null);
  const insightLog = ref(null);
  const insightLoading = ref(false);
  const insightError = ref(null);
  const insightGeneratedAt = ref(null);
  const showMarkerLegend = ref(false);
  const copyLabel = ref('📊 Copy as Mermaid Gantt');

  // Gantt crosshair
  const ganttCrosshairX = ref(null);
  const ganttCrosshairTime = ref('');

  // ── Helpers ──
  const normalizeMessage = (msg) => {
    if (!msg) return '';
    if (typeof msg === 'string') return msg;
    if (Array.isArray(msg)) {
      return msg.map(c => c.text || c.content || '').join(' ');
    }
    if (typeof msg === 'object' && msg.text) return msg.text;
    return String(msg);
  };

  const formatDuration = (ms) => {
    if (ms === null || ms === undefined || ms < 0) return '—';
    if (ms < 1000) return Math.round(ms) + 'ms';
    const s = ms / 1000;
    if (s < 60) {
      const rounded = Math.round(s * 10) / 10;
      return (rounded % 1 === 0 ? Math.round(rounded) : rounded.toFixed(1)) + 's';
    }
    const m = Math.floor(s / 60);
    const remainder = Math.floor(s % 60);
    if (m < 60) return m + 'm ' + remainder + 's';
    const h = Math.floor(m / 60);
    return h + 'h ' + (m % 60) + 'm';
  };

  const formatTokens = (num) => {
    if (!num || num === 0) return '0';
    if (num < 1000) return num.toString();
    return Math.floor(num / 1000) + 'K';
  };

  const formatTime = (ts) => {
    if (!ts) return '';
    const d = new Date(ts);
    return String(d.getHours()).padStart(2, '0') + ':' +
           String(d.getMinutes()).padStart(2, '0') + ':' +
           String(d.getSeconds()).padStart(2, '0');
  };

  const formatDateTime = (ts) => {
    if (!ts) return '';
    return new Date(ts).toLocaleString();
  };

  // ── Session timeline ──
  const sessionStart = computed(() => {
    if (!events.value.length) return null;
    for (const ev of events.value) {
      const ts = ev.timestamp || ev.snapshot?.timestamp;
      if (ts) return new Date(ts).getTime();
    }
    return null;
  });

  const sessionEnd = computed(() => {
    if (!events.value.length) return null;
    for (let i = events.value.length - 1; i >= 0; i--) {
      const ev = events.value[i];
      const ts = ev.timestamp || ev.snapshot?.timestamp;
      if (ts) return new Date(ts).getTime();
    }
    return null;
  });

  const totalDuration = computed(() => {
    if (!sessionStart.value || !sessionEnd.value) return 0;
    return sessionEnd.value - sessionStart.value;
  });

  // ── Shared sorted events ──
  const sortedEvents = computed(() => {
    return [...events.value].sort((a, b) => {
      const timeA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
      const timeB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
      if (timeA !== timeB) return timeA - timeB;
      return (a._fileIndex ?? 0) - (b._fileIndex ?? 0);
    });
  });

  // ── Map tool events to owning subagent ──
  const subagentToolMap = computed(() => {
    const sorted = sortedEvents.value;
    const subagentToolCallIds = new Set();
    for (const ev of sorted) {
      if (ev.type === 'subagent.started') {
        const tcid = ev.data?.toolCallId;
        if (tcid) subagentToolCallIds.add(tcid);
      }
    }
    const idMap = new Map();
    for (const ev of sorted) {
      if (ev.id) idMap.set(ev.id, ev);
    }
    const toolToSubagent = new Map();
    const startIdByToolCallId = new Map();
    for (const ev of sorted) {
      if (ev.type !== 'tool.execution_start') continue;
      let current = ev.parentId;
      let depth = 0;
      while (current && depth < 10) {
        const parent = idMap.get(current);
        if (!parent) break;
        if (parent.type === 'assistant.message') {
          const ptcid = parent.data?.parentToolCallId;
          if (ptcid && subagentToolCallIds.has(ptcid)) {
            toolToSubagent.set(ev.id, ptcid);
            const tcid = ev.data?.toolCallId;
            if (tcid) startIdByToolCallId.set(tcid, ptcid);
          }
          break;
        }
        current = parent.parentId;
        depth++;
      }
    }
    for (const ev of sorted) {
      if (ev.type !== 'tool.execution_complete') continue;
      const tcid = ev.data?.toolCallId;
      if (tcid && startIdByToolCallId.has(tcid)) {
        toolToSubagent.set(ev.id, startIdByToolCallId.get(tcid));
      }
    }
    return toolToSubagent;
  });

  // ── Event marker builder ──
  const buildEventMarkers = (innerEvents, startTime, duration) => {
    if (!innerEvents.length || !duration) return [];

    const HIGH_PRIORITY_TYPES = new Set([
      'session.start', 'session.resume', 'session.error',
      'session.truncation', 'session.compaction_start', 'session.compaction_complete',
      'session.model_change', 'abort', 'user.message',
    ]);

    const hiPriEvents = [];
    const toolEvents = [];
    for (const ev of innerEvents) {
      if (HIGH_PRIORITY_TYPES.has(ev.type)) {
        hiPriEvents.push(ev);
      } else {
        toolEvents.push(ev);
      }
    }

    const hiPriMarkers = hiPriEvents.map(ev => {
      const relPos = ((ev.timestamp - startTime) / duration) * 100;
      const cat = EVENT_MARKER_CATEGORIES[ev.type] || {};
      return {
        type: ev.type,
        position: Math.max(0, Math.min(100, relPos)),
        color: cat.color || '#8b949e',
        shape: cat.shape || 'circle',
        label: cat.label || ev.type,
        timestamp: ev.timestamp,
        toolName: ev.data?.toolName || null,
      };
    });

    const MIN_BUCKET_MS = 5 * 60 * 1000;
    const bucketSize = Math.max(MIN_BUCKET_MS, duration / 20);
    const buckets = new Map();
    for (const ev of toolEvents) {
      const bucketIdx = Math.floor((ev.timestamp - startTime) / bucketSize);
      if (!buckets.has(bucketIdx)) buckets.set(bucketIdx, []);
      buckets.get(bucketIdx).push(ev);
    }

    const toolErrorColor = (errorRatio) => {
      const r = Math.round(210 + (248 - 210) * errorRatio);
      const g = Math.round(153 + (81 - 153) * errorRatio);
      const b = Math.round(34 + (73 - 34) * errorRatio);
      return 'rgb(' + r + ',' + g + ',' + b + ')';
    };

    const isToolError = (ev) => {
      return ev.type === 'tool.execution_complete' && (ev.data?.isError || !!ev.data?.error);
    };

    const toolMarkers = [];
    for (const [bucketIdx, group] of buckets) {
      const bucketMid = startTime + (bucketIdx + 0.5) * bucketSize;
      const relPos = ((bucketMid - startTime) / duration) * 100;
      const pos = Math.max(0, Math.min(100, relPos));

      const errorCount = group.filter(isToolError).length;
      const completeCount = group.filter(ev => ev.type === 'tool.execution_complete').length;
      const errorRatio = completeCount > 0 ? errorCount / completeCount : 0;

      if (group.length === 1) {
        const ev = group[0];
        const cat = EVENT_MARKER_CATEGORIES[ev.type] || {};
        const color = isToolError(ev) ? '#f85149' : cat.color || '#8b949e';
        toolMarkers.push({
          type: ev.type,
          position: pos,
          color,
          shape: cat.shape || 'circle',
          label: isToolError(ev) ? (cat.label || ev.type) + ' (error)' : (cat.label || ev.type),
          timestamp: ev.timestamp,
          toolName: ev.data?.toolName || null,
        });
      } else {
        const typeCounts = {};
        group.forEach(ev => {
          const cat = EVENT_MARKER_CATEGORIES[ev.type] || {};
          const lbl = cat.label || ev.type;
          typeCounts[lbl] = (typeCounts[lbl] || 0) + 1;
        });
        if (errorCount > 0) typeCounts['Errors'] = errorCount;
        const summaryParts = Object.entries(typeCounts).map(([l, c]) => c + ' ' + l);
        const clusterColor = errorRatio > 0 ? toolErrorColor(errorRatio) : ((() => {
          const dominantType = group.reduce((best, ev) => {
            const cnt = group.filter(e => e.type === ev.type).length;
            return cnt > best.cnt ? { type: ev.type, cnt } : best;
          }, { type: group[0].type, cnt: 0 }).type;
          return (EVENT_MARKER_CATEGORIES[dominantType] || {}).color || '#8b949e';
        })());

        toolMarkers.push({
          type: 'cluster',
          position: pos,
          color: clusterColor,
          shape: 'cluster',
          label: summaryParts.join(', '),
          count: group.length,
          items: group,
        });
      }
    }

    return [...hiPriMarkers, ...toolMarkers].sort((a, b) => a.position - b.position);
  };

  // ── Sub-agent analysis ──
  const subagentAnalysis = computed(() => {
    const sorted = sortedEvents.value;
    const results = [];
    const startStack = [];

    for (const ev of sorted) {
      if (ev.type === 'subagent.started') {
        startStack.push(ev);
      } else if (ev.type === 'subagent.completed' || ev.type === 'subagent.failed') {
        const tcid = ev.data?.toolCallId;
        let startIdx = -1;
        if (tcid) {
          for (let i = startStack.length - 1; i >= 0; i--) {
            if (startStack[i].data?.toolCallId === tcid) {
              startIdx = i;
              break;
            }
          }
        }
        if (startIdx < 0 && startStack.length > 0) {
          startIdx = startStack.length - 1;
        }
        const startEv = startIdx >= 0 ? startStack.splice(startIdx, 1)[0] : null;
        const name = startEv?.data?.agentDisplayName || startEv?.data?.agentName || 'SubAgent';
        const startTime = startEv ? new Date(startEv.timestamp).getTime() : null;
        const endTime = new Date(ev.timestamp).getTime();
        const duration = startTime ? endTime - startTime : null;

        const subagentTcid = startEv?.data?.toolCallId;
        let toolCalls = 0;
        const innerEvents = [];
        if (startEv) {
          for (const e of sorted) {
            if (e.type === 'tool.execution_start') {
              if (subagentTcid && subagentToolMap.value.get(e.id) === subagentTcid) {
                toolCalls++;
              }
            }
            const t = new Date(e.timestamp).getTime();
            if (t >= startTime && t <= endTime) {
              if (TRACKABLE_EVENT_TYPES.has(e.type)) {
                if (e.type !== 'tool.execution_start' && e.type !== 'tool.execution_complete') {
                  innerEvents.push({ type: e.type, timestamp: t, data: e.data });
                } else if (subagentTcid && subagentToolMap.value.get(e.id) === subagentTcid) {
                  innerEvents.push({ type: e.type, timestamp: t, data: e.data });
                }
              }
            }
          }
        }

        const innerEventMarkers = buildEventMarkers(innerEvents, startTime, duration);

        results.push({
          name,
          status: ev.type === 'subagent.completed' ? 'completed' : 'failed',
          startTime: startEv?.timestamp || null,
          endTime: ev.timestamp,
          duration,
          toolCalls,
          innerEventMarkers
        });
      }
    }

    // Handle incomplete sub-agents
    const sessionEndTime = sorted.length > 0 ? new Date(sorted[sorted.length - 1].timestamp).getTime() : Date.now();
    for (const startEv of startStack) {
      const name = startEv.data?.agentDisplayName || startEv.data?.agentName || 'SubAgent';
      const startTime = new Date(startEv.timestamp).getTime();
      const duration = sessionEndTime - startTime;

      const subagentTcid = startEv.data?.toolCallId;
      let toolCalls = 0;
      const innerEvents = [];
      for (const e of sorted) {
        if (e.type === 'tool.execution_start') {
          if (subagentTcid && subagentToolMap.value.get(e.id) === subagentTcid) {
            toolCalls++;
          }
        }
        const t = new Date(e.timestamp).getTime();
        if (t >= startTime && t <= sessionEndTime) {
          if (TRACKABLE_EVENT_TYPES.has(e.type)) {
            if (e.type !== 'tool.execution_start' && e.type !== 'tool.execution_complete') {
              innerEvents.push({ type: e.type, timestamp: t, data: e.data });
            } else if (subagentTcid && subagentToolMap.value.get(e.id) === subagentTcid) {
              innerEvents.push({ type: e.type, timestamp: t, data: e.data });
            }
          }
        }
      }

      const innerEventMarkers = buildEventMarkers(innerEvents, startTime, duration);

      results.push({
        name,
        status: 'incomplete',
        startTime: startEv.timestamp,
        endTime: sorted[sorted.length - 1]?.timestamp || startEv.timestamp,
        duration,
        toolCalls,
        innerEventMarkers
      });
    }

    return results.sort((a, b) => {
      const tA = a.startTime ? new Date(a.startTime).getTime() : 0;
      const tB = b.startTime ? new Date(b.startTime).getTime() : 0;
      return tA - tB;
    });
  });

  const maxSubagentDuration = computed(() => {
    return Math.max(...subagentAnalysis.value.map(s => s.duration || 0), 1);
  });

  const subagentStats = computed(() => {
    const agents = subagentAnalysis.value;
    const completed = agents.filter(a => a.status === 'completed').length;
    const failed = agents.filter(a => a.status === 'failed').length;
    const incomplete = agents.filter(a => a.status === 'incomplete').length;
    const successRate = agents.length ? ((completed / agents.length) * 100).toFixed(0) : 100;

    const intervals = agents
      .filter(a => a.startTime && a.endTime)
      .map(a => [new Date(a.startTime).getTime(), new Date(a.endTime).getTime()])
      .sort((a, b) => a[0] - b[0]);
    const mergedIntervals = [];
    for (const [s, e] of intervals) {
      if (!mergedIntervals.length || s >= mergedIntervals[mergedIntervals.length - 1].e) {
        mergedIntervals.push({ s, e });
      } else if (e > mergedIntervals[mergedIntervals.length - 1].e) {
        mergedIntervals[mergedIntervals.length - 1].e = e;
      }
    }
    const totalTime = mergedIntervals.reduce((sum, iv) => sum + (iv.e - iv.s), 0);
    const totalTools = agents.reduce((sum, a) => sum + (a.toolCalls || 0), 0);

    return { completed, failed, incomplete, totalTime, totalTools, successRate };
  });

  // ── Build Agent Operation item for gaps ──
  const buildAgentOpItem = (sorted, gapStart, gapEnd) => {
    const duration = gapEnd - gapStart;
    const gapEvents = [];
    const eventCounts = {};
    let toolCalls = 0;
    for (const e of sorted) {
      const t = new Date(e.timestamp).getTime();
      if (t >= gapStart && t <= gapEnd) {
        if (e.type.startsWith('tool.')) {
          const isSubagentTool = e.id && subagentToolMap.value.has(e.id);
          if (!isSubagentTool) {
            if (TRACKABLE_EVENT_TYPES.has(e.type)) {
              gapEvents.push({ type: e.type, timestamp: t, data: e.data });
            }
            if (e.type === 'tool.execution_start') {
              toolCalls++;
            }
            eventCounts.tool = (eventCounts.tool || 0) + 1;
          }
        } else {
          if (TRACKABLE_EVENT_TYPES.has(e.type)) {
            gapEvents.push({ type: e.type, timestamp: t, data: e.data });
          }
          let cat = 'other';
          if (e.type.startsWith('assistant.')) cat = 'message';
          else if (e.type.startsWith('user.')) cat = 'user';
          else if (e.type.startsWith('session.')) cat = 'session';
          eventCounts[cat] = (eventCounts[cat] || 0) + 1;
        }
      }
    }

    const parts = [];
    if (toolCalls) parts.push(toolCalls + ' tool' + (toolCalls > 1 ? 's' : ''));
    if (eventCounts.message) parts.push(eventCounts.message + ' message' + (eventCounts.message > 1 ? 's' : ''));
    if (eventCounts.user) parts.push(eventCounts.user + ' user msg');
    if (eventCounts.session) parts.push(eventCounts.session + ' session event' + (eventCounts.session > 1 ? 's' : ''));
    if (eventCounts.other) parts.push(eventCounts.other + ' other');
    const summary = parts.length ? parts.join(', ') : 'idle';

    const innerEventMarkers = buildEventMarkers(gapEvents, gapStart, duration);

    return {
      itemType: 'agent-op',
      name: 'Main Agent',
      summary,
      toolCalls,
      startTime: new Date(gapStart).toISOString(),
      endTime: new Date(gapEnd).toISOString(),
      duration,
      eventCounts,
      innerEventMarkers,
    };
  };

  // ── Subagent timeline items ──
  const subagentTimelineItems = computed(() => {
    const agents = subagentAnalysis.value;
    if (!agents.length) return [];

    const sorted = sortedEvents.value;
    const items = [];

    for (let i = 0; i < agents.length; i++) {
      const sa = agents[i];

      if (i === 0 && sa.startTime) {
        const gapStart = sessionStart.value;
        const gapEnd = new Date(sa.startTime).getTime();
        if (gapEnd - gapStart > 500) {
          items.push(buildAgentOpItem(sorted, gapStart, gapEnd));
        }
      }

      items.push({ ...sa, itemType: 'subagent' });

      const nextSa = agents[i + 1];
      const gapStart = new Date(sa.endTime).getTime();
      const gapEnd = nextSa
        ? new Date(nextSa.startTime).getTime()
        : sessionEnd.value;

      if (gapEnd - gapStart > 500) {
        items.push(buildAgentOpItem(sorted, gapStart, gapEnd));
      }
    }

    return items;
  });

  // ── Turn analysis ──
  const turnAnalysis = computed(() => {
    try {
      const sorted = sortedEvents.value;
      const assistantMessages = sorted.filter(e => e.type === 'assistant.message');
      const allUserMessages = sorted.filter(e => e.type === 'user.message');

      return assistantMessages.map((msg, idx) => {
        const ts = msg.timestamp;
        if (!ts) return null;
        const startTime = new Date(ts).getTime();
        if (isNaN(startTime)) return null;

        const nextMsg = assistantMessages[idx + 1];
        const endTime = nextMsg
          ? new Date(nextMsg.timestamp).getTime()
          : sessionEnd.value || startTime;
        const duration = endTime - startTime;

        const msgIndex = sorted.indexOf(msg);
        const userMessage = sorted
          .slice(0, msgIndex)
          .reverse()
          .find(e => e.type === 'user.message');

        const userReqNumber = userMessage
          ? allUserMessages.indexOf(userMessage) + 1
          : 0;

        let displayText = '';
        const hasText = msg.data?.message && msg.data.message.trim() !== '';

        if (hasText) {
          displayText = normalizeMessage(msg.data.message);
        } else if (msg.data?.tools && msg.data.tools.length > 0) {
          const toolNames = msg.data.tools.map(t => t.name || 'unknown').join(', ');
          displayText = `Tool calls: ${toolNames}`;
        } else {
          displayText = '(empty assistant message)';
        }

        const toolCalls = msg.data?.tools?.length || 0;

        return {
          turnId: msg.id ?? `msg-${idx}`,
          userReqNumber,
          message: normalizeMessage(userMessage?.data?.message || userMessage?.data?.content || userMessage?.data?.transformedContent || ''),
          displayText,
          hasText,
          startTime: msg.timestamp,
          endTime: nextMsg?.timestamp || events.value[events.value.length - 1]?.timestamp,
          duration,
          toolCalls
        };
      }).filter(t => t !== null);
    } catch (err) {
      console.error('[turnAnalysis] Error:', err);
      error.value = 'Error analyzing turns: ' + err.message;
      return [];
    }
  });

  const maxTurnDuration = computed(() => {
    return Math.max(...turnAnalysis.value.map(t => t.duration || 0), 1);
  });

  // ── Grouped turns by UserReq ──
  const groupedTurns = computed(() => {
    const groups = new Map();
    for (const turn of turnAnalysis.value) {
      const reqNum = turn.userReqNumber || 0;
      if (!groups.has(reqNum)) {
        groups.set(reqNum, {
          userReqNumber: reqNum,
          message: turn.message,
          turns: []
        });
      }
      groups.get(reqNum).turns.push(turn);
    }
    return Array.from(groups.values()).sort((a, b) => a.userReqNumber - b.userReqNumber);
  });

  // ── Tool operations analysis ──
  const toolAnalysis = computed(() => {
    const sorted = sortedEvents.value;
    const toolGroups = new Map();

    for (const ev of sorted) {
      if (ev.type === 'tool.execution_start') {
        const toolId = ev.data?.toolCallId;
        if (toolId) {
          toolGroups.set(toolId, { start: ev });
        }
      } else if (ev.type === 'tool.execution_complete') {
        const toolId = ev.data?.toolCallId;
        if (toolId && toolGroups.has(toolId)) {
          toolGroups.get(toolId).complete = ev;
        }
      }
    }

    const results = [];
    toolGroups.forEach((group, toolId) => {
      const startTime = new Date(group.start.timestamp).getTime();
      const endTime = group.complete
        ? new Date(group.complete.timestamp).getTime()
        : null;
      const duration = endTime ? endTime - startTime : null;
      const toolName = group.start.data?.toolName || group.start.data?.tool || 'unknown';
      const args = group.start.data?.arguments || {};
      const isError = group.complete?.data?.isError || !!group.complete?.data?.error;

      let description = '';
      if (toolName === 'Bash' || toolName === 'bash' || toolName === 'exec') {
        description = args.command || args.description || '';
      } else if (['Read', 'read', 'Write', 'write', 'Edit', 'edit'].includes(toolName)) {
        description = args.file_path || args.path || '';
      } else if (['Glob', 'glob'].includes(toolName)) {
        description = args.pattern || '';
      } else if (['Grep', 'grep'].includes(toolName)) {
        description = args.pattern || '';
      } else if (['Task', 'task'].includes(toolName)) {
        description = args.description || args.prompt?.substring(0, 80) || '';
      } else {
        description = args.description || args.command || args.file_path ||
                    args.path || args.query || args.url || '';
      }
      if (description.length > 120) {
        description = description.substring(0, 120) + '...';
      }

      results.push({
        toolId,
        toolName,
        description,
        startTime: group.start.timestamp,
        endTime: group.complete?.timestamp || null,
        duration,
        isError,
        isRunning: !group.complete
      });
    });

    return results;
  });

  const sortedToolAnalysis = computed(() => {
    const items = [...toolAnalysis.value];
    items.sort((a, b) => {
      if (sortField.value === 'duration') {
        return sortDir.value === 'asc'
          ? (a.duration || 0) - (b.duration || 0)
          : (b.duration || 0) - (a.duration || 0);
      }
      if (sortField.value === 'toolName') {
        const cmp = (a.toolName || '').localeCompare(b.toolName || '');
        return sortDir.value === 'asc' ? cmp : -cmp;
      }
      const tA = new Date(a.startTime).getTime();
      const tB = new Date(b.startTime).getTime();
      return sortDir.value === 'asc' ? tA - tB : tB - tA;
    });
    return items;
  });

  const maxToolDuration = computed(() => {
    return Math.max(...toolAnalysis.value.map(t => t.duration || 0), 1);
  });

  // ── Token Usage ──
  const totalTokens = computed(() => {
    if (!metadata.value.usage || !metadata.value.usage.modelMetrics) return 0;
    let total = 0;
    for (const model in metadata.value.usage.modelMetrics) {
      const usage = metadata.value.usage.modelMetrics[model].usage;
      if (usage) {
        total += (usage.inputTokens || 0) + (usage.outputTokens || 0);
      }
    }
    return total;
  });

  const totalRequests = computed(() => {
    if (!metadata.value.usage || !metadata.value.usage.modelMetrics) return 0;
    let total = 0;
    for (const model in metadata.value.usage.modelMetrics) {
      total += (metadata.value.usage.modelMetrics[model].requests?.count || 0);
    }
    return total;
  });

  const totalModels = computed(() => {
    if (!metadata.value.usage || !metadata.value.usage.modelMetrics) return 0;
    return Object.keys(metadata.value.usage.modelMetrics).length;
  });

  const getModelCacheHitRatio = (model) => {
    const metrics = metadata.value.usage?.modelMetrics[model];
    if (!metrics || !metrics.usage) return null;
    return getUsageCacheHitRatio(metrics.usage);
  };

  const getDisplayUsageInputTokens = (model) => {
    const metrics = metadata.value.usage?.modelMetrics[model];
    if (!metrics || !metrics.usage) return 0;
    return getDisplayInputTokens(metrics.usage);
  };

  // ── Tool time by category ──
  const toolTimeByCategory = computed(() => {
    const catMap = {};
    toolAnalysis.value.forEach(t => {
      const name = (t.toolName || 'unknown').toLowerCase();
      let cat;
      if (['bash', 'exec'].includes(name)) cat = 'Bash/Exec';
      else if (['read'].includes(name)) cat = 'Read';
      else if (['write'].includes(name)) cat = 'Write';
      else if (['edit'].includes(name)) cat = 'Edit';
      else if (['glob'].includes(name)) cat = 'Glob';
      else if (['grep'].includes(name)) cat = 'Grep';
      else if (['task'].includes(name)) cat = 'Task (SubAgent)';
      else if (['web_search', 'websearch'].includes(name)) cat = 'Web Search';
      else if (['web_fetch', 'webfetch'].includes(name)) cat = 'Web Fetch';
      else cat = t.toolName || 'Other';

      if (!catMap[cat]) {
        catMap[cat] = { category: cat, totalTime: 0, count: 0, errors: 0 };
      }
      catMap[cat].totalTime += (t.duration || 0);
      catMap[cat].count++;
      if (t.isError) catMap[cat].errors++;
    });

    return Object.values(catMap).sort((a, b) => b.count - a.count);
  });

  const maxCategoryTime = computed(() => {
    return Math.max(...toolTimeByCategory.value.map(c => c.totalTime), 1);
  });

  // ── Summary stats ──
  const totalToolTime = computed(() => {
    const intervals = toolAnalysis.value
      .filter(t => t.duration && t.startTime && t.endTime)
      .map(t => ({
        start: new Date(t.startTime).getTime(),
        end: new Date(t.endTime).getTime()
      }))
      .sort((a, b) => a.start - b.start);

    if (!intervals.length) return 0;

    let totalMs = 0;
    let curStart = intervals[0].start;
    let curEnd = intervals[0].end;

    for (let i = 1; i < intervals.length; i++) {
      if (intervals[i].start <= curEnd) {
        curEnd = Math.max(curEnd, intervals[i].end);
      } else {
        totalMs += curEnd - curStart;
        curStart = intervals[i].start;
        curEnd = intervals[i].end;
      }
    }
    totalMs += curEnd - curStart;

    return totalMs;
  });

  const totalToolCount = computed(() => toolAnalysis.value.length);

  const avgToolDuration = computed(() => {
    if (!totalToolCount.value) return 0;
    const rawSum = toolAnalysis.value.reduce((acc, t) => acc + (t.duration || 0), 0);
    return rawSum / totalToolCount.value;
  });

  const longestTool = computed(() => {
    if (!toolAnalysis.value.length) return null;
    return toolAnalysis.value.reduce((max, t) => (t.duration || 0) > (max.duration || 0) ? t : max);
  });

  // ── Gap Analysis ──
  const gapAnalysis = computed(() => {
    const sorted = sortedEvents.value;
    const gaps = [];

    for (let i = 0; i < sorted.length - 1; i++) {
      const current = sorted[i];
      const next = sorted[i + 1];
      const currentTime = new Date(current.timestamp).getTime();
      const nextTime = new Date(next.timestamp).getTime();
      const duration = nextTime - currentTime;

      if (duration < 100) continue;

      let gapType = null;
      let description = '';

      if (current.type === 'user.message' && next.type === 'assistant.turn_start') {
        gapType = 'input-consumption';
        const msgLength = (current.data?.message || '').length;
        description = `LLM reading user input (${msgLength} chars)`;
      } else if (current.type === 'assistant.turn_start' && next.type === 'assistant.message') {
        gapType = 'llm-generation';
        const outputLength = (next.data?.content || '').length;
        description = `LLM generating response (${outputLength} chars output)`;
      } else if (current.type === 'assistant.turn_start' && next.type === 'tool.execution_start') {
        gapType = 'llm-generation';
        const toolName = next.data?.toolName || 'unknown';
        description = `LLM deciding to call ${toolName}`;
      } else if (current.type === 'assistant.message' && next.type === 'assistant.turn_start') {
        gapType = 'turn-gap';
        description = 'Gap between assistant response and next turn';
      } else if (current.type === 'tool.execution_complete' && duration > 500) {
        gapType = 'post-tool';
        const toolName = current.data?.toolName || 'unknown';
        description = `Processing ${toolName} result`;
      } else if (duration > 5000) {
        gapType = 'idle';
        description = `${current.type} → ${next.type}`;
      }

      if (gapType) {
        gaps.push({
          type: gapType,
          description,
          startTime: current.timestamp,
          endTime: next.timestamp,
          duration,
          fromEvent: current.type,
          toEvent: next.type,
          fromData: current.data,
          toData: next.data
        });
      }
    }

    return gaps.sort((a, b) => (b.duration || 0) - (a.duration || 0));
  });

  const maxGapDuration = computed(() => {
    return Math.max(...gapAnalysis.value.map(g => g.duration || 0), 1);
  });

  const gapStats = computed(() => {
    const stats = {
      'input-consumption': { count: 0, total: 0, avg: 0 },
      'llm-generation': { count: 0, total: 0, avg: 0 },
      'post-tool': { count: 0, total: 0, avg: 0 },
      'turn-gap': { count: 0, total: 0, avg: 0 },
      'idle': { count: 0, total: 0, avg: 0 }
    };

    gapAnalysis.value.forEach(gap => {
      if (stats[gap.type]) {
        stats[gap.type].count++;
        stats[gap.type].total += gap.duration;
      }
    });

    Object.keys(stats).forEach(key => {
      if (stats[key].count > 0) {
        stats[key].avg = stats[key].total / stats[key].count;
      }
    });

    return stats;
  });

  const successRate = computed(() => {
    const total = toolAnalysis.value.length;
    if (total === 0) return 100;
    const errors = toolAnalysis.value.filter(t => t.isError).length;
    return ((total - errors) / total * 100).toFixed(1);
  });

  const errorCount = computed(() => {
    return toolAnalysis.value.filter(t => t.isError).length;
  });

  const timeBreakdown = computed(() => {
    const sorted = sortedEvents.value;
    let userThinkingTime = 0;

    for (let i = 0; i < sorted.length - 1; i++) {
      const current = sorted[i];
      const next = sorted[i + 1];

      if (next.type === 'user.message' && current.type !== 'user.message') {
        const gap = new Date(next.timestamp).getTime() - new Date(current.timestamp).getTime();
        if (gap > 1000) {
          userThinkingTime += gap;
        }
      }
    }

    const total = totalDuration.value || 0;
    const agentWorkingTime = Math.max(total - userThinkingTime, 0);
    const llmTime = Math.max(agentWorkingTime - totalToolTime.value, 0);

    return {
      userThinkingTime,
      agentWorkingTime,
      llmTime,
      userThinkingPct: total > 0 ? (userThinkingTime / total * 100).toFixed(0) : 0,
      agentWorkingPct: total > 0 ? (agentWorkingTime / total * 100).toFixed(0) : 0,
      llmPct: total > 0 ? (llmTime / total * 100).toFixed(0) : 0,
      toolPct: total > 0 ? (totalToolTime.value / total * 100).toFixed(0) : 0,
    };
  });

  // ── Unified Timeline Items ──
  const unifiedTimelineItems = computed(() => {
    const items = [];
    const groups = groupedTurns.value;
    const agents = subagentAnalysis.value;
    const sorted = sortedEvents.value;

    if (groups.length) {
      for (let gi = 0; gi < groups.length; gi++) {
        const group = groups[gi];
        const turns = group.turns;
        if (!turns.length) continue;

        const reqStart = new Date(turns[0].startTime).getTime();
        const reqEnd = new Date(turns[turns.length - 1].endTime).getTime();

        items.push({
          rowType: 'user-req',
          userReqNumber: group.userReqNumber,
          message: group.message,
          startTime: turns[0].startTime,
          endTime: turns[turns.length - 1].endTime,
          duration: reqEnd - reqStart,
        });

        const reqAgents = agents.filter(sa => {
          if (!sa.startTime) return false;
          const saStart = new Date(sa.startTime).getTime();
          return saStart >= reqStart && saStart <= reqEnd;
        });

        if (reqAgents.length) {
          for (let i = 0; i < reqAgents.length; i++) {
            const sa = reqAgents[i];

            const gapStart = i === 0
              ? reqStart
              : new Date(reqAgents[i - 1].endTime).getTime();
            const gapEnd = new Date(sa.startTime).getTime();

            if (gapEnd - gapStart > 500) {
              const agentOp = buildAgentOpItem(sorted, gapStart, gapEnd);
              agentOp.rowType = 'main-agent';
              items.push(agentOp);
            }

            items.push({
              ...sa,
              rowType: 'subagent',
              itemType: 'subagent',
            });

            if (i === reqAgents.length - 1) {
              const trailingStart = new Date(sa.endTime).getTime();
              const trailingEnd = reqEnd;
              if (trailingEnd - trailingStart > 500) {
                const agentOp = buildAgentOpItem(sorted, trailingStart, trailingEnd);
                agentOp.rowType = 'main-agent';
                items.push(agentOp);
              }
            }
          }
        } else {
          if (reqEnd - reqStart > 0) {
            const agentOp = buildAgentOpItem(sorted, reqStart, reqEnd);
            agentOp.rowType = 'main-agent';
            items.push(agentOp);
          }
        }
      }
    } else if (subagentTimelineItems.value.length) {
      for (const item of subagentTimelineItems.value) {
        items.push({
          ...item,
          rowType: item.itemType === 'agent-op' ? 'main-agent' : 'subagent',
        });
      }
    }

    return items;
  });

  // ── Gantt chart positioning ──
  const ganttPosition = (startTs, endTs) => {
    if (!sessionStart.value || !totalDuration.value || !startTs) return { left: '0%', width: '0%' };
    const s = new Date(startTs).getTime();
    const e = endTs ? new Date(endTs).getTime() : s + 1000;
    const left = ((s - sessionStart.value) / totalDuration.value) * 100;
    const width = Math.max(((e - s) / totalDuration.value) * 100, 0.5);
    return {
      left: left + '%',
      width: Math.min(width, 100 - left) + '%'
    };
  };

  // ── Sort control ──
  const toggleSort = (field) => {
    if (sortField.value === field) {
      sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc';
    } else {
      sortField.value = field;
      sortDir.value = field === 'duration' ? 'desc' : 'asc';
    }
  };

  const sortIcon = (field) => {
    if (sortField.value !== field) return '↕';
    return sortDir.value === 'asc' ? '↑' : '↓';
  };

  const getToolBadgeClass = (toolName) => {
    const lower = (toolName || '').toLowerCase();
    if (['bash', 'exec'].includes(lower)) return 'badge-bash';
    if (lower === 'read') return 'badge-read';
    if (lower === 'write' || lower === 'notebookedit') return 'badge-write';
    if (lower === 'edit') return 'badge-edit';
    if (lower === 'glob' || lower === 'grep') return 'badge-search';
    if (lower === 'task') return 'badge-subagent';
    return 'badge-other';
  };

  const getOpBadgeClass = (opType) => {
    const classes = {
      read: 'badge-read',
      write: 'badge-write',
      edit: 'badge-edit',
      create: 'badge-create',
      search: 'badge-search'
    };
    return classes[opType] || 'badge-other';
  };

  // ── Gantt crosshair ──
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

  // ── Copy timeline as Mermaid ──
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
    } catch (err) {
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

  // ── Load events ──
  onMounted(async () => {
    try {
      const resp = await fetch('/api/sessions/' + sessionId.value + '/events');
      if (!resp.ok) throw new Error('Failed to load events: ' + resp.statusText);
      const data = await resp.json();
      events.value = data.sort((a, b) => {
        const timeA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
        const timeB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
        if (timeA !== timeB) return timeA - timeB;
        return (a._fileIndex ?? 0) - (b._fileIndex ?? 0);
      });
    } catch (err) {
      console.error('[TIME-ANALYZE] Error loading events:', err);
      error.value = err.message;
    } finally {
      loading.value = false;
    }
  });

  // ── Copilot Insight ──
  const insightStatus = ref('not_started');
  const insightLastUpdate = ref(null);
  const insightStartedAt = ref(null);
  const insightAgeMs = ref(0);
  let pollInterval = null;

  const renderedInsight = computed(() => {
    if (!insightReport.value) return '';
    if (typeof window !== 'undefined' && window.marked) {
      return window.marked.parse(insightReport.value);
    }
    return insightReport.value;
  });

  const checkExistingInsight = async () => {
    try {
      const resp = await fetch(`/session/${sessionId.value}/insight`);
      const data = await resp.json();

      insightStatus.value = data.status;

      if (data.status === 'completed') {
        insightReport.value = data.report;
        insightLog.value = null;
        insightGeneratedAt.value = data.generatedAt;
        stopPolling();
      } else if (data.status === 'generating') {
        insightLog.value = data.log || null;
        insightStartedAt.value = data.startedAt;
        insightLastUpdate.value = data.lastUpdate;
        insightAgeMs.value = data.ageMs;
        startPolling();
        nextTick(() => {
          const el = document.getElementById('insight-log');
          if (el) el.scrollTop = el.scrollHeight;
        });
      } else if (data.status === 'timeout') {
        insightLog.value = data.log || null;
        insightStartedAt.value = data.startedAt;
        insightLastUpdate.value = data.lastUpdate;
        insightAgeMs.value = data.ageMs;
        startPolling();
      }
    } catch (err) {
      console.error('Failed to check insight:', err);
    }
  };

  const startPolling = () => {
    stopPolling();
    pollInterval = setInterval(checkExistingInsight, 2000);
  };

  const stopPolling = () => {
    if (pollInterval) {
      clearInterval(pollInterval);
      pollInterval = null;
    }
  };

  const generateInsight = async (force = false) => {
    insightLoading.value = true;
    insightError.value = null;
    insightLog.value = null;

    try {
      const resp = await fetch(`/session/${sessionId.value}/insight`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force })
      });

      if (!resp.ok) {
        const err = await resp.json();
        throw new Error(err.error || 'Failed to generate insight');
      }

      const data = await resp.json();
      insightStatus.value = data.status;

      if (data.status === 'generating') {
        insightStartedAt.value = data.startedAt;
        startPolling();
      } else if (data.status === 'completed') {
        insightReport.value = data.report;
        insightGeneratedAt.value = data.generatedAt;
      }
    } catch (err) {
      insightError.value = err.message;
    } finally {
      insightLoading.value = false;
    }
  };

  const regenerateInsight = async () => {
    await generateInsight(true);
  };

  // Check for existing insight on mount
  onMounted(async () => {
    await checkExistingInsight();
  });

  // Clean up polling on unmount
  onUnmounted(() => {
    stopPolling();
  });

  return {
    sessionId, metadata, events, loading, error, activeTab,
    sortField, sortDir,
    insightReport, insightLog, insightLoading, insightError, insightGeneratedAt,
    insightStatus, insightLastUpdate, insightStartedAt, insightAgeMs,
    renderedInsight, generateInsight, regenerateInsight,
    formatDuration, formatTime, formatDateTime, formatTokens, normalizeMessage,
    sessionStart, sessionEnd, totalDuration,
    subagentAnalysis, maxSubagentDuration, subagentTimelineItems, subagentStats,
    EVENT_MARKER_CATEGORIES, showMarkerLegend,
    copyLabel, copyTimelineMarkdown,
    ganttCrosshairX, ganttCrosshairTime, onGanttMouseMove, onGanttMouseLeave,
    turnAnalysis, maxTurnDuration, groupedTurns,
    unifiedTimelineItems,
    toolAnalysis, sortedToolAnalysis, maxToolDuration,
    totalTokens, totalRequests, totalModels,
    getModelCacheHitRatio, getDisplayUsageInputTokens,
    toolTimeByCategory, maxCategoryTime,
    totalToolTime, totalToolCount, avgToolDuration, longestTool,
    successRate, errorCount, timeBreakdown,
    gapAnalysis, maxGapDuration, gapStats,
    ganttPosition, toggleSort, sortIcon,
    getToolBadgeClass, getOpBadgeClass,
  };
}
