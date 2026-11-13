const AuditLog = require('../models/AuditLog');
const { transitionState } = require('./StateMachine');
const { evaluateRules } = require('./RuleEvaluator');
const CreditBureauClient = require('../external/CreditBureauClient');
const env = require('../config/env');

class WorkflowRunner {
  constructor(options = {}) {
    this.creditBureauClient = options.creditBureauClient || new CreditBureauClient();
  }

  /**
   * Helper to write sequential AuditLog entries for this execution.
   */
  async createAuditLogger(executionId) {
    let nextSeq = 1;
    const lastAudit = await AuditLog.findOne({ executionId }).sort({ sequence: -1 }).select('sequence');
    if (lastAudit) {
      nextSeq = lastAudit.sequence + 1;
    }

    return async (auditData) => {
      const log = await AuditLog.create({
        executionId,
        sequence: nextSeq++,
        eventType: auditData.eventType,
        details: auditData.details,
        timestamp: new Date()
      });
      return log;
    };
  }

  /**
   * Executes the workflow pipeline on an Execution document.
   * 
   * @param {Object} execution - Mongoose Execution document
   * @param {Object} workflowConfig - Mongoose WorkflowConfig document
   * @param {Object} [chaosOverrides] - Chaos options for external calls
   * @returns {Promise<Object>} Evaluated execution snapshot
   */
  async run(execution, workflowConfig, chaosOverrides = {}) {
    const auditLog = await this.createAuditLogger(execution._id);

    // 1. Transition state from PENDING / AWAITING_RETRY to RUNNING
    if (execution.executionState !== 'RUNNING') {
      await transitionState(execution, 'RUNNING', {
        workflowId: workflowConfig._id,
        workflowVersion: workflowConfig.version,
        attempt: execution.retryState.currentAttempt
      }, auditLog);
      await execution.save();
    }

    // 2. Compute internal derived context
    const input = execution.inputPayload;
    const annualIncome = input.annualIncome;
    const monthlyDebt = input.monthlyDebt || 0;
    const debtToIncomeRatio = Math.round(((monthlyDebt * 12) / annualIncome) * 10000) / 10000;

    execution.context = {
      ...execution.context,
      debtToIncomeRatio,
      annualIncome,
      monthlyDebt,
      requestedAmount: input.requestedAmount,
      loanTermMonths: input.loanTermMonths
    };

    // 3. External Enrichment: Credit Bureau
    await auditLog({
      eventType: 'EXTERNAL_CALL_START',
      details: {
        service: 'CREDIT_BUREAU',
        action: 'fetchCreditReport',
        applicantName: input.applicantName
      }
    });

    let creditReport = null;
    try {
      creditReport = await this.creditBureauClient.fetchCreditReport(input, chaosOverrides);
      execution.context = {
        ...execution.context,
        creditScore: creditReport.creditScore,
        bureauReferenceId: creditReport.bureauReferenceId,
        creditReportDate: creditReport.reportDate
      };

      await auditLog({
        eventType: 'EXTERNAL_CALL_SUCCESS',
        details: {
          service: 'CREDIT_BUREAU',
          creditScore: creditReport.creditScore,
          bureauReferenceId: creditReport.bureauReferenceId,
          durationMs: creditReport.durationMs
        }
      });
    } catch (externalErr) {
      await auditLog({
        eventType: 'EXTERNAL_CALL_FAILURE',
        details: {
          service: 'CREDIT_BUREAU',
          code: externalErr.code || 'EXTERNAL_ERROR',
          message: externalErr.message,
          isTransient: externalErr.isTransient || false,
          durationMs: externalErr.durationMs || 0
        }
      });

      // Handle Transient Failure with Exponential Backoff
      if (externalErr.isTransient) {
        const attempt = execution.retryState.currentAttempt + 1;
        execution.retryState.currentAttempt = attempt;
        execution.retryState.lastError = externalErr.message;

        if (attempt <= execution.retryState.maxRetries) {
          // Exponential backoff: backoffMs * (2 ^ (attempt - 1))
          const backoff = (execution.retryState.backoffMs || env.RETRY_BASE_BACKOFF_MS) * Math.pow(2, attempt - 1);
          const nextRetryDate = new Date(Date.now() + backoff);

          execution.retryState.nextRetryAt = nextRetryDate;
          execution.decisionOutcome = 'RETRY';

          await transitionState(execution, 'AWAITING_RETRY', {
            attempt,
            maxRetries: execution.retryState.maxRetries,
            nextRetryAt: nextRetryDate.toISOString(),
            backoffMs: backoff,
            reason: externalErr.message
          }, auditLog);

          await auditLog({
            eventType: 'RETRY_SCHEDULED',
            details: {
              attempt,
              nextRetryAt: nextRetryDate.toISOString(),
              backoffMs: backoff
            }
          });

          await execution.save();
          return execution;
        } else {
          // Retries exhausted -> Terminate in FAILED state
          execution.decisionOutcome = null;
          execution.retryState.nextRetryAt = null;

          await transitionState(execution, 'FAILED', {
            reason: 'Max retries exhausted for external credit bureau.',
            attemptsMade: attempt,
            lastError: externalErr.message
          }, auditLog);

          await execution.save();
          return execution;
        }
      }

      // Non-transient external failure -> Fatal FAILED
      await transitionState(execution, 'FAILED', {
        reason: externalErr.message,
        fatal: true
      }, auditLog);
      await execution.save();
      return execution;
    }

    // 4. Evaluate Business Rules
    const dataContext = {
      input: execution.inputPayload,
      context: execution.context
    };

    const decisionResult = evaluateRules(
      workflowConfig.rules,
      dataContext,
      workflowConfig.fallbackAction
    );

    // Audit each rule evaluation trace
    for (const trace of decisionResult.evaluationTrace) {
      await auditLog({
        eventType: 'RULE_EVALUATION',
        details: {
          ruleId: trace.ruleId,
          ruleName: trace.ruleName,
          passed: trace.passed,
          action: trace.actionIfMatched,
          conditions: trace.conditions
        }
      });
    }

    // 5. Finalize Decision and Complete Technical Lifecycle
    execution.decisionOutcome = decisionResult.outcome;
    execution.decisionDetails = {
      reasonCode: decisionResult.reasonCode,
      message: decisionResult.message,
      triggeredRuleId: decisionResult.matchedRule ? decisionResult.matchedRule.id : null,
      evaluatedAt: new Date()
    };

    await transitionState(execution, 'COMPLETED', {
      decisionOutcome: execution.decisionOutcome,
      reasonCode: decisionResult.reasonCode,
      isFallback: decisionResult.isFallback
    }, auditLog);

    await execution.save();
    return execution;
  }
}

module.exports = WorkflowRunner;
