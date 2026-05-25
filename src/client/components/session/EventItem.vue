<template>
<div>
  <!-- Turn Start Divider -->
  <div
    v-if="item.type === 'assistant.turn_start'"
    :data-type="item.type"
    :data-index="item.virtualIndex"
    class="turn-divider"
  >
    <div class="turn-divider-line-left"></div>
    <span class="turn-divider-text">
      UserReq {{ getTurnNumber(item.virtualIndex) }}
      <template v-if="metadata.source === 'vscode'">
        <span class="turn-time">{{ formatTime(item.timestamp) }}</span>
        <span v-if="getTurnDuration(item.virtualIndex)" class="turn-duration">{{ getTurnDuration(item.virtualIndex) }}</span>
      </template>
      <template v-else>Start</template>
    </span>
    <div class="turn-divider-line-right"></div>
    <div class="divider-separator"></div>
  </div>

  <!-- Subagent Divider -->
  <div
    v-else-if="item.type === 'subagent.started' || item.type === 'subagent.completed' || item.type === 'subagent.failed'"
    :data-type="item.type"
    :data-index="item.virtualIndex"
    :class="['subagent-divider', item.type.split('.')[1]]"
    :style="{ '--sa-color': getSubagentColor(item) || '#58a6ff' }"
  >
    <div class="subagent-divider-line-left" :style="{ background: getSubagentColor(item) || '#58a6ff' }"></div>
    <span class="subagent-divider-text" :style="{ color: getSubagentColor(item) || '#58a6ff', borderColor: getSubagentColor(item) || '#58a6ff', background: (getSubagentColor(item) || '#58a6ff') + '1a' }">
      🤖 {{ item.data?.agentDisplayName || item.data?.agentName || 'SubAgent' }}
      <span v-if="subagentOwnership.subagentInfo.get(item.data?.toolCallId)?.meta?.model" class="subagent-divider-model">· {{ subagentOwnership.subagentInfo.get(item.data?.toolCallId).meta.model }}</span>
      {{ item.type === 'subagent.started' ? 'Start ▶' : item.type === 'subagent.completed' ? 'Complete ✓' : 'Failed ✗' }}
    </span>
    <div class="subagent-divider-line-right" :style="{ background: getSubagentColor(item) || '#58a6ff' }"></div>
    <div class="divider-separator"></div>
  </div>

  <!-- Regular Event -->
  <div
    v-else
    :class="['event', getSubagentInfo(item) ? 'event-in-subagent' : '']"
    :data-type="item.type"
    :data-index="item.virtualIndex"
    :style="getSubagentColor(item) ? { '--subagent-border-color': getSubagentColor(item) } : {}"
  >
    <div class="event-header">
      <span :class="['event-badge', getBadgeInfo(item.type, item).class]">
        {{ getBadgeInfo(item.type, item).label }}
      </span>
      <span
        v-if="getSubagentInfo(item)"
        class="subagent-owner-tag"
        :style="{ '--subagent-color': getSubagentColor(item) || '#58a6ff', '--subagent-hover-bg': ((getSubagentColor(item) || '#58a6ff') + '26') }"
        :title="'Filter to ' + getSubagentInfo(item).name"
        @click.stop="$emit('selectSubagent', getSubagentInfo(item).toolCallId)"
      >🤖 {{ getSubagentInfo(item).name }}</span>
      <span class="event-timestamp">{{ formatTime(item.timestamp) }}</span>
    </div>

    <!-- Abort event -->
    <div v-if="item.type === 'abort' && item.data?.reason" class="event-content">
      <strong>Reason:</strong> {{ item.data.reason }}
    </div>

    <!-- Session start -->
    <div v-else-if="item.type === 'session.start'" class="event-content">
      <div v-if="item.data?.type"><strong>Type:</strong> {{ item.data.type }}</div>
      <div v-if="item.data?.selectedModel"><strong>Model:</strong> {{ item.data.selectedModel }}</div>
      <div v-if="item.data?.producer"><strong>Producer:</strong> {{ item.data.producer }}</div>
    </div>

    <!-- Session resume -->
    <div v-else-if="item.type === 'session.resume'" class="event-content">
      <div v-if="item.data?.resumeTime"><strong>Resume Time:</strong> {{ formatDateTime(item.data.resumeTime) }}</div>
      <div v-if="item.data?.eventCount"><strong>Event Count:</strong> {{ item.data.eventCount }}</div>
      <div v-if="item.data?.context?.branch"><strong>Branch:</strong> {{ item.data.context.branch }}</div>
      <div v-if="item.data?.context?.repository"><strong>Repository:</strong> {{ item.data.context.repository }}</div>
      <div v-if="item.data?.context?.cwd"><strong>Working Directory:</strong> {{ item.data.context.cwd }}</div>
    </div>

    <!-- Session error -->
    <div v-else-if="item.type === 'session.error' && (item.data?.errorType || item.data?.message)" class="event-content">
      <div v-if="item.data?.errorType"><strong>Error Type:</strong> {{ item.data.errorType }}</div>
      <div v-if="item.data?.message"><strong>Message:</strong> {{ item.data.message }}</div>
    </div>

    <!-- Model change -->
    <div v-else-if="item.type === 'session.model_change'" class="event-content model-change-content">
      <div v-if="item.data?.previousModel && item.data?.newModel" class="model-change-text">
        <span class="model-name">{{ item.data.previousModel }}</span>
        <span class="model-arrow">→</span>
        <span class="model-name">{{ item.data.newModel }}</span>
      </div>
      <div v-else-if="item.data?.newModel" class="model-change-text">
        Switched to <span class="model-name">{{ item.data.newModel }}</span>
      </div>
      <div v-else-if="item.data?.model" class="model-change-text">
        Switched to <span class="model-name">{{ item.data.model }}</span>
      </div>
      <div v-else class="model-change-text">Model changed</div>
    </div>

    <!-- System notification -->
    <div v-else-if="item.type === 'system.notification'" class="event-content" style="opacity:0.7">
      <span>{{ item.data?.message }}</span>
    </div>

    <!-- Session truncation -->
    <div v-else-if="item.type === 'session.truncation'" class="event-content">
      <div v-if="item.data?.messagesRemovedDuringTruncation"><strong>Messages removed:</strong> {{ item.data.messagesRemovedDuringTruncation }}</div>
      <div v-if="item.data?.tokensRemovedDuringTruncation"><strong>Tokens removed:</strong> {{ item.data.tokensRemovedDuringTruncation.toLocaleString() }}</div>
      <div v-if="item.data?.preTruncationTokensInMessages"><strong>Pre-truncation tokens:</strong> {{ item.data.preTruncationTokensInMessages.toLocaleString() }}</div>
      <div v-if="item.data?.postTruncationMessagesLength"><strong>Post-truncation messages:</strong> {{ item.data.postTruncationMessagesLength }}</div>
      <div v-if="item.data?.performedBy"><strong>Performed by:</strong> {{ item.data.performedBy }}</div>
    </div>

    <!-- Compaction start -->
    <div v-else-if="item.type === 'session.compaction_start'" class="event-content">Context compaction started</div>

    <!-- Compaction complete -->
    <div v-else-if="item.type === 'session.compaction_complete'" class="event-content">
      <div v-if="item.data?.success != null"><strong>Success:</strong> {{ item.data.success ? '✓' : '✗' }}</div>
      <div v-if="item.data?.compactionTokensUsed">
        <strong>Tokens used:</strong>
        input {{ item.data.compactionTokensUsed.input?.toLocaleString() || 0 }},
        output {{ item.data.compactionTokensUsed.output?.toLocaleString() || 0 }}
        <span v-if="item.data.compactionTokensUsed.cachedInput">, cached {{ item.data.compactionTokensUsed.cachedInput.toLocaleString() }}</span>
      </div>
      <div v-if="item.data?.preCompactionMessagesLength"><strong>Pre-compaction messages:</strong> {{ item.data.preCompactionMessagesLength }}</div>
      <div v-if="item.data?.preCompactionTokens"><strong>Pre-compaction tokens:</strong> {{ item.data.preCompactionTokens.toLocaleString() }}</div>
      <div v-if="item.data?.summaryContent" style="margin-top: 8px;">
        <button
          @click="toggleContent('compaction-' + item.stableId)"
          style="background: none; border: 1px solid #30363d; color: #58a6ff; padding: 4px 12px; border-radius: 4px; cursor: pointer; font-size: 13px;"
        >
          {{ expandedContent['compaction-' + item.stableId] ? 'Hide summary ▲' : 'Show summary ▼' }}
        </button>
        <div v-if="expandedContent['compaction-' + item.stableId]" class="event-content" style="margin-top: 8px;" v-html="renderMarkdown(item.data.summaryContent)"></div>
      </div>
    </div>

    <!-- Hook event -->
    <div v-else-if="item.data?.hookType" class="hook-content">
      <div class="hook-summary">
        <span style="color: #8b949e;">{{ item.data.hookType }}</span>
        <span v-if="item.data.hookToolName" style="color: #8b949e;"> → </span>
        <span v-if="item.data.hookToolName" style="color: #c9d1d9;">{{ item.data.hookToolName }}</span>
        <span v-if="item.data.hookDurationMs != null" style="color: #7d8590; margin-left: 8px;">{{ item.data.hookDurationMs }}ms</span>
        <span v-if="item.data.hookSuccess === true" style="color: #3fb950; margin-left: 4px;">✓</span>
        <span v-if="item.data.hookSuccess === false" style="color: #ff7b72; margin-left: 4px;">✗</span>
      </div>
      <div v-if="item.data.hookArgs && Object.keys(item.data.hookArgs).length > 0" class="hook-section">
        <div class="hook-section-header" @click="toggleContent('hook-args-' + item.stableId)">
          <span class="tool-expand-icon">{{ expandedContent['hook-args-' + item.stableId] ? '▼' : '▶' }}</span>
          <span style="color: #8b949e;">Arguments</span>
        </div>
        <div v-if="expandedContent['hook-args-' + item.stableId]" class="hook-section-body">
          <pre>{{ JSON.stringify(item.data.hookArgs, null, 2) }}</pre>
        </div>
      </div>
      <div v-if="item.data.hookResult" class="hook-section">
        <div class="hook-section-header" @click="toggleContent('hook-result-' + item.stableId)">
          <span class="tool-expand-icon">{{ expandedContent['hook-result-' + item.stableId] ? '▼' : '▶' }}</span>
          <span style="color: #8b949e;">Result</span>
        </div>
        <div v-if="expandedContent['hook-result-' + item.stableId]" class="hook-section-body">
          <pre>{{ item.data.hookResult }}</pre>
        </div>
      </div>
      <div v-if="item.data.hookError" style="color: #ff7b72; margin-top: 4px;">
        Error: {{ item.data.hookError }}
      </div>
    </div>

    <!-- Regular content -->
    <div v-else-if="item.data?.message || item.data?.text || item.data?.content || item.data?.transformedContent">
      <div
        class="event-content"
        v-html="highlightSearchText(
          renderMarkdown(
            (expandedContent[item.stableId] || !isContentTooLong(item.data?.message || item.data?.text || item.data?.content || item.data?.transformedContent))
              ? (item.data?.message || item.data?.text || item.data?.content || item.data?.transformedContent)
              : truncateContent(item.data?.message || item.data?.text || item.data?.content || item.data?.transformedContent)
          ),
          searchText
        )"
      ></div>
      <div
        v-if="isContentTooLong(item.data?.message || item.data?.text || item.data?.content || item.data?.transformedContent)"
        style="margin-top: 8px;"
      >
        <button
          @click="toggleContent(item.stableId)"
          style="background: none; border: 1px solid #30363d; color: #58a6ff; padding: 4px 12px; border-radius: 4px; cursor: pointer; font-size: 13px;"
        >
          {{ expandedContent[item.stableId] ? 'Show less ▲' : 'Show more ▼' }}
        </button>
      </div>
    </div>

    <!-- No content -->
    <div v-else-if="!hasTools(item) && !item.data?.reasoningText" class="event-content" style="color: #7d8590; font-style: italic;">
      No available message
    </div>

    <!-- Reasoning text -->
    <div v-if="item.data?.reasoningText" class="event-content reasoning-text-content">
      <div
        v-html="highlightSearchText(
          renderMarkdown(
            (expandedContent[item.stableId + '-reasoning'] || !isContentTooLong(item.data.reasoningText))
              ? item.data.reasoningText
              : truncateContent(item.data.reasoningText)
          ),
          searchText
        )"
      ></div>
      <div v-if="isContentTooLong(item.data.reasoningText)" style="margin-top: 8px;">
        <button
          @click="toggleContent(item.stableId + '-reasoning')"
          style="background: none; border: 1px solid #30363d; color: #58a6ff; padding: 4px 12px; border-radius: 4px; cursor: pointer; font-size: 13px;"
        >
          {{ expandedContent[item.stableId + '-reasoning'] ? 'Show less ▲' : 'Show more ▼' }}
        </button>
      </div>
    </div>

    <!-- Tool calls -->
    <div v-if="hasTools(item)" class="tool-list">
      <div v-for="(group, idx) in getToolGroups(item)" :key="idx" class="tool-item">
        <div class="tool-header-line" @click="toggleTool(item.stableId + '-' + idx)">
          <span class="tool-connector">{{ idx === getToolGroups(item).length - 1 ? '└─' : '├─' }}</span>
          <span class="tool-expand-icon">{{ expandedTools[item.stableId + '-' + idx] ? '▼' : '▶' }}</span>
          <span class="tool-name">🔧&nbsp;{{ group.start?.data?.toolName || group.tool || 'Tool' }}</span>
          <span :class="getToolStatus(group).color" style="margin-left: 4px;">({{ getToolStatus(group).icon }}{{ getToolDuration(group) ? ' ' + getToolDuration(group) : '' }})</span>
          <span v-if="getToolCommand(group)" style="color: #7d8590; margin-left: 8px;">{{ getToolCommand(group) }}</span>
          <span v-if="getToolErrorMessage(group)" style="color: #ff7b72; margin-left: 8px;">{{ getToolErrorMessage(group).length > 80 ? getToolErrorMessage(group).substring(0, 80) + '...' : getToolErrorMessage(group) }}</span>
        </div>
        <div v-if="expandedTools[item.stableId + '-' + idx]" class="tool-detail">
          <div v-if="group.timing.startTime || group.timing.endTime || group.timing.duration" class="tool-detail-section">
            <div class="tool-detail-content tool-timing-line">
              <span v-if="group.timing.startTime"><span class="tool-timing-label">Start</span> {{ formatToolTime(group.timing.startTime) }}</span>
              <span v-if="group.timing.endTime"><span class="tool-timing-label">Complete</span> {{ formatToolTime(group.timing.endTime) }}</span>
              <span v-if="group.timing.duration"><span class="tool-timing-label">Duration</span> {{ group.timing.duration }}</span>
            </div>
          </div>
          <div v-if="group.start?.data?.arguments" class="tool-detail-section">
            <div class="tool-detail-title">Arguments:</div>
            <div class="tool-detail-content"><pre>{{ JSON.stringify(group.start.data.arguments, null, 2) }}</pre></div>
          </div>
          <div v-if="group.complete?.data?.result" class="tool-detail-section">
            <div class="tool-detail-title">Result:</div>
            <div class="tool-detail-content"><pre>{{ JSON.stringify(group.complete.data.result, null, 2) }}</pre></div>
          </div>
          <div v-if="getToolErrorMessage(group)" class="tool-detail-section">
            <div class="tool-detail-title">Error:</div>
            <div class="tool-detail-content" style="color: #ff7b72;">{{ getToolErrorMessage(group) }}</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Separator -->
    <div v-if="!item.isLastEvent" class="event-separator"></div>
  </div>
