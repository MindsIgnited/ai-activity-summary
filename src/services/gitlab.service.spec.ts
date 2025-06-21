import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { GitLabService } from './gitlab.service';

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

    // Mock fetch to return different responses for different endpoints
    global.fetch = jest.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockUser),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockProjects),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockCommits),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([]),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([]),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([]),
      });

    const result = await service.fetchActivities(new Date('2024-01-01'));

    // Should only include activities from the authenticated user
    expect(result).toHaveLength(1);
    expect(result[0].author).toBe('Test User');
    expect(result[0].metadata.action).toBe('commit');
  });

  it('should handle API errors gracefully', async () => {
    // Mock successful user fetch, then API failure
    global.fetch = jest.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          id: 123,
          name: 'Test User',
          username: 'testuser',
          email: 'test@example.com',
        }),
      })
      .mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

    const result = await service.fetchActivities(new Date());
    expect(result).toEqual([]);
  });

  it('should handle project fetch errors gracefully', async () => {
    // Mock successful user fetch, then project fetch failure
    global.fetch = jest.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          id: 123,
          name: 'Test User',
          username: 'testuser',
          email: 'test@example.com',
        }),
      })
      .mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      });

    const result = await service.fetchActivities(new Date());
    expect(result).toEqual([]);
  });
});
