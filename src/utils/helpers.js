/**
 * Helper utilities for server routes
 */

/**
 * Build metadata object from session
 * @param {Session} session - Session model instance
 * @returns {Object} Metadata object
 */
function buildMetadata(session) {
  return {
    type: session.type,
    summary: session.summary,
    model: session.model,
    repo: session.workspace?.repository,
    branch: session.workspace?.branch,
    cwd: session.workspace?.cwd,
    created: session.createdAt,
    updated: session.updatedAt,
    copilotVersion: session.copilotVersion,
    sessionStatus: session.sessionStatus
  };
}

/**
 * Validate session ID to prevent path traversal
 * @param {string} sessionId - Session identifier
 * @returns {boolean} True if valid
 */
function isValidSessionId(sessionId) {
  return typeof sessionId === 'string' && /^[a-zA-Z0-9_-]+$/.test(sessionId) && sessionId.length < 256;
}

module.exports = {
  buildMetadata,
  isValidSessionId
};
