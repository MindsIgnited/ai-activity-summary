import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ActivityData } from '../app.service';

interface JiraIssue {
  id: string;
  key: string;
  fields: {
    summary: string;
    description?: string;
    assignee?: {
      displayName: string;
      emailAddress: string;
    };
    reporter?: {
      displayName: string;
      emailAddress: string;
    };
    status: {
      name: string;
    };
    issuetype: {
      name: string;
    };
    project: {
      key: string;
      name: string;
    };
    created: string;
    updated: string;
    comment?: {
      comments: JiraComment[];
    };
    worklog?: {
      worklogs: JiraWorklog[];
    };
  };
  changelog?: {
    histories: JiraChangelog[];
  };
}

interface JiraComment {
  id: string;
  author: {
    displayName: string;
    emailAddress: string;
  };
  body: string;
  created: string;
  updated: string;
}

interface JiraWorklog {
  id: string;
  author: {
    displayName: string;
    emailAddress: string;
  };
  comment?: string;
  started: string;
  timeSpentSeconds: number;
}

interface JiraChangelog {
  id: string;
  author: {
    displayName: string;
    emailAddress: string;
  };
  created: string;
  items: {
    field: string;
    fieldtype: string;
    fromString?: string;
    toString?: string;
  }[];
}

@Injectable()
export class JiraService {
  private readonly logger = new Logger(JiraService.name);

  constructor(private readonly configService: ConfigService) { }

  async fetchActivities(date: Date): Promise<ActivityData[]> {
    const baseUrl = this.configService.get<string>('JIRA_BASE_URL');
    const email = this.configService.get<string>('JIRA_EMAIL');
    const apiToken = this.configService.get<string>('JIRA_API_TOKEN');

    if (!baseUrl || !email || !apiToken) {
      this.logger.warn('Jira configuration incomplete, skipping Jira activities');
      return [];
    }

    const activities: ActivityData[] = [];
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    try {
      // Fetch issues updated on the specified date
      const issues = await this.fetchUpdatedIssues(startOfDay, endOfDay);

      for (const issue of issues) {
        // Only add issue update activity if the user is the assignee or reporter
        if (this.isUserInvolved(issue, email)) {
          activities.push(this.createIssueActivity(issue, 'updated'));
        }

        // Add comment activities only if the user is the author
        const comments = await this.fetchIssueComments(issue.key, startOfDay, endOfDay);
        const userComments = comments.filter(comment => comment.author.emailAddress === email);
        activities.push(...userComments.map(comment => this.createCommentActivity(issue, comment)));

        // Add work log activities only if the user is the author
        const worklogs = await this.fetchIssueWorklogs(issue.key, startOfDay, endOfDay);
        const userWorklogs = worklogs.filter(worklog => worklog.author.emailAddress === email);
        activities.push(...userWorklogs.map(worklog => this.createWorklogActivity(issue, worklog)));

        // Add changelog activities only if the user is the author
        const changelogs = await this.fetchIssueChangelog(issue.key, startOfDay, endOfDay);
        const userChangelogs = changelogs.filter(changelog => changelog.author.emailAddress === email);
        activities.push(...userChangelogs.map(changelog => this.createChangelogActivity(issue, changelog)));
      }

      this.logger.log(`Fetched ${activities.length} Jira activities for ${date.toISOString().split('T')[0]}`);
    } catch (error) {
      this.logger.error(`Error fetching Jira activities for ${date.toISOString()}:`, error);
    }

    return activities;
  }

  private async fetchUpdatedIssues(startDate: Date, endDate: Date): Promise<JiraIssue[]> {
    const jql = this.buildJQL(startDate, endDate);
    const baseUrl = this.configService.get<string>('JIRA_BASE_URL');
    const url = `${baseUrl}/rest/api/3/search`;

    const response = await this.makeRequest(url, {
      method: 'POST',
      body: JSON.stringify({
        jql,
        maxResults: 100,
        fields: ['summary', 'description', 'assignee', 'reporter', 'status', 'issuetype', 'project', 'created', 'updated'],
        expand: ['changelog']
      })
    });

    return response.issues || [];
  }

  private async fetchIssueComments(issueKey: string, startDate: Date, endDate: Date): Promise<JiraComment[]> {
    const baseUrl = this.configService.get<string>('JIRA_BASE_URL');
    const url = `${baseUrl}/rest/api/3/issue/${issueKey}/comment`;

    try {
      const response = await this.makeRequest(url);
      const comments = response.comments || [];

      return comments.filter(comment => {
        const commentDate = new Date(comment.created);
        return commentDate >= startDate && commentDate <= endDate;
      });
    } catch (error) {
      this.logger.warn(`Failed to fetch comments for issue ${issueKey}:`, error);
      return [];
    }
  }

  private async fetchIssueWorklogs(issueKey: string, startDate: Date, endDate: Date): Promise<JiraWorklog[]> {
    const baseUrl = this.configService.get<string>('JIRA_BASE_URL');
    const url = `${baseUrl}/rest/api/3/issue/${issueKey}/worklog`;

    try {
      const response = await this.makeRequest(url);
      const worklogs = response.worklogs || [];

      return worklogs.filter(worklog => {
        const worklogDate = new Date(worklog.started);
        return worklogDate >= startDate && worklogDate <= endDate;
      });
    } catch (error) {
      this.logger.warn(`Failed to fetch worklogs for issue ${issueKey}:`, error);
      return [];
    }
  }

