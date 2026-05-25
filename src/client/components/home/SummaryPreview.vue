<script setup>
import { ref, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import MarkdownRenderer from '../common/MarkdownRenderer.vue'

const props = defineProps({
  summary: { type: String, default: '' },
  visible: { type: Boolean, default: false },
  position: { type: Object, default: () => ({ x: 0, y: 0 }) },
})

const emit = defineEmits(['close'])

// Desktop tooltip
const tooltipStyle = ref({})
const tooltipEl = ref(null)

watch(() => [props.visible, props.position], () => {
  if (!props.visible) return
  nextTick(() => {
    const pad = 14
    const el = tooltipEl.value
    if (!el) return
    const tw = el.offsetWidth
    const th = el.offsetHeight
    let x = props.position.x + pad
    let y = props.position.y + pad
    if (x + tw > window.innerWidth - 8) x = props.position.x - tw - pad
    if (y + th > window.innerHeight - 8) y = props.position.y - th - pad
    tooltipStyle.value = { left: x + 'px', top: y + 'px' }
  })
}, { deep: true })

// Mobile bottom sheet
const sheetVisible = ref(false)

function openSheet() {
  sheetVisible.value = true
}

function closeSheet() {
  sheetVisible.value = false
  emit('close')
}

// Long-press detection for mobile
let lpTimer = null
let lpMoved = false

function onTouchStart(e) {
  const el = e.target.closest('.session-summary')
  if (!el) return
  lpMoved = false
  const md = el.dataset.tooltipText || el.getAttribute('title') || ''
  if (!md) return
  lpTimer = setTimeout(() => {
    if (!lpMoved) {
      e.preventDefault()
      openSheet()
    }
  }, 500)
}

function onTouchMove() {
  lpMoved = true
  clearTimeout(lpTimer)
}

function onTouchEnd() {
  clearTimeout(lpTimer)
}

onMounted(() => {
  document.addEventListener('touchstart', onTouchStart, { passive: false })
  document.addEventListener('touchmove', onTouchMove, { passive: true })
  document.addEventListener('touchend', onTouchEnd, { passive: true })
  document.addEventListener('touchcancel', onTouchEnd, { passive: true })
})

onBeforeUnmount(() => {
  document.removeEventListener('touchstart', onTouchStart)
  document.removeEventListener('touchmove', onTouchMove)
  document.removeEventListener('touchend', onTouchEnd)
  document.removeEventListener('touchcancel', onTouchEnd)
  clearTimeout(lpTimer)
})
</script>

<template>
  <!-- Desktop tooltip -->
  <Teleport to="body">
    <div
      v-show="visible && summary"
      ref="tooltipEl"
      class="summary-tooltip pointer-events-none fixed z-[9999] max-h-[400px] max-w-[600px] w-max overflow-y-auto rounded-lg border border-[#30363d] bg-[#1c2128] px-4 py-3 text-[13px] leading-relaxed text-[#c9d1d9] shadow-[0_8px_24px_rgba(0,0,0,0.5)]"
      :class="{ 'pointer-events-auto': visible }"
      :style="tooltipStyle"
    >
      <MarkdownRenderer :content="summary" />
    </div>

    <!-- Mobile bottom sheet overlay -->
    <div
      v-if="sheetVisible"
      class="fixed inset-0 z-[1000] bg-black/50 touch-none"
      @click.self="closeSheet"
    >
      <div
        class="fixed inset-x-0 bottom-0 z-[1001] max-h-[70vh] overflow-y-auto rounded-t-2xl border-t border-[#30363d] bg-[#161b22] px-4 pb-[max(env(safe-area-inset-bottom),24px)] transition-transform duration-300"
        :class="sheetVisible ? 'translate-y-0' : 'translate-y-full'"
      >
        <div class="mx-auto my-3 mb-4 h-1 w-9 rounded-full bg-[#444c56]" />
        <div class="text-sm leading-relaxed text-[#c9d1d9]">
          <MarkdownRenderer :content="summary" />
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
@media (hover: none) {
  .summary-tooltip {
    display: none !important;
  }
}
</style>
