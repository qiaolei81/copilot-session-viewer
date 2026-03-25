/**
 * Shared utilities for Source Adapters.
 *
 * These functions are used by multiple adapters and extracted here
 * to avoid duplication. They were previously private methods on
 * SessionRepository.
 */

const fsSync = require('fs');
const readline = require('readline');

/**
 * Read the first line of a file efficiently (streams, doesn't load entire file).
 * @param {string} filePath - Absolute path to the file
 * @returns {Promise<string|null>} First trimmed line, or null if file is empty
 */
function readFirstLine(filePath) {
  return new Promise((resolve, reject) => {
    const stream = fsSync.createReadStream(filePath, { encoding: 'utf-8' });
    const rl = readline.createInterface({
      input: stream,
      crlfDelay: Infinity
    });

    let resolved = false;

    rl.on('line', (line) => {
      if (!resolved) {
        resolved = true;
        rl.close();
        resolve(line.trim());
      }
    });

    rl.on('close', () => {
      if (!resolved) {
        resolve(null);
      }
    });

    rl.on('error', (err) => {
      if (!resolved) {
        resolved = true;
        reject(err);
      }
    });

    stream.on('error', (err) => {
      if (!resolved) {
        resolved = true;
        rl.close();
        reject(err);
      }
    });
  });
}

/**
 * Compute session status from metadata.
 * A session is 'wip' if it has no session.end event AND the last event
 * was within the WIP threshold (5 minutes). Otherwise it's 'completed'.
 *
 * @param {Object} metadata - Session metadata from getSessionMetadataOptimized()
 * @param {boolean} metadata.hasSessionEnd - Whether a session.end event exists
 * @param {number|null|undefined} metadata.lastEventTime - Timestamp of last event (ms)
 * @returns {'completed'|'wip'}
 */
function computeSessionStatus(metadata) {
  if (metadata.hasSessionEnd) {
    return 'completed';
  }
  if (metadata.lastEventTime !== null && metadata.lastEventTime !== undefined) {
    const WIP_THRESHOLD_MS = 5 * 60 * 1000;
    if ((Date.now() - metadata.lastEventTime) < WIP_THRESHOLD_MS) {
      return 'wip';
    }
  }
  return 'completed';
}

module.exports = {
  readFirstLine,
  computeSessionStatus
};

