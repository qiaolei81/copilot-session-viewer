<template>
<div class="unified-filter-bar bg-canvas border-b border-border shrink-0">
  <div class="filter-bar-row flex items-center gap-2 py-2 px-3 flex-wrap">
    <button
      class="filter-bar-toggle"
      :title="sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'"
      @click="$emit('toggleSidebar')"
    >
☰
</button>

    <div class="filter-bar-search flex items-center gap-1 flex-1 min-w-40">
      <input
        :value="searchText"
        type="text"
        placeholder="🔍 Search events..."
        class="search-input flex-1 min-w-[120px] py-1.5 px-3 bg-surface border border-border rounded-md text-text-secondary text-sm outline-none transition-colors focus:border-accent focus:bg-canvas placeholder:text-text-faint"
        @input="$emit('update:searchText', $event.target.value)"
      >
      <span v-if="searchResultCount" class="search-result-count text-xs text-text-secondary py-1 px-2 bg-surface-hover rounded whitespace-nowrap">{{ searchResultCount }}</span>
    </div>

    <div class="filter-bar-divider w-px h-5 bg-border shrink-0" />

    <!-- Turn dropdown with optgroup -->
    <select
      v-if="turns.length > 0"
      :value="currentTurnIndex"
      class="filter-select min-w-[260px]"
      @change="$emit('update:currentTurnIndex', Number($event.target.value)); $emit('jumpToTurn', Number($event.target.value))"
    >
      <optgroup
        v-for="req in userReqs"
        :key="req.reqNumber"
        :label="req.reqNumber > 0 ? 'UserReq ' + req.reqNumber + ': ' + truncateText(req.message, 40) : 'Setup'"
      >
        <option v-for="turn in req.turns" :key="turn.id" :value="turn.id">
          Turn {{ turn.originalTurnId ?? turn.id }} ({{ turn.duration }})
        </option>
      </optgroup>
    </select>

    <div class="filter-bar-divider w-px h-5 bg-border shrink-0" />

    <!-- Subagent selector -->
    <div v-if="subagentList.length > 0" class="subagent-selector" data-testid="subagent-dropdown" style="position:relative">
      <button class="flex items-center gap-1.5 py-1 px-2.5 bg-surface border border-border rounded-md text-text-secondary text-sm cursor-pointer max-w-[280px] hover:border-accent" @click.stop="$emit('toggleSubagentDropdown')">
        <span>🤖</span>
        <span class="overflow-hidden text-ellipsis whitespace-nowrap">{{ selectedSubagent ? (subagentList.find(s => s.toolCallId === selectedSubagent)?.name || 'Agent') : 'All Agents' }}</span>
        <span class="text-2xs opacity-60">▾</span>
      </button>
      <div v-if="subagentDropdownOpen" class="absolute top-[calc(100%+4px)] right-0 z-[100] min-w-[320px] max-w-[420px] bg-surface border border-border rounded-lg shadow-[0_8px_24px_rgba(0,0,0,0.4)] overflow-hidden" @click.stop>
        <input
          ref="subagentSearchRef"
          class="w-full py-2 px-3 bg-canvas border-none border-b border-b-border text-text-secondary text-sm outline-none box-border placeholder:text-text-faint"
          :value="subagentSearchQuery"
          placeholder="Search agents..."
          @input="$emit('update:subagentSearchQuery', $event.target.value)"
          @keydown.escape="$emit('toggleSubagentDropdown')"
        >
        <div class="max-h-[320px] overflow-y-auto">
          <div class="flex items-start gap-2 py-2 px-3 cursor-pointer border-b border-border-subtle hover:bg-surface-alt" :class="{ 'bg-accent-subtle': !selectedSubagent }" @click="$emit('selectSubagent', null)">
            <div class="text-sm text-text-secondary font-medium whitespace-nowrap overflow-hidden text-ellipsis">
🤖 All Agents
</div>
          </div>
          <div
            v-for="sa in filteredSubagentList"
            :key="sa.toolCallId"
            class="flex items-start gap-2 py-2 px-3 cursor-pointer border-b border-border-subtle last:border-b-0 hover:bg-surface-alt"
            :class="{ 'bg-accent-subtle': selectedSubagent === sa.toolCallId }"
            @click="$emit('selectSubagent', sa.toolCallId)"
          >
            <div class="w-1 min-h-[20px] rounded-sm shrink-0 mt-0.5" :style="{ background: SUBAGENT_COLORS[sa.colorIndex % SUBAGENT_COLORS.length] }" />
            <div class="flex-1 min-w-0">
              <div class="text-sm text-text-secondary font-medium whitespace-nowrap overflow-hidden text-ellipsis">
{{ sa.name }}
</div>
              <div v-if="sa.meta.taskName || sa.meta.agentType || sa.meta.model" class="flex gap-1.5 mt-0.5 flex-wrap">
                <span v-if="sa.meta.taskName" class="subagent-meta-tag">{{ sa.meta.taskName }}</span>
                <span v-if="sa.meta.agentType" class="subagent-meta-tag opacity-70">{{ sa.meta.agentType }}</span>
                <span v-if="sa.meta.model" class="subagent-meta-tag opacity-70">{{ sa.meta.model }}</span>
              </div>
              <div v-if="sa.meta.agentDescription" class="text-2xs text-text-faint mt-[3px] leading-[1.4] line-clamp-2">
{{ sa.meta.agentDescription }}
</div>
            </div>
          </div>
          <div v-if="filteredSubagentList.length === 0" class="p-3 text-center text-text-faint text-sm">
