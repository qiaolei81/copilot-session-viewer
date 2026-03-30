/**
 * Homepage JavaScript - Session list with filtering and infinite scroll
 * Extracted from views/index.ejs
 */

// Get page data from window.__PAGE_DATA (set by EJS template)
const pageData = window.__PAGE_DATA || {};
const initialSessions = pageData.sessions || [];
const _totalSessionsFromServer = pageData.totalSessions || 0;
const hasMoreFromServer = pageData.hasMore || false;
const sourceHints = pageData.sourceHints || {};

// Infinite scroll state — per-source
let allSessions = [...initialSessions];
// Per-source pagination state
const sourceState = {};
// Initialize from initial server load (copilot is default active pill)
sourceState['copilot'] = { offset: initialSessions.length, hasMore: hasMoreFromServer };

let isLoading = false;

// Filter state — restore from localStorage if available
const FILTER_STORAGE_KEY = 'sessionViewer.sourceFilter';
let _restoredFilter;
try { _restoredFilter = localStorage.getItem(FILTER_STORAGE_KEY); } catch (_e) { _restoredFilter = null; }
let currentSourceFilter = _restoredFilter || 'copilot';

function currentState() {
  if (!sourceState[currentSourceFilter]) {
    sourceState[currentSourceFilter] = { offset: 0, hasMore: true };
  }
  return sourceState[currentSourceFilter];
}

// Load more sessions for current source
async function loadMoreSessions() {
  const state = currentState();
  if (isLoading || !state.hasMore) return;

  isLoading = true;
  const loadingIndicator = document.getElementById('loading-indicator');
  loadingIndicator.style.display = 'block';

  // Track load more action
  window.trackClick('LoadMoreClicked', {
    currentPage: Math.floor(state.offset / 20) + 1,
    offset: state.offset,
    source: currentSourceFilter
  });

  try {
    const response = await fetch(`/api/sessions/load-more?offset=${currentState().offset}&limit=20&source=${encodeURIComponent(currentSourceFilter)}`);
    if (!response.ok) throw new Error('Failed to load more sessions');

    const data = await response.json();
    const existingIds = new Set(allSessions.map(s => s.id));
    const newSessions = [];
    for (const s of data.sessions) {
      if (!existingIds.has(s.id)) {
        allSessions.push(s);
        newSessions.push(s);
      }
    }
    currentState().offset += data.sessions.length;
    currentState().hasMore = data.hasMore;

    // Load tags for new sessions
    await attachTagsToSessions(newSessions);

    renderAllSessions();
  } catch (err) {
    console.error('Error loading more sessions:', err);
  } finally {
    isLoading = false;
    loadingIndicator.style.display = 'none';
  }
}

// Get filtered sessions based on current filter
function getFilteredSessions() {
  return allSessions.filter(session => session.source === currentSourceFilter);
}

// Render all sessions (grouped by date)
function renderAllSessions() {
  const container = document.getElementById('sessions-container');
  container.innerHTML = ''; // Clear existing

  const filteredSessions = getFilteredSessions();

  if (filteredSessions.length === 0) {
    container.innerHTML = '<div style="text-align: center; color: #6e7681; padding: 40px; font-size: 14px;">No sessions found for this filter.</div>';
    return;
  }

  const grouped = groupSessionsByDate(filteredSessions);
  const sortedDates = Object.keys(grouped).sort((a, b) => b.localeCompare(a)); // Descending

  sortedDates.forEach(dateKey => {
    const dateHeader = document.createElement('div');
    dateHeader.className = 'date-group-header';
    dateHeader.textContent = formatDateHeader(grouped[dateKey][0].createdAt);
    container.appendChild(dateHeader);

    const grid = document.createElement('div');
    grid.className = 'recent-list';
    grouped[dateKey].forEach(session => {
      grid.innerHTML += renderSessionCard(session);
    });
    container.appendChild(grid);
  });
}

// Check if user has scrolled near bottom
function checkScrollPosition() {
  const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
  const windowHeight = window.innerHeight;
  const docHeight = document.documentElement.scrollHeight;

  // Load more when user is within 500px of bottom
  if (scrollTop + windowHeight >= docHeight - 500 && currentState().hasMore && !isLoading) {
    loadMoreSessions();
  }
}

// Throttle scroll events for performance
let scrollTimeout;
function throttledScroll() {
  if (scrollTimeout) return;
  scrollTimeout = setTimeout(() => {
    checkScrollPosition();
    scrollTimeout = null;
  }, 100);
}

function viewSession(e) {
  e.preventDefault();
  const sessionId = document.getElementById('sessionInput').value.trim();
  if (sessionId) {
    window.location.href = `/session/${sessionId}`;
  }
}

