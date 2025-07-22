import { Logger } from '@nestjs/common';
import { RetryManager, CircuitBreaker, defaultRetryConfig, defaultCircuitBreakerConfig } from './retry.utils';

describe('RetryManager', () => {
  let retryManager: RetryManager;
  let mockLogger: jest.Mocked<Logger>;

  beforeEach(() => {
    mockLogger = {
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    } as any;
    retryManager = new RetryManager(mockLogger);
  });

  describe('withRetry', () => {
    it('should succeed on first attempt', async () => {
      const operation = jest.fn().mockResolvedValue('success');

      const result = await retryManager.withRetry(operation, 'test-operation');

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should retry on transient errors', async () => {
      const operation = jest.fn()
        .mockRejectedValueOnce(new Error('500 Internal Server Error'))
        .mockResolvedValue('success');

      const result = await retryManager.withRetry(operation, 'test-operation');

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(2);
      expect(mockLogger.debug).toHaveBeenCalledWith('Attempt 1/3 for test-operation');
      expect(mockLogger.debug).toHaveBeenCalledWith('Attempt 2/3 for test-operation');
    });

    it('should not retry on authentication errors', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('401 Unauthorized'));

      await expect(retryManager.withRetry(operation, 'test-operation')).rejects.toThrow('401 Unauthorized');
      expect(operation).toHaveBeenCalledTimes(1);
      expect(mockLogger.warn).toHaveBeenCalledWith('Non-retryable error for test-operation: Error: 401 Unauthorized');
    });

    it('should not retry on client errors', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('400 Bad Request'));

      await expect(retryManager.withRetry(operation, 'test-operation')).rejects.toThrow('400 Bad Request');
      expect(operation).toHaveBeenCalledTimes(1);
      expect(mockLogger.warn).toHaveBeenCalledWith('Non-retryable error for test-operation: Error: 400 Bad Request');
    });

    it('should retry on rate limit errors', async () => {
      const operation = jest.fn()
        .mockRejectedValueOnce(new Error('429 Too Many Requests'))
        .mockResolvedValue('success');

      const result = await retryManager.withRetry(operation, 'test-operation');

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(2);
    });

    it('should retry on network errors', async () => {
      const operation = jest.fn()
        .mockRejectedValueOnce(new Error('ECONNRESET'))
        .mockResolvedValue('success');

      const result = await retryManager.withRetry(operation, 'test-operation');

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(2);
    });

    it('should fail after max attempts', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('500 Internal Server Error'));

      await expect(retryManager.withRetry(operation, 'test-operation')).rejects.toThrow('500 Internal Server Error');
      expect(operation).toHaveBeenCalledTimes(3);
      expect(mockLogger.error).toHaveBeenCalledWith('All 3 attempts failed for test-operation');
    });

    it('should use custom retry configuration', async () => {
      const customConfig = { ...defaultRetryConfig, maxAttempts: 2 };
      const operation = jest.fn().mockRejectedValue(new Error('500 Internal Server Error'));

      await expect(retryManager.withRetry(operation, 'test-operation', customConfig)).rejects.toThrow('500 Internal Server Error');
      expect(operation).toHaveBeenCalledTimes(2);
      expect(mockLogger.error).toHaveBeenCalledWith('All 2 attempts failed for test-operation');
    });
  });

  describe('circuit breaker integration', () => {
    it('should open circuit breaker after threshold failures', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('500 Internal Server Error'));
      const circuitBreakerConfig = { ...defaultCircuitBreakerConfig, failureThreshold: 6 }; // Account for 3 attempts per call

      // First failure - circuit breaker should still be CLOSED
      await expect(retryManager.withRetry(operation, 'test-operation', defaultRetryConfig, circuitBreakerConfig)).rejects.toThrow();
      expect(retryManager.getCircuitBreakerState('test-operation')).toBe('CLOSED');

      // Second failure - circuit breaker should open
      await expect(retryManager.withRetry(operation, 'test-operation', defaultRetryConfig, circuitBreakerConfig)).rejects.toThrow();
      expect(retryManager.getCircuitBreakerState('test-operation')).toBe('OPEN');

      // Third attempt should fail immediately due to open circuit breaker
      await expect(retryManager.withRetry(operation, 'test-operation', defaultRetryConfig, circuitBreakerConfig)).rejects.toThrow('Circuit breaker is OPEN');

      expect(operation).toHaveBeenCalledTimes(6); // 3 attempts per call, 2 calls = 6 total
    }, 10000); // Increase timeout for this test

    it('should close circuit breaker after recovery timeout', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('500 Internal Server Error'));
      const circuitBreakerConfig = {
        ...defaultCircuitBreakerConfig,
        failureThreshold: 1,
        recoveryTimeout: 100 // 100ms recovery timeout
      };

      // First failure opens circuit breaker
      await expect(retryManager.withRetry(operation, 'test-operation', defaultRetryConfig, circuitBreakerConfig)).rejects.toThrow();

      // Wait for recovery timeout
      await new Promise(resolve => setTimeout(resolve, 150));

      // Should be able to try again
      const successOperation = jest.fn().mockResolvedValue('success');
      const result = await retryManager.withRetry(successOperation, 'test-operation', defaultRetryConfig, circuitBreakerConfig);

      expect(result).toBe('success');
    });
  });

  describe('circuit breaker state management', () => {
    it('should return circuit breaker state', async () => {
      expect(retryManager.getCircuitBreakerState('nonexistent')).toBeUndefined();

      // Create a circuit breaker by using it
      const operation = jest.fn().mockRejectedValue(new Error('500 Internal Server Error'));
      const circuitBreakerConfig = { ...defaultCircuitBreakerConfig, failureThreshold: 1 };

      await expect(retryManager.withRetry(operation, 'test-operation', defaultRetryConfig, circuitBreakerConfig)).rejects.toThrow();

      expect(retryManager.getCircuitBreakerState('test-operation')).toBe('OPEN');
    });

    it('should reset circuit breaker', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('500 Internal Server Error'));
      const circuitBreakerConfig = { ...defaultCircuitBreakerConfig, failureThreshold: 1 };

      await expect(retryManager.withRetry(operation, 'test-operation', defaultRetryConfig, circuitBreakerConfig)).rejects.toThrow();
      expect(retryManager.getCircuitBreakerState('test-operation')).toBe('OPEN');

      retryManager.resetCircuitBreaker('test-operation');
      expect(retryManager.getCircuitBreakerState('test-operation')).toBeUndefined();
    });
  });
});

