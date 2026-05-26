<template>
  <span
    class="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 z-[2] cursor-pointer transition-transform duration-150 hover:scale-[1.8] hover:z-10 group"
    :style="{ left: marker.position + '%' }"
  >
    <template v-if="marker.shape === 'cluster'">
      <span class="w-3.5 h-3.5 rounded-full flex items-center justify-center text-[8px] font-bold text-white border border-white/30" :style="{ background: marker.color }">{{ marker.count }}</span>
    </template>
    <template v-else-if="marker.shape === 'circle'">
      <span class="w-1.5 h-1.5 rounded-full block" :style="{ background: marker.color }" />
    </template>
    <template v-else-if="marker.shape === 'diamond'">
      <span class="w-1.5 h-1.5 rotate-45 block" :style="{ background: marker.color }" />
    </template>
    <template v-else-if="marker.shape === 'square'">
      <span class="w-[5px] h-[5px] rounded-[1px] block" :style="{ background: marker.color }" />
    </template>
    <template v-else-if="marker.shape === 'triangle'">
      <span class="w-0 h-0 border-l-[4px] border-r-[4px] border-b-[7px] border-l-transparent border-r-transparent border-b-current block" :style="{ color: marker.color }" />
    </template>
    <span class="marker-tooltip">
      <template v-if="marker.shape === 'cluster'">{{ marker.count }} events: {{ marker.label }}</template>
      <template v-else>{{ marker.label }}<span v-if="marker.toolName"> ({{ marker.toolName }})</span></template>
    </span>
  </span>
</template>

<script setup>
defineProps({
  marker: { type: Object, required: true },
});
</script>