// Bind form submit event
document.getElementById('sessionForm').addEventListener('submit', viewSession);

// File import handling
const fileInput = document.getElementById('fileInput');
const importLink = document.getElementById('importLink');
const importStatus = document.getElementById('importStatus');

// Click import link to select file
importLink.addEventListener('click', (e) => {
  e.preventDefault();
  fileInput.click();
});

// Auto-upload when file is selected
fileInput.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  if (!file.name.endsWith('.zip')) {
    showStatus('error', '❌ Please select a .zip file');
    return;
  }

  importLink.style.pointerEvents = 'none';
  importLink.style.opacity = '0.5';
  importLink.textContent = 'Importing...';
  showStatus('loading', 'Uploading and extracting session...');

  try {
    const formData = new FormData();
    formData.append('sessionZip', file);

    const response = await fetch('/session/import', {
      method: 'POST',
      body: formData
    });

    const result = await response.json();

    if (response.ok) {
      showStatus('success', `✅ Session ${result.sessionId} imported successfully!`);

      // Reload page after 1.5 seconds to show new session
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } else {
      showStatus('error', `❌ Import failed: ${result.error}`);
      importLink.style.pointerEvents = 'auto';
      importLink.style.opacity = '1';
      importLink.textContent = 'Import session from zip';
    }
  } catch (err) {
    showStatus('error', `❌ Import failed: ${err.message}`);
    importLink.style.pointerEvents = 'auto';
    importLink.style.opacity = '1';
    importLink.textContent = 'Import session from zip';
  } finally {
    // Reset file input
    fileInput.value = '';
  }
});

function showStatus(type, message) {
  importStatus.className = `import-status ${type}`;
  importStatus.textContent = message;
}

// Format duration from milliseconds to human-readable format
function formatDuration(ms) {
  if (!ms || ms < 0) return '—';

  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    const remainingMinutes = minutes % 60;
    return `${hours}h ${remainingMinutes}m`;
  } else if (minutes > 0) {
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  } else {
    return `${seconds}s`;
  }
}

