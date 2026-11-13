const mongoose = require('mongoose');

const executionSchema = new mongoose.Schema({
  workflowId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'WorkflowConfig',
    required: true,
    index: true
  },
  workflowVersion: {
    type: Number,
    required: true
  },
  idempotencyKey: {
    type: String,
    required: true,
    index: true
  },
  requestHash: {
    type: String,
    required: true
  },

  // Technical Lifecycle State
  executionState: {
    type: String,
    enum: ['PENDING', 'RUNNING', 'AWAITING_RETRY', 'COMPLETED', 'FAILED'],
    default: 'PENDING',
    index: true
  },

  // Business Decision Outcome
  decisionOutcome: {
    type: String,
    enum: ['APPROVED', 'REJECTED', 'MANUAL_REVIEW', 'RETRY', null],
    default: null,
    index: true
  },

  inputPayload: {
    type: Object,
    required: true
  },

  // Enriched runtime context (e.g. calculated DTI, external credit score)
  context: {
    type: Object,
    default: {}
  },

  decisionDetails: {
    reasonCode: { type: String, default: null },
    message: { type: String, default: null },
    triggeredRuleId: { type: String, default: null },
    evaluatedAt: { type: Date, default: null }
  },

  retryState: {
    currentAttempt: { type: Number, default: 0 },
    maxRetries: { type: Number, default: 3 },
    nextRetryAt: { type: Date, default: null, index: true },
    lastError: { type: String, default: null },
    backoffMs: { type: Number, default: 1000 }
  },

  manualReview: {
    reviewedBy: { type: String, default: null },
    reviewDecision: { type: String, enum: ['APPROVED', 'REJECTED', null], default: null },
    notes: { type: String, default: null },
    reviewedAt: { type: Date, default: null }
  },

  // Interrupted Execution recovery tracker
  heartbeatAt: {
    type: Date,
    default: Date.now,
    index: true
  }
}, {
  timestamps: true
});

// Indexes for query performance
executionSchema.index({ createdAt: -1 });
executionSchema.index({ executionState: 1, 'retryState.nextRetryAt': 1 });

const Execution = mongoose.model('Execution', executionSchema);

module.exports = Execution;

