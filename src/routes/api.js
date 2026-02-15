const express = require('express');
const SessionController = require('../controllers/sessionController');

const router = express.Router();
const sessionController = new SessionController();

// API Routes
router.get('/sessions', sessionController.getSessions.bind(sessionController));
router.get('/sessions/:id/events', sessionController.getSessionEvents.bind(sessionController));

module.exports = router;