import { Logger } from '@nestjs/common';
import { RetryManager, retryConfigs, circuitBreakerConfigs } from './retry.utils';
import { ErrorUtils, ApiError, TimeoutError, NetworkError, AiProviderError } from './error.utils';

export interface AiRequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: any;
  timeout?: number;
  retryConfig?: 'fast' | 'standard' | 'conservative' | 'aggressive';
  enableCircuitBreaker?: boolean;
}

export interface AiRequestConfig {
  logger: Logger;
  providerName: string;
}

/**
 * Creates an AI request function with retry logic for a specific provider
 */
export function createAiRequest(providerName: string, logger: Logger) {
  const retryManager = new RetryManager(logger);

  return async (url: string, options: AiRequestOptions = {}) => {
    const retryConfig = options.retryConfig || 'conservative';
    const enableCircuitBreaker = options.enableCircuitBreaker ?? true;

    const operationName = `${providerName}_${options.method || 'POST'}_${new URL(url).hostname}`;

    return retryManager.withRetry(
      () => makeAiRequest(url, options, { logger, providerName }),
      operationName,
      retryConfigs[retryConfig],
      enableCircuitBreaker ? circuitBreakerConfigs.api : undefined
    );
  };
}

/**
 * Makes an AI provider request with trace logging and consistent error handling
 */
export async function makeAiRequest(
  url: string,
  options: AiRequestOptions = {},
  config: AiRequestConfig
): Promise<any> {
  const { logger, providerName } = config;
  const method = options.method || 'POST';
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
        return await handleAiResponse(response, url, logger, providerName, start);
      } catch (error) {
        clearTimeout(timeoutId);
        if (error instanceof Error && error.name === 'AbortError') {
          throw ErrorUtils.createTimeoutError(providerName, options.timeout, url);
        }
        if (error instanceof Error) {
          throw ErrorUtils.createNetworkError(error, providerName, url);
        }
        throw error;
      }
    } else {
      const response = await fetch(url, fetchOptions);
      return await handleAiResponse(response, url, logger, providerName, start);
    }
  } catch (error) {
    const duration = Date.now() - start;
    logger.error(`[TRACE] ${method} ${url} - ERROR after ${duration}ms: ${error}`);
    if (error instanceof Error) {
      throw ErrorUtils.createNetworkError(error, providerName, url);
    }
    throw error;
  }
}

/**
 * Handles the AI response and extracts error details
 */
async function handleAiResponse(
  response: Response,
  url: string,
  logger: Logger,
  providerName: string,
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

    logger.error(`${providerName} API request failed: ${response.status} ${response.statusText}`);
    logger.error(`URL: ${url}`);
    logger.error(`Error details: ${errorDetails}`);
    throw ErrorUtils.createApiError(response, providerName, url, { errorDetails });
  }

  return response.json();
}
