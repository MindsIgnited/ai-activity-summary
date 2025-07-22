import { Logger } from '@nestjs/common';
import { ErrorHandlingWrapper } from './error-handling.wrapper';
import { ErrorUtils, AuthError, ConfigurationError, FileSystemError, DataProcessingError } from './error.utils';

describe('ErrorHandlingWrapper', () => {
  let wrapper: ErrorHandlingWrapper;
  let mockLogger: jest.Mocked<Logger>;

  beforeEach(() => {
    mockLogger = {
      error: jest.fn(),
      warn: jest.fn(),
      log: jest.fn(),
      debug: jest.fn(),
      verbose: jest.fn(),
    } as any;

    wrapper = new ErrorHandlingWrapper(mockLogger);
  });

  describe('withServiceErrorHandling', () => {
    it('should execute operation successfully', async () => {
      const operation = jest.fn().mockResolvedValue('success');

      const result = await wrapper.withServiceErrorHandling(
        operation,
        'TestService',
        'testOperation'
      );

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should handle errors with comprehensive logging', async () => {
      const error = new Error('Test error');
      const operation = jest.fn().mockRejectedValue(error);

      await expect(wrapper.withServiceErrorHandling(
        operation,
        'TestService',
        'testOperation'
      )).rejects.toThrow();

      expect(mockLogger.warn).toHaveBeenCalled();
    });
  });

  describe('withFileSystemErrorHandling', () => {
    it('should handle file system errors specifically', async () => {
      const fsError = new Error('ENOENT: no such file or directory');
      const operation = jest.fn().mockRejectedValue(fsError);

      await expect(wrapper.withFileSystemErrorHandling(
        operation,
        'readFile',
        '/path/to/file'
      )).rejects.toThrow();

      expect(mockLogger.error).toHaveBeenCalledWith(
        'File system error in readFile:',
        expect.objectContaining({
          filePath: '/path/to/file',
          error: expect.any(Object),
        })
      );
    });
  });

  describe('withConfigurationErrorHandling', () => {
    it('should handle configuration errors specifically', async () => {
      const configError = new ConfigurationError('Missing required field', 'test', 'field');
      const operation = jest.fn().mockRejectedValue(configError);

      await expect(wrapper.withConfigurationErrorHandling(
        operation,
        'loadConfig'
      )).rejects.toThrow();

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Configuration error in loadConfig:',
        expect.objectContaining({
          error: expect.any(Object),
        })
      );
    });
  });

  describe('withApiErrorHandling', () => {
    it('should retry on retryable errors', async () => {
      const networkError = new Error('ECONNRESET');
      const operation = jest.fn()
        .mockRejectedValueOnce(networkError)
        .mockRejectedValueOnce(networkError)
        .mockResolvedValue('success');

      const result = await wrapper.withApiErrorHandling(
        operation,
        'TestAPI',
        'fetchData'
      );

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(3);
    });

    it('should not retry on non-retryable errors', async () => {
      const authError = new AuthError('Invalid token', 'TestAPI');
      const operation = jest.fn().mockRejectedValue(authError);

      await expect(wrapper.withApiErrorHandling(
        operation,
        'TestAPI',
        'fetchData'
      )).rejects.toThrow();

      expect(operation).toHaveBeenCalledTimes(1);
    });
  });

  describe('withDataProcessingErrorHandling', () => {
    it('should handle data processing errors specifically', async () => {
      const dataError = new DataProcessingError('Invalid JSON format', 'parse', 'json');
      const operation = jest.fn().mockRejectedValue(dataError);

      await expect(wrapper.withDataProcessingErrorHandling(
        operation,
        'parseData',
        'json'
      )).rejects.toThrow();

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Data processing error in parseData:',
        expect.objectContaining({
          dataType: 'json',
          error: expect.any(Object),
        })
      );
    });
  });

  describe('withAuthErrorHandling', () => {
    it('should handle authentication errors specifically', async () => {
      const authError = new AuthError('Invalid credentials', 'TestService');
      const operation = jest.fn().mockRejectedValue(authError);

      await expect(wrapper.withAuthErrorHandling(
        operation,
        'TestService',
        'authenticate'
      )).rejects.toThrow();

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Authentication error in TestService.authenticate:',
        expect.objectContaining({
          service: 'TestService',
          error: expect.any(Object),
        })
      );
    });
  });

  describe('withCliErrorHandling', () => {
    it('should display user-friendly error messages', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      const validationError = ErrorUtils.createCliValidationError('Invalid argument', 'test');
      const operation = jest.fn().mockRejectedValue(validationError);

      await expect(wrapper.withCliErrorHandling(
        operation,
        'cliOperation'
      )).rejects.toThrow();

      expect(consoleSpy).toHaveBeenCalledWith('\n❌ Error: Invalid argument');
      expect(consoleSpy).toHaveBeenCalledWith('\n💡 Suggestions:');

      consoleSpy.mockRestore();
    });
  });

  describe('withGracefulFallback', () => {
    it('should try fallback when primary operation fails', async () => {
      const primaryOperation = jest.fn().mockRejectedValue(new Error('Primary failed'));
      const fallbackOperation = jest.fn().mockResolvedValue('fallback success');

      const result = await wrapper.withGracefulFallback(
        primaryOperation,
        fallbackOperation,
        'testOperation'
      );

      expect(result).toBe('fallback success');
      expect(primaryOperation).toHaveBeenCalledTimes(1);
      expect(fallbackOperation).toHaveBeenCalledTimes(1);
      expect(mockLogger.warn).toHaveBeenCalled();
    });

    it('should throw error when both operations fail', async () => {
      const primaryOperation = jest.fn().mockRejectedValue(new Error('Primary failed'));
      const fallbackOperation = jest.fn().mockRejectedValue(new Error('Fallback failed'));

      await expect(wrapper.withGracefulFallback(
        primaryOperation,
        fallbackOperation,
        'testOperation'
      )).rejects.toThrow('Fallback failed');

      expect(primaryOperation).toHaveBeenCalledTimes(1);
      expect(fallbackOperation).toHaveBeenCalledTimes(1);
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('withCustomRecovery', () => {
    it('should try auth error recovery strategy', async () => {
      const authError = new AuthError('Invalid token', 'TestService');
      const operation = jest.fn().mockRejectedValue(authError);
      const authRecovery = jest.fn().mockResolvedValue('auth recovery success');

      const result = await wrapper.withCustomRecovery(
        operation,
        'testOperation',
        { onAuthError: authRecovery }
      );

      expect(result).toBe('auth recovery success');
      expect(operation).toHaveBeenCalledTimes(1);
      expect(authRecovery).toHaveBeenCalledTimes(1);
      expect(mockLogger.warn).toHaveBeenCalledWith('Trying auth error recovery for testOperation');
    });

    it('should try config error recovery strategy', async () => {
      const configError = new ConfigurationError('Missing config', 'test', 'field');
      const operation = jest.fn().mockRejectedValue(configError);
      const configRecovery = jest.fn().mockResolvedValue('config recovery success');

      const result = await wrapper.withCustomRecovery(
        operation,
        'testOperation',
        { onConfigError: configRecovery }
      );

      expect(result).toBe('config recovery success');
      expect(operation).toHaveBeenCalledTimes(1);
      expect(configRecovery).toHaveBeenCalledTimes(1);
      expect(mockLogger.warn).toHaveBeenCalledWith('Trying config error recovery for testOperation');
    });

    it('should throw error when no recovery strategy matches', async () => {
      const unknownError = new Error('Unknown error');
      const operation = jest.fn().mockRejectedValue(unknownError);

      await expect(wrapper.withCustomRecovery(
        operation,
        'testOperation',
        {}
      )).rejects.toThrow('Unknown error');

      expect(operation).toHaveBeenCalledTimes(1);
      expect(mockLogger.warn).toHaveBeenCalled();
    });
  });
});
