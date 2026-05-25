<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()

const props = defineProps({
  session: { type: Object, required: true },
})

const tagColors = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444',
  '#8b5cf6', '#ec4899', '#06b6d4', '#f97316',
]

function getTagColor(tag) {
  let hash = 0
  for (let i = 0; i < tag.length; i++) {
    hash = tag.charCodeAt(i) + ((hash << 5) - hash)
  }
  return tagColors[Math.abs(hash) % tagColors.length]
}

const sourceConfig = {
  copilot: { label: 'Copilot', cls: 'bg-[rgba(88,166,255,0.15)] text-[#58a6ff]' },
  vscode: { label: 'Copilot Chat', cls: 'bg-[rgba(0,122,204,0.15)] text-[#4fc3f7]' },
  claude: { label: 'Claude', cls: 'bg-[rgba(204,120,92,0.15)] text-[#e8956f]' },
  modernize: { label: 'Modernize', cls: 'bg-[rgba(76,175,80,0.15)] text-[#66bb6a]' },
  'pi-mono': { label: 'Pi', cls: 'bg-[rgba(138,102,204,0.15)] text-[#a78bdb]' },
}

const sourceBadge = computed(() => {
  const s = props.session
  const key = s.source || 'copilot'
  return sourceConfig[key] || { label: s.sourceName || 'Copilot', cls: sourceConfig.copilot.cls }
})

const modelBadge = computed(() => {
  const m = props.session.selectedModel
  if (!m) return null
  const short = m.replace('claude-', '').replace('gpt-', '').replace('gemini-', '')
  let cls = 'bg-[rgba(139,92,246,0.15)] text-[#a78bfa]'
  if (m.includes('claude')) cls = 'bg-[rgba(204,120,92,0.15)] text-[#e8956f]'
  else if (m.includes('gpt')) cls = 'bg-[rgba(16,163,127,0.15)] text-[#1ec99d]'
  else if (m.includes('gemini')) cls = 'bg-[rgba(66,133,244,0.15)] text-[#5e9aff]'
  return { label: short, cls, full: m }
})

const versionLabel = computed(() => {
  const s = props.session
  if (s.source === 'modernize' && s.modernizeVersion) return s.modernizeVersion
  return s.copilotVersion || null
})

const summaryText = computed(() => {
  const s = props.session.summary
  if (!s || s === 'No summary' || s === 'Legacy session') return null
  return s.replace(/\n+/g, ' ')
})

const createdAtStr = computed(() => {
  if (!props.session.createdAt) return 'unknown'
  return new Date(props.session.createdAt).toLocaleString('en-US', {
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  })
})

