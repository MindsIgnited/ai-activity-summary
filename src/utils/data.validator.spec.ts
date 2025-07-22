import { DataValidator } from './data.validator';
import { ActivityData } from '../app.service';
import { ErrorUtils } from './error.utils';

describe('DataValidator', () => {
  const mockDate = new Date('2024-01-01T10:00:00Z');

  describe('validateActivityData', () => {
    it('should validate valid activity data', () => {
      const validData = {
        id: 'test-id',
        type: 'gitlab',
        timestamp: mockDate,
        title: 'Test Activity',
        description: 'Test description',
        author: 'Test Author',
        url: 'https://example.com',
        metadata: { test: 'value' },
      };

      const result = DataValidator.validateActivityData(validData);

      expect(result).toEqual(validData);
    });

    it('should validate minimal activity data', () => {
      const minimalData = {
        id: 'test-id',
        type: 'slack',
        timestamp: mockDate,
        title: 'Test Activity',
      };

      const result = DataValidator.validateActivityData(minimalData);

      expect(result).toEqual({
        ...minimalData,
        description: undefined,
        author: undefined,
        url: undefined,
        metadata: undefined,
      });
    });

    it('should throw error for missing id', () => {
      const invalidData = {
        type: 'gitlab',
        timestamp: mockDate,
        title: 'Test Activity',
      };

      expect(() => DataValidator.validateActivityData(invalidData)).toThrow(
        'ActivityData must have a valid string id'
      );
    });

    it('should throw error for invalid type', () => {
      const invalidData = {
        id: 'test-id',
        type: 'invalid',
        timestamp: mockDate,
        title: 'Test Activity',
      };

      expect(() => DataValidator.validateActivityData(invalidData)).toThrow(
        'ActivityData must have a valid type (gitlab, slack, teams, jira)'
      );
    });

    it('should throw error for missing timestamp', () => {
      const invalidData = {
        id: 'test-id',
        type: 'gitlab',
        title: 'Test Activity',
      };

      expect(() => DataValidator.validateActivityData(invalidData)).toThrow(
        'ActivityData must have a valid timestamp'
      );
    });

    it('should throw error for missing title', () => {
      const invalidData = {
        id: 'test-id',
        type: 'gitlab',
        timestamp: mockDate,
      };

      expect(() => DataValidator.validateActivityData(invalidData)).toThrow(
        'ActivityData must have a valid string title'
      );
    });

    it('should throw error for invalid description type', () => {
      const invalidData = {
        id: 'test-id',
        type: 'gitlab',
        timestamp: mockDate,
        title: 'Test Activity',
        description: 123,
      };

      expect(() => DataValidator.validateActivityData(invalidData)).toThrow(
        'ActivityData description must be a string if provided'
      );
    });
  });

  describe('validateApiResponse', () => {
    it('should validate response with required fields', () => {
      const response = {
        id: 123,
        name: 'Test Name',
        url: 'https://example.com',
      };

      const schema = {
        id: { required: true, type: 'number' },
        name: { required: true, type: 'string' },
        url: { required: true, url: true },
      };

      const result = DataValidator.validateApiResponse(response, schema);

      expect(result).toBe(true);
    });

    it('should throw error for missing required field', () => {
      const response = {
        id: 123,
        // name is missing
      };

      const schema = {
        id: { required: true, type: 'number' },
        name: { required: true, type: 'string' },
      };

      expect(() => DataValidator.validateApiResponse(response, schema)).toThrow(
        "Required field 'name' is missing"
      );
    });

    it('should throw error for wrong type', () => {
      const response = {
        id: 'not-a-number',
      };

      const schema = {
        id: { required: true, type: 'number' },
      };

      expect(() => DataValidator.validateApiResponse(response, schema)).toThrow(
        "Field 'id' must be of type number, got string"
      );
    });

    it('should validate string length constraints', () => {
      const response = {
        name: 'ab', // too short
      };

      const schema = {
        name: { required: true, type: 'string', minLength: 3 },
      };

      expect(() => DataValidator.validateApiResponse(response, schema)).toThrow(
        "Field 'name' must be at least 3 characters long"
      );
    });

    it('should validate URL format', () => {
      const response = {
        url: 'not-a-url',
      };

      const schema = {
        url: { required: true, url: true },
      };

      expect(() => DataValidator.validateApiResponse(response, schema)).toThrow(
        "Field 'url' must be a valid URL"
      );
    });

    it('should validate email format', () => {
      const response = {
        email: 'not-an-email',
      };

      const schema = {
        email: { required: true, email: true },
      };

      expect(() => DataValidator.validateApiResponse(response, schema)).toThrow(
        "Field 'email' must be a valid email address"
      );
    });
  });

  describe('validateGitLabResponse', () => {
    it('should validate GitLab projects response', () => {
      const response = {
        id: 123,
        name: 'Test Project',
        web_url: 'https://gitlab.com/project',
      };

      const result = DataValidator.validateGitLabResponse(response, 'projects');

      expect(result).toBe(true);
    });

    it('should validate GitLab commits response', () => {
      const response = {
        id: 'abc123',
        title: 'Test commit',
        created_at: '2024-01-01T10:00:00Z',
        author_name: 'Test Author',
      };

      const result = DataValidator.validateGitLabResponse(response, 'commits');

      expect(result).toBe(true);
    });

    it('should return true for unknown endpoint', () => {
      const response = { test: 'data' };

      const result = DataValidator.validateGitLabResponse(response, 'unknown');

      expect(result).toBe(true);
    });
  });

  describe('validateSlackResponse', () => {
    it('should validate Slack conversations.history response', () => {
      const response = {
        ok: true,
        messages: [],
      };

      const result = DataValidator.validateSlackResponse(response, 'conversations.history');

      expect(result).toBe(true);
    });

    it('should validate Slack users.info response', () => {
      const response = {
        ok: true,
        user: { id: 'U123', name: 'Test User' },
      };

      const result = DataValidator.validateSlackResponse(response, 'users.info');

      expect(result).toBe(true);
    });
  });

  describe('validateTeamsResponse', () => {
    it('should validate Teams messages response', () => {
      const response = {
        value: [],
      };

      const result = DataValidator.validateTeamsResponse(response, 'messages');

      expect(result).toBe(true);
    });

    it('should validate Teams events response', () => {
      const response = {
        value: [],
      };

      const result = DataValidator.validateTeamsResponse(response, 'events');

      expect(result).toBe(true);
    });
  });

  describe('validateJiraResponse', () => {
    it('should validate Jira issues response', () => {
      const response = {
        issues: [],
        total: 0,
      };

      const result = DataValidator.validateJiraResponse(response, 'issues');

      expect(result).toBe(true);
    });

    it('should validate Jira comments response', () => {
      const response = {
        comments: [],
      };

      const result = DataValidator.validateJiraResponse(response, 'comments');

      expect(result).toBe(true);
    });
  });

  describe('validateActivityDataArray', () => {
    it('should validate array of activity data', () => {
      const activities = [
        {
          id: 'test-1',
          type: 'gitlab',
          timestamp: mockDate,
          title: 'Activity 1',
        },
        {
          id: 'test-2',
          type: 'slack',
          timestamp: mockDate,
          title: 'Activity 2',
        },
      ];

      const result = DataValidator.validateActivityDataArray(activities);

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('test-1');
      expect(result[1].id).toBe('test-2');
    });

    it('should throw error for non-array input', () => {
      const invalidInput = 'not an array';

      expect(() => DataValidator.validateActivityDataArray(invalidInput as any)).toThrow(
        'Expected array of ActivityData'
      );
    });

    it('should throw error for invalid items in array', () => {
      const activities = [
        {
          id: 'test-1',
          type: 'gitlab',
          timestamp: mockDate,
          title: 'Activity 1',
        },
        {
          // missing required fields
          id: 'test-2',
        },
      ];

      expect(() => DataValidator.validateActivityDataArray(activities)).toThrow(
        'ActivityData array validation failed'
      );
    });
  });

  describe('validateConfiguration', () => {
    it('should validate valid configuration', () => {
      const config = {
        LOG_LEVEL: 'debug',
        GITLAB_ENABLED: true,
        GITLAB_PROJECT_CONCURRENCY: 5,
      };

      const result = DataValidator.validateConfiguration(config);

      expect(result).toBe(true);
    });

    it('should throw error for missing required fields', () => {
      const config = {};

      expect(() => DataValidator.validateConfiguration(config)).toThrow(
        "Required configuration field 'LOG_LEVEL' is missing"
      );
    });

    it('should throw error for invalid LOG_LEVEL', () => {
      const config = {
        LOG_LEVEL: 'invalid',
      };

      expect(() => DataValidator.validateConfiguration(config)).toThrow(
        'LOG_LEVEL must be one of: error, warn, log, debug, verbose'
      );
    });

    it('should throw error for invalid numeric fields', () => {
      const config = {
        LOG_LEVEL: 'debug',
        GITLAB_PROJECT_CONCURRENCY: 'not-a-number',
      };

      expect(() => DataValidator.validateConfiguration(config)).toThrow(
        "Field 'GITLAB_PROJECT_CONCURRENCY' must be a positive number"
      );
    });
  });

  describe('sanitizeString', () => {
    it('should sanitize valid string', () => {
      const result = DataValidator.sanitizeString('  test string  ');

      expect(result).toBe('test string');
    });

    it('should return empty string for non-string input', () => {
      const result = DataValidator.sanitizeString(123);

      expect(result).toBe('');
    });

    it('should truncate string if maxLength provided', () => {
      const result = DataValidator.sanitizeString('  long string  ', 5);

      expect(result).toBe('long ');
    });
  });

  describe('sanitizeUrl', () => {
    it('should sanitize valid URL', () => {
      const result = DataValidator.sanitizeUrl('  https://example.com  ');

      expect(result).toBe('https://example.com');
    });

    it('should return undefined for invalid URL', () => {
      const result = DataValidator.sanitizeUrl('not-a-url');

      expect(result).toBeUndefined();
    });

    it('should return undefined for non-string input', () => {
      const result = DataValidator.sanitizeUrl(123);

      expect(result).toBeUndefined();
    });
  });

  describe('sanitizeEmail', () => {
    it('should sanitize valid email', () => {
      const result = DataValidator.sanitizeEmail('  TEST@EXAMPLE.COM  ');

      expect(result).toBe('test@example.com');
    });

    it('should return undefined for invalid email', () => {
      const result = DataValidator.sanitizeEmail('not-an-email');

      expect(result).toBeUndefined();
    });

    it('should return undefined for non-string input', () => {
      const result = DataValidator.sanitizeEmail(123);

      expect(result).toBeUndefined();
    });
  });
});
