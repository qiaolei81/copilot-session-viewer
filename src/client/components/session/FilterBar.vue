<template>
<div class="unified-filter-bar">
  <div class="filter-bar-row">
    <button
      class="sidebar-toggle"
      @click="$emit('toggleSidebar')"
      :title="sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'"
    >☰</button>

    <div class="filter-bar-search">
      <input
        :value="searchText"
        @input="$emit('update:searchText', $event.target.value)"
        type="text"
        placeholder="🔍 Search events..."
        class="search-input"
      />
      <span v-if="searchResultCount" class="search-result-count">{{ searchResultCount }}</span>
    </div>

    <div class="filter-bar-divider"></div>

    <!-- Turn dropdown with optgroup -->
    <select
      v-if="turns.length > 0"
      :value="currentTurnIndex"
      @change="$emit('update:currentTurnIndex', Number($event.target.value)); $emit('jumpToTurn', Number($event.target.value))"
      class="turn-dropdown"
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

    <div class="filter-bar-divider"></div>

    <!-- Subagent selector -->
    <div v-if="subagentList.length > 0" class="subagent-selector" style="position:relative">
      <button class="subagent-dropdown-trigger" @click.stop="$emit('toggleSubagentDropdown')">
        <span class="subagent-trigger-icon">🤖</span>
        <span class="subagent-trigger-label">{{ selectedSubagent ? (subagentList.find(s => s.toolCallId === selectedSubagent)?.name || 'Agent') : 'All Agents' }}</span>
        <span class="subagent-trigger-arrow">▾</span>
      </button>
      <div v-if="subagentDropdownOpen" class="subagent-dropdown-panel" @click.stop>
        <input
          class="subagent-search-input"
          :value="subagentSearchQuery"
          @input="$emit('update:subagentSearchQuery', $event.target.value)"
          placeholder="Search agents..."
          ref="subagentSearchRef"
          @keydown.escape="$emit('toggleSubagentDropdown')"
        />
        <div class="subagent-dropdown-list">
          <div class="subagent-dropdown-item" :class="{ active: !selectedSubagent }" @click="$emit('selectSubagent', null)">
            <div class="subagent-item-name">🤖 All Agents</div>
          </div>
          <div
            v-for="sa in filteredSubagentList"
            :key="sa.toolCallId"
            class="subagent-dropdown-item"
            :class="{ active: selectedSubagent === sa.toolCallId }"
            @click="$emit('selectSubagent', sa.toolCallId)"
          >
            <div class="subagent-item-color" :style="{ background: SUBAGENT_COLORS[sa.colorIndex % SUBAGENT_COLORS.length] }"></div>
            <div class="subagent-item-body">
              <div class="subagent-item-name">{{ sa.name }}</div>
              <div v-if="sa.meta.taskName || sa.meta.agentType || sa.meta.model" class="subagent-item-meta">
                <span v-if="sa.meta.taskName" class="subagent-meta-tag">{{ sa.meta.taskName }}</span>
                <span v-if="sa.meta.agentType" class="subagent-meta-tag dim">{{ sa.meta.agentType }}</span>
                <span v-if="sa.meta.model" class="subagent-meta-tag dim">{{ sa.meta.model }}</span>
              </div>
              <div v-if="sa.meta.agentDescription" class="subagent-item-desc">{{ sa.meta.agentDescription }}</div>
            </div>
          </div>
          <div v-if="filteredSubagentList.length === 0" class="subagent-dropdown-empty">No matches</div>
        </div>
      </div>
      <span v-if="subagentTokenUsage" class="subagent-usage-badge">
        {{ subagentTokenUsage.eventCount }} events · {{ formatDuration(subagentTokenUsage.durationMs) }}
      </span>
    </div>

    <div class="filter-bar-divider"></div>

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
        <div class="filter-type-menu-header">Event Types</div>
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
      <button @click="$emit('setFilter', 'all')" class="filter-chip-remove" title="Remove filter">×</button>
    </span>
    <span v-if="selectedSubagent" class="filter-chip">
      Agent: {{ subagentList.find(s => s.toolCallId === selectedSubagent)?.name || selectedSubagent }}
      <button @click="$emit('selectSubagent', null)" class="filter-chip-remove" title="Remove filter">×</button>
    </span>
    <span v-if="searchText.trim()" class="filter-chip">
      Search: "{{ searchText.length > 20 ? searchText.substring(0, 20) + '…' : searchText }}"
      <button @click="$emit('update:searchText', '')" class="filter-chip-remove" title="Remove filter">×</button>
    </span>
    <button class="clear-all-filters-btn" @click="$emit('clearAllFilters')">Clear all</button>
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

