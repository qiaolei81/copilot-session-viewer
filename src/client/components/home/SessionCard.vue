<template>
  <router-link :to="`/${urlSource}/session/${session.id}`" :class="['recent-item', { 'recent-item-wip': session.sessionStatus === 'wip' }]" class="block bg-[#161b22] border border-[#30363d] rounded-lg py-3 px-4 text-[#c9d1d9] no-underline transition-all min-h-[140px] overflow-hidden min-w-0">
    <div class="flex justify-between items-center font-mono text-[11px] text-[#6e7681] mb-3 tracking-tight opacity-70">
      <span class="overflow-hidden text-ellipsis whitespace-nowrap flex-1 min-w-0" :title="session.id">{{ session.id }}</span>
    </div>
    <div class="flex flex-wrap items-center justify-start gap-1 mt-1">
      <div class="flex flex-wrap gap-1">
        <span :class="['status-badge', session.sourceBadgeClass || 'source-copilot']" :title="session.sourceName || 'Copilot'">{{ session.sourceName || 'Copilot' }}</span>
        <span v-if="session.sessionStatus === 'wip'" class="status-badge wip" title="Session in progress">🔄 WIP</span>
        <span v-if="session.isImported" class="status-badge imported" title="Imported session">📥</span>
        <span v-if="session.hasInsight" class="status-badge insight" title="Has Agent Review">💡</span>
        <span v-if="session.selectedModel" :class="['status-badge', 'model', modelClass]" :title="`Model: ${session.selectedModel}`">{{ modelShort }}</span>
        <span v-if="session.source === 'modernize' && session.modernizeVersion" class="status-badge version" title="Modernize version">{{ session.modernizeVersion }}</span>
        <span v-else-if="session.copilotVersion" class="status-badge version" title="CLI version">{{ session.copilotVersion }}</span>
        <span v-if="session.agentName" class="status-badge agent" :title="`Agent: ${session.agentName}`">🤖 {{ session.agentName }}</span>
      </div>
      <div v-if="session.tags && session.tags.length > 0" class="flex flex-wrap gap-1">
        <span v-for="tag in session.tags" :key="tag" class="inline-block py-[3px] px-2 rounded-[10px] text-[11px] font-medium text-white" :style="{ backgroundColor: getTagColor(tag) }" :title="tag">{{ tag }}</span>
      </div>
    </div>
    <div v-if="hasSummary" class="text-[#e6edf3] text-[15px] font-medium leading-relaxed mb-3 break-words line-clamp-3 cursor-help" :title="session.summary" @mouseenter="$emit('summary-hover', $event)" @mousemove="$emit('summary-move', $event)" @mouseleave="$emit('summary-leave')" @touchstart="$emit('summary-touchstart', $event)">
{{ summaryOneLine }}
</div>
    <div v-else class="text-[#6e7681] text-[15px] font-medium leading-relaxed mb-3 break-words line-clamp-3 cursor-help italic">