</div>
</template>

<script setup>
defineProps({
  item: { type: Object, required: true },
  metadata: { type: Object, required: true },
  expandedTools: { type: Object, required: true },
  expandedContent: { type: Object, required: true },
  searchText: { type: String, default: '' },
  subagentOwnership: { type: Object, required: true },
  formatTime: { type: Function, required: true },
  formatToolTime: { type: Function, required: true },
  formatDateTime: { type: Function, required: true },
  renderMarkdown: { type: Function, required: true },
  highlightSearchText: { type: Function, required: true },
  toggleTool: { type: Function, required: true },
  toggleContent: { type: Function, required: true },
  isContentTooLong: { type: Function, required: true },
  truncateContent: { type: Function, required: true },
  getBadgeInfo: { type: Function, required: true },
  getToolStatus: { type: Function, required: true },
  getToolErrorMessage: { type: Function, required: true },
  getToolDuration: { type: Function, required: true },
  getToolCommand: { type: Function, required: true },
  hasTools: { type: Function, required: true },
  getToolGroups: { type: Function, required: true },
  getSubagentInfo: { type: Function, required: true },
  getSubagentColor: { type: Function, required: true },
  getTurnNumber: { type: Function, required: true },
  getTurnDuration: { type: Function, required: true },
  SUBAGENT_COLORS: { type: Array, required: true },
})

