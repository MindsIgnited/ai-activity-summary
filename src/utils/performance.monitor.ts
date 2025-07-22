import { Logger } from '@nestjs/common';

/**
 * Performance monitoring utility for tracking operation metrics
 */
export class PerformanceMonitor {
  private static metrics: Map<string, Array<{ duration: number; timestamp: number; success: boolean }>> = new Map();
  private static logger: Logger;

  /**
   * Initialize the performance monitor with a logger
   */
  static initialize(logger: Logger): void {
    this.logger = logger;
  }

  /**
   * Measure an operation and track its performance
   */
  static async measureOperation<T>(
    operation: () => Promise<T>,
    operationName: string,
    context?: Record<string, any>
  ): Promise<T> {
    if (!this.logger) {
      throw new Error('PerformanceMonitor not initialized. Call initialize() first.');
    }

    const start = Date.now();
    const startMemory = process.memoryUsage();
    let success = false;

    try {
      const result = await operation();
      success = true;

      const duration = Date.now() - start;
      const memoryDelta = this.calculateMemoryDelta(startMemory);

      this.recordMetric(operationName, duration, success);

      this.logger.debug(`Operation ${operationName} completed in ${duration}ms`, {
        operation: operationName,
        duration,
        memoryDelta,
        success,
        ...context,
      });

      // Log warnings for slow operations
      if (duration > 5000) {
        this.logger.warn(`Slow operation detected: ${operationName} took ${duration}ms`, {
          operation: operationName,
          duration,
          threshold: 5000,
          ...context,
        });
      }

      return result;
    } catch (error) {
      const duration = Date.now() - start;
      this.recordMetric(operationName, duration, success);

      this.logger.error(`Operation ${operationName} failed after ${duration}ms`, {
        operation: operationName,
        duration,
        error: error instanceof Error ? error.message : String(error),
        ...context,
      });

      throw error;
    }
  }

  /**
   * Measure a synchronous operation
   */
  static measureSyncOperation<T>(
    operation: () => T,
    operationName: string,
    context?: Record<string, any>
  ): T {
    if (!this.logger) {
      throw new Error('PerformanceMonitor not initialized. Call initialize() first.');
    }

    const start = Date.now();
    const startMemory = process.memoryUsage();
    let success = false;

    try {
      const result = operation();
      success = true;

      const duration = Date.now() - start;
      const memoryDelta = this.calculateMemoryDelta(startMemory);

      this.recordMetric(operationName, duration, success);

      this.logger.debug(`Sync operation ${operationName} completed in ${duration}ms`, {
        operation: operationName,
        duration,
        memoryDelta,
        success,
        ...context,
      });

      return result;
    } catch (error) {
      const duration = Date.now() - start;
      this.recordMetric(operationName, duration, success);

      this.logger.error(`Sync operation ${operationName} failed after ${duration}ms`, {
        operation: operationName,
        duration,
        error: error instanceof Error ? error.message : String(error),
        ...context,
      });

      throw error;
    }
  }

  /**
   * Record a performance metric
   */
  private static recordMetric(operationName: string, duration: number, success: boolean): void {
    if (!this.metrics.has(operationName)) {
      this.metrics.set(operationName, []);
    }

    const operationMetrics = this.metrics.get(operationName)!;
    operationMetrics.push({
      duration,
      timestamp: Date.now(),
      success,
    });

    // Keep only the last 100 metrics per operation
    if (operationMetrics.length > 100) {
      operationMetrics.splice(0, operationMetrics.length - 100);
    }
  }

  /**
   * Calculate memory usage delta
   */
  private static calculateMemoryDelta(startMemory: NodeJS.MemoryUsage): {
    heapUsed: number;
    heapTotal: number;
    external: number;
    rss: number;
  } {
    const currentMemory = process.memoryUsage();

    return {
      heapUsed: currentMemory.heapUsed - startMemory.heapUsed,
      heapTotal: currentMemory.heapTotal - startMemory.heapTotal,
      external: currentMemory.external - startMemory.external,
      rss: currentMemory.rss - startMemory.rss,
    };
  }

