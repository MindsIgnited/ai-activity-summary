import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JiraService } from './jira.service';

describe('JiraService (unit)', () => {
  let service: JiraService;
  let configService: ConfigService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JiraService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              const config: Record<string, string | undefined> = {
                'JIRA_BASE_URL': 'https://example.atlassian.net',
                'JIRA_EMAIL': 'test@example.com',
                'JIRA_API_TOKEN': 'token',
                'JIRA_PROJECT_KEYS': 'PROJ,DEV',
                'JIRA_ISSUE_TYPES': 'Task,Bug',
              };
              return config[key];
            }),
          },
        },
      ],
    }).compile();

    service = module.get<JiraService>(JiraService);
    configService = module.get<ConfigService>(ConfigService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns empty array when configuration is incomplete', async () => {
    jest.spyOn(configService, 'get').mockReturnValue(undefined);

    const result = await service.fetchActivities(new Date());
    expect(result).toEqual([]);
  });

  it('builds JQL with user, project, and issue filters for updated issues', () => {
    const startDate = new Date('2024-01-01T00:00:00Z');
    const endDate = new Date('2024-01-01T23:59:59Z');

    const jql = (service as any).buildJQL(startDate, endDate);

    expect(jql).toContain('updated >= "2024-01-01"');
    expect(jql).toContain('updated <= "2024-01-01"');
    expect(jql).toContain('assignee = "test@example.com"');
    expect(jql).toContain('(project = PROJ OR project = DEV)');
    expect(jql).toContain('(issuetype = "Task" OR issuetype = "Bug")');
  });

  it('builds JQL for created issues when field argument is provided', () => {
    const startDate = new Date('2024-01-01T00:00:00Z');
    const endDate = new Date('2024-01-01T23:59:59Z');

    const jql = (service as any).buildJQL(startDate, endDate, 'created');

    expect(jql.startsWith('created >= "2024-01-01"')).toBe(true);
    expect(jql).toContain('created <= "2024-01-01"');
    expect(jql).toContain('(assignee = "test@example.com" OR reporter = "test@example.com" OR watcher = "test@example.com")');
  });

  it('paginates search results until all issues are collected', async () => {
    const issueTemplate = {
      id: '1',
      key: 'PROJ-1',
      fields: {
        summary: 'Issue 1',
        status: { name: 'Open' },
        issuetype: { name: 'Task' },
        project: { key: 'PROJ', name: 'Project' },
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      },
    };

    const makeJiraRequestSpy = jest
      .spyOn<any, any>(service as any, 'makeJiraRequest')
      .mockResolvedValueOnce({
        issues: [issueTemplate],
        nextPageToken: 'token-1',
        isLast: false,
      })
      .mockResolvedValueOnce({
        issues: [
          {
            ...issueTemplate,
            id: '2',
            key: 'PROJ-2',
            fields: {
              ...issueTemplate.fields,
              summary: 'Issue 2',
            },
          },
        ],
        isLast: true,
      });

    const results = await (service as any).searchIssues({
      jql: 'project = PROJ',
      pageSize: 1,
      expand: ['changelog'],
    });

    expect(results).toHaveLength(2);
    expect(results.map((issue: any) => issue.key)).toEqual(['PROJ-1', 'PROJ-2']);
    expect(makeJiraRequestSpy).toHaveBeenCalledTimes(2);
    expect(makeJiraRequestSpy.mock.calls[0][0]).toBe('https://example.atlassian.net/rest/api/3/search/jql');
    expect(makeJiraRequestSpy.mock.calls[0][1]).toBe('POST');
    expect(makeJiraRequestSpy.mock.calls[0][2]).toMatchObject({
      jql: 'project = PROJ',
      maxResults: 1,
      expand: 'changelog',
    });
    expect(makeJiraRequestSpy.mock.calls[1][2]).toMatchObject({
      nextPageToken: 'token-1',
    });
  });
});
