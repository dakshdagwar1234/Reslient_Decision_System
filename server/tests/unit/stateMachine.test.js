const {
  canTransition,
  assertTransition,
  transitionState
} = require('../../src/engine/StateMachine');

describe('State Machine Unit Tests', () => {
  it('should allow valid transitions according to lifecycle', () => {
    expect(canTransition('PENDING', 'RUNNING')).toBe(true);
    expect(canTransition('RUNNING', 'COMPLETED')).toBe(true);
    expect(canTransition('RUNNING', 'AWAITING_RETRY')).toBe(true);
    expect(canTransition('RUNNING', 'FAILED')).toBe(true);
    expect(canTransition('AWAITING_RETRY', 'RUNNING')).toBe(true);
  });

  it('should disallow invalid transitions', () => {
    expect(canTransition('PENDING', 'COMPLETED')).toBe(false);
    expect(canTransition('COMPLETED', 'RUNNING')).toBe(false);
    expect(canTransition('FAILED', 'RUNNING')).toBe(false);
    expect(canTransition('COMPLETED', 'FAILED')).toBe(false);
  });

  it('assertTransition should throw INVALID_STATE_TRANSITION for disallowed transitions', () => {
    expect(() => assertTransition('COMPLETED', 'RUNNING')).toThrow(/Cannot transition from 'COMPLETED' to 'RUNNING'/);
    expect(() => assertTransition('PENDING', 'COMPLETED')).toThrow();
  });

  it('transitionState should update document and invoke audit logger', async () => {
    const mockExecution = {
      executionState: 'PENDING',
      heartbeatAt: null
    };

    const auditLogger = jest.fn();
    await transitionState(mockExecution, 'RUNNING', { reason: 'Test execution start' }, auditLogger);

    expect(mockExecution.executionState).toBe('RUNNING');
    expect(mockExecution.heartbeatAt).toBeInstanceOf(Date);
    expect(auditLogger).toHaveBeenCalledWith({
      eventType: 'STATE_TRANSITION',
      details: {
        fromState: 'PENDING',
        toState: 'RUNNING',
        reason: 'Test execution start'
      }
    });
  });
});
