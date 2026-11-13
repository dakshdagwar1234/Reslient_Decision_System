const express = require('express');
const { idempotencyMiddleware } = require('../middleware/idempotency');
const { validateLoanApplication } = require('../middleware/validator');

const {
  evaluateDecision,
  getDecision,
  listDecisions,
  retryDecision
} = require('../controllers/decisionController');

const {
  listConfigs,
  getConfig,
  createConfig,
  activateConfig
} = require('../controllers/workflowController');

const { submitManualReview } = require('../controllers/reviewController');
const { getExecutionAuditTrail, getSystemMetrics } = require('../controllers/auditController');

const router = express.Router();

// Decision Evaluation & Lifecycle
router.post('/decisions/evaluate', idempotencyMiddleware, validateLoanApplication, evaluateDecision);
router.get('/decisions', listDecisions);
router.get('/decisions/:id', getDecision);
router.post('/decisions/:id/retry', retryDecision);

// Manual Review Overrides
router.post('/decisions/:id/review', submitManualReview);

// Audit Trails & Metrics
router.get('/decisions/:id/audit-trail', getExecutionAuditTrail);
router.get('/metrics', getSystemMetrics);

// Workflow Configurations & Versioning
router.get('/configs', listConfigs);
router.get('/configs/:id', getConfig);
router.post('/configs', createConfig);
router.patch('/configs/:id/activate', activateConfig);

module.exports = router;
