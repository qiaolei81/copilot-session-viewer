const fs = require('fs').promises;
const path = require('path');
const os = require('os');

/**
 * Service for managing session tags
 * - Per-session tags: stored in {session.directory}/tags.json as ["tag1", "tag2"]
 * - Global known tags: stored in ~/.session-viewer/known-tags.json as ["tag1", "tag2", ...]
 */
class TagService {
  constructor() {
    this.knownTagsDir = path.join(os.homedir(), '.session-viewer');
    this.knownTagsFilePath = path.join(this.knownTagsDir, 'known-tags.json');
  }

  /**
   * Ensure known-tags directory and file exist
   */
  async ensureKnownTagsFile() {
    try {
      await fs.access(this.knownTagsFilePath);
    } catch (err) {
      // File doesn't exist, create directory and empty array
      await fs.mkdir(this.knownTagsDir, { recursive: true });
      await fs.writeFile(this.knownTagsFilePath, JSON.stringify([]), 'utf8');
    }
  }

  /**
   * Read known tags from global file
   * @returns {Promise<string[]>} Array of known tags
   */
  async readKnownTagsFile() {
    await this.ensureKnownTagsFile();
    try {
      const content = await fs.readFile(this.knownTagsFilePath, 'utf8');
      return JSON.parse(content);
    } catch (err) {
      console.error('Error reading known tags file:', err);
      return [];
    }
  }

  /**
   * Write known tags to global file
   * @param {string[]} tags - Array of known tags
   */
  async writeKnownTagsFile(tags) {
    await this.ensureKnownTagsFile();
    await fs.writeFile(this.knownTagsFilePath, JSON.stringify(tags, null, 2), 'utf8');
  }

  /**
   * Get tags file path for a session
   * @param {Session} session - Session object with directory field
   * @returns {string} Path to tags.json
   */
  getSessionTagsFilePath(session) {
    // File-based sessions (e.g. Claude .jsonl): per-file tags to avoid sharing
    if (session.filePath) {
      const dir = path.dirname(session.filePath);
      const base = path.basename(session.filePath, path.extname(session.filePath));
      return path.join(dir, `${base}.tags.json`);
    }
    // Directory-based sessions (e.g. Copilot CLI): tags.json inside session dir
    if (session.directory) {
      return path.join(session.directory, 'tags.json');
    }
    // Fallback: store in central location by session id
    return path.join(this.knownTagsDir, 'session-tags', `${session.id}.tags.json`);
  }

  /**
   * Normalize tag name (lowercase, trim, max 30 chars)
   * @param {string} tag - Tag name
   * @returns {string} Normalized tag
   */
  normalizeTag(tag) {
    return tag.trim().toLowerCase().substring(0, 30);
  }

  /**
   * Get all known tags for autocomplete
   * @returns {Promise<string[]>} Array of unique tags
   */
  async getAllKnownTags() {
    const tags = await this.readKnownTagsFile();
    return tags.sort();
  }

  /**
   * Get tags for a specific session
   * @param {Session} session - Session object with directory field
   * @returns {Promise<string[]>} Array of tags
   */
  async getSessionTags(session) {
    const tagsFilePath = this.getSessionTagsFilePath(session);

    try {
      await fs.access(tagsFilePath);
      const content = await fs.readFile(tagsFilePath, 'utf8');
      return JSON.parse(content);
    } catch (err) {
      // File doesn't exist or can't be read, return empty array
      return [];
    }
  }

  /**
   * Set tags for a specific session
   * @param {Session} session - Session object with directory field
   * @param {string[]} tags - Array of tag names
   * @returns {Promise<string[]>} Normalized and saved tags
   */
  async setSessionTags(session, tags) {
    if (!Array.isArray(tags)) {
      throw new Error('Tags must be an array');
    }

    // Normalize tags (lowercase, trim, max 30 chars)
    const normalizedTags = tags
      .map(tag => this.normalizeTag(tag))
      .filter(tag => tag.length > 0)
      .filter((tag, index, self) => self.indexOf(tag) === index); // Remove duplicates

    // Enforce max 10 tags per session
    if (normalizedTags.length > 10) {
      throw new Error('Maximum 10 tags per session');
    }

    const tagsFilePath = this.getSessionTagsFilePath(session);

    if (normalizedTags.length === 0) {
      // Remove tags file if no tags
      try {
        await fs.unlink(tagsFilePath);
      } catch (err) {
        // File doesn't exist, ignore
      }
    } else {
      // Ensure directory exists for tags file
      await fs.mkdir(path.dirname(tagsFilePath), { recursive: true });
      // Write tags to session directory
      await fs.writeFile(tagsFilePath, JSON.stringify(normalizedTags, null, 2), 'utf8');

      // Update known tags (append and deduplicate)
      await this.updateKnownTags(normalizedTags);
    }

    return normalizedTags;
  }

  /**
   * Update known tags by appending new tags and deduplicating
   * @param {string[]} newTags - New tags to add to known tags
   */
  async updateKnownTags(newTags) {
    const knownTags = await this.readKnownTagsFile();
    const allTags = [...knownTags, ...newTags];
    const uniqueTags = [...new Set(allTags)];
    await this.writeKnownTagsFile(uniqueTags);
  }

  /**
   * Add tags to a session (merge with existing)
   * @param {Session} session - Session object with directory field
   * @param {string[]} newTags - Tags to add
   * @returns {Promise<string[]>} Updated tags array
   */
  async addSessionTags(session, newTags) {
    const existingTags = await this.getSessionTags(session);
    const mergedTags = [...existingTags, ...newTags];
    return await this.setSessionTags(session, mergedTags);
  }

  /**
   * Remove tags from a session
   * @param {Session} session - Session object with directory field
   * @param {string[]} tagsToRemove - Tags to remove
   * @returns {Promise<string[]>} Updated tags array
   */
  async removeSessionTags(session, tagsToRemove) {
    const existingTags = await this.getSessionTags(session);
    const normalizedToRemove = tagsToRemove.map(tag => this.normalizeTag(tag));
    const updatedTags = existingTags.filter(tag => !normalizedToRemove.includes(tag));
    return await this.setSessionTags(session, updatedTags);
  }

  /**
   * Get tags for multiple sessions (batch)
   * @param {Session[]} sessions - Array of session objects
   * @returns {Promise<Object>} Map of sessionId -> tags array
   */
  async getMultipleSessionTags(sessions) {
    const result = {};

    for (const session of sessions) {
      result[session.id] = await this.getSessionTags(session);
    }

    return result;
  }
}

module.exports = TagService;
