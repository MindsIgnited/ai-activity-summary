import { Logger } from '@nestjs/common';

/**
 * Base error class for all application errors
 */
export abstract class AppError extends Error {
  public readonly code: string;
  public readonly context?: Record<string, any>;
  public readonly isRetryable: boolean;

  constructor(
    message: string,
    code: string,
    context?: Record<string, any>,
    isRetryable: boolean = false
  ) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.context = context;
    this.isRetryable = isRetryable;
  }
}

/**
 * API-related errors
 */
export class ApiError extends AppError {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly service: string,
    public readonly endpoint?: string,
    context?: Record<string, any>
  ) {
    const isRetryable = statusCode >= 500 || statusCode === 429;
    super(message, `API_${statusCode}`, { service, endpoint, ...context }, isRetryable);
  }
}

/**
 * Authentication and authorization errors
 */
export class AuthError extends AppError {
  constructor(
    message: string,
    public readonly service: string,
    context?: Record<string, any>
  ) {
    super(message, 'AUTH_ERROR', { service, ...context }, false);
  }
}

/**
 * Configuration errors
 */
export class ConfigurationError extends AppError {
  constructor(
    message: string,
    public readonly section: string,
    public readonly field?: string,
    context?: Record<string, any>
  ) {
    super(message, 'CONFIG_ERROR', { section, field, ...context }, false);
  }
}

/**
 * Validation errors
 */
export class ValidationError extends AppError {
  constructor(
    message: string,
    public readonly field: string,
    public readonly value?: any,
    context?: Record<string, any>
  ) {
    super(message, 'VALIDATION_ERROR', { field, value, ...context }, false);
  }
}

/**
 * File system errors
 */
export class FileSystemError extends AppError {
  constructor(
    message: string,
    public readonly operation: string,
    public readonly path?: string,
    context?: Record<string, any>
  ) {
    super(message, 'FILE_SYSTEM_ERROR', { operation, path, ...context }, false);
  }
}

/**
 * Network and connection errors
 */
export class NetworkError extends AppError {
  constructor(
    message: string,
    public readonly service: string,
    public readonly endpoint?: string,
    context?: Record<string, any>
  ) {
    super(message, 'NETWORK_ERROR', { service, endpoint, ...context }, true);
  }
}

/**
 * Rate limiting errors
 */
export class RateLimitError extends AppError {
  constructor(
    message: string,
    public readonly service: string,
    public readonly retryAfter?: number,
    context?: Record<string, any>
  ) {
    super(message, 'RATE_LIMIT_ERROR', { service, retryAfter, ...context }, true);
  }
}

/**
 * Timeout errors
 */
export class TimeoutError extends AppError {
  constructor(
    message: string,
    public readonly service: string,
    public readonly timeoutMs: number,
    context?: Record<string, any>
  ) {
    super(message, 'TIMEOUT_ERROR', { service, timeoutMs, ...context }, true);
  }
}

/**
 * AI provider specific errors
 */
export class AiProviderError extends AppError {
  constructor(
    message: string,
    public readonly provider: string,
    public readonly model?: string,
    context?: Record<string, any>
  ) {
    super(message, 'AI_PROVIDER_ERROR', { provider, model, ...context }, true);
  }
}

/**
 * Data processing errors
 */
export class DataProcessingError extends AppError {
  constructor(
    message: string,
    public readonly operation: string,
    public readonly dataType?: string,
    context?: Record<string, any>
  ) {
    super(message, 'DATA_PROCESSING_ERROR', { operation, dataType, ...context }, false);
  }
}

/**
 * Error utilities and helpers
 */
export class ErrorUtils {
  private static readonly logger = new Logger(ErrorUtils.name);

  /**
   * Create an API error from a response
   */
  static createApiError(
    response: Response,
    service: string,
    endpoint?: string,
    context?: Record<string, any>
  ): ApiError {
    const message = `${service} API request failed: ${response.status} ${response.statusText}`;
    return new ApiError(message, response.status, service, endpoint, context);
  }

  /**
   * Create a validation error for CLI arguments
   */
  static createCliValidationError(
    message: string,
    argument?: string,
    value?: any,
    context?: Record<string, any>
  ): ValidationError {
    return new ValidationError(message, argument || 'cli', value, { ...context, source: 'cli' });
  }