// Format date to YYYY/MM/DD
function formatDateHeader(dateStr) {
  const date = new Date(dateStr);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}/${month}/${day}`;
}

// Get date key from timestamp (YYYY-MM-DD for grouping)
function getDateKey(timestamp) {
  if (!timestamp) return 'Unknown';
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Group sessions by date
function groupSessionsByDate(sessions) {
  const groups = {};
  sessions.forEach(session => {
    const dateKey = getDateKey(session.createdAt);
    if (!groups[dateKey]) {
      groups[dateKey] = [];
    }
    groups[dateKey].push(session);
  });
  return groups;
}

// Render session card HTML
function renderSessionCard(session) {
  // Add status badges
  let badges = '';

  // Add source badge (use backend-provided metadata - Violation #3 & #5 fix)
  const sourceClass = session.sourceBadgeClass || 'source-copilot';
  const sourceLabel = session.sourceName || 'Copilot';
  badges += `<span class="status-badge ${sourceClass}" title="${sourceLabel}">${sourceLabel}</span>`;

  if (session.sessionStatus === 'wip') {
    badges += '<span class="status-badge wip" title="Session in progress">🔄 WIP</span>';
  }
  if (session.isImported) {
    badges += '<span class="status-badge imported" title="Imported session">📥</span>';
  }
  if (session.hasInsight) {
    badges += '<span class="status-badge insight" title="Has Agent Review">💡</span>';
  }
  // Add model and version badges
  if (session.selectedModel) {
    const modelShort = session.selectedModel.replace('claude-', '').replace('gpt-', '').replace('gemini-', '');
    let modelClass = 'model-other';
    if (session.selectedModel.includes('claude')) {
      modelClass = 'model-claude';
    } else if (session.selectedModel.includes('gpt')) {
      modelClass = 'model-gpt';
    } else if (session.selectedModel.includes('gemini')) {
      modelClass = 'model-gemini';
    }
    badges += `<span class="status-badge model ${modelClass}" title="Model: ${escapeHtml(session.selectedModel)}">${escapeHtml(modelShort)}</span>`;
  }
  if (session.copilotVersion) {
    badges += `<span class="status-badge version" title="CLI version">${escapeHtml(session.copilotVersion)}</span>`;
  }

  let summaryHtml = '';
  if (session.summary && session.summary !== 'No summary' && session.summary !== 'Legacy session') {
    const summaryFull = session.summary.replace(/"/g, '&quot;');
    const summaryOneLine = escapeHtml(session.summary).replace(/\n+/g, ' ');
    summaryHtml = `<div class="session-summary" title="${summaryFull}">${summaryOneLine}</div>`;
  } else {
    summaryHtml = '<div class="session-summary" style="color: #6e7681; font-style: italic;">No summary available</div>';
  }

  let workspaceHtml = '';
  if (session.workspace && session.workspace.cwd) {
    workspaceHtml = `
      <div class="session-info-item workspace" title="${escapeHtml(session.workspace.cwd)}">
        <svg viewBox="0 0 16 16" fill="currentColor"><path d="M1.75 1A1.75 1.75 0 000 2.75v10.5C0 14.216.784 15 1.75 15h12.5A1.75 1.75 0 0016 13.25v-8.5A1.75 1.75 0 0014.25 3H7.5a.25.25 0 01-.2-.1l-.9-1.2C6.07 1.26 5.55 1 5 1H1.75z"></path></svg>
        <span class="session-info-value">${escapeHtml(session.workspace.cwd)}</span>
      </div>
    `;
  }

  const createdAtStr = session.createdAt
    ? new Date(session.createdAt).toLocaleString('en-US', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
    : 'unknown';

  let durationHtml = '';
  if (session.duration) {
    durationHtml = `
      <div class="session-info-item">
        <svg viewBox="0 0 16 16" fill="currentColor"><path d="M0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8Zm8-6.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM7.25 12.5v-5A.75.75 0 0 1 8 6.75h2.5a.75.75 0 0 1 0 1.5H8.75v4.25a.75.75 0 0 1-1.5 0Z"></path></svg>
        <span class="session-info-value">${formatDuration(session.duration)}</span>
      </div>
    `;
  }

  const wipClass = session.sessionStatus === 'wip' ? ' recent-item-wip' : '';

  // Render tags
  let tagsHtml = '';
  if (session.tags && session.tags.length > 0) {
    const tagsItems = session.tags.map(tag => {
      const color = getTagColor(tag);
      return `<span class="session-tag" style="background-color: ${color}" title="${escapeHtml(tag)}">${escapeHtml(tag)}</span>`;
    }).join('');
    tagsHtml = `<div class="session-tags">${tagsItems}</div>`;
  }

  return `
    <a href="/session/${session.id}" class="recent-item${wipClass}" onclick="trackClick('SessionCardClicked', { sessionId: '${escapeHtml(session.id)}', source: '${escapeHtml(session.source || 'unknown')}' })">
      <div class="session-id">
        <span class="session-id-text" title="${escapeHtml(session.id)}">${escapeHtml(session.id)}</span>
      </div>
      <div class="session-badges-tags">
        <div class="session-badges">${badges}</div>
        ${tagsHtml}
      </div>
      ${summaryHtml}
      <div class="session-divider"></div>
      <div class="session-info">
        ${workspaceHtml}
        <div class="session-info-item">
          <svg viewBox="0 0 16 16" fill="currentColor"><path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Zm7-3.25v2.992l2.028.812a.75.75 0 0 1-.557 1.392l-2.5-1A.751.751 0 0 1 7 8.25v-3.5a.75.75 0 0 1 1.5 0Z"></path></svg>
          <span class="session-info-value">${createdAtStr}</span>
        </div>
        ${durationHtml}
        <div class="session-info-item">
          <svg viewBox="0 0 16 16" fill="currentColor"><path d="M7.72.72a.75.75 0 0 1 1.06 0l1.5 1.5a.75.75 0 0 1-1.06 1.06l-.22-.22v1.69a.75.75 0 0 1-1.5 0V3.06l-.22.22a.75.75 0 0 1-1.06-1.06ZM2 7a.75.75 0 0 0 0 1.5h3.69l-.22.22a.75.75 0 1 0 1.06 1.06l1.5-1.5a.75.75 0 0 0 0-1.06l-1.5-1.5a.75.75 0 0 0-1.06 1.06l.22.22Zm8.53-.28a.75.75 0 0 0 0 1.06l1.5 1.5a.75.75 0 1 0 1.06-1.06l-.22-.22H16a.75.75 0 0 0 0-1.5h-3.13l.22-.22a.75.75 0 0 0-1.06-1.06ZM7.72 12.22a.75.75 0 0 1 1.06 0l1.5 1.5a.75.75 0 1 1-1.06 1.06l-.22-.22v1.69a.75.75 0 0 1-1.5 0v-1.69l-.22.22a.75.75 0 0 1-1.06-1.06Z"></path></svg>
          <span class="session-info-value">${session.eventCount || 0} events</span>
        </div>
      </div>
    </a>
  `;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Tag colors (same as session-vue.ejs)
const tagColors = [
  '#3b82f6', // blue
  '#10b981', // green
  '#f59e0b', // amber
  '#ef4444', // red
  '#8b5cf6', // purple
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#f97316'  // orange
];

function getTagColor(tag) {
  let hash = 0;
  for (let i = 0; i < tag.length; i++) {
    hash = tag.charCodeAt(i) + ((hash << 5) - hash);
  }
  return tagColors[Math.abs(hash) % tagColors.length];
}

// Load tags for sessions
async function loadSessionTags(sessionIds) {
  try {
    const tagPromises = sessionIds.map(id =>
      fetch(`/api/sessions/${id}/tags`)
        .then(r => r.ok ? r.json() : { tags: [] })
        .then(data => ({ id, tags: data.tags || [] }))
        .catch(() => ({ id, tags: [] }))
    );
    const results = await Promise.all(tagPromises);
    const tagsMap = {};
    results.forEach(({ id, tags }) => {
      tagsMap[id] = tags;
    });
    return tagsMap;
  } catch (err) {
    console.error('Error loading session tags:', err);
    return {};
  }
}

// Attach tags to sessions
async function attachTagsToSessions(sessions) {
  const sessionIds = sessions.map(s => s.id);
  const tagsMap = await loadSessionTags(sessionIds);
  sessions.forEach(session => {
    session.tags = tagsMap[session.id] || [];
  });
}

function updateSourceHint(source) {
  const hint = document.getElementById('sourceHint');
  if (hint && sourceHints[source]) {
    hint.innerHTML = 'Sessions from <span class="hint-code">' + sourceHints[source] + '</span>';
  } else if (hint) {
    hint.textContent = '';
  }
}

// Filter pill click handler
async function fetchAndRenderSource(source) {
  if (!sourceState[source]) {
    sourceState[source] = { offset: 0, hasMore: true };
  }
  if (sourceState[source].offset === 0 && !isLoading) {
    isLoading = true;
    const container = document.getElementById('sessions-container');
    container.innerHTML = '<div style="text-align: center; color: #6e7681; padding: 40px; font-size: 14px;">⏳ Loading...</div>';
    document.getElementById('loading-indicator').style.display = 'none';
    try {
      const resp = await fetch(`/api/sessions/load-more?offset=0&limit=20&source=${encodeURIComponent(source)}`);
      if (resp.ok) {
        const data = await resp.json();
        const existingIds = new Set(allSessions.map(s => s.id));
        const newSessions = [];
        for (const s of (data.sessions || [])) {
          if (!existingIds.has(s.id)) {
            allSessions.push(s);
            newSessions.push(s);
          }
        }
        sourceState[source].offset = (data.sessions || []).length;
        sourceState[source].hasMore = data.hasMore;
        await attachTagsToSessions(newSessions);
      }
    } catch (e) {
      console.error('Failed to load sessions for source:', source, e);
    } finally {
      isLoading = false;
    }
  }
  renderAllSessions();
}

function setupFilterPills() {
  const filterPills = document.querySelectorAll('.filter-pill');
  // Validate restored filter exists as a pill; fall back to 'copilot'
  const validSources = new Set([...filterPills].map(p => p.getAttribute('data-source')));
  if (!validSources.has(currentSourceFilter)) {
    currentSourceFilter = 'copilot';
    try { localStorage.setItem(FILTER_STORAGE_KEY, currentSourceFilter); } catch (_e) { /* ignore */ }
  }
  // Restore active pill from saved filter
  filterPills.forEach(p => {
    p.classList.toggle('active', p.getAttribute('data-source') === currentSourceFilter);
  });
  updateSourceHint(currentSourceFilter);
  filterPills.forEach(pill => {
    pill.addEventListener('click', async () => {
      filterPills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      currentSourceFilter = pill.getAttribute('data-source');
      try { localStorage.setItem(FILTER_STORAGE_KEY, currentSourceFilter); } catch (_e) { /* ignore */ }
      updateSourceHint(currentSourceFilter);

      // Track filter pill click
      window.trackClick('FilterPillClicked', {
        pillName: pill.textContent.trim(),
        dataSource: currentSourceFilter
      });

      await fetchAndRenderSource(currentSourceFilter);
    });
  });
}

// Render grouped sessions on page load
document.addEventListener('DOMContentLoaded', async function() {
  // Load tags for initial sessions (always copilot from server pre-load)
  await attachTagsToSessions(allSessions);

  // Infinite scroll
  window.addEventListener('scroll', throttledScroll);

  // Setup filter pills (registers click handlers + highlights restored pill)
  setupFilterPills();

  // Render the restored filter's sessions
  if (currentSourceFilter === 'copilot') {
    renderAllSessions();
  } else {
    await fetchAndRenderSource(currentSourceFilter);
  }
});
