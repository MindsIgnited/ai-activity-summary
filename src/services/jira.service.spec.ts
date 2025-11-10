import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JiraService } from './jira.service';

const REQUIRED_ENV_VARS = ['JIRA_BASE_URL', 'JIRA_EMAIL', 'JIRA_API_TOKEN'] as const;
const hasIntegrationEnv = REQUIRED_ENV_VARS.every(key => !!process.env[key]);

if (!hasIntegrationEnv) {
  console.warn(
    'Skipping JiraService integration tests. Missing required Jira env vars: %s',
    REQUIRED_ENV_VARS.filter(key => !process.env[key]).join(', ')
  );
}

const describeIntegration = hasIntegrationEnv ? describe : describe.skip;

describeIntegration('JiraService Integration', () => {
  let service: JiraService;

  beforeAll(async () => {
    jest.setTimeout(60_000);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JiraService,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) => process.env[key],
          },
        },
      ],
    }).compile();

    service = module.get<JiraService>(JiraService);
  });

  it('fetches activities for a specific day', async () => {
    const date = new Date();
    const activities = await service.fetchActivities(date);
    expect(Array.isArray(activities)).toBe(true);
  });

  it('preloads data for a date range without errors', async () => {
    const endDate = new Date();
    const startDate = new Date(endDate);
    startDate.setDate(endDate.getDate() - 1);

    await expect(service.preload(startDate, endDate)).resolves.not.toThrow();
  });
});