  /**
   * Create a configuration error for missing or invalid settings
   */
  static createConfigurationError(
    message: string,
    section: string,
    field?: string,
    context?: Record<string, any>
  ): ConfigurationError {
    return new ConfigurationError(message, section, field, context);
  }

  /**
   * Create a file system error for file operations
   */
  static createFileSystemError(
    message: string,
    operation: string,
    path?: string,
    context?: Record<string, any>
  ): FileSystemError {
    return new FileSystemError(message, operation, path, context);
  }

  /**
   * Create a data processing error for data transformation issues
   */
  static createDataProcessingError(
    message: string,
    operation: string,
    dataType?: string,
    context?: Record<string, any>
  ): DataProcessingError {
    return new DataProcessingError(message, operation, dataType, context);
  }

  /**
   * Create a timeout error for operations that exceed time limits
   */
  static createTimeoutError(
    service: string,
    timeoutMs: number,
    endpoint?: string,
    context?: Record<string, any>
  ): TimeoutError {
    return new TimeoutError(`${service} operation timed out after ${timeoutMs}ms`, service, timeoutMs, { endpoint, ...context });
  }

  /**
   * Create a network error for connection issues
   */
  static createNetworkError(
    error: Error,
    service: string,
    endpoint?: string,
    context?: Record<string, any>
  ): NetworkError {
    const message = `${service} network error: ${error.message}`;
    return new NetworkError(message, service, endpoint, { originalError: error.message, ...context });
  }

  /**
   * Create a rate limit error for API throttling
   */
  static createRateLimitError(
    message: string,
    service: string,
    retryAfter?: number,
    context?: Record<string, any>
  ): RateLimitError {
    return new RateLimitError(message, service, retryAfter, context);
  }

  /**
   * Create an AI provider error for AI-related failures
   */
  static createAiProviderError(
    message: string,
    provider: string,
    model?: string,
    context?: Record<string, any>
  ): AiProviderError {
    return new AiProviderError(message, provider, model, context);
  }

  /**
   * Create an authentication error for credential issues
   */
  static createAuthError(
    message: string,
    service: string,
    context?: Record<string, any>
  ): AuthError {
    return new AuthError(message, service, context);
  }

  /**
   * Create a validation error
   */
  static createValidationError(
    message: string,
    field: string,
    value?: any,
    context?: Record<string, any>
  ): ValidationError {
    return new ValidationError(message, field, value, context);
  }

  /**
   * Check if an error is retryable
   */
  static isRetryableError(error: Error): boolean {
    if (error instanceof AppError) {
      return error.isRetryable;
    }

    // Check for common retryable error patterns
    const retryablePatterns = [
      /ECONNRESET/,
      /ENOTFOUND/,
      /ETIMEDOUT/,
      /ECONNREFUSED/,
      /timeout/i,
      /network/i,
      /temporary/i,
      /unavailable/i,
    ];

    return retryablePatterns.some(pattern => pattern.test(error.message));
  }

  /**
   * Check if an error is an authentication error
   */
  static isAuthError(error: Error): boolean {
    if (error instanceof AuthError) {
      return true;
    }

    const authPatterns = [
      /401/,
      /403/,
      /unauthorized/i,
      /forbidden/i,
      /authentication/i,
      /authorization/i,
      /invalid.*token/i,
      /expired.*token/i,
    ];

    return authPatterns.some(pattern => pattern.test(error.message));
  }

  /**
   * Check if an error is a rate limit error
   */
  static isRateLimitError(error: Error): boolean {
    if (error instanceof RateLimitError) {
      return true;
    }

    const rateLimitPatterns = [
      /429/,
      /rate.?limit/i,
      /too.?many.?requests/i,
      /quota.?exceeded/i,
      /throttle/i,
    ];

    return rateLimitPatterns.some(pattern => pattern.test(error.message));
  }

  /**
   * Check if an error is a timeout error
   */
  static isTimeoutError(error: Error): boolean {
    if (error instanceof TimeoutError) {
      return true;
    }

    const timeoutPatterns = [
      /timeout/i,
      /timed.?out/i,
      /abort/i,
    ];

    return timeoutPatterns.some(pattern => pattern.test(error.message));
  }

  /**
   * Check if an error is a configuration error
   */
  static isConfigurationError(error: Error): boolean {
    if (error instanceof ConfigurationError) {
      return true;
    }

    const configPatterns = [
      /configuration/i,
      /config/i,
      /missing.*required/i,
      /invalid.*value/i,
    ];

    return configPatterns.some(pattern => pattern.test(error.message));
  }

