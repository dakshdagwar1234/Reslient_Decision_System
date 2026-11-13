const Execution = require('../models/Execution');
const AuditLog = require('../models/AuditLog');
const IdempotencyRecord = require('../models/IdempotencyRecord');

/**
 * Submit an underwriter manual decision override
 */
const submitManualReview = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { reviewDecision, reviewedBy, notes } = req.body;

    if (!['APPROVED', 'REJECTED'].includes(reviewDecision)) {
      return res.status(400).json({
        error: {
          code: 'INVALID_REVIEW_DECISION',
          message: "reviewDecision must be either 'APPROVED' or 'REJECTED'."
        }
      });
    }

    if (!reviewedBy || typeof reviewedBy !== 'string' || reviewedBy.trim().length === 0) {
      return res.status(400).json({
        error: {
          code: 'MISSING_REVIEWER_NAME',
          message: 'reviewedBy is required (name or ID of underwriter).'
        }
      });
    }

    const execution = await Execution.findById(id);
    if (!execution) {
      return res.status(404).json({
        error: { code: 'EXECUTION_NOT_FOUND', message: `Execution '${id}' not found.` }
      });
    }

    if (execution.decisionOutcome !== 'MANUAL_REVIEW') {
      return res.status(400).json({
        error: {
          code: 'NOT_IN_MANUAL_REVIEW',
          message: `Execution is not in MANUAL_REVIEW outcome (current: '${execution.decisionOutcome}').`
        }
      });
    }

    const previousOutcome = execution.decisionOutcome;

    // Apply manual review decision
    execution.decisionOutcome = reviewDecision;
    execution.manualReview = {
      reviewedBy: reviewedBy.trim(),
      reviewDecision,
      notes: notes || '',
      reviewedAt: new Date()
    };
    execution.updatedAt = new Date();

    await execution.save();

    // Append to AuditLog
    const lastAudit = await AuditLog.findOne({ executionId: execution._id }).sort({ sequence: -1 });
    const nextSeq = lastAudit ? lastAudit.sequence + 1 : 1;

    await AuditLog.create({
      executionId: execution._id,
      sequence: nextSeq,
      eventType: 'MANUAL_OVERRIDE',
      details: {
        previousOutcome,
        newOutcome: reviewDecision,
        reviewedBy: reviewedBy.trim(),
        notes: notes || ''
      },
      timestamp: new Date()
    });

    // Update Idempotency cache if present
    await IdempotencyRecord.updateOne(
      { key: execution.idempotencyKey },
      {
        $set: {
          'responseBody.decisionOutcome': reviewDecision,
          'responseBody.manualReview': execution.manualReview
        }
      }
    ).catch(err => {
      console.error('[ManualReview] Failed to update idempotency cache:', err.message);
    });

    return res.json({
      message: `Manual review successfully submitted. Decision updated to ${reviewDecision}.`,
      execution
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  submitManualReview
};