defineEmits(['selectSubagent'])
</script>

<style scoped>
/* Events */
.event {
  background: #161b22;
  border-left: 3px solid #30363d;
  padding: 6px 12px 6px 12px;
  margin: 0;
  border-radius: 0;
  font-size: 13px;
}
.event:nth-child(even) {
  background: #1c2128;
}
.event-separator {
  height: 1px;
  background: #0d1117;
  margin: 12px 0 0 0;
}
.event.turn-boundary {
  background: #1c2128;
  border-left: 4px solid #8250df;
  padding: 8px 12px;
  box-shadow: 0 0 8px rgba(130, 80, 223, 0.15);
}
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

.event-content {
  color: #c9d1d9;
  text-align: left;
  font-size: 13px;
}

/* Model change styling */
.model-change-content {
  margin-top: 6px;
}
.model-change-text {
  font-size: 13px;
  color: #e6edf3;
}
.model-name {
  color: #58a6ff;
  font-weight: 600;
  font-family: 'SF Mono', 'Monaco', 'Consolas', monospace;
  font-size: 13px;
}
.model-arrow {
  color: #7d8590;
  margin: 0 8px;
}

/* Markdown styling */
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
.event-content :deep(pre code) {
  background: none;
  padding: 0;
  color: #e6edf3;
}
.event-content :deep(a) {
  color: #58a6ff;
  text-decoration: none;
}
.event-content :deep(a:hover) {
  text-decoration: underline;
}
.event-content :deep(ul),
.event-content :deep(ol) {
  padding-left: 24px;
  margin: 8px 0;
}
.event-content :deep(li) {
  margin: 4px 0;
}
.event-content :deep(blockquote) {
  border-left: 3px solid #30363d;
  padding-left: 12px;
  margin: 8px 0;
  color: #c9d1d9;
}
.event-content :deep(strong) {
  color: #e6edf3;
  font-weight: 600;
}
.event-content :deep(em) {
  color: #e6edf3;
  font-style: italic;
}
.event-content :deep(h1),
.event-content :deep(h2),
.event-content :deep(h3),
.event-content :deep(h4),
.event-content :deep(h5),
.event-content :deep(h6) {
  color: #e6edf3;
  margin: 12px 0 6px 0;
  font-weight: 600;
}
.event-content :deep(h1) { font-size: 16px; }
.event-content :deep(h2) { font-size: 15px; }
.event-content :deep(h3) { font-size: 14px; }
.event-content :deep(h4) { font-size: 13px; }
.event-content :deep(p) {
  margin: 6px 0;
}

