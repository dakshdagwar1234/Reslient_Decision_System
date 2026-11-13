const Execution = require('../models/Execution');
const AuditLog = require('../models/AuditLog');

/**
 * Fetch complete sequential audit trail for an execution
 */
const getExecutionAuditTrail = async (req, res, next) => {
  try {
    const { id } = req.params;
    const execution = await Execution.findById(id).select('inputPayload context decisionOutcome decisionDetails executionState createdAt');

    if (!execution) {
      return res.status(404).json({
        error: { code: 'EXECUTION_NOT_FOUND', message: `Execution '${id}' not found.` }
      });
    }

    const auditTrail = await AuditLog.find({ executionId: id }).sort({ sequence: 1 });

    return res.json({
      executionId: id,
      summary: {
        executionState: execution.executionState,
        decisionOutcome: execution.decisionOutcome,
        decisionDetails: execution.decisionDetails,
        createdAt: execution.createdAt
      },
      auditTrail
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Fetch decision metrics aggregated for dashboard stats
 */
const getSystemMetrics = async (req, res, next) => {
  try {
    const [total, approved, rejected, manualReview, awaitingRetry, failed] = await Promise.all([
      Execution.countDocuments(),
      Execution.countDocuments({ decisionOutcome: 'APPROVED' }),
      Execution.countDocuments({ decisionOutcome: 'REJECTED' }),
      Execution.countDocuments({ decisionOutcome: 'MANUAL_REVIEW' }),
      Execution.countDocuments({ executionState: 'AWAITING_RETRY' }),
      Execution.countDocuments({ executionState: 'FAILED' })
    ]);

    return res.json({
      metrics: {
        totalApplications: total,
        approved,
        rejected,
        manualReview,
        awaitingRetry,
        failed,
        approvalRate: total > 0 ? ((approved / total) * 100).toFixed(1) + '%' : '0.0%'
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getExecutionAuditTrail,
  getSystemMetrics
};
