<script setup>
defineProps({
  activeTab: { type: String, required: true },
})
const emit = defineEmits(['update:activeTab'])
const tabs = [
  { key: 'timeline', label: '📊 Timeline' },
  { key: 'insight', label: '💡 Agent Review' },
]
</script>

<template>
  <div class="tabs">
    <button
      v-for="tab in tabs"
      :key="tab.key"
      :class="['tab', { active: activeTab === tab.key }]"
      @click="emit('update:activeTab', tab.key)"
    >
      {{ tab.label }}
    </button>
  </div>
</template>

<style scoped>
.tabs {
  display: flex;
  gap: 4px;
  margin-bottom: 16px;
  border-bottom: 1px solid #30363d;
}
.tab {
  padding: 8px 16px;
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  color: #7d8590;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
  font-family: inherit;
}
.tab:hover { color: #c9d1d9; }
.tab.active {
  color: #58a6ff;
  border-bottom-color: #58a6ff;
}
</style>
