<template>
  <div :class="['w-80 shrink-0 bg-surface border-r border-border overflow-y-auto p-4 transition-all duration-300', collapsed ? '!w-0 !p-0 !border-r-0 overflow-hidden' : '']">
    <div class="sidebar-section mb-5">
      <div class="sidebar-section-title">
Session Info
</div>
      <div class="session-info text-sm">
        <table class="w-full text-xs [&_td]:py-1.5 [&_td]:px-2 [&_td]:border-b [&_td]:border-[rgba(110,118,129,0.15)] [&_td]:align-top [&_td:first-child]:text-text-muted [&_td:first-child]:font-medium [&_td:first-child]:whitespace-nowrap [&_td:first-child]:w-[85px] [&_td:last-child]:text-text-secondary [&_td:last-child]:break-all [&_tr:last-child_td]:border-b-0">
          <tbody>
            <tr v-if="metadata.source">
              <td>Source</td>
              <td>
                <span class="source-badge" :style="getSourceBadgeStyle(metadata.sourceBadgeClass)">
                  {{ metadata.sourceName || 'GitHub Copilot' }}
                </span>
              </td>
            </tr>
            <tr v-if="metadata.modernizeVersion">
              <td>Version</td>
              <td>{{ metadata.modernizeVersion }}</td>
            </tr>
            <tr v-if="metadata.source === 'modernize' && metadata.copilotVersion">
              <td>Copilot SDK</td>
              <td>{{ metadata.copilotVersion }}</td>
            </tr>
            <tr v-if="metadata.copilotVersion && metadata.source !== 'modernize'">
              <td>Version</td>
              <td>{{ metadata.copilotVersion }}</td>
            </tr>
            <tr v-if="metadata.model">
              <td>Model</td>
              <td>{{ metadata.model }}</td>
            </tr>
            <tr v-if="metadata.agentName">
              <td>Agent</td>
              <td>🤖 {{ metadata.agentName }}</td>
            </tr>
            <tr v-if="metadata.repo">
              <td>Repo</td>
              <td>{{ metadata.repo }}</td>
            </tr>
            <tr v-if="metadata.branch">
              <td>Branch</td>
              <td>{{ metadata.branch }}</td>
            </tr>
            <tr v-if="metadata.cwd && !metadata.repo">
              <td>Repo</td>
              <td>{{ metadata.cwd }}</td>
            </tr>
            <tr v-if="metadata.created">
              <td>Created</td>
              <td>{{ formatDateTime(metadata.created) }}</td>
            </tr>
            <tr v-if="metadata.updated">
              <td>Updated</td>
              <td>{{ formatDateTime(metadata.updated) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Usage Section -->
    <div v-if="metadata.usage" class="sidebar-section mb-5">
      <div class="sidebar-section-title">
Token Usage
</div>
      <div class="text-xs flex flex-col gap-3">
        <div class="p-3.5 bg-gradient-to-b from-[rgba(88,166,255,0.16)] to-[rgba(22,27,34,0.94)] border border-[rgba(88,166,255,0.22)] rounded-[10px] text-text-secondary shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
          <div class="text-2xs font-bold text-text-muted uppercase tracking-[0.7px] mb-1.5">
Overview
</div>
          <div class="text-2xl leading-none font-bold text-text flex items-baseline gap-1.5">
            {{ formatTokens(totalTokens) }} <span class="text-2xs font-semibold uppercase tracking-[0.5px] text-text-muted">tokens</span>
          </div>
          <div class="mt-1.5 text-xs text-text-muted">
            Usage captured across {{ totalModels }} model{{ totalModels === 1 ? '' : 's' }}
          </div>
          <div class="grid grid-cols-3 gap-2 mt-3">
            <div class="overview-metric-cell">
              <span class="usage-metric-label">Requests</span>
              <span class="usage-metric-value">{{ totalRequests }} reqs</span>
            </div>
            <div class="overview-metric-cell">
              <span class="usage-metric-label">Models</span>
              <span class="usage-metric-value">{{ totalModels }}</span>
            </div>
            <div class="overview-metric-cell">
              <span class="usage-metric-label">API Time</span>
              <span class="usage-metric-value">{{ formatDuration(metadata.usage.totalApiDurationMs) }}</span>
            </div>
          </div>
        </div>

        <div class="flex flex-col gap-3">
          <div v-if="Object.keys(metadata.usage.modelMetrics).length > 0" class="usage-card">
            <div class="flex items-center justify-between gap-2 mb-2.5">
              <div class="usage-card-title">
Models
</div>
              <div class="inline-flex items-center justify-center min-w-[24px] py-0.5 px-2 rounded-full bg-[rgba(88,166,255,0.12)] border border-[rgba(88,166,255,0.22)] text-link text-2xs font-bold">
{{ totalModels }}
</div>
            </div>
            <div class="flex flex-col gap-2">
              <div v-for="(metrics, model) in metadata.usage.modelMetrics" :key="model" class="p-2.5 bg-gradient-to-b from-[rgba(13,17,23,0.96)] to-[rgba(22,27,34,0.96)] border border-[rgba(48,54,61,0.9)] rounded-lg">
                <div class="flex flex-col items-stretch gap-2 mb-2.5">
                  <div class="block max-w-full text-2xs font-semibold leading-[1.35] text-link font-mono whitespace-nowrap overflow-x-auto overflow-y-hidden pb-0.5" style="scrollbar-width: thin; scrollbar-color: rgba(110, 118, 129, 0.55) transparent;" :title="model">
{{ model }}
</div>
                  <div class="flex flex-wrap justify-start gap-1.5">
                    <span class="model-stat-pill bg-[rgba(110,118,129,0.12)] border border-[rgba(110,118,129,0.2)] text-text-secondary">{{ metrics.requests?.count || 0 }} reqs</span>
                    <span v-if="metrics.requests?.cost" class="model-stat-pill bg-[rgba(210,153,34,0.12)] border border-[rgba(210,153,34,0.25)] text-warning">{{ formatCost(metrics.requests.cost) }}</span>
                    <span v-if="getModelCacheHitRatio(model) !== null" class="model-stat-pill bg-[rgba(63,185,80,0.12)] border border-[rgba(63,185,80,0.25)] text-success">{{ getModelCacheHitRatio(model) }}% cache</span>
                  </div>
                </div>
                <div v-if="metrics.usage" class="grid grid-cols-2 gap-2">
                  <div class="usage-metric-cell">
                    <span class="usage-metric-label">Input</span>
                    <span class="usage-metric-value">{{ formatTokens(getDisplayUsageInputTokens(model)) }}</span>
                  </div>
                  <div class="usage-metric-cell">
                    <span class="usage-metric-label">Output</span>
                    <span class="usage-metric-value">{{ formatTokens(metrics.usage.outputTokens || 0) }}</span>
                  </div>
                  <div v-if="metrics.usage?.cacheReadTokens" class="usage-metric-cell">
                    <span class="usage-metric-label">Cache Read</span>
                    <span class="usage-metric-value">{{ formatTokens(metrics.usage.cacheReadTokens) }}</span>
                  </div>
                  <div v-if="metrics.usage?.cacheWriteTokens" class="usage-metric-cell">
                    <span class="usage-metric-label">Cache Write</span>
                    <span class="usage-metric-value">{{ formatTokens(metrics.usage.cacheWriteTokens) }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div v-if="metadata.usage.currentTokens || metadata.usage.systemTokens || metadata.usage.conversationTokens || metadata.usage.toolDefinitionsTokens" class="usage-card">
            <div class="flex items-center justify-between gap-2 mb-2.5">
              <div class="usage-card-title">
Context Window
</div>
            </div>
            <div class="grid grid-cols-2 gap-2">
              <div v-if="metadata.usage.currentTokens" class="usage-metric-cell">
                <span class="usage-metric-label">Current</span>
                <span class="usage-metric-value">{{ formatTokens(metadata.usage.currentTokens) }}</span>
              </div>
              <div v-if="metadata.usage.systemTokens" class="usage-metric-cell">
                <span class="usage-metric-label">System</span>
                <span class="usage-metric-value">{{ formatTokens(metadata.usage.systemTokens) }}</span>
              </div>
              <div v-if="metadata.usage.conversationTokens" class="usage-metric-cell">
                <span class="usage-metric-label">Conversation</span>
                <span class="usage-metric-value">{{ formatTokens(metadata.usage.conversationTokens) }}</span>
              </div>
              <div v-if="metadata.usage.toolDefinitionsTokens" class="usage-metric-cell">
                <span class="usage-metric-label">Tools</span>
                <span class="usage-metric-value">{{ formatTokens(metadata.usage.toolDefinitionsTokens) }}</span>
              </div>
            </div>
          </div>

          <div v-if="metadata.usage.codeChanges && (metadata.usage.codeChanges.linesAdded > 0 || metadata.usage.codeChanges.linesRemoved > 0)" class="usage-card">
            <div class="flex items-center justify-between gap-2 mb-2.5">
              <div class="usage-card-title">
Code Changes
</div>
            </div>
            <div class="grid grid-cols-3 gap-2">
              <div class="usage-metric-cell">
                <span class="usage-metric-label">Added</span>
                <span class="text-sm leading-tight font-bold text-success break-all">+{{ metadata.usage.codeChanges.linesAdded }}</span>
              </div>
              <div class="usage-metric-cell">
                <span class="usage-metric-label">Removed</span>
                <span class="text-sm leading-tight font-bold text-danger-emphasis break-all">-{{ metadata.usage.codeChanges.linesRemoved }}</span>
              </div>
              <div class="usage-metric-cell">
                <span class="usage-metric-label">Files</span>
                <span class="usage-metric-value">{{ metadata.usage.codeChanges.filesModified?.length || 0 }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Tool Calling Summary -->
    <div v-if="toolCallingSummary.length" class="sidebar-section mb-5">
      <div class="sidebar-section-title">
Tool Calls
</div>
      <div class="flex flex-col gap-1">
        <div v-for="item in toolCallingSummary" :key="item.name" class="tool-bar-item">
          <div class="absolute left-0 top-0 bottom-0 bg-[rgba(158,106,3,0.15)] rounded-badge transition-[width] duration-300" :style="{ width: (item.count / toolCallingSummary[0].count * 100) + '%' }" />
          <span class="relative text-text-secondary overflow-hidden text-ellipsis whitespace-nowrap min-w-0 flex-1" :title="item.name">{{ item.name }}</span>
          <span class="relative text-warning font-semibold ml-2 shrink-0">{{ item.count }}</span>
        </div>
      </div>
    </div>

    <!-- Session Tags -->
    <div data-testid="tags-section" class="sidebar-section mb-5 mt-4">
      <div class="sidebar-section-title">
Tags
</div>
      <div v-if="!tagsEditing" class="flex flex-wrap gap-1.5 min-h-[28px] items-start">
        <span v-for="tag in sessionTags" :key="tag" data-testid="tag-label" class="inline-flex items-center gap-1 py-1 px-2.5 rounded-xl text-xs font-medium text-white cursor-default transition-opacity duration-200 hover:opacity-80" :style="{ backgroundColor: getTagColor(tag) }">
          {{ tag }}
        </span>
        <button data-testid="tags-edit-btn" class="bg-none border border-border rounded py-1 px-2 text-text-muted cursor-pointer text-xs transition-all duration-200 inline-flex items-center gap-1 hover:border-accent hover:text-accent" title="Edit tags" @click="$emit('startEditTags')">
✏️
</button>
      </div>
      <div v-else class="relative mt-2">
        <div class="flex flex-wrap gap-1.5 p-2 bg-surface border border-border rounded-md min-h-[38px] focus-within:border-accent">
          <span v-for="tag in editingTags" :key="tag" data-testid="tag-input-chip" class="inline-flex items-center gap-1 py-1 px-2 rounded-xl text-xs font-medium text-white" :style="{ backgroundColor: getTagColor(tag) }">
            {{ tag }}
            <button class="bg-none border-none text-white/70 cursor-pointer text-xs p-0 ml-0.5 hover:text-white" title="Remove tag" @click="$emit('removeTagFromEdit', tag)">×</button>
          </span>
          <input
            ref="tagInputRef"
            data-testid="tag-input"
            :value="tagInputValue"
            class="flex-1 min-w-[120px] bg-transparent border-none outline-none text-text-secondary text-sm p-1 placeholder:text-text-faint"
            placeholder="Type tag name..."
            maxlength="30"
            @input="$emit('update:tagInputValue', $event.target.value); $emit('updateAutocomplete')"
            @keydown.enter.prevent="$emit('addTag')"
            @keydown.escape="$emit('cancelEditTags')"
            @blur="$emit('saveTagsOnBlur')"
          >
        </div>
        <div v-if="showAutocomplete && autocompleteOptions.length > 0" class="absolute top-full left-0 right-0 bg-surface border border-border rounded-md mt-1 max-h-[200px] overflow-y-auto z-[100] shadow-[0_4px_12px_rgba(0,0,0,0.3)]">
          <div
            v-for="(option, index) in autocompleteOptions"
            :key="option"
            :class="[
              'py-2 px-3 text-sm text-text-secondary cursor-pointer transition-colors duration-200 hover:bg-accent-subtle',
              index === autocompleteSelectedIndex ? 'bg-[rgba(88,166,255,0.25)]' : ''
            ]"
            @click="$emit('selectAutocompleteOption', option)"
            @mouseenter="$emit('update:autocompleteSelectedIndex', index)"
          >
            {{ option }}
          </div>
        </div>
        <div v-if="tagsError" class="mt-1.5 text-xs text-danger-emphasis">
{{ tagsError }}
</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

const props = defineProps({
  collapsed: Boolean,
  metadata: Object,
  formatDateTime: Function,
  formatTokens: Function,
  formatDuration: Function,
  formatCost: Function,
  totalTokens: Number,
  totalRequests: Number,
  totalModels: Number,
  getDisplayUsageInputTokens: Function,
  getModelCacheHitRatio: Function,
  toolCallingSummary: Array,
  sessionTags: Array,
  tagsEditing: Boolean,
  editingTags: Array,
  tagInputValue: String,
  tagsError: String,
  showAutocomplete: Boolean,
  autocompleteOptions: Array,
  autocompleteSelectedIndex: Number,
  getTagColor: Function
})

defineEmits([
  'startEditTags',
  'cancelEditTags',
  'addTag',
  'removeTagFromEdit',
  'updateAutocomplete',
  'selectAutocompleteOption',
  'saveTagsOnBlur',
  'update:tagInputValue',
  'update:autocompleteSelectedIndex'
])

const tagInputRef = ref(null)

const SOURCE_BADGE_STYLES = {
  'source-cli': { background: 'rgba(35, 134, 54, 0.2)', color: '#3fb950', border: '1px solid rgba(35, 134, 54, 0.4)' },
  'source-vscode': { background: 'rgba(0, 122, 204, 0.2)', color: '#4fc3f7', border: '1px solid rgba(0, 122, 204, 0.4)' },
  'source-copilot': { background: 'rgba(88, 166, 255, 0.2)', color: '#58a6ff', border: '1px solid rgba(88, 166, 255, 0.4)' },
  'source-claude': { background: 'rgba(210, 153, 34, 0.2)', color: '#d29922', border: '1px solid rgba(210, 153, 34, 0.4)' },
  'source-pi-mono': { background: 'rgba(138, 102, 204, 0.2)', color: '#a78bdb', border: '1px solid rgba(138, 102, 204, 0.4)' },
  'source-modernize': { background: 'rgba(76, 175, 80, 0.2)', color: '#66bb6a', border: '1px solid rgba(76, 175, 80, 0.4)' },
}

function getSourceBadgeStyle(cls) {
  return SOURCE_BADGE_STYLES[cls] || SOURCE_BADGE_STYLES['source-copilot']
}

defineExpose({ tagInputRef })
</script>
