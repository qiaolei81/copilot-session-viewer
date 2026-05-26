<template>
  <span
    class="event-marker"
    :style="{ left: marker.position + '%' }"
  >
    <template v-if="marker.shape === 'cluster'">
      <span class="event-marker--cluster" :style="{ background: marker.color }">{{ marker.count }}</span>
    </template>
    <template v-else-if="marker.shape === 'circle'">
      <span class="event-marker--circle" :style="{ background: marker.color }" />
    </template>
    <template v-else-if="marker.shape === 'diamond'">
      <span class="event-marker--diamond" :style="{ background: marker.color }" />
    </template>
    <template v-else-if="marker.shape === 'square'">
      <span class="event-marker--square" :style="{ background: marker.color }" />
    </template>
    <template v-else-if="marker.shape === 'triangle'">
      <span class="event-marker--triangle" :style="{ color: marker.color }" />
    </template>
    <span class="event-marker-tooltip">
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
