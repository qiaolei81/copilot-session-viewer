<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import AppHeader from '../components/common/AppHeader.vue'
import LoadingSpinner from '../components/common/LoadingSpinner.vue'
import MarkdownRenderer from '../components/common/MarkdownRenderer.vue'

const route = useRoute()
const sessionId = computed(() => route.params.id)

const events = ref([])
const loading = ref(true)
const error = ref(null)
const expandedEvents = ref({})
const searchQuery = ref('')
const typeFilter = ref('all')
const allExpanded = ref(false)

// Session metadata extracted from events
const workspacePath = ref('')
const sessionModel = ref('')

onMounted(async () => {
  try {
    const res = await fetch(`/api/sessions/${sessionId.value}/events`)
    if (!res.ok) throw new Error(`Failed to load session: ${res.status}`)
    const data = await res.json()
    const allEvents = (data.events || data || [])
      .filter(e => e.type !== 'assistant.turn_end' && e.type !== 'assistant.turn_complete')
      .sort((a, b) => {
        const ta = a.timestamp ? new Date(a.timestamp).getTime() : 0
        const tb = b.timestamp ? new Date(b.timestamp).getTime() : 0
        return ta - tb
      })
    events.value = allEvents

    // Extract metadata from events
    for (const e of allEvents) {
      if (!workspacePath.value && (e.data?.cwd || e.data?.workspacePath)) {
        workspacePath.value = e.data.cwd || e.data.workspacePath
      }
      if (!sessionModel.value && (e.data?.model || e.data?.selectedModel || e.model)) {
        sessionModel.value = e.data?.selectedModel || e.data?.model || e.model
      }
    }
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
})

const duration = computed(() => {
  if (events.value.length < 2) return '—'
  const first = new Date(events.value[0].timestamp).getTime()
  const last = new Date(events.value[events.value.length - 1].timestamp).getTime()
  const totalSec = Math.floor((last - first) / 1000)
  const h = Math.floor(totalSec / 3600)
  const min = Math.floor((totalSec % 3600) / 60)
  const sec = totalSec % 60
  if (h > 0) return `${h}h ${min}m ${sec}s`
  return min > 0 ? `${min}m ${sec}s` : `${sec}s`
})

// Usage stats
const usageStats = computed(() => {
  let inputTokens = 0
  let outputTokens = 0
  for (const e of events.value) {
    const u = e.data?.usage || e.usage
    if (u) {
      inputTokens += u.input_tokens || u.inputTokens || 0
      outputTokens += u.output_tokens || u.outputTokens || 0
    }
  }
  // Rough cost estimate (sonnet pricing ~$3/MTok in, $15/MTok out)
  const cost = (inputTokens * 3 + outputTokens * 15) / 1_000_000
  return { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens, cost }
})

const filteredEvents = computed(() => {
  let result = events.value

  if (typeFilter.value !== 'all') {
    result = result.filter(e => e.type && e.type.startsWith(typeFilter.value + '.'))
  }

  if (searchQuery.value.trim()) {
    const q = searchQuery.value.toLowerCase()
    result = result.filter(e => {
      const content = eventContent(e).toLowerCase()
      const type = (e.type || '').toLowerCase()
      const raw = JSON.stringify(e.data || e).toLowerCase()
      return content.includes(q) || type.includes(q) || raw.includes(q)
    })
  }

  return result
})

const typeCounts = computed(() => {
  const counts = { all: events.value.length, user: 0, assistant: 0, tool: 0, subagent: 0 }
  for (const e of events.value) {
    if (e.type?.startsWith('user.')) counts.user++
    else if (e.type?.startsWith('assistant.')) counts.assistant++
    else if (e.type?.startsWith('tool.')) counts.tool++
    else if (e.type?.startsWith('subagent.')) counts.subagent++
  }
  return counts
})

function toggleEvent(key) {
  expandedEvents.value[key] = !expandedEvents.value[key]
}

function toggleAll() {
  allExpanded.value = !allExpanded.value
  const newState = {}
  for (const e of filteredEvents.value) {
    newState[eventKey(e)] = allExpanded.value
  }
  expandedEvents.value = newState
}

function eventKey(event) {
  return event.id || events.value.indexOf(event)
}

function formatTime(timestamp) {
  if (!timestamp) return ''
  return new Date(timestamp).toLocaleTimeString()
}

function eventContent(event) {
  const d = event.data || {}
  return d.message || d.text || d.content || d.reason || d.errorType || ''
}

function isAssistantEvent(event) {
  return event.type?.startsWith('assistant.')
}

function isToolEvent(event) {
  return event.type?.startsWith('tool.')
}

function isSubagentEvent(event) {
  return event.type?.startsWith('subagent.')
}

function toolName(event) {
  return event.data?.toolName || event.data?.tool || event.data?.name || event.type?.split('.').pop() || 'tool'
}

function toolInput(event) {
  const input = event.data?.input || event.data?.parameters || event.data?.arguments
  if (!input) return null
  return typeof input === 'string' ? input : JSON.stringify(input, null, 2)
}

function toolOutput(event) {
  const output = event.data?.output || event.data?.result || event.data?.content
  if (!output) return null
  return typeof output === 'string' ? output : JSON.stringify(output, null, 2)
}

function subagentLabel(event) {
  return event.data?.description || event.data?.subagentId || event.data?.agentName || null
}

function eventColor(type) {
  if (!type) return 'border-l-[#30363d]'
  if (type.startsWith('user.')) return 'border-l-[#3fb950]'
  if (type.startsWith('assistant.')) return 'border-l-[#58a6ff]'
  if (type.startsWith('tool.')) return 'border-l-[#d29922]'
  if (type.startsWith('subagent.')) return 'border-l-[#a78bdb]'
  return 'border-l-[#30363d]'
}

function formatTokens(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K'
  return String(n)
}

const copyStates = ref({})
async function copyContent(event) {
  const key = eventKey(event)
  const text = eventContent(event) || JSON.stringify(event.data || event, null, 2)
  try {
    await navigator.clipboard.writeText(text)
    copyStates.value[key] = true
    setTimeout(() => { copyStates.value[key] = false }, 2000)
  } catch {
    // fallback
    const ta = document.createElement('textarea')
    ta.value = text
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    document.body.removeChild(ta)
    copyStates.value[key] = true
    setTimeout(() => { copyStates.value[key] = false }, 2000)
  }
}

const toolDetailExpanded = ref({})
function toggleToolDetail(key, section) {
  const fullKey = `${key}-${section}`
  toolDetailExpanded.value[fullKey] = !toolDetailExpanded.value[fullKey]
}
</script>

<template>
  <div class="min-h-screen bg-[#0d1117] text-[#c9d1d9]">
    <AppHeader title="Session Detail" />

    <main class="px-4 py-6 sm:px-6 lg:px-8 max-w-5xl mx-auto">
      <!-- Back link -->
      <router-link
        to="/"
        class="inline-flex items-center gap-1 text-sm text-[#8b949e] hover:text-[#58a6ff] mb-4 transition-colors"
      >
        ← Back to sessions
      </router-link>

      <!-- Loading -->
      <LoadingSpinner v-if="loading" text="Loading session events..." />

      <!-- Error -->
      <div
        v-else-if="error"
        class="rounded-lg border border-[#f8514966] bg-[#f851490d] p-6 text-center"
      >
        <p class="text-[#f85149] font-medium mb-2">Failed to load session</p>
        <p class="text-sm text-[#8b949e]">{{ error }}</p>
      </div>

      <!-- Content -->
      <template v-else>
        <!-- Metadata -->
        <div class="rounded-lg border border-[#30363d] bg-[#161b22] p-4 mb-4">
          <div class="flex items-center justify-between mb-3">
            <h1 class="text-lg font-semibold text-[#58a6ff] font-mono truncate" :title="sessionId">
              {{ sessionId }}
            </h1>
            <router-link
              :to="`/session/${sessionId}/time-analyze`"
              class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium bg-[#1f6feb] text-white hover:bg-[#388bfd] transition-colors shrink-0"
            >
              ⏱ Time Analysis
            </router-link>
          </div>
          <div class="flex flex-wrap gap-4 text-sm text-[#8b949e]">
            <span>
              <span class="font-medium text-[#c9d1d9]">{{ events.length }}</span> events
            </span>
            <span>
              Duration: <span class="font-medium text-[#c9d1d9]">{{ duration }}</span>
            </span>
            <span v-if="sessionModel">
              Model: <span class="font-medium text-[#c9d1d9]">{{ sessionModel }}</span>
            </span>
          </div>
          <div v-if="workspacePath" class="mt-2 text-sm text-[#8b949e] flex items-center gap-1.5">
            <span class="shrink-0">📁</span>
            <span class="font-mono text-xs text-[#c9d1d9] break-all">{{ workspacePath }}</span>
          </div>
        </div>

        <!-- Usage stats -->
        <div v-if="usageStats.totalTokens > 0" class="rounded-lg border border-[#30363d] bg-[#161b22] p-3 mb-4 flex flex-wrap gap-6 text-sm">
          <div>
            <span class="text-[#8b949e]">Input: </span>
            <span class="font-mono font-medium text-[#3fb950]">{{ formatTokens(usageStats.inputTokens) }}</span>
          </div>
          <div>
            <span class="text-[#8b949e]">Output: </span>
            <span class="font-mono font-medium text-[#58a6ff]">{{ formatTokens(usageStats.outputTokens) }}</span>
          </div>
          <div>
            <span class="text-[#8b949e]">Total: </span>
            <span class="font-mono font-medium text-[#c9d1d9]">{{ formatTokens(usageStats.totalTokens) }}</span>
          </div>
          <div v-if="usageStats.cost > 0.001">
            <span class="text-[#8b949e]">Est. Cost: </span>
            <span class="font-mono font-medium text-[#d29922]">${{ usageStats.cost.toFixed(3) }}</span>
          </div>
        </div>

        <!-- Search & Filter toolbar -->
        <div class="rounded-lg border border-[#30363d] bg-[#161b22] p-3 mb-4 flex flex-col sm:flex-row gap-3 items-start sm:items-center">
          <div class="relative flex-1 w-full">
            <span class="absolute left-3 top-1/2 -translate-y-1/2 text-[#6e7681] text-sm">🔍</span>
            <input
              v-model="searchQuery"
              type="text"
              placeholder="Search events..."
              class="w-full pl-9 pr-3 py-2 rounded-md bg-[#0d1117] border border-[#30363d] text-sm text-[#c9d1d9] placeholder-[#6e7681] focus:border-[#58a6ff] focus:outline-none transition-colors"
            />
          </div>
          <div class="flex gap-1 shrink-0 flex-wrap">
            <button
              v-for="t in ['all', 'user', 'assistant', 'tool', 'subagent']"
              :key="t"
              @click="typeFilter = t"
              class="px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors capitalize"
              :class="typeFilter === t
                ? 'bg-[#1f6feb] text-white'
                : 'bg-[#21262d] text-[#8b949e] hover:text-[#c9d1d9] hover:bg-[#30363d]'"
              v-show="typeCounts[t] > 0 || t === 'all'"
            >
              {{ t }} ({{ typeCounts[t] }})
            </button>
          </div>
          <button
            @click="toggleAll"
            class="px-3 py-1.5 rounded-md text-xs font-medium bg-[#21262d] text-[#8b949e] hover:text-[#c9d1d9] hover:bg-[#30363d] transition-colors shrink-0"
          >
            {{ allExpanded ? 'Collapse All' : 'Expand All' }}
          </button>
        </div>

        <!-- Event list -->
        <div v-if="filteredEvents.length === 0" class="text-center py-12 text-[#8b949e]">
          <template v-if="events.length === 0">No events found for this session.</template>
          <template v-else>No events match your filters.</template>
        </div>

        <div v-else class="space-y-2">
          <div
            v-for="event in filteredEvents"
            :key="eventKey(event)"
            class="rounded-lg border-l-4 bg-[#161b22] border border-[#30363d] overflow-hidden"
            :class="eventColor(event.type)"
          >
            <!-- Event header -->
            <div class="flex items-center gap-2 px-4 py-3">
              <button
                class="flex-1 flex items-center gap-3 text-left hover:bg-[#1c2129] transition-colors rounded -m-1 p-1"
                @click="toggleEvent(eventKey(event))"
              >
                <span class="text-xs text-[#6e7681] shrink-0 font-mono w-20">
                  {{ formatTime(event.timestamp) }}
                </span>
                <span class="text-xs font-medium px-2 py-0.5 rounded bg-[#21262d] text-[#c9d1d9] shrink-0">
                  {{ event.type }}
                </span>
                <!-- Tool name badge -->
                <span
                  v-if="isToolEvent(event)"
                  class="text-xs font-semibold px-2 py-0.5 rounded bg-[rgba(210,153,34,0.15)] text-[#d29922] shrink-0"
                >
                  🔧 {{ toolName(event) }}
                </span>
                <!-- Subagent badge -->
                <span
                  v-if="isSubagentEvent(event) || subagentLabel(event)"
                  class="text-xs font-semibold px-2 py-0.5 rounded bg-[rgba(167,139,219,0.15)] text-[#a78bdb] shrink-0"
                >
                  🤖 {{ subagentLabel(event) || 'subagent' }}
                </span>
                <span class="text-sm text-[#8b949e] truncate flex-1">
                  {{ eventContent(event) }}
                </span>
                <span class="text-[#6e7681] text-xs shrink-0">
                  {{ expandedEvents[eventKey(event)] ? '▼' : '▶' }}
                </span>
              </button>
              <!-- Copy button -->
              <button
                @click.stop="copyContent(event)"
                class="text-xs px-2 py-1 rounded text-[#8b949e] hover:text-[#c9d1d9] hover:bg-[#30363d] transition-colors shrink-0"
                :title="copyStates[eventKey(event)] ? 'Copied!' : 'Copy content'"
              >
                {{ copyStates[eventKey(event)] ? '✓' : '📋' }}
              </button>
            </div>

            <!-- Expanded detail -->
            <div
              v-if="expandedEvents[eventKey(event)]"
              class="px-4 pb-4 border-t border-[#30363d]"
            >
              <!-- Assistant: markdown rendering -->
              <div v-if="isAssistantEvent(event) && eventContent(event)" class="mt-3">
                <MarkdownRenderer :content="eventContent(event)" :searchQuery="searchQuery" />
              </div>

              <!-- Tool: input/output sections -->
              <template v-if="isToolEvent(event)">
                <!-- Tool input -->
                <div v-if="toolInput(event)" class="mt-3">
                  <button
                    @click="toggleToolDetail(eventKey(event), 'input')"
                    class="text-xs font-medium text-[#8b949e] hover:text-[#c9d1d9] mb-1 flex items-center gap-1"
                  >
                    <span>{{ toolDetailExpanded[`${eventKey(event)}-input`] ? '▼' : '▶' }}</span>
                    Input
                  </button>
                  <pre
                    v-if="toolDetailExpanded[`${eventKey(event)}-input`]"
                    class="text-xs text-[#8b949e] overflow-x-auto whitespace-pre-wrap break-words bg-[#0d1117] rounded p-3 max-h-96 overflow-y-auto"
                  >{{ toolInput(event) }}</pre>
                </div>
                <!-- Tool output -->
                <div v-if="toolOutput(event)" class="mt-2">
                  <button
                    @click="toggleToolDetail(eventKey(event), 'output')"
                    class="text-xs font-medium text-[#8b949e] hover:text-[#c9d1d9] mb-1 flex items-center gap-1"
                  >
                    <span>{{ toolDetailExpanded[`${eventKey(event)}-output`] ? '▼' : '▶' }}</span>
                    Output
                  </button>
                  <pre
                    v-if="toolDetailExpanded[`${eventKey(event)}-output`]"
                    class="text-xs text-[#8b949e] overflow-x-auto whitespace-pre-wrap break-words bg-[#0d1117] rounded p-3 max-h-96 overflow-y-auto"
                  >{{ toolOutput(event) }}</pre>
                </div>
              </template>

              <!-- Raw JSON (non-tool, non-assistant, or as fallback) -->
              <div v-if="!isAssistantEvent(event) && !isToolEvent(event)" class="mt-3">
                <pre class="text-xs text-[#8b949e] overflow-x-auto whitespace-pre-wrap break-words bg-[#0d1117] rounded p-3 max-h-96 overflow-y-auto">{{ JSON.stringify(event.data || event, null, 2) }}</pre>
              </div>

              <!-- Always show raw JSON toggle for tool/assistant -->
              <div v-if="isAssistantEvent(event) || isToolEvent(event)" class="mt-2">
                <button
                  @click="toggleToolDetail(eventKey(event), 'raw')"
                  class="text-xs text-[#6e7681] hover:text-[#8b949e] flex items-center gap-1"
                >
                  <span>{{ toolDetailExpanded[`${eventKey(event)}-raw`] ? '▼' : '▶' }}</span>
                  Raw JSON
                </button>
                <pre
                  v-if="toolDetailExpanded[`${eventKey(event)}-raw`]"
                  class="text-xs text-[#6e7681] mt-1 overflow-x-auto whitespace-pre-wrap break-words bg-[#0d1117] rounded p-3 max-h-96 overflow-y-auto"
                >{{ JSON.stringify(event.data || event, null, 2) }}</pre>
              </div>
            </div>
          </div>
        </div>
      </template>
    </main>
  </div>
</template>
