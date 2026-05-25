<template>
  <div>
    <div class="header">
      <router-link :to="'/session/' + sessionId" class="nav-btn">← Back to Session</router-link>
      <h1>⏱ Analysis: {{ sessionId }}
        <span v-if="metadata.sessionStatus === 'wip'" style="font-size: 12px; padding: 2px 8px; border-radius: 3px; background: rgba(210, 153, 34, 0.2); color: #d29922; border: 1px solid rgba(210, 153, 34, 0.4); vertical-align: middle; margin-left: 8px;">🔄 WIP</span>
      </h1>
    </div>

    <div class="container">
      <div v-if="loading" class="empty-state" style="padding: 60px;">
        ⏳ Loading events...
      </div>

      <div v-else-if="error" class="empty-state" style="padding: 60px; color: #f85149;">
        ❌ {{ error }}
      </div>

      <div v-else>
        <!-- Summary Cards -->
        <SummaryCards
          :formatDuration="formatDuration"
          :formatDateTime="formatDateTime"
          :formatTokens="formatTokens"
          :totalDuration="totalDuration"
          :sessionStart="sessionStart"
          :sessionEnd="sessionEnd"
          :groupedTurns="groupedTurns"
          :turnAnalysis="turnAnalysis"
          :totalToolCount="totalToolCount"
          :successRate="successRate"
          :errorCount="errorCount"
          :subagentAnalysis="subagentAnalysis"
          :subagentStats="subagentStats"
          :timeBreakdown="timeBreakdown"
          :totalToolTime="totalToolTime"
          :totalTokens="totalTokens"
          :totalRequests="totalRequests"
          :totalModels="totalModels"
        />

        <!-- Tabs -->
        <div class="tabs">
          <button :class="['tab', { active: activeTab === 'timeline' }]" @click="activeTab = 'timeline'">
            📊 Timeline
          </button>
          <button :class="['tab', { active: activeTab === 'insight' }]" @click="activeTab = 'insight'">
            💡 Agent Review
          </button>
        </div>

        <!-- Timeline Tab -->
        <TimelineTab
          v-if="activeTab === 'timeline'"
          :error="error"
          :sessionId="sessionId"
          :events="events"
          :unifiedTimelineItems="unifiedTimelineItems"
          :showMarkerLegend="showMarkerLegend"
          :copyLabel="copyLabel"
          :EVENT_MARKER_CATEGORIES="EVENT_MARKER_CATEGORIES"
          :ganttCrosshairX="ganttCrosshairX"
          :ganttCrosshairTime="ganttCrosshairTime"
          :onGanttMouseMove="onGanttMouseMove"
          :onGanttMouseLeave="onGanttMouseLeave"
          :ganttPosition="ganttPosition"
          :formatDuration="formatDuration"
          :formatTime="formatTime"
          :toolTimeByCategory="toolTimeByCategory"
          :maxCategoryTime="maxCategoryTime"
          @toggle-legend="showMarkerLegend = !showMarkerLegend"
          @copy-timeline="copyTimelineMarkdown"
        />

        <!-- Insight Tab -->
        <InsightTab
          v-if="activeTab === 'insight'"
          :insightStatus="insightStatus"
          :insightError="insightError"
          :insightLog="insightLog"
          :insightLoading="insightLoading"
          :insightAgeMs="insightAgeMs"
          :insightStartedAt="insightStartedAt"
          :insightGeneratedAt="insightGeneratedAt"
          :renderedInsight="renderedInsight"
          :formatDateTime="formatDateTime"
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
const sessionId = ref(route.params.id);
const metadata = ref({});

// Fetch metadata
fetch('/api/sessions/' + sessionId.value)
  .then(r => r.json())
  .then(data => { metadata.value = data; })
  .catch(() => {});

const ta = useTimeAnalyze(sessionId, metadata);

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

<style scoped>
/* ── Reset (scoped) ── */
.container {
  margin: 0 auto;
  padding: 0 20px;
}

/* Focus indicators */
button:focus-visible, a:focus-visible {
  outline: 2px solid #58a6ff;
  outline-offset: 2px;
  box-shadow: 0 0 0 4px rgba(88, 166, 255, 0.2);
}

