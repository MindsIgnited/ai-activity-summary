import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BaseActivityService } from './base-activity.service';
import { ActivityFactory } from '../utils/activity.factory';
import { DateRangeIterator } from '../utils/date.utils';
import { setEndOfDay } from '../utils/string.utils';
import { ActivityData } from '../app.service';
import { createTracedRequest } from '../utils/http.utils';

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
export class JiraService extends BaseActivityService {
  protected readonly serviceName = 'Jira';
  protected readonly logger = new Logger(JiraService.name);

  constructor(private readonly configService: ConfigService) {
    super();
  }

  protected isConfigured(): boolean {
    const baseUrl = this.configService.get<string>('JIRA_BASE_URL');
    const email = this.configService.get<string>('JIRA_EMAIL');
    const apiToken = this.configService.get<string>('JIRA_API_TOKEN');
    return !!(baseUrl && email && apiToken);
  }

  protected async fetchActivitiesForDate(date: Date): Promise<ActivityData[]> {
    const activities: ActivityData[] = [];
    const { startOfDay, endOfDay } = DateRangeIterator.getDayBounds(date);

    try {
      // Fetch issues created or updated in the date range
      const createdIssues = await this.fetchCreatedIssues(startOfDay, endOfDay);
      for (const issue of createdIssues) {
        activities.push(this.createIssueActivity(issue, 'created'));
      }

      const updatedIssues = await this.fetchUpdatedIssues(startOfDay, endOfDay);
      for (const issue of updatedIssues) {
        activities.push(this.createIssueActivity(issue, 'updated'));
      }

      // Fetch comments, worklogs, and changelog for all issues
      const allIssues = [...createdIssues, ...updatedIssues];
      for (const issue of allIssues) {
        const comments = await this.fetchIssueComments(issue.key, startOfDay, endOfDay);
        for (const comment of comments) {
          activities.push(this.createCommentActivity(issue, comment));
        }

        const worklogs = await this.fetchIssueWorklogs(issue.key, startOfDay, endOfDay);
        for (const worklog of worklogs) {
          activities.push(this.createWorklogActivity(issue, worklog));
        }

        const changelog = await this.fetchIssueChangelog(issue.key, startOfDay, endOfDay);
        for (const change of changelog) {
          activities.push(this.createChangelogActivity(issue, change));
        }
      }

      this.logger.log(`Fetched ${activities.length} Jira activities for ${date.toISOString().split('T')[0]}`);
    } catch (error) {
      this.logger.error('Error fetching Jira activities:', error);
    }

    return activities;
  }

  private async fetchUpdatedIssues(startDate: Date, endDate: Date): Promise<JiraIssue[]> {
    endDate = setEndOfDay(endDate);
    const jql = this.buildJQL(startDate, endDate);
    const baseUrl = this.configService.get<string>('JIRA_BASE_URL');
    const url = `${baseUrl}/rest/api/3/search`;

    const response = await this.makeJiraRequest(url, 'POST', {
      jql,
      maxResults: 100,
      fields: ['summary', 'description', 'assignee', 'reporter', 'status', 'issuetype', 'project', 'created', 'updated'],
      expand: ['changelog']
    });

    return response.issues || [];
  }

  private async fetchIssueComments(issueKey: string, startDate: Date, endDate: Date): Promise<JiraComment[]> {
    endDate = setEndOfDay(endDate);
    const baseUrl = this.configService.get<string>('JIRA_BASE_URL');
    const url = `${baseUrl}/rest/api/3/issue/${issueKey}/comment`;
    const userEmail = this.configService.get<string>('JIRA_EMAIL');

    try {
      const response = await this.makeJiraRequest(url);
      const comments = response.comments || [];

      const filteredComments = comments.filter(comment => {
        const commentDate = new Date(comment.created);
        const dateInRange = commentDate >= startDate && commentDate <= endDate;

        // Filter by user if email is configured
        if (userEmail) {
          return dateInRange && comment.author?.emailAddress === userEmail;
        }

        return dateInRange;
      });

      return filteredComments;
    } catch (error) {
      this.logger.warn(`Failed to fetch comments for issue ${issueKey}:`, error);
      return [];
    }
  }

