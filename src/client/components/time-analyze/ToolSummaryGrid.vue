<script setup>
import { useFormatters } from '../../composables/useFormatters.js'

const { formatDuration } = useFormatters()

defineProps({
  toolTimeByCategory: { type: Array, default: () => [] },
  maxCategoryTime: { type: Number, default: 1 },
})
</script>

<template>
  <div v-if="toolTimeByCategory.length" class="tool-summary">
    <h3 class="tool-summary-title">&#128295; Tool Summary</h3>
    <div class="tool-grid">
      <div
        v-for="cat in toolTimeByCategory"
        :key="cat.category"
        class="tool-card"
      >
        <div class="tool-card-inner">
          <div class="tool-card-header">
            <span class="tool-cat-name">{{ cat.category }}</span>
            <span class="tool-cat-meta">
              {{ cat.count }} call{{ cat.count !== 1 ? 's' : '' }}
              <span v-if="cat.errors" style="color: #f85149;"> &middot; {{ cat.errors }} err</span>
            </span>
          </div>
          <div class="tool-bar-bg">
            <div class="tool-bar-fill" :style="{ width: (cat.totalTime / maxCategoryTime * 100) + '%' }"></div>
          </div>
          <div class="tool-cat-time">{{ formatDuration(cat.totalTime) }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tool-summary { margin-top: 24px; }
.tool-summary-title { color: #e6edf3; font-size: 14px; margin-bottom: 12px; }
.tool-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 8px;
}
.tool-card {
  background: #161b22;
  border: 1px solid #30363d;
  border-radius: 6px;
  padding: 10px 12px;
}
.tool-card-inner { min-width: 0; }
.tool-card-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 4px;
}
.tool-cat-name { color: #d29922; font-weight: 500; font-size: 13px; }
.tool-cat-meta { color: #7d8590; font-size: 11px; }
.tool-bar-bg { background: #21262d; border-radius: 3px; height: 6px; overflow: hidden; }
.tool-bar-fill { height: 100%; background: rgba(158, 106, 3, 0.7); border-radius: 3px; }
.tool-cat-time { color: #7d8590; font-size: 11px; margin-top: 3px; }
</style>