<style scoped>
.unified-filter-bar {
  background: #0d1117;
  border-bottom: 1px solid #30363d;
  flex-shrink: 0;
}
.filter-bar-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  flex-wrap: wrap;
}
.filter-bar-search {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: 1;
  min-width: 160px;
}
.filter-bar-divider {
  width: 1px;
  height: 20px;
  background: #30363d;
  flex-shrink: 0;
}

/* Sidebar toggle */
.sidebar-toggle {
  background: #21262d;
  border: 1px solid #30363d;
  border-radius: 4px;
  color: #c9d1d9;
  cursor: pointer;
  padding: 4px 8px;
  font-size: 14px;
  transition: all 0.2s;
}
.sidebar-toggle:hover {
  background: #30363d;
  color: #58a6ff;
}

/* Search input */
.search-input {
  flex: 1;
  min-width: 120px;
  padding: 6px 12px;
  background: #161b22;
  border: 1px solid #30363d;
  border-radius: 6px;
  color: #c9d1d9;
  font-size: 13px;
  outline: none;
  transition: border-color 0.2s;
}
.search-input:focus {
  border-color: #58a6ff;
  background: #0d1117;
}
.search-input::placeholder {
  color: #6e7681;
}

/* Search result counter */
.search-result-count {
  font-size: 12px;
  color: #c9d1d9;
  padding: 4px 8px;
  background: #21262d;
  border-radius: 4px;
  white-space: nowrap;
}

/* Turn navigation dropdown */
.turn-dropdown {
  padding: 6px 12px;
  background: #161b22;
  border: 1px solid #30363d;
  border-radius: 6px;
  color: #c9d1d9;
  font-size: 13px;
  cursor: pointer;
  min-width: 260px;
  transition: border-color 0.2s;
}
.turn-dropdown:hover {
  border-color: #58a6ff;
}
.turn-dropdown:focus {
  outline: none;
  border-color: #58a6ff;
}
.turn-dropdown optgroup {
  font-weight: 600;
  font-style: normal;
  color: #e6edf3;
  background: #21262d;
  padding: 4px 0;
}
.turn-dropdown option {
  font-weight: 400;
  color: #c9d1d9;
  background: #161b22;
  padding: 4px 8px;
}

/* Event type dropdown wrapper */
.filter-type-wrapper {
  position: relative;
}
.filter-type-toggle {
  padding: 4px 10px;
  background: #161b22;
  border: 1px solid #30363d;
  border-radius: 6px;
  color: #c9d1d9;
  font-size: 13px;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.2s;
}
.filter-type-toggle:hover {
  border-color: #58a6ff;
  background: #0d1117;
}
.filter-type-toggle.active {
  border-color: #58a6ff;
  color: #58a6ff;
  background: rgba(88, 166, 255, 0.1);
}
.filter-type-menu {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  background: #161b22;
  border: 1px solid #30363d;
  border-radius: 6px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
  min-width: 250px;
  z-index: 1000;
}
.filter-type-menu-header {
  padding: 8px 12px;
  border-bottom: 1px solid #30363d;
  font-size: 12px;
  font-weight: 600;
  color: #c9d1d9;
}
.filter-type-menu-options {
  max-height: 300px;
  overflow-y: auto;
  padding: 4px 0;
}
.filter-type-menu-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 12px;
  cursor: pointer;
  transition: background 0.15s;
  font-size: 13px;
  color: #c9d1d9;
}
.filter-type-menu-item:hover {
  background: rgba(88, 166, 255, 0.1);
}
.filter-type-menu-item.active {
  background: rgba(88, 166, 255, 0.2);
  color: #58a6ff;
}
.filter-type-menu-label {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.filter-type-menu-count {
  color: #7d8590;
  font-size: 12px;
  margin-left: 8px;
  flex-shrink: 0;
}

/* Active filter chips bar */
.active-filters-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px 8px;
  flex-wrap: wrap;
}
.filter-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  background: rgba(88, 166, 255, 0.15);
  border: 1px solid rgba(88, 166, 255, 0.3);
  border-radius: 12px;
  font-size: 12px;
  color: #58a6ff;
  white-space: nowrap;
}
.filter-chip-remove {
  background: none;
  border: none;
  color: #58a6ff;
  cursor: pointer;
  font-size: 14px;
  padding: 0 2px;
  line-height: 1;
  opacity: 0.7;
  transition: opacity 0.15s;
}
.filter-chip-remove:hover {
  opacity: 1;
}
.clear-all-filters-btn {
  background: none;
  border: none;
  color: #f85149;
  cursor: pointer;
  font-size: 12px;
  padding: 2px 6px;
  border-radius: 3px;
  transition: background 0.2s;
}
.clear-all-filters-btn:hover {
  background: rgba(248, 81, 73, 0.1);
}