  /**
   * Check if an error is a validation error
   */
  static isValidationError(error: Error): boolean {
    if (error instanceof ValidationError) {
      return true;
    }

    const validationPatterns = [
      /validation/i,
      /invalid.*format/i,
      /missing.*required/i,
      /invalid.*argument/i,
    ];

    return validationPatterns.some(pattern => pattern.test(error.message));
  }

  /**
   * Check if an error is a file system error
   */
  static isFileSystemError(error: Error): boolean {
    if (error instanceof FileSystemError) {
      return true;
    }

    const fsPatterns = [
      /ENOENT/i,
      /EACCES/i,
      /EEXIST/i,
      /ENOTDIR/i,
      /EISDIR/i,
      /file.*not.*found/i,
      /permission.*denied/i,
      /already.*exists/i,
    ];

    return fsPatterns.some(pattern => pattern.test(error.message));
  }

  /**
   * Check if an error is a data processing error
   */
  static isDataProcessingError(error: Error): boolean {
    if (error instanceof DataProcessingError) {
      return true;
    }

    const dataPatterns = [
      /data.*processing/i,
      /invalid.*format/i,
      /parsing.*error/i,
      /serialization/i,
      /deserialization/i,
    ];

    return dataPatterns.some(pattern => pattern.test(error.message));
  }

  /**
   * Get error severity level for logging
   */
  static getErrorSeverity(error: Error): 'error' | 'warn' | 'debug' {
    if (error instanceof AppError) {
      if (error.isRetryable) {
        return 'warn';
      }
      if (error instanceof ValidationError || error instanceof ConfigurationError) {
        return 'warn';
      }
    }

    if (this.isAuthError(error)) {
      return 'error';
    }

    if (this.isConfigurationError(error)) {
      return 'warn';
    }

    if (this.isValidationError(error)) {
      return 'warn';
    }

    return 'error';
  }

  /**
   * Get user-friendly error message
   */
  static getUserFriendlyMessage(error: Error): string {
    if (error instanceof AppError) {
      return error.message;
    }

    // Handle common error patterns
    if (this.isAuthError(error)) {
      return 'Authentication failed. Please check your credentials.';
    }

    if (this.isConfigurationError(error)) {
      return 'Configuration error. Please check your environment variables.';
    }

    if (this.isValidationError(error)) {
      return 'Invalid input. Please check your arguments.';
    }

    if (this.isRateLimitError(error)) {
      return 'Rate limit exceeded. Please try again later.';
    }

    if (this.isTimeoutError(error)) {
      return 'Operation timed out. Please try again.';
    }

    if (this.isFileSystemError(error)) {
      return 'File system error. Please check file permissions and paths.';
    }

    if (this.isDataProcessingError(error)) {
      return 'Data processing error. Please check your data format.';
    }

    return error.message || 'An unexpected error occurred.';
  }

  /**
   * Get error recovery suggestions
   */
  static getRecoverySuggestions(error: Error): string[] {
    const suggestions: string[] = [];

    if (this.isAuthError(error)) {
      suggestions.push('Check your API credentials and tokens');
      suggestions.push('Verify your authentication configuration');
      suggestions.push('Ensure your tokens are not expired');
    }

    if (this.isConfigurationError(error)) {
      suggestions.push('Check your environment variables');
      suggestions.push('Verify your configuration settings');
      suggestions.push('Ensure all required fields are provided');
    }

    if (this.isValidationError(error)) {
      suggestions.push('Check your command line arguments');
      suggestions.push('Verify date formats (YYYY-MM-DD)');
      suggestions.push('Ensure output paths are directories');
    }

    if (this.isRateLimitError(error)) {
      suggestions.push('Wait before retrying the operation');
      suggestions.push('Check your API rate limits');
      suggestions.push('Consider using a different time period');
    }

    if (this.isTimeoutError(error)) {
      suggestions.push('Check your network connection');
      suggestions.push('Try again with a smaller date range');
      suggestions.push('Verify API endpoints are accessible');
    }

    if (this.isFileSystemError(error)) {
      suggestions.push('Check file and directory permissions');
      suggestions.push('Verify output paths exist and are writable');
      suggestions.push('Ensure sufficient disk space');
    }

    if (this.isDataProcessingError(error)) {
      suggestions.push('Check your data format');
      suggestions.push('Verify API responses are valid');
      suggestions.push('Try with a different date range');
    }

    if (suggestions.length === 0) {
      suggestions.push('Check the logs for more details');
      suggestions.push('Verify your configuration');
      suggestions.push('Try with a smaller dataset');
    }

    return suggestions;
  }

