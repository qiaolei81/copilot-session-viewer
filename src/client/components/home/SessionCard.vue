<template>
  <a :href="`/session/${session.id}`" :class="['recent-item', { 'recent-item-wip': session.sessionStatus === 'wip' }]">
    <div class="session-id">
      <span class="session-id-text" :title="session.id">{{ session.id }}</span>
    </div>
    <div class="session-badges-tags">
      <div class="session-badges">
        <span :class="['status-badge', session.sourceBadgeClass || 'source-copilot']" :title="session.sourceName || 'Copilot'">{{ session.sourceName || 'Copilot' }}</span>
        <span v-if="session.sessionStatus === 'wip'" class="status-badge wip" title="Session in progress">🔄 WIP</span>
        <span v-if="session.isImported" class="status-badge imported" title="Imported session">📥</span>
        <span v-if="session.hasInsight" class="status-badge insight" title="Has Agent Review">💡</span>
        <span v-if="session.selectedModel" :class="['status-badge', 'model', modelClass]" :title="`Model: ${session.selectedModel}`">{{ modelShort }}</span>
        <span v-if="session.source === 'modernize' && session.modernizeVersion" class="status-badge version" title="Modernize version">{{ session.modernizeVersion }}</span>
        <span v-else-if="session.copilotVersion" class="status-badge version" title="CLI version">{{ session.copilotVersion }}</span>
        <span v-if="session.agentName" class="status-badge agent" :title="`Agent: ${session.agentName}`">🤖 {{ session.agentName }}</span>
      </div>
      <div v-if="session.tags && session.tags.length > 0" class="session-tags">
        <span v-for="tag in session.tags" :key="tag" class="session-tag" :style="{ backgroundColor: getTagColor(tag) }" :title="tag">{{ tag }}</span>
      </div>
    </div>
    <div v-if="hasSummary" class="session-summary" :title="session.summary" @mouseenter="$emit('summary-hover', $event)" @mousemove="$emit('summary-move', $event)" @mouseleave="$emit('summary-leave')" @touchstart="$emit('summary-touchstart', $event)">{{ summaryOneLine }}</div>
    <div v-else class="session-summary" style="color: #6e7681; font-style: italic;">No summary available</div>
    <div class="session-divider"></div>
    <div class="session-info">
      <div v-if="session.workspace && session.workspace.cwd" class="session-info-item workspace" :title="session.workspace.cwd">
        <svg viewBox="0 0 16 16" fill="currentColor"><path d="M1.75 1A1.75 1.75 0 000 2.75v10.5C0 14.216.784 15 1.75 15h12.5A1.75 1.75 0 0016 13.25v-8.5A1.75 1.75 0 0014.25 3H7.5a.25.25 0 01-.2-.1l-.9-1.2C6.07 1.26 5.55 1 5 1H1.75z"></path></svg>
        <span class="session-info-value">{{ session.workspace.cwd }}</span>
      </div>
      <div class="session-info-item">
        <svg viewBox="0 0 16 16" fill="currentColor"><path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Zm7-3.25v2.992l2.028.812a.75.75 0 0 1-.557 1.392l-2.5-1A.751.751 0 0 1 7 8.25v-3.5a.75.75 0 0 1 1.5 0Z"></path></svg>
        <span class="session-info-value">{{ createdAtStr }}</span>
      </div>
      <div v-if="session.duration" class="session-info-item">
        <svg viewBox="0 0 16 16" fill="currentColor"><path d="M0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8Zm8-6.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM7.25 12.5v-5A.75.75 0 0 1 8 6.75h2.5a.75.75 0 0 1 0 1.5H8.75v4.25a.75.75 0 0 1-1.5 0Z"></path></svg>
        <span class="session-info-value">{{ formatDuration(session.duration) }}</span>
      </div>
      <div class="session-info-item">
        <svg viewBox="0 0 16 16" fill="currentColor"><path d="M7.72.72a.75.75 0 0 1 1.06 0l1.5 1.5a.75.75 0 0 1-1.06 1.06l-.22-.22v1.69a.75.75 0 0 1-1.5 0V3.06l-.22.22a.75.75 0 0 1-1.06-1.06ZM2 7a.75.75 0 0 0 0 1.5h3.69l-.22.22a.75.75 0 1 0 1.06 1.06l1.5-1.5a.75.75 0 0 0 0-1.06l-1.5-1.5a.75.75 0 0 0-1.06 1.06l.22.22Zm8.53-.28a.75.75 0 0 0 0 1.06l1.5 1.5a.75.75 0 1 0 1.06-1.06l-.22-.22H16a.75.75 0 0 0 0-1.5h-3.13l.22-.22a.75.75 0 0 0-1.06-1.06ZM7.72 12.22a.75.75 0 0 1 1.06 0l1.5 1.5a.75.75 0 1 1-1.06 1.06l-.22-.22v1.69a.75.75 0 0 1-1.5 0v-1.69l-.22.22a.75.75 0 0 1-1.06-1.06Z"></path></svg>
        <span class="session-info-value">{{ session.eventCount || 0 }} events</span>
      </div>
    </div>
  </a>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  session: { type: Object, required: true }
});

