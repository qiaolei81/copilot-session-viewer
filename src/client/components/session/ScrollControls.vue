<script setup>
const emit = defineEmits(['scrollToTop', 'scrollToBottom'])
</script>

<template>
  <div class="scroll-float-btns">
    <button @click="emit('scrollToTop')" title="Scroll to top" class="scroll-edge-btn">▲</button>
    <button @click="emit('scrollToBottom')" title="Scroll to bottom" class="scroll-edge-btn">▼</button>
  </div>
</template>

<style scoped>
.scroll-float-btns {
  position: fixed;
  bottom: 24px;
  right: 24px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  z-index: 9999;
}
.scroll-edge-btn {
  background: #21262d;
  color: #c9d1d9;
  border: 1px solid #30363d;
  border-radius: 50%;
  width: 32px;
  height: 32px;
  font-size: 13px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 8px rgba(0,0,0,0.4);
  transition: background 0.15s, transform 0.1s, opacity 0.15s;
  padding: 0;
  opacity: 0.3;
}
.scroll-edge-btn:hover {
  background: #388bfd;
  border-color: #388bfd;
  color: #fff;
  transform: scale(1.1);
  opacity: 1;
}
@media (max-width: 640px) {
  .scroll-float-btns { bottom: 16px; right: 12px; }
  .scroll-edge-btn { width: 28px; height: 28px; font-size: 12px; }
}
</style>
