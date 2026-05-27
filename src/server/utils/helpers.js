/**
 * Helper utilities for server routes
 */

/**
 * Build metadata object from session
 * @param {Session} session - Session model instance
 * @returns {Object} Metadata object
 */
function buildMetadata(session) {
  const json = session.toJSON ? session.toJSON() : {};
  return {
    type: session.type,
    source: session.source, // 'copilot' or 'claude'
    sourceName: json.sourceName || session.source,
    sourceBadgeClass: json.sourceBadgeClass || 'source-unknown',
    summary: session.summary,
    model: session.selectedModel || session.model,
    repo: session.workspace?.repository,
    branch: session.workspace?.branch,
    cwd: session.workspace?.cwd,
    created: session.createdAt,
    updated: session.updatedAt,
    copilotVersion: session.copilotVersion,
    modernizeVersion: session.modernizeVersion,
    agentName: session.agentName,
    sessionStatus: session.sessionStatus
  };
}

/**
 * Validate session ID to prevent path traversal
 * @param {string} sessionId - Session identifier
 * @returns {boolean} True if valid
 */
function isValidSessionId(sessionId) {
  // Allow alphanumeric, underscore, and hyphen (common in UUIDs and session IDs)
  // Length limit prevents abuse
  return typeof sessionId === 'string' && 
         /^[a-zA-Z0-9_-]+$/.test(sessionId) && 
         sessionId.length < 256;
}

/**
 * Validate UUID v4 format
 * @param {string} id
 * @returns {boolean}
 */
function isValidUuidV4(id) {
  return typeof id === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
}

module.exports = {
  buildMetadata,
  isValidSessionId,
  isValidUuidV4
};
