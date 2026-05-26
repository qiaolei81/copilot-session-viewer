<template>
  <Teleport to="body">
    <div
      class="fixed inset-0 bg-black/50 z-[1000] touch-none hidden"
      :class="{ '!block': isOpen }"
      @click.self="close"
    >
      <div
        class="fixed bottom-0 left-0 right-0 bg-surface border-t border-border rounded-t-2xl px-4 pb-[max(env(safe-area-inset-bottom,0px),24px)] pt-0 max-h-[70vh] overflow-y-auto z-[1001] translate-y-full transition-transform duration-[280ms] ease-[cubic-bezier(0.32,0.72,0,1)]"
        :class="{ '!translate-y-0': sheetVisible }"
      >
        <div class="w-9 h-1 bg-surface-overlay rounded-full mx-auto mt-3 mb-4" />
        <div class="bottom-sheet-content text-sm leading-relaxed text-text-secondary" v-html="renderedHtml" />
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, computed, nextTick, onBeforeUnmount } from 'vue';
import DOMPurify from 'dompurify';
import { marked } from 'marked';

const isOpen = ref(false);
const sheetVisible = ref(false);
const text = ref('');
let closeTimer = null;

const renderedHtml = computed(() => {
  const md = text.value;
  const html = marked.parse(md, { breaks: true });
  return DOMPurify.sanitize(html);
});

function open(md) {
  text.value = md;
  isOpen.value = true;
  nextTick(() => {
    requestAnimationFrame(() => { sheetVisible.value = true; });
  });
}

function close() {
  if (closeTimer) clearTimeout(closeTimer);
  sheetVisible.value = false;
  closeTimer = setTimeout(() => { isOpen.value = false; closeTimer = null; }, 280);
}

onBeforeUnmount(() => { if (closeTimer) clearTimeout(closeTimer); });

defineExpose({ open, close });
</script>
