const {
  getNestedValue,
  evaluateCondition,
  evaluateConditionGroup,
  evaluateRules
} = require('../../src/engine/RuleEvaluator');

describe('Generic RuleEvaluator Unit Tests', () => {
  describe('getNestedValue', () => {
    it('should extract top-level and deeply nested properties', () => {
      const data = { a: 1, b: { c: { d: 'target' } } };
      expect(getNestedValue(data, 'a')).toBe(1);
      expect(getNestedValue(data, 'b.c.d')).toBe('target');
      expect(getNestedValue(data, 'b.nonexistent')).toBeUndefined();
      expect(getNestedValue(null, 'a')).toBeUndefined();
    });
  });

  describe('evaluateCondition', () => {
    const dataContext = {
      input: {
        employmentStatus: 'EMPLOYED',
        annualIncome: 75000,
        tags: ['vip', 'verified']
      },
      context: {
        debtToIncomeRatio: 0.28,
        creditScore: 740
      }
    };

    it('should evaluate equality (eq, neq)', () => {
      expect(evaluateCondition({ field: 'input.employmentStatus', operator: 'eq', value: 'EMPLOYED' }, dataContext).passed).toBe(true);
      expect(evaluateCondition({ field: 'input.employmentStatus', operator: 'eq', value: 'UNEMPLOYED' }, dataContext).passed).toBe(false);
      expect(evaluateCondition({ field: 'input.employmentStatus', operator: 'neq', value: 'UNEMPLOYED' }, dataContext).passed).toBe(true);
    });

    it('should evaluate numeric comparisons (gt, gte, lt, lte)', () => {
      expect(evaluateCondition({ field: 'context.creditScore', operator: 'gte', value: 740 }, dataContext).passed).toBe(true);
      expect(evaluateCondition({ field: 'context.creditScore', operator: 'gt', value: 740 }, dataContext).passed).toBe(false);
      expect(evaluateCondition({ field: 'context.debtToIncomeRatio', operator: 'lte', value: 0.35 }, dataContext).passed).toBe(true);
      expect(evaluateCondition({ field: 'context.debtToIncomeRatio', operator: 'lt', value: 0.20 }, dataContext).passed).toBe(false);
    });

    it('should evaluate array memberships (in, nin)', () => {
      expect(evaluateCondition({ field: 'input.employmentStatus', operator: 'in', value: ['EMPLOYED', 'SELF_EMPLOYED'] }, dataContext).passed).toBe(true);
      expect(evaluateCondition({ field: 'input.employmentStatus', operator: 'in', value: ['UNEMPLOYED'] }, dataContext).passed).toBe(false);
      expect(evaluateCondition({ field: 'input.employmentStatus', operator: 'nin', value: ['UNEMPLOYED'] }, dataContext).passed).toBe(true);
    });
  });

  describe('evaluateConditionGroup', () => {
    const data = {
      context: { creditScore: 750, dti: 0.25 }
    };

    it('should evaluate AND group correctly', () => {
      const group = {
        operator: 'AND',
        conditions: [
          { field: 'context.creditScore', operator: 'gte', value: 700 },
          { field: 'context.dti', operator: 'lte', value: 0.30 }
        ]
      };
      expect(evaluateConditionGroup(group, data).passed).toBe(true);
    });

    it('should fail AND group if any condition is false', () => {
      const group = {
        operator: 'AND',
        conditions: [
          { field: 'context.creditScore', operator: 'gte', value: 800 }, // false
          { field: 'context.dti', operator: 'lte', value: 0.30 }          // true
        ]
      };
      expect(evaluateConditionGroup(group, data).passed).toBe(false);
    });

    it('should evaluate OR group correctly', () => {
      const group = {
        operator: 'OR',
        conditions: [
          { field: 'context.creditScore', operator: 'gte', value: 800 }, // false
          { field: 'context.dti', operator: 'lte', value: 0.30 }          // true
        ]
      };
      expect(evaluateConditionGroup(group, data).passed).toBe(true);
    });
  });

  describe('evaluateRules priority & safe fallback', () => {
    const rules = [
      {
        id: 'R_PRIME_APPROVAL',
        name: 'Prime Approval',
        priority: 10,
        conditionGroup: {
          operator: 'AND',
          conditions: [
            { field: 'context.creditScore', operator: 'gte', value: 720 },
            { field: 'context.dti', operator: 'lte', value: 0.35 }
          ]
        },
        action: { outcome: 'APPROVED', reasonCode: 'PRIME_APPROVED', message: 'Approved via prime criteria' }
      },
      {
        id: 'R_HIGH_DTI_REJECT',
        name: 'High DTI Reject',
        priority: 1, // Higher priority than approval
        conditionGroup: {
          operator: 'AND',
          conditions: [
            { field: 'context.dti', operator: 'gt', value: 0.50 }
          ]
        },
        action: { outcome: 'REJECTED', reasonCode: 'DTI_TOO_HIGH', message: 'Rejected due to DTI > 50%' }
      }
    ];

    it('should match higher priority rejection rule first even if other conditions exist', () => {
      const data = { context: { creditScore: 780, dti: 0.55 } };
      const result = evaluateRules(rules, data);
      expect(result.outcome).toBe('REJECTED');
      expect(result.reasonCode).toBe('DTI_TOO_HIGH');
      expect(result.matchedRule.id).toBe('R_HIGH_DTI_REJECT');
    });

    it('should match approval rule when criteria met', () => {
      const data = { context: { creditScore: 780, dti: 0.25 } };
      const result = evaluateRules(rules, data);
      expect(result.outcome).toBe('APPROVED');
      expect(result.reasonCode).toBe('PRIME_APPROVED');
    });

    it('should NEVER silently approve when no rules match: fallback to MANUAL_REVIEW', () => {
      // Credit score 680, dti 0.40 -> neither high DTI reject nor prime approval
      const data = { context: { creditScore: 680, dti: 0.40 } };
      const result = evaluateRules(rules, data);
      expect(result.outcome).toBe('MANUAL_REVIEW');
      expect(result.isFallback).toBe(true);
      expect(result.reasonCode).toBe('NO_EXPLICIT_APPROVAL_MATCH');
    });
  });
});

