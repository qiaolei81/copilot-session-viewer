<template>
  <div :class="['sidebar', { collapsed: collapsed }]">
    <div class="sidebar-section">
      <div class="sidebar-section-title">Session Info</div>
      <div class="session-info">
        <table class="session-info-table">
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
    <div v-if="metadata.usage" class="sidebar-section">
      <div class="sidebar-section-title">Token Usage</div>
      <div class="usage-container">
        <div class="usage-summary">
          <div class="usage-summary-eyebrow">Overview</div>
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
              <div class="usage-section-title">Models</div>
              <div class="usage-section-badge">{{ totalModels }}</div>
            </div>
            <div class="usage-model-list">
              <div v-for="(metrics, model) in metadata.usage.modelMetrics" :key="model" class="usage-model">
                <div class="usage-model-header">
                  <div class="usage-model-name" :title="model">{{ model }}</div>
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
              <div class="usage-section-title">Context Window</div>
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
              <div class="usage-section-title">Code Changes</div>
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
    <div v-if="toolCallingSummary.length" class="sidebar-section">
      <div class="sidebar-section-title">Tool Calls</div>
      <div class="tool-summary-list">
        <div v-for="item in toolCallingSummary" :key="item.name" class="tool-summary-item">
          <div class="tool-summary-bar" :style="{ width: (item.count / toolCallingSummary[0].count * 100) + '%' }"></div>
          <span class="tool-summary-name" :title="item.name">{{ item.name }}</span>
          <span class="tool-summary-count">{{ item.count }}</span>
        </div>
      </div>
    </div>

    <!-- Session Tags -->
    <div class="sidebar-section session-tags-container">
      <div class="sidebar-section-title">Tags</div>
      <div v-if="!tagsEditing" class="tags-display">
        <span v-for="tag in sessionTags" :key="tag" class="tag-label" :style="{ backgroundColor: getTagColor(tag) }">
          {{ tag }}
        </span>
        <button class="tags-edit-btn" @click="$emit('startEditTags')" title="Edit tags">✏️</button>
      </div>
      <div v-else class="tags-dropdown">
        <div class="tags-input-container">
          <span v-for="tag in editingTags" :key="tag" class="tag-input-chip" :style="{ backgroundColor: getTagColor(tag) }">
            {{ tag }}
            <button @click="$emit('removeTagFromEdit', tag)" title="Remove tag">×</button>
          </span>
          <input
            ref="tagInputRef"
            :value="tagInputValue"
            @input="$emit('update:tagInputValue', $event.target.value); $emit('updateAutocomplete')"
            @keydown.enter.prevent="$emit('addTag')"
            @keydown.escape="$emit('cancelEditTags')"
            @blur="$emit('saveTagsOnBlur')"
            class="tags-text-input"
            placeholder="Type tag name..."
            maxlength="30"
          />
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
        <div v-if="tagsError" class="tags-error">{{ tagsError }}</div>
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

<style scoped>
/* Sidebar */
.sidebar {
  width: 320px;
  flex-shrink: 0;
  background: #161b22;
  border-right: 1px solid #30363d;
  overflow-y: auto;
  padding: 16px;
  transition: all 0.3s ease;
}
.sidebar.collapsed {
  width: 0;
  padding: 0;
  border-right: none;
  overflow: hidden;
}

