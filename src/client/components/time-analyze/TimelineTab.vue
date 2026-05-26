<template>
  <div class="section">
    <div v-if="error" class="empty-state" style="color: #f85149;">
      Error loading timeline: {{ error }}
    </div>
    <div v-else-if="!unifiedTimelineItems.length" class="empty-state">
      No timeline data found in this session.
    </div>
    <div v-else>
      <!-- Section A: Gantt Chart -->
      <div class="section-title" style="display: flex; align-items: center;">
        Timeline
        <button class="legend-toggle-btn" @click="$emit('toggle-legend')">
          {{ showMarkerLegend ? 'Hide Legend' : 'Show Legend' }}
        </button>
        <button class="legend-toggle-btn" @click="$emit('copy-timeline')">
          {{ copyLabel }}
        </button>
      </div>

      <!-- Event Legend -->
      <div v-show="showMarkerLegend" class="event-legend">
        <div class="event-legend-item">
          <span class="event-legend-swatch" style="background: rgba(88, 166, 255, 0.5);" />
          <span>User Request</span>
        </div>
        <div class="event-legend-item">
          <span class="event-legend-swatch" style="background: rgba(63, 185, 80, 0.8);" />
          <span>Sub-Agent</span>
        </div>
        <div class="event-legend-item">
          <span class="event-legend-swatch" style="background: rgba(139, 148, 158, 0.3); border: 1px dashed rgba(139, 148, 158, 0.5);" />
          <span>Main Agent</span>
        </div>
        <div class="event-legend-item">
          <span class="event-legend-swatch" style="background: #d29922;" />
          <span>Tool (no errors)</span>
        </div>
        <div class="event-legend-item">
          <span class="event-legend-swatch" style="background: linear-gradient(to right, #d29922, #f85149);" />
          <span>Tool (error gradient)</span>
        </div>
        <div class="event-legend-item">
          <span class="event-legend-swatch" style="background: #f85149;" />
          <span>Tool Error (100%)</span>
        </div>
        <template v-for="(cat, type) in EVENT_MARKER_CATEGORIES" :key="type">
          <div v-if="type && !type.startsWith('tool.')" class="event-legend-item">
            <span class="event-legend-swatch" :style="{ background: cat.color, borderRadius: cat.shape === 'circle' ? '50%' : cat.shape === 'diamond' ? '1px' : '2px', transform: cat.shape === 'diamond' ? 'rotate(45deg)' : 'none' }" />
            <span>{{ cat.label }}</span>
          </div>
        </template>
      </div>

      <div class="gantt-container" @mousemove="onGanttMouseMove" @mouseleave="onGanttMouseLeave">
        <!-- Crosshair -->
        <div v-if="ganttCrosshairX !== null" class="gantt-crosshair" :style="{ left: ganttCrosshairX + 'px' }">
          <div class="gantt-crosshair-label">
{{ ganttCrosshairTime }}
</div>
        </div>
        <template v-for="(item, idx) in unifiedTimelineItems" :key="'utl-' + idx">
<!-- Divider row -->
          <div v-if="item.rowType === 'divider'" class="gantt-divider">
            Tool Summary
          </div>

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
          <div v-else-if="item.rowType === 'subagent'" :class="['gantt-row', 'indented']">
            <div class="gantt-label" :title="item.name">
              <router-link
                :to="'/session/' + sessionId + '?eventType=subagent.started&eventName=' + encodeURIComponent(item.name) + '&eventTimestamp=' + encodeURIComponent(item.startTime || '')"
                class="subagent-link"
                :title="'View events from here'"
              >
                <span :style="{ color: item.status === 'completed' ? '#3fb950' : item.status === 'failed' ? '#f85149' : '#d29922' }">
                  {{ item.status === 'completed' ? '✓' : item.status === 'failed' ? '✗' : '⏳' }}
                </span>
                {{ item.name }}
              </router-link>
            </div>
            <div class="gantt-bar-area">
              <div
                :class="[
                  'gantt-bar',
                  item.status === 'completed' ? 'subagent' : item.status === 'failed' ? 'subagent-failed' : 'subagent-incomplete'
                ]"
                :style="ganttPosition(item.startTime, item.endTime)"
                :title="item.name + ' — ' + formatDuration(item.duration)"
              >
                {{ formatDuration(item.duration) }}

                <!-- Event markers -->
                <template v-if="item.innerEventMarkers && item.innerEventMarkers.length">
                  <EventMarker
                    v-for="(marker, midx) in item.innerEventMarkers"
                    :key="'m-' + midx"
                    :marker="marker"
                  />
                </template>
              </div>
            </div>
          </div>

          <!-- Main Agent gap row (indented) -->
          <div v-else-if="item.rowType === 'main-agent'" class="gantt-row indented">
            <div class="gantt-label agent-op" :title="item.summary">
              <span class="agent-op-icon">⚙</span>
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
                  <EventMarker
                    v-for="(marker, midx) in item.innerEventMarkers"
                    :key="'m-' + midx"
                    :marker="marker"
                  />
                </template>
              </div>
            </div>
          </div>
</template>

        <div class="gantt-time-axis">
          <span>{{ formatTime(events[0]?.timestamp) }}</span>
          <span>{{ formatTime(events[events.length-1]?.timestamp) }}</span>
        </div>
      </div>

      <!-- Tool Summary -->
      <div v-if="toolTimeByCategory.length" style="margin-top: 24px;">
        <h3 style="color: #e6edf3; font-size: 14px; margin-bottom: 12px;">
🔧 Tool Summary
</h3>
        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 8px;">
          <div
            v-for="cat in toolTimeByCategory"
            :key="cat.category"
            style="background: #161b22; border: 1px solid #30363d; border-radius: 6px; padding: 10px 12px; display: flex; align-items: center; gap: 10px;"
          >
            <div style="flex: 1; min-width: 0;">
              <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 4px;">
                <span style="color: #d29922; font-weight: 500; font-size: 13px;">{{ cat.category }}</span>
                <span style="color: #7d8590; font-size: 11px;">{{ cat.count }} call{{ cat.count !== 1 ? 's' : '' }}<span v-if="cat.errors" style="color: #f85149;"> · {{ cat.errors }} err</span></span>
              </div>
              <div style="background: #21262d; border-radius: 3px; height: 6px; overflow: hidden;">
                <div :style="{ width: (cat.totalTime / maxCategoryTime * 100) + '%', height: '100%', background: 'rgba(158, 106, 3, 0.7)', borderRadius: '3px' }" />
              </div>
              <div style="color: #7d8590; font-size: 11px; margin-top: 3px;">
{{ formatDuration(cat.totalTime) }}
</div>
            </div>
          </div>
        </div>
      </div>
</div>
  </div>
</template>

<script setup>
import EventMarker from './EventMarker.vue';

defineProps({
  error: {},
  sessionId: { type: String, required: true },
  events: { type: Array, required: true },
  unifiedTimelineItems: { type: Array, required: true },
  showMarkerLegend: { type: Boolean, required: true },
  copyLabel: { type: String, required: true },
  EVENT_MARKER_CATEGORIES: { type: Object, required: true },
  ganttCrosshairX: {},
  ganttCrosshairTime: { type: String },
  onGanttMouseMove: { type: Function, required: true },
  onGanttMouseLeave: { type: Function, required: true },
  ganttPosition: { type: Function, required: true },
  formatDuration: { type: Function, required: true },
  formatTime: { type: Function, required: true },
  toolTimeByCategory: { type: Array, required: true },
  maxCategoryTime: { required: true },
});

defineEmits(['toggle-legend', 'copy-timeline']);
</script>
