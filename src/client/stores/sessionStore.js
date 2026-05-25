import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useSessionStore = defineStore('session', () => {
  // Cache: sessionId -> { metadata, events, timestamp }
  const cache = ref({});

  function getCached(sessionId) {
    return cache.value[sessionId] || null;
  }

  async function fetchMetadata(sessionId) {
    const cached = cache.value[sessionId];
    if (cached?.metadata) return cached.metadata;

    const resp = await fetch(`/api/sessions/${sessionId}`);
    if (!resp.ok) return null;
    const data = await resp.json();

    if (!cache.value[sessionId]) {
      cache.value[sessionId] = { timestamp: Date.now() };
    }
    cache.value[sessionId].metadata = data;
    return data;
  }

  async function fetchEvents(sessionId) {
    const cached = cache.value[sessionId];
    if (cached?.events) return cached.events;

    const resp = await fetch(`/api/sessions/${sessionId}/events`);
    if (!resp.ok) throw new Error(`Failed to load events: ${resp.statusText}`);
    const data = await resp.json();
    const events = Array.isArray(data) ? data : (data.events || []);

    if (!cache.value[sessionId]) {
      cache.value[sessionId] = { timestamp: Date.now() };
    }
    cache.value[sessionId].events = events;
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