/* Sidebar sections */
.sidebar-section {
  margin-bottom: 20px;
}
.sidebar-section-title {
  font-size: 12px;
  font-weight: 600;
  color: #c9d1d9;
  margin-bottom: 12px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

/* Session Info */
.session-info {
  font-size: 13px;
}

/* Session info table */
.session-info-table {
  width: 100%;
  font-size: 12px;
}
.session-info-table td {
  padding: 6px 8px;
  border-bottom: 1px solid rgba(110, 118, 129, 0.15);
  vertical-align: top;
}
.session-info-table td:first-child {
  color: #8b949e;
  font-weight: 500;
  white-space: nowrap;
  width: 85px;
}
.session-info-table td:last-child {
  color: #c9d1d9;
  word-break: break-all;
}
.session-info-table tr:last-child td {
  border-bottom: none;
}

/* Source badges */
.source-badge {
  display: inline-block;
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 3px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.source-cli {
  background: rgba(35, 134, 54, 0.2);
  color: #3fb950;
  border: 1px solid rgba(35, 134, 54, 0.4);
}
.source-vscode {
  background: rgba(0, 122, 204, 0.2);
  color: #4fc3f7;
  border: 1px solid rgba(0, 122, 204, 0.4);
}
.source-copilot {
  background: rgba(88, 166, 255, 0.2);
  color: #58a6ff;
  border: 1px solid rgba(88, 166, 255, 0.4);
}
.source-claude {
  background: rgba(210, 153, 34, 0.2);
  color: #d29922;
  border: 1px solid rgba(210, 153, 34, 0.4);
}
.source-pi-mono {
  background: rgba(138, 102, 204, 0.2);
  color: #a78bdb;
  border: 1px solid rgba(138, 102, 204, 0.4);
}
.source-modernize {
  background: rgba(76, 175, 80, 0.2);
  color: #66bb6a;
  border: 1px solid rgba(76, 175, 80, 0.4);
}

/* Session Tags */
.session-tags-container {
  margin-top: 16px;
}
.tags-display {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  min-height: 28px;
  align-items: flex-start;
}
.tag-label {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;
  color: #fff;
  cursor: default;
  transition: opacity 0.2s;
}
.tag-label:hover {
  opacity: 0.8;
}
.tag-remove {
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.7);
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
  padding: 0;
  margin-left: 2px;
  transition: color 0.2s;
}
.tag-remove:hover {
  color: #fff;
}
.tags-edit-btn {
  background: none;
  border: 1px solid #30363d;
  border-radius: 4px;
  color: #8b949e;
  cursor: pointer;
  padding: 4px 8px;
  font-size: 12px;
  transition: all 0.2s;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.tags-edit-btn:hover {
  border-color: #58a6ff;
  color: #58a6ff;
}
.tags-dropdown {
  position: relative;
  margin-top: 8px;
}
.tags-input-container {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 8px;
  background: #161b22;
  border: 1px solid #30363d;
  border-radius: 6px;
  min-height: 38px;
}
.tags-input-container:focus-within {
  border-color: #58a6ff;
}
.tag-input-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;
  color: #fff;
}
.tag-input-chip button {
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.7);
  cursor: pointer;
  font-size: 12px;
  padding: 0;
  margin-left: 2px;
}
.tag-input-chip button:hover {
  color: #fff;
}
.tags-text-input {
  flex: 1;
  min-width: 120px;
  background: transparent;
  border: none;
  outline: none;
  color: #c9d1d9;
  font-size: 13px;
  padding: 4px;
}
.tags-text-input::placeholder {
  color: #6e7681;
}
.tags-autocomplete {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  background: #161b22;
  border: 1px solid #30363d;
  border-radius: 6px;
  margin-top: 4px;
  max-height: 200px;
  overflow-y: auto;
  z-index: 100;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}
.tags-autocomplete-item {
  padding: 8px 12px;
  font-size: 13px;
  color: #c9d1d9;
  cursor: pointer;
  transition: background 0.2s;
}
.tags-autocomplete-item:hover {
  background: rgba(88, 166, 255, 0.15);
}
.tags-autocomplete-item.selected {
  background: rgba(88, 166, 255, 0.25);
}
.tags-error {
  margin-top: 6px;
  font-size: 12px;
  color: #f85149;
}

