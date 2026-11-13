const CreditBureauClient = require('../../src/external/CreditBureauClient');

describe('CreditBureauClient Unit Tests', () => {
  it('should fetch credit report within normal parameters', async () => {
    const client = new CreditBureauClient({ timeoutRate: 0, errorRate: 0, latencyMs: 10 });
    const report = await client.fetchCreditReport({
      applicantName: 'Alice Smith',
      annualIncome: 95000,
      monthlyDebt: 1200,
      employmentStatus: 'EMPLOYED'
    });

    expect(report).toHaveProperty('creditScore');
    expect(report.creditScore).toBeGreaterThanOrEqual(300);
    expect(report.creditScore).toBeLessThanOrEqual(850);
    expect(report).toHaveProperty('bureauReferenceId');
    expect(report.bureauReferenceId).toMatch(/^CRB-[0-9A-F]{8}$/);
    expect(report).toHaveProperty('reportDate');
  });

  it('should throw transient error when forceTimeout is set', async () => {
    const client = new CreditBureauClient({ timeoutRate: 0, errorRate: 0, latencyMs: 5 });
    await expect(
      client.fetchCreditReport({ applicantName: 'Timeout User' }, { forceTimeout: true })
    ).rejects.toMatchObject({
      code: 'ETIMEDOUT',
      isTransient: true
    });
  });

  it('should throw transient error when force503 is set', async () => {
    const client = new CreditBureauClient({ timeoutRate: 0, errorRate: 0, latencyMs: 5 });
    await expect(
      client.fetchCreditReport({ applicantName: '503 User' }, { force503: true })
    ).rejects.toMatchObject({
      code: 'SERVICE_UNAVAILABLE',
      statusCode: 503,
      isTransient: true
    });
  });
});

