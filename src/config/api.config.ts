import { Injectable, Logger } from '@nestjs/common';
import { ConfigurationError } from '../utils/error.utils';

/**
 * Strongly typed configuration interfaces for all API integrations
 */

export interface GitLabConfig {
  enabled: boolean;
  baseUrl: string;
  accessToken: string;
  projectIds: string[];
  projectConcurrency: number;
  fetchCommits: boolean;
  fetchComments: boolean;
  fetchMrNotes: boolean;
  fetchIssues: boolean;
  fetchNested: boolean;
  fetchNotes: boolean;
}

export interface SlackConfig {
  enabled: boolean;
  botToken: string;
  appToken?: string;
  channels: string[];
}

export interface TeamsConfig {
  enabled: boolean;
  clientId: string;
  clientSecret: string;
  tenantId: string;
  email: string;
  channels: string[];
}

export interface JiraConfig {
  enabled: boolean;
  baseUrl: string;
  email: string;
  apiToken: string;
  projectKeys: string[];
  issueTypes: string[];
}

export interface AiConfig {
  openai: {
    apiKey?: string;
    model: string;
    baseUrl: string;
  };
  anthropic: {
    apiKey?: string;
    model: string;
  };
  google: {
    apiKey?: string;
    model: string;
  };
  ollama: {
    baseUrl: string;
    model: string;
  };
  huggingface: {
    apiKey?: string;
    model: string;
  };
  openwebui: {
    baseUrl: string;
    model: string;
    apiKey?: string;
  };
}

export interface AppConfig {
  logLevel: string;
  activitiesOutputDir: string;
  aiSummariesOutputDir: string;
}

export interface ApiConfig {
  gitlab: GitLabConfig;
  slack: SlackConfig;
  teams: TeamsConfig;
  jira: JiraConfig;
  ai: AiConfig;
  app: AppConfig;
}



/**
 * Configuration validation utilities
 */
export class ConfigValidator {
  private static readonly logger = new Logger(ConfigValidator.name);

  static validateRequiredString(value: string | undefined, section: string, field: string): string {
    if (!value || value.trim() === '') {
      throw new ConfigurationError(
        `${section} ${field} is required but not provided`,
        section,
        field
      );
    }
    return value.trim();
  }

  static validateOptionalString(value: string | undefined, defaultValue: string = ''): string {
    return value?.trim() || defaultValue;
  }

  static validateUrl(value: string, section: string, field: string): string {
    const url = this.validateRequiredString(value, section, field);
    try {
      new URL(url);
      return url;
    } catch {
      throw new ConfigurationError(
        `${section} ${field} must be a valid URL: ${url}`,
        section,
        field
      );
    }
  }

  static validateOptionalUrl(value: string | undefined, defaultValue: string): string {
    if (!value) return defaultValue;
    try {
      new URL(value);
      return value;
    } catch {
      this.logger.warn(`Invalid URL provided: ${value}, using default: ${defaultValue}`);
      return defaultValue;
    }
  }

  static validateBoolean(value: string | undefined, defaultValue: boolean = true): boolean {
    if (value === undefined || value === '') return defaultValue;
    return value.toLowerCase() !== 'false';
  }

  static validateNumber(value: string | undefined, defaultValue: number, min?: number, max?: number): number {
    const num = parseInt(value || defaultValue.toString(), 10);
    if (isNaN(num)) {
      this.logger.warn(`Invalid number provided: ${value}, using default: ${defaultValue}`);
      return defaultValue;
    }
    if (min !== undefined && num < min) {
      this.logger.warn(`Number ${num} is below minimum ${min}, using minimum`);
      return min;
    }
    if (max !== undefined && num > max) {
      this.logger.warn(`Number ${num} is above maximum ${max}, using maximum`);
      return max;
    }
    return num;
  }

  static validateStringArray(value: string | undefined, defaultValue: string[] = []): string[] {
    if (!value) return defaultValue;
    return value.split(',').map(s => s.trim()).filter(s => s.length > 0);
  }

  static validateEmail(value: string, section: string, field: string): string {
    const email = this.validateRequiredString(value, section, field);
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      throw new ConfigurationError(
        `${section} ${field} must be a valid email address: ${email}`,
        section,
        field
      );
    }
    return email;
  }
}

