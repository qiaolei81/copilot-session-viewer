<template>
  <Teleport to="body">
    <div
      ref="tooltipEl"
      class="summary-tooltip hidden fixed z-modal bg-surface-alt border border-border rounded-lg px-4 py-3 max-w-[600px] w-max max-h-[400px] overflow-y-auto text-sm leading-relaxed text-text-secondary break-words shadow-[0_8px_24px_rgba(0,0,0,0.5)] pointer-events-none"
      :class="{ visible: isVisible }"
    >
      <div v-html="renderedHtml" />
    </div>
  </Teleport>
</template>

<script setup>
import { ref, computed } from 'vue';
import DOMPurify from 'dompurify';
import { marked } from 'marked';

const tooltipEl = ref(null);
const isVisible = ref(false);
const text = ref('');
let hideTimer = null;
let showTimer = null;
let pendingEvent = null;

const renderedHtml = computed(() => {
  const md = text.value;
  const html = marked.parse(md, { breaks: true });
  return DOMPurify.sanitize(html);
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
