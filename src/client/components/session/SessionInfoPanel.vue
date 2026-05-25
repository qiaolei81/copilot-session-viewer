<script setup>
const props = defineProps({
  metadata: { type: Object, required: true },
  eventCount: { type: Number, default: 0 },
  duration: { type: String, default: '—' },
})

function formatDateTime(ts) {
  if (!ts) return 'N/A'
  return new Date(ts).toLocaleString()
}
</script>

<template>
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
          <tr>
            <td>Events</td>
            <td>{{ eventCount }}</td>
          </tr>
          <tr>
            <td>Duration</td>
            <td>{{ duration }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.sidebar-section { margin-bottom: 20px; }
.sidebar-section-title {
  font-size: 12px;
  font-weight: 600;
  color: #c9d1d9;
  margin-bottom: 12px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.session-info { font-size: 13px; }
.session-info-table { width: 100%; font-size: 12px; }
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
.session-info-table tr:last-child td { border-bottom: none; }

.source-badge {
  display: inline-block;
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 3px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.source-cli { background: rgba(35, 134, 54, 0.2); color: #3fb950; border: 1px solid rgba(35, 134, 54, 0.4); }
.source-vscode { background: rgba(0, 122, 204, 0.2); color: #4fc3f7; border: 1px solid rgba(0, 122, 204, 0.4); }
.source-copilot { background: rgba(88, 166, 255, 0.2); color: #58a6ff; border: 1px solid rgba(88, 166, 255, 0.4); }
.source-claude { background: rgba(210, 153, 34, 0.2); color: #d29922; border: 1px solid rgba(210, 153, 34, 0.4); }
.source-pi-mono { background: rgba(138, 102, 204, 0.2); color: #a78bdb; border: 1px solid rgba(138, 102, 204, 0.4); }
.source-modernize { background: rgba(76, 175, 80, 0.2); color: #66bb6a; border: 1px solid rgba(76, 175, 80, 0.4); }
</style>
