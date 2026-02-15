const express = require('express');
const SessionController = require('../controllers/sessionController');

const router = express.Router();
const sessionController = new SessionController();

// Page Routes
router.get('/', sessionController.getHomepage.bind(sessionController));
router.get('/session/:id', sessionController.getSessionDetail.bind(sessionController));
router.get('/session/:id/time-analyze', sessionController.getTimeAnalysis.bind(sessionController));

module.exports = router;