<template>
<div>
  <!-- Turn Start Divider -->
  <div
    v-if="item.type === 'assistant.turn_start'"
    :data-type="item.type"
    :data-index="item.virtualIndex"
    class="turn-divider"
  >
    <div class="turn-divider-line-left" />
    <span class="turn-divider-text">
      UserReq {{ getTurnNumber(item.virtualIndex) }}
      <template v-if="metadata.source === 'vscode'">
        <span class="turn-time">{{ formatTime(item.timestamp) }}</span>
        <span v-if="getTurnDuration(item.virtualIndex)" class="turn-duration">{{ getTurnDuration(item.virtualIndex) }}</span>
      </template>
      <template v-else>Start</template>
    </span>
    <div class="turn-divider-line-right" />
    <div class="divider-separator" />
  </div>

  <!-- Subagent Divider -->
  <div
    v-else-if="item.type === 'subagent.started' || item.type === 'subagent.completed' || item.type === 'subagent.failed'"
    :data-type="item.type"
    :data-index="item.virtualIndex"
    :class="['subagent-divider', item.type.split('.')[1]]"
    :style="{ '--sa-color': getSubagentColor(item) || '#58a6ff' }"
  >
    <div class="subagent-divider-line-left" :style="{ background: getSubagentColor(item) || '#58a6ff' }" />
    <span class="subagent-divider-text" :style="{ color: getSubagentColor(item) || '#58a6ff', borderColor: getSubagentColor(item) || '#58a6ff', background: (getSubagentColor(item) || '#58a6ff') + '1a' }">
      🤖 {{ item.data?.agentDisplayName || item.data?.agentName || 'SubAgent' }}
      <span v-if="subagentOwnership.subagentInfo.get(item.data?.toolCallId)?.meta?.model" class="subagent-divider-model">· {{ subagentOwnership.subagentInfo.get(item.data?.toolCallId).meta.model }}</span>
      {{ item.type === 'subagent.started' ? 'Start ▶' : item.type === 'subagent.completed' ? 'Complete ✓' : 'Failed ✗' }}
    </span>
    <div class="subagent-divider-line-right" :style="{ background: getSubagentColor(item) || '#58a6ff' }" />
    <div class="divider-separator" />
  </div>

  <!-- Regular Event -->
  <div
    v-else
    :class="['event', getSubagentInfo(item) ? 'event-in-subagent' : '']"
    :data-type="item.type"
    :data-index="item.virtualIndex"
    :style="getSubagentColor(item) ? { '--subagent-border-color': getSubagentColor(item) } : {}"
  >
    <div class="event-header flex items-center gap-2 mb-1.5">
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
      <span class="event-timestamp text-xs text-[#c9d1d9]">{{ formatTime(item.timestamp) }}</span>
    </div>

    <!-- Abort event -->
    <div v-if="item.type === 'abort' && item.data?.reason" class="event-content text-[#c9d1d9] text-left text-[13px]">
      <strong>Reason:</strong> {{ item.data.reason }}
    </div>

    <!-- Session start -->
    <div v-else-if="item.type === 'session.start'" class="event-content text-[#c9d1d9] text-left text-[13px]">
      <div v-if="item.data?.type">
<strong>Type:</strong> {{ item.data.type }}
</div>
      <div v-if="item.data?.selectedModel">
<strong>Model:</strong> {{ item.data.selectedModel }}
</div>
      <div v-if="item.data?.producer">
<strong>Producer:</strong> {{ item.data.producer }}
</div>
    </div>

    <!-- Session resume -->
    <div v-else-if="item.type === 'session.resume'" class="event-content text-[#c9d1d9] text-left text-[13px]">
      <div v-if="item.data?.resumeTime">
<strong>Resume Time:</strong> {{ formatDateTime(item.data.resumeTime) }}
</div>
      <div v-if="item.data?.eventCount">
<strong>Event Count:</strong> {{ item.data.eventCount }}
</div>
      <div v-if="item.data?.context?.branch">
<strong>Branch:</strong> {{ item.data.context.branch }}
</div>
      <div v-if="item.data?.context?.repository">
<strong>Repository:</strong> {{ item.data.context.repository }}
</div>
      <div v-if="item.data?.context?.cwd">
<strong>Working Directory:</strong> {{ item.data.context.cwd }}
</div>
    </div>

    <!-- Session error -->
    <div v-else-if="item.type === 'session.error' && (item.data?.errorType || item.data?.message)" class="event-content text-[#c9d1d9] text-left text-[13px]">
      <div v-if="item.data?.errorType">
<strong>Error Type:</strong> {{ item.data.errorType }}
</div>
      <div v-if="item.data?.message">
<strong>Message:</strong> {{ item.data.message }}
</div>
    </div>

    <!-- Model change -->
    <div v-else-if="item.type === 'session.model_change'" class="event-content model-change-content text-[#c9d1d9] text-left text-[13px]">
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
      <div v-else class="model-change-text">
Model changed
</div>
    </div>

    <!-- System notification -->
    <div v-else-if="item.type === 'system.notification'" class="event-content text-[#c9d1d9] text-left text-[13px]" style="opacity:0.7">
      <span>{{ item.data?.message }}</span>
    </div>

    <!-- Session truncation -->
    <div v-else-if="item.type === 'session.truncation'" class="event-content text-[#c9d1d9] text-left text-[13px]">
      <div v-if="item.data?.messagesRemovedDuringTruncation">
<strong>Messages removed:</strong> {{ item.data.messagesRemovedDuringTruncation }}
</div>
      <div v-if="item.data?.tokensRemovedDuringTruncation">