/* Reasoning text */
.reasoning-text-content.event-content,
.reasoning-text-content.event-content :deep(strong),
.reasoning-text-content.event-content :deep(em),
.reasoning-text-content.event-content :deep(h1),
.reasoning-text-content.event-content :deep(h2),
.reasoning-text-content.event-content :deep(h3),
.reasoning-text-content.event-content :deep(h4),
.reasoning-text-content.event-content :deep(h5),
.reasoning-text-content.event-content :deep(h6),
.reasoning-text-content.event-content :deep(code),
.reasoning-text-content.event-content :deep(a) {
  color: #7d8590;
}

/* Markdown table styling */
.event-content :deep(table) {
  border-collapse: collapse;
  width: 100%;
  margin: 12px 0;
  background: #161b22;
  border: 1px solid #30363d;
  border-radius: 6px;
  overflow: hidden;
}
.event-content :deep(th) {
  background: #21262d;
  padding: 8px 12px;
  text-align: left;
  font-weight: 600;
  color: #e6edf3;
  border-bottom: 1px solid #30363d;
}
.event-content :deep(td) {
  padding: 8px 12px;
  border-bottom: 1px solid #30363d;
}
.event-content :deep(tr:last-child td) {
  border-bottom: none;
}
.event-content :deep(tbody tr:hover) {
  background: rgba(110, 118, 129, 0.1);
}

