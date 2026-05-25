<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { useRoute } from 'vue-router'
import SessionHeader from '../components/session/SessionHeader.vue'
import SidebarContainer from '../components/session/SidebarContainer.vue'
import SessionInfoPanel from '../components/session/SessionInfoPanel.vue'
import UsagePanel from '../components/session/UsagePanel.vue'
import FilterToolbar from '../components/session/FilterToolbar.vue'
import EventCard from '../components/session/EventCard.vue'
import ScrollControls from '../components/session/ScrollControls.vue'

const route = useRoute()
const sessionId = computed(() => route.params.id)

// State
const metadata = ref({})
const exporting = ref(false)
const sidebarCollapsed = ref(
  window.innerWidth <= 640 ? true : localStorage.getItem('sidebarCollapsed') === 'true'
)
const expandedTools = ref({})
const expandedContent = ref({})
const MAX_EXPANDED_ITEMS = 50

const currentFilter = ref('all')
const searchText = ref('')
const debouncedSearchText = ref('')
const currentTurnIndex = ref(0)
const selectedSubagent = ref(null)
const subagentDropdownOpen = ref(false)
const subagentSearchQuery = ref('')
const typeFilterOpen = ref(false)

const loadedEvents = ref([])
const eventsLoading = ref(true)
const eventsError = ref(null)

// Persist sidebar state
watch(sidebarCollapsed, (val) => {
  if (window.innerWidth > 640) localStorage.setItem('sidebarCollapsed', val.toString())
})

// Debounced search
let searchTimeout = null
watch(searchText, (val) => {
  clearTimeout(searchTimeout)
  searchTimeout = setTimeout(() => { debouncedSearchText.value = val }, 300)
})

// Cleanup expansion state
const cleanupExpansionState = () => {
  for (const obj of [expandedTools, expandedContent]) {
    const keys = Object.keys(obj.value)
    if (keys.length > MAX_EXPANDED_ITEMS) {
      keys.slice(0, keys.length - MAX_EXPANDED_ITEMS).forEach(k => delete obj.value[k])
    }
  }
}
watch(currentFilter, cleanupExpansionState)
watch(debouncedSearchText, cleanupExpansionState)

// SUBAGENT COLORS
const SUBAGENT_COLORS = ['#58a6ff', '#f0883e', '#a371f7', '#3fb950', '#f778ba', '#79c0ff', '#d29922', '#56d4dd']

const hashCode = (str) => {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i)
    hash = hash & hash
  }
  return hash
}

// Flat events (sorted, filtered out turn_end/complete, with stable IDs)
const flatEvents = computed(() => {
  return loadedEvents.value
    .filter(e => e.type !== 'assistant.turn_end' && e.type !== 'assistant.turn_complete')
    .sort((a, b) => {
      const timeA = a.timestamp ? new Date(a.timestamp).getTime() : 0
      const timeB = b.timestamp ? new Date(b.timestamp).getTime() : 0
      if (timeA !== timeB) return timeA - timeB
      return (a._fileIndex ?? 0) - (b._fileIndex ?? 0)
    })
    .map((e, index) => ({
      ...e,
      virtualIndex: index,
      stableId: e.id || `${e.timestamp}-${e.type}-${index}`
    }))
})

// Search match helper
const matchesSearch = (e) => {
  if (!debouncedSearchText.value.trim()) return true
  const search = debouncedSearchText.value.toLowerCase()
  const content = [
    e.data?.message, e.data?.text, e.data?.content,
    e.data?.reason, e.data?.reasoningText, e.data?.errorType,
    e.data?.previousModel, e.data?.newModel
  ].filter(Boolean).join(' ').toLowerCase()
  return content.includes(search)
}

// Exclude tool execution events from filtering
const excludeToolCalls = (e) => {
  const t = e.type || ''
  return t !== 'tool.execution_start' && t !== 'tool.execution_complete'
}

