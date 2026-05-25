<script setup>
defineProps({
  title: { type: String, required: true },
  backLink: { type: String, default: '' },
  showWipBadge: { type: Boolean, default: false },
})
</script>

<template>
  <div class="sticky top-0 z-50 bg-[#0d1117] border-b border-[#30363d] px-4 py-3 flex items-center gap-3">
    <router-link
      v-if="backLink"
      :to="backLink"
      class="text-[#58a6ff] hover:text-[#79c0ff] text-sm no-underline"
    >
      &larr; Back
    </router-link>
    <h1 class="text-lg font-semibold text-[#e6edf3] m-0 flex items-center gap-2">
      {{ title }}
      <span
        v-if="showWipBadge"
        class="text-xs px-2 py-0.5 rounded bg-[rgba(210,153,34,0.2)] text-[#d29922] border border-[rgba(210,153,34,0.4)]"
      >
        &#x1f504; WIP
      </span>
    </h1>
  </div>
</template>
