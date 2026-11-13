const mongoose = require('mongoose');

const conditionSchema = new mongoose.Schema({
  field: { type: String, required: true },
  operator: {
    type: String,
    required: true,
    enum: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'nin', 'contains']
  },
  value: { type: mongoose.Schema.Types.Mixed, required: true }
}, { _id: false });

const conditionGroupSchema = new mongoose.Schema({
  operator: { type: String, enum: ['AND', 'OR'], default: 'AND' },
  conditions: { type: [conditionSchema], required: true }
}, { _id: false });

const ruleActionSchema = new mongoose.Schema({
  outcome: {
    type: String,
    required: true,
    enum: ['APPROVED', 'REJECTED', 'MANUAL_REVIEW', 'RETRY']
  },
  reasonCode: { type: String, required: true },
  message: { type: String, required: true }
}, { _id: false });

const ruleSchema = new mongoose.Schema({
  id: { type: String, required: true },
  name: { type: String, required: true },
  priority: { type: Number, default: 100 },
  conditionGroup: { type: conditionGroupSchema, required: true },
  action: { type: ruleActionSchema, required: true }
}, { _id: false });

const stepSchema = new mongoose.Schema({
  id: { type: String, required: true },
  name: { type: String, required: true },
  type: {
    type: String,
    required: true,
    enum: ['COMPUTE', 'EXTERNAL_CALL', 'RULE_SET']
  },
  service: { type: String },
  retryPolicy: {
    maxRetries: { type: Number, default: 3 },
    backoffMs: { type: Number, default: 1000 }
  }
}, { _id: false });

const workflowConfigSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  version: { type: Number, required: true, min: 1 },
  status: {
    type: String,
    enum: ['DRAFT', 'ACTIVE', 'ARCHIVED'],
    default: 'DRAFT',
    index: true
  },
  isImmutable: { type: Boolean, default: false },
  description: { type: String, default: '' },
  inputSchema: { type: Object, required: true },
  steps: { type: [stepSchema], default: [] },
  rules: { type: [ruleSchema], default: [] },
  fallbackAction: {
    outcome: {
      type: String,
      default: 'MANUAL_REVIEW',
      enum: ['MANUAL_REVIEW', 'REJECTED'] // Explicit safety: never default to APPROVED
    },
    reasonCode: { type: String, default: 'NO_EXPLICIT_APPROVAL_MATCH' },
    message: {
      type: String,
      default: 'Application did not satisfy explicit approval requirements and requires manual underwriter review.'
    }
  }
}, {
  timestamps: true
});

// Compound unique index on name and version
workflowConfigSchema.index({ name: 1, version: 1 }, { unique: true });

// Immutability Guard: Prevent editing active or locked workflow versions
workflowConfigSchema.pre('save', function (next) {
  if (!this.isNew && this.isImmutable && this.isModified() && !this.isModified('status')) {
    return next(new Error(`Workflow config version ${this.version} is immutable. Create a new version instead.`));
  }
  // Automatically lock once active
  if (this.status === 'ACTIVE') {
    this.isImmutable = true;
  }
  next();
});

workflowConfigSchema.pre('findOneAndUpdate', async function (next) {
  const docToUpdate = await this.model.findOne(this.getQuery());
  if (docToUpdate && docToUpdate.isImmutable) {
    const update = this.getUpdate();
    // Allow status transition to ARCHIVED only
    const keys = Object.keys(update.$set || update);
    const isOnlyStatusArchive = keys.every(k => k === 'status' || k === 'updatedAt') &&
      (update.$set?.status === 'ARCHIVED' || update.status === 'ARCHIVED');

    if (!isOnlyStatusArchive) {
      return next(new Error(`Workflow config version ${docToUpdate.version} is immutable and cannot be modified.`));
    }
  }
  next();
});

const WorkflowConfig = mongoose.model('WorkflowConfig', workflowConfigSchema);

module.exports = WorkflowConfig;

