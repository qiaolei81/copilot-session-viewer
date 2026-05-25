<script setup>
import { computed } from 'vue'
import ContentRenderer from './ContentRenderer.vue'
import ToolCallList from './ToolCallList.vue'

const props = defineProps({
  event: { type: Object, required: true },
  expandedTools: { type: Object, default: () => ({}) },
  expandedContent: { type: Object, default: () => ({}) },
  searchText: { type: String, default: '' },
  subagentInfo: { type: Object, default: null },
  subagentColor: { type: String, default: null },
  metadataSource: { type: String, default: '' },
  turnNumber: { type: String, default: '' },
  turnDuration: { type: String, default: null },
})

const emit = defineEmits([
  'toggleTool',
  'toggleContent',
  'selectSubagent',
])

// Badge info
const badgeInfo = computed(() => {
  const type = props.event.type
  const item = props.event

  // Prefer backend-generated badge info
  if (item?.data?.badgeLabel && item?.data?.badgeClass) {
    return { label: item.data.badgeLabel, class: item.data.badgeClass }
  }

  // Pi-Mono toolResult events
  if (type === 'message' && item?.data?.role === 'toolResult') {
    return { label: 'TOOL RESULT', class: 'badge-tool' }
  }

  // Special cases
  if (type === 'session.model_change') return { label: 'MODEL CHANGE', class: 'badge-session' }
  if (type === 'session.truncation') return { label: 'TRUNCATION', class: 'badge-truncation' }
  if (type === 'session.compaction_start' || type === 'session.compaction_complete') return { label: 'COMPACTION', class: 'badge-compaction' }
  if (type === 'system.notification') return { label: 'SYSTEM', class: 'badge-system' }

  const category = (type || '').split('.')[0] || 'unknown'
  const badges = {
    user: { label: 'USER', class: 'badge-user' },
    assistant: { label: 'ASSISTANT', class: 'badge-assistant' },
    reasoning: { label: 'REASONING', class: 'badge-reasoning' },
    turn: { label: 'TURN', class: 'badge-turn' },
    tool: { label: 'TOOL', class: 'badge-tool' },
    subagent: { label: 'SUBAGENT', class: 'badge-subagent' },
    skill: { label: 'SKILL', class: 'badge-skill' },
    session: { label: 'SESSION', class: 'badge-session' },
    error: { label: 'ERROR', class: 'badge-error' },
    abort: { label: 'ABORT', class: 'badge-error' },
  }
  return badges[category] || { label: category.toUpperCase(), class: 'badge-info' }
})

// Event type checks
const isTurnDivider = computed(() => props.event.type === 'assistant.turn_start')
const isSubagentDivider = computed(() =>
  props.event.type === 'subagent.started' ||
  props.event.type === 'subagent.completed' ||
  props.event.type === 'subagent.failed'
)
const isRegularEvent = computed(() => !isTurnDivider.value && !isSubagentDivider.value)

// Content helpers
const mainContent = computed(() =>
  props.event.data?.message || props.event.data?.text || props.event.data?.content || props.event.data?.transformedContent || ''
)

const hasToolCalls = computed(() =>
  props.event.data?.tools && props.event.data.tools.length > 0
)

const toolGroups = computed(() => {
  if (!props.event.data?.tools || !Array.isArray(props.event.data.tools)) return []
  return props.event.data.tools
    .filter(tool => tool && typeof tool === 'object' && tool.name)
    .map(tool => {
      const hasResult = tool.result !== undefined || tool.status === 'completed' || tool.status === 'error'
      const timing = {}
      if (tool.startTime) timing.startTime = tool.startTime
      if (tool.endTime) timing.endTime = tool.endTime
      if (timing.startTime && timing.endTime) {
        const durationMs = new Date(timing.endTime).getTime() - new Date(timing.startTime).getTime()
        if (durationMs >= 0) timing.duration = `${parseFloat((durationMs / 1000).toPrecision(3))}s (${durationMs}ms)`
      }
      return {
        tool: tool.name,
        timing,
        start: {
          timestamp: tool.startTime,
          data: { toolName: tool.name, arguments: tool.input || tool.arguments || {} }
        },
        complete: hasResult ? {
          timestamp: tool.endTime,
          data: { result: tool.result, error: tool.status === 'error' ? tool.error : null }
        } : null
      }
    })
})

// Subagent divider label
const subagentDividerStatus = computed(() => {
  if (props.event.type === 'subagent.started') return 'Start ▶'
  if (props.event.type === 'subagent.completed') return 'Complete ✓'
  return 'Failed ✗'
})

