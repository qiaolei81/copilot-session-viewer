<template>
  <div :class="['sidebar', { collapsed: collapsed }]" class="w-80 shrink-0 bg-[#161b22] border-r border-[#30363d] overflow-y-auto p-4 transition-all duration-300">
    <div class="sidebar-section mb-5">
      <div class="sidebar-section-title text-xs font-semibold text-[#c9d1d9] mb-3 uppercase tracking-wider">
Session Info
</div>
      <div class="session-info text-[13px]">
        <table class="session-info-table w-full text-xs">
          <tbody>
            <tr v-if="metadata.source">
              <td>Source</td>
              <td>
                <span :class="['source-badge', metadata.sourceBadgeClass || 'source-copilot']">
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
      <div class="sidebar-section-title text-xs font-semibold text-[#c9d1d9] mb-3 uppercase tracking-wider">
Token Usage
</div>
      <div class="usage-container">
        <div class="usage-summary">
          <div class="usage-summary-eyebrow">
Overview
</div>
          <div class="usage-summary-total">
            {{ formatTokens(totalTokens) }} <span class="usage-summary-total-unit">tokens</span>
          </div>
          <div class="usage-summary-caption">
            Usage captured across {{ totalModels }} model{{ totalModels === 1 ? '' : 's' }}
          </div>
          <div class="usage-summary-metrics">
            <div class="usage-metric-card usage-metric-card-summary">
              <span class="usage-metric-label">Requests</span>
              <span class="usage-metric-value">{{ totalRequests }} reqs</span>
            </div>
            <div class="usage-metric-card usage-metric-card-summary">
              <span class="usage-metric-label">Models</span>
              <span class="usage-metric-value">{{ totalModels }}</span>
            </div>
            <div class="usage-metric-card usage-metric-card-summary">
              <span class="usage-metric-label">API Time</span>
              <span class="usage-metric-value">{{ formatDuration(metadata.usage.totalApiDurationMs) }}</span>
            </div>
          </div>
        </div>

        <div class="usage-expanded">
          <div v-if="Object.keys(metadata.usage.modelMetrics).length > 0" class="usage-section">
            <div class="usage-section-header">
              <div class="usage-section-title">
