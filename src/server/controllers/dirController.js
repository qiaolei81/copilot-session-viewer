const DirRegistryService = require('../services/dirRegistryService');

class DirController {
  constructor(dirRegistryService = null) {
    this.dirRegistryService = dirRegistryService || new DirRegistryService();
  }

  async listDirs(req, res) {
    try {
      const dirs = await this.dirRegistryService.getAll();
      res.json(dirs);
    } catch (err) {
      console.error('Error listing registered dirs:', err);
      res.status(500).json({ error: 'Error listing registered directories' });
    }
  }

  async registerDir(req, res) {
    const body = req.body || {};
    const rawPath = body.path;
    const label = body.label;

    if (!rawPath || typeof rawPath !== 'string') {
      return res.status(400).json({ error: 'Path is required' });
    }

    try {
      const entry = await this.dirRegistryService.register(rawPath, label);
      return res.status(201).json(entry);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  }

  async removeDir(req, res) {
    const { id } = req.params;
    try {
      const removed = await this.dirRegistryService.remove(id);
      if (!removed) {
        return res.status(404).json({ error: 'Directory not found' });
      }
      return res.status(204).end();
    } catch (err) {
      console.error('Error removing registered dir:', err);
      return res.status(500).json({ error: 'Error removing directory' });
    }
  }
}

module.exports = DirController;