function formatTime(timestamp) {
  if (!timestamp) return ''
  const date = new Date(timestamp)
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`
}

function formatDateTime(timestamp) {
  if (!timestamp) return 'N/A'
  return new Date(timestamp).toLocaleString()
}
</script>

<template>
  <!-- Turn Start Divider -->
  <div v-if="isTurnDivider" class="turn-divider">
    <span class="turn-divider-text">
      UserReq {{ turnNumber }}
      <template v-if="metadataSource === 'vscode'">
        <span class="turn-time">{{ formatTime(event.timestamp) }}</span>
        <span v-if="turnDuration" class="turn-duration">{{ turnDuration }}</span>
      </template>
      <template v-else>Start</template>
    </span>
  </div>

  <!-- Subagent Divider -->
  <div
    v-else-if="isSubagentDivider"
    :class="['subagent-divider', event.type.split('.')[1]]"
    :style="{ '--sa-color': subagentColor || '#58a6ff' }"
  >
    <span
      class="subagent-divider-text"
      :style="{
        color: subagentColor || '#58a6ff',
        borderColor: subagentColor || '#58a6ff',
        background: (subagentColor || '#58a6ff') + '1a'
      }"
    >
      🤖 {{ event.data?.agentDisplayName || event.data?.agentName || 'SubAgent' }}
      {{ subagentDividerStatus }}
    </span>
  </div>

  <!-- Regular Event -->
  <div
    v-else
    :class="['event', subagentInfo ? 'event-in-subagent' : '']"
    :style="subagentColor ? { '--subagent-border-color': subagentColor } : {}"
  >
    <div class="event-header">
      <span :class="['event-badge', badgeInfo.class]">{{ badgeInfo.label }}</span>
      <span
        v-if="subagentInfo"
        class="subagent-owner-tag"
        :style="{ '--subagent-color': subagentColor || '#58a6ff', '--subagent-hover-bg': ((subagentColor || '#58a6ff') + '26') }"
        :title="'Filter to ' + subagentInfo.name"
        @click.stop="emit('selectSubagent', subagentInfo.toolCallId)"
      >🤖 {{ subagentInfo.name }}</span>
      <span class="event-timestamp">{{ formatTime(event.timestamp) }}</span>
    </div>

    <!-- Abort event -->
    <div v-if="event.type === 'abort' && event.data?.reason" class="event-content">
      <strong>Reason:</strong> {{ event.data.reason }}
    </div>

    <!-- Session start -->
    <div v-else-if="event.type === 'session.start'" class="event-content">
      <div v-if="event.data?.type"><strong>Type:</strong> {{ event.data.type }}</div>
      <div v-if="event.data?.selectedModel"><strong>Model:</strong> {{ event.data.selectedModel }}</div>
      <div v-if="event.data?.producer"><strong>Producer:</strong> {{ event.data.producer }}</div>
    </div>

    <!-- Session resume -->
    <div v-else-if="event.type === 'session.resume'" class="event-content">
      <div v-if="event.data?.resumeTime"><strong>Resume Time:</strong> {{ formatDateTime(event.data.resumeTime) }}</div>
      <div v-if="event.data?.eventCount"><strong>Event Count:</strong> {{ event.data.eventCount }}</div>
      <div v-if="event.data?.context?.branch"><strong>Branch:</strong> {{ event.data.context.branch }}</div>
      <div v-if="event.data?.context?.repository"><strong>Repository:</strong> {{ event.data.context.repository }}</div>
      <div v-if="event.data?.context?.cwd"><strong>Working Directory:</strong> {{ event.data.context.cwd }}</div>
    </div>

    <!-- Session error -->
    <div v-else-if="event.type === 'session.error' && (event.data?.errorType || event.data?.message)" class="event-content">
      <div v-if="event.data?.errorType"><strong>Error Type:</strong> {{ event.data.errorType }}</div>
      <div v-if="event.data?.message"><strong>Message:</strong> {{ event.data.message }}</div>
    </div>

    <!-- Model change -->
    <div v-else-if="event.type === 'session.model_change'" class="event-content model-change-content">
      <div v-if="event.data?.previousModel && event.data?.newModel" class="model-change-text">
        <span class="model-name">{{ event.data.previousModel }}</span>
        <span class="model-arrow">→</span>
        <span class="model-name">{{ event.data.newModel }}</span>
      </div>
      <div v-else-if="event.data?.newModel" class="model-change-text">
        Switched to <span class="model-name">{{ event.data.newModel }}</span>
      </div>
      <div v-else-if="event.data?.model" class="model-change-text">
        Switched to <span class="model-name">{{ event.data.model }}</span>
      </div>
      <div v-else class="model-change-text">Model changed</div>
    </div>

    <!-- System notification -->
    <div v-else-if="event.type === 'system.notification'" class="event-content" style="opacity:0.7">
      <span>{{ event.data?.message }}</span>
    </div>

    <!-- Session truncation -->
    <div v-else-if="event.type === 'session.truncation'" class="event-content">
      <div v-if="event.data?.messagesRemovedDuringTruncation"><strong>Messages removed:</strong> {{ event.data.messagesRemovedDuringTruncation }}</div>
      <div v-if="event.data?.tokensRemovedDuringTruncation"><strong>Tokens removed:</strong> {{ event.data.tokensRemovedDuringTruncation.toLocaleString() }}</div>
      <div v-if="event.data?.preTruncationTokensInMessages"><strong>Pre-truncation tokens:</strong> {{ event.data.preTruncationTokensInMessages.toLocaleString() }}</div>
      <div v-if="event.data?.postTruncationMessagesLength"><strong>Post-truncation messages:</strong> {{ event.data.postTruncationMessagesLength }}</div>
      <div v-if="event.data?.performedBy"><strong>Performed by:</strong> {{ event.data.performedBy }}</div>
    </div>

    <!-- Compaction start -->
    <div v-else-if="event.type === 'session.compaction_start'" class="event-content">
      Context compaction started
    </div>

    <!-- Compaction complete -->
    <div v-else-if="event.type === 'session.compaction_complete'" class="event-content">
      <div v-if="event.data?.success != null"><strong>Success:</strong> {{ event.data.success ? '✓' : '✗' }}</div>
      <div v-if="event.data?.compactionTokensUsed">
        <strong>Tokens used:</strong>
        input {{ event.data.compactionTokensUsed.input?.toLocaleString() || 0 }},
        output {{ event.data.compactionTokensUsed.output?.toLocaleString() || 0 }}
        <span v-if="event.data.compactionTokensUsed.cachedInput">, cached {{ event.data.compactionTokensUsed.cachedInput.toLocaleString() }}</span>
      </div>
      <div v-if="event.data?.preCompactionMessagesLength"><strong>Pre-compaction messages:</strong> {{ event.data.preCompactionMessagesLength }}</div>
      <div v-if="event.data?.preCompactionTokens"><strong>Pre-compaction tokens:</strong> {{ event.data.preCompactionTokens.toLocaleString() }}</div>
      <div v-if="event.data?.summaryContent" style="margin-top: 8px;">
        <button
          @click="emit('toggleContent', 'compaction-' + event.stableId)"
          class="expand-btn"
        >
          {{ expandedContent['compaction-' + event.stableId] ? 'Hide summary ▲' : 'Show summary ▼' }}
        </button>
        <ContentRenderer
          v-if="expandedContent['compaction-' + event.stableId]"
          :content="event.data.summaryContent"
          :searchQuery="searchText"
          :expanded="true"
          style="margin-top: 8px;"
        />
      </div>
    </div>

    <!-- Hook event -->
    <div v-else-if="event.data?.hookType" class="hook-content">
      <div class="hook-summary">
        <span style="color: #8b949e;">{{ event.data.hookType }}</span>
        <span v-if="event.data.hookToolName" style="color: #8b949e;"> → </span>
        <span v-if="event.data.hookToolName" style="color: #c9d1d9;">{{ event.data.hookToolName }}</span>
        <span v-if="event.data.hookDurationMs != null" style="color: #7d8590; margin-left: 8px;">{{ event.data.hookDurationMs }}ms</span>
        <span v-if="event.data.hookSuccess === true" style="color: #3fb950; margin-left: 4px;">✓</span>
        <span v-if="event.data.hookSuccess === false" style="color: #ff7b72; margin-left: 4px;">✗</span>
      </div>
      <div v-if="event.data.hookArgs && Object.keys(event.data.hookArgs).length > 0" class="hook-section">
        <div class="hook-section-header" @click="emit('toggleContent', 'hook-args-' + event.stableId)">
          <span class="tool-expand-icon">{{ expandedContent['hook-args-' + event.stableId] ? '▼' : '▶' }}</span>
          <span style="color: #8b949e;">Arguments</span>
        </div>
        <div v-if="expandedContent['hook-args-' + event.stableId]" class="hook-section-body">
          <pre>{{ JSON.stringify(event.data.hookArgs, null, 2) }}</pre>
        </div>
      </div>
      <div v-if="event.data.hookResult" class="hook-section">
        <div class="hook-section-header" @click="emit('toggleContent', 'hook-result-' + event.stableId)">
          <span class="tool-expand-icon">{{ expandedContent['hook-result-' + event.stableId] ? '▼' : '▶' }}</span>
          <span style="color: #8b949e;">Result</span>
        </div>
        <div v-if="expandedContent['hook-result-' + event.stableId]" class="hook-section-body">
          <pre>{{ event.data.hookResult }}</pre>
        </div>
      </div>
      <div v-if="event.data.hookError" style="color: #ff7b72; margin-top: 4px;">
        Error: {{ event.data.hookError }}
      </div>
    </div>

    <!-- Regular content -->
    <div v-else-if="mainContent">
      <ContentRenderer
        :content="mainContent"
        :searchQuery="searchText"
        :expanded="!!expandedContent[event.stableId]"
        @toggleExpand="emit('toggleContent', event.stableId)"
      />
    </div>

    <!-- No content fallback -->
    <div v-else-if="!hasToolCalls && !event.data?.reasoningText" class="event-content" style="color: #7d8590; font-style: italic;">
      No available message
    </div>

    <!-- Reasoning text -->
    <div v-if="event.data?.reasoningText">
      <ContentRenderer
        :content="event.data.reasoningText"
        :searchQuery="searchText"
        :expanded="!!expandedContent[event.stableId + '-reasoning']"
        :isReasoning="true"
        @toggleExpand="emit('toggleContent', event.stableId + '-reasoning')"
      />
    </div>

    <!-- Tool calls -->
    <ToolCallList
      v-if="hasToolCalls"
      :toolGroups="toolGroups"
      :eventStableId="event.stableId"
      :expandedTools="expandedTools"
      @toggleTool="emit('toggleTool', $event)"
    />

    <!-- Separator -->
    <div v-if="!event.isLastEvent" class="event-separator"></div>
  </div>
</template>

<style scoped>
/* Turn divider */
.turn-divider {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 12px;
  margin: 0;
  background: transparent;
}
.turn-divider::before,
.turn-divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: #30363d;
}
.turn-divider-text {
  color: #7d8590;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.8px;
  white-space: nowrap;
  padding: 2px 8px;
  background: #0d1117;
  border-radius: 10px;
  border: 1px solid #21262d;
  display: flex;
  align-items: center;
  gap: 6px;
}
.turn-time { color: #58a6ff; font-weight: 500; text-transform: none; letter-spacing: 0; }
.turn-duration { color: #3fb950; font-weight: 500; text-transform: none; letter-spacing: 0; }
.turn-duration::before { content: '⏱ '; }

/* Subagent divider */
.subagent-divider {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 12px;
  margin: 0;
  background: transparent;
}
.subagent-divider::before,
.subagent-divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--sa-color, #58a6ff);
}
.subagent-divider-text {
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
  letter-spacing: 0.8px;
  padding: 2px 8px;
  border-radius: 10px;
  border: 1px solid #58a6ff;
  text-transform: uppercase;
  color: #58a6ff;
  background: rgba(88, 166, 255, 0.1);
}

/* Regular event */
.event {
  background: #161b22;
  border-left: 3px solid #30363d;
  padding: 6px 12px;
  margin: 0;
  border-radius: 0;
  font-size: 13px;
}
.event:nth-child(even) { background: #1c2128; }
.event.event-in-subagent { border-left-color: var(--subagent-border-color, #58a6ff); }

.event-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}
.event-badge {
  padding: 2px 8px;
  border-radius: 3px;
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
  min-width: 90px;
  text-align: center;
  display: inline-block;
  line-height: 1.4;
}
.badge-user { background: #1f6feb; color: #fff; }
.badge-assistant { background: #238636; color: #fff; }
.badge-reasoning { background: #a371f7; color: #fff; }
.badge-turn { background: #8250df; color: #fff; }
.badge-tool { background: #9e6a03; color: #fff; }
.badge-hook { background: #484f58; color: #c9d1d9; }
.badge-subagent { background: #8957e5; color: #fff; }
.badge-skill { background: #bf3989; color: #fff; }
.badge-session { background: #6e7681; color: #fff; }
.badge-system { background: #444c56; color: #adbac7; font-style: italic; }
.badge-truncation { background: #e5534b; color: #fff; }
.badge-compaction { background: #c2442d; color: #fff; }
.badge-error { background: #da3633; color: #fff; }
.badge-warning { background: #d29922; color: #000; }
.badge-info { background: #58a6ff; color: #fff; }

.event-timestamp { font-size: 12px; color: #c9d1d9; }

.event-content {
  color: #c9d1d9;
  text-align: left;
  font-size: 13px;
}
.event-content :deep(code) {
  background: #161b22;
  padding: 2px 6px;
  border-radius: 3px;
  font-family: 'SF Mono', 'Monaco', 'Consolas', monospace;
  font-size: 12px;
  color: #f0883e;
}
.event-content :deep(pre) {
  background: #161b22;
  padding: 12px;
  border-radius: 6px;
  overflow-x: auto;
  margin: 8px 0;
  border: 1px solid #30363d;
  font-size: 13px;
}
.event-content :deep(pre code) { background: none; padding: 0; color: #e6edf3; }
.event-content :deep(a) { color: #58a6ff; text-decoration: none; }
.event-content :deep(a:hover) { text-decoration: underline; }
.event-content :deep(ul), .event-content :deep(ol) { padding-left: 24px; margin: 8px 0; }
.event-content :deep(li) { margin: 4px 0; }
.event-content :deep(blockquote) { border-left: 3px solid #30363d; padding-left: 12px; margin: 8px 0; color: #c9d1d9; }
.event-content :deep(strong) { color: #e6edf3; font-weight: 600; }
.event-content :deep(em) { color: #e6edf3; font-style: italic; }
.event-content :deep(h1), .event-content :deep(h2), .event-content :deep(h3),
.event-content :deep(h4), .event-content :deep(h5), .event-content :deep(h6) {
  color: #e6edf3; margin: 12px 0 6px 0; font-weight: 600;
}
.event-content :deep(h1) { font-size: 16px; }
.event-content :deep(h2) { font-size: 15px; }
.event-content :deep(h3) { font-size: 14px; }
.event-content :deep(p) { margin: 6px 0; }
.event-content :deep(table) { border-collapse: collapse; width: 100%; margin: 12px 0; background: #161b22; border: 1px solid #30363d; border-radius: 6px; overflow: hidden; }
.event-content :deep(th) { background: #21262d; padding: 8px 12px; text-align: left; font-weight: 600; color: #e6edf3; border-bottom: 1px solid #30363d; }
.event-content :deep(td) { padding: 8px 12px; border-bottom: 1px solid #30363d; }
.event-content :deep(tr:last-child td) { border-bottom: none; }
.event-content :deep(tbody tr:hover) { background: rgba(110, 118, 129, 0.1); }

/* Model change */
.model-change-content { margin-top: 6px; }
.model-change-text { font-size: 13px; color: #e6edf3; }
.model-name { color: #58a6ff; font-weight: 600; font-family: 'SF Mono', 'Monaco', 'Consolas', monospace; font-size: 13px; }
.model-arrow { color: #7d8590; margin: 0 8px; }

/* Subagent owner tag */
.subagent-owner-tag {
  font-size: 11px; padding: 1px 6px; border-radius: 8px;
  border: 1px solid; border-color: var(--subagent-color, #58a6ff);
  color: var(--subagent-color, #58a6ff); white-space: nowrap;
  opacity: 0.85; cursor: pointer; transition: opacity 0.15s;
}
.subagent-owner-tag:hover { opacity: 1; background: var(--subagent-hover-bg, rgba(88, 166, 255, 0.15)); }

/* Separator */
.event-separator { height: 1px; background: #0d1117; margin: 12px 0 0 0; }

/* Hook styles */
.hook-content { font-size: 13px; }
.hook-summary { color: #8b949e; }
.hook-section { margin-top: 4px; }
.hook-section-header {
  cursor: pointer; display: inline-flex; align-items: center; gap: 4px; padding: 2px 0; user-select: none;
}
.hook-section-header:hover { color: #c9d1d9; }
.hook-section-body {
  margin-top: 2px; padding: 6px 10px; background: #161b22;
  border: 1px solid #21262d; border-radius: 4px; overflow-x: auto;
}
.hook-section-body pre { margin: 0; font-size: 12px; color: #c9d1d9; white-space: pre-wrap; word-break: break-word; }

.tool-expand-icon {
  color: #6e7681; margin: 0 4px; display: inline-flex; align-items: center;
  justify-content: center; width: 12px; height: 12px; flex-shrink: 0; line-height: 1;
}

.expand-btn {
  background: none; border: 1px solid #30363d; color: #58a6ff;
  padding: 4px 12px; border-radius: 4px; cursor: pointer; font-size: 13px;
}

@media (max-width: 640px) {
  .event-content :deep(pre) { max-width: calc(100vw - 32px); }
}
</style>
