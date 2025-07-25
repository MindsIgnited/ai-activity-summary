import { Logger } from '@nestjs/common';
import { RetryManager, retryConfigs, circuitBreakerConfigs } from './retry.utils';
import { ErrorUtils, ApiError, TimeoutError, NetworkError } from './error.utils';

export interface HttpRequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: any;
  timeout?: number;
  retryConfig?: 'fast' | 'standard' | 'conservative' | 'aggressive';
  enableCircuitBreaker?: boolean;
}

export interface TraceLogConfig {
  logger: Logger;
  serviceName: string;
}

/**
 * Creates a traced request function with retry logic for a specific service
 */
export function createTracedRequest(serviceName: string, logger: Logger) {
  const retryManager = new RetryManager(logger);

  return async (url: string, options: HttpRequestOptions = {}) => {
    const retryConfig = options.retryConfig || 'standard';
    const enableCircuitBreaker = options.enableCircuitBreaker ?? true;

    const operationName = `${serviceName}_${options.method || 'GET'}_${new URL(url).hostname}`;

    return retryManager.withRetry(
      () => makeTracedRequest(url, options, { logger, serviceName }),
      operationName,
      retryConfigs[retryConfig],
      enableCircuitBreaker ? circuitBreakerConfigs.api : undefined
    );
  };
}

/**
 * Makes an HTTP request with trace logging and consistent error handling
 */
export async function makeTracedRequest(
  url: string,
  options: HttpRequestOptions = {},
  traceConfig: TraceLogConfig
): Promise<any> {
  const { logger, serviceName } = traceConfig;
  const method = options.method || 'GET';
  const start = Date.now();

  logger.verbose(`[TRACE] ${method} ${url} - sending request`);

  try {
    const fetchOptions: RequestInit = {
      method,
      headers: options.headers || {},
    };

    if (options.body) {
      if (typeof options.body === 'string') {
        fetchOptions.body = options.body;
      } else {
        fetchOptions.body = JSON.stringify(options.body);
        if (!fetchOptions.headers!['Content-Type']) {
          fetchOptions.headers!['Content-Type'] = 'application/json';
        }
      }
    }

    // Add timeout if specified
    if (options.timeout) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), options.timeout);

      try {
        const response = await fetch(url, { ...fetchOptions, signal: controller.signal });
        clearTimeout(timeoutId);
        return await handleResponse(response, url, logger, serviceName, start);
      } catch (error) {
        clearTimeout(timeoutId);
        if (error instanceof Error && error.name === 'AbortError') {
          throw ErrorUtils.createTimeoutError(serviceName, options.timeout, url);
        }
        if (error instanceof Error) {
          throw ErrorUtils.createNetworkError(error, serviceName, url);
        }
        throw error;
      }
    } else {
      const response = await fetch(url, fetchOptions);
      return await handleResponse(response, url, logger, serviceName, start);
    }
  } catch (error) {
    const duration = Date.now() - start;
    logger.error(`[TRACE] ${method} ${url} - ERROR after ${duration}ms: ${error}`);
    if (error instanceof Error) {
      throw ErrorUtils.createNetworkError(error, serviceName, url);
    }
    throw error;
  }
}

/**
 * Handles the response and extracts error details
 */
async function handleResponse(
  response: Response,
  url: string,
  logger: Logger,
  serviceName: string,
  startTime: number
): Promise<any> {
  const duration = Date.now() - startTime;
  logger.verbose(`[TRACE] ${response.status} ${url} - status ${response.status} (${duration}ms)`);

  if (!response.ok) {
    let errorDetails = '';
    try {
      const errorResponse = await response.json();
      errorDetails = JSON.stringify(errorResponse);
    } catch {
      try {
        errorDetails = await response.text();
      } catch {
        errorDetails = 'Unable to read error details';
      }
    }

    logger.error(`${serviceName} API request failed: ${response.status} ${response.statusText}`);
    logger.error(`URL: ${url}`);
    logger.error(`Error details: ${errorDetails}`);
    throw ErrorUtils.createApiError(response, serviceName, url, { errorDetails });
  }

  return response.json();
}
