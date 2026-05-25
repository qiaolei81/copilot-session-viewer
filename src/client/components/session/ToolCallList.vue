<script setup>
const props = defineProps({
  toolGroups: { type: Array, required: true },
  eventStableId: { type: String, required: true },
  expandedTools: { type: Object, default: () => ({}) },
})

const emit = defineEmits(['toggleTool'])

function getToolStatus(group) {
  if (!group.complete) return { icon: '⏳', color: 'tool-status-running' }
  const d = group.complete.data || {}
  if (d.error || d.isError) return { icon: '❌', color: 'tool-status-error' }
  return { icon: '✓', color: 'tool-status-success' }
}

function getToolErrorMessage(group) {
  if (!group.complete?.data?.error) return ''
  const error = group.complete.data.error
  if (typeof error === 'object' && error.message) return error.message
  if (typeof error === 'string') {
    try { const p = JSON.parse(error); if (p.message) return p.message } catch {}
    return error
  }
  return String(error)
}

function getToolDuration(group) {
  if (!group.complete) return ''
  const startTime = new Date(group.start.timestamp).getTime()
  const endTime = new Date(group.complete.timestamp).getTime()
  const durationMs = endTime - startTime
  if (durationMs >= 100) return `${parseFloat((durationMs / 1000).toPrecision(3))}s`
  return ''
}

function getToolCommand(group) {
  if (!group.start) return ''
  const args = group.start.data?.arguments || {}
  const toolName = group.start.data?.toolName || group.tool || ''
  let command = ''
  if (toolName === 'bash' || toolName === 'exec') command = args.command || args.description || ''
  else if (toolName === 'ask_user') command = args.question || args.message || ''
  else if (toolName === 'read' || toolName === 'write' || toolName === 'edit') command = args.file_path || args.path || ''
  else if (toolName === 'view') command = args.path || args.file || ''
  else if (toolName === 'create') command = args.path || args.name || ''
  else if (toolName === 'report_intent') command = args.intent || args.message || ''
  else if (toolName === 'web_search') command = args.query || ''
  else if (toolName === 'web_fetch') command = args.url || ''
  else if (toolName === 'browser') {
    const action = args.action || ''
    const url = args.targetUrl || args.url || ''
    command = url ? `${action} ${url}` : action
  } else {
    command = args.description || args.command || args.message || args.path || args.file_path || args.query || ''
  }
  if (command && command.length > 200) command = command.substring(0, 200) + '...'
  return command
}

function formatToolTime(timestamp) {
  if (!timestamp) return ''
  const date = new Date(timestamp)
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  const seconds = String(date.getSeconds()).padStart(2, '0')
  const ms = String(date.getMilliseconds()).padStart(3, '0')
  return `${hours}:${minutes}:${seconds}.${ms}`
}
</script>

<template>
  <div class="tool-list">
    <div
      v-for="(group, idx) in toolGroups"
      :key="idx"
      class="tool-item"
    >
      <div
        class="tool-header-line"
        @click="emit('toggleTool', eventStableId + '-' + idx)"
      >
        <span class="tool-connector">{{ idx === toolGroups.length - 1 ? '└─' : '├─' }}</span>
        <span class="tool-expand-icon">{{ expandedTools[eventStableId + '-' + idx] ? '▼' : '▶' }}</span>
        <span class="tool-name">🔧&nbsp;{{ group.start?.data?.toolName || group.tool || 'Tool' }}</span>
        <span :class="getToolStatus(group).color" style="margin-left: 4px;">({{ getToolStatus(group).icon }}{{ getToolDuration(group) ? ' ' + getToolDuration(group) : '' }})</span>
        <span v-if="getToolCommand(group)" style="color: #7d8590; margin-left: 8px;">{{ getToolCommand(group) }}</span>
        <span v-if="getToolErrorMessage(group)" style="color: #ff7b72; margin-left: 8px;">{{ getToolErrorMessage(group).length > 80 ? getToolErrorMessage(group).substring(0, 80) + '...' : getToolErrorMessage(group) }}</span>
      </div>

      <div v-if="expandedTools[eventStableId + '-' + idx]" class="tool-detail">
        <div v-if="group.timing?.startTime || group.timing?.endTime || group.timing?.duration" class="tool-detail-section">
          <div class="tool-detail-content tool-timing-line">
            <span v-if="group.timing.startTime"><span class="tool-timing-label">Start</span> {{ formatToolTime(group.timing.startTime) }}</span>
            <span v-if="group.timing.endTime"><span class="tool-timing-label">Complete</span> {{ formatToolTime(group.timing.endTime) }}</span>
            <span v-if="group.timing.duration"><span class="tool-timing-label">Duration</span> {{ group.timing.duration }}</span>
          </div>
        </div>
        <div v-if="group.start?.data?.arguments" class="tool-detail-section">
          <div class="tool-detail-title">Arguments:</div>
          <div class="tool-detail-content">
            <pre>{{ JSON.stringify(group.start.data.arguments, null, 2) }}</pre>
          </div>
        </div>
        <div v-if="group.complete?.data?.result" class="tool-detail-section">
          <div class="tool-detail-title">Result:</div>
          <div class="tool-detail-content">
            <pre>{{ JSON.stringify(group.complete.data.result, null, 2) }}</pre>
          </div>
        </div>
        <div v-if="getToolErrorMessage(group)" class="tool-detail-section">
          <div class="tool-detail-title">Error:</div>
          <div class="tool-detail-content" style="color: #ff7b72;">
            {{ getToolErrorMessage(group) }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tool-list { margin-top: 6px; padding-left: 0; }
.tool-item { padding: 2px 0; }
.tool-header-line {
  color: #c9d1d9; font-size: 13px; font-family: 'SF Mono', 'Monaco', 'Consolas', monospace;
  cursor: pointer; user-select: none; line-height: 1.4;
  display: flex; align-items: baseline; gap: 0; padding: 2px 0; flex-wrap: wrap;
}
.tool-header-line:hover { color: #c9d1d9; }
.tool-connector { color: #6e7681; margin-right: 0; flex-shrink: 0; line-height: 1; }
.tool-expand-icon { color: #6e7681; margin: 0 4px; display: inline-flex; align-items: center; justify-content: center; width: 12px; height: 12px; flex-shrink: 0; line-height: 1; transform: translateY(-1px); }
.tool-name { color: #f0883e; flex-shrink: 0; margin-right: 4px; }
.tool-status-success { color: #238636; }
.tool-status-error { color: #da3633; }
.tool-status-running { color: #d29922; }
.tool-detail { margin-top: 4px; padding: 8px; background: rgba(110, 118, 129, 0.05); border-radius: 3px; border: 1px solid #30363d; font-size: 12px; }
.tool-detail-section { margin-bottom: 6px; }
.tool-detail-section:last-child { margin-bottom: 0; }
.tool-detail-title { color: #7d8590; margin-bottom: 2px; font-weight: 600; font-size: 12px; }
.tool-detail-content pre { margin: 0; padding: 4px 6px; background: #0d1117; border-radius: 3px; overflow-x: auto; max-height: 200px; font-size: 12px; line-height: 1.3; color: #e6edf3; }
.tool-timing-line { display: flex; flex-wrap: wrap; gap: 4px 16px; }
.tool-timing-label { color: #8b949e; font-weight: 500; margin-right: 3px; }

@media (max-width: 640px) {
  .tool-header-line { overflow-wrap: anywhere; word-break: break-all; }
}
</style>