No matches
</div>
        </div>
      </div>
      <span v-if="subagentTokenUsage" class="text-2xs text-text-dim whitespace-nowrap">
        {{ subagentTokenUsage.eventCount }} events · {{ formatDuration(subagentTokenUsage.durationMs) }}
      </span>
    </div>

    <div class="filter-bar-divider w-px h-5 bg-border shrink-0" />

    <!-- Event type dropdown -->
    <div class="filter-type-wrapper relative">
      <button
        data-testid="filter-type-toggle"
        :class="[
          'py-1 px-2.5 bg-surface border border-border rounded-md text-text-secondary text-sm cursor-pointer whitespace-nowrap transition-all duration-200 hover:border-accent hover:bg-canvas',
          currentFilter !== 'all' ? '!border-accent !text-accent !bg-accent-subtle' : ''
        ]"
        @click.stop="$emit('toggleTypeFilter')"
      >
        ⚡ {{ currentFilter === 'all' ? 'All Types' : currentFilter }} ▾
      </button>
      <div v-if="typeFilterOpen" data-testid="filter-type-menu" class="absolute top-[calc(100%+4px)] left-0 bg-surface border border-border rounded-md shadow-[0_8px_24px_rgba(0,0,0,0.5)] min-w-[250px] z-[1000]">
        <div class="py-2 px-3 border-b border-border text-xs font-semibold text-text-secondary">
Event Types
</div>
        <div class="max-h-[300px] overflow-y-auto py-1">
          <div
            v-for="filter in filters"
            :key="filter.type"
            data-testid="filter-type-item"
            :class="[
              'flex items-center justify-between py-1.5 px-3 cursor-pointer transition-colors duration-150 text-sm text-text-secondary hover:bg-accent-subtle',
              currentFilter === filter.type ? 'bg-accent-subtle !text-accent' : ''
            ]"
            @click="$emit('setFilter', filter.type); $emit('toggleTypeFilter')"
          >
            <span class="flex-1 overflow-hidden text-ellipsis whitespace-nowrap">{{ filter.type === 'all' ? 'All' : filter.type }}</span>
            <span class="text-text-dim text-xs ml-2 shrink-0">{{ filter.count }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Active filter chips -->
  <div v-if="activeFilterCount > 0" data-testid="active-filters" class="flex items-center gap-1.5 py-1 px-3 pb-2 flex-wrap">
    <span v-if="currentFilter !== 'all'" class="filter-chip">
      Type: {{ currentFilter }}
      <button class="filter-chip-remove" title="Remove filter" @click="$emit('setFilter', 'all')">×</button>
    </span>
    <span v-if="selectedSubagent" class="filter-chip">
      Agent: {{ subagentList.find(s => s.toolCallId === selectedSubagent)?.name || selectedSubagent }}
      <button class="filter-chip-remove" title="Remove filter" @click="$emit('selectSubagent', null)">×</button>
    </span>
    <span v-if="searchText.trim()" class="filter-chip">
      Search: "{{ searchText.length > 20 ? searchText.substring(0, 20) + '…' : searchText }}"
      <button class="filter-chip-remove" title="Remove filter" @click="$emit('update:searchText', '')">×</button>
    </span>
    <button data-testid="clear-all-filters" class="bg-none border-none text-danger-emphasis cursor-pointer text-xs py-0.5 px-1.5 rounded-badge transition-colors duration-200 hover:bg-danger-subtle" @click="$emit('clearAllFilters')">
Clear all
</button>
  </div>
</div>
</template>

<script setup>
import { ref } from 'vue';

defineProps({
  sidebarCollapsed: Boolean,
  searchText: String,
  searchResultCount: String,
  turns: Array,
  userReqs: Array,
  currentTurnIndex: Number,
  subagentList: Array,
  filteredSubagentList: Array,
  selectedSubagent: [String, null],
  subagentDropdownOpen: Boolean,
  subagentSearchQuery: String,
  subagentTokenUsage: Object,
  SUBAGENT_COLORS: Array,
  currentFilter: String,
  typeFilterOpen: Boolean,
  filters: Array,
  activeFilterCount: Number,
  formatDuration: Function,
  truncateText: Function,
});

defineEmits([
  'toggleSidebar',
  'update:searchText',
  'jumpToTurn',
  'update:currentTurnIndex',
  'selectSubagent',
  'toggleSubagentDropdown',
  'update:subagentSearchQuery',
  'setFilter',
  'toggleTypeFilter',
  'clearAllFilters',
]);

const subagentSearchRef = ref(null);

defineExpose({ subagentSearchRef });
</script>
