import { ActivityFactory } from './activity.factory';
import { ActivityData } from '../app.service';

describe('ActivityFactory', () => {
  const mockDate = new Date('2024-01-01T10:00:00Z');

  describe('createActivity', () => {
    it('should create a basic activity', () => {
      const activity = ActivityFactory.createActivity(
        'gitlab',
        'test-id',
        mockDate,
        'Test Title',
        'Test Description',
        'Test Author',
        'https://example.com',
        { test: 'metadata' }
      );

      expect(activity).toEqual({
        id: 'test-id',
        type: 'gitlab',
        timestamp: mockDate,
        title: 'Test Title',
        description: 'Test Description',
        author: 'Test Author',
        url: 'https://example.com',
        metadata: { test: 'metadata' },
      });
    });

    it('should create activity with minimal required fields', () => {
      const activity = ActivityFactory.createActivity(
        'slack',
        'minimal-id',
        mockDate,
        'Minimal Title'
      );

      expect(activity).toEqual({
        id: 'minimal-id',
        type: 'slack',
        timestamp: mockDate,
        title: 'Minimal Title',
        description: undefined,
        author: undefined,
        url: undefined,
        metadata: undefined,
      });
    });
  });

  describe('createGitLabActivity', () => {
    it('should create a GitLab activity', () => {
      const activity = ActivityFactory.createGitLabActivity(
        'gitlab-123',
        mockDate,
        'GitLab Commit',
        'Commit message',
        'John Doe',
        'https://gitlab.com/commit/123'
      );

      expect(activity.type).toBe('gitlab');
      expect(activity.id).toBe('gitlab-123');
      expect(activity.title).toBe('GitLab Commit');
    });
  });

  describe('createSlackActivity', () => {
    it('should create a Slack activity', () => {
      const activity = ActivityFactory.createSlackActivity(
        'slack-456',
        mockDate,
        'Slack Message',
        'Hello world',
        'Jane Smith',
        'https://slack.com/message/456'
      );

      expect(activity.type).toBe('slack');
      expect(activity.id).toBe('slack-456');
      expect(activity.title).toBe('Slack Message');
    });
  });

  describe('createTeamsActivity', () => {
    it('should create a Teams activity', () => {
      const activity = ActivityFactory.createTeamsActivity(
        'teams-789',
        mockDate,
        'Teams Message',
        'Meeting notes',
        'Bob Wilson',
        'https://teams.microsoft.com/message/789'
      );

      expect(activity.type).toBe('teams');
      expect(activity.id).toBe('teams-789');
      expect(activity.title).toBe('Teams Message');
    });
  });

  describe('createJiraActivity', () => {
    it('should create a Jira activity', () => {
      const activity = ActivityFactory.createJiraActivity(
        'jira-101',
        mockDate,
        'Jira Issue',
        'Bug description',
        'Alice Johnson',
        'https://jira.com/issue/101'
      );

      expect(activity.type).toBe('jira');
      expect(activity.id).toBe('jira-101');
      expect(activity.title).toBe('Jira Issue');
    });
  });

  describe('createActivityWithGeneratedId', () => {
    it('should create activity with generated ID', () => {
      const activity = ActivityFactory.createActivityWithGeneratedId(
        'gitlab',
        'commit-123',
        mockDate,
        'Generated Title'
      );

      expect(activity.id).toBe('gitlab-commit-123');
      expect(activity.type).toBe('gitlab');
      expect(activity.title).toBe('Generated Title');
    });
  });

  describe('createActivityWithTimestampId', () => {
    it('should create activity with timestamp-based ID', () => {
      const activity = ActivityFactory.createActivityWithTimestampId(
        'slack',
        mockDate,
        'Timestamp Title'
      );

      expect(activity.id).toBe(`slack-${mockDate.getTime()}`);
      expect(activity.type).toBe('slack');
      expect(activity.title).toBe('Timestamp Title');
    });
  });

  describe('createActivityWithPrefix', () => {
    it('should create activity with custom prefix', () => {
      const activity = ActivityFactory.createActivityWithPrefix(
        'jira',
        'issue',
        'PROJ-123',
        mockDate,
        'Prefixed Title'
      );

      expect(activity.id).toBe('jira-issue-PROJ-123');
      expect(activity.type).toBe('jira');
      expect(activity.title).toBe('Prefixed Title');
    });
  });

  describe('type safety', () => {
    it('should only accept valid activity types', () => {
      // This test ensures TypeScript compilation works correctly
      const validTypes: Array<'gitlab' | 'slack' | 'teams' | 'jira'> = [
        'gitlab',
        'slack',
        'teams',
        'jira',
      ];

      validTypes.forEach(type => {
        const activity = ActivityFactory.createActivity(
          type,
          'test-id',
          mockDate,
          'Test Title'
        );
        expect(activity.type).toBe(type);
      });
    });
  });
});
