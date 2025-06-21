import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { SlackService } from './slack.service';

describe('SlackService', () => {
  let service: SlackService;
  let configService: ConfigService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SlackService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              const config = {
                'SLACK_BOT_TOKEN': 'xoxb-test-token',
                'SLACK_CHANNELS': 'general,random',
              };
              return config[key];
            }),
          },
        },
      ],
    }).compile();

    service = module.get<SlackService>(SlackService);
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

  it('should handle Slack API errors gracefully', async () => {
    // Mock fetch to simulate Slack API failure
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      json: async () => ({ ok: false, error: 'invalid_auth' }),
    });
    const result = await service.fetchActivities(new Date());
    expect(result).toEqual([]);
  });
}); 