// Events after search (before type/subagent filter)
const searchFilteredEvents = computed(() => {
  let events = flatEvents.value.filter(excludeToolCalls)
  if (debouncedSearchText.value.trim()) events = events.filter(matchesSearch)
  return events
})

// Subagent ownership computation
const subagentOwnership = computed(() => {
  const ownerMap = new Map()
  const subagentInfo = new Map()
  let currentSubagentStack = []

  for (const event of flatEvents.value) {
    if (event.type === 'subagent.started') {
      const tcid = event.data?.toolCallId
      if (tcid) {
        const name = event.data?.agentDisplayName || event.data?.agentName || 'SubAgent'
        const colorIndex = Math.abs(hashCode(tcid)) % SUBAGENT_COLORS.length
        subagentInfo.set(tcid, {
          name,
          colorIndex,
          meta: {
            taskName: event.data?.taskName,
            agentType: event.data?.agentType,
            agentDescription: event.data?.agentDescription,
            model: event.data?.model,
          }
        })
        currentSubagentStack.push(tcid)
      }
    } else if (event.type === 'subagent.completed' || event.type === 'subagent.failed') {
      const tcid = event.data?.toolCallId
      if (tcid) {
        const idx = currentSubagentStack.lastIndexOf(tcid)
        if (idx >= 0) currentSubagentStack.splice(idx, 1)
      }
    } else if (currentSubagentStack.length > 0) {
      ownerMap.set(event.stableId, currentSubagentStack[currentSubagentStack.length - 1])
    }

    // Handle _subagent metadata
    if (event._subagent) {
      const sid = event._subagent.id
      if (!subagentInfo.has(sid)) {
        subagentInfo.set(sid, {
          name: event._subagent.name || 'SubAgent',
          colorIndex: Math.abs(hashCode(sid)) % SUBAGENT_COLORS.length,
          meta: {}
        })
      }
      ownerMap.set(event.stableId, sid)
    }

    // VS Code format
    if (event.data?.subAgentId) {
      const sid = event.data.subAgentId
      if (!subagentInfo.has(sid)) {
        subagentInfo.set(sid, {
          name: event.data?.subAgentName || 'SubAgent',
          colorIndex: Math.abs(hashCode(sid)) % SUBAGENT_COLORS.length,
          meta: {}
        })
      }
      ownerMap.set(event.stableId, sid)
    }
  }

  return { ownerMap, subagentInfo }
})

const subagentList = computed(() => {
  const { subagentInfo: si } = subagentOwnership.value
  if (si.size === 0) return []
  const list = []
  for (const [toolCallId, info] of si) {
    list.push({ toolCallId, name: info.name, colorIndex: info.colorIndex, meta: info.meta || {} })
  }
  return list
})

const filteredSubagentList = computed(() => {
  const q = subagentSearchQuery.value.toLowerCase().trim()
  if (!q) return subagentList.value
  return subagentList.value.filter(sa => {
    const m = sa.meta || {}
    return [sa.name, m.taskName, m.taskDescription, m.agentName, m.agentType, m.agentDescription, m.model]
      .filter(Boolean).join(' ').toLowerCase().includes(q)
  })
})

// Filter by subagent helper
const filterBySubagent = (events, subagentId, ownerMap) => {
  return events.filter(e => {
    if ((e.type === 'subagent.started' || e.type === 'subagent.completed' || e.type === 'subagent.failed') && e.data?.toolCallId === subagentId) return true
    if (ownerMap.get(e.stableId) === subagentId) return true
    if (e._subagent?.id === subagentId) return true
    if (e.data?.subAgentId === subagentId) return true
    return false
  })
}

