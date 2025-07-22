import { Logger } from '@nestjs/common';

export interface HttpRequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: any;
  timeout?: number;
}

export interface TraceLogConfig {
  logger: Logger;
  serviceName: string;
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

    const response = await fetch(url, fetchOptions);
    const duration = Date.now() - start;
    logger.verbose(`[TRACE] ${method} ${url} - status ${response.status} (${duration}ms)`);

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
      throw new Error(`${serviceName} API request failed: ${response.status} ${response.statusText}`);
    }

    return response.json();
  } catch (error) {
    const duration = Date.now() - start;
    logger.error(`[TRACE] ${method} ${url} - ERROR after ${duration}ms: ${error}`);
    throw error;
  }
}

/**
 * Creates a traced request function for a specific service
 */
export function createTracedRequest(serviceName: string, logger: Logger) {
  return (url: string, options: HttpRequestOptions = {}) =>
    makeTracedRequest(url, options, { logger, serviceName });
}
