<template>
  <Teleport to="body">
    <div class="bottom-sheet-overlay" :class="{ visible: isOpen }" @click.self="close">
      <div class="bottom-sheet" :class="{ visible: sheetVisible }">
        <div class="bottom-sheet-handle"></div>
        <div class="bottom-sheet-content" v-html="renderedHtml"></div>
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

<style>
.bottom-sheet-overlay {
  display: none;
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.5);
  z-index: 1000;
  touch-action: none;
}
.bottom-sheet-overlay.visible { display: block; }
.bottom-sheet {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background: #161b22;
  border-top: 1px solid #30363d;
  border-radius: 16px 16px 0 0;
  padding: 0 16px max(env(safe-area-inset-bottom, 0px), 24px);
  max-height: 70vh;
  overflow-y: auto;
  z-index: 1001;
  transform: translateY(100%);
  transition: transform 0.28s cubic-bezier(0.32, 0.72, 0, 1);
}
.bottom-sheet.visible { transform: translateY(0); }
.bottom-sheet-handle {
  width: 36px;
  height: 4px;
  background: #444c56;
  border-radius: 2px;
  margin: 12px auto 16px;
}
.bottom-sheet-content {
  font-size: 14px;
  line-height: 1.6;
  color: #c9d1d9;
}
.bottom-sheet-content h1, .bottom-sheet-content h2, .bottom-sheet-content h3 { color: #e6edf3; margin: 12px 0 6px; }
.bottom-sheet-content h1 { font-size: 16px; }
.bottom-sheet-content h2 { font-size: 15px; }
.bottom-sheet-content h3 { font-size: 14px; }
.bottom-sheet-content p { margin: 6px 0; }
.bottom-sheet-content ul, .bottom-sheet-content ol { margin: 6px 0; padding-left: 20px; }
.bottom-sheet-content li { margin: 3px 0; }
.bottom-sheet-content code { background: #0d1117; padding: 1px 5px; border-radius: 4px; font-size: 13px; }
.bottom-sheet-content pre { background: #0d1117; padding: 10px; border-radius: 6px; overflow-x: auto; }
.bottom-sheet-content pre code { background: none; padding: 0; }
.bottom-sheet-content strong { color: #e6edf3; }
.bottom-sheet-content hr { border-color: #30363d; margin: 10px 0; }
</style>
