import { Logger } from '@nestjs/common';
import { PerformanceMonitor } from './performance.monitor';

describe('PerformanceMonitor', () => {
  let mockLogger: jest.Mocked<Logger>;

  beforeEach(() => {
    mockLogger = {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
      verbose: jest.fn(),
    } as any;

    PerformanceMonitor.initialize(mockLogger);
    PerformanceMonitor.clearMetrics();
  });

  describe('measureOperation', () => {
    it('should measure successful operation', async () => {
      const operation = jest.fn().mockResolvedValue('success');

      const result = await PerformanceMonitor.measureOperation(
        operation,
        'testOperation'
      );

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(1);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringMatching(/Operation testOperation completed in \d+ms/),
        expect.objectContaining({
          operation: 'testOperation',
          duration: expect.any(Number),
          success: true,
        })
      );
    });

    it('should measure failed operation', async () => {
      const error = new Error('Test error');
      const operation = jest.fn().mockRejectedValue(error);

      await expect(
        PerformanceMonitor.measureOperation(operation, 'testOperation')
      ).rejects.toThrow('Test error');

      expect(operation).toHaveBeenCalledTimes(1);
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringMatching(/Operation testOperation failed after \d+ms/),
        expect.objectContaining({
          operation: 'testOperation',
          duration: expect.any(Number),
          error: 'Test error',
        })
      );
    });

    it('should warn for slow operations', async () => {
      const operation = jest.fn().mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 6000));
        return 'slow';
      });

      const result = await PerformanceMonitor.measureOperation(
        operation,
        'slowOperation'
      );

      expect(result).toBe('slow');
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringMatching(/Slow operation detected: slowOperation took \d+ms/),
        expect.objectContaining({
          operation: 'slowOperation',
          duration: expect.any(Number),
          threshold: 5000,
        })
      );
    }, 10000);

    it('should include context in logs', async () => {
      const operation = jest.fn().mockResolvedValue('success');
      const context = { userId: '123', action: 'test' };

      await PerformanceMonitor.measureOperation(
        operation,
        'testOperation',
        context
      );

      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringMatching(/Operation testOperation completed in \d+ms/),
        expect.objectContaining({
          ...context,
        })
      );
    });
  });

  describe('measureSyncOperation', () => {
    it('should measure successful sync operation', () => {
      const operation = jest.fn().mockReturnValue('success');

      const result = PerformanceMonitor.measureSyncOperation(
        operation,
        'testSyncOperation'
      );

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(1);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringMatching(/Sync operation testSyncOperation completed in \d+ms/),
        expect.objectContaining({
          operation: 'testSyncOperation',
          duration: expect.any(Number),
          success: true,
        })
      );
    });

    it('should measure failed sync operation', () => {
      const error = new Error('Sync test error');
      const operation = jest.fn().mockImplementation(() => {
        throw error;
      });

      expect(() =>
        PerformanceMonitor.measureSyncOperation(operation, 'testSyncOperation')
      ).toThrow('Sync test error');

      expect(operation).toHaveBeenCalledTimes(1);
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringMatching(/Sync operation testSyncOperation failed after \d+ms/),
        expect.objectContaining({
          operation: 'testSyncOperation',
          duration: expect.any(Number),
          error: 'Sync test error',
        })
      );
    });
  });

  describe('getOperationStats', () => {
    it('should return null for non-existent operation', () => {
      const stats = PerformanceMonitor.getOperationStats('nonExistent');

      expect(stats).toBeNull();
    });

    it('should return stats for operation with metrics', async () => {
      const operation = jest.fn().mockResolvedValue('success');

      await PerformanceMonitor.measureOperation(operation, 'testOperation');
      await PerformanceMonitor.measureOperation(operation, 'testOperation');

      const stats = PerformanceMonitor.getOperationStats('testOperation');

      expect(stats).toEqual({
        count: 2,
        successCount: 2,
        failureCount: 0,
        averageDuration: expect.any(Number),
        minDuration: expect.any(Number),
        maxDuration: expect.any(Number),
        successRate: 100,
      });
    });

    it('should calculate stats correctly with failures', async () => {
      const successOperation = jest.fn().mockResolvedValue('success');
      const failureOperation = jest.fn().mockImplementation(() => {
        throw new Error('fail');
      });

      await PerformanceMonitor.measureOperation(successOperation, 'mixedOperation');
      await expect(
        PerformanceMonitor.measureOperation(failureOperation, 'mixedOperation')
      ).rejects.toThrow('fail');

      const stats = PerformanceMonitor.getOperationStats('mixedOperation');

      expect(stats).toEqual({
        count: 2,
        successCount: 1,
        failureCount: 1,
        averageDuration: expect.any(Number),
        minDuration: expect.any(Number),
        maxDuration: expect.any(Number),
        successRate: 50,
      });
    });
  });

  describe('getAllOperationStats', () => {
    it('should return stats for all operations', async () => {
      const operation1 = jest.fn().mockResolvedValue('success');
      const operation2 = jest.fn().mockResolvedValue('success');

      await PerformanceMonitor.measureOperation(operation1, 'operation1');
      await PerformanceMonitor.measureOperation(operation2, 'operation2');

      const stats = PerformanceMonitor.getAllOperationStats();

      expect(stats).toHaveProperty('operation1');
      expect(stats).toHaveProperty('operation2');
      expect(Object.keys(stats)).toHaveLength(2);
    });
  });

  describe('logPerformanceSummary', () => {
    it('should log summary when metrics exist', async () => {
      const operation = jest.fn().mockResolvedValue('success');

      await PerformanceMonitor.measureOperation(operation, 'testOperation');

      PerformanceMonitor.logPerformanceSummary();

      expect(mockLogger.log).toHaveBeenCalledWith(
        'Performance Summary:',
        expect.objectContaining({
          totalOperations: 1,
          operations: expect.any(Object),
        })
      );
    });

    it('should log no metrics message when no metrics exist', () => {
      PerformanceMonitor.clearMetrics();

      PerformanceMonitor.logPerformanceSummary();

      expect(mockLogger.log).toHaveBeenCalledWith('No performance metrics available');
    });
  });

  describe('clearMetrics', () => {
    it('should clear all metrics', async () => {
      const operation = jest.fn().mockResolvedValue('success');

      await PerformanceMonitor.measureOperation(operation, 'testOperation');

      let stats = PerformanceMonitor.getOperationStats('testOperation');
      expect(stats).not.toBeNull();

      PerformanceMonitor.clearMetrics();

      stats = PerformanceMonitor.getOperationStats('testOperation');
      expect(stats).toBeNull();
    });
  });

  describe('clearOperationMetrics', () => {
    it('should clear metrics for specific operation', async () => {
      const operation = jest.fn().mockResolvedValue('success');

      await PerformanceMonitor.measureOperation(operation, 'operation1');
      await PerformanceMonitor.measureOperation(operation, 'operation2');

      let stats1 = PerformanceMonitor.getOperationStats('operation1');
      let stats2 = PerformanceMonitor.getOperationStats('operation2');
      expect(stats1).not.toBeNull();
      expect(stats2).not.toBeNull();

      PerformanceMonitor.clearOperationMetrics('operation1');

      stats1 = PerformanceMonitor.getOperationStats('operation1');
      stats2 = PerformanceMonitor.getOperationStats('operation2');
      expect(stats1).toBeNull();
      expect(stats2).not.toBeNull();
    });
  });

  describe('getMemoryUsage', () => {
    it('should return memory usage information', () => {
      const memory = PerformanceMonitor.getMemoryUsage();

      expect(memory).toHaveProperty('heapUsed');
      expect(memory).toHaveProperty('heapTotal');
      expect(memory).toHaveProperty('external');
      expect(memory).toHaveProperty('rss');
      expect(typeof memory.heapUsed).toBe('number');
      expect(typeof memory.heapTotal).toBe('number');
      expect(typeof memory.external).toBe('number');
      expect(typeof memory.rss).toBe('number');
    });
  });

  describe('logMemoryUsage', () => {
    it('should log memory usage', () => {
      PerformanceMonitor.logMemoryUsage('test context');

      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Memory usage (test context):',
        expect.objectContaining({
          heapUsed: expect.stringMatching(/\d+MB/),
          heapTotal: expect.stringMatching(/\d+MB/),
          external: expect.stringMatching(/\d+MB/),
          rss: expect.stringMatching(/\d+MB/),
        })
      );
    });

    it('should log memory usage without context', () => {
      PerformanceMonitor.logMemoryUsage();

      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Memory usage:',
        expect.objectContaining({
          heapUsed: expect.stringMatching(/\d+MB/),
          heapTotal: expect.stringMatching(/\d+MB/),
          external: expect.stringMatching(/\d+MB/),
          rss: expect.stringMatching(/\d+MB/),
        })
      );
    });
  });

  describe('initialization', () => {
    it('should throw error when not initialized', async () => {
      // Reset the static logger
      (PerformanceMonitor as any).logger = undefined;

      await expect(
        PerformanceMonitor.measureOperation(async () => 'test', 'test')
      ).rejects.toThrow('PerformanceMonitor not initialized. Call initialize() first.');
    });

    afterEach(() => {
      // Re-initialize for other tests
      PerformanceMonitor.initialize(mockLogger);
    });
  });
});
