import { Logger } from '@nestjs/common';

export interface RetryConfig {
  maxAttempts: number;
  baseDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
  timeout?: number;
}

export interface CircuitBreakerConfig {
  failureThreshold: number;
  recoveryTimeout: number;
  halfOpenMaxAttempts: number;
}

export class CircuitBreaker {
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';
  private failureCount = 0;
  private lastFailureTime = 0;
  private readonly config: CircuitBreakerConfig;

  constructor(config: CircuitBreakerConfig) {
    this.config = config;
  }

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime > this.config.recoveryTimeout) {
        this.state = 'HALF_OPEN';
      } else {
        throw new Error('Circuit breaker is OPEN');
      }
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.failureCount = 0;
    this.state = 'CLOSED';
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.state === 'HALF_OPEN' || this.failureCount >= this.config.failureThreshold) {
      this.state = 'OPEN';
    }
  }

  getState(): string {
    return this.state;
  }
}

export class RetryManager {
  private readonly logger: Logger;
  private readonly circuitBreakers = new Map<string, CircuitBreaker>();

  constructor(logger: Logger) {
    this.logger = logger;
  }

  /**
   * Executes an operation with retry logic and circuit breaker protection
   */
  async withRetry<T>(
    operation: () => Promise<T>,
    operationName: string,
    config: RetryConfig = defaultRetryConfig,
    circuitBreakerConfig?: CircuitBreakerConfig
  ): Promise<T> {
    let lastError: Error;
    let attempt = 0;

    // Get or create circuit breaker for this operation
    let circuitBreaker: CircuitBreaker | undefined;
    if (circuitBreakerConfig) {
      if (!this.circuitBreakers.has(operationName)) {
        this.circuitBreakers.set(operationName, new CircuitBreaker(circuitBreakerConfig));
      }
      circuitBreaker = this.circuitBreakers.get(operationName)!;
    }

    while (attempt < config.maxAttempts) {
      try {
        attempt++;
        this.logger.debug(`Attempt ${attempt}/${config.maxAttempts} for ${operationName}`);

        if (circuitBreaker) {
          return await circuitBreaker.execute(operation);
        } else {
          return await operation();
        }
      } catch (error) {
        lastError = error as Error;

        // Check if we should retry based on error type
        if (!this.shouldRetry(error as Error)) {
          this.logger.warn(`Non-retryable error for ${operationName}: ${error}`);
          throw error;
        }

        if (attempt >= config.maxAttempts) {
          this.logger.error(`All ${config.maxAttempts} attempts failed for ${operationName}`);
          throw lastError;
        }

        // Calculate delay with exponential backoff
        const delay = this.calculateDelay(attempt, config);
        this.logger.debug(`Retrying ${operationName} in ${delay}ms (attempt ${attempt}/${config.maxAttempts})`);

        await this.sleep(delay);
      }
    }

    throw lastError!;
  }

  /**
   * Determines if an error should be retried
   */
  private shouldRetry(error: Error): boolean {
    // Don't retry on authentication errors
    if (error.message.includes('401') || error.message.includes('403')) {
      return false;
    }

    // Don't retry on client errors (4xx) except for rate limits
    if (error.message.includes('400') || error.message.includes('404')) {
      return false;
    }

    // Retry on server errors (5xx) and rate limits
    if (error.message.includes('500') || error.message.includes('502') ||
      error.message.includes('503') || error.message.includes('504') ||
      error.message.includes('429')) {
      return true;
    }

    // Retry on network errors
    if (error.message.includes('ECONNRESET') || error.message.includes('ENOTFOUND') ||
      error.message.includes('ETIMEDOUT') || error.message.includes('ECONNREFUSED')) {
      return true;
    }

    // Default to retrying for unknown errors
    return true;
  }

  /**
   * Calculates delay with exponential backoff and jitter
   */
  private calculateDelay(attempt: number, config: RetryConfig): number {
    const exponentialDelay = config.baseDelay * Math.pow(config.backoffMultiplier, attempt - 1);
    const delay = Math.min(exponentialDelay, config.maxDelay);

    // Add jitter to prevent thundering herd
    const jitter = Math.random() * 0.1 * delay;
    return delay + jitter;
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Gets circuit breaker state for monitoring
   */
  getCircuitBreakerState(operationName: string): string | undefined {
    const circuitBreaker = this.circuitBreakers.get(operationName);
    return circuitBreaker?.getState();
  }

  /**
   * Resets circuit breaker for testing
   */
  resetCircuitBreaker(operationName: string): void {
    this.circuitBreakers.delete(operationName);
  }
}

/**
 * Default retry configuration
 */
export const defaultRetryConfig: RetryConfig = {
  maxAttempts: 3,
  baseDelay: 1000, // 1 second
  maxDelay: 10000, // 10 seconds
  backoffMultiplier: 2,
  timeout: 30000, // 30 seconds
};

/**
 * Default circuit breaker configuration
 */
export const defaultCircuitBreakerConfig: CircuitBreakerConfig = {
  failureThreshold: 5,
  recoveryTimeout: 60000, // 1 minute
  halfOpenMaxAttempts: 3,
};

/**
 * Retry configuration for different operation types
 */
export const retryConfigs = {
  // Fast retries for simple operations
  fast: {
    ...defaultRetryConfig,
    maxAttempts: 2,
    baseDelay: 500,
    maxDelay: 2000,
  },

  // Standard retries for API calls
  standard: defaultRetryConfig,

  // Conservative retries for critical operations
  conservative: {
    ...defaultRetryConfig,
    maxAttempts: 5,
    baseDelay: 2000,
    maxDelay: 30000,
  },

  // Aggressive retries for rate-limited operations
  aggressive: {
    ...defaultRetryConfig,
    maxAttempts: 10,
    baseDelay: 100,
    maxDelay: 5000,
  },
} as const;

/**
 * Circuit breaker configurations for different services
 */
export const circuitBreakerConfigs = {
  // Conservative for external APIs
  api: {
    ...defaultCircuitBreakerConfig,
    failureThreshold: 3,
    recoveryTimeout: 120000, // 2 minutes
  },

  // Aggressive for local operations
  local: {
    ...defaultCircuitBreakerConfig,
    failureThreshold: 10,
    recoveryTimeout: 30000, // 30 seconds
  },
} as const;
