const fs = require('fs').promises;
const fsSync = require('fs');
const readline = require('readline');

/**
 * File utility functions
 */

/**
 * Check if a file exists
 * @param {string} filePath - File path
 * @returns {Promise<boolean>}
 */
async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Count lines in a file (non-empty lines only)
 * @param {string} filePath - File path
 * @returns {Promise<number>}
 */
async function countLines(filePath) {
  try {
    const stream = fsSync.createReadStream(filePath, { encoding: 'utf-8' });
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
    let count = 0;
    for await (const line of rl) {
      if (line.trim()) count++;
    }
    return count;
  } catch (err) {
    console.error(`Error counting lines in ${filePath}:`, err.message);
    return 0;
  }
}

/**
 * Read and parse YAML file (simple key: value format)
 * @param {string} filePath - YAML file path
 * @returns {Promise<object>}
 */
async function parseYAML(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const lines = content.split('\n');
    const result = {};

    for (const line of lines) {
      const match = line.match(/^(\w+):\s*(.+)$/);
      if (match) {
        result[match[1]] = match[2].trim();
      }
    }

    return result;
  } catch (err) {
    console.error(`Error parsing YAML ${filePath}:`, err.message);
    return {};
  }
}

/**
 * Efficiently read session metadata in a single pass
 * Combines getFirstUserMessage, getSessionDuration, getSessionMetadata
 * @param {string} filePath - Path to .jsonl file
 * @param {number} maxMessageLength - Max characters for first message (default 200)
 * @returns {Promise<Object>} Combined metadata object
 */
async function getSessionMetadataOptimized(filePath, maxMessageLength = 200) {
  try {
    const stream = fsSync.createReadStream(filePath, { encoding: 'utf-8' });
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

    let firstUserMessage = '';
    let firstTimestamp = null;
    let lastTimestamp = null;
    let copilotVersion = null;
    let selectedModel = null;

    for await (const line of rl) {
      if (!line.trim()) continue;

      try {
        const event = JSON.parse(line);

        // Extract timestamp for duration calculation
        if (event.timestamp) {
          const ts = new Date(event.timestamp).getTime();
          if (!isNaN(ts)) {
            if (!firstTimestamp) firstTimestamp = ts;
            lastTimestamp = ts;
          }
        }

        // Get first user message
        if (!firstUserMessage && event.type === 'user.message') {
          const msg = event.data?.message || event.data?.content || event.data?.text || '';
          if (msg) {
            firstUserMessage = msg.length > maxMessageLength ? msg.substring(0, maxMessageLength) + '...' : msg;
          }
        }

        // Get copilot version from session start
        if (event.type === 'session.start' && event.data?.copilotVersion && !copilotVersion) {
          copilotVersion = event.data.copilotVersion;
        }

        // Get selected model
        if ((event.type === 'session.start' || event.type === 'session.model_change') && !selectedModel) {
          if (event.data?.selectedModel) {
            selectedModel = event.data.selectedModel;
          } else if (event.data?.newModel) {
            selectedModel = event.data.newModel;
          } else if (event.data?.model) {
            selectedModel = event.data.model;
          }
        }
      } catch {
        // Skip malformed JSON lines
      }
    }

    rl.close();
    stream.destroy();

    // Calculate duration
    const duration = firstTimestamp && lastTimestamp && lastTimestamp > firstTimestamp
      ? lastTimestamp - firstTimestamp
      : null;

    return {
      firstUserMessage: firstUserMessage || '',
      duration,
      copilotVersion: copilotVersion || null,
      selectedModel: selectedModel || null
    };
  } catch (err) {
    console.error(`Error reading session metadata from ${filePath}:`, err.message);
    return {
      firstUserMessage: '',
      duration: null,
      copilotVersion: null,
      selectedModel: null
    };
  }
}

/**
 * Get the first user message from a .jsonl events file
 * Reads line by line and stops at the first user.message event
 * @param {string} filePath - Path to .jsonl file
 * @param {number} maxLength - Max characters to return (default 200)
 * @returns {Promise<string>} First user message or empty string
 */
async function getFirstUserMessage(filePath, maxLength = 200) {
  try {
    const stream = fsSync.createReadStream(filePath, { encoding: 'utf-8' });
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

    for await (const line of rl) {
      if (!line.trim()) continue;
      try {
        const event = JSON.parse(line);
        if (event.type === 'user.message') {
          const msg = event.data?.message || event.data?.content || event.data?.text || '';
          if (msg) {
            rl.close();
            stream.destroy();
            return msg.length > maxLength ? msg.substring(0, maxLength) + '...' : msg;
          }
        }
      } catch {
        // Skip malformed JSON lines
      }
    }
    return '';
  } catch (_err) {
    return '';
  }
}

/**
 * Get session duration by reading first and last event timestamps
 * @param {string} filePath - Path to .jsonl events file
 * @returns {Promise<number|null>} Duration in milliseconds, or null if unable to calculate
 */
async function getSessionDuration(filePath) {
  try {
    const stream = fsSync.createReadStream(filePath, { encoding: 'utf-8' });
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

    let firstTimestamp = null;
    let lastTimestamp = null;

    for await (const line of rl) {
      if (!line.trim()) continue;
      try {
        const event = JSON.parse(line);
        if (event.timestamp) {
          const ts = new Date(event.timestamp).getTime();
          if (!firstTimestamp) {
            firstTimestamp = ts;
          }
          lastTimestamp = ts;
        }
      } catch {
        // Skip malformed JSON lines
      }
    }

    if (firstTimestamp && lastTimestamp && lastTimestamp >= firstTimestamp) {
      return lastTimestamp - firstTimestamp;
    }
    return null;
  } catch (err) {
    console.error(`Error calculating session duration for ${filePath}:`, err.message);
    return null;
  }
}

/**
 * Get session metadata from session.start event
 * @param {string} filePath - Path to .jsonl events file
 * @returns {Promise<{copilotVersion: string|null, selectedModel: string|null}>}
 */
async function getSessionMetadata(filePath) {
  try {
    const stream = fsSync.createReadStream(filePath, { encoding: 'utf-8' });
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

    let copilotVersion = null;
    let selectedModel = null;

    for await (const line of rl) {
      if (!line.trim()) continue;
      try {
        const event = JSON.parse(line);
        
        // Extract copilotVersion and selectedModel from session.start
        if (event.type === 'session.start' && event.data) {
          copilotVersion = event.data.copilotVersion || null;
          selectedModel = event.data.selectedModel || null;
          
          // If we have selectedModel, we're done
          if (selectedModel) {
            rl.close();
            stream.destroy();
            return { copilotVersion, selectedModel };
          }
        }
        
        // If no selectedModel in session.start, check for model_change
        if (!selectedModel && event.type === 'session.model_change' && event.data) {
          selectedModel = event.data.newModel || null;
          rl.close();
          stream.destroy();
          return { copilotVersion, selectedModel };
        }
      } catch {
        // Skip malformed JSON lines
      }
    }
    return { copilotVersion, selectedModel };
  } catch (err) {
    console.error(`Error reading session metadata from ${filePath}:`, err.message);
    return { copilotVersion: null, selectedModel: null };
  }
}

/**
 * Check if entry should be skipped
 * @param {string} entry - Directory/file name
 * @returns {boolean}
 */
function shouldSkipEntry(entry) {
  return entry === '.DS_Store' || entry.startsWith('.');
}

module.exports = {
  fileExists,
  countLines,
  parseYAML,
  getFirstUserMessage,
  getSessionDuration,
  getSessionMetadata,
  getSessionMetadataOptimized, // New optimized function
  shouldSkipEntry
};