  /**
   * Wrap an operation with comprehensive error handling
   */
  static async withComprehensiveErrorHandling<T>(
    operation: () => Promise<T>,
    logger: Logger,
    operationName: string,
    context?: Record<string, any>
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      const appError = this.normalizeError(error as Error, context);
      const severity = this.getErrorSeverity(appError);
      const userMessage = this.getUserFriendlyMessage(appError);
      const suggestions = this.getRecoverySuggestions(appError);

      // Log with appropriate severity
      const logContext = {
        ...this.extractErrorContext(appError),
        ...context,
        operation: operationName,
        userMessage,
        suggestions,
      };

      if (severity === 'error') {
        logger.error(`Error in ${operationName}: ${userMessage}`, logContext);
      } else if (severity === 'warn') {
        logger.warn(`Warning in ${operationName}: ${userMessage}`, logContext);
      } else {
        logger.debug(`Debug error in ${operationName}: ${userMessage}`, logContext);
      }

      // Log suggestions if available
      if (suggestions.length > 0) {
        logger.log(`Recovery suggestions for ${operationName}:`);
        suggestions.forEach(suggestion => logger.log(`  • ${suggestion}`));
      }

      throw appError;
    }
  }

  /**
   * Handle errors gracefully with fallback behavior
   */
  static async withGracefulFallback<T>(
    operation: () => Promise<T>,
    fallback: () => Promise<T>,
    logger: Logger,
    operationName: string,
    context?: Record<string, any>
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      logger.warn(`Primary operation failed for ${operationName}, trying fallback`, {
        error: this.extractErrorContext(error as Error),
        ...context,
      });

      try {
        return await fallback();
      } catch (fallbackError) {
        logger.error(`Both primary and fallback operations failed for ${operationName}`, {
          primaryError: this.extractErrorContext(error as Error),
          fallbackError: this.extractErrorContext(fallbackError as Error),
          ...context,
        });
        throw this.normalizeError(fallbackError as Error, context);
      }
    }
  }

  /**
   * Handle errors with retry logic
   */
  static async withRetryLogic<T>(
    operation: () => Promise<T>,
    logger: Logger,
    operationName: string,
    maxRetries: number = 3,
    context?: Record<string, any>
  ): Promise<T> {
    let lastError: Error;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;

        if (!this.isRetryableError(lastError)) {
          logger.warn(`Non-retryable error in ${operationName} (attempt ${attempt})`, {
            error: this.extractErrorContext(lastError),
            ...context,
          });
          throw this.normalizeError(lastError, context);
        }

        if (attempt === maxRetries) {
          logger.error(`All ${maxRetries} attempts failed for ${operationName}`, {
            error: this.extractErrorContext(lastError),
            ...context,
          });
          throw this.normalizeError(lastError, context);
        }

        logger.warn(`Retryable error in ${operationName} (attempt ${attempt}/${maxRetries})`, {
          error: this.extractErrorContext(lastError),
          nextAttempt: attempt + 1,
          ...context,
        });

        // Exponential backoff
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw this.normalizeError(lastError!, context);
  }

  /**
   * Extract error context for logging
   */
  static extractErrorContext(error: Error): Record<string, any> {
    const context: Record<string, any> = {
      errorType: error.constructor.name,
      message: error.message,
      stack: error.stack,
    };

    if (error instanceof AppError) {
      context.code = error.code;
      context.isRetryable = error.isRetryable;
      if (error.context) {
        Object.assign(context, error.context);
      }
    }

    return context;
  }

  /**
   * Log an error with proper context
   */
  static logError(logger: Logger, error: Error, operation?: string, context?: Record<string, any>): void {
    const errorContext = this.extractErrorContext(error);
    const logContext = { ...errorContext, ...context };

    if (operation) {
      logContext.operation = operation;
    }

    if (error instanceof AppError) {
      if (error.isRetryable) {
        logger.warn(`Retryable error in ${operation || 'operation'}:`, logContext);
      } else {
        logger.error(`Non-retryable error in ${operation || 'operation'}:`, logContext);
      }
    } else {
      logger.error(`Unexpected error in ${operation || 'operation'}:`, logContext);
    }
  }

  /**
   * Wrap an async operation with error handling
   */
  static async withErrorHandling<T>(
    operation: () => Promise<T>,
    logger: Logger,
    operationName: string,
    context?: Record<string, any>
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      this.logError(logger, error as Error, operationName, context);
      throw error;
    }
  }

  /**
   * Convert a generic error to an AppError if possible
   */
  static normalizeError(error: Error, context?: Record<string, any>): AppError {
    if (error instanceof AppError) {
      return error;
    }

    // Try to categorize the error based on its message
    if (this.isAuthError(error)) {
      return new AuthError(error.message, 'unknown', context);
    }

    if (this.isRateLimitError(error)) {
      return new RateLimitError(error.message, 'unknown', undefined, context);
    }

    if (this.isTimeoutError(error)) {
      return new TimeoutError(error.message, 'unknown', 0, context);
    }

    if (this.isRetryableError(error)) {
      return new NetworkError(error.message, 'unknown', undefined, context);
    }

    // Default to a generic NetworkError for unknown errors
    return new NetworkError(error.message, 'unknown', undefined, context);
  }
}

