<script setup>
import { ref, onMounted } from 'vue'

const emit = defineEmits(['filter-change'])

const FILTER_STORAGE_KEY = 'sessionViewer.sourceFilter'

const sources = [
  { key: 'copilot', label: 'Copilot CLI' },
  { key: 'vscode', label: 'Copilot Chat' },
  { key: 'claude', label: 'Claude' },
  { key: 'modernize', label: 'Modernize CLI' },
  { key: 'pi-mono', label: 'Pi' },
]

const activeSource = ref('copilot')

onMounted(() => {
  try {
    const saved = localStorage.getItem(FILTER_STORAGE_KEY)
    if (saved && sources.some(s => s.key === saved)) {
      activeSource.value = saved
    }
  } catch (_) { /* ignore */ }
  emit('filter-change', activeSource.value)
})

function selectSource(key) {
  activeSource.value = key
  try { localStorage.setItem(FILTER_STORAGE_KEY, key) } catch (_) { /* ignore */ }
  emit('filter-change', key)
}
</script>

<template>
  <div class="flex flex-wrap gap-2 mb-4">
    <button
      v-for="source in sources"
      :key="source.key"
      class="min-h-[32px] cursor-pointer rounded-full border px-4 py-1.5 text-[13px] font-medium transition-all"
      :class="activeSource === source.key
        ? 'bg-[#58a6ff] border-[#58a6ff] text-white'
        : 'bg-[#21262d] border-[#30363d] text-[#8b949e] hover:bg-[#30363d] hover:border-[#58a6ff] hover:text-[#c9d1d9]'"
      @click="selectSource(source.key)"
    >
      {{ source.label }}
    </button>
  </div>
</template>
