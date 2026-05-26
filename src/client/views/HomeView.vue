<template>
  <div class="max-w-[1400px] w-full text-center mx-auto p-5">
    <h1 class="text-5xl mb-2.5 text-accent">
🤖 Session Viewer
</h1>
    <p class="text-text-secondary mb-10 text-base">
View session logs from Copilot CLI, Copilot Chat, Claude Code, and Pi-Mono
</p>

    <form @submit.prevent="viewSession">
      <div class="bg-surface border-2 border-border rounded-xl p-2 flex gap-2 transition-colors focus-within:border-accent">
        <input
          v-model="sessionInput"
          type="text"
          class="flex-1 py-4 px-5 min-h-11 bg-transparent border-none text-text-secondary text-base font-mono focus:outline-none placeholder:text-text-faint focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
          placeholder="Enter Session ID..."
          autofocus
          required
        >
        <button type="submit" class="py-4 px-8 min-h-11 bg-success-emphasis border-none rounded-lg text-white text-base font-semibold cursor-pointer transition-all hover:bg-success-emphasis hover:scale-[1.02] active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2">
View
</button>
      </div>
    </form>

    <div v-if="allSessions.length > 0 || hasLoaded" class="mt-10 text-left">
      <div class="flex items-baseline gap-3 mb-3">
        <div class="text-text-secondary text-sm mb-3 uppercase tracking-wider">
Sessions
</div>
        <a data-testid="import-link" class="text-accent text-sm no-underline cursor-pointer hover:text-link hover:underline" :style="importLinkStyle" @click.prevent="triggerImport">{{ importLinkText }}</a>
        <span data-testid="import-formats-hint" class="text-2xs text-text-faint ml-1.5 align-middle">Supports: GitHub Copilot, Claude, Pi-Mono</span>
      </div>
      <div class="flex gap-2 mb-4 flex-wrap">
        <button
          v-for="pill in filterPills"
          :key="pill.source"
          :class="[
            'filter-pill',
            currentSourceFilter === pill.source
              ? 'bg-accent !border-accent !text-white'
              : 'bg-surface-hover'
          ]"
          @click="selectFilter(pill.source)"
        >
{{ pill.label }}
</button>
      </div>
      <p v-if="currentSourceHint" class="hint mt-5 text-text-secondary text-sm">
        Sessions from <span class="inline-block bg-surface py-1 px-2 rounded font-mono text-sm text-accent">{{ currentSourceHint }}</span>
      </p>
      <input
        ref="fileInputRef"
        type="file"
        accept=".zip"
        style="display: none;"
        @change="handleFileChange"
      >
      <div v-if="importStatusMsg" :class="[
        'mb-3 py-2.5 px-3 rounded-md text-sm',
        importStatusType === 'success' ? 'bg-success-subtle border border-success-emphasis text-success' : '',
        importStatusType === 'error' ? 'bg-danger-subtle border border-danger-emphasis text-error-text' : '',
        importStatusType === 'loading' ? 'bg-accent-subtle border border-accent text-accent' : ''
      ]">
{{ importStatusMsg }}
</div>
      <div ref="sessionsContainer">
        <template v-if="filteredSessions.length === 0 && !isLoading">
          <div style="text-align: center; color: #6e7681; padding: 40px; font-size: 14px;">
No sessions found for this filter.
</div>
        </template>
        <template v-else>
          <template v-for="dateKey in sortedDateKeys" :key="dateKey">
            <div class="text-accent text-lg font-semibold mt-8 mb-4 pb-2 first:mt-0">
{{ formatDateHeader(groupedSessions[dateKey][0].createdAt) }}
</div>
            <div data-testid="session-list" class="grid grid-cols-[repeat(auto-fill,minmax(400px,1fr))] gap-4 md:grid-cols-[repeat(auto-fill,minmax(400px,1fr))] max-md:grid-cols-1">
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
        <div class="loading-spinner">
Loading more sessions...
</div>
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
import { toUrlSource } from '../utils/sourceMapping.js';

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
    router.push(`/${toUrlSource(currentSourceFilter.value)}/session/${id}`);
  }
}

function getState(source) {
  if (!sourceState[source]) {
    sourceState[source] = { offset: 0, hasMore: true };
  }
  return sourceState[source];
}

async function loadSessionTags(sessions) {
  try {
    const results = await Promise.all(
      sessions.map(s =>
        fetch(`/api/${encodeURIComponent(toUrlSource(s.source))}/sessions/${s.id}/tags`)
          .then(r => r.ok ? r.json() : { tags: [] })
          .then(data => ({ id: s.id, tags: data.tags || [] }))
          .catch(() => ({ id: s.id, tags: [] }))
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
  if (sessions.length === 0) return;
  const tagsMap = await loadSessionTags(sessions);
  sessions.forEach(s => { s.tags = tagsMap[s.id] || []; });
}

async function fetchSource(source) {
  const state = getState(source);
  if (state.offset > 0 || isLoading.value) return; // already loaded
  isLoading.value = true;
  try {
    const resp = await fetch(`/api/${encodeURIComponent(toUrlSource(source))}/sessions?offset=0&limit=20`);
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
    const resp = await fetch(`/api/${encodeURIComponent(toUrlSource(source))}/sessions?offset=${state.offset}&limit=20`);
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
    const response = await fetch('/api/import', { method: 'POST', body: formData });
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
    const resp = await fetch('/api/copilot-cli/sessions?offset=0&limit=1');
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
