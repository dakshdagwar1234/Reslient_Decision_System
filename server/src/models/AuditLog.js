const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  executionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Execution',
    required: true,
    index: true
  },
  sequence: {
    type: Number,
    required: true
  },
  eventType: {
    type: String,
    required: true,
    enum: [
      'STATE_TRANSITION',
      'EXTERNAL_CALL_START',
      'EXTERNAL_CALL_SUCCESS',
      'EXTERNAL_CALL_FAILURE',
      'RULE_EVALUATION',
      'RETRY_SCHEDULED',
      'RETRY_EXECUTED',
      'MANUAL_OVERRIDE',
      'EXECUTION_RECOVERED'
    ]
  },
  details: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  }
}, {
  timestamps: false,
  versionKey: false
});

// Compound index for sorted timeline queries per execution
auditLogSchema.index({ executionId: 1, sequence: 1 });

const AuditLog = mongoose.model('AuditLog', auditLogSchema);

module.exports = AuditLog;

