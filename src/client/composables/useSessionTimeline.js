import { computed } from 'vue';

export function useSessionTimeline(events) {
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

  const sortedEvents = computed(() => {
    return [...events.value].sort((a, b) => {
      const timeA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
      const timeB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
      if (timeA !== timeB) return timeA - timeB;
      return (a._fileIndex ?? 0) - (b._fileIndex ?? 0);
    });
  });

  return { sessionStart, sessionEnd, totalDuration, sortedEvents };
}
