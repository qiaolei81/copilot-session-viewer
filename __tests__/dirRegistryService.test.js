const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const DirRegistryService = require('../src/server/services/dirRegistryService');

async function mkTmp(prefix) {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

describe('DirRegistryService', () => {
  let tmpRoot;
  let registryPath;
  let svc;
  let sampleDir;

  beforeEach(async () => {
    tmpRoot = await mkTmp('dir-reg-');
    registryPath = path.join(tmpRoot, 'registered-dirs.json');
    svc = new DirRegistryService(registryPath);
    sampleDir = path.join(tmpRoot, 'my-sessions');
    await fs.mkdir(sampleDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tmpRoot, { recursive: true, force: true });
  });

  describe('register', () => {
    test('success: returns entry and persists', async () => {
      const entry = await svc.register(sampleDir, 'My Stuff');
      expect(entry.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
      expect(entry.label).toBe('My Stuff');
      expect(entry.path).toBe(await fs.realpath(sampleDir));
      expect(entry.addedAt).toBeTruthy();

      const raw = JSON.parse(await fs.readFile(registryPath, 'utf8'));
      expect(raw[entry.id]).toEqual(entry);
    });

    test('missing path throws', async () => {
      await expect(svc.register()).rejects.toThrow(/Path is required/);
      await expect(svc.register('')).rejects.toThrow(/Path is required/);
    });

    test('non-existent path throws', async () => {
      await expect(svc.register(path.join(tmpRoot, 'nope'))).rejects.toThrow(/does not exist/);
    });

    test('file (not dir) throws', async () => {
      const file = path.join(tmpRoot, 'a-file.txt');
      await fs.writeFile(file, 'x');
      await expect(svc.register(file)).rejects.toThrow(/not a directory/);
    });

    test('label defaults to basename of realpath', async () => {
      const entry = await svc.register(sampleDir);
      expect(entry.label).toBe('my-sessions');
    });

    test('expansion of ~', async () => {
      // Create a directory inside homedir we can register via ~
      const homeSubdir = await fs.mkdtemp(path.join(os.homedir(), '.dirreg-test-'));
      try {
        const rel = '~/' + path.basename(homeSubdir);
        const entry = await svc.register(rel);
        expect(entry.path).toBe(await fs.realpath(homeSubdir));
      } finally {
        await fs.rm(homeSubdir, { recursive: true, force: true });
      }
    });

    test('file permission 0o600 on registry file', async () => {
      await svc.register(sampleDir);
      const st = await fs.stat(registryPath);
      // Mask permission bits — should equal 0o600 on POSIX
      // Skip strict check on Windows
      if (process.platform !== 'win32') {
        expect(st.mode & 0o777).toBe(0o600);
      }
    });
  });

  describe('getById', () => {
    test('returns existing', async () => {
      const e = await svc.register(sampleDir);
      const got = await svc.getById(e.id);
      expect(got).toEqual(e);
    });

    test('returns null for unknown', async () => {
      expect(await svc.getById('nope')).toBeNull();
      expect(await svc.getById(null)).toBeNull();
    });
  });

  describe('getAll', () => {
    test('empty', async () => {
      expect(await svc.getAll()).toEqual([]);
    });

    test('sorted by addedAt desc', async () => {
      const a = path.join(tmpRoot, 'a'); await fs.mkdir(a);
      const b = path.join(tmpRoot, 'b'); await fs.mkdir(b);
      const c = path.join(tmpRoot, 'c'); await fs.mkdir(c);
      const e1 = await svc.register(a);
      await new Promise(r => setTimeout(r, 5));
      const e2 = await svc.register(b);
      await new Promise(r => setTimeout(r, 5));
      const e3 = await svc.register(c);
      const all = await svc.getAll();
      expect(all.map(x => x.id)).toEqual([e3.id, e2.id, e1.id]);
    });
  });

  describe('remove', () => {
    test('existing', async () => {
      const e = await svc.register(sampleDir);
      expect(await svc.remove(e.id)).toBe(true);
      expect(await svc.getById(e.id)).toBeNull();
    });

    test('non-existent', async () => {
      expect(await svc.remove('nope')).toBe(false);
    });
  });

  describe('persistence', () => {
    test('new instance loads same data', async () => {
      const e = await svc.register(sampleDir, 'L');
      const svc2 = new DirRegistryService(registryPath);
      const got = await svc2.getById(e.id);
      expect(got).toEqual(e);
    });

    test('_load coerces non-object/missing to {}', async () => {
      await fs.writeFile(registryPath, 'null', 'utf8');
      expect(await svc.getAll()).toEqual([]);
      await fs.writeFile(registryPath, '[1,2]', 'utf8');
      expect(await svc.getAll()).toEqual([]);
      await fs.writeFile(registryPath, 'not json', 'utf8');
      expect(await svc.getAll()).toEqual([]);
    });
  });

  describe('concurrent writes serialized', () => {
    test('no last-write-wins', async () => {
      const dirs = [];
      for (let i = 0; i < 10; i++) {
        const d = path.join(tmpRoot, `c${i}`);
        await fs.mkdir(d);
        dirs.push(d);
      }
      const results = await Promise.all(dirs.map(d => svc.register(d)));
      expect(results).toHaveLength(10);
      const all = await svc.getAll();
      expect(all).toHaveLength(10);
      const ids = new Set(results.map(r => r.id));
      expect(ids.size).toBe(10);
    });
  });
});
