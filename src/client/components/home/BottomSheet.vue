<template>
  <Teleport to="body">
    <div
      class="fixed inset-0 bg-black/50 z-[1000] touch-none hidden"
      :class="{ '!block': isOpen }"
      @click.self="close"
    >
      <div
        class="fixed bottom-0 left-0 right-0 bg-[#161b22] border-t border-[#30363d] rounded-t-2xl px-4 pb-[max(env(safe-area-inset-bottom,0px),24px)] pt-0 max-h-[70vh] overflow-y-auto z-[1001] translate-y-full transition-transform duration-[280ms] ease-[cubic-bezier(0.32,0.72,0,1)]"
        :class="{ '!translate-y-0': sheetVisible }"
      >
        <div class="w-9 h-1 bg-[#444c56] rounded-full mx-auto mt-3 mb-4" />
        <div class="bottom-sheet-content text-sm leading-relaxed text-[#c9d1d9]" v-html="renderedHtml" />
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, computed, nextTick } from 'vue';

const isOpen = ref(false);
const sheetVisible = ref(false);
const text = ref('');

const renderedHtml = computed(() => {
  const md = text.value;
  if (typeof window !== 'undefined' && window.marked) {
    return window.marked.parse(md, { breaks: true });
  }
  return md.replace(/</g, '&lt;').replace(/\n/g, '<br>');
});

function open(md) {
  text.value = md;
  isOpen.value = true;
  nextTick(() => {
    requestAnimationFrame(() => { sheetVisible.value = true; });
  });
}

function close() {
  sheetVisible.value = false;
  setTimeout(() => { isOpen.value = false; }, 280);
}

defineExpose({ open, close });
</script>