function formatDuration(ms) {
  if (!ms || ms < 0) return null
  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  if (hours > 0) return `${hours}h ${minutes % 60}m`
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`
  return `${seconds}s`
}

function navigateToSession() {
  router.push(`/session/${props.session.id}`)
}
</script>

<template>
  <a
    class="block cursor-pointer rounded-lg border bg-[#161b22] p-3 px-4 text-[#c9d1d9] no-underline transition-all hover:-translate-y-0.5 hover:border-[#58a6ff] hover:bg-[#1c2128] hover:shadow-[0_4px_12px_rgba(88,166,255,0.2)]"
    :class="session.sessionStatus === 'wip' ? 'border-[#d29922] border-l-[3px] hover:border-[#e8b634]' : 'border-[#30363d]'"
    @click.prevent="navigateToSession"
  >
    <!-- Session ID -->
    <div class="mb-3 truncate font-mono text-[11px] tracking-tight text-[#6e7681] opacity-70" :title="session.id">
      {{ session.id }}
    </div>

    <!-- Badges + Tags -->
    <div class="flex flex-wrap items-center gap-1 mt-1">
      <!-- Source badge -->
      <span class="inline-block rounded-xl px-2 py-0.5 font-mono text-[11px] font-semibold opacity-80" :class="sourceBadge.cls">
        {{ sourceBadge.label }}
      </span>
      <!-- WIP -->
      <span v-if="session.sessionStatus === 'wip'" class="inline-block rounded-xl border border-[rgba(210,153,34,0.4)] bg-[rgba(210,153,34,0.2)] px-2 py-0.5 text-[11px] font-semibold text-[#d29922]">
        🔄 WIP
      </span>
      <!-- Imported -->
      <span v-if="session.isImported" class="inline-block text-sm opacity-80" title="Imported session">📥</span>
      <!-- Insight -->
      <span v-if="session.hasInsight" class="inline-block text-sm opacity-80" title="Has Agent Review">💡</span>
      <!-- Model -->
      <span v-if="modelBadge" class="inline-block rounded-xl px-2 py-0.5 font-mono text-[11px] font-semibold" :class="modelBadge.cls" :title="`Model: ${modelBadge.full}`">
        {{ modelBadge.label }}
      </span>
      <!-- Version -->
      <span v-if="versionLabel" class="inline-block rounded-xl bg-[rgba(234,179,8,0.15)] px-2 py-0.5 font-mono text-[11px] font-semibold text-[#fbbf24]">
        {{ versionLabel }}
      </span>
      <!-- Agent -->
      <span v-if="session.agentName" class="inline-block text-sm opacity-80" :title="`Agent: ${session.agentName}`">
        🤖 {{ session.agentName }}
      </span>
      <!-- Tags -->
      <span
        v-for="tag in (session.tags || [])"
        :key="tag"
        class="inline-block rounded-[10px] px-2 py-0.5 text-[11px] font-medium text-white"
        :style="{ backgroundColor: getTagColor(tag) }"
        :title="tag"
      >
        {{ tag }}
      </span>
    </div>

    <!-- Summary -->
    <div
      v-if="summaryText"
      class="mt-3 mb-3 line-clamp-3 break-words text-[15px] font-medium leading-relaxed text-[#e6edf3] cursor-help [overflow-wrap:anywhere]"
      :title="session.summary"
      :data-tooltip-text="session.summary"
    >
      {{ summaryText }}
    </div>
    <div v-else class="mt-3 mb-3 text-[15px] italic text-[#6e7681]">
      No summary available
    </div>

    <!-- Divider -->
    <div class="my-2.5 h-px bg-[#21262d]" />

    <!-- Info row -->
    <div class="flex flex-wrap items-center gap-4 font-mono text-xs text-[#6e7681]">
      <!-- Workspace -->
      <div v-if="session.workspace?.cwd" class="flex w-full min-w-0 items-center gap-1.5" :title="session.workspace.cwd">
        <svg class="h-3.5 w-3.5 flex-shrink-0 opacity-60" viewBox="0 0 16 16" fill="currentColor"><path d="M1.75 1A1.75 1.75 0 000 2.75v10.5C0 14.216.784 15 1.75 15h12.5A1.75 1.75 0 0016 13.25v-8.5A1.75 1.75 0 0014.25 3H7.5a.25.25 0 01-.2-.1l-.9-1.2C6.07 1.26 5.55 1 5 1H1.75z" /></svg>
        <span class="break-all text-[#8b949e] font-medium">{{ session.workspace.cwd }}</span>
      </div>
      <!-- Timestamp -->
      <div class="flex items-center gap-1.5">
        <svg class="h-3.5 w-3.5 flex-shrink-0 opacity-60" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Zm7-3.25v2.992l2.028.812a.75.75 0 0 1-.557 1.392l-2.5-1A.751.751 0 0 1 7 8.25v-3.5a.75.75 0 0 1 1.5 0Z" /></svg>
        <span class="text-[#8b949e]">{{ createdAtStr }}</span>
      </div>
      <!-- Duration -->
      <div v-if="formatDuration(session.duration)" class="flex items-center gap-1.5">
        <svg class="h-3.5 w-3.5 flex-shrink-0 opacity-60" viewBox="0 0 16 16" fill="currentColor"><path d="M0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8Zm8-6.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM7.25 12.5v-5A.75.75 0 0 1 8 6.75h2.5a.75.75 0 0 1 0 1.5H8.75v4.25a.75.75 0 0 1-1.5 0Z" /></svg>
        <span class="text-[#8b949e]">{{ formatDuration(session.duration) }}</span>
      </div>
      <!-- Event count -->
      <div class="flex items-center gap-1.5">
        <svg class="h-3.5 w-3.5 flex-shrink-0 opacity-60" viewBox="0 0 16 16" fill="currentColor"><path d="M7.72.72a.75.75 0 0 1 1.06 0l1.5 1.5a.75.75 0 0 1-1.06 1.06l-.22-.22v1.69a.75.75 0 0 1-1.5 0V3.06l-.22.22a.75.75 0 0 1-1.06-1.06ZM2 7a.75.75 0 0 0 0 1.5h3.69l-.22.22a.75.75 0 1 0 1.06 1.06l1.5-1.5a.75.75 0 0 0 0-1.06l-1.5-1.5a.75.75 0 0 0-1.06 1.06l.22.22Zm8.53-.28a.75.75 0 0 0 0 1.06l1.5 1.5a.75.75 0 1 0 1.06-1.06l-.22-.22H16a.75.75 0 0 0 0-1.5h-3.13l.22-.22a.75.75 0 0 0-1.06-1.06ZM7.72 12.22a.75.75 0 0 1 1.06 0l1.5 1.5a.75.75 0 1 1-1.06 1.06l-.22-.22v1.69a.75.75 0 0 1-1.5 0v-1.69l-.22.22a.75.75 0 0 1-1.06-1.06Z" /></svg>
        <span class="text-[#8b949e]">{{ session.eventCount || 0 }} events</span>
      </div>
    </div>
  </a>
</template>