/* Subagent selector */
.subagent-selector {
  display: flex;
  align-items: center;
  gap: 8px;
  position: relative;
}
.subagent-dropdown-trigger {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  background: #161b22;
  border: 1px solid #30363d;
  border-radius: 6px;
  color: #c9d1d9;
  font-size: 13px;
  cursor: pointer;
  max-width: 280px;
}
.subagent-dropdown-trigger:hover { border-color: #58a6ff; }
.subagent-trigger-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.subagent-trigger-arrow { font-size: 10px; opacity: 0.6; }

.subagent-dropdown-panel {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  z-index: 100;
  min-width: 320px;
  max-width: 420px;
  background: #161b22;
  border: 1px solid #30363d;
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.4);
  overflow: hidden;
}

.subagent-search-input {
  width: 100%;
  padding: 8px 12px;
  background: #0d1117;
  border: none;
  border-bottom: 1px solid #30363d;
  color: #c9d1d9;
  font-size: 13px;
  outline: none;
  box-sizing: border-box;
}
.subagent-search-input::placeholder { color: #484f58; }

.subagent-dropdown-list {
  max-height: 320px;
  overflow-y: auto;
}

.subagent-dropdown-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px 12px;
  cursor: pointer;
  border-bottom: 1px solid #21262d;
}
.subagent-dropdown-item:last-child { border-bottom: none; }
.subagent-dropdown-item:hover { background: #1c2129; }
.subagent-dropdown-item.active { background: rgba(88, 166, 255, 0.1); }

.subagent-item-color {
  width: 4px;
  min-height: 20px;
  border-radius: 2px;
  flex-shrink: 0;
  margin-top: 2px;
}

.subagent-item-body { flex: 1; min-width: 0; }

.subagent-item-name {
  font-size: 13px;
  color: #c9d1d9;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.subagent-item-meta {
  display: flex;
  gap: 6px;
  margin-top: 2px;
  flex-wrap: wrap;
}

.subagent-meta-tag {
  font-size: 11px;
  color: #8b949e;
  background: #21262d;
  padding: 1px 6px;
  border-radius: 4px;
}
.subagent-meta-tag.dim { opacity: 0.7; }

.subagent-item-desc {
  font-size: 11px;
  color: #6e7681;
  margin-top: 3px;
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.subagent-dropdown-empty {
  padding: 12px;
  text-align: center;
  color: #484f58;
  font-size: 13px;
}

.subagent-usage-badge {
  font-size: 11px;
  color: #7d8590;
  white-space: nowrap;
}

/* ── Tablet responsive ─────────────────────────────────── */
@media (max-width: 768px) {
  .filter-bar-search {
    flex: 1 1 100%;
    order: 1;
  }
  .filter-bar-row {
    flex-wrap: wrap;
  }
  .filter-bar-divider {
    display: none;
  }
  .subagent-usage-badge {
    display: none;
  }
}

/* ── Mobile responsive ────────────────────────────────────── */
@media (max-width: 640px) {
  .filter-bar-row {
    flex-wrap: wrap;
    gap: 4px;
    padding: 6px 8px;
  }
  .filter-bar-search {
    flex: 1 1 100%;
    order: 1;
  }
  .sidebar-toggle {
    order: 0;
  }
  .filter-bar-divider {
    display: none;
  }
  .turn-dropdown {
    order: 2;
    flex: 1;
    min-width: 0;
    max-width: 140px;
    font-size: 12px;
  }
  .subagent-selector {
    order: 3;
  }
  .filter-type-wrapper {
    order: 4;
  }
  .search-input {
    flex: 1;
    min-width: 0;
    font-size: 12px;
  }
  .subagent-dropdown-trigger {
    max-width: 160px;
    font-size: 12px;
  }
  .subagent-dropdown-panel {
    min-width: 260px;
    max-width: calc(100vw - 32px);
    right: 0;
    left: auto;
  }
  .subagent-usage-badge {
    display: none;
  }
}
</style>