/**
 * Enhanced configuration service with validation
 */
@Injectable()
export class ConfigurationService {
  private readonly logger = new Logger(ConfigurationService.name);
  private config: ApiConfig;

  constructor() {
    this.config = this.loadAndValidateConfig();
  }

  /**
   * Get the complete validated configuration
   */
  getConfig(): ApiConfig {
    return this.config;
  }

  /**
   * Get GitLab configuration
   */
  getGitLabConfig(): GitLabConfig {
    return this.config.gitlab;
  }

  /**
   * Get Slack configuration
   */
  getSlackConfig(): SlackConfig {
    return this.config.slack;
  }

  /**
   * Get Teams configuration
   */
  getTeamsConfig(): TeamsConfig {
    return this.config.teams;
  }

  /**
   * Get Jira configuration
   */
  getJiraConfig(): JiraConfig {
    return this.config.jira;
  }

  /**
   * Get AI configuration
   */
  getAiConfig(): AiConfig {
    return this.config.ai;
  }

  /**
   * Get app configuration
   */
  getAppConfig(): AppConfig {
    return this.config.app;
  }

  /**
 * Check if any API is enabled
 */
  hasAnyApiEnabled(): boolean {
    return this.config?.gitlab?.enabled ||
      this.config?.slack?.enabled ||
      this.config?.teams?.enabled ||
      this.config?.jira?.enabled;
  }

  /**
   * Get enabled API count
   */
  getEnabledApiCount(): number {
    let count = 0;
    if (this.config?.gitlab?.enabled) count++;
    if (this.config?.slack?.enabled) count++;
    if (this.config?.teams?.enabled) count++;
    if (this.config?.jira?.enabled) count++;
    return count;
  }

  /**
   * Load and validate configuration from environment variables
   */
  private loadAndValidateConfig(): ApiConfig {
    try {
      const config: ApiConfig = {
        gitlab: this.loadGitLabConfig(),
        slack: this.loadSlackConfig(),
        teams: this.loadTeamsConfig(),
        jira: this.loadJiraConfig(),
        ai: this.loadAiConfig(),
        app: this.loadAppConfig(),
      };

      this.logger.log(`Configuration loaded successfully. ${this.getEnabledApiCount()} APIs enabled.`);
      return config;
    } catch (error) {
      if (error instanceof ConfigurationError) {
        this.logger.error(`Configuration error: ${error.message}`);
        throw error;
      }
      this.logger.error('Unexpected error loading configuration:', error);
      throw new ConfigurationError('Failed to load configuration', 'system');
    }
  }

  private loadGitLabConfig(): GitLabConfig {
    const fetchNested = ConfigValidator.validateBoolean(process.env.GITLAB_FETCH_NESTED);
    const fetchNotes = ConfigValidator.validateBoolean(process.env.GITLAB_FETCH_NOTES);

    return {
      enabled: ConfigValidator.validateBoolean(process.env.GITLAB_ENABLED),
      baseUrl: ConfigValidator.validateOptionalUrl(process.env.GITLAB_BASE_URL, 'https://gitlab.com'),
      accessToken: ConfigValidator.validateOptionalString(process.env.GITLAB_ACCESS_TOKEN),
      projectIds: ConfigValidator.validateStringArray(process.env.GITLAB_PROJECT_IDS),
      projectConcurrency: ConfigValidator.validateNumber(process.env.GITLAB_PROJECT_CONCURRENCY, 5, 1, 20),
      fetchCommits: ConfigValidator.validateBoolean(process.env.GITLAB_FETCH_COMMITS),
      fetchComments: fetchNested && fetchNotes ? ConfigValidator.validateBoolean(process.env.GITLAB_FETCH_COMMENTS) : false,
      fetchMrNotes: fetchNested && fetchNotes ? ConfigValidator.validateBoolean(process.env.GITLAB_FETCH_MR_NOTES) : false,
      fetchIssues: ConfigValidator.validateBoolean(process.env.GITLAB_FETCH_ISSUES),
      fetchNested,
      fetchNotes,
    };
  }

