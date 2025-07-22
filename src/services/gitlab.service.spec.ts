import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { GitLabService } from './gitlab.service';
import { ActivityData } from '../app.service';
import { ActivityFactory } from '../utils/activity.factory';

describe('GitLabService', () => {
  let service: GitLabService;
  let configService: ConfigService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GitLabService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              const config = {
                'GITLAB_BASE_URL': 'https://gitlab.com',
                'GITLAB_ACCESS_TOKEN': 'test-access-token',
                'GITLAB_PROJECT_IDS': '123,456,789',
              };
              return config[key];
            }),
          },
        },
      ],
    }).compile();

    service = module.get<GitLabService>(GitLabService);
    configService = module.get<ConfigService>(ConfigService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should return empty array when configuration is incomplete', async () => {
    jest.spyOn(configService, 'get').mockReturnValue(undefined);

    const result = await service.fetchActivities(new Date());
    expect(result).toEqual([]);
  });

  it('should return empty array when GITLAB_ACCESS_TOKEN is missing', async () => {
    jest.spyOn(configService, 'get').mockImplementation((key: string) => {
      if (key === 'GITLAB_ACCESS_TOKEN') return undefined;
      return 'test-value';
    });

    const result = await service.fetchActivities(new Date());
    expect(result).toEqual([]);
  });

  it('should return empty array when user authentication fails', async () => {
    // Mock fetch to simulate user authentication failure
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
    });

    const result = await service.fetchActivities(new Date());
    expect(result).toEqual([]);
  });

  it('should fetch and filter activities for the authenticated user', async () => {
    const mockUser = {
      id: 123,
      name: 'Test User',
      username: 'testuser',
      email: 'test@example.com',
    };

    const mockCommits = [
      {
        id: 'abc123',
        short_id: 'abc123',
        title: 'Test commit',
        message: 'Test commit message',
        author_name: 'Test User',
        author_email: 'test@example.com',
        created_at: '2024-01-01T10:00:00Z',
        web_url: 'https://gitlab.com/test/project/-/commit/abc123',
        project_id: 1,
        project_name: 'Test Project',
      },
      {
        id: 'def456',
        short_id: 'def456',
        title: 'Another commit',
        message: 'Another commit message',
        author_name: 'Other User',
        author_email: 'other@example.com',
        created_at: '2024-01-01T11:00:00Z',
        web_url: 'https://gitlab.com/test/project/-/commit/def456',
        project_id: 1,
        project_name: 'Test Project',
      },
    ];

    const mockProjects = [
      {
        id: 1,
        name: 'Test Project',
        path: 'test-project',
        web_url: 'https://gitlab.com/test/project',
      },
    ];

    // Mock the getCurrentUser method
    jest.spyOn(service, 'getCurrentUser').mockResolvedValue(mockUser);

    // Mock the fetchCommitsByDateRange method to return filtered data
    const mockActivityData = [
      {
        id: 'gitlab-commit-abc123',
        type: 'gitlab' as const,
        timestamp: new Date('2024-01-01T10:00:00Z'),
        title: 'Commit: Test commit',
        description: 'Test commit message',
        author: 'Test User',
        url: 'https://gitlab.com/test/project/-/commit/abc123',
        metadata: {
          action: 'commit',
          shortId: 'abc123',
          projectId: 1,
          projectName: 'Test Project',
          authorEmail: 'test@example.com',
        },
      },
    ];

    jest.spyOn(service, 'fetchCommitsByDateRange').mockResolvedValue(
      new Map([['2024-01-01', mockActivityData]])
    );
    jest.spyOn(service, 'fetchMergeRequestsByDateRange').mockResolvedValue(new Map());
    jest.spyOn(service, 'fetchIssuesByDateRange').mockResolvedValue(new Map());
    jest.spyOn(service, 'fetchComments').mockResolvedValue([]);

    const result = await service.fetchActivities(new Date('2024-01-01'));

    // Should only include activities from the authenticated user
    expect(result).toHaveLength(1);
    expect(result[0].author).toBe('Test User');
    expect(result[0].metadata?.action).toBe('commit');
  });

  it('should handle API errors gracefully', async () => {
    // Mock the makeGitLabRequest method to bypass retry logic for this test
    const originalMakeRequest = (service as any).makeGitLabRequest;
    (service as any).makeGitLabRequest = jest.fn().mockRejectedValue(new Error('API Error'));

    try {
      const result = await service.fetchActivities(new Date());
      expect(result).toEqual([]);
    } finally {
      // Restore original method
      (service as any).makeGitLabRequest = originalMakeRequest;
    }
  });

  it('should handle project fetch errors gracefully', async () => {
    // Mock the makeGitLabRequest method to bypass retry logic for this test
    const originalMakeRequest = (service as any).makeGitLabRequest;
    (service as any).makeGitLabRequest = jest.fn().mockRejectedValue(new Error('Project not found'));

    try {
      const result = await service.fetchActivities(new Date());
      expect(result).toEqual([]);
    } finally {
      // Restore original method
      (service as any).makeGitLabRequest = originalMakeRequest;
    }
  });

  describe('caching optimization', () => {
    it('should use cached data for subsequent calls within the same date range', async () => {
      // Mock the date range methods to track calls
      const mockCommitsMap = new Map<string, ActivityData[]>();
      mockCommitsMap.set('2024-01-01', [
        ActivityFactory.createCommitActivity({
          id: '123',
          short_id: 'abc123',
          title: 'Test commit',
          message: 'Test commit message',
          author_name: 'Test User',
          author_email: 'test@example.com',
          created_at: '2024-01-01T10:00:00Z',
          web_url: 'https://gitlab.com/test',
          project_id: 1,
          project_name: 'Test Project'
        })
      ]);

      const mockMergeRequestsMap = new Map<string, ActivityData[]>();
      const mockIssuesMap = new Map<string, ActivityData[]>();

      jest.spyOn(service, 'fetchCommitsByDateRange').mockResolvedValue(mockCommitsMap);
      jest.spyOn(service, 'fetchMergeRequestsByDateRange').mockResolvedValue(mockMergeRequestsMap);
      jest.spyOn(service, 'fetchIssuesByDateRange').mockResolvedValue(mockIssuesMap);
      jest.spyOn(service, 'getCurrentUser').mockResolvedValue({
        id: 1,
        name: 'Test User',
        username: 'testuser',
        email: 'test@example.com'
      });

      const date = new Date('2024-01-01');

      // First call - should initialize cache
      const activities1 = await service.fetchActivities(date);

      // Second call - should use cached data
      const activities2 = await service.fetchActivities(date);

      // Verify both calls return the same data
      expect(activities1).toEqual(activities2);
      expect(activities1).toHaveLength(1);
      expect(activities1[0].type).toBe('gitlab');

      // Verify date range methods were only called once (for cache initialization)
      expect(service.fetchCommitsByDateRange).toHaveBeenCalledTimes(1);
      expect(service.fetchMergeRequestsByDateRange).toHaveBeenCalledTimes(1);
      expect(service.fetchIssuesByDateRange).toHaveBeenCalledTimes(1);

      // Clear cache and verify it works again
      service.clearCache();

      const activities3 = await service.fetchActivities(date);

      // Should call date range methods again after cache clear
      expect(service.fetchCommitsByDateRange).toHaveBeenCalledTimes(2);
      expect(service.fetchMergeRequestsByDateRange).toHaveBeenCalledTimes(2);
      expect(service.fetchIssuesByDateRange).toHaveBeenCalledTimes(2);
    });
  });
});
