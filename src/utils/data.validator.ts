import { ActivityData } from '../app.service';
import { ErrorUtils } from './error.utils';

/**
 * Data validation utility for API responses and activity data
 */
export class DataValidator {
  /**
   * Validate ActivityData object
   */
  static validateActivityData(data: any): ActivityData {
    const errors: string[] = [];

    // Check required fields
    if (!data.id || typeof data.id !== 'string') {
      errors.push('ActivityData must have a valid string id');
    }

    if (!data.type || !['gitlab', 'slack', 'teams', 'jira'].includes(data.type)) {
      errors.push('ActivityData must have a valid type (gitlab, slack, teams, jira)');
    }

    if (!data.timestamp || !(data.timestamp instanceof Date)) {
      errors.push('ActivityData must have a valid timestamp');
    }

    if (!data.title || typeof data.title !== 'string') {
      errors.push('ActivityData must have a valid string title');
    }

    // Check optional fields
    if (data.description !== undefined && typeof data.description !== 'string') {
      errors.push('ActivityData description must be a string if provided');
    }

    if (data.author !== undefined && typeof data.author !== 'string') {
      errors.push('ActivityData author must be a string if provided');
    }

    if (data.url !== undefined && typeof data.url !== 'string') {
      errors.push('ActivityData url must be a string if provided');
    }

    if (data.metadata !== undefined && typeof data.metadata !== 'object') {
      errors.push('ActivityData metadata must be an object if provided');
    }

    if (errors.length > 0) {
      throw ErrorUtils.createValidationError(
        `ActivityData validation failed: ${errors.join(', ')}`,
        'ActivityData',
        data
      );
    }

    // Sanitize the data
    return {
      id: data.id,
      type: data.type,
      timestamp: data.timestamp,
      title: data.title,
      description: data.description || undefined,
      author: data.author || undefined,
      url: data.url || undefined,
      metadata: data.metadata || undefined,
    };
  }

  /**
   * Validate API response structure
   */
  static validateApiResponse(response: any, schema: Record<string, any>): boolean {
    const errors: string[] = [];

    for (const [field, rules] of Object.entries(schema)) {
      const value = response[field];

      if (rules.required && (value === undefined || value === null)) {
        errors.push(`Required field '${field}' is missing`);
        continue;
      }

      if (value !== undefined && value !== null) {
        // Type validation
        if (rules.type && typeof value !== rules.type) {
          errors.push(`Field '${field}' must be of type ${rules.type}, got ${typeof value}`);
        }

        // Array validation
        if (rules.array && !Array.isArray(value)) {
          errors.push(`Field '${field}' must be an array`);
        }

        // String validation
        if (rules.type === 'string') {
          if (rules.minLength && value.length < rules.minLength) {
            errors.push(`Field '${field}' must be at least ${rules.minLength} characters long`);
          }
          if (rules.maxLength && value.length > rules.maxLength) {
            errors.push(`Field '${field}' must be at most ${rules.maxLength} characters long`);
          }
          if (rules.pattern && !rules.pattern.test(value)) {
            errors.push(`Field '${field}' does not match required pattern`);
          }
        }

        // Number validation
        if (rules.type === 'number') {
          if (rules.min !== undefined && value < rules.min) {
            errors.push(`Field '${field}' must be at least ${rules.min}`);
          }
          if (rules.max !== undefined && value > rules.max) {
            errors.push(`Field '${field}' must be at most ${rules.max}`);
          }
        }

        // URL validation
        if (rules.url) {
          try {
            new URL(value);
          } catch {
            errors.push(`Field '${field}' must be a valid URL`);
          }
        }

        // Email validation
        if (rules.email) {
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (!emailRegex.test(value)) {
            errors.push(`Field '${field}' must be a valid email address`);
          }
        }

        // Custom validation
        if (rules.validate) {
          try {
            const isValid = rules.validate(value);
            if (!isValid) {
              errors.push(`Field '${field}' failed custom validation`);
            }
          } catch (error) {
            errors.push(`Field '${field}' validation error: ${error}`);
          }
        }
      }
    }

    if (errors.length > 0) {
      throw ErrorUtils.createValidationError(
        `API response validation failed: ${errors.join(', ')}`,
        'ApiResponse',
        response
      );
    }

    return true;
  }

  /**
   * Validate GitLab API response
   */
  static validateGitLabResponse(response: any, endpoint: string): boolean {
    const schemas: Record<string, any> = {
      'projects': {
        id: { required: true, type: 'number' },
        name: { required: true, type: 'string', minLength: 1 },
        web_url: { required: true, url: true },
      },
      'commits': {
        id: { required: true, type: 'string' },
        title: { required: true, type: 'string', minLength: 1 },
        created_at: { required: true, type: 'string' },
        author_name: { required: true, type: 'string' },
      },
      'merge_requests': {
        id: { required: true, type: 'number' },
        title: { required: true, type: 'string', minLength: 1 },
        created_at: { required: true, type: 'string' },
        author: { required: true, type: 'object' },
      },
      'issues': {
        id: { required: true, type: 'number' },
        title: { required: true, type: 'string', minLength: 1 },
        created_at: { required: true, type: 'string' },
        author: { required: true, type: 'object' },
      },
      'comments': {
        id: { required: true, type: 'number' },
        body: { required: true, type: 'string' },
        created_at: { required: true, type: 'string' },
        author: { required: true, type: 'object' },
      },
    };

    const schema = schemas[endpoint];
    if (!schema) {
      return true; // No schema defined for this endpoint
    }

    return this.validateApiResponse(response, schema);
  }