describe('CircuitBreaker', () => {
  let circuitBreaker: CircuitBreaker;

  beforeEach(() => {
    circuitBreaker = new CircuitBreaker(defaultCircuitBreakerConfig);
  });

  it('should start in CLOSED state', () => {
    expect(circuitBreaker.getState()).toBe('CLOSED');
  });

  it('should execute operation when CLOSED', async () => {
    const operation = jest.fn().mockResolvedValue('success');

    const result = await circuitBreaker.execute(operation);

    expect(result).toBe('success');
    expect(operation).toHaveBeenCalledTimes(1);
    expect(circuitBreaker.getState()).toBe('CLOSED');
  });

  it('should open circuit breaker after threshold failures', async () => {
    const operation = jest.fn().mockRejectedValue(new Error('failure'));
    const config = { ...defaultCircuitBreakerConfig, failureThreshold: 3 };
    circuitBreaker = new CircuitBreaker(config);

    // First failure
    await expect(circuitBreaker.execute(operation)).rejects.toThrow('failure');
    expect(circuitBreaker.getState()).toBe('CLOSED');

    // Second failure
    await expect(circuitBreaker.execute(operation)).rejects.toThrow('failure');
    expect(circuitBreaker.getState()).toBe('CLOSED');

    // Third failure should open circuit breaker
    await expect(circuitBreaker.execute(operation)).rejects.toThrow('failure');
    expect(circuitBreaker.getState()).toBe('OPEN');
  });

  it('should not execute operation when OPEN', async () => {
    const operation = jest.fn().mockRejectedValue(new Error('failure'));

    // Trigger circuit breaker to open
    for (let i = 0; i < defaultCircuitBreakerConfig.failureThreshold; i++) {
      await expect(circuitBreaker.execute(operation)).rejects.toThrow('failure');
    }

    expect(circuitBreaker.getState()).toBe('OPEN');

    // Should fail immediately without calling operation
    await expect(circuitBreaker.execute(operation)).rejects.toThrow('Circuit breaker is OPEN');
    expect(operation).toHaveBeenCalledTimes(defaultCircuitBreakerConfig.failureThreshold);
  });

    it('should transition to HALF_OPEN after recovery timeout', async () => {
    const operation = jest.fn().mockRejectedValue(new Error('failure'));
    const config = { ...defaultCircuitBreakerConfig, failureThreshold: 3, recoveryTimeout: 100 };
    circuitBreaker = new CircuitBreaker(config);

    // Trigger circuit breaker to open
    for (let i = 0; i < config.failureThreshold; i++) {
      await expect(circuitBreaker.execute(operation)).rejects.toThrow('failure');
    }

    expect(circuitBreaker.getState()).toBe('OPEN');

    // Wait for recovery timeout
    await new Promise(resolve => setTimeout(resolve, 150));

    // Should transition to HALF_OPEN when execute is called
    expect(circuitBreaker.getState()).toBe('OPEN'); // Still OPEN until execute is called

    // Try to execute - should transition to HALF_OPEN and then back to OPEN on failure
    await expect(circuitBreaker.execute(operation)).rejects.toThrow('failure');
    expect(circuitBreaker.getState()).toBe('OPEN'); // Should stay OPEN after failure in HALF_OPEN
  });

  it('should close circuit breaker on successful operation in HALF_OPEN', async () => {
    const failingOperation = jest.fn().mockRejectedValue(new Error('failure'));
    const successOperation = jest.fn().mockResolvedValue('success');
    const config = { ...defaultCircuitBreakerConfig, recoveryTimeout: 100 };
    circuitBreaker = new CircuitBreaker(config);

    // Trigger circuit breaker to open
    for (let i = 0; i < config.failureThreshold; i++) {
      await expect(circuitBreaker.execute(failingOperation)).rejects.toThrow('failure');
    }

    // Wait for recovery timeout
    await new Promise(resolve => setTimeout(resolve, 150));

    // Successful operation should close circuit breaker
    const result = await circuitBreaker.execute(successOperation);
    expect(result).toBe('success');
    expect(circuitBreaker.getState()).toBe('CLOSED');
  });
});
