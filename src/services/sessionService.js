const fs = require('fs');
const path = require('path');
const os = require('os');
const { isValidSessionId, buildMetadata } = require('../utils/helpers');
const SessionRepository = require('./sessionRepository');

class SessionService {
  constructor(sessionDir) {
    this.SESSION_DIR = sessionDir || process.env.SESSION_DIR || path.join(os.homedir(), '.copilot', 'session-state');
    this.sessionRepository = new SessionRepository(this.SESSION_DIR);
  }

  async getAllSessions() {
    const sessions = await this.sessionRepository.findAll();
    return sessions.map(s => s.toJSON());
  }

  async getPaginatedSessions(page = 1, limit = 20) {
    const allSessions = await this.sessionRepository.findAll();
    const sessions = allSessions.map(s => s.toJSON());

    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedSessions = sessions.slice(startIndex, endIndex);

    return {
      sessions: paginatedSessions,
      totalSessions: sessions.length,
      currentPage: page,
      totalPages: Math.ceil(sessions.length / limit),
      hasNextPage: endIndex < sessions.length,
      hasPrevPage: page > 1
    };
  }

  async getSessionById(sessionId) {
    if (!isValidSessionId(sessionId)) {
      return null;
    }

    const sessions = await this.getAllSessions();
    return sessions.find(s => s.id === sessionId);
  }

  async getSessionEvents(sessionId) {
    if (!isValidSessionId(sessionId)) {
      return [];
    }

    const sessionPath = path.join(this.SESSION_DIR, sessionId);
    let eventsFile;

    try {
      const stats = await fs.promises.stat(sessionPath);
      if (stats.isDirectory()) {
        eventsFile = path.join(sessionPath, 'events.jsonl');
      } else {
        eventsFile = path.join(this.SESSION_DIR, `${sessionId}.jsonl`);
      }
    } catch (_err) {
      eventsFile = path.join(this.SESSION_DIR, `${sessionId}.jsonl`);
    }

    try {
      await fs.promises.access(eventsFile);
    } catch (_err) {
      return [];
    }

    try {
      const content = await fs.promises.readFile(eventsFile, 'utf-8');
      const lines = content.trim().split('\n').filter(line => line.trim());
      return lines.map((line, index) => {
        try {
          return JSON.parse(line);
        } catch (err) {
          console.error(`Error parsing line ${index + 1}:`, err.message);
          return null;
        }
      }).filter(event => event !== null);
    } catch (err) {
      console.error('Error reading events:', err);
      return [];
    }
  }

  async getSessionWithEvents(sessionId) {
    const session = await this.getSessionById(sessionId);
    if (!session) {
      return null;
    }

    const events = await this.getSessionEvents(sessionId);
    const metadata = buildMetadata(session);

    // Extract model from events
    const sessionStartEvent = events.find(e => e.type === 'session.start');
    if (sessionStartEvent?.data?.selectedModel) {
      metadata.model = sessionStartEvent.data.selectedModel;
    }

    const modelChangeEvent = events.find(e => e.type === 'session.model_change');
    if (modelChangeEvent?.data) {
      metadata.model = modelChangeEvent.data.newModel || modelChangeEvent.data.model;
    }

    // Derive "updated" from last event timestamp (more accurate than filesystem mtime)
    if (events.length) {
      const lastEvent = events[events.length - 1];
      if (lastEvent?.timestamp) {
        metadata.updated = lastEvent.timestamp;
      }
    }

    // Derive "created" from first event timestamp if available
    if (events.length) {
      const firstEvent = events[0];
      if (firstEvent?.timestamp) {
        metadata.created = firstEvent.timestamp;
      }
    }

    return { session, events, metadata };
  }
}

module.exports = SessionService;