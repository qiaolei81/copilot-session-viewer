<script setup>
import { ref } from 'vue'
import { useFormatters } from '../../composables/useFormatters.js'
import { EVENT_MARKER_CATEGORIES } from '../../composables/useEventMarkers.js'
import { useGanttCrosshair } from '../../composables/useGanttCrosshair.js'
import { useMermaidExport } from '../../composables/useMermaidExport.js'

const { formatDuration, formatTime } = useFormatters()

const props = defineProps({
  sessionId: { type: String, required: true },
  unifiedTimelineItems: { type: Array, default: () => [] },
  events: { type: Array, default: () => [] },
  sessionStart: { type: Number, default: null },
  sessionEnd: { type: Number, default: null },
  totalDuration: { type: Number, default: 0 },
  ganttPosition: { type: Function, required: true },
})

const showMarkerLegend = ref(false)

const { ganttCrosshairX, ganttCrosshairTime, onGanttMouseMove, onGanttMouseLeave } =
  useGanttCrosshair(
    { get value() { return props.sessionStart } },
    { get value() { return props.totalDuration } },
  )

const { copyLabel, copyTimelineMarkdown } = useMermaidExport(
  { get value() { return props.sessionId } },
  { get value() { return props.unifiedTimelineItems } },
)
</script>

