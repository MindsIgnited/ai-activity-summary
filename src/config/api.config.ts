export interface ApiConfig {
  gitlab: {
    enabled: boolean;
    baseUrl: string;
    accessToken: string;
    projectIds?: string[];
    /**
     * If false, disables fetching commits from GitLab (default: true)
     */
    fetchCommits?: boolean;
    /**
     * If false, disables fetching comments from GitLab (default: true)
     */
    fetchComments?: boolean;
    /**
     * If false, disables fetching merge request notes from GitLab (default: true)
     */
    fetchMrNotes?: boolean;
  };
  slack: {
    enabled: boolean;
    botToken: string;
    appToken?: string;
    channels?: string[];
  };
  teams: {
    enabled: boolean;
    clientId: string;
    clientSecret: string;
    tenantId: string;
    email: string;
    channels?: string[];
  };
  jira: {
    enabled: boolean;
    baseUrl: string;
    email: string;
    apiToken: string;
    projectKeys?: string[];
    issueTypes?: string[];
  };
}

export const getApiConfig = (): ApiConfig => {
  return {
    gitlab: {
      enabled: process.env.GITLAB_ENABLED !== 'false',
      baseUrl: process.env.GITLAB_BASE_URL || 'https://gitlab.com',
      accessToken: process.env.GITLAB_ACCESS_TOKEN || '',
      projectIds: process.env.GITLAB_PROJECT_IDS?.split(',') || [],
      fetchCommits: process.env.GITLAB_FETCH_COMMITS !== 'false',
      fetchComments: process.env.GITLAB_FETCH_COMMENTS !== 'false',
      fetchMrNotes: process.env.GITLAB_FETCH_MR_NOTES !== 'false',
    },
    slack: {
      enabled: process.env.SLACK_ENABLED !== 'false',
      botToken: process.env.SLACK_BOT_TOKEN || '',
      appToken: process.env.SLACK_APP_TOKEN || '',
      channels: process.env.SLACK_CHANNELS?.split(',') || [],
    },
    teams: {
      enabled: process.env.TEAMS_ENABLED !== 'false',
      clientId: process.env.TEAMS_CLIENT_ID || '',
      clientSecret: process.env.TEAMS_CLIENT_SECRET || '',
      tenantId: process.env.TEAMS_TENANT_ID || '',
      email: process.env.TEAMS_EMAIL || '',
      channels: process.env.TEAMS_CHANNELS?.split(',') || [],
    },
    jira: {
      enabled: process.env.JIRA_ENABLED !== 'false',
      baseUrl: process.env.JIRA_BASE_URL || '',
      email: process.env.JIRA_EMAIL || '',
      apiToken: process.env.JIRA_API_TOKEN || '',
      projectKeys: process.env.JIRA_PROJECT_KEYS?.split(',') || [],
      issueTypes: process.env.JIRA_ISSUE_TYPES?.split(',') || [],
    },
  };
};