defineEmits(['summary-hover', 'summary-move', 'summary-leave', 'summary-touchstart']);

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

<style scoped>
.recent-item {
  background: #161b22;
  border: 1px solid #30363d;
  border-radius: 8px;
  padding: 12px 16px;
  color: #c9d1d9;
  text-decoration: none;
  transition: all 0.2s;
  display: block;
  min-height: 140px;
  height: auto;
  overflow: hidden;
  min-width: 0;
}
.recent-item:hover {
  border-color: #58a6ff;
  background: #1c2128;
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(88, 166, 255, 0.2);
}
.recent-item-wip {
  border-color: #d29922;
  border-left: 3px solid #d29922;
}
.recent-item-wip:hover {
  border-color: #e8b634;
  border-left-color: #e8b634;
}
.session-id {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-family: "SF Mono", Monaco, monospace;
  font-size: 11px;
  color: #6e7681;
  margin-bottom: 12px;
  letter-spacing: -0.02em;
  opacity: 0.7;
}
.session-id-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  min-width: 0;
}
.session-badges-tags {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-start;
  gap: 4px;
  margin-top: 4px;
}
.session-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.session-badges-tags .session-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 0;
  padding-top: 0;
  border-top: none;
}
.session-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid #21262d;
}
.session-tag {
  display: inline-block;
  padding: 3px 8px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 500;
  color: #fff;
}
.status-badge {
  display: inline-block;
  font-size: 14px;
  vertical-align: middle;
  opacity: 0.8;
  transition: opacity 0.2s;
}
.status-badge:hover {
  opacity: 1;
}
.status-badge.model {
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 11px;
  font-weight: 600;
  font-family: 'SF Mono', 'Monaco', 'Consolas', monospace;
}
.status-badge.model-claude {
  background: rgba(204, 120, 92, 0.15);
  color: #e8956f;
}
.status-badge.model-gpt {
  background: rgba(16, 163, 127, 0.15);
  color: #1ec99d;
}
.status-badge.model-gemini {
  background: rgba(66, 133, 244, 0.15);
  color: #5e9aff;
}
.status-badge.model-other {
  background: rgba(139, 92, 246, 0.15);
  color: #a78bfa;
}
.status-badge.version {
  padding: 2px 8px;
  background: rgba(234, 179, 8, 0.15);
  color: #fbbf24;
  border-radius: 12px;
  font-size: 11px;
  font-weight: 600;
  font-family: 'SF Mono', 'Monaco', 'Consolas', monospace;
}
.status-badge.wip {
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 11px;
  font-weight: 600;
  background: rgba(210, 153, 34, 0.2);
  color: #d29922;
  border: 1px solid rgba(210, 153, 34, 0.4);
}
.status-badge.source-copilot {
  padding: 2px 8px;
  background: rgba(88, 166, 255, 0.15);
  color: #58a6ff;
  border-radius: 12px;
  font-size: 11px;
  font-weight: 600;
  font-family: 'SF Mono', 'Monaco', 'Consolas', monospace;
}
.status-badge.source-claude {
  padding: 2px 8px;
  background: rgba(204, 120, 92, 0.15);
  color: #e8956f;
  border-radius: 12px;
  font-size: 11px;
  font-weight: 600;
  font-family: 'SF Mono', 'Monaco', 'Consolas', monospace;
}
.status-badge.source-pi-mono {
  padding: 2px 8px;
  background: rgba(138, 102, 204, 0.15);
  color: #a78bdb;
  border-radius: 12px;
  font-size: 11px;
  font-weight: 600;
  font-family: 'SF Mono', 'Monaco', 'Consolas', monospace;
}
.status-badge.source-vscode {
  padding: 2px 8px;
  background: rgba(0, 122, 204, 0.15);
  color: #4fc3f7;
  border-radius: 12px;
  font-size: 11px;
  font-weight: 600;
  font-family: 'SF Mono', 'Monaco', 'Consolas', monospace;
}
.status-badge.source-modernize {
  padding: 2px 8px;
  background: rgba(76, 175, 80, 0.15);
  color: #66bb6a;
  border-radius: 12px;
  font-size: 11px;
  font-weight: 600;
  font-family: 'SF Mono', 'Monaco', 'Consolas', monospace;
}
.session-summary {
  color: #e6edf3;
  font-size: 15px;
  font-weight: 500;
  line-height: 1.5;
  margin-bottom: 12px;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  word-break: break-word;
  overflow-wrap: anywhere;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  cursor: help;
}
.session-divider {
  height: 1px;
  background: #21262d;
  margin: 12px 0 10px 0;
}
.session-info {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
  font-size: 12px;
  font-family: "SF Mono", Monaco, monospace;
  min-width: 0;
}
.session-info-item {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  color: #6e7681;
}
.session-info-item svg {
  flex-shrink: 0;
  width: 14px;
  height: 14px;
  opacity: 0.6;
}
.session-info-value {
  color: #8b949e;
  word-break: break-word;
  overflow-wrap: anywhere;
}
.session-info-item.workspace {
  flex-basis: 100%;
  min-width: 0;
}
.session-info-item.workspace .session-info-value {
  font-weight: 500;
}
</style>
