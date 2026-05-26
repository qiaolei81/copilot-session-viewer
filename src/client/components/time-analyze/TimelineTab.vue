<template>
  <div class="my-6">
    <div v-if="error" class="empty-state" style="color: #f85149;">
      Error loading timeline: {{ error }}
    </div>
    <div v-else-if="!unifiedTimelineItems.length" class="empty-state">
      No timeline data found in this session.
    </div>
    <div v-else>
      <!-- Section A: Gantt Chart -->
      <div class="text-base font-semibold text-text mb-3 pb-2 border-b border-border" style="display: flex; align-items: center;">
        Timeline
        <button class="timeline-action-btn" @click="$emit('toggle-legend')">
          {{ showMarkerLegend ? 'Hide Legend' : 'Show Legend' }}
        </button>
        <button class="timeline-action-btn" @click="$emit('copy-timeline')">
          {{ copyLabel }}
        </button>
      </div>

      <!-- Event Legend -->
      <div v-show="showMarkerLegend" class="flex flex-wrap gap-2.5 py-2.5 px-3.5 bg-surface border border-border rounded-md mb-3">
        <div class="legend-item">
          <span class="legend-dot" style="background: rgba(88, 166, 255, 0.5);" />
          <span>User Request</span>
        </div>
        <div class="legend-item">
          <span class="legend-dot" style="background: rgba(63, 185, 80, 0.8);" />
          <span>Sub-Agent</span>
        </div>
        <div class="legend-item">
          <span class="legend-dot" style="background: rgba(139, 148, 158, 0.3); border: 1px dashed rgba(139, 148, 158, 0.5);" />
          <span>Main Agent</span>
        </div>
        <div class="legend-item">
          <span class="legend-dot" style="background: #d29922;" />
          <span>Tool (no errors)</span>
        </div>
        <div class="legend-item">
          <span class="legend-dot" style="background: linear-gradient(to right, #d29922, #f85149);" />
          <span>Tool (error gradient)</span>
        </div>
        <div class="legend-item">
          <span class="legend-dot" style="background: #f85149;" />
          <span>Tool Error (100%)</span>
        </div>
        <template v-for="(cat, type) in EVENT_MARKER_CATEGORIES" :key="type">
          <div v-if="type && !type.startsWith('tool.')" class="legend-item">
            <span class="legend-dot" :style="{ background: cat.color, borderRadius: cat.shape === 'circle' ? '50%' : cat.shape === 'diamond' ? '1px' : '2px', transform: cat.shape === 'diamond' ? 'rotate(45deg)' : 'none' }" />
            <span>{{ cat.label }}</span>
          </div>
        </template>
      </div>

      <div class="overflow-x-auto overflow-y-visible pb-2 pt-[22px] relative" @mousemove="onGanttMouseMove" @mouseleave="onGanttMouseLeave">
        <!-- Crosshair -->
        <div v-if="ganttCrosshairX !== null" class="absolute top-0 bottom-0 w-px bg-[rgba(139,148,158,0.5)] pointer-events-none z-10" :style="{ left: ganttCrosshairX + 'px' }">
          <div class="absolute top-1 left-1/2 -translate-x-1/2 bg-border text-text text-2xs py-0.5 px-1.5 rounded-badge whitespace-nowrap pointer-events-none">
{{ ganttCrosshairTime }}
</div>
        </div>
        <template v-for="(item, idx) in unifiedTimelineItems" :key="'utl-' + idx">
<!-- Divider row -->
          <div v-if="item.rowType === 'divider'" class="gantt-divider border-b border-border py-1 my-0.5 flex items-center gap-2 text-text-dim text-2xs uppercase tracking-[0.5px]">
            Tool Summary
          </div>

          <!-- User Request row -->
          <div v-else-if="item.rowType === 'user-req'" class="gantt-row">
            <div class="gantt-label font-semibold text-text" :title="item.message || 'No message'">
              <span class="inline-block py-0.5 px-2 bg-accent-subtle text-accent rounded text-2xs font-semibold font-mono shrink-0 mt-0.5">UserReq {{ item.userReqNumber }}</span>
              <span class="font-normal text-2xs text-text-muted overflow-hidden text-ellipsis ml-1.5">{{ (item.message || '').substring(0, 40) }}{{ (item.message || '').length > 40 ? '...' : '' }}</span>
            </div>
            <div class="gantt-bar-area">
              <div
                class="gantt-bar bg-[rgba(88,166,255,0.35)] border border-[rgba(88,166,255,0.6)]"
                :style="ganttPosition(item.startTime, item.endTime)"
                :title="'UserReq ' + item.userReqNumber + ' — ' + formatDuration(item.duration)"
              >
                {{ formatDuration(item.duration) }}
              </div>
            </div>
          </div>

          <!-- Sub-Agent row -->
          <div v-else-if="item.rowType === 'subagent'" class="gantt-row">
            <div class="gantt-label pl-5" :title="item.name">
              <router-link
                :to="'/session/' + sessionId + '?eventType=subagent.started&eventName=' + encodeURIComponent(item.name) + '&eventTimestamp=' + encodeURIComponent(item.startTime || '')"
                class="text-accent no-underline transition-colors duration-200 hover:text-link hover:underline"
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
                class="gantt-bar"
                :style="{ ...ganttPosition(item.startTime, item.endTime), background: item.status === 'completed' ? 'rgba(63, 185, 80, 0.8)' : item.status === 'failed' ? 'rgba(248, 81, 73, 0.8)' : 'rgba(210, 153, 34, 0.8)' }"
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
          <div v-else-if="item.rowType === 'main-agent'" class="gantt-row">
            <div class="gantt-label pl-5 text-text-dim italic" :title="item.summary">
              <span class="text-text-muted mr-1">⚙</span>
              <span>Main Agent</span>
              <span class="text-2xs text-text-faint block overflow-hidden text-ellipsis">{{ item.summary }}</span>
            </div>
            <div class="gantt-bar-area">
              <div
                class="gantt-bar bg-[rgba(139,148,158,0.3)] border border-dashed border-[rgba(139,148,158,0.5)]"
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

        <div class="flex justify-between ml-[212px] py-1 text-2xs text-text-dim font-mono border-t border-border">
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
