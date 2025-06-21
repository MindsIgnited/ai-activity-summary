import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { TeamsService } from './teams.service';

describe('TeamsService', () => {
  let service: TeamsService;
  let configService: ConfigService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TeamsService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              const config = {
                'TEAMS_CLIENT_ID': 'test-client-id',
                'TEAMS_CLIENT_SECRET': 'test-client-secret',
                'TEAMS_TENANT_ID': 'test-tenant-id',
                'TEAMS_EMAIL': 'test@example.com',
                'TEAMS_CHANNELS': 'General,Project Updates',
              };
              return config[key];
            }),
          },
        },
      ],
    }).compile();

    service = module.get<TeamsService>(TeamsService);
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

  it('should return empty array when TEAMS_EMAIL is missing', async () => {
    jest.spyOn(configService, 'get').mockImplementation((key: string) => {
      if (key === 'TEAMS_EMAIL') return undefined;
      return 'test-value';
    });
    
    const result = await service.fetchActivities(new Date());
    expect(result).toEqual([]);
  });

  it('should handle authentication errors gracefully', async () => {
    // Mock fetch to simulate authentication failure
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
    });

    const result = await service.fetchActivities(new Date());
    expect(result).toEqual([]);
  });
}); 