Models
</div>
              <div class="usage-section-badge">
{{ totalModels }}
</div>
            </div>
            <div class="usage-model-list">
              <div v-for="(metrics, model) in metadata.usage.modelMetrics" :key="model" class="usage-model">
                <div class="usage-model-header">
                  <div class="usage-model-name" :title="model">
{{ model }}
</div>
                  <div class="usage-model-meta">
                    <span class="usage-meta-pill">{{ metrics.requests?.count || 0 }} reqs</span>
                    <span v-if="metrics.requests?.cost" class="usage-meta-pill usage-meta-pill-premium">{{ formatCost(metrics.requests.cost) }}</span>
                    <span v-if="getModelCacheHitRatio(model) !== null" class="usage-meta-pill usage-meta-pill-cache">{{ getModelCacheHitRatio(model) }}% cache</span>
                  </div>
                </div>
                <div v-if="metrics.usage" class="usage-metric-grid">
                  <div class="usage-metric-card">
                    <span class="usage-metric-label">Input</span>
                    <span class="usage-metric-value">{{ formatTokens(getDisplayUsageInputTokens(model)) }}</span>
                  </div>
                  <div class="usage-metric-card">
                    <span class="usage-metric-label">Output</span>
                    <span class="usage-metric-value">{{ formatTokens(metrics.usage.outputTokens || 0) }}</span>
                  </div>
                  <div v-if="metrics.usage?.cacheReadTokens" class="usage-metric-card">
                    <span class="usage-metric-label">Cache Read</span>
                    <span class="usage-metric-value">{{ formatTokens(metrics.usage.cacheReadTokens) }}</span>
                  </div>
                  <div v-if="metrics.usage?.cacheWriteTokens" class="usage-metric-card">
                    <span class="usage-metric-label">Cache Write</span>
                    <span class="usage-metric-value">{{ formatTokens(metrics.usage.cacheWriteTokens) }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div v-if="metadata.usage.currentTokens || metadata.usage.systemTokens || metadata.usage.conversationTokens || metadata.usage.toolDefinitionsTokens" class="usage-section">
            <div class="usage-section-header">
              <div class="usage-section-title">
Context Window
</div>
            </div>
            <div class="usage-metric-grid">
              <div v-if="metadata.usage.currentTokens" class="usage-metric-card">
                <span class="usage-metric-label">Current</span>
                <span class="usage-metric-value">{{ formatTokens(metadata.usage.currentTokens) }}</span>
              </div>
              <div v-if="metadata.usage.systemTokens" class="usage-metric-card">
                <span class="usage-metric-label">System</span>
                <span class="usage-metric-value">{{ formatTokens(metadata.usage.systemTokens) }}</span>
              </div>
              <div v-if="metadata.usage.conversationTokens" class="usage-metric-card">
                <span class="usage-metric-label">Conversation</span>
                <span class="usage-metric-value">{{ formatTokens(metadata.usage.conversationTokens) }}</span>
              </div>
              <div v-if="metadata.usage.toolDefinitionsTokens" class="usage-metric-card">
                <span class="usage-metric-label">Tools</span>
                <span class="usage-metric-value">{{ formatTokens(metadata.usage.toolDefinitionsTokens) }}</span>
              </div>
            </div>
          </div>

          <div v-if="metadata.usage.codeChanges && (metadata.usage.codeChanges.linesAdded > 0 || metadata.usage.codeChanges.linesRemoved > 0)" class="usage-section">
            <div class="usage-section-header">
              <div class="usage-section-title">
Code Changes
</div>
            </div>
            <div class="usage-metric-grid usage-metric-grid-compact">
              <div class="usage-metric-card">
                <span class="usage-metric-label">Added</span>
                <span class="usage-metric-value usage-metric-value-added">+{{ metadata.usage.codeChanges.linesAdded }}</span>
              </div>
              <div class="usage-metric-card">
                <span class="usage-metric-label">Removed</span>
                <span class="usage-metric-value usage-metric-value-removed">-{{ metadata.usage.codeChanges.linesRemoved }}</span>
              </div>
              <div class="usage-metric-card">
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
      <div class="sidebar-section-title text-xs font-semibold text-[#c9d1d9] mb-3 uppercase tracking-wider">
Tool Calls
</div>
      <div class="tool-summary-list">
        <div v-for="item in toolCallingSummary" :key="item.name" class="tool-summary-item">
          <div class="tool-summary-bar" :style="{ width: (item.count / toolCallingSummary[0].count * 100) + '%' }" />
          <span class="tool-summary-name" :title="item.name">{{ item.name }}</span>
          <span class="tool-summary-count">{{ item.count }}</span>
        </div>
      </div>
    </div>

    <!-- Session Tags -->
    <div class="sidebar-section mb-5 session-tags-container">
      <div class="sidebar-section-title text-xs font-semibold text-[#c9d1d9] mb-3 uppercase tracking-wider">
Tags
</div>
      <div v-if="!tagsEditing" class="tags-display">
        <span v-for="tag in sessionTags" :key="tag" class="tag-label" :style="{ backgroundColor: getTagColor(tag) }">
          {{ tag }}
        </span>
        <button class="tags-edit-btn" title="Edit tags" @click="$emit('startEditTags')">
✏️
</button>
      </div>
      <div v-else class="tags-dropdown">
        <div class="tags-input-container">
          <span v-for="tag in editingTags" :key="tag" class="tag-input-chip" :style="{ backgroundColor: getTagColor(tag) }">
            {{ tag }}
            <button title="Remove tag" @click="$emit('removeTagFromEdit', tag)">×</button>
          </span>
          <input
            ref="tagInputRef"
            :value="tagInputValue"
            class="tags-text-input"
            placeholder="Type tag name..."
            maxlength="30"
            @input="$emit('update:tagInputValue', $event.target.value); $emit('updateAutocomplete')"
            @keydown.enter.prevent="$emit('addTag')"
            @keydown.escape="$emit('cancelEditTags')"
            @blur="$emit('saveTagsOnBlur')"
          >
        </div>
        <div v-if="showAutocomplete && autocompleteOptions.length > 0" class="tags-autocomplete">
          <div
            v-for="(option, index) in autocompleteOptions"
            :key="option"
            :class="['tags-autocomplete-item', { selected: index === autocompleteSelectedIndex }]"
            @click="$emit('selectAutocompleteOption', option)"
            @mouseenter="$emit('update:autocompleteSelectedIndex', index)"
          >
            {{ option }}
          </div>
        </div>
        <div v-if="tagsError" class="tags-error">
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

defineExpose({ tagInputRef })
</script>