/* Header */
.header {
  padding: 16px 20px;
  border-bottom: 1px solid #30363d;
  display: flex;
  align-items: center;
  gap: 16px;
  position: sticky;
  top: 0;
  background: #0d1117;
  z-index: 10;
}
.nav-btn {
  padding: 6px 12px;
  background: #21262d;
  border: 1px solid #30363d;
  border-radius: 6px;
  color: #c9d1d9;
  text-decoration: none;
  font-size: 14px;
  transition: all 0.2s;
}
.nav-btn:hover {
  background: #30363d;
  border-color: #58a6ff;
}
h1 {
  color: #58a6ff;
  font-size: 20px;
  flex: 1;
}

/* Summary cards */
:deep(.summary-grid) {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 12px;
  margin: 20px auto;
}
:deep(.summary-card) {
  background: #161b22;
  border: 1px solid #30363d;
  border-radius: 8px;
  padding: 16px;
}
:deep(.summary-card-label) {
  font-size: 12px;
  color: #7d8590;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 4px;
}
:deep(.summary-card-value) {
  font-size: 24px;
  font-weight: 600;
  color: #e6edf3;
}
:deep(.summary-card-sub) {
  font-size: 12px;
  color: #7d8590;
  margin-top: 2px;
}

/* Section */
:deep(.section) {
  margin: 24px 0;
}
:deep(.section-title) {
  font-size: 16px;
  font-weight: 600;
  color: #e6edf3;
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid #30363d;
}

/* Tabs */
.tabs {
  display: flex;
  gap: 4px;
  margin-bottom: 16px;
  border-bottom: 1px solid #30363d;
  padding-bottom: 0;
}
.tab {
  padding: 8px 16px;
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  color: #7d8590;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
  font-family: inherit;
}
.tab:hover {
  color: #c9d1d9;
}
.tab.active {
  color: #58a6ff;
  border-bottom-color: #58a6ff;
}

