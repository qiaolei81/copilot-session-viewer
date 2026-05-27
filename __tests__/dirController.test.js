const express = require('express');
const request = require('supertest');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const DirController = require('../src/server/controllers/dirController');
const DirRegistryService = require('../src/server/services/dirRegistryService');
const { isValidUuidV4 } = require('../src/server/utils/helpers');

function validateDirId(req, res, next) {
  if (!isValidUuidV4(req.params.id)) {
    return res.status(400).json({ error: 'Invalid dir id' });
  }
  next();
}

describe('DirController API', () => {
  let app;
  let tmpDir;
  let registryPath;
  let service;
  let controller;
  let sampleDir;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dir-ctrl-test-'));
    registryPath = path.join(tmpDir, 'registered-dirs.json');
    sampleDir = path.join(tmpDir, 'sessions');
    await fs.mkdir(sampleDir, { recursive: true });

    service = new DirRegistryService(registryPath);
    controller = new DirController(service);

    app = express();
    app.use(express.json());
    app.get('/api/dirs', controller.listDirs.bind(controller));
    app.post('/api/dirs', controller.registerDir.bind(controller));
    app.delete('/api/dirs/:id', validateDirId, controller.removeDir.bind(controller));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  describe('GET /api/dirs', () => {
    test('200 with empty array', async () => {
      const res = await request(app).get('/api/dirs');
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    test('200 with registered entries', async () => {
      await service.register(sampleDir, 'X');
      const res = await request(app).get('/api/dirs');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].label).toBe('X');
    });
  });

  describe('POST /api/dirs', () => {
    test('201 with body', async () => {
      const res = await request(app)
        .post('/api/dirs')
        .send({ path: sampleDir, label: 'Mine' });
      expect(res.status).toBe(201);
      expect(res.body.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(res.body.label).toBe('Mine');
      expect(res.body.path).toBe(await fs.realpath(sampleDir));
      expect(res.body.addedAt).toBeTruthy();
    });

    test('400 missing path', async () => {
      const res = await request(app).post('/api/dirs').send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Path is required/);
    });

    test('400 invalid path (does not exist)', async () => {
      const res = await request(app)
        .post('/api/dirs')
        .send({ path: path.join(tmpDir, 'nope') });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/does not exist/);
    });

    test('400 invalid path (not a directory)', async () => {
      const file = path.join(tmpDir, 'a.txt');
      await fs.writeFile(file, 'x');
      const res = await request(app).post('/api/dirs').send({ path: file });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/not a directory/);
    });
  });

  describe('DELETE /api/dirs/:id', () => {
    test('204 when removed', async () => {
      const e = await service.register(sampleDir);
      const res = await request(app).delete(`/api/dirs/${e.id}`);
      expect(res.status).toBe(204);
      expect(await service.getById(e.id)).toBeNull();
    });

    test('404 when not found', async () => {
      // valid-format uuid but no entry
      const id = '11111111-1111-4111-8111-111111111111';
      const res = await request(app).delete(`/api/dirs/${id}`);
      expect(res.status).toBe(404);
    });

    test('400 invalid uuid format', async () => {
      const res = await request(app).delete('/api/dirs/not-a-uuid');
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Invalid dir id/);
    });
  });
});
