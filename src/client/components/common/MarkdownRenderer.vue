<script setup>
import { computed } from 'vue'
import { marked } from 'marked'
import DOMPurify from 'dompurify'

const props = defineProps({
  content: { type: String, default: '' },
  searchQuery: { type: String, default: '' },
})

marked.setOptions({ breaks: true, gfm: true })

const purifyConfig = {
  ALLOWED_TAGS: [
    'p', 'br', 'strong', 'em', 'code', 'pre', 'a', 'ul', 'ol', 'li',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'table', 'thead',
    'tbody', 'tr', 'th', 'td', 'hr', 'del', 'span', 'div', 'mark',
  ],
  ALLOWED_ATTR: ['href', 'style', 'class'],
}

function renderMarkdown(text) {
  if (!text) return ''

  // Unescape common escape sequences
  const processed = text
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\')

  const html = marked.parse(processed)
  return DOMPurify.sanitize(html, purifyConfig)
}

function highlightSearchTerms(html, query) {
  if (!query || !html) return html
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const regex = new RegExp(`(${escaped})`, 'gi')
  return html.replace(/>([^<]+)</g, (match, textContent) => {
    return '>' + textContent.replace(regex, '<mark class="bg-yellow-500/30 text-inherit">$1</mark>') + '<'
  })
}

const renderedHtml = computed(() => {
  let html = renderMarkdown(props.content)
  if (props.searchQuery) {
    html = highlightSearchTerms(html, props.searchQuery)
  }
  return html
})
</script>

<template>
  <div class="markdown-body text-sm text-[#e6edf3] leading-relaxed" v-html="renderedHtml" />
</template>

<style scoped>
.markdown-body :deep(pre) {
  background: #161b22;
  border: 1px solid #30363d;
  border-radius: 6px;
  padding: 12px;
  overflow-x: auto;
}
.markdown-body :deep(code) {
  font-family: ui-monospace, monospace;
  font-size: 0.85em;
}
.markdown-body :deep(a) {
  color: #58a6ff;
}
.markdown-body :deep(blockquote) {
  border-left: 3px solid #30363d;
  padding-left: 12px;
  color: #8b949e;
}
</style>
