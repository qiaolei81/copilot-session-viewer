<template>
  <div data-testid="session-layout" class="max-w-full h-screen flex flex-col p-0 font-sans bg-canvas text-text-secondary leading-normal overflow-hidden">
    <SessionHeader
      :session-id="sessionId"
      :source="source"
      :metadata="metadata"
      :exporting="exporting"
      @export="exportSession"
    />

    <div class="flex flex-1 overflow-hidden">
      <!-- Mobile overlay backdrop -->
      <div
        v-if="!sidebarCollapsed"
        class="hidden sm:hidden max-sm:block fixed inset-0 bg-black/50 z-backdrop"
        @click="sidebarCollapsed = true"
      />

      <SessionSidebar class="sidebar"
        :collapsed="sidebarCollapsed"
        :metadata="metadata"
        :format-date-time="formatDateTime"
        :format-tokens="formatTokens"
        :format-duration="formatDuration"
        :format-cost="formatCost"
        :total-tokens="totalTokens"
        :total-requests="totalRequests"
        :total-models="totalModels"
        :get-display-usage-input-tokens="getDisplayUsageInputTokens"
        :get-model-cache-hit-ratio="getModelCacheHitRatio"
        :tool-calling-summary="toolCallingSummary"
        :session-tags="sessionTags"
        :tags-editing="tagsEditing"
        :editing-tags="editingTags"
        :tag-input-value="tagInputValue"
        :tags-error="tagsError"
        :show-autocomplete="showAutocomplete"
        :autocomplete-options="autocompleteOptions"
        :autocomplete-selected-index="autocompleteSelectedIndex"
        :get-tag-color="getTagColor"
        @start-edit-tags="startEditTags"
        @cancel-edit-tags="cancelEditTags"
        @add-tag="addTag"
        @remove-tag-from-edit="removeTagFromEdit"
        @update-autocomplete="updateAutocomplete"
        @select-autocomplete-option="selectAutocompleteOption"
        @save-tags-on-blur="saveTagsOnBlur"
        @update:tag-input-value="tagInputValue = $event"
      />

      <div class="flex-1 flex flex-col overflow-hidden relative">
        <FilterBar
          :sidebar-collapsed="sidebarCollapsed"
          :search-text="searchText"
          :search-result-count="searchResultCount"
          :turns="turns"
          :user-reqs="userReqs"
          :current-turn-index="currentTurnIndex"
          :subagent-list="subagentList"
          :filtered-subagent-list="filteredSubagentList"
          :selected-subagent="selectedSubagent"
          :subagent-dropdown-open="subagentDropdownOpen"
          :subagent-search-query="subagentSearchQuery"
          :subagent-token-usage="subagentTokenUsage"
          :SUBAGENT_COLORS="SUBAGENT_COLORS"
          :current-filter="currentFilter"
          :type-filter-open="typeFilterOpen"
          :filters="filters"
          :active-filter-count="activeFilterCount"
          :format-duration="formatDuration"
          :truncate-text="truncateText"
          @toggle-sidebar="sidebarCollapsed = !sidebarCollapsed"
          @update:search-text="searchText = $event"
          @jump-to-turn="jumpToTurn"
          @update:current-turn-index="currentTurnIndex = $event"
          @select-subagent="selectSubagent"
          @toggle-subagent-dropdown="subagentDropdownOpen = !subagentDropdownOpen"
          @update:subagent-search-query="subagentSearchQuery = $event"
          @set-filter="setFilter"
          @toggle-type-filter="typeFilterOpen = !typeFilterOpen"
          @clear-all-filters="clearAllFilters"
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
                :expanded-tools="expandedTools"
                :expanded-content="expandedContent"
                :search-text="searchText"
                :subagent-ownership="subagentOwnership"
                :format-time="formatTime"
                :format-tool-time="formatToolTime"
                :format-date-time="formatDateTime"
                :render-markdown="renderMarkdown"
                :highlight-search-text="highlightSearchText"
                :toggle-tool="toggleTool"
                :toggle-content="toggleContent"
                :is-content-too-long="isContentTooLong"
                :truncate-content="truncateContent"
                :get-badge-info="getBadgeInfo"
                :get-tool-status="getToolStatus"
                :get-tool-error-message="getToolErrorMessage"
                :get-tool-duration="getToolDuration"
                :get-tool-command="getToolCommand"
                :has-tools="hasTools"
                :get-tool-groups="getToolGroups"
                :get-subagent-info="getSubagentInfo"
                :get-subagent-color="getSubagentColor"
                :get-turn-number="getTurnNumber"
                :get-turn-duration="getTurnDuration"
                :SUBAGENT_COLORS="SUBAGENT_COLORS"
                @select-subagent="selectSubagent"
              />
            </DynamicScrollerItem>
          </template>
        </DynamicScroller>

        <!-- Bottom spacer -->
        <div class="h-[max(env(safe-area-inset-bottom,0px),16px)] shrink-0" />

        <!-- Floating scroll buttons -->
        <div class="fixed bottom-6 right-6 flex flex-col gap-2 z-modal">
          <button title="Scroll to top" class="scroll-btn" @click="scrollToTop">
▲
</button>
          <button title="Scroll to bottom" class="scroll-btn" @click="scrollToBottom">
▼
</button>
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
  sessionId, source, metadata, exporting, sidebarCollapsed,
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
