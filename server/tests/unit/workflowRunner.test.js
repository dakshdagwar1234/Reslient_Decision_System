const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const WorkflowConfig = require('../../src/models/WorkflowConfig');
const Execution = require('../../src/models/Execution');
const AuditLog = require('../../src/models/AuditLog');
const WorkflowRunner = require('../../src/engine/WorkflowRunner');
const CreditBureauClient = require('../../src/external/CreditBureauClient');

let mongoServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
  await Promise.all([
    WorkflowConfig.init(),
    Execution.init(),
    AuditLog.init()
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
    AuditLog.deleteMany({})
  ]);
});

describe('WorkflowRunner End-to-End Execution Flow', () => {
  const loanWorkflowRules = [
    {
      id: 'R_UNEMPLOYED_REJECT',
      name: 'Unemployed Rejection',
      priority: 1,
      conditionGroup: {
        operator: 'AND',
        conditions: [{ field: 'input.employmentStatus', operator: 'eq', value: 'UNEMPLOYED' }]
      },
      action: { outcome: 'REJECTED', reasonCode: 'UNEMPLOYED_INELIGIBLE', message: 'Must be employed' }
    },
    {
      id: 'R_HIGH_DTI_REJECT',
      name: 'High DTI Rejection',
      priority: 2,
      conditionGroup: {
        operator: 'AND',
        conditions: [{ field: 'context.debtToIncomeRatio', operator: 'gt', value: 0.50 }]
      },
      action: { outcome: 'REJECTED', reasonCode: 'DTI_TOO_HIGH', message: 'DTI exceeds 50%' }
    },
    {
      id: 'R_PRIME_APPROVAL',
      name: 'Prime Customer Approval',
      priority: 10,
      conditionGroup: {
        operator: 'AND',
        conditions: [
          { field: 'context.creditScore', operator: 'gte', value: 720 },
          { field: 'context.debtToIncomeRatio', operator: 'lte', value: 0.35 }
        ]
      },
      action: { outcome: 'APPROVED', reasonCode: 'PRIME_QUALIFIED', message: 'Auto-approved on prime criteria' }
    }
  ];

  let activeConfig;

  beforeEach(async () => {
    activeConfig = await WorkflowConfig.create({
      name: 'LOAN_APPROVAL',
      version: 1,
      status: 'ACTIVE',
      inputSchema: { type: 'object' },
      rules: loanWorkflowRules,
      fallbackAction: {
        outcome: 'MANUAL_REVIEW',
        reasonCode: 'NO_EXPLICIT_APPROVAL_MATCH',
        message: 'Requires underwriting manual review'
      }
    });
  });

  it('should auto-approve an applicant meeting prime criteria and audit the process', async () => {
    const runner = new WorkflowRunner({
      creditBureauClient: {
        fetchCreditReport: jest.fn().mockResolvedValue({
          creditScore: 780,
          bureauReferenceId: 'CRB-TEST-PRIME',
          reportDate: new Date().toISOString(),
          durationMs: 15
        })
      }
    });

    const execution = await Execution.create({
      workflowId: activeConfig._id,
      workflowVersion: activeConfig.version,
      idempotencyKey: 'idem-prime-1',
      requestHash: 'hash-prime',
      executionState: 'PENDING',
      inputPayload: {
        applicantName: 'Alice Green',
        annualIncome: 120000,
        monthlyDebt: 1500,
        requestedAmount: 30000,
        loanTermMonths: 36,
        employmentStatus: 'EMPLOYED'
      }
    });

    const completed = await runner.run(execution, activeConfig);

    expect(completed.executionState).toBe('COMPLETED');
    expect(completed.decisionOutcome).toBe('APPROVED');
    expect(completed.decisionDetails.reasonCode).toBe('PRIME_QUALIFIED');
    expect(completed.context.creditScore).toBe(780);

    // Verify audit logs were sequentially written
    const logs = await AuditLog.find({ executionId: execution._id }).sort({ sequence: 1 });
    expect(logs.length).toBeGreaterThanOrEqual(4);
    const eventTypes = logs.map(l => l.eventType);
    expect(eventTypes).toContain('STATE_TRANSITION');
    expect(eventTypes).toContain('EXTERNAL_CALL_START');
    expect(eventTypes).toContain('EXTERNAL_CALL_SUCCESS');
    expect(eventTypes).toContain('RULE_EVALUATION');
  });

  it('should reject an applicant with DTI > 50%', async () => {
    const runner = new WorkflowRunner({
      creditBureauClient: {
        fetchCreditReport: jest.fn().mockResolvedValue({
          creditScore: 680,
          bureauReferenceId: 'CRB-TEST-DTI',
          reportDate: new Date().toISOString(),
          durationMs: 10
        })
      }
    });

    const execution = await Execution.create({
      workflowId: activeConfig._id,
      workflowVersion: activeConfig.version,
      idempotencyKey: 'idem-dti-reject',
      requestHash: 'hash-dti',
      executionState: 'PENDING',
      inputPayload: {
        applicantName: 'Bob HighDebt',
        annualIncome: 50000,
        monthlyDebt: 2500, // DTI = (2500*12)/50000 = 60% > 50%
        requestedAmount: 15000,
        loanTermMonths: 24,
        employmentStatus: 'EMPLOYED'
      }
    });

    const completed = await runner.run(execution, activeConfig);

    expect(completed.executionState).toBe('COMPLETED');
    expect(completed.decisionOutcome).toBe('REJECTED');
    expect(completed.decisionDetails.reasonCode).toBe('DTI_TOO_HIGH');
  });

  it('should transition to AWAITING_RETRY when external credit bureau encounters transient error', async () => {
    const mockBureau = {
      fetchCreditReport: jest.fn().mockRejectedValue({
        code: 'SERVICE_UNAVAILABLE',
        message: 'Credit Bureau 503',
        isTransient: true,
        durationMs: 25
      })
    };

    const runner = new WorkflowRunner({ creditBureauClient: mockBureau });

    const execution = await Execution.create({
      workflowId: activeConfig._id,
      workflowVersion: activeConfig.version,
      idempotencyKey: 'idem-transient-1',
      requestHash: 'hash-transient',
      executionState: 'PENDING',
      inputPayload: {
        applicantName: 'Charlie Transient',
        annualIncome: 80000,
        monthlyDebt: 1000,
        requestedAmount: 20000,
        loanTermMonths: 36,
        employmentStatus: 'EMPLOYED'
      }
    });

    const retried = await runner.run(execution, activeConfig);

    expect(retried.executionState).toBe('AWAITING_RETRY');
    expect(retried.decisionOutcome).toBe('RETRY');
    expect(retried.retryState.currentAttempt).toBe(1);
    expect(retried.retryState.nextRetryAt).toBeDefined();
    expect(new Date(retried.retryState.nextRetryAt).getTime()).toBeGreaterThan(Date.now() - 1000);

    const logs = await AuditLog.find({ executionId: execution._id });
    const retryScheduled = logs.find(l => l.eventType === 'RETRY_SCHEDULED');
    expect(retryScheduled).toBeDefined();
  });

  it('should terminate in FAILED when max retries are exhausted', async () => {
    const mockBureau = {
      fetchCreditReport: jest.fn().mockRejectedValue({
        code: 'ETIMEDOUT',
        message: 'Bureau Timeout',
        isTransient: true,
        durationMs: 3000
      })
    };

    const runner = new WorkflowRunner({ creditBureauClient: mockBureau });

    const execution = await Execution.create({
      workflowId: activeConfig._id,
      workflowVersion: activeConfig.version,
      idempotencyKey: 'idem-exhausted-1',
      requestHash: 'hash-exhausted',
      executionState: 'AWAITING_RETRY',
      retryState: {
        currentAttempt: 3, // Already reached max retries
        maxRetries: 3
      },
      inputPayload: {
        applicantName: 'David MaxRetries',
        annualIncome: 75000,
        monthlyDebt: 800,
        requestedAmount: 10000,
        loanTermMonths: 12,
        employmentStatus: 'EMPLOYED'
      }
    });

    const failed = await runner.run(execution, activeConfig);

    expect(failed.executionState).toBe('FAILED');
    expect(failed.retryState.currentAttempt).toBe(4);
  });

  it('should safely fallback to MANUAL_REVIEW when no rejection and no approval rule matches', async () => {
    const runner = new WorkflowRunner({
      creditBureauClient: {
        fetchCreditReport: jest.fn().mockResolvedValue({
          creditScore: 680, // Between 580 and 720 (neither prime nor subprime)
          bureauReferenceId: 'CRB-TEST-MID',
          reportDate: new Date().toISOString(),
          durationMs: 12
        })
      }
    });

    const execution = await Execution.create({
      workflowId: activeConfig._id,
      workflowVersion: activeConfig.version,
      idempotencyKey: 'idem-fallback-review',
      requestHash: 'hash-fallback',
      executionState: 'PENDING',
      inputPayload: {
        applicantName: 'Eve MiddleGround',
        annualIncome: 65000,
        monthlyDebt: 1800, // DTI = (1800*12)/65000 = 0.3323 (not > 0.50, but score is not >= 720)
        requestedAmount: 25000,
        loanTermMonths: 36,
        employmentStatus: 'EMPLOYED'
      }
    });

    const reviewed = await runner.run(execution, activeConfig);

    expect(reviewed.executionState).toBe('COMPLETED');
    expect(reviewed.decisionOutcome).toBe('MANUAL_REVIEW');
    expect(reviewed.decisionDetails.reasonCode).toBe('NO_EXPLICIT_APPROVAL_MATCH');
  });
});