No summary available
</div>
    <div class="h-px bg-[#21262d] my-3" />
    <div class="flex items-center gap-4 flex-wrap text-xs font-mono min-w-0">
      <div v-if="session.workspace && session.workspace.cwd" class="flex items-center gap-1.5 min-w-0 text-[#6e7681] basis-full" :title="session.workspace.cwd">
        <svg class="w-3.5 h-3.5 shrink-0 opacity-60" viewBox="0 0 16 16" fill="currentColor"><path d="M1.75 1A1.75 1.75 0 000 2.75v10.5C0 14.216.784 15 1.75 15h12.5A1.75 1.75 0 0016 13.25v-8.5A1.75 1.75 0 0014.25 3H7.5a.25.25 0 01-.2-.1l-.9-1.2C6.07 1.26 5.55 1 5 1H1.75z" /></svg>
        <span class="text-[#8b949e] break-words font-medium">{{ session.workspace.cwd }}</span>
      </div>
      <div class="flex items-center gap-1.5 min-w-0 text-[#6e7681]">
        <svg class="w-3.5 h-3.5 shrink-0 opacity-60" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Zm7-3.25v2.992l2.028.812a.75.75 0 0 1-.557 1.392l-2.5-1A.751.751 0 0 1 7 8.25v-3.5a.75.75 0 0 1 1.5 0Z" /></svg>
        <span class="text-[#8b949e] break-words">{{ createdAtStr }}</span>
      </div>
      <div v-if="session.duration" class="flex items-center gap-1.5 min-w-0 text-[#6e7681]">
        <svg class="w-3.5 h-3.5 shrink-0 opacity-60" viewBox="0 0 16 16" fill="currentColor"><path d="M0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8Zm8-6.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM7.25 12.5v-5A.75.75 0 0 1 8 6.75h2.5a.75.75 0 0 1 0 1.5H8.75v4.25a.75.75 0 0 1-1.5 0Z" /></svg>
        <span class="text-[#8b949e] break-words">{{ formatDuration(session.duration) }}</span>
      </div>
      <div class="flex items-center gap-1.5 min-w-0 text-[#6e7681]">
        <svg class="w-3.5 h-3.5 shrink-0 opacity-60" viewBox="0 0 16 16" fill="currentColor"><path d="M7.72.72a.75.75 0 0 1 1.06 0l1.5 1.5a.75.75 0 0 1-1.06 1.06l-.22-.22v1.69a.75.75 0 0 1-1.5 0V3.06l-.22.22a.75.75 0 0 1-1.06-1.06ZM2 7a.75.75 0 0 0 0 1.5h3.69l-.22.22a.75.75 0 1 0 1.06 1.06l1.5-1.5a.75.75 0 0 0 0-1.06l-1.5-1.5a.75.75 0 0 0-1.06 1.06l.22.22Zm8.53-.28a.75.75 0 0 0 0 1.06l1.5 1.5a.75.75 0 1 0 1.06-1.06l-.22-.22H16a.75.75 0 0 0 0-1.5h-3.13l.22-.22a.75.75 0 0 0-1.06-1.06ZM7.72 12.22a.75.75 0 0 1 1.06 0l1.5 1.5a.75.75 0 1 1-1.06 1.06l-.22-.22v1.69a.75.75 0 0 1-1.5 0v-1.69l-.22.22a.75.75 0 0 1-1.06-1.06Z" /></svg>
        <span class="text-[#8b949e] break-words">{{ session.eventCount || 0 }} events</span>
      </div>
    </div>
  </router-link>
</template>

<script setup>
import { computed } from 'vue';
import { toUrlSource } from '../../utils/sourceMapping.js';

const props = defineProps({
  session: { type: Object, required: true }
});

defineEmits(['summary-hover', 'summary-move', 'summary-leave', 'summary-touchstart']);

const urlSource = computed(() => toUrlSource(props.session.source || 'copilot'));

const hasSummary = computed(() => {
  const s = props.session.summary;
  return s && s !== 'No summary' && s !== 'Legacy session';
});

const summaryOneLine = computed(() => {
  return (props.session.summary || '').replace(/\n+/g, ' ');
});

const modelShort = computed(() => {
  if (!props.session.selectedModel) return '';
  return props.session.selectedModel.replace('claude-', '').replace('gpt-', '').replace('gemini-', '');
});

const modelClass = computed(() => {
  const m = props.session.selectedModel || '';
  if (m.includes('claude')) return 'model-claude';
  if (m.includes('gpt')) return 'model-gpt';
  if (m.includes('gemini')) return 'model-gemini';
  return 'model-other';
});

const createdAtStr = computed(() => {
  if (!props.session.createdAt) return 'unknown';
  return new Date(props.session.createdAt).toLocaleString('en-US', {
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false
  });
});

const tagColors = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444',
  '#8b5cf6', '#ec4899', '#06b6d4', '#f97316'
];

function getTagColor(tag) {
  let hash = 0;
  for (let i = 0; i < tag.length; i++) {
    hash = tag.charCodeAt(i) + ((hash << 5) - hash);
  }
  return tagColors[Math.abs(hash) % tagColors.length];
}

function formatDuration(ms) {
  if (!ms || ms < 0) return '—';
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}
</script>
