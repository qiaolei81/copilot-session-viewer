<script setup>
defineProps({
  text: { type: String, default: 'Loading...' },
})
</script>

<template>
  <div class="flex flex-col items-center justify-center py-16 text-[#8b949e]">
    <div class="w-8 h-8 border-2 border-[#30363d] border-t-[#58a6ff] rounded-full animate-spin mb-3" />
    <span class="text-sm">{{ text }}</span>
  </div>
</template>