  private loadSlackConfig(): SlackConfig {
    return {
      enabled: ConfigValidator.validateBoolean(process.env.SLACK_ENABLED),
      botToken: ConfigValidator.validateOptionalString(process.env.SLACK_BOT_TOKEN),
      appToken: ConfigValidator.validateOptionalString(process.env.SLACK_APP_TOKEN),
      channels: ConfigValidator.validateStringArray(process.env.SLACK_CHANNELS),
    };
  }

  private loadTeamsConfig(): TeamsConfig {
    return {
      enabled: ConfigValidator.validateBoolean(process.env.TEAMS_ENABLED),
      clientId: ConfigValidator.validateOptionalString(process.env.TEAMS_CLIENT_ID),
      clientSecret: ConfigValidator.validateOptionalString(process.env.TEAMS_CLIENT_SECRET),
      tenantId: ConfigValidator.validateOptionalString(process.env.TEAMS_TENANT_ID),
      email: ConfigValidator.validateOptionalString(process.env.TEAMS_EMAIL),
      channels: ConfigValidator.validateStringArray(process.env.TEAMS_CHANNELS),
    };
  }

  private loadJiraConfig(): JiraConfig {
    return {
      enabled: ConfigValidator.validateBoolean(process.env.JIRA_ENABLED),
      baseUrl: ConfigValidator.validateOptionalString(process.env.JIRA_BASE_URL),
      email: ConfigValidator.validateOptionalString(process.env.JIRA_EMAIL),
      apiToken: ConfigValidator.validateOptionalString(process.env.JIRA_API_TOKEN),
      projectKeys: ConfigValidator.validateStringArray(process.env.JIRA_PROJECT_KEYS),
      issueTypes: ConfigValidator.validateStringArray(process.env.JIRA_ISSUE_TYPES),
    };
  }

  private loadAiConfig(): AiConfig {
    return {
      openai: {
        apiKey: ConfigValidator.validateOptionalString(process.env.OPENAI_API_KEY),
        model: ConfigValidator.validateOptionalString(process.env.OPENAI_MODEL, 'gpt-4o'),
        baseUrl: ConfigValidator.validateOptionalString(process.env.OPENAI_BASE_URL, 'https://api.openai.com/v1'),
      },
      anthropic: {
        apiKey: ConfigValidator.validateOptionalString(process.env.ANTHROPIC_API_KEY),
        model: ConfigValidator.validateOptionalString(process.env.ANTHROPIC_MODEL, 'claude-3-haiku-20240307'),
      },
      google: {
        apiKey: ConfigValidator.validateOptionalString(process.env.GOOGLE_API_KEY),
        model: ConfigValidator.validateOptionalString(process.env.GOOGLE_MODEL, 'gemini-1.5-flash'),
      },
      ollama: {
        baseUrl: ConfigValidator.validateOptionalString(process.env.OLLAMA_BASE_URL, 'http://localhost:11434'),
        model: ConfigValidator.validateOptionalString(process.env.OLLAMA_MODEL, 'llama2'),
      },
      huggingface: {
        apiKey: ConfigValidator.validateOptionalString(process.env.HUGGINGFACE_API_KEY),
        model: ConfigValidator.validateOptionalString(process.env.HUGGINGFACE_MODEL, 'meta-llama/Llama-2-7b-chat-hf'),
      },
      openwebui: {
        baseUrl: ConfigValidator.validateOptionalString(process.env.OPENWEBUI_BASE_URL, 'http://localhost:8080'),
        model: ConfigValidator.validateOptionalString(process.env.OPENWEBUI_MODEL, 'llama2'),
        apiKey: ConfigValidator.validateOptionalString(process.env.OPENWEBUI_API_KEY),
      },
    };
  }

  private loadAppConfig(): AppConfig {
    return {
      logLevel: ConfigValidator.validateOptionalString(process.env.LOG_LEVEL, 'info'),
      activitiesOutputDir: ConfigValidator.validateOptionalString(process.env.ACTIVITIES_OUTPUT_DIR, 'activities'),
      aiSummariesOutputDir: ConfigValidator.validateOptionalString(process.env.AI_SUMMARIES_OUTPUT_DIR, 'ai-summaries'),
    };
  }
}

/**
 * Legacy function for backward compatibility
 * @deprecated Use ConfigurationService instead
 */
export const getApiConfig = (): ApiConfig => {
  const configService = new ConfigurationService();
  return configService.getConfig();
};
