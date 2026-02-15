const express = require('express');
const UploadController = require('../controllers/uploadController');

const router = express.Router();
const uploadController = new UploadController();

// Upload Routes
router.get('/session/:id/share', uploadController.shareSession.bind(uploadController));
router.post('/session/import',
  (req, res, next) => uploadController.getUploadMiddleware()(req, res, next),
  uploadController.importSession.bind(uploadController)
);

module.exports = router;