  /**
   * Validate Slack API response
   */
  static validateSlackResponse(response: any, endpoint: string): boolean {
    const schemas: Record<string, any> = {
      'conversations.history': {
        ok: { required: true, type: 'boolean' },
        messages: { required: true, array: true },
      },
      'users.info': {
        ok: { required: true, type: 'boolean' },
        user: { required: true, type: 'object' },
      },
    };

    const schema = schemas[endpoint];
    if (!schema) {
      return true; // No schema defined for this endpoint
    }

    return this.validateApiResponse(response, schema);
  }

  /**
   * Validate Teams API response
   */
  static validateTeamsResponse(response: any, endpoint: string): boolean {
    const schemas: Record<string, any> = {
      'messages': {
        value: { required: true, array: true },
      },
      'events': {
        value: { required: true, array: true },
      },
    };

    const schema = schemas[endpoint];
    if (!schema) {
      return true; // No schema defined for this endpoint
    }

    return this.validateApiResponse(response, schema);
  }

  /**
   * Validate Jira API response
   */
  static validateJiraResponse(response: any, endpoint: string): boolean {
    const schemas: Record<string, any> = {
      'issues': {
        issues: { required: true, array: true },
        total: { required: true, type: 'number' },
      },
      'comments': {
        comments: { required: true, array: true },
      },
      'worklog': {
        worklogs: { required: true, array: true },
      },
    };

    const schema = schemas[endpoint];
    if (!schema) {
      return true; // No schema defined for this endpoint
    }

    return this.validateApiResponse(response, schema);
  }

  /**
   * Sanitize and validate activity data array
   */
  static validateActivityDataArray(data: any[]): ActivityData[] {
    if (!Array.isArray(data)) {
      throw ErrorUtils.createValidationError(
        'Expected array of ActivityData',
        'ActivityDataArray',
        data
      );
    }

    const validatedActivities: ActivityData[] = [];
    const errors: string[] = [];

    for (let i = 0; i < data.length; i++) {
      try {
        const validated = this.validateActivityData(data[i]);
        validatedActivities.push(validated);
      } catch (error) {
        errors.push(`Item ${i}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    if (errors.length > 0) {
      throw ErrorUtils.createValidationError(
        `ActivityData array validation failed: ${errors.join('; ')}`,
        'ActivityDataArray',
        data
      );
    }

    return validatedActivities;
  }

  /**
   * Validate configuration data
   */
  static validateConfiguration(config: Record<string, any>): boolean {
    const errors: string[] = [];

    // Check for required configuration fields
    const requiredFields = ['LOG_LEVEL'];
    for (const field of requiredFields) {
      if (!config[field]) {
        errors.push(`Required configuration field '${field}' is missing`);
      }
    }

    // Validate LOG_LEVEL
    if (config.LOG_LEVEL && !['error', 'warn', 'log', 'debug', 'verbose'].includes(config.LOG_LEVEL)) {
      errors.push('LOG_LEVEL must be one of: error, warn, log, debug, verbose');
    }

    // Validate numeric fields
    const numericFields = ['GITLAB_PROJECT_CONCURRENCY', 'GITLAB_FETCH_TIMEOUT'];
    for (const field of numericFields) {
      if (config[field] !== undefined) {
        const value = Number(config[field]);
        if (isNaN(value) || value < 0) {
          errors.push(`Field '${field}' must be a positive number`);
        }
      }
    }

    // Validate boolean fields
    const booleanFields = [
      'GITLAB_ENABLED', 'SLACK_ENABLED', 'TEAMS_ENABLED', 'JIRA_ENABLED',
      'GITLAB_FETCH_COMMITS', 'GITLAB_FETCH_ISSUES', 'GITLAB_FETCH_NOTES',
      'GITLAB_FETCH_NESTED'
    ];
    for (const field of booleanFields) {
      if (config[field] !== undefined && typeof config[field] !== 'boolean' && config[field] !== 'true' && config[field] !== 'false') {
        errors.push(`Field '${field}' must be a boolean value`);
      }
    }

    if (errors.length > 0) {
      throw ErrorUtils.createValidationError(
        `Configuration validation failed: ${errors.join(', ')}`,
        'Configuration',
        config
      );
    }

    return true;
  }

  /**
   * Sanitize string data
   */
  static sanitizeString(value: any, maxLength?: number): string {
    if (typeof value !== 'string') {
      return '';
    }

    let sanitized = value.trim();

    if (maxLength && sanitized.length > maxLength) {
      sanitized = sanitized.substring(0, maxLength);
    }

    return sanitized;
  }

  /**
   * Sanitize URL data
   */
  static sanitizeUrl(value: any): string | undefined {
    if (typeof value !== 'string') {
      return undefined;
    }

    const trimmed = value.trim();
    if (!trimmed) {
      return undefined;
    }

    try {
      new URL(trimmed);
      return trimmed;
    } catch {
      return undefined;
    }
  }

  /**
   * Sanitize email data
   */
  static sanitizeEmail(value: any): string | undefined {
    if (typeof value !== 'string') {
      return undefined;
    }

    const trimmed = value.trim().toLowerCase();
    if (!trimmed) {
      return undefined;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(trimmed) ? trimmed : undefined;
  }
}