/**
 * Error codes for consistent error identification
 */
export const ErrorCodes = {
  // API Errors
  API_400: 'API_400',
  API_401: 'API_401',
  API_403: 'API_403',
  API_404: 'API_404',
  API_429: 'API_429',
  API_500: 'API_500',
  API_502: 'API_502',
  API_503: 'API_503',
  API_504: 'API_504',

  // Authentication Errors
  AUTH_ERROR: 'AUTH_ERROR',
  AUTH_MISSING_CREDENTIALS: 'AUTH_MISSING_CREDENTIALS',
  AUTH_INVALID_TOKEN: 'AUTH_INVALID_TOKEN',
  AUTH_EXPIRED_TOKEN: 'AUTH_EXPIRED_TOKEN',

  // Configuration Errors
  CONFIG_ERROR: 'CONFIG_ERROR',
  CONFIG_MISSING_REQUIRED: 'CONFIG_MISSING_REQUIRED',
  CONFIG_INVALID_VALUE: 'CONFIG_INVALID_VALUE',

  // Validation Errors
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  VALIDATION_INVALID_FORMAT: 'VALIDATION_INVALID_FORMAT',
  VALIDATION_MISSING_REQUIRED: 'VALIDATION_MISSING_REQUIRED',

  // File System Errors
  FILE_SYSTEM_ERROR: 'FILE_SYSTEM_ERROR',
  FILE_NOT_FOUND: 'FILE_NOT_FOUND',
  FILE_PERMISSION_DENIED: 'FILE_PERMISSION_DENIED',
  FILE_ALREADY_EXISTS: 'FILE_ALREADY_EXISTS',

  // Network Errors
  NETWORK_ERROR: 'NETWORK_ERROR',
  NETWORK_TIMEOUT: 'NETWORK_TIMEOUT',
  NETWORK_CONNECTION_REFUSED: 'NETWORK_CONNECTION_REFUSED',

  // Rate Limit Errors
  RATE_LIMIT_ERROR: 'RATE_LIMIT_ERROR',

  // Timeout Errors
  TIMEOUT_ERROR: 'TIMEOUT_ERROR',

  // AI Provider Errors
  AI_PROVIDER_ERROR: 'AI_PROVIDER_ERROR',
  AI_PROVIDER_UNAVAILABLE: 'AI_PROVIDER_UNAVAILABLE',
  AI_PROVIDER_INVALID_RESPONSE: 'AI_PROVIDER_INVALID_RESPONSE',

  // Data Processing Errors
  DATA_PROCESSING_ERROR: 'DATA_PROCESSING_ERROR',
  DATA_PROCESSING_INVALID_FORMAT: 'DATA_PROCESSING_INVALID_FORMAT',
  DATA_PROCESSING_MISSING_REQUIRED: 'DATA_PROCESSING_MISSING_REQUIRED',

  // Unknown Errors
  UNKNOWN_ERROR: 'UNKNOWN_ERROR',
} as const;

export type ErrorCode = typeof ErrorCodes[keyof typeof ErrorCodes];
