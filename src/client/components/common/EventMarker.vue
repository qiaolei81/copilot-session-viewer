<script setup>
defineProps({
  type: { type: String, default: 'circle', validator: (v) => ['circle', 'diamond', 'square', 'triangle', 'cluster'].includes(v) },
  color: { type: String, default: '#58a6ff' },
  tooltip: { type: String, default: '' },
  count: { type: Number, default: 0 },
})
</script>

<template>
  <span class="relative inline-flex items-center group" :title="tooltip">
    <!-- Cluster -->
    <span
      v-if="type === 'cluster'"
      class="inline-flex items-center justify-center text-[9px] font-bold rounded-full min-w-[16px] h-4 px-1 text-white"
      :style="{ background: color }"
    >
      {{ count }}
    </span>

    <!-- Circle -->
    <span
      v-else-if="type === 'circle'"
      class="inline-block w-2 h-2 rounded-full"
      :style="{ background: color }"
    />

    <!-- Diamond -->
    <span
      v-else-if="type === 'diamond'"
      class="inline-block w-2 h-2 rotate-45"
      :style="{ background: color }"
    />

    <!-- Square -->
    <span
      v-else-if="type === 'square'"
      class="inline-block w-2 h-2"
      :style="{ background: color }"
    />

    <!-- Triangle -->
    <svg v-else-if="type === 'triangle'" width="10" height="10" viewBox="0 0 10 10">
      <polygon points="5,1 9,9 1,9" :fill="color" />
    </svg>

    <!-- Tooltip -->
    <span
      v-if="tooltip"
      class="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 text-[10px] text-white bg-[#1c2128] border border-[#30363d] rounded whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-10"
    >
      {{ tooltip }}
    </span>
  </span>
</template>
