/**
 * Generic Condition & Business Rule Evaluator
 * Evaluates declarative rules against input payload and enriched context.
 * Produces structured audit traces for every evaluated condition and rule.
 */

// Safely resolve nested properties (e.g. "context.debtToIncomeRatio", "input.annualIncome")
const getNestedValue = (obj, path) => {
  if (!obj || !path) return undefined;
  const parts = path.split('.');
  let current = obj;
  for (const part of parts) {
    if (current === undefined || current === null) return undefined;
    current = current[part];
  }
  return current;
};

// Evaluate single atomic condition
const evaluateCondition = (condition, dataContext) => {
  const { field, operator, value: expectedValue } = condition;
  const actualValue = getNestedValue(dataContext, field);

  let passed = false;

  switch (operator) {
    case 'eq':
      passed = actualValue === expectedValue;
      break;
    case 'neq':
      passed = actualValue !== expectedValue;
      break;
    case 'gt':
      passed = typeof actualValue === 'number' && typeof expectedValue === 'number' && actualValue > expectedValue;
      break;
    case 'gte':
      passed = typeof actualValue === 'number' && typeof expectedValue === 'number' && actualValue >= expectedValue;
      break;
    case 'lt':
      passed = typeof actualValue === 'number' && typeof expectedValue === 'number' && actualValue < expectedValue;
      break;
    case 'lte':
      passed = typeof actualValue === 'number' && typeof expectedValue === 'number' && actualValue <= expectedValue;
      break;
    case 'in':
      passed = Array.isArray(expectedValue) && expectedValue.includes(actualValue);
      break;
    case 'nin':
      passed = Array.isArray(expectedValue) && !expectedValue.includes(actualValue);
      break;
    case 'contains':
      passed = typeof actualValue === 'string' && actualValue.includes(String(expectedValue));
      break;
    default:
      passed = false;
  }

  return {
    field,
    operator,
    expectedValue,
    actualValue,
    passed
  };
};

// Evaluate a condition group (AND / OR)
const evaluateConditionGroup = (conditionGroup, dataContext) => {
  const { operator = 'AND', conditions = [] } = conditionGroup;
  const conditionResults = conditions.map(c => evaluateCondition(c, dataContext));

  let passed = false;
  if (operator === 'AND') {
    passed = conditionResults.length > 0 && conditionResults.every(r => r.passed);
  } else if (operator === 'OR') {
    passed = conditionResults.length > 0 && conditionResults.some(r => r.passed);
  }

  return {
    operator,
    passed,
    conditionResults
  };
};

/**
 * Evaluates an ordered set of rules against data context.
 * Stops on first matching rule (short-circuit by priority).
 * 
 * @param {Array} rules - Ordered list of rule objects
 * @param {Object} dataContext - Merged { input, context } data
 * @param {Object} fallbackAction - Safe fallback action if no rule matches
 * @returns {Object} { matchedRule, outcome, reasonCode, message, evaluationTrace }
 */
const evaluateRules = (rules = [], dataContext = {}, fallbackAction = null) => {
  // Sort rules by priority ascending (lower number = higher priority)
  const sortedRules = [...rules].sort((a, b) => (a.priority || 100) - (b.priority || 100));

  const evaluationTrace = [];
  let winningRule = null;

  for (const rule of sortedRules) {
    const groupResult = evaluateConditionGroup(rule.conditionGroup, dataContext);

    const ruleTrace = {
      ruleId: rule.id,
      ruleName: rule.name,
      priority: rule.priority,
      passed: groupResult.passed,
      groupOperator: groupResult.operator,
      conditions: groupResult.conditionResults,
      actionIfMatched: rule.action
    };
    evaluationTrace.push(ruleTrace);

    if (groupResult.passed && !winningRule) {
      winningRule = rule;
      break; // Short-circuit upon matching highest priority rule
    }
  }

  if (winningRule) {
    return {
      isFallback: false,
      matchedRule: winningRule,
      outcome: winningRule.action.outcome,
      reasonCode: winningRule.action.reasonCode,
      message: winningRule.action.message,
      evaluationTrace
    };
  }

  // Explicit Safe Approval Fallback: Never default to APPROVED
  const safeFallback = fallbackAction || {
    outcome: 'MANUAL_REVIEW',
    reasonCode: 'NO_EXPLICIT_APPROVAL_MATCH',
    message: 'Application did not meet explicit auto-approval criteria and requires manual underwriter review.'
  };

  return {
    isFallback: true,
    matchedRule: null,
    outcome: safeFallback.outcome,
    reasonCode: safeFallback.reasonCode,
    message: safeFallback.message,
    evaluationTrace
  };
};

module.exports = {
  getNestedValue,
  evaluateCondition,
  evaluateConditionGroup,
  evaluateRules
};