/* Usage Section */
.usage-container {
  font-size: 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.usage-summary {
  padding: 14px;
  background: linear-gradient(180deg, rgba(88, 166, 255, 0.16) 0%, rgba(22, 27, 34, 0.94) 100%);
  border: 1px solid rgba(88, 166, 255, 0.22);
  border-radius: 10px;
  color: #c9d1d9;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
}
.usage-summary-eyebrow {
  font-size: 10px;
  font-weight: 700;
  color: #8b949e;
  text-transform: uppercase;
  letter-spacing: 0.7px;
  margin-bottom: 6px;
}
.usage-summary-total {
  font-size: 24px;
  line-height: 1;
  font-weight: 700;
  color: #e6edf3;
  display: flex;
  align-items: baseline;
  gap: 6px;
}
.usage-summary-total-unit {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: #8b949e;
}
.usage-summary-caption {
  margin-top: 6px;
  font-size: 12px;
  color: #8b949e;
}
.usage-summary-metrics {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  margin-top: 12px;
}
.usage-expanded {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.usage-section {
  padding: 12px;
  background: rgba(110, 118, 129, 0.05);
  border: 1px solid #30363d;
  border-radius: 10px;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.02);
}
.usage-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 10px;
}
.usage-section-title {
  font-size: 11px;
  font-weight: 600;
  color: #8b949e;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin: 0;
}
.usage-section-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 24px;
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(88, 166, 255, 0.12);
  border: 1px solid rgba(88, 166, 255, 0.22);
  color: #79c0ff;
  font-size: 10px;
  font-weight: 700;
}
.usage-model-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.usage-model {
  padding: 10px;
  background: linear-gradient(180deg, rgba(13, 17, 23, 0.96) 0%, rgba(22, 27, 34, 0.96) 100%);
  border: 1px solid rgba(48, 54, 61, 0.9);
  border-radius: 8px;
}
.usage-model-header {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 8px;
  margin-bottom: 10px;
}
.usage-model-name {
  display: block;
  max-width: 100%;
  font-size: 11px;
  font-weight: 600;
  line-height: 1.35;
  color: #79c0ff;
  font-family: 'SF Mono', 'Monaco', 'Consolas', monospace;
  white-space: nowrap;
  word-break: normal;
  overflow-wrap: normal;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: thin;
  scrollbar-color: rgba(110, 118, 129, 0.55) transparent;
  padding-bottom: 2px;
}
.usage-model-name::-webkit-scrollbar {
  height: 4px;
}
.usage-model-name::-webkit-scrollbar-thumb {
  background: rgba(110, 118, 129, 0.55);
  border-radius: 999px;
}
.usage-model-name::-webkit-scrollbar-track {
  background: transparent;
}
.usage-model-meta {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-start;
  gap: 6px;
}
.usage-meta-pill {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(110, 118, 129, 0.12);
  border: 1px solid rgba(110, 118, 129, 0.2);
  color: #c9d1d9;
  font-size: 10px;
  font-weight: 600;
}
.usage-meta-pill-premium {
  color: #d29922;
  border-color: rgba(210, 153, 34, 0.25);
  background: rgba(210, 153, 34, 0.12);
}
.usage-meta-pill-cache {
  color: #3fb950;
  border-color: rgba(63, 185, 80, 0.25);
  background: rgba(63, 185, 80, 0.12);
}
.usage-metric-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}
.usage-metric-grid-compact {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}
.usage-metric-card {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  padding: 9px 10px;
  border-radius: 8px;
  border: 1px solid rgba(48, 54, 61, 0.8);
  background: rgba(13, 17, 23, 0.5);
}
.usage-metric-card-summary {
  background: rgba(13, 17, 23, 0.42);
  border-color: rgba(88, 166, 255, 0.14);
}
.usage-metric-label {
  font-size: 10px;
  font-weight: 700;
  color: #8b949e;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.usage-metric-value {
  font-size: 14px;
  line-height: 1.2;
  font-weight: 700;
  color: #e6edf3;
  overflow-wrap: anywhere;
}
.usage-metric-value-added {
  color: #3fb950;
}
.usage-metric-value-removed {
  color: #f85149;
}

/* Tool Calling Summary */
.tool-summary-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.tool-summary-item {
  position: relative;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 3px 6px;
  font-size: 12px;
  border-radius: 3px;
  overflow: hidden;
}
.tool-summary-bar {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  background: rgba(158, 106, 3, 0.15);
  border-radius: 3px;
  transition: width 0.3s ease;
}
.tool-summary-name {
  position: relative;
  color: #c9d1d9;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
  flex: 1;
}
.tool-summary-count {
  position: relative;
  color: #d29922;
  font-weight: 600;
  margin-left: 8px;
  flex-shrink: 0;
}

/* Mobile responsive */
@media (max-width: 768px) {
  .sidebar {
    position: fixed;
    top: 0;
    left: 0;
    height: 100%;
    width: 280px !important;
    z-index: 1000;
    box-shadow: 4px 0 16px rgba(0, 0, 0, 0.6);
    transform: translateX(-100%);
    transition: transform 0.3s ease;
  }
  .sidebar:not(.collapsed) {
    transform: translateX(0);
  }
  .sidebar.collapsed {
    transform: translateX(-100%);
    width: 280px !important;
    padding: 16px !important;
    border-right: 1px solid #30363d !important;
    overflow-y: auto !important;
  }

  .usage-summary {
    padding: 12px;
  }
  .usage-summary-total {
    font-size: 20px;
  }
  .usage-summary-metrics,
  .usage-metric-grid-compact {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .usage-model-header {
    gap: 6px;
  }
  .usage-model-meta {
    justify-content: flex-start;
  }
}
</style>
