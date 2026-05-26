/**
 * Session formatting composable — markdown rendering, text formatting, search highlighting.
 */
import { marked } from 'marked';
import DOMPurify from 'dompurify';

export function useSessionFormatting() {
  const markdownCache = new Map();
  const MAX_CACHE_SIZE = 200;

  const formatTime = (timestamp) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`;
  };

  const formatToolTime = (timestamp) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}.${String(date.getMilliseconds()).padStart(3, '0')}`;
  };

  const formatDateTime = (timestamp) => {
    if (!timestamp) return 'N/A';
    return new Date(timestamp).toLocaleString();
  };

  const formatTokens = (num) => {
    if (!num || num === 0) return '0';
    if (num < 1000) return num.toString();
    return Math.floor(num / 1000) + 'K';
  };

  const formatDuration = (ms) => {
    if (!ms || ms === 0) return '0s';
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return (ms / 1000).toFixed(1) + 's';
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  };

  const formatCost = (cost) => {
    if (cost === undefined || cost === null) return '';
    return cost + ' premium';
  };

  const escapeHtml = (text) => {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  };

  const renderMarkdown = (text) => {
    if (!text) return '';
    if (markdownCache.has(text)) return markdownCache.get(text);
    try {
      const processedText = text
        .replace(/\\r\\n/g, '\n')
        .replace(/\\n/g, '\n')
        .replace(/\\t/g, '\t')
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, '\\');

      const purifyConfig = {
        ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'code', 'pre', 'a', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'hr', 'del', 'span', 'div', 'mark'],
        ALLOWED_ATTR: ['href', 'style', 'class'],
        ALLOW_DATA_ATTR: false,
        ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i
      };

      const frontmatterMatch = processedText.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
      if (frontmatterMatch) {
        const frontmatter = frontmatterMatch[1];
        const content = frontmatterMatch[2];
        const lines = frontmatter.split('\n');
        const pairs = [];
        let i = 0;
        while (i < lines.length) {
          const line = lines[i];
          if (!line.trim() || !line.includes(':')) { i++; continue; }
          const colonIndex = line.indexOf(':');
          const key = line.substring(0, colonIndex).trim();
          const rawVal = line.substring(colonIndex + 1).trim();
          if (rawVal === '|' || rawVal === '>') {
            const blockLines = [];
            i++;
            while (i < lines.length && (lines[i].startsWith('  ') || lines[i].startsWith('\t') || lines[i].trim() === '')) {
              blockLines.push(lines[i].trim());
              i++;
            }
            const joiner = rawVal === '>' ? ' ' : '\n';
            pairs.push({ key, value: blockLines.filter(l => l).join(joiner) });
          } else {
            pairs.push({ key, value: rawVal });
            i++;
          }
        }
        let tableHTML = '<table style="margin-bottom: 16px; border-collapse: collapse; width: 100%;"><tbody>';
        pairs.forEach(pair => {
          const sanitizedKey = DOMPurify.sanitize(pair.key, { ALLOWED_TAGS: [] });
          const sanitizedValue = DOMPurify.sanitize(pair.value, { ALLOWED_TAGS: [] });
          tableHTML += `<tr><td style="padding: 4px 12px; border: 1px solid #30363d; font-weight: 600; color: #7d8590;">${sanitizedKey}</td><td style="padding: 4px 12px; border: 1px solid #30363d;">${sanitizedValue}</td></tr>`;
        });
        tableHTML += '</tbody></table>';
        const markdownHTML = marked.parse(content);
        const sanitizedMarkdown = DOMPurify.sanitize(markdownHTML, purifyConfig);
        const result = tableHTML + sanitizedMarkdown;
        if (markdownCache.size >= MAX_CACHE_SIZE) markdownCache.delete(markdownCache.keys().next().value);
        markdownCache.set(text, result);
        return result;
      }

      const markdownHTML = marked.parse(processedText);
      const result = DOMPurify.sanitize(markdownHTML, purifyConfig);
      if (markdownCache.size >= MAX_CACHE_SIZE) markdownCache.delete(markdownCache.keys().next().value);
      markdownCache.set(text, result);
      return result;
    } catch (e) {
      return text;
    }
  };

  const highlightSearchText = (html, searchTerm) => {
    if (!searchTerm || !searchTerm.trim() || !html) return html;
    const term = searchTerm.trim();
    const escapedTerm = escapeHtml(term).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const temp = document.createElement('div');
    temp.innerHTML = html;
    const highlightTextNode = (node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent;
        const regex = new RegExp(`(${escapedTerm})`, 'gi');
        if (regex.test(text)) {
          const highlighted = text.replace(regex, '<mark class="search-highlight">$1</mark>');
          const span = document.createElement('span');
          span.innerHTML = highlighted;
          node.parentNode.replaceChild(span, node);
        }
      } else if (node.nodeType === Node.ELEMENT_NODE && node.tagName !== 'SCRIPT' && node.tagName !== 'STYLE') {
        Array.from(node.childNodes).forEach(highlightTextNode);
      }
    };
    Array.from(temp.childNodes).forEach(highlightTextNode);
    return temp.innerHTML;
  };

  const isContentTooLong = (text) => {
    if (!text) return false;
    return text.split('\n').length > 20 || text.length > 2000;
  };

  const truncateContent = (text) => {
    const lines = text.split('\n');
    if (lines.length <= 20) return text;
    return lines.slice(0, 20).join('\n') + '\n\n...';
  };

  const truncateText = (text, maxLen) => {
    if (!text) return '';
    if (text.length <= maxLen) return text;
    return text.substring(0, maxLen) + '…';
  };

  const clearMarkdownCache = () => markdownCache.clear();

  return {
    formatTime,
    formatToolTime,
    formatDateTime,
    formatTokens,
    formatDuration,
    formatCost,
    escapeHtml,
    renderMarkdown,
    highlightSearchText,
    isContentTooLong,
    truncateContent,
    truncateText,
    clearMarkdownCache
  };
}
