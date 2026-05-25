<script setup>
import { ref, watch, onMounted, onBeforeUnmount } from 'vue'
import SessionCard from './SessionCard.vue'

const props = defineProps({
  source: { type: String, default: 'copilot' },
})

const sessions = ref([])
const isLoading = ref(false)
const hasMore = ref(true)
const sentinel = ref(null)

// Per-source state cache
const sourceCache = {}

function getState(source) {
  if (!sourceCache[source]) {
    sourceCache[source] = { sessions: [], offset: 0, hasMore: true }
  }
  return sourceCache[source]
}

// Group sessions by date
function getDateKey(ts) {
  if (!ts) return 'Unknown'
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function formatDateHeader(ts) {
  const d = new Date(ts)
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`
}

function groupedSessions() {
  const groups = {}
  for (const s of sessions.value) {
    const key = getDateKey(s.createdAt)
    if (!groups[key]) groups[key] = []
    groups[key].push(s)
  }
  return Object.keys(groups)
    .sort((a, b) => b.localeCompare(a))
    .map(key => ({
      dateKey: key,
      dateLabel: formatDateHeader(groups[key][0].createdAt),
      items: groups[key],
    }))
}

async function loadTags(sessionList) {
  const results = await Promise.all(
    sessionList.map(s =>
      fetch(`/api/sessions/${s.id}/tags`)
        .then(r => r.ok ? r.json() : { tags: [] })
        .then(data => ({ id: s.id, tags: data.tags || [] }))
        .catch(() => ({ id: s.id, tags: [] }))
    )
  )
  for (const { id, tags } of results) {
    const s = sessions.value.find(x => x.id === id)
    if (s) s.tags = tags
  }
}

async function loadMore() {
  const state = getState(props.source)
  if (isLoading.value || !state.hasMore) return

  isLoading.value = true
  try {
    const resp = await fetch(`/api/sessions/load-more?offset=${state.offset}&limit=20&source=${encodeURIComponent(props.source)}`)
    if (!resp.ok) throw new Error('Failed to load')
    const data = await resp.json()

    const existingIds = new Set(state.sessions.map(s => s.id))
    const newSessions = []
    for (const s of data.sessions || []) {
      if (!existingIds.has(s.id)) {
        state.sessions.push(s)
        newSessions.push(s)
      }
    }
    state.offset += (data.sessions || []).length
    state.hasMore = data.hasMore

    sessions.value = [...state.sessions]
    hasMore.value = state.hasMore

    await loadTags(newSessions)
  } catch (err) {
    console.error('Error loading sessions:', err)
  } finally {
    isLoading.value = false
  }
}

// IntersectionObserver for infinite scroll
let observer = null

function setupObserver() {
  if (observer) observer.disconnect()
  if (!sentinel.value) return
  observer = new IntersectionObserver(
    entries => {
      if (entries[0]?.isIntersecting) loadMore()
    },
    { rootMargin: '500px' }
  )
  observer.observe(sentinel.value)
}

onMounted(() => {
  setupObserver()
  loadMore()
})

onBeforeUnmount(() => {
  if (observer) observer.disconnect()
})

// When source changes, switch to cached data or fetch
watch(() => props.source, async () => {
  const state = getState(props.source)
  if (state.sessions.length > 0) {
    sessions.value = [...state.sessions]
    hasMore.value = state.hasMore
  } else {
    sessions.value = []
    hasMore.value = true
    await loadMore()
  }
  setupObserver()
})
</script>

<template>
  <div>
    <template v-if="sessions.length === 0 && !isLoading">
      <div class="py-10 text-center text-sm text-[#6e7681]">
No sessions found for this filter.
</div>
    </template>

    <template v-for="group in groupedSessions()" :key="group.dateKey">
      <div class="mt-8 mb-4 text-lg font-semibold text-[#58a6ff] first:mt-0">
        {{ group.dateLabel }}
      </div>
      <div class="grid gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-[repeat(auto-fill,minmax(400px,1fr))]">
        <SessionCard
          v-for="session in group.items"
          :key="session.id"
          :session="session"
        />
      </div>
    </template>

    <!-- Sentinel for infinite scroll -->
    <div ref="sentinel" class="h-1" />

    <!-- Loading indicator -->
    <div v-if="isLoading" class="mt-5 flex items-center justify-center gap-2 text-[#58a6ff]">
      <span class="animate-spin">⏳</span> Loading more sessions...
    </div>
  </div>
</template>
