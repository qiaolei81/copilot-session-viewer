const fs = require('fs').promises;
const path = require('path');
const os = require('os');

/**
 * Service for managing session tags stored in ~/.copilot/tags.json
 * Format: { "sessionId": ["tag1", "tag2"] }
 */
class TagService {
  constructor() {
    this.tagsFilePath = path.join(os.homedir(), '.copilot', 'tags.json');
  }

  /**
   * Ensure tags file exists
   */
  async ensureTagsFile() {
    try {
      await fs.access(this.tagsFilePath);
    } catch (err) {
      // File doesn't exist, create empty object
      const dir = path.dirname(this.tagsFilePath);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(this.tagsFilePath, JSON.stringify({}), 'utf8');
    }
  }

  /**
   * Read all tags from file
   * @returns {Promise<Object>} Map of sessionId -> tags array
   */
  async readTagsFile() {
    await this.ensureTagsFile();
    try {
      const content = await fs.readFile(this.tagsFilePath, 'utf8');
      return JSON.parse(content);
    } catch (err) {
      console.error('Error reading tags file:', err);
      return {};
    }
  }

  /**
   * Write tags to file
   * @param {Object} tagsData - Map of sessionId -> tags array
   */
  async writeTagsFile(tagsData) {
    await this.ensureTagsFile();
    await fs.writeFile(this.tagsFilePath, JSON.stringify(tagsData, null, 2), 'utf8');
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
   * Get all unique tags across all sessions
   * @returns {Promise<string[]>} Array of unique tags
   */
  async getAllTags() {
    const tagsData = await this.readTagsFile();
    const allTags = new Set();

    Object.values(tagsData).forEach(tags => {
      if (Array.isArray(tags)) {
        tags.forEach(tag => allTags.add(tag));
      }
    });

    return Array.from(allTags).sort();
  }

  /**
   * Get tags for a specific session
   * @param {string} sessionId - Session ID
   * @returns {Promise<string[]>} Array of tags
   */
  async getSessionTags(sessionId) {
    const tagsData = await this.readTagsFile();
    return tagsData[sessionId] || [];
  }

  /**
   * Set tags for a specific session
   * @param {string} sessionId - Session ID
   * @param {string[]} tags - Array of tag names
   * @returns {Promise<string[]>} Normalized and saved tags
   */
  async setSessionTags(sessionId, tags) {
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

    const tagsData = await this.readTagsFile();

    if (normalizedTags.length === 0) {
      // Remove session entry if no tags
      delete tagsData[sessionId];
    } else {
      tagsData[sessionId] = normalizedTags;
    }

    await this.writeTagsFile(tagsData);
    return normalizedTags;
  }

  /**
   * Add tags to a session (merge with existing)
   * @param {string} sessionId - Session ID
   * @param {string[]} newTags - Tags to add
   * @returns {Promise<string[]>} Updated tags array
   */
  async addSessionTags(sessionId, newTags) {
    const existingTags = await this.getSessionTags(sessionId);
    const mergedTags = [...existingTags, ...newTags];
    return await this.setSessionTags(sessionId, mergedTags);
  }

  /**
   * Remove tags from a session
   * @param {string} sessionId - Session ID
   * @param {string[]} tagsToRemove - Tags to remove
   * @returns {Promise<string[]>} Updated tags array
   */
  async removeSessionTags(sessionId, tagsToRemove) {
    const existingTags = await this.getSessionTags(sessionId);
    const normalizedToRemove = tagsToRemove.map(tag => this.normalizeTag(tag));
    const updatedTags = existingTags.filter(tag => !normalizedToRemove.includes(tag));
    return await this.setSessionTags(sessionId, updatedTags);
  }

  /**
   * Get tags for multiple sessions (batch)
   * @param {string[]} sessionIds - Array of session IDs
   * @returns {Promise<Object>} Map of sessionId -> tags array
   */
  async getMultipleSessionTags(sessionIds) {
    const tagsData = await this.readTagsFile();
    const result = {};

    sessionIds.forEach(sessionId => {
      result[sessionId] = tagsData[sessionId] || [];
    });

    return result;
  }
}

module.exports = TagService;
