const Execution = require('../models/Execution');
const WorkflowConfig = require('../models/WorkflowConfig');
const WorkflowRunner = require('../engine/WorkflowRunner');
const { computePayloadHash } = require('../middleware/idempotency');

const workflowRunner = new WorkflowRunner();

/**
 * Submit and evaluate an application for decision
 */
const evaluateDecision = async (req, res, next) => {
  try {
    const inputPayload = { ...req.body };
    delete inputPayload.chaosOverrides; // Separate operational chaos flags from domain data

    const chaosOverrides = req.body.chaosOverrides || {};
    const idempotencyKey = req.idempotencyKey;
    const requestHash = computePayloadHash(req.body);

    // 1. Fetch current ACTIVE workflow configuration
    const activeConfig = await WorkflowConfig.findOne({ name: 'LOAN_APPROVAL', status: 'ACTIVE' });
    if (!activeConfig) {
      return res.status(503).json({
        error: {
          code: 'NO_ACTIVE_WORKFLOW',
          message: 'No active workflow configuration found for LOAN_APPROVAL. Please initialize or activate a workflow version.',
          timestamp: new Date().toISOString()
        }
      });
    }

    // 2. Create Execution document
    const execution = await Execution.create({
      workflowId: activeConfig._id,
      workflowVersion: activeConfig.version,
      idempotencyKey,
      requestHash,
      executionState: 'PENDING',
      decisionOutcome: null,
      inputPayload,
      retryState: {
        currentAttempt: 0,
        maxRetries: activeConfig.steps[0]?.retryPolicy?.maxRetries || 3,
        backoffMs: activeConfig.steps[0]?.retryPolicy?.backoffMs || 1000
      }
    });

    // Link execution to idempotency record
    if (req.idempotencyRecord) {
      req.idempotencyRecord.executionId = execution._id;
      await req.idempotencyRecord.save();
    }

    // 3. Execute Workflow Engine
    const completedExecution = await workflowRunner.run(execution, activeConfig, chaosOverrides);

    const responseStatus = completedExecution.executionState === 'AWAITING_RETRY' ? 202 : 200;

    return res.status(responseStatus).json({
      executionId: completedExecution._id,
      workflowVersion: completedExecution.workflowVersion,
      executionState: completedExecution.executionState,
      decisionOutcome: completedExecution.decisionOutcome,
      decisionDetails: completedExecution.decisionDetails,
      context: completedExecution.context,
      retryState: completedExecution.retryState,
      manualReview: completedExecution.manualReview,
      createdAt: completedExecution.createdAt,
      updatedAt: completedExecution.updatedAt
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Fetch execution status and details by ID
 */
const getDecision = async (req, res, next) => {
  try {
    const { id } = req.params;
    const execution = await Execution.findById(id).populate('workflowId', 'name version status isImmutable');

    if (!execution) {
      return res.status(404).json({
        error: {
          code: 'EXECUTION_NOT_FOUND',
          message: `Execution with ID '${id}' not found.`,
          timestamp: new Date().toISOString()
        }
      });
    }

    return res.json(execution);
  } catch (error) {
    next(error);
  }
};

/**
 * List executions with pagination and filtering
 */
const listDecisions = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 20,
      state,
      outcome,
      search
    } = req.query;

    const query = {};
    if (state) query.executionState = state;
    if (outcome) query.decisionOutcome = outcome;
    if (search) {
      query['inputPayload.applicantName'] = { $regex: search, $options: 'i' };
    }

    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const total = await Execution.countDocuments(query);
    const executions = await Execution.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit, 10))
      .populate('workflowId', 'name version status');

    return res.json({
      data: executions,
      pagination: {
        total,
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        totalPages: Math.ceil(total / parseInt(limit, 10))
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Manually trigger a retry for an execution in AWAITING_RETRY or FAILED state
 */
const retryDecision = async (req, res, next) => {
  try {
    const { id } = req.params;
    const execution = await Execution.findById(id);

    if (!execution) {
      return res.status(404).json({
        error: { code: 'EXECUTION_NOT_FOUND', message: `Execution '${id}' not found.` }
      });
    }

    if (execution.executionState !== 'AWAITING_RETRY' && execution.executionState !== 'FAILED') {
      return res.status(400).json({
        error: {
          code: 'RETRY_NOT_APPLICABLE',
          message: `Execution in '${execution.executionState}' state cannot be retried. Only AWAITING_RETRY or FAILED can be retried.`
        }
      });
    }

    const workflowConfig = await WorkflowConfig.findById(execution.workflowId);
    if (!workflowConfig) {
      return res.status(500).json({
        error: { code: 'CONFIG_NOT_FOUND', message: 'Workflow configuration not found.' }
      });
    }

    // Force clear error and run
    const updated = await workflowRunner.run(execution, workflowConfig, req.body.chaosOverrides || {});

    return res.json({
      message: 'Retry executed successfully.',
      execution: updated
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  evaluateDecision,
  getDecision,
  listDecisions,
  retryDecision
};