  /**
   * Get performance statistics for an operation
   */
  static getOperationStats(operationName: string): {
    count: number;
    successCount: number;
    failureCount: number;
    averageDuration: number;
    minDuration: number;
    maxDuration: number;
    successRate: number;
  } | null {
    const metrics = this.metrics.get(operationName);
    if (!metrics || metrics.length === 0) {
      return null;
    }

    const durations = metrics.map(m => m.duration);
    const successCount = metrics.filter(m => m.success).length;
    const failureCount = metrics.length - successCount;

    return {
      count: metrics.length,
      successCount,
      failureCount,
      averageDuration: durations.reduce((a, b) => a + b, 0) / durations.length,
      minDuration: Math.min(...durations),
      maxDuration: Math.max(...durations),
      successRate: (successCount / metrics.length) * 100,
    };
  }

  /**
   * Get performance statistics for all operations
   */
  static getAllOperationStats(): Record<string, {
    count: number;
    successCount: number;
    failureCount: number;
    averageDuration: number;
    minDuration: number;
    maxDuration: number;
    successRate: number;
  }> {
    const stats: Record<string, any> = {};

    for (const [operationName] of this.metrics) {
      const operationStats = this.getOperationStats(operationName);
      if (operationStats) {
        stats[operationName] = operationStats;
      }
    }

    return stats;
  }

  /**
   * Log performance summary
   */
  static logPerformanceSummary(): void {
    if (!this.logger) {
      throw new Error('PerformanceMonitor not initialized. Call initialize() first.');
    }

    const stats = this.getAllOperationStats();

    if (Object.keys(stats).length === 0) {
      this.logger.log('No performance metrics available');
      return;
    }

    this.logger.log('Performance Summary:', {
      totalOperations: Object.keys(stats).length,
      operations: stats,
    });

    // Log slowest operations
    const slowestOperations = Object.entries(stats)
      .sort(([, a], [, b]) => b.averageDuration - a.averageDuration)
      .slice(0, 5);

    if (slowestOperations.length > 0) {
      this.logger.log('Slowest operations:', {
        slowest: slowestOperations.map(([name, stats]) => ({
          operation: name,
          averageDuration: stats.averageDuration,
          count: stats.count,
        })),
      });
    }

    // Log operations with low success rates
    const lowSuccessRateOperations = Object.entries(stats)
      .filter(([, stats]) => stats.successRate < 90)
      .sort(([, a], [, b]) => a.successRate - b.successRate);

    if (lowSuccessRateOperations.length > 0) {
      this.logger.warn('Operations with low success rates:', {
        lowSuccessRate: lowSuccessRateOperations.map(([name, stats]) => ({
          operation: name,
          successRate: stats.successRate,
          failureCount: stats.failureCount,
        })),
      });
    }
  }

  /**
   * Clear all performance metrics
   */
  static clearMetrics(): void {
    this.metrics.clear();
  }

  /**
   * Clear metrics for a specific operation
   */
  static clearOperationMetrics(operationName: string): void {
    this.metrics.delete(operationName);
  }

  /**
   * Get memory usage information
   */
  static getMemoryUsage(): {
    heapUsed: number;
    heapTotal: number;
    external: number;
    rss: number;
  } {
    const memory = process.memoryUsage();
    return {
      heapUsed: memory.heapUsed,
      heapTotal: memory.heapTotal,
      external: memory.external,
      rss: memory.rss,
    };
  }

  /**
   * Log current memory usage
   */
  static logMemoryUsage(context?: string): void {
    if (!this.logger) {
      throw new Error('PerformanceMonitor not initialized. Call initialize() first.');
    }

    const memory = this.getMemoryUsage();
    const contextStr = context ? ` (${context})` : '';

    this.logger.debug(`Memory usage${contextStr}:`, {
      heapUsed: `${Math.round(memory.heapUsed / 1024 / 1024)}MB`,
      heapTotal: `${Math.round(memory.heapTotal / 1024 / 1024)}MB`,
      external: `${Math.round(memory.external / 1024 / 1024)}MB`,
      rss: `${Math.round(memory.rss / 1024 / 1024)}MB`,
    });
  }
}
