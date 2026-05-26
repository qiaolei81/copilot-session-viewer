/**
 * Time Analysis composable — orchestrator.
 *
 * Delegates to focused sub-composables and returns the same flat interface.
 */
import { ref, computed } from 'vue';
import { useTimelineCore, EVENT_MARKER_CATEGORIES } from './useTimelineCore.js';
import { useSubagentTimeline } from './useSubagentTimeline.js';
import { useTurnAnalysis } from './useTurnAnalysis.js';
import { useToolAnalysis } from './useToolAnalysis.js';
import { useGapAnalysis } from './useGapAnalysis.js';
import { useTokenUsage } from './useTokenUsage.js';
import { useInsight } from './useInsight.js';
import { useGanttInteraction } from './useGanttInteraction.js';

export function useTimeAnalyze(sessionId, metadata, _source) {
  const activeTab = ref('timeline');

  // 1. Core timeline
  const core = useTimelineCore(sessionId, _source);

  // 2. Subagent timeline
  const subagent = useSubagentTimeline(
    core.sortedEvents, core.sessionStart, core.sessionEnd, core.totalDuration
  );

  // 3. Turn analysis
  const turns = useTurnAnalysis(
    core.sortedEvents, core.sessionEnd, core.normalizeMessage, core.events
  );

  // 4. Tool analysis
  const tools = useToolAnalysis(core.sortedEvents);

  // 5. Gap analysis
  const gaps = useGapAnalysis(core.sortedEvents, core.totalDuration, tools.totalToolTime);

  // 6. Token usage
  const tokens = useTokenUsage(metadata);

  // 7. Insight
  const insight = useInsight(sessionId, _source);

  // 8. Unified timeline (computed here since it depends on turns + subagent)
  const unifiedTimelineItems = computed(() => {
    const items = [];
    const groups = turns.groupedTurns.value;
    const agents = subagent.subagentAnalysis.value;
    const sorted = core.sortedEvents.value;

    if (groups.length) {
      for (let gi = 0; gi < groups.length; gi++) {
        const group = groups[gi];
        const groupTurns = group.turns;
        if (!groupTurns.length) continue;

        const reqStart = new Date(groupTurns[0].startTime).getTime();
        const reqEnd = new Date(groupTurns[groupTurns.length - 1].endTime).getTime();

        items.push({
          rowType: 'user-req',
          userReqNumber: group.userReqNumber,
          message: group.message,
          startTime: groupTurns[0].startTime,
          endTime: groupTurns[groupTurns.length - 1].endTime,
          duration: reqEnd - reqStart,
        });

        const reqAgents = agents.filter(sa => {
          if (!sa.startTime) return false;
          const saStart = new Date(sa.startTime).getTime();
          return saStart >= reqStart && saStart <= reqEnd;
        });

        if (reqAgents.length) {
          for (let i = 0; i < reqAgents.length; i++) {
            const sa = reqAgents[i];

            const gapStart = i === 0
              ? reqStart
              : new Date(reqAgents[i - 1].endTime).getTime();
            const gapEnd = new Date(sa.startTime).getTime();

            if (gapEnd - gapStart > 500) {
              const agentOp = subagent.buildAgentOpItem(sorted, gapStart, gapEnd);
              agentOp.rowType = 'main-agent';
              items.push(agentOp);
            }

            items.push({
              ...sa,
              rowType: 'subagent',
              itemType: 'subagent',
            });

            if (i === reqAgents.length - 1) {
              const trailingStart = new Date(sa.endTime).getTime();
              const trailingEnd = reqEnd;
              if (trailingEnd - trailingStart > 500) {
                const agentOp = subagent.buildAgentOpItem(sorted, trailingStart, trailingEnd);
                agentOp.rowType = 'main-agent';
                items.push(agentOp);
              }
            }
          }
        } else {
          if (reqEnd - reqStart > 0) {
            const agentOp = subagent.buildAgentOpItem(sorted, reqStart, reqEnd);
            agentOp.rowType = 'main-agent';
            items.push(agentOp);
          }
        }
      }
    } else if (subagent.subagentTimelineItems.value.length) {
      for (const item of subagent.subagentTimelineItems.value) {
        items.push({
          ...item,
          rowType: item.itemType === 'agent-op' ? 'main-agent' : 'subagent',
        });
      }
    }

    return items;
  });

  // 9. Gantt interaction
  const gantt = useGanttInteraction(
    core.sessionStart, core.totalDuration, sessionId,
    unifiedTimelineItems, core.normalizeMessage, core.formatDuration
  );

  return {
    sessionId, metadata, events: core.events, loading: core.loading, error: core.error, activeTab,
    sortField: tools.sortField, sortDir: tools.sortDir,
    insightReport: insight.insightReport, insightLog: insight.insightLog,
    insightLoading: insight.insightLoading, insightError: insight.insightError,
    insightGeneratedAt: insight.insightGeneratedAt,
    insightStatus: insight.insightStatus, insightLastUpdate: insight.insightLastUpdate,
    insightStartedAt: insight.insightStartedAt, insightAgeMs: insight.insightAgeMs,
    renderedInsight: insight.renderedInsight,
    generateInsight: insight.generateInsight, regenerateInsight: insight.regenerateInsight,
    formatDuration: core.formatDuration, formatTime: core.formatTime,
    formatDateTime: core.formatDateTime, formatTokens: core.formatTokens,
    normalizeMessage: core.normalizeMessage,
    sessionStart: core.sessionStart, sessionEnd: core.sessionEnd, totalDuration: core.totalDuration,
    subagentAnalysis: subagent.subagentAnalysis, maxSubagentDuration: subagent.maxSubagentDuration,
    subagentTimelineItems: subagent.subagentTimelineItems, subagentStats: subagent.subagentStats,
    EVENT_MARKER_CATEGORIES, showMarkerLegend: subagent.showMarkerLegend,
    copyLabel: gantt.copyLabel, copyTimelineMarkdown: gantt.copyTimelineMarkdown,
    ganttCrosshairX: gantt.ganttCrosshairX, ganttCrosshairTime: gantt.ganttCrosshairTime,
    onGanttMouseMove: gantt.onGanttMouseMove, onGanttMouseLeave: gantt.onGanttMouseLeave,
    turnAnalysis: turns.turnAnalysis, maxTurnDuration: turns.maxTurnDuration,
    groupedTurns: turns.groupedTurns,
    unifiedTimelineItems,
    toolAnalysis: tools.toolAnalysis, sortedToolAnalysis: tools.sortedToolAnalysis,
    maxToolDuration: tools.maxToolDuration,
    totalTokens: tokens.totalTokens, totalRequests: tokens.totalRequests,
    totalModels: tokens.totalModels,
    getModelCacheHitRatio: tokens.getModelCacheHitRatio,
    getDisplayUsageInputTokens: tokens.getDisplayUsageInputTokens,
    toolTimeByCategory: tools.toolTimeByCategory, maxCategoryTime: tools.maxCategoryTime,
    totalToolTime: tools.totalToolTime, totalToolCount: tools.totalToolCount,
    avgToolDuration: tools.avgToolDuration, longestTool: tools.longestTool,
    successRate: tools.successRate, errorCount: tools.errorCount,
    timeBreakdown: gaps.timeBreakdown,
    gapAnalysis: gaps.gapAnalysis, maxGapDuration: gaps.maxGapDuration, gapStats: gaps.gapStats,
    ganttPosition: core.ganttPosition, toggleSort: tools.toggleSort, sortIcon: tools.sortIcon,
    getToolBadgeClass: gantt.getToolBadgeClass, getOpBadgeClass: gantt.getOpBadgeClass,
  };
}
