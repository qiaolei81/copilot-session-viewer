<template>
  <div class="container">
    <SessionHeader
      :sessionId="sessionId"
      :metadata="metadata"
      :exporting="exporting"
      @export="exportSession"
    />

    <div class="main-layout">
      <!-- Mobile overlay backdrop -->
      <div
        v-if="!sidebarCollapsed"
        @click="sidebarCollapsed = true"
        class="sidebar-backdrop"
      ></div>

      <SessionSidebar
        :collapsed="sidebarCollapsed"
        :metadata="metadata"
        :formatDateTime="formatDateTime"
        :formatTokens="formatTokens"
        :formatDuration="formatDuration"
        :formatCost="formatCost"
        :totalTokens="totalTokens"
        :totalRequests="totalRequests"
        :totalModels="totalModels"
        :getDisplayUsageInputTokens="getDisplayUsageInputTokens"
        :getModelCacheHitRatio="getModelCacheHitRatio"
        :toolCallingSummary="toolCallingSummary"
        :sessionTags="sessionTags"
        :tagsEditing="tagsEditing"
        :editingTags="editingTags"
        :tagInputValue="tagInputValue"
        :tagsError="tagsError"
        :showAutocomplete="showAutocomplete"
        :autocompleteOptions="autocompleteOptions"
        :autocompleteSelectedIndex="autocompleteSelectedIndex"
        :getTagColor="getTagColor"
        @startEditTags="startEditTags"
        @cancelEditTags="cancelEditTags"
        @addTag="addTag"
        @removeTagFromEdit="removeTagFromEdit"
        @updateAutocomplete="updateAutocomplete"
        @selectAutocompleteOption="selectAutocompleteOption"
        @saveTagsOnBlur="saveTagsOnBlur"
        @update:tagInputValue="tagInputValue = $event"
      />

      <div class="content">
        <FilterBar
          :sidebarCollapsed="sidebarCollapsed"
          :searchText="searchText"
          :searchResultCount="searchResultCount"
          :turns="turns"
          :userReqs="userReqs"
          :currentTurnIndex="currentTurnIndex"
          :subagentList="subagentList"
          :filteredSubagentList="filteredSubagentList"
          :selectedSubagent="selectedSubagent"
          :subagentDropdownOpen="subagentDropdownOpen"
          :subagentSearchQuery="subagentSearchQuery"
          :subagentTokenUsage="subagentTokenUsage"
          :SUBAGENT_COLORS="SUBAGENT_COLORS"
          :currentFilter="currentFilter"
          :typeFilterOpen="typeFilterOpen"
          :filters="filters"
          :activeFilterCount="activeFilterCount"
          :formatDuration="formatDuration"
          :truncateText="truncateText"
          @toggleSidebar="sidebarCollapsed = !sidebarCollapsed"
          @update:searchText="searchText = $event"
          @jumpToTurn="jumpToTurn"
          @update:currentTurnIndex="currentTurnIndex = $event"
          @selectSubagent="selectSubagent"
          @toggleSubagentDropdown="subagentDropdownOpen = !subagentDropdownOpen"
          @update:subagentSearchQuery="subagentSearchQuery = $event"
          @setFilter="setFilter"
          @toggleTypeFilter="typeFilterOpen = !typeFilterOpen"
          @clearAllFilters="clearAllFilters"
        />

        <!-- Loading state -->
        <div v-if="eventsLoading" class="loading-message">
          <div style="text-align: center; padding: 40px; color: #c9d1d9;">
            ⏳ Loading events...
          </div>
        </div>

        <!-- Error state -->
        <div v-else-if="eventsError" class="error-message">
          <div style="text-align: center; padding: 40px; color: #f85149;">
            ❌ Error loading events: {{ eventsError }}
          </div>
        </div>

        <!-- Events list -->
        <DynamicScroller
          v-else
          ref="scrollerRef"
          :items="filteredEvents"
          :min-item-size="80"
          :prerender="10"
          key-field="stableId"
          class="scroller"
        >
          <template #default="{ item, index, active }">
            <DynamicScrollerItem
              :item="item"
              :active="active"
              :size-dependencies="[expansionCount]"
              :data-index="index"
            >
              <EventItem
                :item="item"
                :metadata="metadata"
                :expandedTools="expandedTools"
                :expandedContent="expandedContent"
                :searchText="searchText"
                :subagentOwnership="subagentOwnership"
                :formatTime="formatTime"
                :formatToolTime="formatToolTime"
                :formatDateTime="formatDateTime"
                :renderMarkdown="renderMarkdown"
                :highlightSearchText="highlightSearchText"
                :toggleTool="toggleTool"
                :toggleContent="toggleContent"
                :isContentTooLong="isContentTooLong"
                :truncateContent="truncateContent"
                :getBadgeInfo="getBadgeInfo"
                :getToolStatus="getToolStatus"
                :getToolErrorMessage="getToolErrorMessage"
                :getToolDuration="getToolDuration"
                :getToolCommand="getToolCommand"
                :hasTools="hasTools"
                :getToolGroups="getToolGroups"
                :getSubagentInfo="getSubagentInfo"
                :getSubagentColor="getSubagentColor"
                :getTurnNumber="getTurnNumber"
                :getTurnDuration="getTurnDuration"
                :SUBAGENT_COLORS="SUBAGENT_COLORS"
                @selectSubagent="selectSubagent"
              />
            </DynamicScrollerItem>
          </template>
        </DynamicScroller>

        <!-- Bottom spacer -->
        <div class="scroller-bottom-spacer"></div>

        <!-- Floating scroll buttons -->
        <div class="scroll-float-btns">
          <button @click="scrollToTop" title="Scroll to top" class="scroll-edge-btn">▲</button>
          <button @click="scrollToBottom" title="Scroll to bottom" class="scroll-edge-btn">▼</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { DynamicScroller, DynamicScrollerItem } from 'vue-virtual-scroller';
