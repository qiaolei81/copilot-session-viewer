/**
 * Time Analysis Page - Vue 3 Composition API Application
 *
 * Extracted from views/time-analyze.ejs
 *
 * This file contains the main Vue application logic for the time analysis page.
 * It expects the following global variables to be available:
 *
 * - Vue: The Vue 3 library (loaded via CDN)
 * - marked: The marked.js library for markdown parsing (loaded via CDN)
 * - window.__PAGE_DATA: An object containing:
 *   - sessionId: The session ID string
 *   - metadata: Session metadata object
 *
 * The page data should be initialized in the EJS template before this script runs:
 *
 * <script>
 *   window.__PAGE_DATA = {
 *     sessionId: '<%= sessionId %>',
 *     metadata: <%- JSON.stringify(metadata) %>
 *   };
 * </script>
 */

const { createApp, ref, computed, onMounted, onUnmounted } = Vue;

const app = createApp({
  setup() {
    const sessionId = ref(window.__PAGE_DATA.sessionId);
    const metadata = ref(window.__PAGE_DATA.metadata);
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

    // Helper: normalize message to string (handle arrays/objects from Copilot)
    const normalizeMessage = (msg) => {
      if (!msg) return '';
      if (typeof msg === 'string') return msg;
      if (Array.isArray(msg)) {
        // Handle content array (Copilot format)
        return msg.map(c => c.text || c.content || '').join(' ');
      }
      if (typeof msg === 'object' && msg.text) return msg.text;
      return String(msg);
    };

    // Gantt crosshair
    const ganttCrosshairX = ref(null); // px from left of gantt-container
    const ganttCrosshairTime = ref('');
    const onGanttMouseMove = (e) => {
      const container = e.currentTarget;
      // Find the first gantt-bar-area to get the bar column bounds
      const barArea = container.querySelector('.gantt-bar-area');
      if (!barArea) return;
      const barRect = barArea.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      const barLeft = barRect.left - containerRect.left;
      const barRight = barLeft + barRect.width;
      const mouseX = e.clientX - containerRect.left;

      if (mouseX >= barLeft && mouseX <= barRight) {
        ganttCrosshairX.value = mouseX;
        // Compute timestamp from position
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

      // Helper: convert timestamp to Unix epoch milliseconds
      const toEpochMs = (ts) => {
        if (!ts) return 0;
        return new Date(ts).getTime();
      };

      // Sanitize label for Mermaid: strip chars that break syntax or could escape the code block
      const sanitize = (str) => (str || '').replace(/[`\n\r]/g, '').replace(/[:;#]/g, '-').replace(/\s+/g, ' ').trim().substring(0, 100);
      const normalizeMessage = (msg) => {
        if (!msg) return '';
        if (typeof msg === 'string') return msg;
        if (Array.isArray(msg)) {
          // Handle content array (Copilot format)
          return msg.map(c => c.text || c.content || '').join(' ');
        }
        if (typeof msg === 'object' && msg.text) return msg.text;
        return String(msg);
      };

      // Deduplicate task IDs within the mermaid block
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
        // Fallback for non-secure contexts
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

    // 事件标记类别定义
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

    // ── Helpers ──
    const formatDuration = (ms) => {
      if (ms === null || ms === undefined || ms < 0) return '—';
      if (ms < 1000) return Math.round(ms) + 'ms';
      const s = ms / 1000;
      if (s < 60) {
        const rounded = Math.round(s * 10) / 10; // 四舍五入到一位小数
        return (rounded % 1 === 0 ? Math.round(rounded) : rounded.toFixed(1)) + 's';
      }
      const m = Math.floor(s / 60);
      const remainder = Math.floor(s % 60);
      if (m < 60) return m + 'm ' + remainder + 's';
      const h = Math.floor(m / 60);
      return h + 'h ' + (m % 60) + 'm';
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
      // Find first event with valid timestamp
      for (const ev of events.value) {
        const ts = ev.timestamp || ev.snapshot?.timestamp;
        if (ts) return new Date(ts).getTime();
      }
      return null;
    });

    const sessionEnd = computed(() => {
      if (!events.value.length) return null;
      // Find last event with valid timestamp
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

    // ── Shared sorted events (computed once, reused everywhere) ──
    // Stable sort: use _fileIndex (set by backend) as tiebreaker for identical timestamps
    const sortedEvents = computed(() => {
      return [...events.value].sort((a, b) => {
        const timeA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
        const timeB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
        if (timeA !== timeB) return timeA - timeB;
        return (a._fileIndex ?? 0) - (b._fileIndex ?? 0);
      });
    });

    // ── Map tool.execution_start events to owning subagent via parentToolCallId ──
    const subagentToolMap = computed(() => {
      const sorted = sortedEvents.value;

      // 1. Collect all subagent toolCallIds
      const subagentToolCallIds = new Set();
      for (const ev of sorted) {
        if (ev.type === 'subagent.started') {
          const tcid = ev.data?.toolCallId;
          if (tcid) subagentToolCallIds.add(tcid);
        }
      }

      // 2. Build id → event lookup
      const idMap = new Map();
      for (const ev of sorted) {
        if (ev.id) idMap.set(ev.id, ev);
      }

      // 3. For each tool.execution_start, walk parentId to find assistant.message,
      //    then read data.parentToolCallId
      const toolToSubagent = new Map(); // tool event id → subagent toolCallId
      const startIdByToolCallId = new Map(); // data.toolCallId → subagent toolCallId (for matching complete events)
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

      // 4. Map tool.execution_complete events via their toolCallId
      for (const ev of sorted) {
        if (ev.type !== 'tool.execution_complete') continue;
        const tcid = ev.data?.toolCallId;
        if (tcid && startIdByToolCallId.has(tcid)) {
          toolToSubagent.set(ev.id, startIdByToolCallId.get(tcid));
        }
      }

      return toolToSubagent;
    });

    // ── Sub-agent analysis ──
    const subagentAnalysis = computed(() => {
      const sorted = sortedEvents.value;
      const results = [];
      const startStack = [];

      for (const ev of sorted) {
        if (ev.type === 'subagent.started') {
          startStack.push(ev);
        } else if (ev.type === 'subagent.completed' || ev.type === 'subagent.failed') {
          // Find matching start by toolCallId
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
          // Fallback to LIFO if no toolCallId match (pop last started)
          if (startIdx < 0 && startStack.length > 0) {
            startIdx = startStack.length - 1;
          }
          const startEv = startIdx >= 0 ? startStack.splice(startIdx, 1)[0] : null;
          // Extract name from matched start event (completed event doesn't have name)
          const name = startEv?.data?.agentDisplayName || startEv?.data?.agentName || 'SubAgent';
          const startTime = startEv ? new Date(startEv.timestamp).getTime() : null;
          const endTime = new Date(ev.timestamp).getTime();
          const duration = startTime ? endTime - startTime : null;

          // Count tool calls using parentToolCallId attribution (not time-window)
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
              // Keep time-window for innerEvents/markers (visual only)
              const t = new Date(e.timestamp).getTime();
              if (t >= startTime && t <= endTime) {
                if (TRACKABLE_EVENT_TYPES.has(e.type)) {
                  if (e.type !== 'tool.execution_start' && e.type !== 'tool.execution_complete') {
                    // Non-tool trackable events: use time-window
                    innerEvents.push({ type: e.type, timestamp: t, data: e.data });
                  } else if (subagentTcid && subagentToolMap.value.get(e.id) === subagentTcid) {
                    // Tool events: only include if attributed to this subagent
                    innerEvents.push({ type: e.type, timestamp: t, data: e.data });
                  }
                }
              }
            }
          }

          // Build event markers with clustering
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

      // Handle incomplete sub-agents (started but never completed/failed)
      const sessionEndTime = sorted.length > 0 ? new Date(sorted[sorted.length - 1].timestamp).getTime() : Date.now();
      for (const startEv of startStack) {
        const name = startEv.data?.agentDisplayName || startEv.data?.agentName || 'SubAgent';
        const startTime = new Date(startEv.timestamp).getTime();
        const duration = sessionEndTime - startTime;

        // Count tool calls using parentToolCallId attribution (not time-window)
        const subagentTcid = startEv.data?.toolCallId;
        let toolCalls = 0;
        const innerEvents = [];
        for (const e of sorted) {
          if (e.type === 'tool.execution_start') {
            if (subagentTcid && subagentToolMap.value.get(e.id) === subagentTcid) {
              toolCalls++;
            }
          }
          // Keep time-window for innerEvents/markers (visual only)
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

      // Merge overlapping intervals to get actual wall-clock time in subagents
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

      // Sum per-subagent tool counts (already correctly attributed via parentToolCallId)
      const totalTools = agents.reduce((sum, a) => sum + (a.toolCalls || 0), 0);

      return { completed, failed, incomplete, totalTime, totalTools, successRate };
    });

    // ── Event marker builder (shared by subagent + agent-op) ──
    const buildEventMarkers = (innerEvents, startTime, duration) => {
      if (!innerEvents.length || !duration) return [];

      // Separate high-priority events (always shown individually) from tool events (clustered)
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

      // Build individual markers for high-priority events (never clustered)
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

      // Cluster tool events into fixed time buckets
      // Adaptive: aim for ~20 buckets max, with a minimum of 5 minutes per bucket
      const MIN_BUCKET_MS = 5 * 60 * 1000; // 5 minutes
      const bucketSize = Math.max(MIN_BUCKET_MS, duration / 20);

      const buckets = new Map(); // bucketIndex -> events[]
      for (const ev of toolEvents) {
        const bucketIdx = Math.floor((ev.timestamp - startTime) / bucketSize);
        if (!buckets.has(bucketIdx)) buckets.set(bucketIdx, []);
        buckets.get(bucketIdx).push(ev);
      }

      // Helper: interpolate color from tool yellow to error red based on error ratio
      const toolErrorColor = (errorRatio) => {
        // 0 = #d29922 (yellow), 1 = #f85149 (red)
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

        // Count errors in this bucket
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
          // Summarize the cluster
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

      // Merge and sort by position
      return [...hiPriMarkers, ...toolMarkers].sort((a, b) => a.position - b.position);
    };

    // ── Build Agent Operation item for gaps ──
    const buildAgentOpItem = (sorted, gapStart, gapEnd) => {
      const duration = gapEnd - gapStart;
      const gapEvents = [];
      const eventCounts = {};
      let toolCalls = 0;
      for (const e of sorted) {
        const t = new Date(e.timestamp).getTime();
        if (t >= gapStart && t <= gapEnd) {
          // For tool events, only include those NOT attributed to a subagent
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

      // Build summary string
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

    // ── Subagent timeline items (subagent bars + agent-op gaps) ──
    const subagentTimelineItems = computed(() => {
      const agents = subagentAnalysis.value;
      if (!agents.length) return [];

      const sorted = sortedEvents.value;
      const items = [];

      for (let i = 0; i < agents.length; i++) {
        const sa = agents[i];

        // Before first subagent: check gap from session start
        if (i === 0 && sa.startTime) {
          const gapStart = sessionStart.value;
          const gapEnd = new Date(sa.startTime).getTime();
          if (gapEnd - gapStart > 500) {
            items.push(buildAgentOpItem(sorted, gapStart, gapEnd));
          }
        }

        // Add subagent itself
        items.push({ ...sa, itemType: 'subagent' });

        // Gap between this and next subagent (or session end)
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
          if (!ts) {
            console.warn('[turnAnalysis] Message without timestamp:', msg);
            return null;
          }
          const startTime = new Date(ts).getTime();
          if (isNaN(startTime)) {
            console.warn('[turnAnalysis] Invalid timestamp:', ts, msg);
            return null;
          }

          const nextMsg = assistantMessages[idx + 1];
          const endTime = nextMsg
            ? new Date(nextMsg.timestamp).getTime()
            : sessionEnd.value || startTime;
          const duration = endTime - startTime;

          // Find user message before this assistant message
          const msgIndex = sorted.indexOf(msg);
          const userMessage = sorted
            .slice(0, msgIndex)
            .reverse()
            .find(e => e.type === 'user.message');

          const userReqNumber = userMessage
            ? allUserMessages.indexOf(userMessage) + 1
            : 0;

          // Extract display text
          let displayText = '';
          const hasText = msg.data?.message && msg.data.message.trim() !== '';

          if (hasText) {
            displayText = normalizeMessage(msg.data.message);
          } else if (msg.data?.tools && msg.data.tools.length > 0) {
            // Only tool calls, show tool names
            const toolNames = msg.data.tools.map(t => t.name || 'unknown').join(', ');
            displayText = `Tool calls: ${toolNames}`;
          } else {
            displayText = '(empty assistant message)';
          }

          // Count tool calls
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

        // Extract file path or command
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
        // default: timestamp
        const tA = new Date(a.startTime).getTime();
        const tB = new Date(b.startTime).getTime();
        return sortDir.value === 'asc' ? tA - tB : tB - tA;
      });
      return items;
    });

    const maxToolDuration = computed(() => {
      return Math.max(...toolAnalysis.value.map(t => t.duration || 0), 1);
    });

    // ── File operations ──
    const fileOperations = computed(() => {
      const fileTools = ['view', 'read', 'write', 'edit', 'create', 'glob', 'grep', 'notebookedit'];
      // VSCode Copilot Chat tool name mappings
      const vsCodeFileToolMap = {
        'copilot_readfile': 'read',
        'copilot_createfile': 'write',
        'copilot_createdirectory': 'write',
        'copilot_findfiles': 'search',
        'copilot_findtextinfiles': 'search',
        'copilot_listdirectory': 'read',
        'textedit': 'edit',
        'copilot_replacestring': 'edit',
        'copilot_multireplacestring': 'edit',
      };
      const ops = [];

      for (const ev of events.value) {
        if (ev.type === 'tool.execution_start') {
          const toolName = ev.data?.toolName?.toLowerCase() || '';
          const args = ev.data?.arguments || {};
          const path = args.path || args.file || args.directory || args.pattern || '';

          // Check standard file tools
          if (fileTools.includes(toolName)) {
            if (path) {
              let opType = 'other';
              if (toolName === 'view' || toolName === 'read') opType = 'read';
              else if (toolName === 'write' || toolName === 'notebookedit' || toolName === 'create') opType = 'write';
              else if (toolName === 'edit') opType = 'edit';
              else if (toolName === 'glob' || toolName === 'grep') opType = 'search';

              ops.push({
                toolName: ev.data?.toolName || toolName,
                opType,
                filePath: path,
                timestamp: ev.timestamp,
                startTime: ev.timestamp
              });
            }
          }
          // Check VSCode file tools
          else if (vsCodeFileToolMap[toolName]) {
            const opType = vsCodeFileToolMap[toolName];
            ops.push({
              toolName: ev.data?.toolName || toolName,
              opType,
              filePath: path || '(implicit)',
              timestamp: ev.timestamp,
              startTime: ev.timestamp
            });
          }
        }
      }

      return ops.sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
    });

    const fileStats = computed(() => {
      const ops = fileOperations.value;
      const uniqueFiles = new Set(ops.map(o => o.filePath));
      return {
        uniqueCount: uniqueFiles.size,
        totalOps: ops.length,
        reads: ops.filter(o => o.opType === 'read').length,
        writes: ops.filter(o => o.opType === 'write').length,
        edits: ops.filter(o => o.opType === 'edit').length,
        searches: ops.filter(o => o.opType === 'search').length
      };
    });

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
    // Wall-clock tool time: merge overlapping intervals to avoid double-counting parallel tools
    const totalToolTime = computed(() => {
      const intervals = toolAnalysis.value
        .filter(t => t.duration && t.startTime && t.endTime)
        .map(t => ({
          start: new Date(t.startTime).getTime(),
          end: new Date(t.endTime).getTime()
        }))
        .sort((a, b) => a.start - b.start);

      if (!intervals.length) return 0;

      // Merge overlapping intervals
      let totalMs = 0;
      let curStart = intervals[0].start;
      let curEnd = intervals[0].end;

      for (let i = 1; i < intervals.length; i++) {
        if (intervals[i].start <= curEnd) {
          // Overlapping — extend current interval
          curEnd = Math.max(curEnd, intervals[i].end);
        } else {
          // Gap — commit current interval and start new one
          totalMs += curEnd - curStart;
          curStart = intervals[i].start;
          curEnd = intervals[i].end;
        }
      }
      totalMs += curEnd - curStart; // commit last interval

      return totalMs;
    });

    // ── Token Statistics ──
    const _tokenStats = computed(() => {
      let totalTokens = 0;
      let byCategory = {};

      for (const ev of events.value) {
        if (ev.type === 'tool.execution_complete' && ev.data?.toolTelemetry?.metrics) {
          const tokens = ev.data.toolTelemetry.metrics.resultForLlmLength || 0;
          totalTokens += tokens;

          // Categorize by tool name
          const toolName = ev.data.toolName || 'unknown';
          if (!byCategory[toolName]) {
            byCategory[toolName] = 0;
          }
          byCategory[toolName] += tokens;
        }
      }

      return {
        total: totalTokens,
        byCategory
      };
    });

    // ── Gap Analysis ──
    const gapAnalysis = computed(() => {
      const sorted = sortedEvents.value;
      const gaps = [];

      // Track user messages and assistant responses
      for (let i = 0; i < sorted.length - 1; i++) {
        const current = sorted[i];
        const next = sorted[i + 1];
        const currentTime = new Date(current.timestamp).getTime();
        const nextTime = new Date(next.timestamp).getTime();
        const duration = nextTime - currentTime;

        // Only report gaps > 100ms
        if (duration < 100) continue;

        let gapType = null;
        let description = '';

        // User message → assistant.turn_start (input consumption)
        if (current.type === 'user.message' && next.type === 'assistant.turn_start') {
          gapType = 'input-consumption';
          const msgLength = (current.data?.message || '').length;
          description = `LLM reading user input (${msgLength} chars)`;
        }

        // assistant.turn_start → assistant.message (generation)
        else if (current.type === 'assistant.turn_start' && next.type === 'assistant.message') {
          gapType = 'llm-generation';
          const outputLength = (next.data?.content || '').length;
          description = `LLM generating response (${outputLength} chars output)`;
        }

        // assistant.turn_start → first tool (generation before tool call)
        else if (current.type === 'assistant.turn_start' && next.type === 'tool.execution_start') {
          gapType = 'llm-generation';
          const toolName = next.data?.toolName || 'unknown';
          description = `LLM deciding to call ${toolName}`;
        }

        // assistant.message → assistant.turn_start (thinking between turns)
        else if (current.type === 'assistant.message' && next.type === 'assistant.turn_start') {
          gapType = 'turn-gap';
          description = 'Gap between assistant response and next turn';
        }

        // tool.execution_complete → next event (post-processing)
        else if (current.type === 'tool.execution_complete' && duration > 500) {
          gapType = 'post-tool';
          const toolName = current.data?.toolName || 'unknown';
          description = `Processing ${toolName} result`;
        }

        // Large gaps between any events
        else if (duration > 5000) {
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

    // Time breakdown: user thinking vs agent working
    // "User thinking" = gaps where the agent has finished and is waiting for the next user message
    // "Agent working" = totalDuration - userThinkingTime
    const timeBreakdown = computed(() => {
      const sorted = sortedEvents.value;
      let userThinkingTime = 0;

      for (let i = 0; i < sorted.length - 1; i++) {
        const current = sorted[i];
        const next = sorted[i + 1];

        // User thinking = from any non-user event to the next user.message
        // This captures when the agent is done and waiting for the user to type
        if (next.type === 'user.message' && current.type !== 'user.message') {
          const gap = new Date(next.timestamp).getTime() - new Date(current.timestamp).getTime();
          if (gap > 1000) { // Only count gaps > 1s as intentional user thinking
            userThinkingTime += gap;
          }
        }
      }

      const total = totalDuration.value || 0;
      const agentWorkingTime = Math.max(total - userThinkingTime, 0);
      // LLM time = agent working time minus tool wall-clock time
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

    // ── VS Code Session Detection ──
    const isVSCodeSession = computed(() => {
      // Detect VS Code sessions: they have events with data.source === 'vscode'
      // OR they have assistant.message events with data.subAgentName but no subagent.started events
      const sorted = sortedEvents.value;
      const hasVSCodeSource = sorted.some(ev => ev.data?.source === 'vscode');
      if (hasVSCodeSource) return true;

      // Alternative check: has subAgentName but no subagent events
      const hasSubAgentName = sorted.some(ev =>
        ev.type === 'assistant.message' && ev.data?.subAgentName
      );
      const hasSubagentEvents = sorted.some(ev =>
        ev.type === 'subagent.started' || ev.type === 'subagent.completed' || ev.type === 'subagent.failed'
      );
      return hasSubAgentName && !hasSubagentEvents;
    });

    // ── VS Code Subagents ──
    const vsCodeSubagents = computed(() => {
      if (!isVSCodeSession.value) return [];

      const sorted = sortedEvents.value;
      const subagentMap = new Map(); // subAgentId -> { events, toolCount, firstIndex, status, name }

      for (let i = 0; i < sorted.length; i++) {
        const ev = sorted[i];
        if (ev.type === 'assistant.message' && ev.data?.subAgentName) {
          const id = ev.data.subAgentId || ev.data.subAgentName;
          if (!subagentMap.has(id)) {
            subagentMap.set(id, {
              name: ev.data.subAgentName,
              events: [],
              toolCount: 0,
              firstIndex: i, // use array index as stable position
              status: 'completed',
              subAgentId: ev.data.subAgentId
            });
          }
          const entry = subagentMap.get(id);
          entry.events.push(ev);

          // Count tools
          if (ev.data.tools && Array.isArray(ev.data.tools)) {
            entry.toolCount += ev.data.tools.length;
          }

          // Update status if there are errors
          if (ev.data.error || ev.data.status === 'error') {
            entry.status = 'failed';
          }
        }
      }

      // Convert to array and sort by firstIndex
      return Array.from(subagentMap.values()).sort((a, b) => a.firstIndex - b.firstIndex);
    });

    // ── Unified Timeline Items ──
    const unifiedTimelineItems = computed(() => {
      const items = [];
      const groups = groupedTurns.value;
      const agents = subagentAnalysis.value;
      const sorted = sortedEvents.value;

      // Check if this is a VS Code session and use sequence-based layout
      if (isVSCodeSession.value) {
        const vsAgents = vsCodeSubagents.value;

        // Collect user messages with their array index positions
        const userMessages = [];
        for (let i = 0; i < sorted.length; i++) {
          if (sorted[i].type === 'user.message') {
            userMessages.push({ event: sorted[i], sortedIndex: i });
          }
        }

        if (userMessages.length > 0 && vsAgents.length > 0) {
          // Build user-req groups: each user message owns the subagents that follow it
          // until the next user message (using sorted array indices)
          for (let ui = 0; ui < userMessages.length; ui++) {
            const { event: userMsg, sortedIndex: userIdx } = userMessages[ui];
            const nextIdx = userMessages[ui + 1] ? userMessages[ui + 1].sortedIndex : Infinity;

            // Find subagents belonging to this user request (by sorted array index)
            const reqAgents = vsAgents.filter(sa =>
              sa.firstIndex >= userIdx && sa.firstIndex < nextIdx
            );

            // Calculate total tool count for this user request
            const totalTools = reqAgents.reduce((s, a) => s + a.toolCount, 0);

            const msg = userMsg.data?.message || userMsg.data?.content || '';

            // Push user-req header
            items.push({
              rowType: 'user-req',
              userReqNumber: ui + 1,
              message: typeof msg === 'string' ? msg.substring(0, 120) : String(msg).substring(0, 120),
              toolCount: totalTools,
              sequenceIndex: userIdx,
              isSequenceEstimated: true,
              duration: totalTools,
            });

            // Push subagent rows under this user request
            for (const vsAgent of reqAgents) {
              items.push({
                rowType: 'subagent',
                itemType: 'subagent',
                name: vsAgent.name,
                status: vsAgent.status,
                toolCount: vsAgent.toolCount,
                sequenceIndex: vsAgent.firstIndex,
                isSequenceEstimated: true,
                duration: vsAgent.toolCount,
                indented: true,
              });
            }
          }
        } else if (vsAgents.length > 0) {
          // No user messages, just show subagents
          for (const vsAgent of vsAgents) {
            items.push({
              rowType: 'subagent',
              itemType: 'subagent',
              name: vsAgent.name,
              status: vsAgent.status,
              toolCount: vsAgent.toolCount,
              sequenceIndex: vsAgent.firstIndex,
              isSequenceEstimated: true,
              duration: vsAgent.toolCount,
            });
          }
        }
        return items;
      }

      // Original Copilot CLI timeline logic
      if (groups.length) {
        for (let gi = 0; gi < groups.length; gi++) {
          const group = groups[gi];
          const turns = group.turns;
          if (!turns.length) continue;

          const reqStart = new Date(turns[0].startTime).getTime();
          const reqEnd = new Date(turns[turns.length - 1].endTime).getTime();

          // 1. Push user-req header row
          items.push({
            rowType: 'user-req',
            userReqNumber: group.userReqNumber,
            message: group.message,
            startTime: turns[0].startTime,
            endTime: turns[turns.length - 1].endTime,
            duration: reqEnd - reqStart,
          });

          // 2. Find subagents within this UserReq time range
          const reqAgents = agents.filter(sa => {
            if (!sa.startTime) return false;
            const saStart = new Date(sa.startTime).getTime();
            return saStart >= reqStart && saStart <= reqEnd;
          });

          if (reqAgents.length) {
            // Build subagent + gap items scoped to this UserReq
            for (let i = 0; i < reqAgents.length; i++) {
              const sa = reqAgents[i];

              // Gap before first subagent (from reqStart) or between subagents
              const gapStart = i === 0
                ? reqStart
                : new Date(reqAgents[i - 1].endTime).getTime();
              const gapEnd = new Date(sa.startTime).getTime();

              if (gapEnd - gapStart > 500) {
                const agentOp = buildAgentOpItem(sorted, gapStart, gapEnd);
                agentOp.rowType = 'main-agent';
                items.push(agentOp);
              }

              // Add subagent
              items.push({
                ...sa,
                rowType: 'subagent',
                itemType: 'subagent',
              });

              // Gap after last subagent to reqEnd
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
            // No subagents — show single Main Agent bar spanning entire UserReq
            if (reqEnd - reqStart > 0) {
              const agentOp = buildAgentOpItem(sorted, reqStart, reqEnd);
              agentOp.rowType = 'main-agent';
              items.push(agentOp);
            }
          }
        }
      } else if (subagentTimelineItems.value.length) {
        // No UserReq groups, but subagents exist — flat fallback
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

    // ── VS Code Sequence-based positioning ──
    const ganttSequencePosition = (item) => {
      const items = unifiedTimelineItems.value;
      if (items.length === 0) return { left: '0%', width: '0%' };

      // For user-req rows, span across all its child subagent rows
      if (item.rowType === 'user-req') {
        const idx = items.findIndex(it => it === item);
        if (idx === -1) return { left: '0%', width: '0%' };

        // Find child subagents (indented rows immediately following this user-req)
        const children = [];
        for (let i = idx + 1; i < items.length; i++) {
          if (items[i].rowType === 'user-req') break; // next user-req
          if (items[i].rowType === 'subagent') children.push(items[i]);
        }
        if (children.length === 0) {
          // No subagents — position this user-req at the end of previous subagents
          // by finding cumulative tool count up to this point
          const subagentItems = items.filter(it => it.rowType !== 'user-req');
          const totalToolCount = subagentItems.reduce((sum, it) => sum + (it.toolCount || 0), 0);
          if (totalToolCount === 0) return { left: '0%', width: '0%' };
          // Sum tools of all subagents before this user-req in the items array
          let cumTools = 0;
          for (let i = 0; i < idx; i++) {
            if (items[i].rowType === 'subagent') cumTools += (items[i].toolCount || 0);
          }
          const leftPct = (cumTools / totalToolCount) * 100;
          // Minimal width bar (at least 1%)
          return { left: leftPct + '%', width: Math.max(1, (1 / totalToolCount) * 100) + '%' };
        }

        const firstPos = ganttSequencePosition(children[0]);
        const lastPos = ganttSequencePosition(children[children.length - 1]);
        const startPct = parseFloat(firstPos.left);
        const endPct = parseFloat(lastPos.left) + parseFloat(lastPos.width);
        return {
          left: startPct + '%',
          width: (endPct - startPct) + '%'
        };
      }

      // Find index of this item
      const idx = items.findIndex(it => it === item);
      if (idx === -1) return { left: '0%', width: '0%' };

      // Calculate total tool count across subagent items only (exclude user-req)
      const subagentItems = items.filter(it => it.rowType !== 'user-req');
      const totalToolCount = subagentItems.reduce((sum, it) => sum + (it.toolCount || 0), 0);
      if (totalToolCount === 0) return { left: '0%', width: '0%' };

      // Calculate cumulative tool count up to this item (among subagent items only)
      const subIdx = subagentItems.findIndex(it => it === item);
      if (subIdx === -1) return { left: '0%', width: '0%' };

      let cumulativeToolCount = 0;
      for (let i = 0; i < subIdx; i++) {
        cumulativeToolCount += subagentItems[i].toolCount || 0;
      }

      // Position based on sequence
      const left = (cumulativeToolCount / totalToolCount) * 100;

      // Width based on tool count with minimum width
      const itemToolCount = item.toolCount || 0;
      const width = Math.max((itemToolCount / totalToolCount) * 100, 2); // Minimum 2% width

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

    // ── Load events ──
    onMounted(async () => {
      try {
        const resp = await fetch('/api/sessions/' + sessionId.value + '/events');
        if (!resp.ok) throw new Error('Failed to load events: ' + resp.statusText);
        const data = await resp.json();
        console.log('[TIME-ANALYZE] Loaded events:', data.length);
        console.log('[TIME-ANALYZE] Event types:', [...new Set(data.map(e => e.type))]);
        console.log('[TIME-ANALYZE] Turn starts:', data.filter(e => e.type === 'assistant.turn_start').length);
        console.log('[TIME-ANALYZE] User messages:', data.filter(e => e.type === 'user.message').length);
        events.value = data.sort((a, b) => {
          const timeA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
          const timeB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
          if (timeA !== timeB) return timeA - timeB;
          return (a._fileIndex ?? 0) - (b._fileIndex ?? 0);
        });
        console.log('[TIME-ANALYZE] Events set, length:', events.value.length);
      } catch (err) {
        console.error('[TIME-ANALYZE] Error loading events:', err);
        error.value = err.message;
      } finally {
        loading.value = false;
      }
    });

    // ── Copilot Insight ──
    const insightStatus = ref('not_started'); // completed | generating | timeout | not_started
    const insightLastUpdate = ref(null);
    const insightStartedAt = ref(null);
    const insightAgeMs = ref(0);
    let pollInterval = null;

    const renderedInsight = computed(() => {
      if (!insightReport.value) return '';
      return marked.parse(insightReport.value);
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
          // Auto-scroll log to bottom
          Vue.nextTick(() => {
            const el = document.getElementById('insight-log');
            if (el) el.scrollTop = el.scrollHeight;
          });
        } else if (data.status === 'timeout') {
          insightLog.value = data.log || null;
          insightStartedAt.value = data.startedAt;
          insightLastUpdate.value = data.lastUpdate;
          insightAgeMs.value = data.ageMs;
          // Keep polling — the process may still finish and write the report
          startPolling();
        }
      } catch (err) {
        console.error('Failed to check insight:', err);
      }
    };

    const startPolling = () => {
      stopPolling();
      pollInterval = setInterval(checkExistingInsight, 2000); // Poll every 2 seconds
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
      formatDuration, formatTime, formatDateTime,
      sessionStart, sessionEnd, totalDuration,
      subagentAnalysis, maxSubagentDuration, subagentTimelineItems, subagentStats,
      EVENT_MARKER_CATEGORIES, showMarkerLegend,
      copyLabel, copyTimelineMarkdown,
      ganttCrosshairX, ganttCrosshairTime, onGanttMouseMove, onGanttMouseLeave,
      turnAnalysis, maxTurnDuration, groupedTurns,
      unifiedTimelineItems,
      toolAnalysis, sortedToolAnalysis, maxToolDuration,
      fileOperations, fileStats,
      toolTimeByCategory, maxCategoryTime,
      totalToolTime, totalToolCount, avgToolDuration, longestTool,
      successRate, errorCount, timeBreakdown,
      gapAnalysis, maxGapDuration, gapStats,
      ganttPosition, ganttSequencePosition, toggleSort, sortIcon,
      getToolBadgeClass, getOpBadgeClass,
      isVSCodeSession, vsCodeSubagents
    };
  },

  template: `
    <div v-if="loading" class="empty-state" style="padding: 60px;">
      ⏳ Loading events...
    </div>

    <div v-else-if="error" class="empty-state" style="padding: 60px; color: #f85149;">
      ❌ {{ error }}
    </div>

    <div v-else>
      <!-- Summary Cards -->
      <div class="summary-grid">
        <div class="summary-card" title="Wall-clock time from first event to last event in this session.">
          <div class="summary-card-label">Total Duration</div>
          <div class="summary-card-value">{{ formatDuration(totalDuration) }}</div>
          <div class="summary-card-sub" v-if="sessionStart" style="margin-top: 2px; font-size: 10px; opacity: 0.7;">
            {{ formatDateTime(sessionStart) }} → {{ formatDateTime(sessionEnd) }}
          </div>
        </div>
        <div class="summary-card" title="Number of user messages that triggered agent work. Each request may involve multiple LLM turns.">
          <div class="summary-card-label">User Requests</div>
          <div class="summary-card-value">{{ groupedTurns.length }}</div>
          <div class="summary-card-sub">{{ turnAnalysis.length }} turn{{ turnAnalysis.length !== 1 ? 's' : '' }}</div>
        </div>
        <div class="summary-card" title="Total tool executions (Read, Write, Edit, Bash, Grep, etc.) across the entire session, including subagent tools.">
          <div class="summary-card-label">Tool Calls</div>
          <div class="summary-card-value">{{ totalToolCount }}</div>
          <div class="summary-card-sub">
            <span :style="{ color: successRate >= 95 ? '#3fb950' : successRate >= 80 ? '#d29922' : '#f85149' }">{{ successRate }}%</span> success
            <span v-if="errorCount > 0" style="color: #f85149;"> · {{ errorCount }} error{{ errorCount !== 1 ? 's' : '' }}</span>
          </div>
        </div>
        <div class="summary-card" title="Spawned subagents (via Task tool). Shows completed/failed/incomplete counts, total wall-clock time, and tool calls attributed to subagents.">
          <div class="summary-card-label">Sub-Agents</div>
          <div class="summary-card-value">{{ subagentAnalysis.length || vsCodeSubagents.length }}</div>
          <div class="summary-card-sub" v-if="subagentAnalysis.length > 0">
            <span :style="{ color: subagentStats.successRate >= 95 ? '#3fb950' : subagentStats.successRate >= 80 ? '#d29922' : '#f85149' }">{{ subagentStats.completed }}✓</span>
            <span v-if="subagentStats.failed > 0" style="color: #f85149;"> · {{ subagentStats.failed }}✗</span>
            <span v-if="subagentStats.incomplete > 0" style="color: #d29922;"> · {{ subagentStats.incomplete }}⏳</span>
            · {{ formatDuration(subagentStats.totalTime) }}
            · {{ subagentStats.totalTools }} tools
          </div>
          <div class="summary-card-sub" v-else-if="vsCodeSubagents.length > 0">
            <span style="color: #3fb950;">{{ vsCodeSubagents.length }}✓</span>
            · {{ vsCodeSubagents.reduce((s, a) => s + a.toolCount, 0) }} tools
          </div>
        </div>
        <div class="summary-card" title="Estimated LLM reasoning time (total duration minus tool execution and user thinking time). Breakdown shows LLM percentage, tool wall-clock time, and user idle time.">
          <div class="summary-card-label">Time Breakdown</div>
          <div class="summary-card-value">{{ formatDuration(timeBreakdown.llmTime) }} <span style="font-size: 14px; opacity: 0.6;">({{ timeBreakdown.llmPct }}% LLM Reasoning)</span></div>
          <div class="summary-card-sub">
            Tools {{ formatDuration(totalToolTime) }} ({{ timeBreakdown.toolPct }}%)
            <span v-if="timeBreakdown.userThinkingTime > 1000"> · User {{ formatDuration(timeBreakdown.userThinkingTime) }} ({{ timeBreakdown.userThinkingPct }}%)</span>
          </div>
        </div>
        <div class="summary-card" title="File system operations: reads (Read/Glob), edits (Edit), writes (Write), and searches (Grep).">
          <div class="summary-card-label">File Operations</div>
          <div class="summary-card-value">{{ fileStats.totalOps }}</div>
          <div class="summary-card-sub">
            {{ fileStats.reads }} reads · {{ fileStats.edits }} edits · {{ fileStats.writes }} writes · {{ fileStats.searches }} searches
          </div>
        </div>
      </div>

      <!-- Tabs -->
      <div class="tabs">
        <button :class="['tab', { active: activeTab === 'timeline' }]" @click="activeTab = 'timeline'; trackClick && trackClick('TimeAnalysisInteraction', { interactionType: 'tab-timeline', sessionId: window.__PAGE_DATA.sessionId })">
          📊 Timeline
        </button>
        <button :class="['tab', { active: activeTab === 'insight' }]" @click="activeTab = 'insight'; trackClick && trackClick('TimeAnalysisInteraction', { interactionType: 'tab-insight', sessionId: window.__PAGE_DATA.sessionId })">
          💡 Agent Review
        </button>
      </div>

      <!-- ═══ Unified Timeline Tab ═══ -->
      <div v-if="activeTab === 'timeline'" class="section">
        <div v-if="error" class="empty-state" style="color: #f85149;">
          Error loading timeline: {{ error }}
        </div>
        <div v-else-if="!unifiedTimelineItems.length" class="empty-state">
          No timeline data found in this session.
        </div>
        <div v-else>
          <!-- Section A: Gantt Chart -->
          <div class="section-title" style="display: flex; align-items: center;">
            Timeline
            <button class="legend-toggle-btn" @click="showMarkerLegend = !showMarkerLegend; trackClick && trackClick('TimeAnalysisInteraction', { interactionType: 'toggle-legend', sessionId: window.__PAGE_DATA.sessionId })">
              {{ showMarkerLegend ? 'Hide Legend' : 'Show Legend' }}
            </button>
            <button class="legend-toggle-btn" @click="copyTimelineMarkdown; trackClick && trackClick('TimeAnalysisInteraction', { interactionType: 'copy-timeline', sessionId: window.__PAGE_DATA.sessionId })">
              {{ copyLabel }}
            </button>
          </div>

          <!-- Event Legend -->
          <div v-show="showMarkerLegend" class="event-legend">
            <div class="event-legend-item">
              <span class="event-legend-swatch" style="background: rgba(88, 166, 255, 0.5);"></span>
              <span>User Request</span>
            </div>
            <div class="event-legend-item">
              <span class="event-legend-swatch" style="background: rgba(63, 185, 80, 0.8);"></span>
              <span>Sub-Agent</span>
            </div>
            <div class="event-legend-item">
              <span class="event-legend-swatch" style="background: rgba(139, 148, 158, 0.3); border: 1px dashed rgba(139, 148, 158, 0.5);"></span>
              <span>Main Agent</span>
            </div>
            <div class="event-legend-item">
              <span class="event-legend-swatch" style="background: #d29922;"></span>
              <span>Tool (no errors)</span>
            </div>
            <div class="event-legend-item">
              <span class="event-legend-swatch" style="background: linear-gradient(to right, #d29922, #f85149);"></span>
              <span>Tool (error gradient)</span>
            </div>
            <div class="event-legend-item">
              <span class="event-legend-swatch" style="background: #f85149;"></span>
              <span>Tool Error (100%)</span>
            </div>
            <template v-for="(cat, type) in EVENT_MARKER_CATEGORIES" :key="type">
              <div v-if="type && !type.startsWith('tool.')" class="event-legend-item">
                <span class="event-legend-swatch" :style="{ background: cat.color, borderRadius: cat.shape === 'circle' ? '50%' : cat.shape === 'diamond' ? '1px' : '2px', transform: cat.shape === 'diamond' ? 'rotate(45deg)' : 'none' }"></span>
                <span>{{ cat.label }}</span>
              </div>
            </template>
          </div>

          <!-- VS Code Session Banner -->
          <div v-if="isVSCodeSession" style="
            background: rgba(88, 166, 255, 0.1);
            border: 1px solid rgba(88, 166, 255, 0.3);
            border-radius: 6px;
            padding: 12px 16px;
            margin-bottom: 16px;
            display: flex;
            align-items: center;
            gap: 8px;
            color: #58a6ff;
            font-size: 13px;
          ">
            <span style="font-size: 16px;">ⓘ</span>
            <span>Sequence layout — bar widths represent tool count, not elapsed time</span>
          </div>

          <div class="gantt-container" @mousemove="onGanttMouseMove" @mouseleave="onGanttMouseLeave">
            <!-- Crosshair -->
            <div v-if="ganttCrosshairX !== null" class="gantt-crosshair" :style="{ left: ganttCrosshairX + 'px' }">
              <div class="gantt-crosshair-label">{{ ganttCrosshairTime }}</div>
            </div>
            <template v-for="(item, idx) in unifiedTimelineItems" :key="'utl-' + idx">

              <!-- Divider row -->
              <div v-if="item.rowType === 'divider'" class="gantt-divider">
                Tool Summary
              </div>

              <!-- User Request row -->
              <div v-else-if="item.rowType === 'user-req'" class="gantt-row">
                <div class="gantt-label user-req" :title="item.message || 'No message'">
                  <span class="user-req-badge">UserReq {{ item.userReqNumber }}</span>
                  <span class="user-req-msg">{{ (item.message || '').substring(0, 40) }}{{ (item.message || '').length > 40 ? '...' : '' }}</span>
                </div>
                <div class="gantt-bar-area">
                  <div
                    class="gantt-bar user-req"
                    :style="item.isSequenceEstimated ? ganttSequencePosition(item) : ganttPosition(item.startTime, item.endTime)"
                    :title="item.isSequenceEstimated ? ('UserReq ' + item.userReqNumber + ' — ' + item.toolCount + ' tools') : ('UserReq ' + item.userReqNumber + ' — ' + formatDuration(item.duration))"
                  >
                    {{ item.isSequenceEstimated ? (item.toolCount + ' tools') : formatDuration(item.duration) }}
                  </div>
                </div>
              </div>

              <!-- Sub-Agent row (indented for CLI, not indented for VS Code) -->
              <div v-else-if="item.rowType === 'subagent'" :class="['gantt-row', item.indented ? 'indented' : (item.isSequenceEstimated ? '' : 'indented')]">
                <div class="gantt-label" :title="item.name">
                  <a
                    :href="'/session/' + sessionId + '?eventType=subagent.started&eventName=' + encodeURIComponent(item.name) + '&eventTimestamp=' + encodeURIComponent(item.startTime || '')"
                    class="subagent-link"
                    :title="'View events from here'"
                  >
                    <span :style="{ color: item.status === 'completed' ? '#3fb950' : item.status === 'failed' ? '#f85149' : '#d29922' }">
                      {{ item.status === 'completed' ? '✓' : item.status === 'failed' ? '✗' : '⏳' }}
                    </span>
                    {{ item.name }}
                  </a>
                </div>
                <div class="gantt-bar-area">
                  <div
                    :class="[
                      'gantt-bar',
                      item.isSequenceEstimated ? 'sequence-estimated' : '',
                      item.status === 'completed' ? 'subagent' : item.status === 'failed' ? 'subagent-failed' : 'subagent-incomplete'
                    ]"
                    :style="item.isSequenceEstimated ? ganttSequencePosition(item) : ganttPosition(item.startTime, item.endTime)"
                    :title="item.isSequenceEstimated ? (item.name + ' — ' + item.toolCount + ' tools') : (item.name + ' — ' + formatDuration(item.duration))"
                  >
                    {{ item.isSequenceEstimated ? (item.toolCount + ' tools') : formatDuration(item.duration) }}

                    <!-- Event markers (only for non-sequence bars) -->
                    <template v-if="!item.isSequenceEstimated && item.innerEventMarkers && item.innerEventMarkers.length">
                      <span
                        v-for="(marker, midx) in item.innerEventMarkers"
                        :key="'m-' + midx"
                        class="event-marker"
                        :style="{ left: marker.position + '%' }"
                      >
                        <template v-if="marker.shape === 'cluster'">
                          <span class="event-marker--cluster" :style="{ background: marker.color }">{{ marker.count }}</span>
                        </template>
                        <template v-else-if="marker.shape === 'circle'">
                          <span class="event-marker--circle" :style="{ background: marker.color }"></span>
                        </template>
                        <template v-else-if="marker.shape === 'diamond'">
                          <span class="event-marker--diamond" :style="{ background: marker.color }"></span>
                        </template>
                        <template v-else-if="marker.shape === 'square'">
                          <span class="event-marker--square" :style="{ background: marker.color }"></span>
                        </template>
                        <template v-else-if="marker.shape === 'triangle'">
                          <span class="event-marker--triangle" :style="{ color: marker.color }"></span>
                        </template>
                        <span class="event-marker-tooltip">
                          <template v-if="marker.shape === 'cluster'">{{ marker.count }} events: {{ marker.label }}</template>
                          <template v-else>{{ marker.label }}<span v-if="marker.toolName"> ({{ marker.toolName }})</span></template>
                        </span>
                      </span>
                    </template>
                  </div>
                </div>
              </div>

              <!-- Main Agent gap row (indented) -->
              <div v-else-if="item.rowType === 'main-agent'" class="gantt-row indented">
                <div class="gantt-label agent-op" :title="item.summary">
                  <span class="agent-op-icon">⚙</span>
                  <span>Main Agent</span>
                  <span class="agent-op-summary">{{ item.summary }}</span>
                </div>
                <div class="gantt-bar-area">
                  <div
                    class="gantt-bar agent-op"
                    :style="ganttPosition(item.startTime, item.endTime)"
                    :title="'Main Agent — ' + formatDuration(item.duration)"
                  >
                    {{ formatDuration(item.duration) }}

                    <!-- Event markers -->
                    <template v-if="item.innerEventMarkers && item.innerEventMarkers.length">
                      <span
                        v-for="(marker, midx) in item.innerEventMarkers"
                        :key="'m-' + midx"
                        class="event-marker"
                        :style="{ left: marker.position + '%' }"
                      >
                        <template v-if="marker.shape === 'cluster'">
                          <span class="event-marker--cluster" :style="{ background: marker.color }">{{ marker.count }}</span>
                        </template>
                        <template v-else-if="marker.shape === 'circle'">
                          <span class="event-marker--circle" :style="{ background: marker.color }"></span>
                        </template>
                        <template v-else-if="marker.shape === 'diamond'">
                          <span class="event-marker--diamond" :style="{ background: marker.color }"></span>
                        </template>
                        <template v-else-if="marker.shape === 'square'">
                          <span class="event-marker--square" :style="{ background: marker.color }"></span>
                        </template>
                        <template v-else-if="marker.shape === 'triangle'">
                          <span class="event-marker--triangle" :style="{ color: marker.color }"></span>
                        </template>
                        <span class="event-marker-tooltip">
                          <template v-if="marker.shape === 'cluster'">{{ marker.count }} events: {{ marker.label }}</template>
                          <template v-else>{{ marker.label }}<span v-if="marker.toolName"> ({{ marker.toolName }})</span></template>
                        </span>
                      </span>
                    </template>
                  </div>
                </div>
              </div>

            </template>

            <div class="gantt-time-axis">
              <span>{{ formatTime(events[0]?.timestamp) }}</span>
              <span>{{ formatTime(events[events.length-1]?.timestamp) }}</span>
            </div>
          </div>

          <!-- Tool Summary -->
          <div v-if="toolTimeByCategory.length" style="margin-top: 24px;">
            <h3 style="color: #e6edf3; font-size: 14px; margin-bottom: 12px;">🔧 Tool Summary</h3>
            <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 8px;">
              <div
                v-for="cat in toolTimeByCategory"
                :key="cat.category"
                style="background: #161b22; border: 1px solid #30363d; border-radius: 6px; padding: 10px 12px; display: flex; align-items: center; gap: 10px;"
              >
                <div style="flex: 1; min-width: 0;">
                  <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 4px;">
                    <span style="color: #d29922; font-weight: 500; font-size: 13px;">{{ cat.category }}</span>
                    <span style="color: #7d8590; font-size: 11px;">{{ cat.count }} call{{ cat.count !== 1 ? 's' : '' }}<span v-if="cat.errors" style="color: #f85149;"> · {{ cat.errors }} err</span></span>
                  </div>
                  <div style="background: #21262d; border-radius: 3px; height: 6px; overflow: hidden;">
                    <div :style="{ width: (cat.totalTime / maxCategoryTime * 100) + '%', height: '100%', background: 'rgba(158, 106, 3, 0.7)', borderRadius: '3px' }"></div>
                  </div>
                  <div style="color: #7d8590; font-size: 11px; margin-top: 3px;">{{ formatDuration(cat.totalTime) }}</div>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>

      <!-- ═══ Copilot Insight Tab ═══ -->
      <div v-if="activeTab === 'insight'" class="section">
        <!-- Error State -->
        <div v-if="insightError" class="empty-state" style="padding: 60px; color: #f85149;">
          ❌ {{ insightError }}
        </div>

        <!-- Generating State -->
        <div v-else-if="insightStatus === 'generating'" style="padding: 20px;">
          <div :style="{
            background: '#0d1117',
            border: '1px solid ' + (insightAgeMs > 300000 ? '#d29922' : '#30363d'),
            borderRadius: '6px',
            padding: '20px',
            marginBottom: '20px',
          }">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
              <div style="display: flex; align-items: center;">
                <span style="font-size: 24px; margin-right: 10px;">⏳</span>
                <div>
                  <div style="font-weight: 600; color: #58a6ff; margin-bottom: 5px;">
                    Generating Agent Review...
                  </div>
                  <div style="font-size: 13px; color: #7d8590;">
                    Started: {{ formatDateTime(insightStartedAt) }} •
                    Age: {{ Math.floor(insightAgeMs / 1000) }}s
                  </div>
                </div>
              </div>
              <button
                v-if="insightAgeMs > 300000"
                @click="regenerateInsight(); trackClick && trackClick('InsightRequested', { sessionId: window.__PAGE_DATA.sessionId, action: 'regenerate' })"
                style="
                  background: #d29922;
                  color: #fff;
                  border: none;
                  padding: 8px 16px;
                  border-radius: 6px;
                  font-size: 13px;
                  cursor: pointer;
                  font-weight: 500;
                  white-space: nowrap;
                "
                @mouseover="$event.target.style.background='#e3b341'"
                @mouseleave="$event.target.style.background='#d29922'"
              >
                🔄 Stop &amp; Retry
              </button>
            </div>
            <!-- Slow generation warning -->
            <div v-if="insightAgeMs > 300000" style="
              background: rgba(210, 153, 34, 0.1);
              border: 1px solid rgba(210, 153, 34, 0.3);
              border-radius: 6px;
              padding: 10px 14px;
              margin-bottom: 12px;
              font-size: 13px;
              color: #d29922;
            ">
              ⚠️ Generation is taking longer than 5 minutes. For large sessions this is normal — the agent needs to read and analyze all events. If it appears stuck, you can click <strong>Stop &amp; Retry</strong> to cancel and start fresh.
            </div>
            <div v-if="insightLog" id="insight-log" style="
              background: #161b22;
              border: 1px solid #30363d;
              border-radius: 6px;
              padding: 14px 16px;
              font-family: 'SF Mono', 'Monaco', 'Consolas', monospace;
              font-size: 12px;
              line-height: 1.6;
              color: #8b949e;
              white-space: pre-wrap;
              word-break: break-word;
              max-height: 400px;
              overflow-y: auto;
            ">{{ insightLog }}</div>
          </div>
        </div>

        <!-- Timeout State -->
        <div v-else-if="insightStatus === 'timeout'" style="padding: 20px;">
          <div style="
            background: #0d1117;
            border: 1px solid #d29922;
            border-radius: 6px;
            padding: 20px;
            margin-bottom: 20px;
          ">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
              <div style="display: flex; align-items: center;">
                <span style="font-size: 24px; margin-right: 10px;">⏳</span>
                <div>
                  <div style="font-weight: 600; color: #d29922; margin-bottom: 5px;">
                    Still generating... ({{ Math.floor(insightAgeMs / 1000 / 60) }}m elapsed)
                  </div>
                  <div style="font-size: 13px; color: #7d8590;">
                    Large sessions with sub-agents may take 10–15 minutes. Still polling for completion.
                  </div>
                </div>
              </div>
              <button
                @click="regenerateInsight"
                style="
                  background: #d29922;
                  color: #fff;
                  border: none;
                  padding: 8px 16px;
                  border-radius: 6px;
                  font-size: 13px;
                  cursor: pointer;
                  font-weight: 500;
                  white-space: nowrap;
                "
                @mouseover="$event.target.style.background='#e3b341'"
                @mouseleave="$event.target.style.background='#d29922'"
              >
                🔄 Stop &amp; Retry
              </button>
            </div>
            <div v-if="insightLog" style="
              background: #161b22;
              border: 1px solid #30363d;
              border-radius: 6px;
              padding: 14px 16px;
              font-family: 'SF Mono', 'Monaco', 'Consolas', monospace;
              font-size: 12px;
              line-height: 1.6;
              color: #8b949e;
              white-space: pre-wrap;
              word-break: break-word;
              max-height: 400px;
              overflow-y: auto;
            ">{{ insightLog }}</div>
          </div>
        </div>

        <!-- Not Started State -->
        <div v-else-if="insightStatus === 'not_started'" style="padding: 40px; text-align: center;">
          <p style="margin-bottom: 20px; color: #7d8590;">
            Generate an AI-powered quality & performance review of how the agent used its tools, prompts, and workflow in this session
          </p>
          <button
            @click="generateInsight(false); trackClick && trackClick('InsightRequested', { sessionId: window.__PAGE_DATA.sessionId })"
            :disabled="insightLoading"
            style="
              background: #238636;
              color: #fff;
              border: none;
              padding: 10px 20px;
              border-radius: 6px;
              font-size: 14px;
              cursor: pointer;
              font-weight: 500;
            "
            @mouseover="$event.target.style.background='#2ea043'"
            @mouseleave="$event.target.style.background='#238636'"
          >
            💡 Generate Agent Review
          </button>
          <p style="margin-top: 12px; font-size: 12px; color: #6e7681;">
            For large sessions this may take several minutes — you'll see a live progress log while the review is being generated.
          </p>
        </div>

        <!-- Completed State -->
        <div v-else-if="insightStatus === 'completed'" style="padding: 20px;">
          <div style="
            background: #161b22;
            border: 1px solid #30363d;
            border-radius: 6px;
            padding: 20px;
            margin-bottom: 20px;
          ">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
              <span style="color: #7d8590; font-size: 13px;">
                Generated: {{ formatDateTime(insightGeneratedAt) }}
              </span>
              <button
                @click="regenerateInsight"
                style="
                  background: transparent;
                  color: #58a6ff;
                  border: 1px solid #58a6ff;
                  padding: 5px 12px;
                  border-radius: 6px;
                  font-size: 12px;
                  cursor: pointer;
                "
                @mouseover="$event.target.style.background='rgba(88, 166, 255, 0.1)'"
                @mouseleave="$event.target.style.background='transparent'"
              >
                🔄 Regenerate
              </button>
            </div>
            <div v-html="renderedInsight" style="
              color: #c9d1d9;
              line-height: 1.6;
            "></div>
          </div>
        </div>
      </div>
    </div>
  `
});

// Global error handler
app.config.errorHandler = (err, instance, info) => {
  console.error('[Vue Error]', err, info);
  const errorDiv = document.createElement('div');
  errorDiv.style.cssText = 'position: fixed; top: 20px; left: 50%; transform: translateX(-50%); background: #f85149; color: white; padding: 20px; border-radius: 6px; z-index: 9999; max-width: 80%; font-family: monospace; font-size: 14px;';
  errorDiv.innerHTML = `<strong>Vue Error:</strong><br>${err.message}<br><br><small>${info}</small>`;
  document.body.appendChild(errorDiv);
};

app.mount('#app');
