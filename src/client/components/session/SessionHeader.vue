<template>
  <div class="py-4 px-5 border-b border-border shrink-0 flex items-center gap-4 max-sm:py-2 max-sm:px-3 max-sm:flex-wrap max-sm:gap-2">
    <router-link to="/" class="py-1.5 px-3 bg-surface-hover border border-border rounded-md text-text-secondary no-underline text-sm transition-all hover:bg-border hover:border-accent">
← Back to Home
</router-link>
    <h1 class="text-accent text-xl m-0 flex-1">
📋 Session: {{ sessionId }}
      <span v-if="metadata.sessionStatus === 'wip'" style="font-size: 12px; padding: 2px 8px; border-radius: 3px; background: rgba(210, 153, 34, 0.2); color: #d29922; border: 1px solid rgba(210, 153, 34, 0.4); vertical-align: middle; margin-left: 8px;">🔄 WIP</span>
    </h1>
    <div style="display: flex; gap: 10px;">
      <router-link :to="'/' + source + '/session/' + sessionId + '/time-analyze'" class="header-action-btn bg-accent-emphasis border-accent-emphasis no-underline hover:bg-accent-emphasis hover:border-accent">
⏱ Analysis
</router-link>
      <button v-if="!metadata.source || !['vscode', 'modernize'].includes(metadata.source)" data-testid="export-btn" class="header-action-btn bg-success-emphasis border-success-emphasis cursor-pointer hover:bg-success-emphasis hover:border-success disabled:opacity-60 disabled:cursor-not-allowed" :disabled="exporting" @click="$emit('export')">
        {{ exporting ? '⏳ Sharing...' : '📤 Share Session' }}
      </button>
    </div>
  </div>
</template>

<script setup>
defineProps({
  sessionId: String,
  source: String,
  metadata: Object,
  exporting: Boolean,
});

defineEmits(['export']);
</script>
