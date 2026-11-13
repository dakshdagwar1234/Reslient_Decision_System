const mongoose = require('mongoose');

const idempotencyRecordSchema = new mongoose.Schema({
  key: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  requestHash: {
    type: String,
    required: true
  },
  status: {
    type: String,
    required: true,
    enum: ['IN_PROGRESS', 'COMPLETED'],
    default: 'IN_PROGRESS',
    index: true
  },
  responseStatus: {
    type: Number,
    default: null
  },
  responseBody: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  executionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Execution',
    default: null
  },
  heartbeatAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  createdAt: {
    type: Date,
    default: Date.now,
    expires: 86400 // 24 hours TTL index in MongoDB
  }
}, {
  timestamps: true
});

const IdempotencyRecord = mongoose.model('IdempotencyRecord', idempotencyRecordSchema);

module.exports = IdempotencyRecord;

