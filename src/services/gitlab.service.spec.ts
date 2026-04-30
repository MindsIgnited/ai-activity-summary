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
              const config: Record<string, string> = {
                GITLAB_BASE_URL: 'https://gitlab.com',
                GITLAB_ACCESS_TOKEN: 'test-access-token',
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
      if (key === 'GITLAB_ACCESS_TOKEN') return undefined as any;
      return 'test-value';
    });

    const result = await service.fetchActivities(new Date());
    expect(result).toEqual([]);
  });

  it('should return empty array when user authentication fails', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
    }) as any;

    const result = await service.fetchActivities(new Date());
    expect(result).toEqual([]);
  });

  it('should map an event into an activity bucketed by Pacific date', async () => {
    const user = { id: 1, name: 'Test User', username: 'testuser', email: 'test@example.com' };

    jest.spyOn(service, 'getCurrentUser').mockResolvedValue(user as any);
    jest.spyOn(service, 'fetchEventsByDateRange').mockResolvedValue(
      new Map([
        [
          '2024-01-01',
          [
            {
              id: 'gitlab-event-42',
              type: 'gitlab' as const,
              timestamp: new Date('2024-01-02T03:00:00Z'),
              title: 'Push (pushed) to branch main: Initial commit',
              description: 'Initial commit',
              author: 'Test User',
              metadata: { action: 'push', commitCount: 1 },
            },
          ],
        ],
      ]),
    );

    const result = await service.fetchActivities(new Date('2024-01-01T12:00:00-08:00'));

    expect(result).toHaveLength(1);
    expect(result[0].author).toBe('Test User');
    expect(result[0].metadata?.action).toBe('push');
  });

  it('should handle API errors gracefully', async () => {
    (service as any).makeGitLabRequest = jest.fn().mockRejectedValue(new Error('API Error'));

    const result = await service.fetchActivities(new Date());
    expect(result).toEqual([]);
  });

  describe('caching optimization', () => {
    it('should reuse cached data for subsequent calls within the same date range', async () => {
      const fetchSpy = jest.spyOn(service, 'fetchEventsByDateRange').mockResolvedValue(
        new Map([
          [
            '2024-01-01',
            [
              {
                id: 'gitlab-event-1',
                type: 'gitlab' as const,
                timestamp: new Date('2024-01-01T10:00:00Z'),
                title: 'Push (pushed) to branch main: Test commit',
                description: 'Test commit',
                author: 'Test User',
                metadata: { action: 'push' },
              },
            ],
          ],
        ]),
      );

      jest.spyOn(service, 'getCurrentUser').mockResolvedValue({
        id: 1,
        name: 'Test User',
        username: 'testuser',
        email: 'test@example.com',
      } as any);

      const date = new Date('2024-01-01T12:00:00-08:00');

      const first = await service.fetchActivities(date);
      const second = await service.fetchActivities(date);

      expect(first).toEqual(second);
      expect(first).toHaveLength(1);
      expect(first[0].type).toBe('gitlab');
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      service.clearCache();
      await service.fetchActivities(date);
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });
  });
});
