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
      class="py-1.5 px-3 bg-[#161b22] border border-[#30363d] rounded-md text-[#c9d1d9] text-[13px] cursor-pointer min-w-[260px] transition-colors duration-200 hover:border-[#58a6ff] focus:outline-none focus:border-[#58a6ff]"
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
      <button class="flex items-center gap-1.5 py-1 px-2.5 bg-[#161b22] border border-[#30363d] rounded-md text-[#c9d1d9] text-[13px] cursor-pointer max-w-[280px] hover:border-[#58a6ff]" @click.stop="$emit('toggleSubagentDropdown')">
        <span>🤖</span>
        <span class="overflow-hidden text-ellipsis whitespace-nowrap">{{ selectedSubagent ? (subagentList.find(s => s.toolCallId === selectedSubagent)?.name || 'Agent') : 'All Agents' }}</span>
        <span class="text-[10px] opacity-60">▾</span>
      </button>
      <div v-if="subagentDropdownOpen" class="absolute top-[calc(100%+4px)] right-0 z-[100] min-w-[320px] max-w-[420px] bg-[#161b22] border border-[#30363d] rounded-lg shadow-[0_8px_24px_rgba(0,0,0,0.4)] overflow-hidden" @click.stop>
        <input
          ref="subagentSearchRef"
          class="w-full py-2 px-3 bg-[#0d1117] border-none border-b border-b-[#30363d] text-[#c9d1d9] text-[13px] outline-none box-border placeholder:text-[#484f58]"
          :value="subagentSearchQuery"
          placeholder="Search agents..."
          @input="$emit('update:subagentSearchQuery', $event.target.value)"
          @keydown.escape="$emit('toggleSubagentDropdown')"
        >
        <div class="max-h-[320px] overflow-y-auto">
          <div class="flex items-start gap-2 py-2 px-3 cursor-pointer border-b border-[#21262d] hover:bg-[#1c2129]" :class="{ 'bg-[rgba(88,166,255,0.1)]': !selectedSubagent }" @click="$emit('selectSubagent', null)">
            <div class="text-[13px] text-[#c9d1d9] font-medium whitespace-nowrap overflow-hidden text-ellipsis">
🤖 All Agents
</div>
          </div>
          <div
            v-for="sa in filteredSubagentList"
            :key="sa.toolCallId"
            class="flex items-start gap-2 py-2 px-3 cursor-pointer border-b border-[#21262d] last:border-b-0 hover:bg-[#1c2129]"
            :class="{ 'bg-[rgba(88,166,255,0.1)]': selectedSubagent === sa.toolCallId }"
            @click="$emit('selectSubagent', sa.toolCallId)"
          >
            <div class="w-1 min-h-[20px] rounded-sm shrink-0 mt-0.5" :style="{ background: SUBAGENT_COLORS[sa.colorIndex % SUBAGENT_COLORS.length] }" />
            <div class="flex-1 min-w-0">
              <div class="text-[13px] text-[#c9d1d9] font-medium whitespace-nowrap overflow-hidden text-ellipsis">
{{ sa.name }}
</div>
              <div v-if="sa.meta.taskName || sa.meta.agentType || sa.meta.model" class="flex gap-1.5 mt-0.5 flex-wrap">
                <span v-if="sa.meta.taskName" class="text-[11px] text-[#8b949e] bg-[#21262d] py-[1px] px-1.5 rounded">{{ sa.meta.taskName }}</span>
                <span v-if="sa.meta.agentType" class="text-[11px] text-[#8b949e] bg-[#21262d] py-[1px] px-1.5 rounded opacity-70">{{ sa.meta.agentType }}</span>
                <span v-if="sa.meta.model" class="text-[11px] text-[#8b949e] bg-[#21262d] py-[1px] px-1.5 rounded opacity-70">{{ sa.meta.model }}</span>
              </div>
              <div v-if="sa.meta.agentDescription" class="text-[11px] text-[#6e7681] mt-[3px] leading-[1.4] line-clamp-2">
{{ sa.meta.agentDescription }}
</div>
            </div>
          </div>
          <div v-if="filteredSubagentList.length === 0" class="p-3 text-center text-[#484f58] text-[13px]">
