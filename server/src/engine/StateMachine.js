/**
 * Execution State Machine
 * Defines permissible technical execution lifecycle transitions and guards.
 */

const VALID_TRANSITIONS = {
  PENDING: ['RUNNING'],
  RUNNING: ['COMPLETED', 'AWAITING_RETRY', 'FAILED'],
  AWAITING_RETRY: ['RUNNING', 'FAILED'],
  COMPLETED: [], // Terminal
  FAILED: []     // Terminal
};

const canTransition = (fromState, toState) => {
  const allowed = VALID_TRANSITIONS[fromState] || [];
  return allowed.includes(toState);
};

const assertTransition = (fromState, toState) => {
  if (!canTransition(fromState, toState)) {
    const error = new Error(`Invalid state transition: Cannot transition from '${fromState}' to '${toState}'.`);
    error.code = 'INVALID_STATE_TRANSITION';
    error.status = 400;
    throw error;
  }
};

/**
 * Executes a verified transition on an Execution document and logs an audit record.
 * 
 * @param {Object} execution - Mongoose Execution instance
 * @param {String} toState - Target executionState
 * @param {Object} details - Additional audit metadata
 * @param {Function} [auditLogger] - Optional async function to log the audit event
 */
const transitionState = async (execution, toState, details = {}, auditLogger = null) => {
  const fromState = execution.executionState;
  assertTransition(fromState, toState);

  execution.executionState = toState;
  execution.heartbeatAt = new Date();

  if (auditLogger && typeof auditLogger === 'function') {
    await auditLogger({
      eventType: 'STATE_TRANSITION',
      details: {
        fromState,
        toState,
        ...details
      }
    });
  }

  return execution;
};

module.exports = {
  VALID_TRANSITIONS,
  canTransition,
  assertTransition,
  transitionState
};