.event-timestamp {
  font-size: 12px;
  color: #c9d1d9;
}

/* Tool calls */
.tool-list {
  margin-top: 6px;
  padding-left: 0;
}
.tool-item {
  padding: 2px 0;
}
.tool-header-line {
  color: #c9d1d9;
  font-size: 13px;
  font-family: 'SF Mono', 'Monaco', 'Consolas', monospace;
  cursor: pointer;
  user-select: none;
  line-height: 1.4;
  display: flex;
  align-items: baseline;
  gap: 0;
  padding: 2px 0;
  flex-wrap: wrap;
}
.tool-header-line:hover {
  color: #c9d1d9;
}
.tool-connector {
  color: #6e7681;
  margin-right: 0;
  flex-shrink: 0;
  line-height: 1;
}
.tool-expand-icon {
  color: #6e7681;
  margin: 0 4px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 12px;
  height: 12px;
  flex-shrink: 0;
  line-height: 1;
  transform: translateY(-1px);
}
.tool-name {
  color: #f0883e;
  flex-shrink: 0;
  margin-right: 4px;
}
.tool-status-success {
  color: #238636;
}
.tool-status-error {
  color: #da3633;
}
.tool-status-running {
  color: #d29922;
}
.tool-detail {
  margin-top: 4px;
  padding: 8px;
  background: rgba(110, 118, 129, 0.05);
  border-radius: 3px;
  border: 1px solid #30363d;
  font-size: 12px;
}
.tool-detail-section {
  margin-bottom: 6px;
}
.tool-detail-section:last-child {
  margin-bottom: 0;
}
.tool-detail-title {
  color: #7d8590;
  margin-bottom: 2px;
  font-weight: 600;
  font-size: 12px;
}
.tool-detail-content pre {
  margin: 0;
  padding: 4px 6px;
  background: #0d1117;
  border-radius: 3px;
  overflow-x: auto;
  max-height: 200px;
  font-size: 12px;
  line-height: 1.3;
  color: #e6edf3;
}
.tool-timing-line {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 16px;
}
.tool-timing-label {
  color: #8b949e;
  font-weight: 500;
  margin-right: 3px;
}

