<template>
  <div class="container">
    <h1>🤖 Session Viewer</h1>
    <p class="subtitle">View session logs from Copilot CLI, Copilot Chat, Claude Code, and Pi-Mono</p>

    <form @submit.prevent="viewSession">
      <div class="input-group">
        <input
          type="text"
          class="session-input"
          v-model="sessionInput"
          placeholder="Enter Session ID..."
          autofocus
          required
        >
        <button type="submit" class="view-btn">View</button>
      </div>
    </form>

    <div v-if="allSessions.length > 0 || hasLoaded" class="recent-sessions">
      <div class="sessions-header">
        <div class="recent-title">Sessions</div>
        <a class="import-link" :style="importLinkStyle" @click.prevent="triggerImport">{{ importLinkText }}</a>
        <span class="import-formats-hint">Supports: GitHub Copilot, Claude, Pi-Mono</span>
      </div>
      <div class="filter-pills">
        <button
          v-for="pill in filterPills"
          :key="pill.source"
          :class="['filter-pill', { active: currentSourceFilter === pill.source }]"
          @click="selectFilter(pill.source)"
        >{{ pill.label }}</button>
      </div>
      <p class="hint source-hint" v-if="currentSourceHint">
        Sessions from <span class="hint-code">{{ currentSourceHint }}</span>
      </p>
      <input
        ref="fileInputRef"
        type="file"
        accept=".zip"
        style="display: none;"
        @change="handleFileChange"
      >
      <div v-if="importStatusMsg" :class="['import-status', importStatusType]">{{ importStatusMsg }}</div>
      <div ref="sessionsContainer">
        <template v-if="filteredSessions.length === 0 && !isLoading">
          <div style="text-align: center; color: #6e7681; padding: 40px; font-size: 14px;">No sessions found for this filter.</div>
        </template>
        <template v-else>
          <template v-for="dateKey in sortedDateKeys" :key="dateKey">
            <div class="date-group-header">{{ formatDateHeader(groupedSessions[dateKey][0].createdAt) }}</div>
            <div class="recent-list">
              <SessionCard
                v-for="session in groupedSessions[dateKey]"
                :key="session.id"
                :session="session"
                @summary-hover="onSummaryHover"
                @summary-move="onSummaryMove"
                @summary-leave="onSummaryLeave"
                @summary-touchstart="onSummaryTouchStart"
              />
            </div>
          </template>
        </template>
      </div>
      <div v-if="isLoading" style="text-align: center; margin-top: 20px;">
        <div class="loading-spinner">Loading more sessions...</div>
      </div>
    </div>

    <SummaryTooltip ref="tooltipRef" />
    <BottomSheet ref="bottomSheetRef" />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import SessionCard from '../components/home/SessionCard.vue';
import SummaryTooltip from '../components/home/SummaryTooltip.vue';
import BottomSheet from '../components/home/BottomSheet.vue';

// Load marked for markdown rendering
if (typeof window !== 'undefined' && !window.marked) {
  const script = document.createElement('script');
  script.src = 'https://cdn.jsdelivr.net/npm/marked@9/marked.min.js';
  document.head.appendChild(script);
}

const router = useRouter();
const sessionInput = ref('');
const allSessions = ref([]);
const isLoading = ref(false);
const hasLoaded = ref(false);
const currentSourceFilter = ref('copilot');
const sourceHints = ref({});
const sourceState = {};

const importLinkText = ref('Import session from zip');
const importLinkStyle = ref({});
const importStatusMsg = ref('');
const importStatusType = ref('');
const fileInputRef = ref(null);
const tooltipRef = ref(null);
const bottomSheetRef = ref(null);

const FILTER_STORAGE_KEY = 'sessionViewer.sourceFilter';

const filterPills = [
  { source: 'copilot', label: 'Copilot CLI' },
  { source: 'vscode', label: 'Copilot Chat' },
  { source: 'claude', label: 'Claude' },
  { source: 'modernize', label: 'Modernize CLI' },
  { source: 'pi-mono', label: 'Pi' },
];

