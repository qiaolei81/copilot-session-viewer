<template>
  <div class="header">
    <router-link to="/" class="home-btn">← Back to Home</router-link>
    <h1>📋 Session: {{ sessionId }}
      <span v-if="metadata.sessionStatus === 'wip'" style="font-size: 12px; padding: 2px 8px; border-radius: 3px; background: rgba(210, 153, 34, 0.2); color: #d29922; border: 1px solid rgba(210, 153, 34, 0.4); vertical-align: middle; margin-left: 8px;">🔄 WIP</span>
    </h1>
    <div style="display: flex; gap: 10px;">
      <router-link :to="'/session/' + sessionId + '/time-analyze'" class="time-analyze-btn">⏱ Analysis</router-link>
      <button @click="$emit('export')" class="export-btn" :disabled="exporting" v-if="!metadata.source || !['vscode', 'modernize'].includes(metadata.source)">
        {{ exporting ? '⏳ Sharing...' : '📤 Share Session' }}
      </button>
    </div>
  </div>
</template>

<script setup>
defineProps({
  sessionId: String,
  metadata: Object,
  exporting: Boolean,
});

defineEmits(['export']);
</script>

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
h1 {
  color: #58a6ff;
  font-size: 20px;
  margin: 0;
  flex: 1;
}
@media (max-width: 640px) {
  .header {
    padding: 8px 12px;
    flex-wrap: wrap;
    gap: 8px;
  }
}
</style>
