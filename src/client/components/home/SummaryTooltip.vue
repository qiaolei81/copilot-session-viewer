<template>
  <Teleport to="body">
    <div ref="tooltipEl" class="summary-tooltip" :class="{ visible: isVisible }">
      <div v-html="renderedHtml"></div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, computed } from 'vue';

const tooltipEl = ref(null);
const isVisible = ref(false);
const text = ref('');
let hideTimer = null;
let showTimer = null;
let pendingEvent = null;

const renderedHtml = computed(() => {
  const md = text.value;
  if (typeof window !== 'undefined' && window.marked) {
    return window.marked.parse(md, { breaks: true });
  }
  return md.replace(/</g, '&lt;').replace(/\n/g, '<br>');
});

function scheduleShow(el, e) {
  clearTimeout(showTimer);
  clearTimeout(hideTimer);
  pendingEvent = e;
  const md = el.dataset.tooltipText || el.getAttribute('title') || '';
  if (!md) return;
  // Move title to dataset to prevent native tooltip
  if (el.getAttribute('title')) {
    el.dataset.tooltipText = el.getAttribute('title');
    el.removeAttribute('title');
  }
  showTimer = setTimeout(() => {
    text.value = el.dataset.tooltipText || '';
    isVisible.value = true;
    if (pendingEvent) positionTooltip(pendingEvent);
  }, 500);
}

function scheduleHide() {
  clearTimeout(showTimer);
  hideTimer = setTimeout(() => {
    isVisible.value = false;
  }, 120);
}

function cancelHide() {
  clearTimeout(hideTimer);
}

function onMove(e) {
  pendingEvent = e;
  if (isVisible.value) positionTooltip(e);
}

function positionTooltip(e) {
  const el = tooltipEl.value;
  if (!el) return;
  const pad = 14;
  const tw = el.offsetWidth;
  const th = el.offsetHeight;
  let x = e.clientX + pad;
  let y = e.clientY + pad;
  if (x + tw > window.innerWidth - 8) x = e.clientX - tw - pad;
  if (y + th > window.innerHeight - 8) y = e.clientY - th - pad;
  el.style.left = x + 'px';
  el.style.top = y + 'px';
}

defineExpose({ scheduleShow, scheduleHide, cancelHide, onMove });
</script>

<style>
.summary-tooltip {
  display: none;
  position: fixed;
  z-index: 9999;
  background: #1c2128;
  border: 1px solid #30363d;
  border-radius: 8px;
  padding: 12px 16px;
  max-width: 600px;
  width: max-content;
  max-height: 400px;
  overflow-y: auto;
  font-size: 13px;
  line-height: 1.6;
  color: #c9d1d9;
  white-space: normal;
  word-break: break-word;
  box-shadow: 0 8px 24px rgba(0,0,0,0.5);
  pointer-events: none;
}
.summary-tooltip.visible {
  display: block;
  pointer-events: auto;
}
.summary-tooltip h1, .summary-tooltip h2, .summary-tooltip h3,
.summary-tooltip h4, .summary-tooltip h5, .summary-tooltip h6 {
  color: #e6edf3; margin: 8px 0 4px; font-weight: 600;
}
.summary-tooltip h1 { font-size: 15px; }
.summary-tooltip h2 { font-size: 14px; }
.summary-tooltip h3, .summary-tooltip h4 { font-size: 13px; }
.summary-tooltip p { margin: 4px 0; }
.summary-tooltip ul, .summary-tooltip ol { margin: 4px 0; padding-left: 18px; }
.summary-tooltip li { margin: 2px 0; }
.summary-tooltip code {
  background: #2d333b; border-radius: 3px;
  padding: 1px 4px; font-size: 12px; font-family: monospace;
}
.summary-tooltip pre {
  background: #2d333b; border-radius: 6px;
  padding: 8px 10px; overflow-x: auto; margin: 6px 0;
}
.summary-tooltip pre code { background: none; padding: 0; }
.summary-tooltip strong { color: #e6edf3; }
.summary-tooltip hr { border-color: #30363d; margin: 8px 0; }
@media (hover: none) {
  .summary-tooltip { display: none !important; }
}
</style>
