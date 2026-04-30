import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BaseActivityService } from './base-activity.service';
import { ActivityFactory } from '../utils/activity.factory';
import { getPacificDateKey } from '../utils/date.utils';
import { ActivityData } from '../app.service';
import { createTracedRequest } from '../utils/http.utils';

interface JiraIssue {
  id: string;
  key: string;
  fields: {
    summary: string;
    description?: string;
    assignee?: { accountId?: string; displayName: string; emailAddress?: string };
    reporter?: { accountId?: string; displayName: string; emailAddress?: string };
    status: { name: string };
    issuetype: { name: string };
    project: { key: string; name: string };
    created: string;
    updated: string;
  };
  changelog?: { histories: JiraChangelog[] };
}

interface JiraComment {
  id: string;
  author: { accountId?: string; displayName: string; emailAddress?: string };
  body: string;
  created: string;
  updated: string;
}

interface JiraWorklog {
  id: string;
  author: { accountId?: string; displayName: string; emailAddress?: string };
  comment?: string;
  started: string;
  timeSpentSeconds: number;
}

interface JiraChangelog {
  id: string;
  author: { accountId?: string; displayName: string; emailAddress?: string };
  created: string;
  items: { field: string; fieldtype: string; fromString?: string; toString?: string }[];
}

interface JiraSearchOptions {
  jql: string;
  fields?: string[];
  expand?: string[];
  pageSize?: number;
}

interface JiraSelf {
  accountId: string;
  displayName: string;
  emailAddress?: string;
}

@Injectable()
export class JiraService extends BaseActivityService {
  protected readonly serviceName = 'Jira';
  protected readonly logger = new Logger(JiraService.name);

