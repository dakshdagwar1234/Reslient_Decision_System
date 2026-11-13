/**
 * Strict Input Validator for Decision Evaluation
 * Validates zero/negative amounts, required fields, and enum types.
 */

const VALID_EMPLOYMENT_STATUSES = ['EMPLOYED', 'SELF_EMPLOYED', 'UNEMPLOYED'];

const validateLoanApplication = (req, res, next) => {
  const payload = req.body;
  const errors = [];

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return res.status(400).json({
      error: {
        code: 'INVALID_PAYLOAD',
        message: 'Request body must be a valid JSON object.',
        timestamp: new Date().toISOString()
      }
    });
  }

  // 1. Applicant Name Validation
  if (!payload.applicantName || typeof payload.applicantName !== 'string' || payload.applicantName.trim().length === 0) {
    errors.push({ field: 'applicantName', message: 'applicantName is required and must be a non-empty string.' });
  }

  // 2. Annual Income Validation: Must be strictly > 0 (prevents division by zero in DTI and negative values)
  if (payload.annualIncome === undefined || payload.annualIncome === null) {
    errors.push({ field: 'annualIncome', message: 'annualIncome is required.' });
  } else if (typeof payload.annualIncome !== 'number' || isNaN(payload.annualIncome)) {
    errors.push({ field: 'annualIncome', message: 'annualIncome must be a valid number.' });
  } else if (payload.annualIncome <= 0) {
    errors.push({
      field: 'annualIncome',
      message: 'annualIncome must be strictly greater than zero (zero and negative incomes are ineligible).'
    });
  }

  // 3. Monthly Debt Validation: Must be >= 0 (cannot be negative)
  if (payload.monthlyDebt === undefined || payload.monthlyDebt === null) {
    errors.push({ field: 'monthlyDebt', message: 'monthlyDebt is required.' });
  } else if (typeof payload.monthlyDebt !== 'number' || isNaN(payload.monthlyDebt)) {
    errors.push({ field: 'monthlyDebt', message: 'monthlyDebt must be a valid number.' });
  } else if (payload.monthlyDebt < 0) {
    errors.push({ field: 'monthlyDebt', message: 'monthlyDebt cannot be negative.' });
  }

  // 4. Requested Loan Amount Validation: Must be strictly > 0
  if (payload.requestedAmount === undefined || payload.requestedAmount === null) {
    errors.push({ field: 'requestedAmount', message: 'requestedAmount is required.' });
  } else if (typeof payload.requestedAmount !== 'number' || isNaN(payload.requestedAmount)) {
    errors.push({ field: 'requestedAmount', message: 'requestedAmount must be a valid number.' });
  } else if (payload.requestedAmount <= 0) {
    errors.push({ field: 'requestedAmount', message: 'requestedAmount must be strictly greater than zero.' });
  }

  // 5. Loan Term Months Validation: Must be an integer > 0
  if (payload.loanTermMonths === undefined || payload.loanTermMonths === null) {
    errors.push({ field: 'loanTermMonths', message: 'loanTermMonths is required.' });
  } else if (typeof payload.loanTermMonths !== 'number' || !Number.isInteger(payload.loanTermMonths)) {
    errors.push({ field: 'loanTermMonths', message: 'loanTermMonths must be an integer.' });
  } else if (payload.loanTermMonths <= 0) {
    errors.push({ field: 'loanTermMonths', message: 'loanTermMonths must be strictly greater than zero.' });
  }

  // 6. Employment Status Validation: Must be one of valid enums
  if (!payload.employmentStatus) {
    errors.push({ field: 'employmentStatus', message: 'employmentStatus is required.' });
  } else if (!VALID_EMPLOYMENT_STATUSES.includes(payload.employmentStatus)) {
    errors.push({
      field: 'employmentStatus',
      message: `employmentStatus must be one of: ${VALID_EMPLOYMENT_STATUSES.join(', ')}.`
    });
  }

  if (errors.length > 0) {
    return res.status(400).json({
      error: {
        code: 'VALIDATION_FAILED',
        message: 'Input validation failed on one or more fields.',
        details: errors,
        timestamp: new Date().toISOString()
      }
    });
  }

  next();
};

module.exports = {
  validateLoanApplication,
  VALID_EMPLOYMENT_STATUSES
};

