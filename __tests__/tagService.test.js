const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const TagService = require('../src/server/services/tagService');

describe('TagService', () => {
  let tmpDir;
  let sessionDir;
  let tagService;
  let originalHomeDir;

  beforeEach(async () => {
    // Create temporary directory for testing
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tag-service-test-'));
    sessionDir = path.join(tmpDir, 'test-session');
    await fs.mkdir(sessionDir, { recursive: true });

    // Mock homedir to use our temp directory
    originalHomeDir = os.homedir;
    os.homedir = () => tmpDir;

    // Create TagService instance (it will use mocked homedir)
    tagService = new TagService();
  });

  afterEach(async () => {
    // Restore original homedir
    os.homedir = originalHomeDir;

    // Clean up temp directory
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  describe('getSessionTags', () => {
    it('should return empty array when session directory does not exist', async () => {
      const session = { directory: path.join(tmpDir, 'non-existent-session') };
      const tags = await tagService.getSessionTags(session);

      expect(tags).toEqual([]);
    });

    it('should return empty array when tags.json does not exist', async () => {
      const session = { directory: sessionDir };
      const tags = await tagService.getSessionTags(session);

      expect(tags).toEqual([]);
    });

    it('should return tags from tags.json file', async () => {
      const session = { directory: sessionDir };
      const expectedTags = ['bug', 'feature', 'urgent'];

      // Write tags.json
      await fs.writeFile(
        path.join(sessionDir, 'tags.json'),
        JSON.stringify(expectedTags),
        'utf8'
      );

      const tags = await tagService.getSessionTags(session);

      expect(tags).toEqual(expectedTags);
    });

    it('should return empty array when tags.json is malformed', async () => {
      const session = { directory: sessionDir };

      // Write invalid JSON
      await fs.writeFile(
        path.join(sessionDir, 'tags.json'),
        'invalid json content',
        'utf8'
      );

      const tags = await tagService.getSessionTags(session);

      expect(tags).toEqual([]);
    });

    it('should fallback to central location when session has no directory or filePath', async () => {
      const session = { id: 'test-session' };

      const tags = await tagService.getSessionTags(session);
      expect(tags).toEqual([]);
    });
  });

  describe('setSessionTags', () => {
    it('should write tags to session directory', async () => {
      const session = { directory: sessionDir };
      const tags = ['bug', 'feature'];

      const savedTags = await tagService.setSessionTags(session, tags);

      expect(savedTags).toEqual(['bug', 'feature']);

      // Verify file was written
      const content = await fs.readFile(
        path.join(sessionDir, 'tags.json'),
        'utf8'
      );
      expect(JSON.parse(content)).toEqual(['bug', 'feature']);
    });

    it('should normalize tags to lowercase', async () => {
      const session = { directory: sessionDir };
      const tags = ['BUG', 'Feature', 'URGENT'];

      const savedTags = await tagService.setSessionTags(session, tags);

      expect(savedTags).toEqual(['bug', 'feature', 'urgent']);
    });

    it('should trim whitespace from tags', async () => {
      const session = { directory: sessionDir };
      const tags = ['  bug  ', ' feature ', 'urgent'];

      const savedTags = await tagService.setSessionTags(session, tags);

      expect(savedTags).toEqual(['bug', 'feature', 'urgent']);
    });

    it('should truncate tags longer than 30 characters', async () => {
      const session = { directory: sessionDir };
      const longTag = 'a'.repeat(50);
      const tags = [longTag];

      const savedTags = await tagService.setSessionTags(session, tags);

      expect(savedTags[0]).toHaveLength(30);
      expect(savedTags[0]).toBe('a'.repeat(30));
    });

    it('should remove duplicate tags', async () => {
      const session = { directory: sessionDir };
      const tags = ['bug', 'feature', 'BUG', 'Feature', 'urgent'];

      const savedTags = await tagService.setSessionTags(session, tags);

      expect(savedTags).toEqual(['bug', 'feature', 'urgent']);
    });

    it('should filter out empty tags', async () => {
      const session = { directory: sessionDir };
      const tags = ['bug', '', '  ', 'feature'];

      const savedTags = await tagService.setSessionTags(session, tags);

      expect(savedTags).toEqual(['bug', 'feature']);
    });

    it('should throw error when tags is not an array', async () => {
      const session = { directory: sessionDir };

      await expect(tagService.setSessionTags(session, 'not-an-array'))
        .rejects.toThrow('Tags must be an array');
    });

    it('should throw error when more than 10 tags provided', async () => {
      const session = { directory: sessionDir };
      const tags = Array.from({ length: 11 }, (_, i) => `tag${i}`);

      await expect(tagService.setSessionTags(session, tags))
        .rejects.toThrow('Maximum 10 tags per session');
    });

    it('should allow exactly 10 tags', async () => {
      const session = { directory: sessionDir };
      const tags = Array.from({ length: 10 }, (_, i) => `tag${i}`);

      const savedTags = await tagService.setSessionTags(session, tags);

      expect(savedTags).toHaveLength(10);
    });

    it('should automatically create ~/.session-viewer/ directory', async () => {
      const session = { directory: sessionDir };
      const tags = ['test'];

      // Ensure the directory doesn't exist
      const viewerDir = path.join(tmpDir, '.session-viewer');
      try {
        await fs.access(viewerDir);
        await fs.rm(viewerDir, { recursive: true });
      } catch (err) {
        // Directory doesn't exist, which is what we want
      }

      await tagService.setSessionTags(session, tags);

      // Verify directory was created
      const stats = await fs.stat(viewerDir);
      expect(stats.isDirectory()).toBe(true);
    });

    it('should update known-tags.json with new tags', async () => {
      const session = { directory: sessionDir };
      const tags = ['bug', 'feature'];

      await tagService.setSessionTags(session, tags);

      const knownTags = await tagService.getAllKnownTags();
      expect(knownTags).toEqual(expect.arrayContaining(['bug', 'feature']));
    });

    it('should deduplicate tags in known-tags.json', async () => {
      const session = { directory: sessionDir };

      // Set tags first time
      await tagService.setSessionTags(session, ['bug', 'feature']);

      // Set overlapping tags second time
      await tagService.setSessionTags(session, ['bug', 'urgent']);

      const knownTags = await tagService.getAllKnownTags();

      // Should have unique tags
      const bugCount = knownTags.filter(t => t === 'bug').length;
      expect(bugCount).toBe(1);
      expect(knownTags).toEqual(expect.arrayContaining(['bug', 'feature', 'urgent']));
    });

    it('should remove tags.json when setting empty tags array', async () => {
      const session = { directory: sessionDir };
      const tagsFilePath = path.join(sessionDir, 'tags.json');

      // First, create a tags file
      await tagService.setSessionTags(session, ['bug']);
      let fileExists = true;
      try {
        await fs.access(tagsFilePath);
      } catch (err) {
        fileExists = false;
      }
      expect(fileExists).toBe(true);

      // Now set empty tags
      await tagService.setSessionTags(session, []);

      // Verify file was removed
      fileExists = true;
      try {
        await fs.access(tagsFilePath);
      } catch (err) {
        fileExists = false;
      }
      expect(fileExists).toBe(false);
    });

    it('should handle tags that become empty after normalization', async () => {
      const session = { directory: sessionDir };
      const tags = ['  ', '', '   '];

      const savedTags = await tagService.setSessionTags(session, tags);

      expect(savedTags).toEqual([]);

      // Verify tags.json was removed or not created
      let fileExists = true;
      try {
        await fs.access(path.join(sessionDir, 'tags.json'));
      } catch (err) {
        fileExists = false;
      }
      expect(fileExists).toBe(false);
    });
  });

  describe('getAllKnownTags', () => {
    it('should return empty array when known-tags.json does not exist', async () => {
      const tags = await tagService.getAllKnownTags();

      expect(tags).toEqual([]);
    });

    it('should return sorted tags from known-tags.json', async () => {
      const knownTags = ['urgent', 'bug', 'feature', 'enhancement'];

      // Write known-tags.json
      const viewerDir = path.join(tmpDir, '.session-viewer');
      await fs.mkdir(viewerDir, { recursive: true });
      await fs.writeFile(
        path.join(viewerDir, 'known-tags.json'),
        JSON.stringify(knownTags),
        'utf8'
      );

      const tags = await tagService.getAllKnownTags();

      expect(tags).toEqual(['bug', 'enhancement', 'feature', 'urgent']);
    });

    it('should create known-tags.json if it does not exist', async () => {
      await tagService.getAllKnownTags();

      const knownTagsPath = path.join(tmpDir, '.session-viewer', 'known-tags.json');
      const content = await fs.readFile(knownTagsPath, 'utf8');

      expect(JSON.parse(content)).toEqual([]);
    });

    it('should return empty array if known-tags.json is malformed', async () => {
      const viewerDir = path.join(tmpDir, '.session-viewer');
      await fs.mkdir(viewerDir, { recursive: true });
      await fs.writeFile(
        path.join(viewerDir, 'known-tags.json'),
        'invalid json',
        'utf8'
      );

      const tags = await tagService.getAllKnownTags();

      expect(tags).toEqual([]);
    });
  });

  describe('normalizeTag', () => {
    it('should convert to lowercase', () => {
      expect(tagService.normalizeTag('BUG')).toBe('bug');
      expect(tagService.normalizeTag('Feature')).toBe('feature');
    });

    it('should trim whitespace', () => {
      expect(tagService.normalizeTag('  bug  ')).toBe('bug');
      expect(tagService.normalizeTag(' feature ')).toBe('feature');
    });

    it('should truncate to 30 characters', () => {
      const longTag = 'a'.repeat(50);
      expect(tagService.normalizeTag(longTag)).toHaveLength(30);
      expect(tagService.normalizeTag(longTag)).toBe('a'.repeat(30));
    });

    it('should handle combination of transformations', () => {
      const tag = '  ' + 'B'.repeat(40) + '  ';
      expect(tagService.normalizeTag(tag)).toBe('b'.repeat(30));
    });
  });

  describe('addSessionTags', () => {
    it('should add new tags to existing tags', async () => {
      const session = { directory: sessionDir };

      // Set initial tags
      await tagService.setSessionTags(session, ['bug', 'feature']);

      // Add more tags
      const result = await tagService.addSessionTags(session, ['urgent', 'hotfix']);

      expect(result).toEqual(['bug', 'feature', 'urgent', 'hotfix']);
    });

    it('should deduplicate when adding existing tags', async () => {
      const session = { directory: sessionDir };

      await tagService.setSessionTags(session, ['bug', 'feature']);
      const result = await tagService.addSessionTags(session, ['bug', 'urgent']);

      expect(result).toEqual(['bug', 'feature', 'urgent']);
    });

    it('should respect max 10 tags limit', async () => {
      const session = { directory: sessionDir };

      await tagService.setSessionTags(session, Array.from({ length: 8 }, (_, i) => `tag${i}`));

      await expect(
        tagService.addSessionTags(session, ['tag8', 'tag9', 'tag10'])
      ).rejects.toThrow('Maximum 10 tags per session');
    });
  });

  describe('removeSessionTags', () => {
    it('should remove specified tags', async () => {
      const session = { directory: sessionDir };

      await tagService.setSessionTags(session, ['bug', 'feature', 'urgent']);
      const result = await tagService.removeSessionTags(session, ['bug', 'urgent']);

      expect(result).toEqual(['feature']);
    });

    it('should handle case-insensitive removal', async () => {
      const session = { directory: sessionDir };

      await tagService.setSessionTags(session, ['bug', 'feature', 'urgent']);
      const result = await tagService.removeSessionTags(session, ['BUG', 'URGENT']);

      expect(result).toEqual(['feature']);
    });

    it('should handle removing non-existent tags gracefully', async () => {
      const session = { directory: sessionDir };

      await tagService.setSessionTags(session, ['bug', 'feature']);
      const result = await tagService.removeSessionTags(session, ['urgent', 'hotfix']);

      expect(result).toEqual(['bug', 'feature']);
    });
  });

  describe('getMultipleSessionTags', () => {
    it('should return tags for multiple sessions', async () => {
      const session1Dir = path.join(tmpDir, 'session1');
      const session2Dir = path.join(tmpDir, 'session2');
      await fs.mkdir(session1Dir, { recursive: true });
      await fs.mkdir(session2Dir, { recursive: true });

      const session1 = { id: 'session1', directory: session1Dir };
      const session2 = { id: 'session2', directory: session2Dir };

      await tagService.setSessionTags(session1, ['bug']);
      await tagService.setSessionTags(session2, ['feature']);

      const result = await tagService.getMultipleSessionTags([session1, session2]);

      expect(result).toEqual({
        session1: ['bug'],
        session2: ['feature']
      });
    });

    it('should return empty arrays for sessions without tags', async () => {
      const session1Dir = path.join(tmpDir, 'session1');
      await fs.mkdir(session1Dir, { recursive: true });

      const session1 = { id: 'session1', directory: session1Dir };

      const result = await tagService.getMultipleSessionTags([session1]);

      expect(result).toEqual({
        session1: []
      });
    });
  });

  describe('updateKnownTags', () => {
    it('should merge new tags with existing known tags', async () => {
      // Set up existing known tags
      const viewerDir = path.join(tmpDir, '.session-viewer');
      await fs.mkdir(viewerDir, { recursive: true });
      await fs.writeFile(
        path.join(viewerDir, 'known-tags.json'),
        JSON.stringify(['existing1', 'existing2']),
        'utf8'
      );

      await tagService.updateKnownTags(['new1', 'new2']);

      const knownTags = await tagService.getAllKnownTags();
      expect(knownTags).toEqual(expect.arrayContaining([
        'existing1', 'existing2', 'new1', 'new2'
      ]));
    });

    it('should deduplicate when updating', async () => {
      const viewerDir = path.join(tmpDir, '.session-viewer');
      await fs.mkdir(viewerDir, { recursive: true });
      await fs.writeFile(
        path.join(viewerDir, 'known-tags.json'),
        JSON.stringify(['bug', 'feature']),
        'utf8'
      );

      await tagService.updateKnownTags(['bug', 'urgent']);

      const knownTags = await tagService.getAllKnownTags();
      const bugCount = knownTags.filter(t => t === 'bug').length;

      expect(bugCount).toBe(1);
      expect(knownTags).toEqual(expect.arrayContaining(['bug', 'feature', 'urgent']));
    });
  });
});
