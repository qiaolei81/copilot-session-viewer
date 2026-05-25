<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import AppHeader from '../components/common/AppHeader.vue'
import LoadingSpinner from '../components/common/LoadingSpinner.vue'
import SummaryCards from '../components/time-analyze/SummaryCards.vue'
import TabBar from '../components/time-analyze/TabBar.vue'
import GanttTimeline from '../components/time-analyze/GanttTimeline.vue'
import ToolSummaryGrid from '../components/time-analyze/ToolSummaryGrid.vue'
import InsightPanel from '../components/time-analyze/InsightPanel.vue'

import { useSessionTimeline } from '../composables/useSessionTimeline.js'
import { useSubagentAnalysis } from '../composables/useSubagentAnalysis.js'
import { useToolAnalysis } from '../composables/useToolAnalysis.js'
import { useTurnAnalysis } from '../composables/useTurnAnalysis.js'
import { useTimeBreakdown } from '../composables/useTimeBreakdown.js'
import { useGapAnalysis } from '../composables/useGapAnalysis.js'
import { useUnifiedTimeline } from '../composables/useUnifiedTimeline.js'
import { useInsight } from '../composables/useInsight.js'
import { useUsageUtils } from '../composables/useUsageUtils.js'
import { formatTokens } from '../composables/useFormatters.js'

const route = useRoute()
const sessionId = computed(() => route.params.id)

// State
const events = ref([])
const metadata = ref({})
const loading = ref(true)
const error = ref(null)
const activeTab = ref('timeline')

// Composables
const { sessionStart, sessionEnd, totalDuration, sortedEvents } = useSessionTimeline(events)
const { subagentToolMap, subagentAnalysis, subagentStats } = useSubagentAnalysis(sortedEvents, sessionStart, sessionEnd)
const {
  toolAnalysis, totalToolCount, successRate, errorCount,
  totalToolTime, toolTimeByCategory, maxCategoryTime,
} = useToolAnalysis(sortedEvents)
const { turnAnalysis, groupedTurns } = useTurnAnalysis(sortedEvents, sessionEnd)
const { timeBreakdown } = useTimeBreakdown(sortedEvents, totalDuration, totalToolTime)
const { buildAgentOpItem } = useGapAnalysis(sortedEvents, subagentToolMap, sessionStart, sessionEnd)
const { unifiedTimelineItems, ganttPosition } = useUnifiedTimeline(
  groupedTurns, subagentAnalysis, sortedEvents, sessionStart, sessionEnd, buildAgentOpItem,
)

const {
  insightReport, insightLog, insightLoading, insightError, insightGeneratedAt,
  insightStatus, insightStartedAt, insightAgeMs,
  generateInsight, regenerateInsight,
} = useInsight(sessionId)

const { getDisplayInputTokens, getCacheHitRatio } = useUsageUtils()

// Token usage from metadata
const totalTokens = computed(() => {
  if (!metadata.value.usage?.modelMetrics) return 0
  let total = 0
  for (const model in metadata.value.usage.modelMetrics) {
    const usage = metadata.value.usage.modelMetrics[model].usage
    if (usage) total += (usage.inputTokens || 0) + (usage.outputTokens || 0)
  }
  return total
})

const totalRequests = computed(() => {
  if (!metadata.value.usage?.modelMetrics) return 0
  let total = 0
  for (const model in metadata.value.usage.modelMetrics) {
    total += (metadata.value.usage.modelMetrics[model].requests?.count || 0)
  }
  return total
})

const totalModels = computed(() => {
  if (!metadata.value.usage?.modelMetrics) return 0
  return Object.keys(metadata.value.usage.modelMetrics).length
})

// Load data
onMounted(async () => {
  try {
    const [eventsResp, metaResp] = await Promise.all([
      fetch('/api/sessions/' + sessionId.value + '/events'),
      fetch('/api/sessions/' + sessionId.value),
    ])
    if (!eventsResp.ok) throw new Error('Failed to load events: ' + eventsResp.statusText)
    const eventsData = await eventsResp.json()
    events.value = eventsData.sort((a, b) => {
      const timeA = a.timestamp ? new Date(a.timestamp).getTime() : 0
      const timeB = b.timestamp ? new Date(b.timestamp).getTime() : 0
      if (timeA !== timeB) return timeA - timeB
      return (a._fileIndex ?? 0) - (b._fileIndex ?? 0)
    })
    if (metaResp.ok) {
      metadata.value = await metaResp.json()
    }
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="time-analyze-page">
    <AppHeader
      :title="'⏱ Analysis: ' + sessionId"
      :backLink="'/session/' + sessionId"
      :showWipBadge="metadata.sessionStatus === 'wip'"
    />

    <div class="container">
      <LoadingSpinner v-if="loading" text="Loading events..." />

      <div v-else-if="error" class="error-state">
        &#10060; {{ error }}
      </div>

      <div v-else>
        <SummaryCards
          :totalDuration="totalDuration"
          :sessionStart="sessionStart"
          :sessionEnd="sessionEnd"
          :groupedTurnsCount="groupedTurns.length"
          :turnCount="turnAnalysis.length"
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

        <TabBar v-model:activeTab="activeTab" />

        <!-- Timeline Tab -->
        <div v-if="activeTab === 'timeline'">
          <GanttTimeline
            :sessionId="sessionId"
            :unifiedTimelineItems="unifiedTimelineItems"
            :events="events"
            :sessionStart="sessionStart"
            :sessionEnd="sessionEnd"
            :totalDuration="totalDuration"
            :ganttPosition="ganttPosition"
          />
          <ToolSummaryGrid
            :toolTimeByCategory="toolTimeByCategory"
            :maxCategoryTime="maxCategoryTime"
          />
        </div>

        <!-- Insight Tab -->
        <InsightPanel
          v-if="activeTab === 'insight'"
          :insightStatus="insightStatus"
          :insightReport="insightReport"
          :insightLog="insightLog"
          :insightLoading="insightLoading"
          :insightError="insightError"
          :insightGeneratedAt="insightGeneratedAt"
          :insightStartedAt="insightStartedAt"
          :insightAgeMs="insightAgeMs"
          @generate="generateInsight(false)"
          @regenerate="regenerateInsight"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.time-analyze-page {
  min-height: 100vh;
  background: #0d1117;
  color: #c9d1d9;
}
.container {
  max-width: 1400px;
  margin: 0 auto;
  padding: 0 20px;
}
.error-state {
  text-align: center;
  padding: 60px;
  color: #f85149;
  font-size: 14px;
}
</style>
