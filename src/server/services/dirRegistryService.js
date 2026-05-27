const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const crypto = require('crypto');

// Single module-level promise tail to serialize writes across instances/calls.
let _writeTail = Promise.resolve();
function _serializeWrite(fn) {
  const next = _writeTail.then(fn, fn);
  _writeTail = next.catch(() => {});
  return next;
}

/**
 * Service for managing user-registered custom session directories.
 * Storage: { "<uuid-v4>": { id, label, path, addedAt } }
 */
class DirRegistryService {
  constructor(registryPath) {
    this.registryPath = registryPath
      || process.env.CUSTOM_DIRS_REGISTRY
      || path.join(os.homedir(), '.config', 'copilot-session-viewer', 'registered-dirs.json');
  }

  async _load() {
    try {
      const content = await fs.readFile(this.registryPath, 'utf8');
      const parsed = JSON.parse(content);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return {};
      }
      return parsed;
    } catch (err) {
      if (err.code === 'ENOENT') return {};
      // Corrupt JSON or unreadable — coerce to empty per spec
      return {};
    }
  }

  async _save(data) {
    const dir = path.dirname(this.registryPath);
    await fs.mkdir(dir, { recursive: true });
    const tmp = `${this.registryPath}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const payload = JSON.stringify(data, null, 2);
    await fs.writeFile(tmp, payload, { encoding: 'utf8', mode: 0o600 });
    try {
      await fs.chmod(tmp, 0o600);
    } catch {
      // best effort
    }
    await fs.rename(tmp, this.registryPath);
    try {
      await fs.chmod(this.registryPath, 0o600);
    } catch {
      // best effort
    }
  }

  _expand(rawPath) {
    if (typeof rawPath !== 'string' || rawPath.length === 0) return rawPath;
    if (rawPath === '~') return os.homedir();
    if (rawPath.startsWith('~/')) return path.join(os.homedir(), rawPath.slice(2));
    return rawPath;
  }

  async register(rawPath, label) {
    if (!rawPath || typeof rawPath !== 'string') {
      throw new Error('Path is required');
    }

    const expanded = this._expand(rawPath);

    let stat;
    try {
      stat = await fs.stat(expanded);
    } catch (err) {
      throw new Error(`Path does not exist: ${rawPath}`, { cause: err });
    }
    if (!stat.isDirectory()) {
      throw new Error(`Path is not a directory: ${rawPath}`);
    }

    let resolved;
    try {
      resolved = await fs.realpath(expanded);
    } catch (err) {
      throw new Error(`Cannot resolve path: ${rawPath}`, { cause: err });
    }

    const finalLabel = (label && String(label).trim()) || path.basename(resolved);

    const entry = {
      id: crypto.randomUUID(),
      label: finalLabel,
      path: resolved,
      addedAt: new Date().toISOString()
    };

    return _serializeWrite(async () => {
      const data = await this._load();
      data[entry.id] = entry;
      await this._save(data);
      return entry;
    });
  }

  async getById(id) {
    if (!id || typeof id !== 'string') return null;
    const data = await this._load();
    return Object.prototype.hasOwnProperty.call(data, id) ? data[id] : null;
  }

  async getAll() {
    const data = await this._load();
    return Object.values(data).sort(
      (a, b) => new Date(b.addedAt) - new Date(a.addedAt)
    );
  }

  async remove(id) {
    return _serializeWrite(async () => {
      const data = await this._load();
      if (!Object.prototype.hasOwnProperty.call(data, id)) return false;
      delete data[id];
      await this._save(data);
      return true;
    });
  }
}

module.exports = DirRegistryService;
