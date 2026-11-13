const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const WorkflowConfig = require('../../src/models/WorkflowConfig');
const Execution = require('../../src/models/Execution');
const AuditLog = require('../../src/models/AuditLog');
const IdempotencyRecord = require('../../src/models/IdempotencyRecord');

let mongoServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  await mongoose.connect(uri);
  // Ensure all schema indexes are fully built in MongoDB
  await Promise.all([
    WorkflowConfig.init(),
    Execution.init(),
    AuditLog.init(),
    IdempotencyRecord.init()
  ]);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  await Promise.all([
    WorkflowConfig.deleteMany({}),
    Execution.deleteMany({}),
    AuditLog.deleteMany({}),
    IdempotencyRecord.deleteMany({})
  ]);
});

describe('Mongoose Models & Schema Invariants', () => {
  const sampleWorkflow = {
    name: 'LOAN_APPROVAL',
    version: 1,
    status: 'DRAFT',
    inputSchema: { type: 'object' },
    rules: [
      {
        id: 'R_UNEMPLOYED',
        name: 'Unemployed Rejection',
        priority: 1,
        conditionGroup: {
          operator: 'AND',
          conditions: [{ field: 'input.employmentStatus', operator: 'eq', value: 'UNEMPLOYED' }]
        },
        action: {
          outcome: 'REJECTED',
          reasonCode: 'UNEMPLOYED_INELIGIBLE',
          message: 'Applicants must be employed'
        }
      }
    ],
    fallbackAction: {
      outcome: 'MANUAL_REVIEW',
      reasonCode: 'NO_EXPLICIT_APPROVAL_MATCH',
      message: 'Requires manual underwriting review'
    }
  };

  it('should create and retrieve a valid WorkflowConfig document', async () => {
    const config = await WorkflowConfig.create(sampleWorkflow);
    expect(config._id).toBeDefined();
    expect(config.version).toBe(1);
    expect(config.status).toBe('DRAFT');
    expect(config.isImmutable).toBe(false);
    expect(config.fallbackAction.outcome).toBe('MANUAL_REVIEW');
  });

  it('should enforce compound uniqueness on { name, version } in WorkflowConfig', async () => {
    await WorkflowConfig.create(sampleWorkflow);
    await expect(WorkflowConfig.create(sampleWorkflow)).rejects.toThrow();
  });

  it('should prevent mutating an ACTIVE workflow config (immutability guard)', async () => {
    const config = await WorkflowConfig.create({
      ...sampleWorkflow,
      status: 'ACTIVE'
    });
    expect(config.isImmutable).toBe(true);

    // Attempting to modify an active workflow rule
    config.description = 'Mutated description';
    await expect(config.save()).rejects.toThrow(/immutable/i);
  });

  it('should allow archiving an ACTIVE workflow config', async () => {
    const config = await WorkflowConfig.create({
      ...sampleWorkflow,
      status: 'ACTIVE'
    });
    config.status = 'ARCHIVED';
    await expect(config.save()).resolves.toBeDefined();
    expect(config.status).toBe('ARCHIVED');
  });

  it('should create an Execution with distinct executionState and decisionOutcome', async () => {
    const config = await WorkflowConfig.create(sampleWorkflow);
    const execution = await Execution.create({
      workflowId: config._id,
      workflowVersion: 1,
      idempotencyKey: 'test-key-123',
      requestHash: 'hash-abc-123',
      executionState: 'PENDING',
      decisionOutcome: null,
      inputPayload: { applicantName: 'John', annualIncome: 70000 }
    });

    expect(execution._id).toBeDefined();
    expect(execution.executionState).toBe('PENDING');
    expect(execution.decisionOutcome).toBeNull();
  });

  it('should record an AuditLog with strict sequential eventTypes', async () => {
    const config = await WorkflowConfig.create(sampleWorkflow);
    const execution = await Execution.create({
      workflowId: config._id,
      workflowVersion: 1,
      idempotencyKey: 'test-key-audit',
      requestHash: 'hash-xyz',
      executionState: 'RUNNING',
      inputPayload: { applicantName: 'Alice', annualIncome: 90000 }
    });

    const audit = await AuditLog.create({
      executionId: execution._id,
      sequence: 1,
      eventType: 'STATE_TRANSITION',
      details: { fromState: 'PENDING', toState: 'RUNNING' }
    });

    expect(audit._id).toBeDefined();
    expect(audit.eventType).toBe('STATE_TRANSITION');
    expect(audit.sequence).toBe(1);
  });

  it('should enforce uniqueness on IdempotencyRecord key', async () => {
    await IdempotencyRecord.create({
      key: 'unique-idem-key-1',
      requestHash: 'hash-111',
      status: 'IN_PROGRESS'
    });

    await expect(IdempotencyRecord.create({
      key: 'unique-idem-key-1',
      requestHash: 'hash-222',
      status: 'IN_PROGRESS'
    })).rejects.toThrow();
  });
});
