const express = require('express');
const InsightController = require('../controllers/insightController');

const router = express.Router();
const insightController = new InsightController();

// Insight Routes
router.post('/session/:id/insight', insightController.generateInsight.bind(insightController));
router.get('/session/:id/insight', insightController.getInsightStatus.bind(insightController));
router.delete('/session/:id/insight', insightController.deleteInsight.bind(insightController));

module.exports = router;