<template>
<div>
  <!-- Turn Start Divider -->
  <div
    v-if="item.type === 'assistant.turn_start'"
    :data-type="item.type"
    :data-index="item.virtualIndex"
    class="turn-divider divider-base"
  >
    <span class="turn-divider-label">
      UserReq {{ getTurnNumber(item.virtualIndex) }}
      <template v-if="metadata.source === 'vscode'">
        <span class="turn-time">{{ formatTime(item.timestamp) }}</span>
        <span v-if="getTurnDuration(item.virtualIndex)" class="turn-time text-success turn-duration">{{ getTurnDuration(item.virtualIndex) }}</span>
      </template>
      <template v-else>Start</template>
    </span>
  </div>

  <!-- Subagent Divider -->
  <div
    v-else-if="item.type === 'subagent.started' || item.type === 'subagent.completed' || item.type === 'subagent.failed'"
    :data-type="item.type"
    :data-index="item.virtualIndex"
    :class="['subagent-divider divider-base', item.type.split('.')[1]]"
    :style="{ '--sa-color': getSubagentColor(item) || '#58a6ff' }"
  >
    <span class="subagent-divider-label" :style="{ color: getSubagentColor(item) || '#58a6ff', borderColor: getSubagentColor(item) || '#58a6ff', background: (getSubagentColor(item) || '#58a6ff') + '1a' }">
      🤖 {{ item.data?.agentDisplayName || item.data?.agentName || 'SubAgent' }}
      <span v-if="subagentOwnership.subagentInfo.get(item.data?.toolCallId)?.meta?.model" class="font-normal opacity-80 text-2xs">· {{ subagentOwnership.subagentInfo.get(item.data?.toolCallId).meta.model }}</span>
      {{ item.type === 'subagent.started' ? 'Start ▶' : item.type === 'subagent.completed' ? 'Complete ✓' : 'Failed ✗' }}
    </span>
  </div>

  <!-- Regular Event -->
  <div
    v-else
    :class="['event-row']"
    :data-type="item.type"
    :data-index="item.virtualIndex"
    :style="getSubagentColor(item) ? { borderLeftColor: getSubagentColor(item) } : {}"
  >
    <div class="event-header flex items-center gap-2 mb-1.5">
      <span class="event-badge" :style="getBadgeInfo(item.type, item).style">
        {{ getBadgeInfo(item.type, item).label }}
      </span>
      <span
        v-if="getSubagentInfo(item)"
        class="subagent-tag"
        :style="{ borderColor: getSubagentColor(item) || '#58a6ff', color: getSubagentColor(item) || '#58a6ff' }"
        @mouseover="$event.target.style.background = (getSubagentColor(item) || '#58a6ff') + '26'"
        @mouseout="$event.target.style.background = ''"
        :title="'Filter to ' + getSubagentInfo(item).name"
        @click.stop="$emit('selectSubagent', getSubagentInfo(item).toolCallId)"
      >🤖 {{ getSubagentInfo(item).name }}</span>
      <span class="event-timestamp text-xs text-text-secondary">{{ formatTime(item.timestamp) }}</span>
    </div>

    <!-- Abort event -->
    <div v-if="item.type === 'abort' && item.data?.reason" class="event-content event-content-text">
      <strong>Reason:</strong> {{ item.data.reason }}
    </div>

    <!-- Session start -->
    <div v-else-if="item.type === 'session.start'" class="event-content event-content-text">
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
    <div v-else-if="item.type === 'session.resume'" class="event-content event-content-text">
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
    <div v-else-if="item.type === 'session.error' && (item.data?.errorType || item.data?.message)" class="event-content event-content-text">
      <div v-if="item.data?.errorType">
<strong>Error Type:</strong> {{ item.data.errorType }}
</div>
      <div v-if="item.data?.message">
<strong>Message:</strong> {{ item.data.message }}
</div>
    </div>

    <!-- Model change -->
    <div v-else-if="item.type === 'session.model_change'" class="event-content mt-1.5 text-text-secondary text-left text-sm">
      <div v-if="item.data?.previousModel && item.data?.newModel" class="text-sm text-text">
        <span class="model-name">{{ item.data.previousModel }}</span>
        <span class="text-text-dim mx-2">→</span>
        <span class="model-name">{{ item.data.newModel }}</span>
      </div>
      <div v-else-if="item.data?.newModel" class="text-sm text-text">
        Switched to <span class="model-name">{{ item.data.newModel }}</span>
      </div>
      <div v-else-if="item.data?.model" class="text-sm text-text">
        Switched to <span class="model-name">{{ item.data.model }}</span>
      </div>
      <div v-else class="text-sm text-text">
Model changed
</div>
    </div>

    <!-- System notification -->
    <div v-else-if="item.type === 'system.notification'" class="event-content event-content-text" style="opacity:0.7">
      <span>{{ item.data?.message }}</span>
    </div>

    <!-- Session truncation -->
    <div v-else-if="item.type === 'session.truncation'" class="event-content event-content-text">
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
    <div v-else-if="item.type === 'session.compaction_start'" class="event-content event-content-text">
