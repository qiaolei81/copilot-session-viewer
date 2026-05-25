<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'

const props = defineProps({
  sessionId: { type: String, required: true },
  metadata: { type: Object, default: () => ({}) },
  exporting: { type: Boolean, default: false },
})

const emit = defineEmits(['export'])

const router = useRouter()

const isWip = computed(() => props.metadata.sessionStatus === 'wip')
const showExport = computed(() => {
  const src = props.metadata.source
  return !src || !['vscode', 'modernize'].includes(src)
})
</script>

<template>
  <div class="header">
    <router-link to="/" class="home-btn">← Back to Home</router-link>
    <h1 class="header-title">
      Session: {{ sessionId }}
      <span v-if="isWip" class="wip-badge">WIP</span>
    </h1>
    <div class="header-actions">
      <router-link
        :to="`/session/${sessionId}/time-analyze`"
        class="time-analyze-btn"
      >
        ⏱ Analysis
      </router-link>
      <button
        v-if="showExport"
        @click="emit('export')"
        class="export-btn"
        :disabled="exporting"
      >
        {{ exporting ? '⏳ Sharing...' : '📤 Share Session' }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.header {
  padding: 16px 20px;
  border-bottom: 1px solid #30363d;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 16px;
}
.home-btn {
  padding: 6px 12px;
  background: #21262d;
  border: 1px solid #30363d;
  border-radius: 6px;
  color: #c9d1d9;
  text-decoration: none;
  font-size: 14px;
  transition: all 0.2s;
}
.home-btn:hover {
  background: #30363d;
  border-color: #58a6ff;
}
.header-title {
  color: #58a6ff;
  font-size: 20px;
  margin: 0;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.wip-badge {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 3px;
  background: rgba(210, 153, 34, 0.2);
  color: #d29922;
  border: 1px solid rgba(210, 153, 34, 0.4);
  vertical-align: middle;
  margin-left: 8px;
}
.header-actions {
  display: flex;
  gap: 10px;
  flex-shrink: 0;
}
.time-analyze-btn {
  padding: 6px 12px;
  background: #1f6feb;
  border: 1px solid #388bfd;
  border-radius: 6px;
  color: #fff;
  text-decoration: none;
  font-size: 14px;
  font-weight: 500;
  transition: all 0.2s;
  white-space: nowrap;
}
.time-analyze-btn:hover {
  background: #388bfd;
  border-color: #58a6ff;
}
.export-btn {
  padding: 6px 12px;
  background: #238636;
  border: 1px solid #2ea043;
  border-radius: 6px;
  color: #fff;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}
.export-btn:hover:not(:disabled) {
  background: #2ea043;
  border-color: #3fb950;
}
.export-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

@media (max-width: 640px) {
  .header {
    padding: 8px 12px;
    flex-wrap: wrap;
    gap: 8px;
  }
  .header-title {
    font-size: 13px;
    max-width: calc(100vw - 80px);
  }
  .time-analyze-btn {
    padding: 5px 8px;
    font-size: 12px;
  }
}
</style>