/* Hook event styles */
.hook-content { font-size: 13px; }
.hook-summary { color: #8b949e; }
.hook-section { margin-top: 4px; }
.hook-section-header {
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 0;
  user-select: none;
}
.hook-section-header:hover { color: #c9d1d9; }
.hook-section-body {
  margin-top: 2px;
  padding: 6px 10px;
  background: #161b22;
  border: 1px solid #21262d;
  border-radius: 4px;
  overflow-x: auto;
}
.hook-section-body pre {
  margin: 0;
  font-size: 12px;
  color: #c9d1d9;
  white-space: pre-wrap;
  word-break: break-word;
}

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
  margin: 0;
  display: flex;
  align-items: center;
  gap: 6px;
}
.turn-time { color: #58a6ff; font-weight: 500; text-transform: none; letter-spacing: 0; }
.turn-duration { color: #3fb950; font-weight: 500; text-transform: none; letter-spacing: 0; }
.turn-duration::before { content: '⏱ '; }
.turn-divider-line-left,
.turn-divider-line-right {
  display: none;
}

/* Divider separator */
.divider-separator {
  display: none;
}

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
  margin: 0;
  text-transform: uppercase;
  color: #58a6ff;
  background: rgba(88, 166, 255, 0.1);
}
.subagent-divider-model {
  font-weight: 400;
  opacity: 0.8;
  font-size: 11px;
}
.subagent-divider-line-left,
.subagent-divider-line-right {
  display: none;
}
.event.event-in-subagent { border-left-color: var(--subagent-border-color, #58a6ff); }
.subagent-owner-tag {
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 8px;
  border: 1px solid;
  border-color: var(--subagent-color, #58a6ff);
  color: var(--subagent-color, #58a6ff);
  white-space: nowrap;
  opacity: 0.85;
  cursor: pointer;
  transition: opacity 0.15s;
}
.subagent-owner-tag:hover {
  opacity: 1;
  background: var(--subagent-hover-bg, rgba(88, 166, 255, 0.15));
}
.subagent-name-badge {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 4px;
  border: 1px solid;
  white-space: nowrap;
  font-weight: 600;
  max-width: 280px;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Search highlight */
:deep(.search-highlight) {
  background: #ffd33d;
  color: #1f2328;
  padding: 1px 2px;
  border-radius: 2px;
  font-weight: 500;
}

/* Mobile responsive styles for events */
@media (max-width: 640px) {
  .event-content :deep(pre) {
    max-width: calc(100vw - 32px);
  }
  .tool-header-line {
    overflow-wrap: anywhere;
    word-break: break-all;
  }
}
</style>