  private async fetchIssueWorklogs(issueKey: string, startDate: Date, endDate: Date): Promise<JiraWorklog[]> {
    endDate = setEndOfDay(endDate);
    const baseUrl = this.configService.get<string>('JIRA_BASE_URL');
    const url = `${baseUrl}/rest/api/3/issue/${issueKey}/worklog`;
    const userEmail = this.configService.get<string>('JIRA_EMAIL');

    try {
      const response = await this.makeJiraRequest(url);
      const worklogs = response.worklogs || [];

      const filteredWorklogs = worklogs.filter(worklog => {
        const worklogDate = new Date(worklog.started);
        const dateInRange = worklogDate >= startDate && worklogDate <= endDate;

        // Filter by user if email is configured
        if (userEmail) {
          return dateInRange && worklog.author?.emailAddress === userEmail;
        }

        return dateInRange;
      });

      return filteredWorklogs;
    } catch (error) {
      this.logger.warn(`Failed to fetch worklogs for issue ${issueKey}:`, error);
      return [];
    }
  }

  private async fetchIssueChangelog(issueKey: string, startDate: Date, endDate: Date): Promise<JiraChangelog[]> {
    endDate = setEndOfDay(endDate);
    const baseUrl = this.configService.get<string>('JIRA_BASE_URL');
    const url = `${baseUrl}/rest/api/3/issue/${issueKey}?expand=changelog`;
    const userEmail = this.configService.get<string>('JIRA_EMAIL');

    try {
      const response = await this.makeJiraRequest(url);
      const changelog = response.changelog?.histories || [];

      const filteredChangelog = changelog.filter(history => {
        const historyDate = new Date(history.created);
        const dateInRange = historyDate >= startDate && historyDate <= endDate;

        // Filter by user if email is configured
        if (userEmail) {
          return dateInRange && history.author?.emailAddress === userEmail;
        }

        return dateInRange;
      });

      return filteredChangelog;
    } catch (error) {
      this.logger.warn(`Failed to fetch changelog for issue ${issueKey}:`, error);
      return [];
    }
  }

  private buildJQL(startDate: Date, endDate: Date, field?: string): string {
    endDate = setEndOfDay(endDate);
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

    if (field === 'created') {
      jql = `created >= "${startDateStr}" AND created <= "${endDateStr}"`;
      if (userEmail) {
        jql += ` AND (assignee = "${userEmail}" OR reporter = "${userEmail}" OR watcher = "${userEmail}")`;
      }
      if (projectKeys.length > 0) {
        const projectFilter = projectKeys.map(key => `project = ${key}`).join(' OR ');
        jql += ` AND (${projectFilter})`;
      }
      if (issueTypes.length > 0) {
        const typeFilter = issueTypes.map(type => `issuetype = "${type}"`).join(' OR ');
        jql += ` AND (${typeFilter})`;
      }
    }

    return jql;
  }

  private makeRequest = createTracedRequest('Jira', this.logger);

  private async makeJiraRequest(url: string, method: string = 'GET', body?: any): Promise<any> {
    const email = this.configService.get<string>('JIRA_EMAIL');
    const apiToken = this.configService.get<string>('JIRA_API_TOKEN');
    const headers: Record<string, string> = {
      'Authorization': 'Basic ' + Buffer.from(`${email}:${apiToken}`).toString('base64'),
      'Accept': 'application/json',
    };
    if (body) {
      headers['Content-Type'] = 'application/json';
    }

    return this.makeRequest(url, {
      method,
      headers,
      body,
      timeout: 30000, // 30 second timeout
      retryConfig: 'conservative', // Use conservative retry for Jira API
      enableCircuitBreaker: true,
    });
  }

  private createIssueActivity(issue: JiraIssue, action: string): ActivityData {
    return ActivityFactory.createJiraIssueActivity(issue, action);
  }

  private createCommentActivity(issue: JiraIssue, comment: JiraComment): ActivityData {
    return ActivityFactory.createJiraCommentActivity(issue, comment);
  }

  private createWorklogActivity(issue: JiraIssue, worklog: JiraWorklog): ActivityData {
    return ActivityFactory.createJiraWorklogActivity(issue, worklog);
  }

  private createChangelogActivity(issue: JiraIssue, changelog: JiraChangelog): ActivityData {
    return ActivityFactory.createJiraChangelogActivity(issue, changelog);
  }

  private async fetchCreatedIssues(startDate: Date, endDate: Date): Promise<JiraIssue[]> {
    const jql = this.buildJQL(startDate, endDate, 'created');
    const url = `${this.getBaseUrl()}/rest/api/2/search?jql=${encodeURIComponent(jql)}&maxResults=1000`;

    try {
      const response = await this.makeJiraRequest(url);
      return response.issues || [];
    } catch (error) {
      this.logger.error('Error fetching created issues:', error);
      return [];
    }
  }

  private getBaseUrl(): string {
    return this.configService.get<string>('JIRA_BASE_URL')!;
  }
}