// Restore filter from localStorage
try {
  const saved = localStorage.getItem(FILTER_STORAGE_KEY);
  if (saved && filterPills.some(p => p.source === saved)) {
    currentSourceFilter.value = saved;
  }
} catch (_e) { /* ignore */ }

const filteredSessions = computed(() => {
  return allSessions.value.filter(s => s.source === currentSourceFilter.value);
});

const groupedSessions = computed(() => {
  const groups = {};
  filteredSessions.value.forEach(session => {
    const dateKey = getDateKey(session.createdAt);
    if (!groups[dateKey]) groups[dateKey] = [];
    groups[dateKey].push(session);
  });
  return groups;
});

const sortedDateKeys = computed(() => {
  return Object.keys(groupedSessions.value).sort((a, b) => b.localeCompare(a));
});

const currentSourceHint = computed(() => {
  return sourceHints.value[currentSourceFilter.value] || '';
});

function getDateKey(timestamp) {
  if (!timestamp) return 'Unknown';
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function formatDateHeader(dateStr) {
  const date = new Date(dateStr);
  return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`;
}

function viewSession() {
  const id = sessionInput.value.trim();
  if (id) {
    router.push(`/session/${id}`);
  }
}

function getState(source) {
  if (!sourceState[source]) {
    sourceState[source] = { offset: 0, hasMore: true };
  }
  return sourceState[source];
}

async function loadSessionTags(sessionIds) {
  try {
    const results = await Promise.all(
      sessionIds.map(id =>
        fetch(`/api/sessions/${id}/tags`)
          .then(r => r.ok ? r.json() : { tags: [] })
          .then(data => ({ id, tags: data.tags || [] }))
          .catch(() => ({ id, tags: [] }))
      )
    );
    const map = {};
    results.forEach(({ id, tags }) => { map[id] = tags; });
    return map;
  } catch (_e) {
    return {};
  }
}

async function attachTags(sessions) {
  const ids = sessions.map(s => s.id);
  if (ids.length === 0) return;
  const tagsMap = await loadSessionTags(ids);
  sessions.forEach(s => { s.tags = tagsMap[s.id] || []; });
}

async function fetchSource(source) {
  const state = getState(source);
  if (state.offset > 0 || isLoading.value) return; // already loaded
  isLoading.value = true;
  try {
    const resp = await fetch(`/api/sessions/load-more?offset=0&limit=20&source=${encodeURIComponent(source)}`);
    if (resp.ok) {
      const data = await resp.json();
      const existingIds = new Set(allSessions.value.map(s => s.id));
      const newSessions = [];
      for (const s of (data.sessions || [])) {
        if (!existingIds.has(s.id)) {
          allSessions.value.push(s);
          newSessions.push(s);
        }
      }
      state.offset = (data.sessions || []).length;
      state.hasMore = data.hasMore;
      await attachTags(newSessions);
    }
  } catch (e) {
    console.error('Failed to load sessions for source:', source, e);
  } finally {
    isLoading.value = false;
  }
}

async function loadMore() {
  const source = currentSourceFilter.value;
  const state = getState(source);
  if (isLoading.value || !state.hasMore) return;
  isLoading.value = true;
  try {
    const resp = await fetch(`/api/sessions/load-more?offset=${state.offset}&limit=20&source=${encodeURIComponent(source)}`);
    if (!resp.ok) throw new Error('Failed to load more sessions');
    const data = await resp.json();
    const existingIds = new Set(allSessions.value.map(s => s.id));
    const newSessions = [];
    for (const s of data.sessions) {
      if (!existingIds.has(s.id)) {
        allSessions.value.push(s);
        newSessions.push(s);
      }
    }
    state.offset += data.sessions.length;
    state.hasMore = data.hasMore;
    await attachTags(newSessions);
  } catch (e) {
    console.error('Error loading more sessions:', e);
  } finally {
    isLoading.value = false;
  }
}

async function selectFilter(source) {
  currentSourceFilter.value = source;
  try { localStorage.setItem(FILTER_STORAGE_KEY, source); } catch (_e) { /* ignore */ }
  await fetchSource(source);
}

// Infinite scroll
let scrollTimeout = null;
function throttledScroll() {
  if (scrollTimeout) return;
  scrollTimeout = setTimeout(() => {
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    const windowHeight = window.innerHeight;
    const docHeight = document.documentElement.scrollHeight;
    if (scrollTop + windowHeight >= docHeight - 500 && getState(currentSourceFilter.value).hasMore && !isLoading.value) {
      loadMore();
    }
    scrollTimeout = null;
  }, 100);
}

// Import
function triggerImport() {
  fileInputRef.value?.click();
}

async function handleFileChange(e) {
  const file = e.target.files[0];
  if (!file) return;
  if (!file.name.endsWith('.zip')) {
    importStatusType.value = 'error';
    importStatusMsg.value = '❌ Please select a .zip file';
    return;
  }
  importLinkStyle.value = { pointerEvents: 'none', opacity: '0.5' };
  importLinkText.value = 'Importing...';
  importStatusType.value = 'loading';
  importStatusMsg.value = 'Uploading and extracting session...';

  try {
    const formData = new FormData();
    formData.append('zipFile', file);
    const response = await fetch('/session/import', { method: 'POST', body: formData });
    const result = await response.json();
    if (response.ok) {
      importStatusType.value = 'success';
      importStatusMsg.value = `✅ Session ${result.sessionId} imported successfully!`;
      setTimeout(() => { window.location.reload(); }, 1500);
    } else {
      importStatusType.value = 'error';
      importStatusMsg.value = `❌ Import failed: ${result.error}`;
      resetImportLink();
    }
  } catch (err) {
    importStatusType.value = 'error';
    importStatusMsg.value = `❌ Import failed: ${err.message}`;
    resetImportLink();
  } finally {
    if (fileInputRef.value) fileInputRef.value.value = '';
  }
}

function resetImportLink() {
  importLinkStyle.value = {};
  importLinkText.value = 'Import session from zip';
}

// Tooltip handlers
function onSummaryHover(e) {
  const el = e.target.closest('.session-summary');
  if (el) tooltipRef.value?.scheduleShow(el, e);
}

function onSummaryMove(e) {
  tooltipRef.value?.onMove(e);
}

function onSummaryLeave() {
  tooltipRef.value?.scheduleHide();
}

// Long-press for mobile bottom sheet
let lpTimer = null;
let lpMoved = false;

function onSummaryTouchStart(e) {
  const el = e.target.closest('.session-summary');
  if (!el) return;
  lpMoved = false;
  const md = el.dataset.tooltipText || el.getAttribute('title') || '';
  if (!md) return;
  lpTimer = setTimeout(() => {
    if (!lpMoved) {
      e.preventDefault();
      bottomSheetRef.value?.open(md);
    }
  }, 500);
}

function onTouchMove() { lpMoved = true; clearTimeout(lpTimer); }
function onTouchEnd() { clearTimeout(lpTimer); }

// Load source hints
async function loadSourceHints() {
  try {
    const resp = await fetch('/api/sessions/load-more?offset=0&limit=1&source=copilot');
    // sourceHints come from the initial page data; for the SPA we fetch separately
  } catch (_e) { /* ignore */ }
}

onMounted(async () => {
  hasLoaded.value = true;
  window.addEventListener('scroll', throttledScroll);
  document.addEventListener('touchmove', onTouchMove, { passive: true });
  document.addEventListener('touchend', onTouchEnd, { passive: true });
  document.addEventListener('touchcancel', onTouchEnd, { passive: true });

  // Fetch source hints
  try {
    const resp = await fetch('/api/source-hints');
    if (resp.ok) {
      sourceHints.value = await resp.json();
    }
  } catch (_e) { /* ignore */ }

  // Initial load for the current source filter
  await fetchSource(currentSourceFilter.value);
});

onUnmounted(() => {
  window.removeEventListener('scroll', throttledScroll);
  document.removeEventListener('touchmove', onTouchMove);
  document.removeEventListener('touchend', onTouchEnd);
  document.removeEventListener('touchcancel', onTouchEnd);
});
</script>

<style scoped>
/* Focus indicators for accessibility */
button:focus-visible,
input:focus-visible {
  outline: 2px solid #58a6ff;
  outline-offset: 2px;
  box-shadow: 0 0 0 4px rgba(88, 166, 255, 0.2);
}

h1 {
  font-size: 48px;
  margin-bottom: 10px;
  color: #58a6ff;
}
.subtitle {
  color: #c9d1d9;
  margin-bottom: 40px;
  font-size: 16px;
}
.container {
  max-width: 1400px;
  width: 100%;
  text-align: center;
  margin: 0 auto;
  padding: 20px;
}
.input-group {
  background: #161b22;
  border: 2px solid #30363d;
  border-radius: 12px;
  padding: 8px;
  display: flex;
  gap: 8px;
  transition: border-color 0.2s;
}
.input-group:focus-within {
  border-color: #58a6ff;
}
.session-input {
  flex: 1;
  padding: 16px 20px;
  min-height: 44px;
  background: transparent;
  border: none;
  color: #c9d1d9;
  font-size: 16px;
  font-family: "SF Mono", Monaco, monospace;
}
.session-input:focus {
  outline: none;
}
.session-input::placeholder {
  color: #6e7681;
}
.view-btn {
  padding: 16px 32px;
  min-height: 44px;
  background: #238636;
  border: none;
  border-radius: 8px;
  color: #fff;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}
.view-btn:hover {
  background: #2ea043;
  transform: scale(1.02);
}
.view-btn:active {
  transform: scale(0.98);
}
.hint {
  margin-top: 20px;
  color: #c9d1d9;
  font-size: 14px;
}
.hint-code {
  display: inline-block;
  background: #161b22;
  padding: 4px 8px;
  border-radius: 4px;
  font-family: "SF Mono", Monaco, monospace;
  font-size: 13px;
  color: #58a6ff;
}
.recent-sessions {
  margin-top: 40px;
  text-align: left;
}
.recent-title {
  color: #c9d1d9;
  font-size: 14px;
  margin-bottom: 12px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.recent-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(400px, 1fr));
  gap: 16px;
  grid-auto-flow: dense;
}
.filter-pills {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}
.filter-pill {
  padding: 6px 16px;
  background: #21262d;
  border: 1px solid #30363d;
  border-radius: 20px;
  color: #8b949e;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  min-height: 32px;
}
.filter-pill:hover {
  background: #30363d;
  border-color: #58a6ff;
  color: #c9d1d9;
}
.filter-pill.active {
  background: #58a6ff;
  border-color: #58a6ff;
  color: #fff;
}
.sessions-header {
  display: flex;
  align-items: baseline;
  gap: 12px;
  margin-bottom: 12px;
}
.import-link {
  color: #58a6ff;
  font-size: 14px;
  text-decoration: none;
  cursor: pointer;
  transition: color 0.2s;
}
.import-link:hover {
  color: #79c0ff;
  text-decoration: underline;
}
.import-formats-hint {
  font-size: 11px;
  color: #6e7681;
  margin-left: 6px;
  vertical-align: middle;
}
.import-status {
  margin-bottom: 12px;
  padding: 10px 12px;
  border-radius: 6px;
  font-size: 13px;
}
.import-status.success {
  background: rgba(35, 134, 54, 0.15);
  border: 1px solid #238636;
  color: #3fb950;
}
.import-status.error {
  background: rgba(248, 81, 73, 0.15);
  border: 1px solid #f85149;
  color: #ff7b72;
}
.import-status.loading {
  background: rgba(88, 166, 255, 0.15);
  border: 1px solid #58a6ff;
  color: #58a6ff;
}
.date-group-header {
  color: #58a6ff;
  font-size: 18px;
  font-weight: 600;
  margin-top: 32px;
  margin-bottom: 16px;
  padding-bottom: 8px;
}
.date-group-header:first-child {
  margin-top: 0;
}
.loading-spinner {
  color: #58a6ff;
  font-size: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}
.loading-spinner::before {
  content: '⏳';
  animation: spin 1s linear infinite;
}
@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* Responsive adjustments */
@media (max-width: 768px) {
  .recent-list {
    grid-template-columns: 1fr;
  }
  .container {
    max-width: 100%;
  }
}
@media (min-width: 769px) and (max-width: 1200px) {
  .recent-list {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
