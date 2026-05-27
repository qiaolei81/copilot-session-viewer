import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useSessionStore = defineStore('session', () => {
  const MAX_CACHE_SIZE = 50;
  // Cache: sessionId -> { metadata, events, timestamp }
  const cache = ref({});

  function _evictOldest() {
    const keys = Object.keys(cache.value);
    if (keys.length <= MAX_CACHE_SIZE) return;
    const sorted = keys.sort((a, b) => (cache.value[a].timestamp || 0) - (cache.value[b].timestamp || 0));
    const toRemove = sorted.slice(0, keys.length - MAX_CACHE_SIZE);
    for (const k of toRemove) delete cache.value[k];
  }

  function _touch(sessionId) {
    if (cache.value[sessionId]) cache.value[sessionId].timestamp = Date.now();
  }

  function getCached(sessionId) {
    const entry = cache.value[sessionId] || null;
    if (entry) _touch(sessionId);
    return entry;
  }

  async function fetchMetadata(sessionId, source, dirId = null) {
    const cached = cache.value[sessionId];
    if (cached?.metadata) return cached.metadata;

    let url = `/api/${encodeURIComponent(source)}/sessions/${encodeURIComponent(sessionId)}`;
    if (dirId) url += `?dirId=${encodeURIComponent(dirId)}`;
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const data = await resp.json();

    if (!cache.value[sessionId]) {
      cache.value[sessionId] = { timestamp: Date.now() };
    }
    cache.value[sessionId].metadata = data;
    _touch(sessionId);
    _evictOldest();
    return data;
  }

  async function fetchEvents(sessionId, source, dirId = null) {
    const cached = cache.value[sessionId];
    if (cached?.events) return cached.events;

    let url = `/api/${encodeURIComponent(source)}/sessions/${encodeURIComponent(sessionId)}/events`;
    if (dirId) url += `?dirId=${encodeURIComponent(dirId)}`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`Failed to load events: ${resp.statusText}`);
    const data = await resp.json();
    const events = Array.isArray(data) ? data : (data.events || []);

    if (!cache.value[sessionId]) {
      cache.value[sessionId] = { timestamp: Date.now() };
    }
    cache.value[sessionId].events = events;
    _touch(sessionId);
    _evictOldest();
    return events;
  }

  function invalidate(sessionId) {
    if (sessionId) {
      delete cache.value[sessionId];
    } else {
      cache.value = {};
    }
  }

  function updateMetadata(sessionId, metadata) {
    if (cache.value[sessionId]) {
      cache.value[sessionId].metadata = metadata;
    }
  }

  return { cache, getCached, fetchMetadata, fetchEvents, invalidate, updateMetadata };
});
