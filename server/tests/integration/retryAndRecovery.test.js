const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const WorkflowConfig = require('../../src/models/WorkflowConfig');
const Execution = require('../../src/models/Execution');
const AuditLog = require('../../src/models/AuditLog');
const IdempotencyRecord = require('../../src/models/IdempotencyRecord');
const WorkflowRunner = require('../../src/engine/WorkflowRunner');
const RetryWorker = require('../../src/engine/RetryWorker');
const { seedDefaultWorkflow } = require('../../src/scripts/seed');

let mongoServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
  await Promise.all([
    WorkflowConfig.init(),
    Execution.init(),
    AuditLog.init(),
    IdempotencyRecord.init()
  ]);
  await seedDefaultWorkflow();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

describe('Persistent Retry Worker and Recovery Integration Tests', () => {
  it('should automatically recover and complete an AWAITING_RETRY execution when worker polls', async () => {
    const activeConfig = await WorkflowConfig.findOne({ name: 'LOAN_APPROVAL', status: 'ACTIVE' });

    // 1. Simulate an execution that failed transiently and was stored in MongoDB with nextRetryAt in the past
    const awaitingExecution = await Execution.create({
      workflowId: activeConfig._id,
      workflowVersion: activeConfig.version,
      idempotencyKey: 'test-retry-recovery-key-1',
      requestHash: 'hash-recovery-1',
      executionState: 'AWAITING_RETRY',
      decisionOutcome: 'RETRY',
      inputPayload: {
        applicantName: 'Recovered Applicant',
        annualIncome: 95000,
        monthlyDebt: 1000,
        requestedAmount: 20000,
        loanTermMonths: 24,
        employmentStatus: 'EMPLOYED'
      },
      retryState: {
        currentAttempt: 1,
        maxRetries: 3,
        nextRetryAt: new Date(Date.now() - 5000), // scheduled 5 seconds ago
        lastError: 'External 503 transient error'
      }
    });

    // Create corresponding idempotency record in IN_PROGRESS
    await IdempotencyRecord.create({
      key: awaitingExecution.idempotencyKey,
      requestHash: awaitingExecution.requestHash,
      status: 'IN_PROGRESS',
      executionId: awaitingExecution._id
    });

    // 2. Setup RetryWorker with a mock runner that now succeeds
    const mockSuccessBureau = {
      fetchCreditReport: jest.fn().mockResolvedValue({
        creditScore: 750,
        bureauReferenceId: 'CRB-RECOVERED-123',
        reportDate: new Date().toISOString(),
        durationMs: 20
      })
    };

    const runner = new WorkflowRunner({ creditBureauClient: mockSuccessBureau });
    const retryWorker = new RetryWorker({ workflowRunner: runner });

    // 3. Trigger worker cycle (simulating the background poller after server restart)
    await retryWorker.processPendingRetries();

    // 4. Verify execution was picked up, transitioned to RUNNING, and COMPLETED with APPROVED
    const updatedExecution = await Execution.findById(awaitingExecution._id);
    expect(updatedExecution.executionState).toBe('COMPLETED');
    expect(updatedExecution.decisionOutcome).toBe('APPROVED');
    expect(updatedExecution.context.creditScore).toBe(750);

    // 5. Verify IdempotencyRecord was finalized to COMPLETED
    const updatedIdem = await IdempotencyRecord.findOne({ key: awaitingExecution.idempotencyKey });
    expect(updatedIdem.status).toBe('COMPLETED');
    expect(updatedIdem.responseBody.decisionOutcome).toBe('APPROVED');
  });
});
