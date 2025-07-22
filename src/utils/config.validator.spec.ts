import { Logger } from '@nestjs/common';
import { ConfigurationValidator } from './config.validator';

describe('ConfigurationValidator', () => {
  let mockLogger: jest.Mocked<Logger>;

  beforeEach(() => {
    mockLogger = {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
      verbose: jest.fn(),
    } as any;

    ConfigurationValidator.initialize(mockLogger);
  });

  describe('validateConfigurationChange', () => {
    it('should detect added fields', () => {
      const oldConfig = { field1: 'value1' };
      const newConfig = { field1: 'value1', field2: 'value2' };

      ConfigurationValidator.validateConfigurationChange(oldConfig, newConfig, 'test');

      expect(mockLogger.log).toHaveBeenCalledWith(
        'Configuration changes detected in test:',
        expect.objectContaining({
          changes: expect.arrayContaining([
            expect.objectContaining({
              key: 'field2',
              type: 'added',
            }),
          ]),
        })
      );
    });

    it('should detect removed fields', () => {
      const oldConfig = { field1: 'value1', field2: 'value2' };
      const newConfig = { field1: 'value1' };

      ConfigurationValidator.validateConfigurationChange(oldConfig, newConfig, 'test');

      expect(mockLogger.log).toHaveBeenCalledWith(
        'Configuration changes detected in test:',
        expect.objectContaining({
          changes: expect.arrayContaining([
            expect.objectContaining({
              key: 'field2',
              type: 'removed',
            }),
          ]),
        })
      );
    });

    it('should detect modified fields', () => {
      const oldConfig = { field1: 'value1' };
      const newConfig = { field1: 'value2' };

      ConfigurationValidator.validateConfigurationChange(oldConfig, newConfig, 'test');

      expect(mockLogger.log).toHaveBeenCalledWith(
        'Configuration changes detected in test:',
        expect.objectContaining({
          changes: expect.arrayContaining([
            expect.objectContaining({
              key: 'field1',
              type: 'modified',
            }),
          ]),
        })
      );
    });

    it('should not log when no changes detected', () => {
      const config = { field1: 'value1' };

      ConfigurationValidator.validateConfigurationChange(config, config, 'test');

      expect(mockLogger.log).not.toHaveBeenCalled();
    });
  });

  describe('validateConfiguration', () => {
    it('should validate required fields', () => {
      const config = {};

      ConfigurationValidator.validateConfiguration(config, 'gitlab');

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Configuration validation issues in gitlab:',
        expect.objectContaining({
          issues: expect.arrayContaining([
            'Missing required field: GITLAB_BASE_URL',
            'Missing required field: GITLAB_ACCESS_TOKEN',
          ]),
        })
      );
    });

    it('should validate URL fields', () => {
      const config = {
        GITLAB_BASE_URL: 'invalid-url',
      };

      ConfigurationValidator.validateConfiguration(config, 'gitlab');

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Configuration validation issues in gitlab:',
        expect.objectContaining({
          issues: expect.arrayContaining([
            'Invalid URL in field: GITLAB_BASE_URL',
          ]),
        })
      );
    });

    it('should validate email fields', () => {
      const config = {
        JIRA_EMAIL: 'invalid-email',
      };

      ConfigurationValidator.validateConfiguration(config, 'jira');

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Configuration validation issues in jira:',
        expect.objectContaining({
          issues: expect.arrayContaining([
            'Invalid email in field: JIRA_EMAIL',
          ]),
        })
      );
    });

    it('should not warn for valid configuration', () => {
      const config = {
        GITLAB_BASE_URL: 'https://gitlab.com',
        GITLAB_ACCESS_TOKEN: 'token',
      };

      ConfigurationValidator.validateConfiguration(config, 'gitlab');

      expect(mockLogger.warn).not.toHaveBeenCalled();
    });
  });

  describe('isSectionEnabled', () => {
    it('should return true for enabled section', () => {
      const config = {
        GITLAB_ENABLED: true,
      };

      const result = ConfigurationValidator.isSectionEnabled(config, 'gitlab');

      expect(result).toBe(true);
    });

    it('should return true for string true', () => {
      const config = {
        GITLAB_ENABLED: 'true',
      };

      const result = ConfigurationValidator.isSectionEnabled(config, 'gitlab');

      expect(result).toBe(true);
    });

    it('should return false for disabled section', () => {
      const config = {
        GITLAB_ENABLED: false,
      };

      const result = ConfigurationValidator.isSectionEnabled(config, 'gitlab');

      expect(result).toBe(false);
    });

    it('should return false for undefined section', () => {
      const config = {};

      const result = ConfigurationValidator.isSectionEnabled(config, 'gitlab');

      expect(result).toBe(false);
    });
  });

  describe('getConfigurationWarnings', () => {
    it('should warn about HTTP URLs', () => {
      const config = {
        GITLAB_BASE_URL: 'http://gitlab.com',
      };

      const warnings = ConfigurationValidator.getConfigurationWarnings(config, 'gitlab');

      expect(warnings).toContain('GitLab base URL should use HTTPS for security');
    });

    it('should warn about debug logging in production', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const config = {
        LOG_LEVEL: 'debug',
      };

      const warnings = ConfigurationValidator.getConfigurationWarnings(config, 'application');

      expect(warnings).toContain('Debug logging should not be enabled in production');

      process.env.NODE_ENV = originalEnv;
    });

    it('should not warn for secure configurations', () => {
      const config = {
        GITLAB_BASE_URL: 'https://gitlab.com',
      };

      const warnings = ConfigurationValidator.getConfigurationWarnings(config, 'gitlab');

      expect(warnings).toHaveLength(0);
    });
  });

  describe('sanitizeConfiguration', () => {
    it('should trim string values', () => {
      const config = {
        GITLAB_BASE_URL: '  https://gitlab.com  ',
        GITLAB_ACCESS_TOKEN: '  token  ',
      };

      const sanitized = ConfigurationValidator.sanitizeConfiguration(config);

      expect(sanitized.GITLAB_BASE_URL).toBe('https://gitlab.com');
      expect(sanitized.GITLAB_ACCESS_TOKEN).toBe('token');
    });

    it('should preserve non-string values', () => {
      const config = {
        GITLAB_ENABLED: true,
        GITLAB_PROJECT_CONCURRENCY: 5,
      };

      const sanitized = ConfigurationValidator.sanitizeConfiguration(config);

      expect(sanitized.GITLAB_ENABLED).toBe(true);
      expect(sanitized.GITLAB_PROJECT_CONCURRENCY).toBe(5);
    });

    it('should filter out null and undefined values', () => {
      const config = {
        GITLAB_BASE_URL: 'https://gitlab.com',
        GITLAB_ACCESS_TOKEN: null,
        GITLAB_ENABLED: undefined,
      };

      const sanitized = ConfigurationValidator.sanitizeConfiguration(config);

      expect(sanitized.GITLAB_BASE_URL).toBe('https://gitlab.com');
      expect(sanitized.GITLAB_ACCESS_TOKEN).toBeUndefined();
      expect(sanitized.GITLAB_ENABLED).toBeUndefined();
    });
  });

  describe('initialization', () => {
    it('should throw error when not initialized', () => {
      // Reset the static logger
      (ConfigurationValidator as any).logger = undefined;

      expect(() => {
        ConfigurationValidator.validateConfigurationChange({}, {}, 'test');
      }).toThrow('ConfigurationValidator not initialized. Call initialize() first.');
    });
  });
});
