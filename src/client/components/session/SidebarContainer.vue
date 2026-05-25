<script setup>
import { ref, watch } from 'vue'

const props = defineProps({
  collapsed: { type: Boolean, default: false },
})

const emit = defineEmits(['update:collapsed'])

const isMobile = () => window.innerWidth <= 640

const toggle = () => {
  emit('update:collapsed', !props.collapsed)
}

defineExpose({ toggle })
</script>

<template>
  <!-- Mobile overlay backdrop -->
  <div
    v-if="!collapsed"
    @click="toggle"
    class="sidebar-backdrop"
  />
  <div :class="['sidebar', { collapsed }]">
    <slot />
  </div>
</template>

<style scoped>
.sidebar {
  width: 320px;
  flex-shrink: 0;
  background: #161b22;
  border-right: 1px solid #30363d;
  overflow-y: auto;
  padding: 16px;
  transition: all 0.3s ease;
}
.sidebar.collapsed {
  width: 0;
  padding: 0;
  border-right: none;
  overflow: hidden;
}
.sidebar-backdrop {
  display: none;
}

@media (max-width: 640px) {
  .sidebar-backdrop {
    display: block;
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    z-index: 999;
  }
  .sidebar {
    position: fixed;
    top: 0;
    left: 0;
    height: 100%;
    width: 280px !important;
    z-index: 1000;
    box-shadow: 4px 0 16px rgba(0, 0, 0, 0.6);
    transform: translateX(-100%);
    transition: transform 0.3s ease;
  }
  .sidebar:not(.collapsed) {
    transform: translateX(0);
  }
  .sidebar.collapsed {
    transform: translateX(-100%);
    width: 280px !important;
    padding: 16px !important;
    border-right: 1px solid #30363d !important;
    overflow-y: auto !important;
  }
}
</style>
