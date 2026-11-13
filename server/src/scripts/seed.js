const WorkflowConfig = require('../models/WorkflowConfig');

const DEFAULT_LOAN_WORKFLOW = {
  name: 'LOAN_APPROVAL',
  version: 1,
  status: 'ACTIVE',
  isImmutable: true,
  description: 'Enterprise Reference Loan Decision Workflow Engine v1',
  inputSchema: {
    type: 'object',
    required: ['applicantName', 'annualIncome', 'monthlyDebt', 'requestedAmount', 'loanTermMonths', 'employmentStatus'],
    properties: {
      applicantName: { type: 'string' },
      annualIncome: { type: 'number', minimum: 1 },
      monthlyDebt: { type: 'number', minimum: 0 },
      requestedAmount: { type: 'number', minimum: 1 },
      loanTermMonths: { type: 'integer', minimum: 1 },
      employmentStatus: { type: 'string', enum: ['EMPLOYED', 'SELF_EMPLOYED', 'UNEMPLOYED'] }
    }
  },
  steps: [
    {
      id: 'STEP_CREDIT_ENRICHMENT',
      name: 'Credit Bureau Score Enrichment',
      type: 'EXTERNAL_CALL',
      service: 'CREDIT_BUREAU',
      retryPolicy: {
        maxRetries: 3,
        backoffMs: 1000
      }
    },
    {
      id: 'STEP_RULE_EVALUATION',
      name: 'Business Decision Rule Matrix Evaluation',
      type: 'RULE_SET'
    }
  ],
  rules: [
    // 1. Hard Rejection: Unemployed
    {
      id: 'R_UNEMPLOYED',
      name: 'Unemployment Eligibility Filter',
      priority: 1,
      conditionGroup: {
        operator: 'AND',
        conditions: [
          { field: 'input.employmentStatus', operator: 'eq', value: 'UNEMPLOYED' }
        ]
      },
      action: {
        outcome: 'REJECTED',
        reasonCode: 'UNEMPLOYED_INELIGIBLE',
        message: 'Applicant is currently unemployed and does not meet minimum eligibility criteria.'
      }
    },
    // 2. Hard Rejection: Extreme Debt-To-Income Ratio (> 50%)
    {
      id: 'R_HIGH_DTI',
      name: 'Excessive Debt-to-Income Filter',
      priority: 2,
      conditionGroup: {
        operator: 'AND',
        conditions: [
          { field: 'context.debtToIncomeRatio', operator: 'gt', value: 0.50 }
        ]
      },
      action: {
        outcome: 'REJECTED',
        reasonCode: 'DTI_TOO_HIGH',
        message: 'Applicant debt-to-income ratio exceeds the 50% regulatory maximum threshold.'
      }
    },
    // 3. Hard Rejection: Subprime Credit Score (< 580)
    {
      id: 'R_SUBPRIME_CREDIT',
      name: 'Subprime Credit Score Filter',
      priority: 3,
      conditionGroup: {
        operator: 'AND',
        conditions: [
          { field: 'context.creditScore', operator: 'lt', value: 580 }
        ]
      },
      action: {
        outcome: 'REJECTED',
        reasonCode: 'SUBPRIME_CREDIT_SCORE',
        message: 'Applicant credit score is below the 580 minimum subprime lending requirement.'
      }
    },
    // 4. Supervisory Manual Review: Large Loan Amount (> $50,000)
    {
      id: 'R_LARGE_LOAN',
      name: 'Large Principal Supervisory Review',
      priority: 4,
      conditionGroup: {
        operator: 'AND',
        conditions: [
          { field: 'input.requestedAmount', operator: 'gt', value: 50000 }
        ]
      },
      action: {
        outcome: 'MANUAL_REVIEW',
        reasonCode: 'LARGE_LOAN_SUPERVISORY_REVIEW',
        message: 'Loan requests above $50,000 require senior credit committee supervisory approval.'
      }
    },
    // 5. Manual Review: Borderline Credit & Elevated DTI
    {
      id: 'R_BORDERLINE_RISK',
      name: 'Borderline Risk Underwriter Review',
      priority: 5,
      conditionGroup: {
        operator: 'AND',
        conditions: [
          { field: 'context.creditScore', operator: 'lt', value: 650 },
          { field: 'context.debtToIncomeRatio', operator: 'gt', value: 0.35 }
        ]
      },
      action: {
        outcome: 'MANUAL_REVIEW',
        reasonCode: 'BORDERLINE_CREDIT_RISK',
        message: 'Credit score below 650 with DTI above 35% flagged for underwriter evaluation.'
      }
    },
    // 6. Fast-Track Auto Approval: Prime Customer (Score >= 720, DTI <= 35%, Income >= $60k)
    {
      id: 'R_PRIME_AUTO_APPROVAL',
      name: 'Prime Customer Fast-Track Approval',
      priority: 10,
      conditionGroup: {
        operator: 'AND',
        conditions: [
          { field: 'context.creditScore', operator: 'gte', value: 720 },
          { field: 'context.debtToIncomeRatio', operator: 'lte', value: 0.35 },
          { field: 'input.annualIncome', operator: 'gte', value: 60000 }
        ]
      },
      action: {
        outcome: 'APPROVED',
        reasonCode: 'PRIME_AUTO_APPROVAL',
        message: 'Fast-track auto-approval granted: Prime tier credit profile and strong income stability.'
      }
    },
    // 7. Standard Auto Approval: Good Credit (Score >= 650, DTI <= 30%)
    {
      id: 'R_STANDARD_AUTO_APPROVAL',
      name: 'Standard Tier Approval',
      priority: 20,
      conditionGroup: {
        operator: 'AND',
        conditions: [
          { field: 'context.creditScore', operator: 'gte', value: 650 },
          { field: 'context.debtToIncomeRatio', operator: 'lte', value: 0.30 }
        ]
      },
      action: {
        outcome: 'APPROVED',
        reasonCode: 'STANDARD_QUALIFIED',
        message: 'Application qualified and approved under standard underwriting guidelines.'
      }
    }
  ],
  fallbackAction: {
    outcome: 'MANUAL_REVIEW',
    reasonCode: 'NO_EXPLICIT_APPROVAL_MATCH',
    message: 'Application did not satisfy positive auto-approval criteria and safely routed to underwriter queue.'
  }
};

const seedDefaultWorkflow = async () => {
  try {
    const existing = await WorkflowConfig.findOne({ name: 'LOAN_APPROVAL', status: 'ACTIVE' });
    if (!existing) {
      const created = await WorkflowConfig.create(DEFAULT_LOAN_WORKFLOW);
      console.log(`[Seed] Successfully seeded active default workflow '${created.name}' v${created.version}`);
      return created;
    }
    return existing;
  } catch (error) {
    console.error('[Seed] Notice during seed check:', error.message);
    return null;
  }
};

module.exports = {
  DEFAULT_LOAN_WORKFLOW,
  seedDefaultWorkflow
};