  private async fetchIssueChangelog(issueKey: string, startDate: Date, endDate: Date): Promise<JiraChangelog[]> {
    const baseUrl = this.configService.get<string>('JIRA_BASE_URL');
    const url = `${baseUrl}/rest/api/3/issue/${issueKey}?expand=changelog`;

    try {
      const response = await this.makeRequest(url);
      const changelog = response.changelog?.histories || [];

      return changelog.filter(history => {
        const historyDate = new Date(history.created);
        return historyDate >= startDate && historyDate <= endDate;
      });
    } catch (error) {
      this.logger.warn(`Failed to fetch changelog for issue ${issueKey}:`, error);
      return [];
    }
  }

  private buildJQL(startDate: Date, endDate: Date): string {
    const startDateStr = startDate.toISOString().split('T')[0];
    const endDateStr = endDate.toISOString().split('T')[0];
    const userEmail = this.configService.get<string>('JIRA_EMAIL');

    // Base query: issues updated in the date range
    let jql = `updated >= "${startDateStr}" AND updated <= "${endDateStr}"`;

    // Add user-specific filtering
    if (userEmail) {
      jql += ` AND (assignee = "${userEmail}" OR reporter = "${userEmail}" OR watcher = "${userEmail}")`;
    }

    const projectKeys = this.configService.get<string>('JIRA_PROJECT_KEYS')?.split(',') || [];
    if (projectKeys.length > 0) {
      const projectFilter = projectKeys.map(key => `project = ${key}`).join(' OR ');
      jql += ` AND (${projectFilter})`;
    }

    const issueTypes = this.configService.get<string>('JIRA_ISSUE_TYPES')?.split(',') || [];
    if (issueTypes.length > 0) {
      const typeFilter = issueTypes.map(type => `issuetype = "${type}"`).join(' OR ');
      jql += ` AND (${typeFilter})`;
    }

    return jql;
  }

  private async makeRequest(url: string, options: RequestInit = {}): Promise<any> {
    const email = this.configService.get<string>('JIRA_EMAIL');
    const apiToken = this.configService.get<string>('JIRA_API_TOKEN');
    const auth = Buffer.from(`${email}:${apiToken}`).toString('base64');

    const response = await fetch(url, {
      ...options,
      headers: {
        'Authorization': `Basic ${auth}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      throw new Error(`Jira API request failed: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  private createIssueActivity(issue: JiraIssue, action: string): ActivityData {
    const baseUrl = this.configService.get<string>('JIRA_BASE_URL');

    return {
      id: `jira-issue-${issue.id}-${action}`,
      type: 'jira',
      timestamp: new Date(issue.fields.updated),
      title: `${action.charAt(0).toUpperCase() + action.slice(1)} issue: ${issue.key}`,
      description: issue.fields.summary,
      author: issue.fields.assignee?.displayName || issue.fields.reporter?.displayName || 'Unknown',
      url: `${baseUrl}/browse/${issue.key}`,
      metadata: {
        issueKey: issue.key,
        issueType: issue.fields.issuetype.name,
        project: issue.fields.project.name,
        status: issue.fields.status.name,
        action,
      },
    };
  }

  private createCommentActivity(issue: JiraIssue, comment: JiraComment): ActivityData {
    const baseUrl = this.configService.get<string>('JIRA_BASE_URL');

    return {
      id: `jira-comment-${comment.id}`,
      type: 'jira',
      timestamp: new Date(comment.created),
      title: `Comment on ${issue.key}`,
      description: comment.body,
      author: comment.author.displayName,
      url: `${baseUrl}/browse/${issue.key}`,
      metadata: {
        issueKey: issue.key,
        issueType: issue.fields.issuetype.name,
        project: issue.fields.project.name,
        action: 'comment',
      },
    };
  }

  private createWorklogActivity(issue: JiraIssue, worklog: JiraWorklog): ActivityData {
    const baseUrl = this.configService.get<string>('JIRA_BASE_URL');
    const hours = Math.round((worklog.timeSpentSeconds / 3600) * 100) / 100;

    return {
      id: `jira-worklog-${worklog.id}`,
      type: 'jira',
      timestamp: new Date(worklog.started),
      title: `Time logged on ${issue.key}: ${hours}h`,
      description: worklog.comment || 'Time logged',
      author: worklog.author.displayName,
      url: `${baseUrl}/browse/${issue.key}`,
      metadata: {
        issueKey: issue.key,
        issueType: issue.fields.issuetype.name,
        project: issue.fields.project.name,
        action: 'worklog',
        timeSpentHours: hours,
      },
    };
  }

  private createChangelogActivity(issue: JiraIssue, changelog: JiraChangelog): ActivityData {
    const baseUrl = this.configService.get<string>('JIRA_BASE_URL');
    const changes = changelog.items.map(item => {
      if (item.field === 'status') {
        return `${item.fromString || 'None'} → ${item.toString || 'None'}`;
      }
      return `${item.field}: ${item.fromString || 'None'} → ${item.toString || 'None'}`;
    }).join(', ');

    return {
      id: `jira-changelog-${changelog.id}`,
      type: 'jira',
      timestamp: new Date(changelog.created),
      title: `Updated ${issue.key}`,
      description: changes,
      author: changelog.author.displayName,
      url: `${baseUrl}/browse/${issue.key}`,
      metadata: {
        issueKey: issue.key,
        issueType: issue.fields.issuetype.name,
        project: issue.fields.project.name,
        action: 'changelog',
        changes: changelog.items,
      },
    };
  }

  private isUserInvolved(issue: JiraIssue, userEmail: string): boolean {
    return (
      issue.fields.assignee?.emailAddress === userEmail ||
      issue.fields.reporter?.emailAddress === userEmail
    );
  }
}
