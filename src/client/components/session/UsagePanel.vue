<script setup>
import { computed } from 'vue'

const props = defineProps({
  usage: { type: Object, default: null },
  toolCallingSummary: { type: Array, default: () => [] },
})

function formatTokens(num) {
  if (!num || num === 0) return '0'
  if (num < 1000) return num.toString()
  return Math.floor(num / 1000) + 'K'
}

function formatDuration(ms) {
  if (!ms || ms === 0) return '0s'
  const seconds = Math.floor(ms / 1000)
  if (seconds < 60) return (ms / 1000).toFixed(1) + 's'
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  return `${minutes}m ${remainingSeconds}s`
}

function formatCost(cost) {
  if (cost === undefined || cost === null) return ''
  return cost + ' premium'
}

const totalTokens = computed(() => {
  if (!props.usage?.modelMetrics) return 0
  let total = 0
  for (const model in props.usage.modelMetrics) {
    const u = props.usage.modelMetrics[model].usage
    if (u) total += (u.inputTokens || 0) + (u.outputTokens || 0)
  }
  return total
})

const totalRequests = computed(() => {
  if (!props.usage?.modelMetrics) return 0
  let total = 0
  for (const model in props.usage.modelMetrics) {
    total += props.usage.modelMetrics[model].requests?.count || 0
  }
  return total
})

const totalModels = computed(() => {
  if (!props.usage?.modelMetrics) return 0
  return Object.keys(props.usage.modelMetrics).length
})

function getCacheHitRatio(model) {
  const metrics = props.usage?.modelMetrics[model]
  if (!metrics?.usage) return null
  const u = metrics.usage
  const cacheRead = u.cacheReadTokens || 0
  const input = u.inputTokens || 0
  if (input + cacheRead === 0) return null
  return Math.round((cacheRead / (input + cacheRead)) * 100)
}

function getDisplayInputTokens(model) {
  const metrics = props.usage?.modelMetrics[model]
  if (!metrics?.usage) return 0
  const u = metrics.usage
  return u.inputTokens || 0
}
</script>

