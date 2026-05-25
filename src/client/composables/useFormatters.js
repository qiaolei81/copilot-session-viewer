/**
 * Formatting utilities extracted from time-analyze.js L199-231.
 */

export function formatDuration(ms) {
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
}

export function formatTokens(num) {
  if (!num || num === 0) return '0';
  if (num < 1000) return num.toString();
  return Math.floor(num / 1000) + 'K';
}

export function formatTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return String(d.getHours()).padStart(2, '0') + ':' +
    String(d.getMinutes()).padStart(2, '0') + ':' +
    String(d.getSeconds()).padStart(2, '0');
}

export function formatDateTime(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleString();
}

export function useFormatters() {
  return { formatDuration, formatTokens, formatTime, formatDateTime };
}
