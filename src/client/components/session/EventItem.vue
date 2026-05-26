<template>
<div>
  <!-- Turn Start Divider -->
  <div
    v-if="item.type === 'assistant.turn_start'"
    :data-type="item.type"
    :data-index="item.virtualIndex"
    class="turn-divider flex items-center gap-3 py-3 px-3 m-0 bg-transparent"
  >
    <span class="text-[#7d8590] text-xs font-semibold uppercase tracking-[0.8px] whitespace-nowrap py-0.5 px-2 bg-[#0d1117] rounded-[10px] border border-[#21262d] m-0 flex items-center gap-1.5">
      UserReq {{ getTurnNumber(item.virtualIndex) }}
      <template v-if="metadata.source === 'vscode'">
        <span class="text-[#58a6ff] font-medium normal-case tracking-normal">{{ formatTime(item.timestamp) }}</span>
        <span v-if="getTurnDuration(item.virtualIndex)" class="text-[#3fb950] font-medium normal-case tracking-normal turn-duration">{{ getTurnDuration(item.virtualIndex) }}</span>
      </template>
      <template v-else>Start</template>
    </span>
  </div>

  <!-- Subagent Divider -->
  <div
    v-else-if="item.type === 'subagent.started' || item.type === 'subagent.completed' || item.type === 'subagent.failed'"
    :data-type="item.type"
    :data-index="item.virtualIndex"
    :class="['subagent-divider flex items-center gap-3 py-3 px-3 m-0 bg-transparent', item.type.split('.')[1]]"
    :style="{ '--sa-color': getSubagentColor(item) || '#58a6ff' }"
  >
    <span class="text-xs font-semibold whitespace-nowrap tracking-[0.8px] py-0.5 px-2 rounded-[10px] border border-[#58a6ff] m-0 uppercase text-[#58a6ff] bg-[rgba(88,166,255,0.1)]" :style="{ color: getSubagentColor(item) || '#58a6ff', borderColor: getSubagentColor(item) || '#58a6ff', background: (getSubagentColor(item) || '#58a6ff') + '1a' }">
      🤖 {{ item.data?.agentDisplayName || item.data?.agentName || 'SubAgent' }}
      <span v-if="subagentOwnership.subagentInfo.get(item.data?.toolCallId)?.meta?.model" class="font-normal opacity-80 text-[11px]">· {{ subagentOwnership.subagentInfo.get(item.data?.toolCallId).meta.model }}</span>
      {{ item.type === 'subagent.started' ? 'Start ▶' : item.type === 'subagent.completed' ? 'Complete ✓' : 'Failed ✗' }}
    </span>
  </div>

  <!-- Regular Event -->
  <div
    v-else
    :class="['bg-[#161b22] border-l-[3px] border-l-[#30363d] py-1.5 px-3 m-0 rounded-none text-[13px] even:bg-[#1c2128]']"
    :data-type="item.type"
    :data-index="item.virtualIndex"
    :style="getSubagentColor(item) ? { borderLeftColor: getSubagentColor(item) } : {}"
  >
    <div class="event-header flex items-center gap-2 mb-1.5">
      <span :class="['py-0.5 px-2 rounded-[3px] text-xs font-semibold whitespace-nowrap min-w-[90px] text-center inline-block leading-[1.4]', getBadgeInfo(item.type, item).class]">
        {{ getBadgeInfo(item.type, item).label }}
      </span>
      <span
        v-if="getSubagentInfo(item)"
        class="text-[11px] py-px px-1.5 rounded-lg border whitespace-nowrap opacity-[0.85] cursor-pointer transition-opacity duration-150 hover:opacity-100"
        :style="{ borderColor: getSubagentColor(item) || '#58a6ff', color: getSubagentColor(item) || '#58a6ff' }"
        @mouseover="$event.target.style.background = (getSubagentColor(item) || '#58a6ff') + '26'"
        @mouseout="$event.target.style.background = ''"
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
    <div v-else-if="item.type === 'session.model_change'" class="event-content mt-1.5 text-[#c9d1d9] text-left text-[13px]">
      <div v-if="item.data?.previousModel && item.data?.newModel" class="text-[13px] text-[#e6edf3]">
        <span class="text-[#58a6ff] font-semibold font-mono text-[13px]">{{ item.data.previousModel }}</span>
        <span class="text-[#7d8590] mx-2">→</span>
        <span class="text-[#58a6ff] font-semibold font-mono text-[13px]">{{ item.data.newModel }}</span>
      </div>
      <div v-else-if="item.data?.newModel" class="text-[13px] text-[#e6edf3]">
        Switched to <span class="text-[#58a6ff] font-semibold font-mono text-[13px]">{{ item.data.newModel }}</span>
      </div>
      <div v-else-if="item.data?.model" class="text-[13px] text-[#e6edf3]">
        Switched to <span class="text-[#58a6ff] font-semibold font-mono text-[13px]">{{ item.data.model }}</span>
      </div>
      <div v-else class="text-[13px] text-[#e6edf3]">
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
    <div v-else-if="item.data?.hookType" class="text-[13px]">
      <div class="text-[#8b949e]">
        <span style="color: #8b949e;">{{ item.data.hookType }}</span>
        <span v-if="item.data.hookToolName" style="color: #8b949e;"> → </span>
        <span v-if="item.data.hookToolName" style="color: #c9d1d9;">{{ item.data.hookToolName }}</span>
        <span v-if="item.data.hookDurationMs != null" style="color: #7d8590; margin-left: 8px;">{{ item.data.hookDurationMs }}ms</span>
        <span v-if="item.data.hookSuccess === true" style="color: #3fb950; margin-left: 4px;">✓</span>
        <span v-if="item.data.hookSuccess === false" style="color: #ff7b72; margin-left: 4px;">✗</span>
      </div>
      <div v-if="item.data.hookArgs && Object.keys(item.data.hookArgs).length > 0" class="mt-1">
        <div class="cursor-pointer inline-flex items-center gap-1 py-0.5 select-none hover:text-[#c9d1d9]" @click="toggleContent('hook-args-' + item.stableId)">
          <span class="text-[#6e7681] mx-1 inline-flex items-center justify-center w-3 h-3 shrink-0 leading-none -translate-y-px">{{ expandedContent['hook-args-' + item.stableId] ? '▼' : '▶' }}</span>
          <span style="color: #8b949e;">Arguments</span>
        </div>
        <div v-if="expandedContent['hook-args-' + item.stableId]" class="mt-0.5 py-1.5 px-2.5 bg-[#161b22] border border-[#21262d] rounded overflow-x-auto">
          <pre>{{ JSON.stringify(item.data.hookArgs, null, 2) }}</pre>
        </div>
      </div>
      <div v-if="item.data.hookResult" class="mt-1">
        <div class="cursor-pointer inline-flex items-center gap-1 py-0.5 select-none hover:text-[#c9d1d9]" @click="toggleContent('hook-result-' + item.stableId)">
          <span class="text-[#6e7681] mx-1 inline-flex items-center justify-center w-3 h-3 shrink-0 leading-none -translate-y-px">{{ expandedContent['hook-result-' + item.stableId] ? '▼' : '▶' }}</span>
          <span style="color: #8b949e;">Result</span>
        </div>
        <div v-if="expandedContent['hook-result-' + item.stableId]" class="mt-0.5 py-1.5 px-2.5 bg-[#161b22] border border-[#21262d] rounded overflow-x-auto">
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
    <div v-if="hasTools(item)" class="mt-1.5 pl-0">
      <div v-for="(group, idx) in getToolGroups(item)" :key="idx" class="py-0.5">
        <div class="text-[#c9d1d9] text-[13px] font-mono cursor-pointer select-none leading-[1.4] flex items-baseline gap-0 py-0.5 flex-wrap hover:text-[#c9d1d9]" @click="toggleTool(item.stableId + '-' + idx)">
          <span class="text-[#6e7681] mr-0 shrink-0 leading-none">{{ idx === getToolGroups(item).length - 1 ? '└─' : '├─' }}</span>
          <span class="text-[#6e7681] mx-1 inline-flex items-center justify-center w-3 h-3 shrink-0 leading-none -translate-y-px">{{ expandedTools[item.stableId + '-' + idx] ? '▼' : '▶' }}</span>
          <span class="text-[#f0883e] shrink-0 mr-1">🔧&nbsp;{{ group.start?.data?.toolName || group.tool || 'Tool' }}</span>
          <span :class="getToolStatus(group).color" style="margin-left: 4px;">({{ getToolStatus(group).icon }}{{ getToolDuration(group) ? ' ' + getToolDuration(group) : '' }})</span>
          <span v-if="getToolCommand(group)" style="color: #7d8590; margin-left: 8px;">{{ getToolCommand(group) }}</span>
          <span v-if="getToolErrorMessage(group)" style="color: #ff7b72; margin-left: 8px;">{{ getToolErrorMessage(group).length > 80 ? getToolErrorMessage(group).substring(0, 80) + '...' : getToolErrorMessage(group) }}</span>
        </div>
        <div v-if="expandedTools[item.stableId + '-' + idx]" class="mt-1 p-2 bg-[rgba(110,118,129,0.05)] rounded-[3px] border border-[#30363d] text-xs">
          <div v-if="group.timing.startTime || group.timing.endTime || group.timing.duration" class="mb-1.5">
            <div class="flex flex-wrap gap-x-4 gap-y-1">
              <span v-if="group.timing.startTime"><span class="text-[#8b949e] font-medium mr-[3px]">Start</span> {{ formatToolTime(group.timing.startTime) }}</span>
              <span v-if="group.timing.endTime"><span class="text-[#8b949e] font-medium mr-[3px]">Complete</span> {{ formatToolTime(group.timing.endTime) }}</span>
              <span v-if="group.timing.duration"><span class="text-[#8b949e] font-medium mr-[3px]">Duration</span> {{ group.timing.duration }}</span>
            </div>
          </div>
          <div v-if="group.start?.data?.arguments" class="mb-1.5">
            <div class="text-[#7d8590] mb-0.5 font-semibold text-xs">
Arguments:
</div>
            <div class="">
<pre class="m-0 py-1 px-1.5 bg-[#0d1117] rounded-[3px] overflow-x-auto max-h-[200px] text-xs leading-[1.3] text-[#e6edf3]">{{ JSON.stringify(group.start.data.arguments, null, 2) }}</pre>
</div>
          </div>
          <div v-if="group.complete?.data?.result" class="mb-1.5">
            <div class="text-[#7d8590] mb-0.5 font-semibold text-xs">
Result:
</div>
            <div class="">
<pre class="m-0 py-1 px-1.5 bg-[#0d1117] rounded-[3px] overflow-x-auto max-h-[200px] text-xs leading-[1.3] text-[#e6edf3]">{{ JSON.stringify(group.complete.data.result, null, 2) }}</pre>
</div>
          </div>
          <div v-if="getToolErrorMessage(group)" class="mb-1.5 last:mb-0">
            <div class="text-[#7d8590] mb-0.5 font-semibold text-xs">
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