/* Gantt */
:deep(.gantt-container) {
  overflow-x: auto;
  overflow-y: visible;
  padding-bottom: 8px;
  padding-top: 22px;
  position: relative;
}
:deep(.gantt-crosshair) {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 1px;
  background: rgba(139, 148, 158, 0.5);
  pointer-events: none;
  z-index: 10;
}
:deep(.gantt-crosshair-label) {
  position: absolute;
  top: 4px;
  left: 50%;
  transform: translateX(-50%);
  background: #30363d;
  color: #e6edf3;
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 3px;
  white-space: nowrap;
  pointer-events: none;
}
:deep(.gantt-row) {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 6px 0;
  border-bottom: 1px solid #21262d;
}
:deep(.gantt-row:last-child) {
  border-bottom: none;
}
:deep(.gantt-label) {
  min-width: 200px;
  max-width: 200px;
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex-shrink: 0;
}
:deep(.gantt-bar-area) {
  flex: 1;
  min-width: 300px;
  height: 24px;
  position: relative;
  background: rgba(110, 118, 129, 0.05);
  border-radius: 4px;
}
:deep(.gantt-bar) {
  position: absolute;
  height: 100%;
  border-radius: 4px;
  min-width: 3px;
  display: flex;
  align-items: center;
  padding: 0 6px;
  font-size: 11px;
  font-weight: 500;
  color: #fff;
  white-space: nowrap;
  overflow: visible;
}
:deep(.gantt-bar.subagent) { background: rgba(63, 185, 80, 0.8); }
:deep(.gantt-bar.subagent-failed) { background: rgba(248, 81, 73, 0.8); }
:deep(.gantt-bar.subagent-incomplete) { background: rgba(210, 153, 34, 0.8); }
:deep(.gantt-bar.turn) { background: rgba(35, 134, 54, 0.8); }
:deep(.gantt-bar.tool) { background: rgba(158, 106, 3, 0.6); }
:deep(.gantt-bar.agent-op) {
  background: rgba(139, 148, 158, 0.3);
  border: 1px dashed rgba(139, 148, 158, 0.5);
}
:deep(.gantt-bar.user-req) {
  background: rgba(88, 166, 255, 0.35);
  border: 1px solid rgba(88, 166, 255, 0.6);
}
:deep(.gantt-label.user-req) {
  font-weight: 600;
  color: #e6edf3;
}
:deep(.gantt-label.user-req .user-req-badge) {
  margin-right: 6px;
}
:deep(.gantt-label.user-req .user-req-msg) {
  font-weight: 400;
  font-size: 11px;
  color: #8b949e;
  overflow: hidden;
  text-overflow: ellipsis;
}
:deep(.gantt-label.agent-op) {
  color: #7d8590;
  font-style: italic;
}
:deep(.gantt-label.agent-op .agent-op-icon) {
  color: #8b949e;
  margin-right: 4px;
}
:deep(.gantt-label.agent-op .agent-op-summary) {
  font-size: 11px;
  color: #6e7681;
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
}
:deep(.gantt-row.indented .gantt-label) {
  padding-left: 20px;
}
:deep(.gantt-divider) {
  border-bottom: 1px solid #30363d;
  padding: 4px 0;
  margin: 2px 0;
  display: flex;
  align-items: center;
  gap: 8px;
  color: #7d8590;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
:deep(.gantt-divider::before),
:deep(.gantt-divider::after) {
  content: '';
  flex: 1;
  height: 1px;
  background: #30363d;
}
:deep(.gantt-time-axis) {
  display: flex;
  justify-content: space-between;
  margin-left: 212px;
  padding: 4px 0;
  font-size: 11px;
  color: #7d8590;
  font-family: 'SF Mono', 'Monaco', 'Consolas', monospace;
  border-top: 1px solid #30363d;
}

/* Event markers */
:deep(.event-marker) {
  position: absolute;
  top: 50%;
  transform: translate(-50%, -50%);
  z-index: 2;
  cursor: pointer;
  transition: transform 0.15s;
}
:deep(.event-marker:hover) {
  transform: translate(-50%, -50%) scale(1.8);
  z-index: 10;
}
:deep(.event-marker--circle) {
  width: 6px;
  height: 6px;
  border-radius: 50%;
}
:deep(.event-marker--diamond) {
  width: 6px;
  height: 6px;
  transform: translate(-50%, -50%) rotate(45deg);
}
:deep(.event-marker:hover .event-marker--diamond-inner) {
  transform: scale(1.8);
}
:deep(.event-marker--square) {
  width: 5px;
  height: 5px;
  border-radius: 1px;
}
:deep(.event-marker--triangle) {
  width: 0;
  height: 0;
  border-left: 4px solid transparent;
  border-right: 4px solid transparent;
  border-bottom: 7px solid currentColor;
}
:deep(.event-marker--cluster) {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 8px;
  font-weight: 700;
  color: #fff;
  border: 1px solid rgba(255,255,255,0.3);
}
:deep(.event-marker-tooltip) {
  display: none;
  position: absolute;
  bottom: calc(100% + 6px);
  left: 50%;
  transform: translateX(-50%);
  background: #1c2128;
  border: 1px solid #30363d;
  border-radius: 6px;
  padding: 6px 10px;
  font-size: 11px;
  color: #c9d1d9;
  white-space: nowrap;
  z-index: 100;
  pointer-events: none;
  box-shadow: 0 4px 12px rgba(0,0,0,0.4);
}
:deep(.event-marker:hover .event-marker-tooltip) {
  display: block;
}

/* Event legend */
:deep(.event-legend) {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  padding: 10px 14px;
  background: #161b22;
  border: 1px solid #30363d;
  border-radius: 6px;
  margin-bottom: 12px;
}
:deep(.event-legend-item) {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  color: #8b949e;
}
:deep(.event-legend-swatch) {
  width: 8px;
  height: 8px;
  border-radius: 2px;
  flex-shrink: 0;
}
:deep(.legend-toggle-btn) {
  background: none;
  border: 1px solid #30363d;
  color: #8b949e;
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 4px;
  cursor: pointer;
  margin-left: 8px;
  transition: all 0.2s;
}
:deep(.legend-toggle-btn:hover) {
  border-color: #58a6ff;
  color: #58a6ff;
}

/* Subagent link */
:deep(.subagent-link) {
  color: #58a6ff;
  text-decoration: none;
  transition: color 0.2s;
}
:deep(.subagent-link:hover) {
  color: #79c0ff;
  text-decoration: underline;
}

/* User req badge */
:deep(.user-req-badge) {
  display: inline-block;
  padding: 2px 8px;
  background: rgba(88, 166, 255, 0.15);
  color: #58a6ff;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
  font-family: 'SF Mono', 'Monaco', 'Consolas', monospace;
  flex-shrink: 0;
  margin-top: 2px;
}

/* Badges */
:deep(.badge) {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 3px;
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
}
:deep(.badge-subagent) { background: #8957e5; color: #fff; }
:deep(.badge-tool) { background: #9e6a03; color: #fff; }
:deep(.badge-turn) { background: #238636; color: #fff; }
:deep(.badge-read) { background: rgba(88, 166, 255, 0.15); color: #58a6ff; border: 1px solid rgba(88, 166, 255, 0.3); }
:deep(.badge-write) { background: rgba(63, 185, 80, 0.15); color: #3fb950; border: 1px solid rgba(63, 185, 80, 0.3); }
:deep(.badge-edit) { background: rgba(210, 153, 34, 0.15); color: #d29922; border: 1px solid rgba(210, 153, 34, 0.3); }
:deep(.badge-create) { background: rgba(63, 185, 80, 0.15); color: #3fb950; border: 1px solid rgba(63, 185, 80, 0.3); }
:deep(.badge-bash) { background: rgba(139, 148, 158, 0.15); color: #8b949e; border: 1px solid rgba(139, 148, 158, 0.3); }
:deep(.badge-search) { background: rgba(191, 57, 137, 0.15); color: #f778ba; border: 1px solid rgba(191, 57, 137, 0.3); }
:deep(.badge-other) { background: rgba(110, 118, 129, 0.15); color: #8b949e; border: 1px solid rgba(110, 118, 129, 0.3); }

/* Empty state */
.empty-state {
  text-align: center;
  padding: 40px;
  color: #7d8590;
  font-size: 14px;
}

/* Markdown Styles in section */
:deep(.section h1), :deep(.section h2), :deep(.section h3) {
  color: #c9d1d9;
  margin-top: 24px;
  margin-bottom: 16px;
  font-weight: 600;
  line-height: 1.25;
}
:deep(.section h1) { font-size: 2em; border-bottom: 1px solid #21262d; padding-bottom: 8px; }
:deep(.section h2) { font-size: 1.5em; border-bottom: 1px solid #21262d; padding-bottom: 8px; }
:deep(.section h3) { font-size: 1.25em; }
:deep(.section p) { margin-bottom: 16px; }
:deep(.section ul), :deep(.section ol) { margin-bottom: 16px; padding-left: 2em; }
:deep(.section li) { margin-bottom: 8px; }
:deep(.section code) {
  background: #161b22;
  padding: 2px 6px;
  border-radius: 3px;
  font-family: ui-monospace, 'Cascadia Code', monospace;
  font-size: 85%;
}
:deep(.section pre) {
  background: #161b22;
  border: 1px solid #30363d;
  border-radius: 6px;
  padding: 16px;
  overflow-x: auto;
  margin-bottom: 16px;
}
:deep(.section pre code) {
  background: transparent;
  padding: 0;
}
:deep(.section blockquote) {
  border-left: 4px solid #30363d;
  padding-left: 16px;
  color: #7d8590;
  margin-bottom: 16px;
}
:deep(.section hr) {
  border: none;
  border-top: 1px solid #21262d;
  margin: 24px 0;
}
:deep(.section table) {
  border-collapse: collapse;
  width: 100%;
  margin-bottom: 16px;
}
:deep(.section table th),
:deep(.section table td) {
  border: 1px solid #30363d;
  padding: 8px 13px;
  text-align: left;
}
:deep(.section table th) {
  background: #161b22;
  font-weight: 600;
}

/* Responsive */
@media (max-width: 768px) {
  :deep(.summary-grid) {
    grid-template-columns: repeat(2, 1fr);
  }
  :deep(.gantt-label) {
    min-width: 120px;
    max-width: 120px;
  }
}
</style>
