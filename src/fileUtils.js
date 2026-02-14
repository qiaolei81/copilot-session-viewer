const fs = require('fs').promises;
const path = require('path');

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
    const content = await fs.readFile(filePath, 'utf-8');
    return content.trim().split('\n').filter(line => line.trim()).length;
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
  shouldSkipEntry
};
