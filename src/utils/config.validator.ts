import { Logger } from '@nestjs/common';
import { ErrorUtils } from './error.utils';

/**
 * Configuration validation and change detection utility
 */
export class ConfigurationValidator {
  private static previousConfig: Record<string, any> = {};
  private static logger: Logger;

  /**
   * Initialize the validator with a logger
   */
  static initialize(logger: Logger): void {
    this.logger = logger;
  }

  /**
   * Validate configuration changes and log differences
   */
  static validateConfigurationChange(
    oldConfig: Record<string, any>,
    newConfig: Record<string, any>,
    context: string = 'application'
  ): void {
    if (!this.logger) {
      throw new Error('ConfigurationValidator not initialized. Call initialize() first.');
    }

    const changes = this.detectChanges(oldConfig, newConfig);

    if (changes.length > 0) {
      this.logger.log(`Configuration changes detected in ${context}:`, {
        changes,
        context,
      });
    }

    // Validate new configuration
    this.validateConfiguration(newConfig, context);

    // Store for next comparison
    this.previousConfig = JSON.parse(JSON.stringify(newConfig));
  }

  /**
   * Detect changes between two configuration objects
   */
  private static detectChanges(
    oldConfig: Record<string, any>,
    newConfig: Record<string, any>
  ): Array<{ key: string; oldValue: any; newValue: any; type: 'added' | 'removed' | 'modified' }> {
    const changes: Array<{ key: string; oldValue: any; newValue: any; type: 'added' | 'removed' | 'modified' }> = [];

    const allKeys = new Set([...Object.keys(oldConfig), ...Object.keys(newConfig)]);

    for (const key of allKeys) {
      const oldValue = oldConfig[key];
      const newValue = newConfig[key];

      if (!(key in oldConfig)) {
        changes.push({ key, oldValue: undefined, newValue, type: 'added' });
      } else if (!(key in newConfig)) {
        changes.push({ key, oldValue, newValue: undefined, type: 'removed' });
      } else if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
        changes.push({ key, oldValue, newValue, type: 'modified' });
      }
    }

    return changes;
  }

  /**
   * Validate configuration structure and values
   */
  static validateConfiguration(config: Record<string, any>, context: string = 'application'): void {
    if (!this.logger) {
      throw new Error('ConfigurationValidator not initialized. Call initialize() first.');
    }

    const issues: string[] = [];

    // Check for required fields
    const requiredFields = this.getRequiredFields(context);
    for (const field of requiredFields) {
      if (!config[field] || config[field] === '') {
        issues.push(`Missing required field: ${field}`);
      }
    }

    // Check for deprecated fields
    const deprecatedFields = this.getDeprecatedFields(context);
    for (const field of deprecatedFields) {
      if (config[field] !== undefined) {
        issues.push(`Deprecated field used: ${field}`);
      }
    }

    // Validate URL fields
    const urlFields = this.getUrlFields(context);
    for (const field of urlFields) {
      if (config[field] && !this.isValidUrl(config[field])) {
        issues.push(`Invalid URL in field: ${field}`);
      }
    }

    // Validate email fields
    const emailFields = this.getEmailFields(context);
    for (const field of emailFields) {
      if (config[field] && !this.isValidEmail(config[field])) {
        issues.push(`Invalid email in field: ${field}`);
      }
    }

    if (issues.length > 0) {
      this.logger.warn(`Configuration validation issues in ${context}:`, {
        issues,
        context,
      });
    }
  }

  /**
   * Get required fields for a specific context
   */
  private static getRequiredFields(context: string): string[] {
    const requiredFieldsMap: Record<string, string[]> = {
      'gitlab': ['GITLAB_BASE_URL', 'GITLAB_ACCESS_TOKEN'],
      'slack': ['SLACK_BOT_TOKEN'],
      'teams': ['TEAMS_CLIENT_ID', 'TEAMS_CLIENT_SECRET'],
      'jira': ['JIRA_BASE_URL', 'JIRA_EMAIL', 'JIRA_API_TOKEN'],
      'openai': ['OPENAI_API_KEY'],
      'anthropic': ['ANTHROPIC_API_KEY'],
      'google': ['GOOGLE_API_KEY'],
      'application': [], // No global required fields
    };

    return requiredFieldsMap[context] || [];
  }

  /**
   * Get deprecated fields for a specific context
   */
  private static getDeprecatedFields(context: string): string[] {
    const deprecatedFieldsMap: Record<string, string[]> = {
      'gitlab': ['GITLAB_PRIVATE_TOKEN'], // Use GITLAB_ACCESS_TOKEN instead
      'slack': ['SLACK_USER_TOKEN'], // Use SLACK_BOT_TOKEN instead
      'application': [],
    };

    return deprecatedFieldsMap[context] || [];
  }

  /**
   * Get URL fields for a specific context
   */
  private static getUrlFields(context: string): string[] {
    const urlFieldsMap: Record<string, string[]> = {
      'gitlab': ['GITLAB_BASE_URL'],
      'jira': ['JIRA_BASE_URL'],
      'openai': ['OPENAI_BASE_URL'],
      'ollama': ['OLLAMA_BASE_URL'],
      'openwebui': ['OPENWEBUI_BASE_URL'],
      'application': [],
    };

    return urlFieldsMap[context] || [];
  }

  /**
   * Get email fields for a specific context
   */
  private static getEmailFields(context: string): string[] {
    const emailFieldsMap: Record<string, string[]> = {
      'jira': ['JIRA_EMAIL'],
      'teams': ['TEAMS_EMAIL'],
      'application': [],
    };

    return emailFieldsMap[context] || [];
  }

  /**
   * Validate URL format
   */
  private static isValidUrl(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Validate email format
   */
  private static isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Check if a configuration section is enabled
   */
  static isSectionEnabled(config: Record<string, any>, section: string): boolean {
    const enabledKey = `${section.toUpperCase()}_ENABLED`;
    return config[enabledKey] === true || config[enabledKey] === 'true';
  }

  /**
   * Get configuration warnings for a specific context
   */
  static getConfigurationWarnings(config: Record<string, any>, context: string): string[] {
    const warnings: string[] = [];

    // Check for insecure configurations
    if (context === 'gitlab' && config.GITLAB_BASE_URL && !config.GITLAB_BASE_URL.startsWith('https://')) {
      warnings.push('GitLab base URL should use HTTPS for security');
    }

    if (context === 'jira' && config.JIRA_BASE_URL && !config.JIRA_BASE_URL.startsWith('https://')) {
      warnings.push('Jira base URL should use HTTPS for security');
    }

    // Check for development configurations in production
    if (process.env.NODE_ENV === 'production') {
      if (config.LOG_LEVEL === 'debug' || config.LOG_LEVEL === 'verbose') {
        warnings.push('Debug logging should not be enabled in production');
      }
    }

    return warnings;
  }

  /**
   * Validate and sanitize configuration values
   */
  static sanitizeConfiguration(config: Record<string, any>): Record<string, any> {
    const sanitized: Record<string, any> = {};

    for (const [key, value] of Object.entries(config)) {
      if (value !== undefined && value !== null) {
        // Trim string values
        if (typeof value === 'string') {
          sanitized[key] = value.trim();
        } else {
          sanitized[key] = value;
        }
      }
    }

    return sanitized;
  }
}