No matches
</div>
        </div>
      </div>
      <span v-if="subagentTokenUsage" class="text-[11px] text-[#7d8590] whitespace-nowrap">
        {{ subagentTokenUsage.eventCount }} events · {{ formatDuration(subagentTokenUsage.durationMs) }}
      </span>
    </div>

    <div class="filter-bar-divider w-px h-5 bg-[#30363d] shrink-0" />

    <!-- Event type dropdown -->
    <div class="filter-type-wrapper relative">
      <button
        :class="[
          'py-1 px-2.5 bg-[#161b22] border border-[#30363d] rounded-md text-[#c9d1d9] text-[13px] cursor-pointer whitespace-nowrap transition-all duration-200 hover:border-[#58a6ff] hover:bg-[#0d1117]',
          currentFilter !== 'all' ? '!border-[#58a6ff] !text-[#58a6ff] !bg-[rgba(88,166,255,0.1)]' : ''
        ]"
        @click.stop="$emit('toggleTypeFilter')"
      >
        ⚡ {{ currentFilter === 'all' ? 'All Types' : currentFilter }} ▾
      </button>
      <div v-if="typeFilterOpen" class="absolute top-[calc(100%+4px)] left-0 bg-[#161b22] border border-[#30363d] rounded-md shadow-[0_8px_24px_rgba(0,0,0,0.5)] min-w-[250px] z-[1000]">
        <div class="py-2 px-3 border-b border-[#30363d] text-xs font-semibold text-[#c9d1d9]">
Event Types
</div>
        <div class="max-h-[300px] overflow-y-auto py-1">
          <div
            v-for="filter in filters"
            :key="filter.type"
            :class="[
              'flex items-center justify-between py-1.5 px-3 cursor-pointer transition-colors duration-150 text-[13px] text-[#c9d1d9] hover:bg-[rgba(88,166,255,0.1)]',
              currentFilter === filter.type ? 'bg-[rgba(88,166,255,0.2)] !text-[#58a6ff]' : ''
            ]"
            @click="$emit('setFilter', filter.type); $emit('toggleTypeFilter')"
          >
            <span class="flex-1 overflow-hidden text-ellipsis whitespace-nowrap">{{ filter.type === 'all' ? 'All' : filter.type }}</span>
            <span class="text-[#7d8590] text-xs ml-2 shrink-0">{{ filter.count }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Active filter chips -->
  <div v-if="activeFilterCount > 0" class="flex items-center gap-1.5 py-1 px-3 pb-2 flex-wrap">
    <span v-if="currentFilter !== 'all'" class="inline-flex items-center gap-1 py-0.5 px-2 bg-[rgba(88,166,255,0.15)] border border-[rgba(88,166,255,0.3)] rounded-xl text-xs text-[#58a6ff] whitespace-nowrap">
      Type: {{ currentFilter }}
      <button class="bg-none border-none text-[#58a6ff] cursor-pointer text-sm p-0 px-0.5 leading-none opacity-70 transition-opacity duration-150 hover:opacity-100" title="Remove filter" @click="$emit('setFilter', 'all')">×</button>
    </span>
    <span v-if="selectedSubagent" class="inline-flex items-center gap-1 py-0.5 px-2 bg-[rgba(88,166,255,0.15)] border border-[rgba(88,166,255,0.3)] rounded-xl text-xs text-[#58a6ff] whitespace-nowrap">
      Agent: {{ subagentList.find(s => s.toolCallId === selectedSubagent)?.name || selectedSubagent }}
      <button class="bg-none border-none text-[#58a6ff] cursor-pointer text-sm p-0 px-0.5 leading-none opacity-70 transition-opacity duration-150 hover:opacity-100" title="Remove filter" @click="$emit('selectSubagent', null)">×</button>
    </span>
    <span v-if="searchText.trim()" class="inline-flex items-center gap-1 py-0.5 px-2 bg-[rgba(88,166,255,0.15)] border border-[rgba(88,166,255,0.3)] rounded-xl text-xs text-[#58a6ff] whitespace-nowrap">
      Search: "{{ searchText.length > 20 ? searchText.substring(0, 20) + '…' : searchText }}"
      <button class="bg-none border-none text-[#58a6ff] cursor-pointer text-sm p-0 px-0.5 leading-none opacity-70 transition-opacity duration-150 hover:opacity-100" title="Remove filter" @click="$emit('update:searchText', '')">×</button>
    </span>
    <button class="bg-none border-none text-[#f85149] cursor-pointer text-xs py-0.5 px-1.5 rounded-[3px] transition-colors duration-200 hover:bg-[rgba(248,81,73,0.1)]" @click="$emit('clearAllFilters')">
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