<template>
  <div class="section">
    <div v-if="!unifiedTimelineItems.length" class="empty-state">
      No timeline data found in this session.
    </div>
    <div v-else>
      <!-- Section Title -->
      <div class="section-title">
        Timeline
        <button class="legend-toggle-btn" @click="showMarkerLegend = !showMarkerLegend">
          {{ showMarkerLegend ? 'Hide Legend' : 'Show Legend' }}
        </button>
        <button class="legend-toggle-btn" @click="copyTimelineMarkdown">
          {{ copyLabel }}
        </button>
      </div>

      <!-- Event Legend -->
      <div v-show="showMarkerLegend" class="event-legend">
        <div class="event-legend-item">
          <span class="event-legend-swatch" style="background: rgba(88, 166, 255, 0.5);"></span>
          <span>User Request</span>
        </div>
        <div class="event-legend-item">
          <span class="event-legend-swatch" style="background: rgba(63, 185, 80, 0.8);"></span>
          <span>Sub-Agent</span>
        </div>
        <div class="event-legend-item">
          <span class="event-legend-swatch" style="background: rgba(139, 148, 158, 0.3); border: 1px dashed rgba(139, 148, 158, 0.5);"></span>
          <span>Main Agent</span>
        </div>
        <div class="event-legend-item">
          <span class="event-legend-swatch" style="background: #d29922;"></span>
          <span>Tool (no errors)</span>
        </div>
        <div class="event-legend-item">
          <span class="event-legend-swatch" style="background: linear-gradient(to right, #d29922, #f85149);"></span>
          <span>Tool (error gradient)</span>
        </div>
        <div class="event-legend-item">
          <span class="event-legend-swatch" style="background: #f85149;"></span>
          <span>Tool Error (100%)</span>
        </div>
        <template v-for="(cat, type) in EVENT_MARKER_CATEGORIES" :key="type">
          <div v-if="type && !type.startsWith('tool.')" class="event-legend-item">
            <span
              class="event-legend-swatch"
              :style="{
                background: cat.color,
                borderRadius: cat.shape === 'circle' ? '50%' : cat.shape === 'diamond' ? '1px' : '2px',
                transform: cat.shape === 'diamond' ? 'rotate(45deg)' : 'none',
              }"
            ></span>
            <span>{{ cat.label }}</span>
          </div>
        </template>
      </div>

      <!-- Gantt Container -->
      <div class="gantt-container" @mousemove="onGanttMouseMove" @mouseleave="onGanttMouseLeave">
        <!-- Crosshair -->
        <div v-if="ganttCrosshairX !== null" class="gantt-crosshair" :style="{ left: ganttCrosshairX + 'px' }">
          <div class="gantt-crosshair-label">{{ ganttCrosshairTime }}</div>
        </div>

        <template v-for="(item, idx) in unifiedTimelineItems" :key="'utl-' + idx">
          <!-- Divider row -->
          <div v-if="item.rowType === 'divider'" class="gantt-divider">Tool Summary</div>

          <!-- User Request row -->
          <div v-else-if="item.rowType === 'user-req'" class="gantt-row">
            <div class="gantt-label user-req" :title="item.message || 'No message'">
              <span class="user-req-badge">UserReq {{ item.userReqNumber }}</span>
              <span class="user-req-msg">{{ (item.message || '').substring(0, 40) }}{{ (item.message || '').length > 40 ? '...' : '' }}</span>
            </div>
            <div class="gantt-bar-area">
              <div
                class="gantt-bar user-req"
                :style="ganttPosition(item.startTime, item.endTime)"
                :title="'UserReq ' + item.userReqNumber + ' — ' + formatDuration(item.duration)"
              >
                {{ formatDuration(item.duration) }}
              </div>
            </div>
          </div>

          <!-- Sub-Agent row -->
          <div v-else-if="item.rowType === 'subagent'" class="gantt-row indented">
            <div class="gantt-label" :title="item.name">
              <a
                :href="'/session/' + sessionId + '?eventType=subagent.started&eventName=' + encodeURIComponent(item.name) + '&eventTimestamp=' + encodeURIComponent(item.startTime || '')"
                class="subagent-link"
                title="View events from here"
              >
                <span :style="{ color: item.status === 'completed' ? '#3fb950' : item.status === 'failed' ? '#f85149' : '#d29922' }">
                  {{ item.status === 'completed' ? '✓' : item.status === 'failed' ? '✗' : '⏳' }}
                </span>
                {{ item.name }}
              </a>
            </div>
            <div class="gantt-bar-area">
              <div
                :class="['gantt-bar', item.status === 'completed' ? 'subagent' : item.status === 'failed' ? 'subagent-failed' : 'subagent-incomplete']"
                :style="ganttPosition(item.startTime, item.endTime)"
                :title="item.name + ' — ' + formatDuration(item.duration)"
              >
                {{ formatDuration(item.duration) }}
                <!-- Event markers -->
                <template v-if="item.innerEventMarkers && item.innerEventMarkers.length">
                  <span
                    v-for="(marker, midx) in item.innerEventMarkers"
                    :key="'m-' + midx"
                    class="event-marker"
                    :style="{ left: marker.position + '%' }"
                  >
                    <span v-if="marker.shape === 'cluster'" class="event-marker--cluster" :style="{ background: marker.color }">{{ marker.count }}</span>
                    <span v-else-if="marker.shape === 'circle'" class="event-marker--circle" :style="{ background: marker.color }"></span>
                    <span v-else-if="marker.shape === 'diamond'" class="event-marker--diamond" :style="{ background: marker.color }"></span>
                    <span v-else-if="marker.shape === 'square'" class="event-marker--square" :style="{ background: marker.color }"></span>
                    <span v-else-if="marker.shape === 'triangle'" class="event-marker--triangle" :style="{ color: marker.color }"></span>
                    <span class="event-marker-tooltip">
                      <template v-if="marker.shape === 'cluster'">{{ marker.count }} events: {{ marker.label }}</template>
                      <template v-else>{{ marker.label }}<span v-if="marker.toolName"> ({{ marker.toolName }})</span></template>
                    </span>
                  </span>
                </template>
              </div>
            </div>
          </div>

          <!-- Main Agent gap row -->
          <div v-else-if="item.rowType === 'main-agent'" class="gantt-row indented">
            <div class="gantt-label agent-op" :title="item.summary">
              <span class="agent-op-icon">&#9881;</span>
              <span>Main Agent</span>
              <span class="agent-op-summary">{{ item.summary }}</span>
            </div>
            <div class="gantt-bar-area">
              <div
                class="gantt-bar agent-op"
                :style="ganttPosition(item.startTime, item.endTime)"
                :title="'Main Agent — ' + formatDuration(item.duration)"
              >
                {{ formatDuration(item.duration) }}
                <!-- Event markers -->
                <template v-if="item.innerEventMarkers && item.innerEventMarkers.length">
                  <span
                    v-for="(marker, midx) in item.innerEventMarkers"
                    :key="'m-' + midx"
                    class="event-marker"
                    :style="{ left: marker.position + '%' }"
                  >
                    <span v-if="marker.shape === 'cluster'" class="event-marker--cluster" :style="{ background: marker.color }">{{ marker.count }}</span>
                    <span v-else-if="marker.shape === 'circle'" class="event-marker--circle" :style="{ background: marker.color }"></span>
                    <span v-else-if="marker.shape === 'diamond'" class="event-marker--diamond" :style="{ background: marker.color }"></span>
                    <span v-else-if="marker.shape === 'square'" class="event-marker--square" :style="{ background: marker.color }"></span>
                    <span v-else-if="marker.shape === 'triangle'" class="event-marker--triangle" :style="{ color: marker.color }"></span>
                    <span class="event-marker-tooltip">
                      <template v-if="marker.shape === 'cluster'">{{ marker.count }} events: {{ marker.label }}</template>
                      <template v-else>{{ marker.label }}<span v-if="marker.toolName"> ({{ marker.toolName }})</span></template>
                    </span>
                  </span>
                </template>
              </div>
            </div>
          </div>
        </template>

        <!-- Time Axis -->
        <div class="gantt-time-axis">
          <span>{{ formatTime(events[0]?.timestamp) }}</span>
          <span>{{ formatTime(events[events.length - 1]?.timestamp) }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.section { margin: 24px 0; }
.section-title {
  font-size: 16px;
  font-weight: 600;
  color: #e6edf3;
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid #30363d;
  display: flex;
  align-items: center;
  gap: 8px;
}
.empty-state { text-align: center; padding: 40px; color: #7d8590; font-size: 14px; }

/* Legend */
.legend-toggle-btn {
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
.legend-toggle-btn:hover { border-color: #58a6ff; color: #58a6ff; }
.event-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  padding: 10px 14px;
  background: #161b22;
  border: 1px solid #30363d;
  border-radius: 6px;
  margin-bottom: 12px;
}
.event-legend-item { display: flex; align-items: center; gap: 5px; font-size: 11px; color: #8b949e; }
.event-legend-swatch { width: 8px; height: 8px; border-radius: 2px; flex-shrink: 0; }

/* Gantt */
.gantt-container {
  overflow-x: auto;
  overflow-y: visible;
  padding-bottom: 8px;
  padding-top: 22px;
  position: relative;
}
.gantt-crosshair {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 1px;
  background: rgba(139, 148, 158, 0.5);
  pointer-events: none;
  z-index: 10;
}
.gantt-crosshair-label {
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
.gantt-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 6px 0;
  border-bottom: 1px solid #21262d;
}
.gantt-row:last-child { border-bottom: none; }
.gantt-row.indented .gantt-label { padding-left: 20px; }
.gantt-label {
  min-width: 200px;
  max-width: 200px;
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex-shrink: 0;
}
.gantt-bar-area {
  flex: 1;
  min-width: 300px;
  height: 24px;
  position: relative;
  background: rgba(110, 118, 129, 0.05);
  border-radius: 4px;
}
.gantt-bar {
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
.gantt-bar.subagent { background: rgba(63, 185, 80, 0.8); }
.gantt-bar.subagent-failed { background: rgba(248, 81, 73, 0.8); }
.gantt-bar.subagent-incomplete { background: rgba(210, 153, 34, 0.8); }
.gantt-bar.user-req { background: rgba(88, 166, 255, 0.35); border: 1px solid rgba(88, 166, 255, 0.6); }
.gantt-bar.agent-op { background: rgba(139, 148, 158, 0.3); border: 1px dashed rgba(139, 148, 158, 0.5); }

/* Labels */
.gantt-label.user-req { font-weight: 600; color: #e6edf3; }
.gantt-label.user-req .user-req-badge {
  display: inline-block;
  padding: 2px 8px;
  background: rgba(88, 166, 255, 0.15);
  color: #58a6ff;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
  font-family: 'SF Mono', 'Monaco', 'Consolas', monospace;
  margin-right: 6px;
}
.gantt-label.user-req .user-req-msg { font-weight: 400; font-size: 11px; color: #8b949e; overflow: hidden; text-overflow: ellipsis; }
.gantt-label.agent-op { color: #7d8590; font-style: italic; }
.gantt-label.agent-op .agent-op-icon { color: #8b949e; margin-right: 4px; }
.gantt-label.agent-op .agent-op-summary { font-size: 11px; color: #6e7681; display: block; overflow: hidden; text-overflow: ellipsis; }
.subagent-link { color: #58a6ff; text-decoration: none; transition: color 0.2s; }
.subagent-link:hover { color: #79c0ff; text-decoration: underline; }

/* Event markers */
.event-marker {
  position: absolute;
  top: 50%;
  transform: translate(-50%, -50%);
  z-index: 2;
  cursor: pointer;
  transition: transform 0.15s;
}
.event-marker:hover { transform: translate(-50%, -50%) scale(1.8); z-index: 10; }
.event-marker--circle { width: 6px; height: 6px; border-radius: 50%; display: inline-block; }
.event-marker--diamond { width: 6px; height: 6px; transform: rotate(45deg); display: inline-block; }
.event-marker--square { width: 5px; height: 5px; border-radius: 1px; display: inline-block; }
.event-marker--triangle { width: 0; height: 0; border-left: 4px solid transparent; border-right: 4px solid transparent; border-bottom: 7px solid currentColor; }
.event-marker--cluster {
  width: 14px; height: 14px; border-radius: 50%;
  display: inline-flex; align-items: center; justify-content: center;
  font-size: 8px; font-weight: 700; color: #fff;
  border: 1px solid rgba(255,255,255,0.3);
}
.event-marker-tooltip {
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
.event-marker:hover .event-marker-tooltip { display: block; }

/* Time Axis */
.gantt-time-axis {
  display: flex;
  justify-content: space-between;
  margin-left: 212px;
  padding: 4px 0;
  font-size: 11px;
  color: #7d8590;
  font-family: 'SF Mono', 'Monaco', 'Consolas', monospace;
  border-top: 1px solid #30363d;
}
.gantt-divider {
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
.gantt-divider::before, .gantt-divider::after { content: ''; flex: 1; height: 1px; background: #30363d; }

@media (max-width: 768px) {
  .gantt-label { min-width: 120px; max-width: 120px; }
}
</style>