// Subagent token usage
const subagentTokenUsage = computed(() => {
  if (!selectedSubagent.value) return null
  const { ownerMap, subagentInfo: si } = subagentOwnership.value
  const tcid = selectedSubagent.value
  if (!si.has(tcid)) return null

  let eventCount = 0, startTime = null, endTime = null
  for (const ev of flatEvents.value) {
    const isOwned = ownerMap.get(ev.stableId) === tcid
    const isDivider = (ev.type === 'subagent.started' || ev.type === 'subagent.completed' || ev.type === 'subagent.failed') && ev.data?.toolCallId === tcid
    if (isDivider || isOwned || ev._subagent?.id === tcid || ev.data?.subAgentId === tcid) {
      eventCount++
      if (ev.timestamp) {
        const t = new Date(ev.timestamp).getTime()
        if (startTime === null || t < startTime) startTime = t
        if (endTime === null || t > endTime) endTime = t
      }
    }
  }
  return { eventCount, durationMs: startTime === null || endTime === null ? 0 : endTime - startTime }
})

// Final filtered events
const filteredEvents = computed(() => {
  let events = searchFilteredEvents.value

  if (selectedSubagent.value) {
    const { ownerMap } = subagentOwnership.value
    events = filterBySubagent(events, selectedSubagent.value, ownerMap)
  }

  if (currentFilter.value !== 'all') {
    events = events.filter(e => e.type === currentFilter.value)
  }

  const dividerTypes = ['assistant.turn_start', 'subagent.started', 'subagent.completed', 'subagent.failed']
  const totalCount = events.length
  return events.map((e, index) => {
    const nextItem = events[index + 1]
    const isLast = index === totalCount - 1
    const nextIsDivider = nextItem && dividerTypes.includes(nextItem.type)
    return { ...e, filteredIndex: index, filteredTotal: totalCount, isLastEvent: isLast || nextIsDivider }
  })
})

// Filters list
const filters = computed(() => {
  const totalEvents = searchFilteredEvents.value.length
  const result = [{ type: 'all', label: `All (${totalEvents})`, count: totalEvents }]
  const typeCounts = {}
  searchFilteredEvents.value.forEach(e => { if (e.type) typeCounts[e.type] = (typeCounts[e.type] || 0) + 1 })
  const sorted = Object.entries(typeCounts).sort((a, b) => b[1] - a[1]).map(([type, count]) => ({ type, label: `${type} (${count})`, count }))
  return [...result, ...sorted]
})

// Active filter count
const activeFilterCount = computed(() => {
  let count = 0
  if (currentFilter.value !== 'all') count++
  if (selectedSubagent.value) count++
  if (searchText.value.trim()) count++
  return count
})

// Search result count
const searchResultCount = computed(() => {
  if (!debouncedSearchText.value.trim()) return null
  const count = searchFilteredEvents.value.length
  return count > 0 ? `${count} result${count !== 1 ? 's' : ''}` : 'No matches'
})

