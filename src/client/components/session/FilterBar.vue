<template>
<div class="unified-filter-bar bg-[#0d1117] border-b border-[#30363d] shrink-0">
  <div class="filter-bar-row flex items-center gap-2 py-2 px-3 flex-wrap">
    <button
      class="sidebar-toggle bg-[#21262d] border border-[#30363d] rounded text-[#c9d1d9] cursor-pointer py-1 px-2 text-sm transition-all hover:bg-[#30363d] hover:text-[#58a6ff]"
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
        class="search-input flex-1 min-w-[120px] py-1.5 px-3 bg-[#161b22] border border-[#30363d] rounded-md text-[#c9d1d9] text-[13px] outline-none transition-colors focus:border-[#58a6ff] focus:bg-[#0d1117] placeholder:text-[#6e7681]"
        @input="$emit('update:searchText', $event.target.value)"
      >
      <span v-if="searchResultCount" class="search-result-count text-xs text-[#c9d1d9] py-1 px-2 bg-[#21262d] rounded whitespace-nowrap">{{ searchResultCount }}</span>
    </div>

    <div class="filter-bar-divider w-px h-5 bg-[#30363d] shrink-0" />

    <!-- Turn dropdown with optgroup -->
    <select
      v-if="turns.length > 0"
      :value="currentTurnIndex"
      class="turn-dropdown"
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

    <div class="filter-bar-divider w-px h-5 bg-[#30363d] shrink-0" />

    <!-- Subagent selector -->
    <div v-if="subagentList.length > 0" class="subagent-selector" style="position:relative">
      <button class="subagent-dropdown-trigger" @click.stop="$emit('toggleSubagentDropdown')">
        <span class="subagent-trigger-icon">🤖</span>
        <span class="subagent-trigger-label">{{ selectedSubagent ? (subagentList.find(s => s.toolCallId === selectedSubagent)?.name || 'Agent') : 'All Agents' }}</span>
        <span class="subagent-trigger-arrow">▾</span>
      </button>
      <div v-if="subagentDropdownOpen" class="subagent-dropdown-panel" @click.stop>
        <input
          ref="subagentSearchRef"
          class="subagent-search-input"
          :value="subagentSearchQuery"
          placeholder="Search agents..."
          @input="$emit('update:subagentSearchQuery', $event.target.value)"
          @keydown.escape="$emit('toggleSubagentDropdown')"
        >
        <div class="subagent-dropdown-list">
          <div class="subagent-dropdown-item" :class="{ active: !selectedSubagent }" @click="$emit('selectSubagent', null)">
            <div class="subagent-item-name">
🤖 All Agents
</div>
          </div>
          <div
            v-for="sa in filteredSubagentList"
            :key="sa.toolCallId"
            class="subagent-dropdown-item"
            :class="{ active: selectedSubagent === sa.toolCallId }"
            @click="$emit('selectSubagent', sa.toolCallId)"
          >
            <div class="subagent-item-color" :style="{ background: SUBAGENT_COLORS[sa.colorIndex % SUBAGENT_COLORS.length] }" />
            <div class="subagent-item-body">
              <div class="subagent-item-name">
{{ sa.name }}
</div>
              <div v-if="sa.meta.taskName || sa.meta.agentType || sa.meta.model" class="subagent-item-meta">
                <span v-if="sa.meta.taskName" class="subagent-meta-tag">{{ sa.meta.taskName }}</span>
                <span v-if="sa.meta.agentType" class="subagent-meta-tag dim">{{ sa.meta.agentType }}</span>
                <span v-if="sa.meta.model" class="subagent-meta-tag dim">{{ sa.meta.model }}</span>
              </div>
              <div v-if="sa.meta.agentDescription" class="subagent-item-desc">
{{ sa.meta.agentDescription }}
</div>
            </div>
          </div>
          <div v-if="filteredSubagentList.length === 0" class="subagent-dropdown-empty">
No matches
</div>
        </div>
      </div>
      <span v-if="subagentTokenUsage" class="subagent-usage-badge">
        {{ subagentTokenUsage.eventCount }} events · {{ formatDuration(subagentTokenUsage.durationMs) }}
      </span>
    </div>

    <div class="filter-bar-divider w-px h-5 bg-[#30363d] shrink-0" />

    <!-- Event type dropdown -->
    <div class="filter-type-wrapper">
      <button
        class="filter-type-toggle"
        :class="{ active: currentFilter !== 'all' }"
        @click.stop="$emit('toggleTypeFilter')"
      >
        ⚡ {{ currentFilter === 'all' ? 'All Types' : currentFilter }} ▾
      </button>
      <div v-if="typeFilterOpen" class="filter-type-menu">
        <div class="filter-type-menu-header">
Event Types
</div>
        <div class="filter-type-menu-options">
          <div
            v-for="filter in filters"
            :key="filter.type"
            :class="['filter-type-menu-item', { active: currentFilter === filter.type }]"
            @click="$emit('setFilter', filter.type); $emit('toggleTypeFilter')"
          >
            <span class="filter-type-menu-label">{{ filter.type === 'all' ? 'All' : filter.type }}</span>
            <span class="filter-type-menu-count">{{ filter.count }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Active filter chips -->
  <div v-if="activeFilterCount > 0" class="active-filters-bar">
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
    <button class="clear-all-filters-btn" @click="$emit('clearAllFilters')">
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
