import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue';
import DOMPurify from 'dompurify';
import { marked } from 'marked';

export function useInsight(sessionId, _source) {
  const insightReport = ref(null);
  const insightLog = ref(null);
  const insightLoading = ref(false);
  const insightError = ref(null);
  const insightGeneratedAt = ref(null);
  const insightStatus = ref('not_started');
  const insightLastUpdate = ref(null);
  const insightStartedAt = ref(null);
  const insightAgeMs = ref(0);
  let pollInterval = null;

  const renderedInsight = computed(() => {
    if (!insightReport.value) return '';
    const html = marked.parse(insightReport.value);
    return DOMPurify.sanitize(html);
  });

  const stopPolling = () => {
    if (pollInterval) {
      clearInterval(pollInterval);
      pollInterval = null;
    }
  };

  const checkExistingInsight = async () => {
    try {
      const resp = await fetch(`/api/${encodeURIComponent(_source.value)}/sessions/${sessionId.value}/insight`);
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

  const generateInsight = async (force = false) => {
    insightLoading.value = true;
    insightError.value = null;
    insightLog.value = null;

    try {
      const resp = await fetch(`/api/${encodeURIComponent(_source.value)}/sessions/${sessionId.value}/insight`, {
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

  onMounted(async () => {
    await checkExistingInsight();
  });

  onUnmounted(() => {
    stopPolling();
  });

  return {
    insightReport, insightLog, insightLoading, insightError, insightGeneratedAt,
    insightStatus, insightLastUpdate, insightStartedAt, insightAgeMs,
    renderedInsight, checkExistingInsight, generateInsight, regenerateInsight,
    startPolling, stopPolling,
  };
}
