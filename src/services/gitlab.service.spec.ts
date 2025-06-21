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

  it('should handle API errors gracefully', async () => {
    // Mock fetch to simulate API failure
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
    });

    const result = await service.fetchActivities(new Date());
    expect(result).toEqual([]);
  });

  it('should handle project fetch errors gracefully', async () => {
    // Mock fetch to simulate project fetch failure
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    });

    const result = await service.fetchActivities(new Date());
    expect(result).toEqual([]);
  });
}); 