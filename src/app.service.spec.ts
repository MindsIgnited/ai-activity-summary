import { Test, TestingModule } from '@nestjs/testing';
import { AppService } from './app.service';
import { JiraService } from './services/jira.service';
import { TeamsService } from './services/teams.service';
import { GitLabService } from './services/gitlab.service';
import { SlackService } from './services/slack.service';

describe('AppService', () => {
  let service: AppService;
  let jiraService: jest.Mocked<JiraService>;
  let teamsService: jest.Mocked<TeamsService>;
  let gitlabService: jest.Mocked<GitLabService>;
  let slackService: jest.Mocked<SlackService>;

  const mockJiraService = {
    fetchActivities: jest.fn(),
  };

  const mockTeamsService = {
    fetchActivities: jest.fn(),
  };

  const mockGitlabService = {
    fetchActivities: jest.fn(),
  };

  const mockSlackService = {
    fetchActivities: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AppService,
        {
          provide: JiraService,
          useValue: mockJiraService,
        },
        {
          provide: TeamsService,
          useValue: mockTeamsService,
        },
        {
          provide: GitLabService,
          useValue: mockGitlabService,
        },
        {
          provide: SlackService,
          useValue: mockSlackService,
        },
      ],
    }).compile();

    service = module.get<AppService>(AppService);
    jiraService = module.get(JiraService);
    teamsService = module.get(TeamsService);
    gitlabService = module.get(GitLabService);
    slackService = module.get(SlackService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('generateActivitySummary', () => {
    it('should generate summary for a single day', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-01');

      const mockActivities = [
        {
          id: '1',
          type: 'gitlab' as const,
          timestamp: new Date('2024-01-01T10:00:00Z'),
          title: 'Test commit',
          author: 'test@example.com',
        },
      ];

      gitlabService.fetchActivities.mockResolvedValue(mockActivities);
      slackService.fetchActivities.mockResolvedValue([]);
      teamsService.fetchActivities.mockResolvedValue([]);
      jiraService.fetchActivities.mockResolvedValue([]);

      const result = await service.generateActivitySummary(startDate, endDate);

      expect(result).toHaveLength(1);
      expect(result[0].date).toBe('2024-01-01');
      expect(result[0].activities).toHaveLength(1);
      expect(result[0].summary.totalActivities).toBe(1);
      expect(result[0].summary.byType.gitlab).toBe(1);
    });

    it('should generate summary for multiple days', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-03');

      gitlabService.fetchActivities.mockResolvedValue([]);
      slackService.fetchActivities.mockResolvedValue([]);
      teamsService.fetchActivities.mockResolvedValue([]);
      jiraService.fetchActivities.mockResolvedValue([]);

      const result = await service.generateActivitySummary(startDate, endDate);

      expect(result).toHaveLength(3);
      expect(result[0].date).toBe('2024-01-01');
      expect(result[1].date).toBe('2024-01-02');
      expect(result[2].date).toBe('2024-01-03');
    });

    it('should handle errors gracefully', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-01');

      gitlabService.fetchActivities.mockRejectedValue(new Error('API Error'));
      slackService.fetchActivities.mockResolvedValue([]);
      teamsService.fetchActivities.mockResolvedValue([]);
      jiraService.fetchActivities.mockResolvedValue([]);

      const result = await service.generateActivitySummary(startDate, endDate);

      expect(result).toHaveLength(1);
      expect(result[0].activities).toHaveLength(0);
      expect(result[0].summary.totalActivities).toBe(0);
    });
  });

  describe('getSummaryStats', () => {
    it('should return correct stats for multiple days', async () => {
      const mockSummaries = [
        {
          date: '2024-01-01',
          activities: [
            { id: '1', type: 'gitlab' as const, timestamp: new Date(), title: 'Test 1', author: 'user1' },
            { id: '2', type: 'slack' as const, timestamp: new Date(), title: 'Test 2', author: 'user2' },
          ],
          summary: { totalActivities: 2, byType: { gitlab: 1, slack: 1 }, byAuthor: { user1: 1, user2: 1 } },
        },
        {
          date: '2024-01-02',
          activities: [
            { id: '3', type: 'gitlab' as const, timestamp: new Date(), title: 'Test 3', author: 'user1' },
          ],
          summary: { totalActivities: 1, byType: { gitlab: 1, slack: 0 }, byAuthor: { user1: 1, user2: 0 } },
        },
      ];

      const stats = await service.getSummaryStats(mockSummaries);

      expect(stats.totalDays).toBe(2);
      expect(stats.totalActivities).toBe(3);
      expect(stats.averageActivitiesPerDay).toBe(1.5);
      expect(stats.mostActiveDay).toBe('2024-01-01');
      expect(stats.mostActiveAuthor).toBe('user1');
    });

    it('should handle empty summaries', async () => {
      const stats = await service.getSummaryStats([]);

      expect(stats.totalDays).toBe(0);
      expect(stats.totalActivities).toBe(0);
      expect(stats.averageActivitiesPerDay).toBe(0);
      expect(stats.mostActiveDay).toBe('');
      expect(stats.mostActiveAuthor).toBe('');
    });
  });
}); 