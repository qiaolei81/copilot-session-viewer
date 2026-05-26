/**
 * Session export composable — download session as zip.
 */
import { ref } from 'vue';

export function useSessionExport(sessionId, source) {
  const exporting = ref(false);

  const exportSession = async () => {
    exporting.value = true;
    try {
      const response = await fetch(`/api/${encodeURIComponent(source.value)}/sessions/${sessionId.value}/export`);
      if (!response.ok) throw new Error('Share failed');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `session-${sessionId.value}.zip`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      alert('Failed to share session: ' + err.message);
    } finally {
      exporting.value = false;
    }
  };

  return {
    exporting,
    exportSession
  };
}
