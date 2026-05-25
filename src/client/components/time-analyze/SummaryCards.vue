<script setup>
import { useFormatters } from '../../composables/useFormatters.js'

const { formatDuration, formatTokens, formatDateTime } = useFormatters()

defineProps({
  totalDuration: { type: Number, default: 0 },
  sessionStart: { type: Number, default: null },
  sessionEnd: { type: Number, default: null },
  groupedTurnsCount: { type: Number, default: 0 },
  turnCount: { type: Number, default: 0 },
  totalToolCount: { type: Number, default: 0 },
  successRate: { type: [Number, String], default: 100 },
  errorCount: { type: Number, default: 0 },
  subagentAnalysis: { type: Array, default: () => [] },
  subagentStats: { type: Object, default: () => ({}) },
  timeBreakdown: { type: Object, default: () => ({}) },
  totalToolTime: { type: Number, default: 0 },
  totalTokens: { type: Number, default: 0 },
  totalRequests: { type: Number, default: 0 },
  totalModels: { type: Number, default: 0 },
})
</script>

<template>
  <div class="summary-grid">
    <!-- Total Duration -->
    <div class="summary-card" title="Wall-clock time from first event to last event in this session.">
      <div class="summary-card-label">Total Duration</div>
      <div class="summary-card-value">{{ formatDuration(totalDuration) }}</div>
      <div v-if="sessionStart" class="summary-card-sub" style="font-size: 10px; opacity: 0.7;">
        {{ formatDateTime(sessionStart) }} &rarr; {{ formatDateTime(sessionEnd) }}
      </div>
    </div>

    <!-- User Requests -->
    <div class="summary-card" title="Number of user messages that triggered agent work.">
      <div class="summary-card-label">User Requests</div>
      <div class="summary-card-value">{{ groupedTurnsCount }}</div>
      <div class="summary-card-sub">{{ turnCount }} turn{{ turnCount !== 1 ? 's' : '' }}</div>
    </div>

    <!-- Tool Calls -->
    <div class="summary-card" title="Total tool executions across the entire session.">
      <div class="summary-card-label">Tool Calls</div>
      <div class="summary-card-value">{{ totalToolCount }}</div>
      <div class="summary-card-sub">
        <span :style="{ color: successRate >= 95 ? '#3fb950' : successRate >= 80 ? '#d29922' : '#f85149' }">{{ successRate }}%</span> success
        <span v-if="errorCount > 0" style="color: #f85149;"> &middot; {{ errorCount }} error{{ errorCount !== 1 ? 's' : '' }}</span>
      </div>
    </div>

    <!-- Sub-Agents -->
    <div class="summary-card" title="Spawned subagents (via Task tool).">
      <div class="summary-card-label">Sub-Agents</div>
      <div class="summary-card-value">{{ subagentAnalysis.length }}</div>
      <div v-if="subagentAnalysis.length > 0" class="summary-card-sub">
        <span :style="{ color: subagentStats.successRate >= 95 ? '#3fb950' : subagentStats.successRate >= 80 ? '#d29922' : '#f85149' }">{{ subagentStats.completed }}&check;</span>
        <span v-if="subagentStats.failed > 0" style="color: #f85149;"> &middot; {{ subagentStats.failed }}&cross;</span>
        <span v-if="subagentStats.incomplete > 0" style="color: #d29922;"> &middot; {{ subagentStats.incomplete }}&#9203;</span>
        &middot; {{ formatDuration(subagentStats.totalTime) }}
        &middot; {{ subagentStats.totalTools }} tools
      </div>
    </div>

    <!-- Time Breakdown -->
    <div class="summary-card" title="Estimated LLM reasoning time.">
      <div class="summary-card-label">Time Breakdown</div>
      <div class="summary-card-value">
        {{ formatDuration(timeBreakdown.llmTime) }}
        <span style="font-size: 14px; opacity: 0.6;">({{ timeBreakdown.llmPct }}% LLM)</span>
      </div>
      <div class="summary-card-sub">
        Tools {{ formatDuration(totalToolTime) }} ({{ timeBreakdown.toolPct }}%)
        <span v-if="timeBreakdown.userThinkingTime > 1000"> &middot; User {{ formatDuration(timeBreakdown.userThinkingTime) }} ({{ timeBreakdown.userThinkingPct }}%)</span>
      </div>
    </div>

    <!-- Token Usage -->
    <div class="summary-card" title="Token usage across all models.">
      <div class="summary-card-label">Token Usage</div>
      <div class="summary-card-value">{{ formatTokens(totalTokens) }}</div>
      <div class="summary-card-sub">
        {{ totalRequests }} reqs &middot; {{ totalModels }} model{{ totalModels === 1 ? '' : 's' }}
      </div>
    </div>
  </div>
</template>

<style scoped>
.summary-grid {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 12px;
  margin: 20px 0;
}
.summary-card {
  background: #161b22;
  border: 1px solid #30363d;
  border-radius: 8px;
  padding: 16px;
}
.summary-card-label {
  font-size: 12px;
  color: #7d8590;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 4px;
}
.summary-card-value {
  font-size: 24px;
  font-weight: 600;
  color: #e6edf3;
}
.summary-card-sub {
  font-size: 12px;
  color: #7d8590;
  margin-top: 2px;
}
@media (max-width: 768px) {
  .summary-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