import 'vue-virtual-scroller/dist/vue-virtual-scroller.css';

import SessionHeader from '../components/session/SessionHeader.vue';
import SessionSidebar from '../components/session/SessionSidebar.vue';
import FilterBar from '../components/session/FilterBar.vue';
import EventItem from '../components/session/EventItem.vue';
import { useSessionData } from '../components/session/useSessionData.js';

const {
  sessionId, metadata, exporting, sidebarCollapsed,
  expandedTools, expandedContent, expansionCount,
  currentFilter, searchText, debouncedSearchText, currentTurnIndex,
  scrollerRef, visibleRange,
  loadedEvents, eventsLoading, eventsError,
  flatEvents, filteredEvents, eventCounts, filters,
  turns, userReqs, truncateText,
  formatTime, formatToolTime, formatDateTime,
  renderMarkdown, highlightSearchText,
  toggleTool, toggleContent, isContentTooLong, truncateContent,
  getBadgeInfo, getToolStatus, getToolErrorMessage, getToolDuration, getToolCommand,
  hasTools, getToolGroups,
  getSubagentInfo, getSubagentColor, subagentOwnership,
  setFilter, selectSubagent, selectedSubagent,
  subagentList, filteredSubagentList,
  subagentDropdownOpen, subagentSearchQuery, subagentSearchRef,
  subagentTokenUsage, SUBAGENT_COLORS,
  typeFilterOpen, activeFilterCount, clearAllFilters,
  scrollToTurn, scrollToTop, scrollToBottom, jumpToTurn,
  getTurnNumber, getTurnDuration, repoBasename, escapeHtml,
  exportSession, searchResultCount,
  // Tags
  sessionTags, allTags, tagsEditing, editingTags, tagInputValue, tagInputRef,
  tagsError, showAutocomplete, autocompleteOptions, autocompleteSelectedIndex,
  getTagColor, startEditTags, cancelEditTags, addTag, removeTagFromEdit,
  updateAutocomplete, selectAutocompleteOption, saveTagsOnBlur,
  // Usage
  formatTokens, formatDuration, formatCost,
  totalTokens, totalRequests, totalModels,
  getDisplayUsageInputTokens, getModelCacheHitRatio, toolCallingSummary
} = useSessionData();
</script>

<style scoped>
* { margin: 0; padding: 0; box-sizing: border-box; }

.container {
  max-width: 100%;
  height: 100vh;
  display: flex;
  flex-direction: column;
  padding: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans', Helvetica, Arial, sans-serif;
  background: #0d1117;
  color: #c9d1d9;
  line-height: 1.5;
  overflow: hidden;
}

/* Focus indicators for accessibility */
:deep(button:focus-visible),
:deep(input:focus-visible) {
  outline: 2px solid #58a6ff;
  outline-offset: 2px;
  box-shadow: 0 0 0 4px rgba(88, 166, 255, 0.2);
}

/* Main layout */
.main-layout {
  display: flex;
  flex: 1;
  overflow: hidden;
}

/* Content */
.content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
}

/* Virtual Scroller */
:deep(.vue-recycle-scroller) {
  flex: 1;
  overflow-x: hidden !important;
  padding-bottom: env(safe-area-inset-bottom, 0px);
}
:deep(.vue-recycle-scroller__item-wrapper) {
  overflow: visible !important;
}

/* Scroll float buttons */
.scroll-float-btns {
  position: fixed;
  bottom: 24px;
  right: 24px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  z-index: 9999;
}
.scroll-edge-btn {
  background: #21262d;
  color: #c9d1d9;
  border: 1px solid #30363d;
  border-radius: 50%;
  width: 32px;
  height: 32px;
  font-size: 13px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 8px rgba(0,0,0,0.4);
  transition: background 0.15s, transform 0.1s, opacity 0.15s;
  padding: 0;
  opacity: 0.3;
}
.scroll-edge-btn:hover {
  background: #388bfd;
  border-color: #388bfd;
  color: #fff;
  transform: scale(1.1);
  opacity: 1;
}

/* Bottom spacer */
.scroller-bottom-spacer {
  height: max(env(safe-area-inset-bottom, 0px), 16px);
  flex-shrink: 0;
}

/* Sidebar backdrop — hidden by default, shown via mobile media query */
.sidebar-backdrop {
  display: none;
}

/* ── Mobile responsive ── */
@media (max-width: 640px) {
  .sidebar-backdrop {
    display: block;
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.5);
    z-index: 999;
  }

  .content {
    width: 100%;
  }

  .scroll-float-btns {
    bottom: 16px;
    right: 12px;
  }

  :deep(.vue-recycle-scroller) {
    padding-bottom: max(env(safe-area-inset-bottom, 0px), 80px);
  }
  .scroller-bottom-spacer {
    height: max(env(safe-area-inset-bottom, 0px), 100px);
  }
  .scroll-edge-btn {
    width: 28px;
    height: 28px;
    font-size: 12px;
  }
}
</style>