<strong>Tokens removed:</strong> {{ item.data.tokensRemovedDuringTruncation.toLocaleString() }}
</div>
      <div v-if="item.data?.preTruncationTokensInMessages">
<strong>Pre-truncation tokens:</strong> {{ item.data.preTruncationTokensInMessages.toLocaleString() }}
</div>
      <div v-if="item.data?.postTruncationMessagesLength">
<strong>Post-truncation messages:</strong> {{ item.data.postTruncationMessagesLength }}
</div>
      <div v-if="item.data?.performedBy">
<strong>Performed by:</strong> {{ item.data.performedBy }}
</div>
    </div>

    <!-- Compaction start -->
    <div v-else-if="item.type === 'session.compaction_start'" class="event-content text-[#c9d1d9] text-left text-[13px]">
Context compaction started
</div>

    <!-- Compaction complete -->
    <div v-else-if="item.type === 'session.compaction_complete'" class="event-content text-[#c9d1d9] text-left text-[13px]">
      <div v-if="item.data?.success != null">
<strong>Success:</strong> {{ item.data.success ? '✓' : '✗' }}
</div>
      <div v-if="item.data?.compactionTokensUsed">
        <strong>Tokens used:</strong>
        input {{ item.data.compactionTokensUsed.input?.toLocaleString() || 0 }},
        output {{ item.data.compactionTokensUsed.output?.toLocaleString() || 0 }}
        <span v-if="item.data.compactionTokensUsed.cachedInput">, cached {{ item.data.compactionTokensUsed.cachedInput.toLocaleString() }}</span>
      </div>
      <div v-if="item.data?.preCompactionMessagesLength">
<strong>Pre-compaction messages:</strong> {{ item.data.preCompactionMessagesLength }}
</div>
      <div v-if="item.data?.preCompactionTokens">
<strong>Pre-compaction tokens:</strong> {{ item.data.preCompactionTokens.toLocaleString() }}
</div>
      <div v-if="item.data?.summaryContent" style="margin-top: 8px;">
        <button
          style="background: none; border: 1px solid #30363d; color: #58a6ff; padding: 4px 12px; border-radius: 4px; cursor: pointer; font-size: 13px;"
          @click="toggleContent('compaction-' + item.stableId)"
        >
          {{ expandedContent['compaction-' + item.stableId] ? 'Hide summary ▲' : 'Show summary ▼' }}
        </button>
        <div v-if="expandedContent['compaction-' + item.stableId]" class="event-content" style="margin-top: 8px;" v-html="renderMarkdown(item.data.summaryContent)" />
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
        class="event-content text-[#c9d1d9] text-left text-[13px]"
        v-html="highlightSearchText(
          renderMarkdown(
            (expandedContent[item.stableId] || !isContentTooLong(item.data?.message || item.data?.text || item.data?.content || item.data?.transformedContent))
              ? (item.data?.message || item.data?.text || item.data?.content || item.data?.transformedContent)
              : truncateContent(item.data?.message || item.data?.text || item.data?.content || item.data?.transformedContent)
          ),
          searchText
        )"
      />
      <div
        v-if="isContentTooLong(item.data?.message || item.data?.text || item.data?.content || item.data?.transformedContent)"
        style="margin-top: 8px;"
      >
        <button
          style="background: none; border: 1px solid #30363d; color: #58a6ff; padding: 4px 12px; border-radius: 4px; cursor: pointer; font-size: 13px;"
          @click="toggleContent(item.stableId)"
        >
          {{ expandedContent[item.stableId] ? 'Show less ▲' : 'Show more ▼' }}
        </button>
      </div>
    </div>

    <!-- No content -->
    <div v-else-if="!hasTools(item) && !item.data?.reasoningText" class="event-content text-[#c9d1d9] text-left text-[13px]" style="color: #7d8590; font-style: italic;">
      No available message
    </div>

    <!-- Reasoning text -->
    <div v-if="item.data?.reasoningText" class="event-content reasoning-text-content text-[#c9d1d9] text-left text-[13px]">
      <div
        v-html="highlightSearchText(
          renderMarkdown(
            (expandedContent[item.stableId + '-reasoning'] || !isContentTooLong(item.data.reasoningText))
              ? item.data.reasoningText
              : truncateContent(item.data.reasoningText)
          ),
          searchText
        )"
      />
      <div v-if="isContentTooLong(item.data.reasoningText)" style="margin-top: 8px;">
        <button
          style="background: none; border: 1px solid #30363d; color: #58a6ff; padding: 4px 12px; border-radius: 4px; cursor: pointer; font-size: 13px;"
          @click="toggleContent(item.stableId + '-reasoning')"
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
            <div class="tool-detail-title">
Arguments:
</div>
            <div class="tool-detail-content">
<pre>{{ JSON.stringify(group.start.data.arguments, null, 2) }}</pre>
</div>
          </div>
          <div v-if="group.complete?.data?.result" class="tool-detail-section">
            <div class="tool-detail-title">
Result:
</div>
            <div class="tool-detail-content">
<pre>{{ JSON.stringify(group.complete.data.result, null, 2) }}</pre>
</div>
          </div>
          <div v-if="getToolErrorMessage(group)" class="tool-detail-section">
            <div class="tool-detail-title">
Error:
</div>
            <div class="tool-detail-content" style="color: #ff7b72;">
{{ getToolErrorMessage(group) }}
</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Separator -->
    <div v-if="!item.isLastEvent" class="event-separator h-px bg-[#0d1117] mt-3" />
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