<template>
  <!-- Usage Section -->
  <div v-if="usage" class="sidebar-section">
    <div class="sidebar-section-title">Token Usage</div>
    <div class="usage-container">
      <div class="usage-summary">
        <div class="usage-summary-eyebrow">Overview</div>
        <div class="usage-summary-total">
          {{ formatTokens(totalTokens) }} <span class="usage-summary-total-unit">tokens</span>
        </div>
        <div class="usage-summary-caption">
          Usage captured across {{ totalModels }} model{{ totalModels === 1 ? '' : 's' }}
        </div>
        <div class="usage-summary-metrics">
          <div class="usage-metric-card usage-metric-card-summary">
            <span class="usage-metric-label">Requests</span>
            <span class="usage-metric-value">{{ totalRequests }} reqs</span>
          </div>
          <div class="usage-metric-card usage-metric-card-summary">
            <span class="usage-metric-label">Models</span>
            <span class="usage-metric-value">{{ totalModels }}</span>
          </div>
          <div class="usage-metric-card usage-metric-card-summary">
            <span class="usage-metric-label">API Time</span>
            <span class="usage-metric-value">{{ formatDuration(usage.totalApiDurationMs) }}</span>
          </div>
        </div>
      </div>

      <div class="usage-expanded">
        <!-- Model breakdown -->
        <div v-if="Object.keys(usage.modelMetrics || {}).length > 0" class="usage-section">
          <div class="usage-section-header">
            <div class="usage-section-title">Models</div>
            <div class="usage-section-badge">{{ totalModels }}</div>
          </div>
          <div class="usage-model-list">
            <div v-for="(metrics, model) in usage.modelMetrics" :key="model" class="usage-model">
              <div class="usage-model-header">
                <div class="usage-model-name" :title="model">{{ model }}</div>
                <div class="usage-model-meta">
                  <span class="usage-meta-pill">{{ metrics.requests?.count || 0 }} reqs</span>
                  <span v-if="metrics.requests?.cost" class="usage-meta-pill usage-meta-pill-premium">{{ formatCost(metrics.requests.cost) }}</span>
                  <span v-if="getCacheHitRatio(model) !== null" class="usage-meta-pill usage-meta-pill-cache">{{ getCacheHitRatio(model) }}% cache</span>
                </div>
              </div>
              <div v-if="metrics.usage" class="usage-metric-grid">
                <div class="usage-metric-card">
                  <span class="usage-metric-label">Input</span>
                  <span class="usage-metric-value">{{ formatTokens(getDisplayInputTokens(model)) }}</span>
                </div>
                <div class="usage-metric-card">
                  <span class="usage-metric-label">Output</span>
                  <span class="usage-metric-value">{{ formatTokens(metrics.usage.outputTokens || 0) }}</span>
                </div>
                <div v-if="metrics.usage?.cacheReadTokens" class="usage-metric-card">
                  <span class="usage-metric-label">Cache Read</span>
                  <span class="usage-metric-value">{{ formatTokens(metrics.usage.cacheReadTokens) }}</span>
                </div>
                <div v-if="metrics.usage?.cacheWriteTokens" class="usage-metric-card">
                  <span class="usage-metric-label">Cache Write</span>
                  <span class="usage-metric-value">{{ formatTokens(metrics.usage.cacheWriteTokens) }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Context window breakdown -->
        <div v-if="usage.currentTokens || usage.systemTokens || usage.conversationTokens || usage.toolDefinitionsTokens" class="usage-section">
          <div class="usage-section-header">
            <div class="usage-section-title">Context Window</div>
          </div>
          <div class="usage-metric-grid">
            <div v-if="usage.currentTokens" class="usage-metric-card">
              <span class="usage-metric-label">Current</span>
              <span class="usage-metric-value">{{ formatTokens(usage.currentTokens) }}</span>
            </div>
            <div v-if="usage.systemTokens" class="usage-metric-card">
              <span class="usage-metric-label">System</span>
              <span class="usage-metric-value">{{ formatTokens(usage.systemTokens) }}</span>
            </div>
            <div v-if="usage.conversationTokens" class="usage-metric-card">
              <span class="usage-metric-label">Conversation</span>
              <span class="usage-metric-value">{{ formatTokens(usage.conversationTokens) }}</span>
            </div>
            <div v-if="usage.toolDefinitionsTokens" class="usage-metric-card">
              <span class="usage-metric-label">Tools</span>
              <span class="usage-metric-value">{{ formatTokens(usage.toolDefinitionsTokens) }}</span>
            </div>
          </div>
        </div>

        <!-- Code changes -->
        <div v-if="usage.codeChanges && (usage.codeChanges.linesAdded > 0 || usage.codeChanges.linesRemoved > 0)" class="usage-section">
          <div class="usage-section-header">
            <div class="usage-section-title">Code Changes</div>
          </div>
          <div class="usage-metric-grid usage-metric-grid-compact">
            <div class="usage-metric-card">
              <span class="usage-metric-label">Added</span>
              <span class="usage-metric-value usage-metric-value-added">+{{ usage.codeChanges.linesAdded }}</span>
            </div>
            <div class="usage-metric-card">
              <span class="usage-metric-label">Removed</span>
              <span class="usage-metric-value usage-metric-value-removed">-{{ usage.codeChanges.linesRemoved }}</span>
            </div>
            <div class="usage-metric-card">
              <span class="usage-metric-label">Files</span>
              <span class="usage-metric-value">{{ usage.codeChanges.filesModified?.length || 0 }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Tool Calling Summary -->
  <div v-if="toolCallingSummary.length" class="sidebar-section">
    <div class="sidebar-section-title">Tool Calls</div>
    <div class="tool-summary-list">
      <div v-for="item in toolCallingSummary" :key="item.name" class="tool-summary-item">
        <div class="tool-summary-bar" :style="{ width: (item.count / toolCallingSummary[0].count * 100) + '%' }"></div>
        <span class="tool-summary-name" :title="item.name">{{ item.name }}</span>
        <span class="tool-summary-count">{{ item.count }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.sidebar-section { margin-bottom: 20px; }
.sidebar-section-title {
  font-size: 12px; font-weight: 600; color: #c9d1d9;
  margin-bottom: 12px; text-transform: uppercase; letter-spacing: 0.5px;
}
.usage-container { font-size: 12px; display: flex; flex-direction: column; gap: 12px; }
.usage-summary {
  padding: 14px;
  background: linear-gradient(180deg, rgba(88, 166, 255, 0.16) 0%, rgba(22, 27, 34, 0.94) 100%);
  border: 1px solid rgba(88, 166, 255, 0.22);
  border-radius: 10px; color: #c9d1d9;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
}
.usage-summary-eyebrow { font-size: 10px; font-weight: 700; color: #8b949e; text-transform: uppercase; letter-spacing: 0.7px; margin-bottom: 6px; }
.usage-summary-total { font-size: 24px; line-height: 1; font-weight: 700; color: #e6edf3; display: flex; align-items: baseline; gap: 6px; }
.usage-summary-total-unit { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: #8b949e; }
.usage-summary-caption { margin-top: 6px; font-size: 12px; color: #8b949e; }
.usage-summary-metrics { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; margin-top: 12px; }
.usage-expanded { display: flex; flex-direction: column; gap: 12px; }
.usage-section { padding: 12px; background: rgba(110, 118, 129, 0.05); border: 1px solid #30363d; border-radius: 10px; }
.usage-section-header { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 10px; }
.usage-section-title { font-size: 11px; font-weight: 600; color: #8b949e; text-transform: uppercase; letter-spacing: 0.5px; margin: 0; }
.usage-section-badge { display: inline-flex; align-items: center; justify-content: center; min-width: 24px; padding: 2px 8px; border-radius: 999px; background: rgba(88, 166, 255, 0.12); border: 1px solid rgba(88, 166, 255, 0.22); color: #79c0ff; font-size: 10px; font-weight: 700; }
.usage-model-list { display: flex; flex-direction: column; gap: 8px; }
.usage-model { padding: 10px; background: linear-gradient(180deg, rgba(13, 17, 23, 0.96) 0%, rgba(22, 27, 34, 0.96) 100%); border: 1px solid rgba(48, 54, 61, 0.9); border-radius: 8px; }
.usage-model-header { display: flex; flex-direction: column; align-items: stretch; gap: 8px; margin-bottom: 10px; }
.usage-model-name { display: block; max-width: 100%; font-size: 11px; font-weight: 600; line-height: 1.35; color: #79c0ff; font-family: 'SF Mono', 'Monaco', 'Consolas', monospace; white-space: nowrap; overflow-x: auto; overflow-y: hidden; scrollbar-width: thin; padding-bottom: 2px; }
.usage-model-meta { display: flex; flex-wrap: wrap; justify-content: flex-start; gap: 6px; }
.usage-meta-pill { display: inline-flex; align-items: center; padding: 2px 8px; border-radius: 999px; background: rgba(110, 118, 129, 0.12); border: 1px solid rgba(110, 118, 129, 0.2); color: #c9d1d9; font-size: 10px; font-weight: 600; }
.usage-meta-pill-premium { color: #d29922; border-color: rgba(210, 153, 34, 0.25); background: rgba(210, 153, 34, 0.12); }
.usage-meta-pill-cache { color: #3fb950; border-color: rgba(63, 185, 80, 0.25); background: rgba(63, 185, 80, 0.12); }
.usage-metric-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
.usage-metric-grid-compact { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.usage-metric-card { display: flex; flex-direction: column; gap: 4px; min-width: 0; padding: 9px 10px; border-radius: 8px; border: 1px solid rgba(48, 54, 61, 0.8); background: rgba(13, 17, 23, 0.5); }
.usage-metric-card-summary { background: rgba(13, 17, 23, 0.42); border-color: rgba(88, 166, 255, 0.14); }
.usage-metric-label { font-size: 10px; font-weight: 700; color: #8b949e; text-transform: uppercase; letter-spacing: 0.5px; }
.usage-metric-value { font-size: 14px; line-height: 1.2; font-weight: 700; color: #e6edf3; overflow-wrap: anywhere; }
.usage-metric-value-added { color: #3fb950; }
.usage-metric-value-removed { color: #f85149; }

.tool-summary-list { display: flex; flex-direction: column; gap: 4px; }
.tool-summary-item { position: relative; display: flex; justify-content: space-between; align-items: center; padding: 3px 6px; font-size: 12px; border-radius: 3px; overflow: hidden; }
.tool-summary-bar { position: absolute; left: 0; top: 0; bottom: 0; background: rgba(158, 106, 3, 0.15); border-radius: 3px; transition: width 0.3s ease; }
.tool-summary-name { position: relative; color: #c9d1d9; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; flex: 1; }
.tool-summary-count { position: relative; color: #d29922; font-weight: 600; margin-left: 8px; flex-shrink: 0; }

@media (max-width: 640px) {
  .usage-summary { padding: 12px; }
  .usage-summary-total { font-size: 20px; }
  .usage-summary-metrics,
  .usage-metric-grid-compact { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
</style>
