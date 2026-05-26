<template>
  <div data-testid="time-analyze">
    <div class="py-4 px-5 border-b border-border flex items-center gap-4 sticky top-0 bg-canvas z-10">
      <router-link data-testid="nav-btn" :to="'/' + source + '/session/' + sessionId" class="py-1.5 px-3 bg-surface-hover border border-border rounded-md text-text-secondary no-underline text-sm transition-all hover:bg-border hover:border-accent">
← Back to Session
</router-link>
      <h1 class="text-accent text-xl flex-1">
⏱ Analysis: {{ sessionId }}
        <span v-if="metadata.sessionStatus === 'wip'" style="font-size: 12px; padding: 2px 8px; border-radius: 3px; background: rgba(210, 153, 34, 0.2); color: #d29922; border: 1px solid rgba(210, 153, 34, 0.4); vertical-align: middle; margin-left: 8px;">🔄 WIP</span>
      </h1>
    </div>

    <div class="mx-auto px-5">
      <div v-if="loading" class="text-center p-10 text-text-dim text-sm" style="padding: 60px;">
        ⏳ Loading events...
      </div>

      <div v-else-if="error" class="text-center p-10 text-text-dim text-sm" style="padding: 60px; color: #f85149;">
        ❌ {{ error }}
      </div>

      <div v-else>
        <!-- Summary Cards -->
        <SummaryCards
          :format-duration="formatDuration"
          :format-date-time="formatDateTime"
          :format-tokens="formatTokens"
          :total-duration="totalDuration"
          :session-start="sessionStart"
          :session-end="sessionEnd"
          :grouped-turns="groupedTurns"
          :turn-analysis="turnAnalysis"
          :total-tool-count="totalToolCount"
          :success-rate="successRate"
          :error-count="errorCount"
          :subagent-analysis="subagentAnalysis"
          :subagent-stats="subagentStats"
          :time-breakdown="timeBreakdown"
          :total-tool-time="totalToolTime"
          :total-tokens="totalTokens"
          :total-requests="totalRequests"
          :total-models="totalModels"
        />

        <!-- Tabs -->
        <div data-testid="tabs" class="flex gap-1 mb-4 border-b border-border">
          <button :class="[
            'py-2 px-4 bg-none border-none border-b-2 border-transparent text-text-dim text-sm cursor-pointer transition-all duration-200 font-inherit hover:text-text-secondary',
            activeTab === 'timeline' ? '!text-accent !border-b-accent' : ''
          ]" @click="activeTab = 'timeline'">
            📊 Timeline
          </button>
          <button :class="[
            'py-2 px-4 bg-none border-none border-b-2 border-transparent text-text-dim text-sm cursor-pointer transition-all duration-200 font-inherit hover:text-text-secondary',
            activeTab === 'insight' ? '!text-accent !border-b-accent' : ''
          ]" @click="activeTab = 'insight'">
            💡 Agent Review
          </button>
        </div>

        <!-- Timeline Tab -->
        <TimelineTab
          v-if="activeTab === 'timeline'"
          :error="error"
          :session-id="sessionId"
          :events="events"
          :unified-timeline-items="unifiedTimelineItems"
          :show-marker-legend="showMarkerLegend"
          :copy-label="copyLabel"
          :EVENT_MARKER_CATEGORIES="EVENT_MARKER_CATEGORIES"
          :gantt-crosshair-x="ganttCrosshairX"
          :gantt-crosshair-time="ganttCrosshairTime"
          :on-gantt-mouse-move="onGanttMouseMove"
          :on-gantt-mouse-leave="onGanttMouseLeave"
          :gantt-position="ganttPosition"
          :format-duration="formatDuration"
          :format-time="formatTime"
          :tool-time-by-category="toolTimeByCategory"
          :max-category-time="maxCategoryTime"
          @toggle-legend="showMarkerLegend = !showMarkerLegend"
          @copy-timeline="copyTimelineMarkdown"
        />

        <!-- Insight Tab -->
        <InsightTab
          v-if="activeTab === 'insight'"
          :insight-status="insightStatus"
          :insight-error="insightError"
          :insight-log="insightLog"
          :insight-loading="insightLoading"
          :insight-age-ms="insightAgeMs"
          :insight-started-at="insightStartedAt"
          :insight-generated-at="insightGeneratedAt"
          :rendered-insight="renderedInsight"
          :format-date-time="formatDateTime"
          @generate="generateInsight(false)"
          @regenerate="regenerateInsight"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import { useRoute } from 'vue-router';
import SummaryCards from '../components/time-analyze/SummaryCards.vue';
import TimelineTab from '../components/time-analyze/TimelineTab.vue';
import InsightTab from '../components/time-analyze/InsightTab.vue';
import { useTimeAnalyze } from '../components/time-analyze/useTimeAnalyze.js';

const route = useRoute();
const sessionId = computed(() => route.params.id);
const source = computed(() => route.params.source);
const metadata = ref({});

// Fetch metadata
fetch('/api/' + encodeURIComponent(source.value) + '/sessions/' + sessionId.value)
  .then(r => r.json())
  .then(data => { metadata.value = data; })
  .catch(() => {});

const ta = useTimeAnalyze(sessionId, metadata, source);

// Destructure all exports
const {
  events, loading, error, activeTab,
  sortField, sortDir,
  insightReport, insightLog, insightLoading, insightError, insightGeneratedAt,
  insightStatus, insightLastUpdate, insightStartedAt, insightAgeMs,
  renderedInsight, generateInsight, regenerateInsight,
  formatDuration, formatTime, formatDateTime, formatTokens,
  sessionStart, sessionEnd, totalDuration,
  subagentAnalysis, maxSubagentDuration, subagentTimelineItems, subagentStats,
  EVENT_MARKER_CATEGORIES, showMarkerLegend,
  copyLabel, copyTimelineMarkdown,
  ganttCrosshairX, ganttCrosshairTime, onGanttMouseMove, onGanttMouseLeave,
  turnAnalysis, maxTurnDuration, groupedTurns,
  unifiedTimelineItems,
  toolAnalysis, sortedToolAnalysis, maxToolDuration,
  totalTokens, totalRequests, totalModels,
  getModelCacheHitRatio, getDisplayUsageInputTokens,
  toolTimeByCategory, maxCategoryTime,
  totalToolTime, totalToolCount, avgToolDuration, longestTool,
  successRate, errorCount, timeBreakdown,
  gapAnalysis, maxGapDuration, gapStats,
  ganttPosition, toggleSort, sortIcon,
  getToolBadgeClass, getOpBadgeClass,
} = ta;
</script>
