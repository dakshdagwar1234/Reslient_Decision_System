const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const app = require('../../src/app');
const WorkflowConfig = require('../../src/models/WorkflowConfig');
const Execution = require('../../src/models/Execution');
const AuditLog = require('../../src/models/AuditLog');
const IdempotencyRecord = require('../../src/models/IdempotencyRecord');
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

describe('Decision System REST APIs & Idempotency Integration Tests', () => {
  const primeApplicant = {
    applicantName: 'Sarah Prime',
    annualIncome: 110000,
    monthlyDebt: 1200,
    requestedAmount: 25000,
    loanTermMonths: 36,
    employmentStatus: 'EMPLOYED'
  };

  it('POST /api/v1/decisions/evaluate - should evaluate application and return APPROVED for prime profile', async () => {
    const res = await request(app)
      .post('/api/v1/decisions/evaluate')
      .set('Idempotency-Key', 'test-key-prime-1')
      .send(primeApplicant);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('executionId');
    expect(res.body.executionState).toBe('COMPLETED');
    expect(res.body.decisionOutcome).toBe('APPROVED');
    expect(res.body.decisionDetails.reasonCode).toBe('PRIME_AUTO_APPROVAL');
    expect(res.body.context.creditScore).toBeGreaterThanOrEqual(720);
  });

  it('POST /api/v1/decisions/evaluate - should reject unemployed applicant (Hard Rejection)', async () => {
    const res = await request(app)
      .post('/api/v1/decisions/evaluate')
      .set('Idempotency-Key', 'test-key-unemployed-1')
      .send({
        ...primeApplicant,
        applicantName: 'Unemployed User',
        employmentStatus: 'UNEMPLOYED'
      });

    expect(res.status).toBe(200);
    expect(res.body.decisionOutcome).toBe('REJECTED');
    expect(res.body.decisionDetails.reasonCode).toBe('UNEMPLOYED_INELIGIBLE');
  });

  it('POST /api/v1/decisions/evaluate - should route large loans (> $50k) to MANUAL_REVIEW', async () => {
    const res = await request(app)
      .post('/api/v1/decisions/evaluate')
      .set('Idempotency-Key', 'test-key-large-loan-1')
      .send({
        ...primeApplicant,
        applicantName: 'Big Borrower',
        requestedAmount: 75000 // > $50k trigger
      });

    expect(res.status).toBe(200);
    expect(res.body.decisionOutcome).toBe('MANUAL_REVIEW');
    expect(res.body.decisionDetails.reasonCode).toBe('LARGE_LOAN_SUPERVISORY_REVIEW');
  });

  it('POST /api/v1/decisions/evaluate - should require Idempotency-Key header', async () => {
    const res = await request(app)
      .post('/api/v1/decisions/evaluate')
      .send(primeApplicant);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('MISSING_IDEMPOTENCY_KEY');
  });

  it('Idempotency: Re-submitting identical payload should return cached snapshot with X-Cache-Lookup: HIT', async () => {
    const idemKey = 'test-key-cache-replay-1';

    // First Call
    const res1 = await request(app)
      .post('/api/v1/decisions/evaluate')
      .set('Idempotency-Key', idemKey)
      .send(primeApplicant);

    expect(res1.status).toBe(200);
    const executionId1 = res1.body.executionId;

    // Second Call with same key and same payload
    const res2 = await request(app)
      .post('/api/v1/decisions/evaluate')
      .set('Idempotency-Key', idemKey)
      .send(primeApplicant);

    expect(res2.status).toBe(200);
    expect(res2.headers['x-cache-lookup']).toBe('HIT');
    expect(res2.body.executionId).toBe(executionId1);

    // Verify only ONE execution document exists in database
    const totalExecutions = await Execution.countDocuments({ idempotencyKey: idemKey });
    expect(totalExecutions).toBe(1);
  });

  it('Idempotency Concurrency: In-progress duplicate with same key should return 409 Conflict and not create another execution', async () => {
    const inProgressKey = 'test-key-in-progress-concurrent';

    // Simulate an existing in-progress execution record created atomically
    await IdempotencyRecord.create({
      key: inProgressKey,
      requestHash: 'simulated-in-flight-hash',
      status: 'IN_PROGRESS',
      heartbeatAt: new Date()
    });

    const resConcurrent = await request(app)
      .post('/api/v1/decisions/evaluate')
      .set('Idempotency-Key', inProgressKey)
      .send(primeApplicant);

    // If request payload hash matches, returns 409 Conflict with Retry-After header
    // If request payload hash differs, returns 422 Payload Mismatch
    expect([409, 422]).toContain(resConcurrent.status);

    // Verify NO execution document was created in the database
    const totalExecutions = await Execution.countDocuments({ idempotencyKey: inProgressKey });
    expect(totalExecutions).toBe(0);
  });

  it('Idempotency Concurrency Matching: In-progress duplicate with exact matching payload returns 409 Conflict', async () => {
    const matchingKey = 'test-key-matching-in-flight';
    const { computePayloadHash } = require('../../src/middleware/idempotency');
    const matchingHash = computePayloadHash(primeApplicant);

    // Simulate in-flight record with identical payload hash
    await IdempotencyRecord.create({
      key: matchingKey,
      requestHash: matchingHash,
      status: 'IN_PROGRESS',
      heartbeatAt: new Date()
    });

    const resConcurrent = await request(app)
      .post('/api/v1/decisions/evaluate')
      .set('Idempotency-Key', matchingKey)
      .send(primeApplicant);

    expect(resConcurrent.status).toBe(409);
    expect(resConcurrent.body.error.code).toBe('CONCURRENT_REQUEST_IN_PROGRESS');
    expect(resConcurrent.headers['retry-after']).toBe('2');

    // Verify NO execution was created
    const totalExecutions = await Execution.countDocuments({ idempotencyKey: matchingKey });
    expect(totalExecutions).toBe(0);
  });

  it('Idempotency Conflict: Same key with differing payload should return 422 Unprocessable Entity', async () => {
    const conflictKey = 'test-key-conflict-1';

    // First Call
    await request(app)
      .post('/api/v1/decisions/evaluate')
      .set('Idempotency-Key', conflictKey)
      .send(primeApplicant);

    // Second Call with same key but different requestedAmount
    const resConflict = await request(app)
      .post('/api/v1/decisions/evaluate')
      .set('Idempotency-Key', conflictKey)
      .send({ ...primeApplicant, requestedAmount: 99999 });

    expect(resConflict.status).toBe(422);
    expect(resConflict.body.error.code).toBe('IDEMPOTENCY_PAYLOAD_MISMATCH');
  });

  it('Underwriter Manual Review: Underwriter can approve a MANUAL_REVIEW application', async () => {
    // 1. Submit application that lands in MANUAL_REVIEW
    const res = await request(app)
      .post('/api/v1/decisions/evaluate')
      .set('Idempotency-Key', 'test-manual-override-key-1')
      .send({
        ...primeApplicant,
        applicantName: 'Review Candidate',
        requestedAmount: 60000 // triggers large loan review
      });

    expect(res.body.decisionOutcome).toBe('MANUAL_REVIEW');
    const executionId = res.body.executionId;

    // 2. Submit manual review decision
    const reviewRes = await request(app)
      .post(`/api/v1/decisions/${executionId}/review`)
      .send({
        reviewDecision: 'APPROVED',
        reviewedBy: 'Senior Underwriter John',
        notes: 'Borrower has strong compensating collateral.'
      });

    expect(reviewRes.status).toBe(200);
    expect(reviewRes.body.execution.decisionOutcome).toBe('APPROVED');
    expect(reviewRes.body.execution.manualReview.reviewedBy).toBe('Senior Underwriter John');

    // 3. Verify AuditLog recorded MANUAL_OVERRIDE
    const auditRes = await request(app).get(`/api/v1/decisions/${executionId}/audit-trail`);
    expect(auditRes.status).toBe(200);
    const manualAudit = auditRes.body.auditTrail.find(a => a.eventType === 'MANUAL_OVERRIDE');
    expect(manualAudit).toBeDefined();
    expect(manualAudit.details.newOutcome).toBe('APPROVED');
  });

  it('GET /api/v1/metrics - should return aggregate decision metrics', async () => {
    const res = await request(app).get('/api/v1/metrics');
    expect(res.status).toBe(200);
    expect(res.body.metrics).toHaveProperty('totalApplications');
    expect(res.body.metrics).toHaveProperty('approved');
    expect(res.body.metrics).toHaveProperty('rejected');
    expect(res.body.metrics).toHaveProperty('manualReview');
    expect(res.body.metrics.totalApplications).toBeGreaterThanOrEqual(1);
  });

  it('Workflow Versioning: should create and activate new version without mutating old version', async () => {
    // List configs
    const listRes = await request(app).get('/api/v1/configs');
    expect(listRes.status).toBe(200);
    const initialVersionCount = listRes.body.data.length;

    // Create Draft v2
    const createRes = await request(app)
      .post('/api/v1/configs')
      .send({
        name: 'LOAN_APPROVAL',
        description: 'V2 with stricter rules',
        rules: []
      });

    expect(createRes.status).toBe(201);
    expect(createRes.body.config.version).toBe(2);
    expect(createRes.body.config.status).toBe('DRAFT');

    const v2Id = createRes.body.config._id;

    // Activate v2
    const activateRes = await request(app).patch(`/api/v1/configs/${v2Id}/activate`);
    expect(activateRes.status).toBe(200);
    expect(activateRes.body.config.status).toBe('ACTIVE');
    expect(activateRes.body.config.isImmutable).toBe(true);

    // Verify v1 was automatically archived
    const v1Config = await WorkflowConfig.findOne({ name: 'LOAN_APPROVAL', version: 1 });
    expect(v1Config.status).toBe('ARCHIVED');
  });
});

