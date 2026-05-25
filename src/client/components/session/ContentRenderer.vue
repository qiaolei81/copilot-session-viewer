<script setup>
import { computed } from 'vue'
import MarkdownRenderer from '../common/MarkdownRenderer.vue'

const props = defineProps({
  content: { type: String, default: '' },
  searchQuery: { type: String, default: '' },
  expanded: { type: Boolean, default: false },
  isReasoning: { type: Boolean, default: false },
})

const emit = defineEmits(['toggleExpand'])

const isContentTooLong = computed(() => {
  if (!props.content) return false
  const lineCount = props.content.split('\n').length
  return lineCount > 20 || props.content.length > 2000
})

const displayContent = computed(() => {
  if (!props.content) return ''
  if (props.expanded || !isContentTooLong.value) return props.content
  const lines = props.content.split('\n')
  if (lines.length <= 20) return props.content
  return lines.slice(0, 20).join('\n') + '\n\n...'
})
</script>

<template>
  <div :class="{ 'reasoning-text-content': isReasoning }">
    <MarkdownRenderer :content="displayContent" :searchQuery="searchQuery" />
    <div v-if="isContentTooLong" style="margin-top: 8px;">
      <button
        @click="emit('toggleExpand')"
        class="expand-btn"
      >
        {{ expanded ? 'Show less ▲' : 'Show more ▼' }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.expand-btn {
  background: none;
  border: 1px solid #30363d;
  color: #58a6ff;
  padding: 4px 12px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
}
.reasoning-text-content { color: #7d8590; }
.reasoning-text-content :deep(strong),
.reasoning-text-content :deep(em),
.reasoning-text-content :deep(h1),
.reasoning-text-content :deep(h2),
.reasoning-text-content :deep(h3),
.reasoning-text-content :deep(code),
.reasoning-text-content :deep(a) {
  color: #7d8590;
}
</style>
