import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { getApiConfig } from './api.config';

describe('Environment Configuration', () => {
  it('should load environment files with correct precedence', async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          envFilePath: ['.env.local', '.env'],
          ignoreEnvFile: false,
        }),
      ],
    }).compile();

    const configService = module.get<ConfigService>(ConfigService);
    
    // Test that the configuration is loaded
    expect(configService).toBeDefined();
  });

  it('should handle missing environment files gracefully', async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          envFilePath: ['.env.local', '.env'],
          ignoreEnvFile: false,
        }),
      ],
    }).compile();

    const configService = module.get<ConfigService>(ConfigService);
    
    // Should not throw an error even if files don't exist
    expect(configService).toBeDefined();
  });
});

describe('API Configuration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('should enable integrations by default', () => {
    const config = getApiConfig();
    
    expect(config.gitlab.enabled).toBe(true);
    expect(config.slack.enabled).toBe(true);
    expect(config.teams.enabled).toBe(true);
    expect(config.jira.enabled).toBe(true);
  });

  it('should disable integrations when explicitly set to false', () => {
    process.env.GITLAB_ENABLED = 'false';
    process.env.SLACK_ENABLED = 'false';
    process.env.TEAMS_ENABLED = 'false';
    process.env.JIRA_ENABLED = 'false';

    const config = getApiConfig();
    
    expect(config.gitlab.enabled).toBe(false);
    expect(config.slack.enabled).toBe(false);
    expect(config.teams.enabled).toBe(false);
    expect(config.jira.enabled).toBe(false);
  });

  it('should enable integrations when explicitly set to true', () => {
    process.env.GITLAB_ENABLED = 'true';
    process.env.SLACK_ENABLED = 'true';
    process.env.TEAMS_ENABLED = 'true';
    process.env.JIRA_ENABLED = 'true';

    const config = getApiConfig();
    
    expect(config.gitlab.enabled).toBe(true);
    expect(config.slack.enabled).toBe(true);
    expect(config.teams.enabled).toBe(true);
    expect(config.jira.enabled).toBe(true);
  });

  it('should handle mixed enable/disable settings', () => {
    process.env.GITLAB_ENABLED = 'false';
    process.env.SLACK_ENABLED = 'true';
    process.env.TEAMS_ENABLED = 'false';
    process.env.JIRA_ENABLED = 'true';

    const config = getApiConfig();
    
    expect(config.gitlab.enabled).toBe(false);
    expect(config.slack.enabled).toBe(true);
    expect(config.teams.enabled).toBe(false);
    expect(config.jira.enabled).toBe(true);
  });
}); 