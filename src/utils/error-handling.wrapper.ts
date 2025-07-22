import { Logger } from '@nestjs/common';
import { ErrorUtils } from './error.utils';

/**
 * Comprehensive error handling wrapper for application operations
 */
export class ErrorHandlingWrapper {
  private readonly logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  /**
   * Wrap a service operation with comprehensive error handling
   */
  async withServiceErrorHandling<T>(
    operation: () => Promise<T>,
    serviceName: string,
    operationName: string,
    context?: Record<string, any>
  ): Promise<T> {
    return ErrorUtils.withComprehensiveErrorHandling(
      operation,
      this.logger,
      `${serviceName}.${operationName}`,
      { service: serviceName, operation: operationName, ...context }
    );
  }

  /**
   * Wrap a file system operation with error handling
   */
  async withFileSystemErrorHandling<T>(
    operation: () => Promise<T>,
    operationName: string,
    filePath?: string,
    context?: Record<string, any>
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      const appError = ErrorUtils.normalizeError(error as Error, {
        operation: operationName,
        filePath,
        ...context,
      });

      if (ErrorUtils.isFileSystemError(appError)) {
        this.logger.error(`File system error in ${operationName}:`, {
          filePath,
          error: ErrorUtils.extractErrorContext(appError),
          ...context,
        });
      } else {
        ErrorUtils.logError(this.logger, appError, operationName, { filePath, ...context });
      }

      throw appError;
    }
  }

  /**
   * Wrap a configuration operation with error handling
   */
  async withConfigurationErrorHandling<T>(
    operation: () => Promise<T>,
    operationName: string,
    context?: Record<string, any>
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      const appError = ErrorUtils.normalizeError(error as Error, {
        operation: operationName,
        ...context,
      });

      if (ErrorUtils.isConfigurationError(appError)) {
        this.logger.error(`Configuration error in ${operationName}:`, {
          error: ErrorUtils.extractErrorContext(appError),
          ...context,
        });
      } else {
        ErrorUtils.logError(this.logger, appError, operationName, context);
      }

      throw appError;
    }
  }

  /**
   * Wrap an API operation with retry logic and error handling
   */
  async withApiErrorHandling<T>(
    operation: () => Promise<T>,
    serviceName: string,
    operationName: string,
    context?: Record<string, any>
  ): Promise<T> {
    return ErrorUtils.withRetryLogic(
      () => ErrorUtils.withComprehensiveErrorHandling(
        operation,
        this.logger,
        `${serviceName}.${operationName}`,
        { service: serviceName, operation: operationName, ...context }
      ),
      this.logger,
      `${serviceName}.${operationName}`,
      3,
      { service: serviceName, operation: operationName, ...context }
    );
  }

  /**
   * Wrap a data processing operation with error handling
   */
  async withDataProcessingErrorHandling<T>(
    operation: () => Promise<T>,
    operationName: string,
    dataType?: string,
    context?: Record<string, any>
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      const appError = ErrorUtils.normalizeError(error as Error, {
        operation: operationName,
        dataType,
        ...context,
      });

      if (ErrorUtils.isDataProcessingError(appError)) {
        this.logger.error(`Data processing error in ${operationName}:`, {
          dataType,
          error: ErrorUtils.extractErrorContext(appError),
          ...context,
        });
      } else {
        ErrorUtils.logError(this.logger, appError, operationName, { dataType, ...context });
      }

      throw appError;
    }
  }

  /**
   * Wrap an authentication operation with error handling
   */
  async withAuthErrorHandling<T>(
    operation: () => Promise<T>,
    serviceName: string,
    operationName: string,
    context?: Record<string, any>
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      const appError = ErrorUtils.normalizeError(error as Error, {
        service: serviceName,
        operation: operationName,
        ...context,
      });

      if (ErrorUtils.isAuthError(appError)) {
        this.logger.error(`Authentication error in ${serviceName}.${operationName}:`, {
          service: serviceName,
          error: ErrorUtils.extractErrorContext(appError),
          ...context,
        });
      } else {
        ErrorUtils.logError(this.logger, appError, `${serviceName}.${operationName}`, context);
      }

      throw appError;
    }
  }

  /**
   * Wrap a CLI operation with user-friendly error handling
   */
  async withCliErrorHandling<T>(
    operation: () => Promise<T>,
    operationName: string,
    context?: Record<string, any>
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      const appError = ErrorUtils.normalizeError(error as Error, {
        operation: operationName,
        ...context,
      });

      const userMessage = ErrorUtils.getUserFriendlyMessage(appError);
      const suggestions = ErrorUtils.getRecoverySuggestions(appError);

      // Log the full error for debugging
      ErrorUtils.logError(this.logger, appError, operationName, context);

      // Display user-friendly message
      console.error(`\n❌ Error: ${userMessage}`);

      if (suggestions.length > 0) {
        console.error('\n💡 Suggestions:');
        suggestions.forEach(suggestion => console.error(`  • ${suggestion}`));
      }

      throw appError;
    }
  }

  /**
   * Wrap an operation with graceful fallback
   */
  async withGracefulFallback<T>(
    primaryOperation: () => Promise<T>,
    fallbackOperation: () => Promise<T>,
    operationName: string,
    context?: Record<string, any>
  ): Promise<T> {
    return ErrorUtils.withGracefulFallback(
      primaryOperation,
      fallbackOperation,
      this.logger,
      operationName,
      context
    );
  }

  /**
   * Handle errors with custom recovery strategies
   */
  async withCustomRecovery<T>(
    operation: () => Promise<T>,
    operationName: string,
    recoveryStrategies: {
      onAuthError?: () => Promise<T>;
      onConfigError?: () => Promise<T>;
      onFileSystemError?: () => Promise<T>;
      onDataProcessingError?: () => Promise<T>;
      onNetworkError?: () => Promise<T>;
    },
    context?: Record<string, any>
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      const appError = ErrorUtils.normalizeError(error as Error, {
        operation: operationName,
        ...context,
      });

      // Try custom recovery strategies based on error type
      if (ErrorUtils.isAuthError(appError) && recoveryStrategies.onAuthError) {
        this.logger.warn(`Trying auth error recovery for ${operationName}`);
        return await recoveryStrategies.onAuthError();
      }

      if (ErrorUtils.isConfigurationError(appError) && recoveryStrategies.onConfigError) {
        this.logger.warn(`Trying config error recovery for ${operationName}`);
        return await recoveryStrategies.onConfigError();
      }

      if (ErrorUtils.isFileSystemError(appError) && recoveryStrategies.onFileSystemError) {
        this.logger.warn(`Trying file system error recovery for ${operationName}`);
        return await recoveryStrategies.onFileSystemError();
      }

      if (ErrorUtils.isDataProcessingError(appError) && recoveryStrategies.onDataProcessingError) {
        this.logger.warn(`Trying data processing error recovery for ${operationName}`);
        return await recoveryStrategies.onDataProcessingError();
      }

      if (ErrorUtils.isRetryableError(appError) && recoveryStrategies.onNetworkError) {
        this.logger.warn(`Trying network error recovery for ${operationName}`);
        return await recoveryStrategies.onNetworkError();
      }

      // If no recovery strategy or recovery failed, log and re-throw
      ErrorUtils.logError(this.logger, appError, operationName, context);
      throw appError;
    }
  }
}