// Turns
const turns = computed(() => {
  const turnStarts = flatEvents.value.filter(e => e.type === 'assistant.turn_start')
  const allUserMessages = flatEvents.value.filter(e => e.type === 'user.message')
  return turnStarts.map((turn, idx) => {
    const turnId = idx
    const startTime = new Date(turn.timestamp).getTime()
    const nextIdx = turnStarts.indexOf(turn) + 1
    const endTime = nextIdx < turnStarts.length ? new Date(turnStarts[nextIdx].timestamp).getTime() : Date.now()
    const durationMs = endTime - startTime
    const totalSeconds = Math.floor(durationMs / 1000)
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = totalSeconds % 60
    const durationText = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`
    const userMessage = flatEvents.value.slice(0, flatEvents.value.indexOf(turn)).reverse().find(e => e.type === 'user.message')
    const userReqNumber = userMessage ? allUserMessages.indexOf(userMessage) + 1 : 0
    return {
      id: turnId,
      index: turn.virtualIndex,
      originalTurnId: turn.data?.turnId,
      timestamp: turn.timestamp,
      duration: durationText,
      message: userMessage?.data?.content || userMessage?.data?.transformedContent || '',
      userReqNumber
    }
  })
})

// UserReq groups
const userReqs = computed(() => {
  const groups = []
  const reqMap = new Map()
  turns.value.forEach(turn => {
    const reqNum = turn.userReqNumber || 0
    if (!reqMap.has(reqNum)) {
      const group = { reqNumber: reqNum, message: turn.message, turns: [] }
      reqMap.set(reqNum, group)
      groups.push(group)
    }
    reqMap.get(reqNum).turns.push(turn)
  })
  return groups
})

// Expansion count for virtual scroller size deps
const expansionCount = computed(() => {
  const toolsExpanded = Object.keys(expandedTools.value).filter(k => expandedTools.value[k]).length
  const contentExpanded = Object.keys(expandedContent.value).filter(k => expandedContent.value[k]).length
  return toolsExpanded + contentExpanded
})

// Tool calling summary for sidebar
const toolCallingSummary = computed(() => {
  const countMap = new Map()
  for (const event of flatEvents.value) {
    if (event.data?.tools && Array.isArray(event.data.tools)) {
      for (const tool of event.data.tools) {
        if (tool?.name) countMap.set(tool.name, (countMap.get(tool.name) || 0) + 1)
      }
    }
  }
  return Array.from(countMap, ([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count)
})

// Event list container ref for scrolling
const eventListRef = ref(null)

// Get subagent info for an event
function getSubagentInfo(event) {
  const { ownerMap, subagentInfo: si } = subagentOwnership.value
  if (event.type === 'subagent.started' || event.type === 'subagent.completed' || event.type === 'subagent.failed') {
    const tcid = event.data?.toolCallId
    if (tcid && si.has(tcid)) {
      const info = si.get(tcid)
      return { name: info.name, toolCallId: tcid, colorIndex: info.colorIndex }
    }
    return null
  }
  if (event._subagent) {
    const sid = event._subagent.id
    if (si.has(sid)) {
      const info = si.get(sid)
      return { name: info.name, toolCallId: sid, colorIndex: info.colorIndex }
    }
    return { name: event._subagent.name, toolCallId: sid, colorIndex: Math.abs(hashCode(sid)) }
  }
  if (event.data?.subAgentId) {
    const sid = event.data.subAgentId
    const info = si.get(sid)
    if (info) return { name: info.name, toolCallId: sid, colorIndex: info.colorIndex }
  }
  const tcid = ownerMap.get(event.stableId)
  if (!tcid) return null
  const info = si.get(tcid)
  if (!info) return null
  return { name: info.name, toolCallId: tcid, colorIndex: info.colorIndex }
}

function getSubagentColor(event) {
  const info = getSubagentInfo(event)
  if (!info) return null
  return SUBAGENT_COLORS[info.colorIndex % SUBAGENT_COLORS.length]
}

function getTurnNumber(virtualIndex) {
  const turn = turns.value.find(t => t.index === virtualIndex)
  if (!turn) return '?'
  const turnLabel = turn.originalTurnId ?? turn.id
  if (turn.userReqNumber > 0) return `${turn.userReqNumber} - Turn ${turnLabel}`
  return `Turn ${turnLabel}`
}

function getTurnDuration(virtualIndex) {
  const turn = turns.value.find(t => t.index === virtualIndex)
  return turn?.duration || null
}

// Actions
function toggleTool(toolId) {
  const newState = { ...expandedTools.value }
  if (newState[toolId]) delete newState[toolId]
  else newState[toolId] = true
  expandedTools.value = newState
}

function toggleContent(contentId) {
  const newState = { ...expandedContent.value }
  if (newState[contentId]) delete newState[contentId]
  else newState[contentId] = true
  expandedContent.value = newState
}

function setFilter(type) {
  currentFilter.value = type
}

function selectSubagent(toolCallId) {
  selectedSubagent.value = toolCallId
  subagentDropdownOpen.value = false
  subagentSearchQuery.value = ''
  if (toolCallId) currentFilter.value = 'all'
}

function clearAllFilters() {
  currentFilter.value = 'all'
  selectedSubagent.value = null
  searchText.value = ''
  debouncedSearchText.value = ''
  typeFilterOpen.value = false
}

function jumpToTurn(turnId) {
  const turn = turns.value.find(t => t.id === turnId)
  if (!turn) return
  searchText.value = ''
  currentFilter.value = 'all'
  selectedSubagent.value = null
  currentTurnIndex.value = turn.id

  nextTick(() => {
    const targetIndex = filteredEvents.value.findIndex(e => e.virtualIndex === turn.index)
    if (targetIndex >= 0 && eventListRef.value) {
      const items = eventListRef.value.querySelectorAll('[data-event-index]')
      if (items[targetIndex]) {
        items[targetIndex].scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
    }
  })
}

function scrollToTop() {
  if (eventListRef.value) eventListRef.value.scrollTop = 0
}

function scrollToBottom() {
  if (eventListRef.value) eventListRef.value.scrollTop = eventListRef.value.scrollHeight
}

async function exportSession() {
  exporting.value = true
  try {
    const response = await fetch(`/session/${sessionId.value}/export`)
    if (!response.ok) throw new Error('Share failed')
    const blob = await response.blob()
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `session-${sessionId.value}.zip`
    document.body.appendChild(a)
    a.click()
    window.URL.revokeObjectURL(url)
    document.body.removeChild(a)
  } catch (err) {
    alert('Failed to share session: ' + err.message)
  } finally {
    exporting.value = false
  }
}

// Close dropdowns on outside click
const closeTypeFilter = () => { typeFilterOpen.value = false }
const closeSubagentDropdown = () => { subagentDropdownOpen.value = false }
const handleKeydown = (e) => {
  if (e.ctrlKey && e.key === 'b') { e.preventDefault(); sidebarCollapsed.value = !sidebarCollapsed.value }
}

onMounted(async () => {
  document.addEventListener('click', closeTypeFilter)
  document.addEventListener('click', closeSubagentDropdown)
  window.addEventListener('keydown', handleKeydown)

  try {
    const response = await fetch(`/api/sessions/${sessionId.value}/events`)
    if (!response.ok) throw new Error(`Failed to load events: ${response.statusText}`)
    const data = await response.json()
    if (Array.isArray(data)) {
      loadedEvents.value = data
    } else if (data.events && Array.isArray(data.events)) {
      loadedEvents.value = data.events
    } else {
      throw new Error('Invalid response format')
    }

    // Also fetch metadata
    try {
      const metaRes = await fetch(`/api/sessions/${sessionId.value}`)
      if (metaRes.ok) {
        const metaData = await metaRes.json()
        metadata.value = metaData.metadata || metaData || {}
      }
    } catch {
      // metadata is optional, continue without it
    }

    // Update metadata.updated from last event
    if (loadedEvents.value.length > 0) {
      const lastEvent = loadedEvents.value[loadedEvents.value.length - 1]
      const lastTime = lastEvent.timestamp || lastEvent.time || lastEvent.data?.timestamp
      if (lastTime) metadata.value.updated = new Date(lastTime)
    }
  } catch (error) {
    eventsError.value = error.message
  } finally {
    eventsLoading.value = false
  }
})

onBeforeUnmount(() => {
  document.removeEventListener('click', closeTypeFilter)
  document.removeEventListener('click', closeSubagentDropdown)
  window.removeEventListener('keydown', handleKeydown)
  clearTimeout(searchTimeout)
  expandedTools.value = {}
  expandedContent.value = {}
})
</script>

<template>
  <div class="container">
    <SessionHeader
      :sessionId="sessionId"
      :metadata="metadata"
      :exporting="exporting"
      @export="exportSession"
    />

    <div class="main-layout">
      <SidebarContainer v-model:collapsed="sidebarCollapsed">
        <SessionInfoPanel
          :metadata="metadata"
          :eventCount="flatEvents.length"
          :duration="''"
        />
        <UsagePanel
          v-if="metadata.usage"
          :usage="metadata.usage"
          :toolCallingSummary="toolCallingSummary"
        />
      </SidebarContainer>

      <div class="content">
        <FilterToolbar
          :searchText="searchText"
          :searchResultCount="searchResultCount"
          :currentFilter="currentFilter"
          :filters="filters"
          :turns="turns"
          :userReqs="userReqs"
          :currentTurnIndex="currentTurnIndex"
          :sidebarCollapsed="sidebarCollapsed"
          :activeFilterCount="activeFilterCount"
          :selectedSubagent="selectedSubagent"
          :subagentList="subagentList"
          :filteredSubagentList="filteredSubagentList"
          :subagentDropdownOpen="subagentDropdownOpen"
          :subagentSearchQuery="subagentSearchQuery"
          :subagentTokenUsage="subagentTokenUsage"
          :typeFilterOpen="typeFilterOpen"
          :SUBAGENT_COLORS="SUBAGENT_COLORS"
          @update:searchText="searchText = $event"
          @update:sidebarCollapsed="sidebarCollapsed = $event"
          @update:typeFilterOpen="typeFilterOpen = $event"
          @update:subagentDropdownOpen="subagentDropdownOpen = $event"
          @update:subagentSearchQuery="subagentSearchQuery = $event"
          @setFilter="setFilter"
          @jumpToTurn="jumpToTurn"
          @selectSubagent="selectSubagent"
          @clearAllFilters="clearAllFilters"
        />

        <!-- Loading -->
        <div v-if="eventsLoading" class="loading-message">
          <div style="text-align: center; padding: 40px; color: #c9d1d9;">⏳ Loading events...</div>
        </div>

        <!-- Error -->
        <div v-else-if="eventsError" class="error-message">
          <div style="text-align: center; padding: 40px; color: #f85149;">❌ Error loading events: {{ eventsError }}</div>
        </div>

        <!-- Events list -->
        <div v-else ref="eventListRef" class="event-list">
          <div v-if="filteredEvents.length === 0" style="text-align: center; padding: 40px; color: #7d8590;">
            {{ loadedEvents.length === 0 ? 'No events found for this session.' : 'No events match your filters.' }}
          </div>
          <div
            v-for="item in filteredEvents"
            :key="item.stableId"
            :data-event-index="item.filteredIndex"
          >
            <EventCard
              :event="item"
              :expandedTools="expandedTools"
              :expandedContent="expandedContent"
              :searchText="debouncedSearchText"
              :subagentInfo="getSubagentInfo(item)"
              :subagentColor="getSubagentColor(item)"
              :metadataSource="metadata.source || ''"
              :turnNumber="getTurnNumber(item.virtualIndex)"
              :turnDuration="getTurnDuration(item.virtualIndex)"
              @toggleTool="toggleTool"
              @toggleContent="toggleContent"
              @selectSubagent="selectSubagent"
            />
          </div>
          <div class="scroller-bottom-spacer"></div>
        </div>

        <ScrollControls @scrollToTop="scrollToTop" @scrollToBottom="scrollToBottom" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.container {
  max-width: 100%;
  height: 100vh;
  display: flex;
  flex-direction: column;
  padding: 0;
  background: #0d1117;
  color: #c9d1d9;
}
.main-layout {
  display: flex;
  flex: 1;
  overflow: hidden;
}
.content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.event-list {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding-bottom: env(safe-area-inset-bottom, 0px);
}
.scroller-bottom-spacer {
  height: max(env(safe-area-inset-bottom, 0px), 16px);
  flex-shrink: 0;
}

@media (max-width: 640px) {
  .event-list {
    padding-bottom: max(env(safe-area-inset-bottom, 0px), 80px);
  }
  .scroller-bottom-spacer {
    height: max(env(safe-area-inset-bottom, 0px), 100px);
  }
}
</style>