Context compaction started
</div>

    <!-- Compaction complete -->
    <div v-else-if="item.type === 'session.compaction_complete'" class="event-content event-content-text">
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
    <div v-else-if="item.data?.hookType" class="text-sm">
      <div class="text-text-muted">
        <span style="color: #8b949e;">{{ item.data.hookType }}</span>
        <span v-if="item.data.hookToolName" style="color: #8b949e;"> → </span>
        <span v-if="item.data.hookToolName" style="color: #c9d1d9;">{{ item.data.hookToolName }}</span>
        <span v-if="item.data.hookDurationMs != null" style="color: #7d8590; margin-left: 8px;">{{ item.data.hookDurationMs }}ms</span>
        <span v-if="item.data.hookSuccess === true" style="color: #3fb950; margin-left: 4px;">✓</span>
        <span v-if="item.data.hookSuccess === false" style="color: #ff7b72; margin-left: 4px;">✗</span>
      </div>
      <div v-if="item.data.hookArgs && Object.keys(item.data.hookArgs).length > 0" class="mt-1">
        <div class="hook-toggle" @click="toggleContent('hook-args-' + item.stableId)">
          <span class="expand-arrow">{{ expandedContent['hook-args-' + item.stableId] ? '▼' : '▶' }}</span>
          <span style="color: #8b949e;">Arguments</span>
        </div>
        <div v-if="expandedContent['hook-args-' + item.stableId]" class="hook-detail-box">
          <pre>{{ JSON.stringify(item.data.hookArgs, null, 2) }}</pre>
        </div>
      </div>
      <div v-if="item.data.hookResult" class="mt-1">
        <div class="hook-toggle" @click="toggleContent('hook-result-' + item.stableId)">
          <span class="expand-arrow">{{ expandedContent['hook-result-' + item.stableId] ? '▼' : '▶' }}</span>
          <span style="color: #8b949e;">Result</span>
        </div>
        <div v-if="expandedContent['hook-result-' + item.stableId]" class="hook-detail-box">
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
        class="event-content event-content-text"
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
    <div v-else-if="!hasTools(item) && !item.data?.reasoningText" class="event-content event-content-text" style="color: #7d8590; font-style: italic;">
      No available message
    </div>

    <!-- Reasoning text -->
    <div v-if="item.data?.reasoningText" class="event-content reasoning-text-content text-text-secondary text-left text-sm">
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
    <div v-if="hasTools(item)" class="mt-1.5 pl-0">
      <div v-for="(group, idx) in getToolGroups(item)" :key="idx" class="py-0.5">
        <div class="tool-header" @click="toggleTool(item.stableId + '-' + idx)">
          <span class="text-text-faint mr-0 shrink-0 leading-none">{{ idx === getToolGroups(item).length - 1 ? '└─' : '├─' }}</span>
          <span class="expand-arrow">{{ expandedTools[item.stableId + '-' + idx] ? '▼' : '▶' }}</span>
          <span class="text-tool shrink-0 mr-1">🔧&nbsp;{{ group.start?.data?.toolName || group.tool || 'Tool' }}</span>
          <span :class="getToolStatus(group).color" style="margin-left: 4px;">({{ getToolStatus(group).icon }}{{ getToolDuration(group) ? ' ' + getToolDuration(group) : '' }})</span>
          <span v-if="getToolCommand(group)" style="color: #7d8590; margin-left: 8px;">{{ getToolCommand(group) }}</span>
          <span v-if="getToolErrorMessage(group)" style="color: #ff7b72; margin-left: 8px;">{{ getToolErrorMessage(group).length > 80 ? getToolErrorMessage(group).substring(0, 80) + '...' : getToolErrorMessage(group) }}</span>
        </div>
        <div v-if="expandedTools[item.stableId + '-' + idx]" class="tool-detail">
          <div v-if="group.timing.startTime || group.timing.endTime || group.timing.duration" class="mb-1.5">
            <div class="flex flex-wrap gap-x-4 gap-y-1">
              <span v-if="group.timing.startTime"><span class="text-text-muted font-medium mr-[3px]">Start</span> {{ formatToolTime(group.timing.startTime) }}</span>
              <span v-if="group.timing.endTime"><span class="text-text-muted font-medium mr-[3px]">Complete</span> {{ formatToolTime(group.timing.endTime) }}</span>
              <span v-if="group.timing.duration"><span class="text-text-muted font-medium mr-[3px]">Duration</span> {{ group.timing.duration }}</span>
            </div>
          </div>
          <div v-if="group.start?.data?.arguments" class="mb-1.5">
            <div class="tool-section-label">
Arguments:
</div>
            <div class="">
<pre class="tool-pre">{{ JSON.stringify(group.start.data.arguments, null, 2) }}</pre>
</div>
          </div>
          <div v-if="group.complete?.data?.result" class="mb-1.5">
            <div class="tool-section-label">
Result:
</div>
            <div class="">
<pre class="tool-pre">{{ JSON.stringify(group.complete.data.result, null, 2) }}</pre>
</div>
          </div>
          <div v-if="getToolErrorMessage(group)" class="mb-1.5 last:mb-0">
            <div class="tool-section-label">
Error:
</div>
            <div class="" style="color: #ff7b72;">
{{ getToolErrorMessage(group) }}
</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Separator -->
    <div v-if="!item.isLastEvent" class="event-separator h-px bg-canvas mt-3" />
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