  private currentAccountId: string | null = null;
  private cachedActivities: Map<string, ActivityData[]> = new Map();
  private cacheDateRange: { startDate: Date; endDate: Date } | null = null;

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
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    await this.ensureCacheInitialized(startOfDay, endOfDay);
    return this.cachedActivities.get(getPacificDateKey(date)) ?? [];
  }

  protected async preloadForDateRange(startDate: Date, endDate: Date): Promise<void> {
    await this.ensureCacheInitialized(startDate, endDate);
  }

  public clearCache(): void {
    this.cachedActivities.clear();
    this.cacheDateRange = null;
    this.currentAccountId = null;
    this.logger.debug('Jira cache cleared');
  }

  public async getCurrentUser(): Promise<JiraSelf> {
    return this.makeJiraRequest(`${this.getBaseUrl()}/rest/api/3/myself`);
  }

  /**
   * Builds JQL scoped to the token owner (no email/accountId required at query
   * time — `currentUser()` resolves server-side). Date bounds use JQL's
   * "YYYY-MM-DD HH:mm" format so end-of-day is included.
   */
  public buildJQL(startDate: Date, endDate: Date, field: 'created' | 'updated' = 'updated'): string {
    const start = this.toJqlDateTime(startDate, false);
    const end = this.toJqlDateTime(endDate, true);

    let jql = `${field} >= "${start}" AND ${field} <= "${end}"`;
    jql += ` AND (assignee = currentUser() OR reporter = currentUser() OR watcher = currentUser())`;

    const projectKeys = this.configService
      .get<string>('JIRA_PROJECT_KEYS')
      ?.split(',')
      .map(k => k.trim())
      .filter(Boolean) ?? [];
    if (projectKeys.length > 0) {
      jql += ` AND (${projectKeys.map(k => `project = ${k}`).join(' OR ')})`;
    }

    const issueTypes = this.configService
      .get<string>('JIRA_ISSUE_TYPES')
      ?.split(',')
      .map(t => t.trim())
      .filter(Boolean) ?? [];
    if (issueTypes.length > 0) {
      jql += ` AND (${issueTypes.map(t => `issuetype = "${t}"`).join(' OR ')})`;
    }

    return jql;
  }

  private async ensureCacheInitialized(startDate: Date, endDate: Date): Promise<void> {
    if (
      this.cacheDateRange &&
      this.cacheDateRange.startDate <= startDate &&
      this.cacheDateRange.endDate >= endDate
    ) {
      return;
    }

    let newStart = startDate;
    let newEnd = endDate;
    if (this.cacheDateRange) {
      newStart = this.cacheDateRange.startDate < startDate ? this.cacheDateRange.startDate : startDate;
      newEnd = this.cacheDateRange.endDate > endDate ? this.cacheDateRange.endDate : endDate;
      this.cachedActivities.clear();
    }

    this.logger.log(
      `Initializing Jira cache for date range: ${getPacificDateKey(newStart)} to ${getPacificDateKey(newEnd)}`,
    );

    try {
      const me = await this.getCurrentUser();
      this.currentAccountId = me.accountId;
      this.logger.debug(`Fetching Jira activities for: ${me.displayName} (${me.accountId})`);
    } catch (error) {
      this.logger.error('Failed to resolve Jira current user:', error);
      return;
    }

    try {
      const issues = await this.searchIssues({
        jql: this.buildJQL(newStart, newEnd, 'updated'),
        fields: ['summary', 'description', 'assignee', 'reporter', 'status', 'issuetype', 'project', 'created', 'updated'],
        expand: ['changelog'],
      });

      const startMs = newStart.getTime();
      const endMs = newEnd.getTime();
      const inRange = (iso: string) => {
        const t = new Date(iso).getTime();
        return t >= startMs && t <= endMs;
      };

      for (const issue of issues) {
        if (inRange(issue.fields.created) && this.isOwnedByCurrentUser(issue)) {
          this.bucket(ActivityFactory.createJiraIssueActivity(issue, 'created'));
        }

        for (const history of issue.changelog?.histories ?? []) {
          if (history.author?.accountId !== this.currentAccountId) continue;
          if (!inRange(history.created)) continue;
          this.bucket(ActivityFactory.createJiraChangelogActivity(issue, history));
        }
      }

      const uniqueIssues = Array.from(new Map(issues.map(i => [i.key, i])).values());
      await Promise.all([
        this.collectComments(uniqueIssues, startMs, endMs),
        this.collectWorklogs(uniqueIssues, startMs, endMs),
      ]);

      this.cacheDateRange = { startDate: newStart, endDate: newEnd };
      const total = Array.from(this.cachedActivities.values()).flat().length;
      this.logger.log(
        `Cached ${total} Jira activities across ${this.cachedActivities.size} days`,
      );
    } catch (error) {
      this.logger.error('Error initializing Jira cache for date range:', error);
    }
  }

  private isOwnedByCurrentUser(issue: JiraIssue): boolean {
    const acc = this.currentAccountId;
    if (!acc) return true;
    return issue.fields.reporter?.accountId === acc || issue.fields.assignee?.accountId === acc;
  }

  private bucket(activity: ActivityData): void {
    const key = getPacificDateKey(activity.timestamp);
    if (!this.cachedActivities.has(key)) this.cachedActivities.set(key, []);
    this.cachedActivities.get(key)!.push(activity);
  }

  private async collectComments(issues: JiraIssue[], startMs: number, endMs: number): Promise<void> {
    const accountId = this.currentAccountId;
    await Promise.all(
      issues.map(async issue => {
        try {
          const response = await this.makeJiraRequest(
            `${this.getBaseUrl()}/rest/api/3/issue/${issue.key}/comment`,
          );
          const comments: JiraComment[] = response.comments ?? [];
          for (const comment of comments) {
            if (accountId && comment.author?.accountId !== accountId) continue;
            const t = new Date(comment.created).getTime();
            if (t < startMs || t > endMs) continue;
            this.bucket(ActivityFactory.createJiraCommentActivity(issue, comment));
          }
        } catch (error) {
          this.logger.warn(`Failed to fetch comments for issue ${issue.key}:`, error);
        }
      }),
    );
  }

  private async collectWorklogs(issues: JiraIssue[], startMs: number, endMs: number): Promise<void> {
    const accountId = this.currentAccountId;
    await Promise.all(
      issues.map(async issue => {
        try {
          const response = await this.makeJiraRequest(
            `${this.getBaseUrl()}/rest/api/3/issue/${issue.key}/worklog`,
          );
          const worklogs: JiraWorklog[] = response.worklogs ?? [];
          for (const worklog of worklogs) {
            if (accountId && worklog.author?.accountId !== accountId) continue;
            const t = new Date(worklog.started).getTime();
            if (t < startMs || t > endMs) continue;
            this.bucket(ActivityFactory.createJiraWorklogActivity(issue, worklog));
          }
        } catch (error) {
          this.logger.warn(`Failed to fetch worklogs for issue ${issue.key}:`, error);
        }
      }),
    );
  }

  private async searchIssues(options: JiraSearchOptions): Promise<JiraIssue[]> {
    const { jql, fields, expand, pageSize = 100 } = options;
    const url = `${this.getBaseUrl()}/rest/api/3/search/jql`;

    const issues: JiraIssue[] = [];
    let nextPageToken: string | undefined;

    while (true) {
      try {
        const body: Record<string, unknown> = { jql, maxResults: pageSize };
        if (fields && fields.length > 0) body.fields = fields;
        if (Array.isArray(expand) && expand.length > 0) body.expand = expand.join(',');
        if (nextPageToken) body.nextPageToken = nextPageToken;

        const response = await this.makeJiraRequest(url, 'POST', body);
        const pageIssues: JiraIssue[] = response.issues ?? [];
        issues.push(...pageIssues);

        nextPageToken = response.nextPageToken || undefined;
        if (!nextPageToken || response.isLast || pageIssues.length === 0) break;
      } catch (error) {
        this.logger.error('Jira search request failed', error);
        break;
      }
    }

    return issues;
  }

  private toJqlDateTime(date: Date, endOfDay: boolean): string {
    const d = new Date(date);
    if (endOfDay) {
      d.setUTCHours(23, 59, 0, 0);
    } else {
      d.setUTCHours(0, 0, 0, 0);
    }
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    const hh = String(d.getUTCHours()).padStart(2, '0');
    const mi = String(d.getUTCMinutes()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
  }

  private getBaseUrl(): string {
    return this.configService.get<string>('JIRA_BASE_URL')!;
  }

  private makeRequest = createTracedRequest('Jira', this.logger);

  private async makeJiraRequest(url: string, method: string = 'GET', body?: any): Promise<any> {
    const email = this.configService.get<string>('JIRA_EMAIL');
    const apiToken = this.configService.get<string>('JIRA_API_TOKEN');
    const headers: Record<string, string> = {
      Authorization: 'Basic ' + Buffer.from(`${email}:${apiToken}`).toString('base64'),
      Accept: 'application/json',
    };
    if (body) headers['Content-Type'] = 'application/json';

    return this.makeRequest(url, {
      method,
      headers,
      body,
      timeout: 30000,
      retryConfig: 'conservative',
      enableCircuitBreaker: true,
    });
  }
}