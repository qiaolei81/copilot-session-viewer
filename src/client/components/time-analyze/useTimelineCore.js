import { ref, computed, onMounted } from 'vue';

// ── Event marker categories ──
export const EVENT_MARKER_CATEGORIES = {
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
export const TRACKABLE_EVENT_TYPES = new Set(Object.keys(EVENT_MARKER_CATEGORIES));

export function useTimelineCore(sessionId, _source) {
  const events = ref([]);
  const loading = ref(true);
  const error = ref(null);

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

  const sortedEvents = computed(() => {
    return [...events.value].sort((a, b) => {
      const timeA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
      const timeB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
      if (timeA !== timeB) return timeA - timeB;
      return (a._fileIndex ?? 0) - (b._fileIndex ?? 0);
    });
  });

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

  onMounted(async () => {
    try {
      const sessionStore = (await import('../../stores/sessionStore.js')).useSessionStore();
      const data = await sessionStore.fetchEvents(sessionId.value, _source.value);
      events.value = data;
    } catch (err) {
      console.error('[TIME-ANALYZE] Error loading events:', err);
      error.value = err.message;
    } finally {
      loading.value = false;
    }
  });

  return {
    events, loading, error,
    sortedEvents, sessionStart, sessionEnd, totalDuration,
    ganttPosition,
    formatDuration, formatTime, formatDateTime, formatTokens, normalizeMessage,
    EVENT_MARKER_CATEGORIES, TRACKABLE_EVENT_TYPES,
  };
}
