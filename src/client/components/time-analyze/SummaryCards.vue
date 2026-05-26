<template>
  <div class="grid grid-cols-6 max-md:grid-cols-2 gap-3 my-5 mx-auto">
    <div class="bg-surface border border-border rounded-lg p-4" title="Wall-clock time from first event to last event in this session.">
      <div class="text-xs text-text-dim uppercase tracking-[0.5px] mb-1">
Total Duration
</div>
      <div class="text-2xl font-semibold text-text">
{{ formatDuration(totalDuration) }}
</div>
      <div v-if="sessionStart" class="text-xs text-text-dim mt-0.5" style="font-size: 10px; opacity: 0.7;">
        {{ formatDateTime(sessionStart) }} → {{ formatDateTime(sessionEnd) }}
      </div>
    </div>
    <div class="bg-surface border border-border rounded-lg p-4" title="Number of user messages that triggered agent work. Each request may involve multiple LLM turns.">
      <div class="text-xs text-text-dim uppercase tracking-[0.5px] mb-1">
User Requests
</div>
      <div class="text-2xl font-semibold text-text">
{{ groupedTurns.length }}
</div>
      <div class="text-xs text-text-dim mt-0.5">
{{ turnAnalysis.length }} turn{{ turnAnalysis.length !== 1 ? 's' : '' }}
</div>
    </div>
    <div class="bg-surface border border-border rounded-lg p-4" title="Total tool executions (Read, Write, Edit, Bash, Grep, etc.) across the entire session, including subagent tools.">
      <div class="text-xs text-text-dim uppercase tracking-[0.5px] mb-1">
Tool Calls
</div>
      <div class="text-2xl font-semibold text-text">
{{ totalToolCount }}
</div>
      <div class="text-xs text-text-dim mt-0.5">
        <span :style="{ color: successRate >= 95 ? '#3fb950' : successRate >= 80 ? '#d29922' : '#f85149' }">{{ successRate }}%</span> success
        <span v-if="errorCount > 0" style="color: #f85149;"> · {{ errorCount }} error{{ errorCount !== 1 ? 's' : '' }}</span>
      </div>
    </div>
    <div class="bg-surface border border-border rounded-lg p-4" title="Spawned subagents (via Task tool). Shows completed/failed/incomplete counts, total wall-clock time, and tool calls attributed to subagents.">
      <div class="text-xs text-text-dim uppercase tracking-[0.5px] mb-1">
Sub-Agents
</div>
      <div class="text-2xl font-semibold text-text">
{{ subagentAnalysis.length }}
</div>
      <div v-if="subagentAnalysis.length > 0" class="text-xs text-text-dim mt-0.5">
        <span :style="{ color: subagentStats.successRate >= 95 ? '#3fb950' : subagentStats.successRate >= 80 ? '#d29922' : '#f85149' }">{{ subagentStats.completed }}✓</span>
        <span v-if="subagentStats.failed > 0" style="color: #f85149;"> · {{ subagentStats.failed }}✗</span>
        <span v-if="subagentStats.incomplete > 0" style="color: #d29922;"> · {{ subagentStats.incomplete }}⏳</span>
        · {{ formatDuration(subagentStats.totalTime) }}
        · {{ subagentStats.totalTools }} tools
      </div>
    </div>
    <div class="bg-surface border border-border rounded-lg p-4" title="Estimated LLM reasoning time (total duration minus tool execution and user thinking time). Breakdown shows LLM percentage, tool wall-clock time, and user idle time.">
      <div class="text-xs text-text-dim uppercase tracking-[0.5px] mb-1">
Time Breakdown
</div>
      <div class="text-2xl font-semibold text-text">
{{ formatDuration(timeBreakdown.llmTime) }} <span style="font-size: 14px; opacity: 0.6;">({{ timeBreakdown.llmPct }}% LLM Reasoning)</span>
</div>
      <div class="text-xs text-text-dim mt-0.5">
        Tools {{ formatDuration(totalToolTime) }} ({{ timeBreakdown.toolPct }}%)
        <span v-if="timeBreakdown.userThinkingTime > 1000"> · User {{ formatDuration(timeBreakdown.userThinkingTime) }} ({{ timeBreakdown.userThinkingPct }}%)</span>
      </div>
    </div>
    <div class="bg-surface border border-border rounded-lg p-4" title="Token usage across all models: input, output, and cached tokens.">
      <div class="text-xs text-text-dim uppercase tracking-[0.5px] mb-1">
Token Usage
</div>
      <div class="text-2xl font-semibold text-text">
{{ formatTokens(totalTokens) }}
</div>
      <div class="text-xs text-text-dim mt-0.5">
        {{ totalRequests }} reqs · {{ totalModels }} model{{ totalModels === 1 ? '' : 's' }}
      </div>
    </div>
  </div>
</template>

<script setup>
defineProps({
  formatDuration: { type: Function, required: true },
  formatDateTime: { type: Function, required: true },
  formatTokens: { type: Function, required: true },
  totalDuration: { required: true },
  sessionStart: {},
  sessionEnd: {},
  groupedTurns: { type: Array, required: true },
  turnAnalysis: { type: Array, required: true },
  totalToolCount: { required: true },
  successRate: { required: true },
  errorCount: { required: true },
  subagentAnalysis: { type: Array, required: true },
  subagentStats: { type: Object, required: true },
  timeBreakdown: { type: Object, required: true },
  totalToolTime: { required: true },
  totalTokens: { required: true },
  totalRequests: { required: true },
  totalModels: { required: true },
});
</script>
