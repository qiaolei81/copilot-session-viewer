const fs = require('fs').promises;
const path = require('path');
const { fileExists, countLines, parseYAML, shouldSkipEntry } = require('../src/fileUtils');

// Create temp directory for testing
const TMP_DIR = path.join(__dirname, 'tmp');

beforeAll(async () => {
  await fs.mkdir(TMP_DIR, { recursive: true });
});

afterAll(async () => {
  await fs.rm(TMP_DIR, { recursive: true, force: true });
});

describe('fileUtils', () => {
  describe('fileExists', () => {
    it('should return true for existing file', async () => {
      const testFile = path.join(TMP_DIR, 'exists.txt');
      await fs.writeFile(testFile, 'test');
      
      const result = await fileExists(testFile);
      expect(result).toBe(true);
    });

    it('should return false for non-existing file', async () => {
      const testFile = path.join(TMP_DIR, 'does-not-exist.txt');
      const result = await fileExists(testFile);
      expect(result).toBe(false);
    });
  });

  describe('countLines', () => {
    it('should count non-empty lines', async () => {
      const testFile = path.join(TMP_DIR, 'lines.txt');
      await fs.writeFile(testFile, 'line1\nline2\n\nline3\n');
      
      const result = await countLines(testFile);
      expect(result).toBe(3);
    });

    it('should return 0 for empty file', async () => {
      const testFile = path.join(TMP_DIR, 'empty.txt');
      await fs.writeFile(testFile, '');
      
      const result = await countLines(testFile);
      expect(result).toBe(0);
    });

    it('should return 0 for non-existing file', async () => {
      const testFile = path.join(TMP_DIR, 'does-not-exist.txt');
      const result = await countLines(testFile);
      expect(result).toBe(0);
    });

    it('should ignore lines with only whitespace', async () => {
      const testFile = path.join(TMP_DIR, 'whitespace.txt');
      await fs.writeFile(testFile, 'line1\n  \n\t\nline2\n');
      
      const result = await countLines(testFile);
      expect(result).toBe(2);
    });
  });

  describe('parseYAML', () => {
    it('should parse simple key-value YAML', async () => {
      const testFile = path.join(TMP_DIR, 'test.yaml');
      await fs.writeFile(testFile, 'key1: value1\nkey2: value2\n');
      
      const result = await parseYAML(testFile);
      expect(result).toEqual({
        key1: 'value1',
        key2: 'value2'
      });
    });

    it('should ignore invalid lines', async () => {
      const testFile = path.join(TMP_DIR, 'invalid.yaml');
      await fs.writeFile(testFile, 'key1: value1\ninvalid line\nkey2: value2\n');
      
      const result = await parseYAML(testFile);
      expect(result).toEqual({
        key1: 'value1',
        key2: 'value2'
      });
    });

    it('should return empty object for non-existing file', async () => {
      const testFile = path.join(TMP_DIR, 'does-not-exist.yaml');
      const result = await parseYAML(testFile);
      expect(result).toEqual({});
    });

    it('should trim values', async () => {
      const testFile = path.join(TMP_DIR, 'trim.yaml');
      await fs.writeFile(testFile, 'key1:   value with spaces   \n');
      
      const result = await parseYAML(testFile);
      expect(result).toEqual({
        key1: 'value with spaces'
      });
    });
  });

  describe('shouldSkipEntry', () => {
    it('should skip .DS_Store', () => {
      expect(shouldSkipEntry('.DS_Store')).toBe(true);
    });

    it('should skip hidden files', () => {
      expect(shouldSkipEntry('.hidden')).toBe(true);
      expect(shouldSkipEntry('.git')).toBe(true);
    });

    it('should not skip normal files', () => {
      expect(shouldSkipEntry('session-id')).toBe(false);
      expect(shouldSkipEntry('test.jsonl')).toBe(false);
    });
  });
});
