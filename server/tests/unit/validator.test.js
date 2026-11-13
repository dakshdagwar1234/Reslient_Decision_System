const { validateLoanApplication } = require('../../src/middleware/validator');

const createMockReqRes = (body) => {
  const req = { body };
  const res = {
    statusCode: null,
    jsonData: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.jsonData = data;
      return this;
    }
  };
  const next = jest.fn();
  return { req, res, next };
};

describe('Loan Application Input Validator Middleware', () => {
  const validPayload = {
    applicantName: 'Jane Doe',
    annualIncome: 85000,
    monthlyDebt: 1200,
    requestedAmount: 25000,
    loanTermMonths: 36,
    employmentStatus: 'EMPLOYED'
  };

  it('should call next() for a complete, valid payload', () => {
    const { req, res, next } = createMockReqRes({ ...validPayload });
    validateLoanApplication(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBeNull();
  });

  it('should reject zero annual income (prevents division by zero in DTI)', () => {
    const { req, res, next } = createMockReqRes({ ...validPayload, annualIncome: 0 });
    validateLoanApplication(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(400);
    expect(res.jsonData.error.code).toBe('VALIDATION_FAILED');
    const fieldError = res.jsonData.error.details.find(d => d.field === 'annualIncome');
    expect(fieldError).toBeDefined();
    expect(fieldError.message).toMatch(/strictly greater than zero/i);
  });

  it('should reject negative annual income', () => {
    const { req, res, next } = createMockReqRes({ ...validPayload, annualIncome: -50000 });
    validateLoanApplication(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(400);
  });

  it('should reject negative monthly debt', () => {
    const { req, res, next } = createMockReqRes({ ...validPayload, monthlyDebt: -100 });
    validateLoanApplication(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(400);
    const fieldError = res.jsonData.error.details.find(d => d.field === 'monthlyDebt');
    expect(fieldError).toBeDefined();
  });

  it('should accept zero monthly debt (valid for debt-free applicants)', () => {
    const { req, res, next } = createMockReqRes({ ...validPayload, monthlyDebt: 0 });
    validateLoanApplication(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('should reject zero or negative requestedAmount', () => {
    const { req, res, next } = createMockReqRes({ ...validPayload, requestedAmount: 0 });
    validateLoanApplication(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(400);
  });

  it('should reject non-integer or negative loanTermMonths', () => {
    const { req, res, next } = createMockReqRes({ ...validPayload, loanTermMonths: 12.5 });
    validateLoanApplication(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(400);
  });

  it('should reject invalid employment status enum', () => {
    const { req, res, next } = createMockReqRes({ ...validPayload, employmentStatus: 'FREELANCE_UNKNOWN' });
    validateLoanApplication(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(400);
    const fieldError = res.jsonData.error.details.find(d => d.field === 'employmentStatus');
    expect(fieldError.message).toMatch(/EMPLOYED, SELF_EMPLOYED, UNEMPLOYED/);
  });

  it('should report all missing fields when payload is empty', () => {
    const { req, res, next } = createMockReqRes({});
    validateLoanApplication(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(400);
    expect(res.jsonData.error.details.length).toBeGreaterThanOrEqual(5);
  });
});

