import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BaseActivityService } from './base-activity.service';
import { ActivityData } from '../app.service';
import { formatPacificIso, getPacificDateKey } from '../utils/date.utils';
import { setEndOfDay } from '../utils/string.utils';
import { createTracedRequest } from '../utils/http.utils';

interface GitLabUser {
  id: number;
  name: string;
  username: string;
  email: string;
}

interface GitLabEventAuthor {
  id: number;
  name: string;
  username: string;
}

interface GitLabPushData {
  commit_count?: number;
  action?: string;
  ref_type?: string;
  ref?: string;
  commit_title?: string;
  commit_to?: string;
  commit_from?: string;
}

interface GitLabEventNote {
  id: number;
  body: string;
  noteable_type?: string;
  noteable_id?: number;
  noteable_iid?: number;
}

/**
 * Shape of an entry returned from GET /api/v4/events.
 * Fields vary by action_name; see https://docs.gitlab.com/api/events/.
 */
interface GitLabEvent {
  id: number;
  project_id: number;
  action_name: string;
  target_id?: number;
  target_iid?: number;
  target_type?: string | null;
  target_title?: string;
  created_at: string;
  author: GitLabEventAuthor;
  push_data?: GitLabPushData;
  note?: GitLabEventNote;
}

@Injectable()
export class GitLabService extends BaseActivityService {
  protected readonly serviceName = 'GitLab';
  protected readonly logger = new Logger(GitLabService.name);

  private currentUser: GitLabUser | null = null;
  private cachedActivities: Map<string, ActivityData[]> = new Map();
  private cacheDateRange: { startDate: Date; endDate: Date } | null = null;

  constructor(private readonly configService: ConfigService) {
    super();
  }

  protected isConfigured(): boolean {
    const baseUrl = this.configService.get<string>('GITLAB_BASE_URL');
    const accessToken = this.configService.get<string>('GITLAB_ACCESS_TOKEN');
    return !!(baseUrl && accessToken);
  }

  protected async fetchActivitiesForDate(date: Date): Promise<ActivityData[]> {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = setEndOfDay(date);

    await this.ensureCacheInitialized(startOfDay, endOfDay);
    return this.cachedActivities.get(getPacificDateKey(date)) ?? [];
  }

  protected async preloadForDateRange(startDate: Date, endDate: Date): Promise<void> {
    await this.ensureCacheInitialized(startDate, endDate);
  }

  public clearCache(): void {
    this.cachedActivities.clear();
    this.cacheDateRange = null;
    this.logger.debug('GitLab cache cleared');
  }

  public async getCurrentUser(): Promise<GitLabUser> {
    return this.makeGitLabRequest(`${this.getBaseUrl()}/api/v4/user`);
  }

  /**
   * Fetches the authenticated user's events from GitLab and groups them by Pacific date.
   * Single endpoint replaces per-project commit/MR/issue/note fan-out.
   */
  public async fetchEventsByDateRange(
    startDate: Date,
    endDate: Date,
  ): Promise<Map<string, ActivityData[]>> {
    const after = this.toEventDate(new Date(startDate.getTime() - 24 * 60 * 60 * 1000));
    const before = this.toEventDate(new Date(endDate.getTime() + 24 * 60 * 60 * 1000));

    const events: GitLabEvent[] = [];
    const perPage = 100;
    let page = 1;
    let pageCount = 0;
    const maxPages = 50;

    while (pageCount < maxPages) {
      const url = `${this.getBaseUrl()}/api/v4/events?after=${after}&before=${before}&per_page=${perPage}&page=${page}&scope=all`;
      const batch: GitLabEvent[] = await this.makeGitLabRequest(url);
      if (!Array.isArray(batch) || batch.length === 0) break;
      events.push(...batch);
      if (batch.length < perPage) break;
      page += 1;
      pageCount += 1;
    }

    const grouped = new Map<string, ActivityData[]>();
    const startMs = startDate.getTime();
    const endMs = endDate.getTime();

    for (const event of events) {
      const eventTime = new Date(event.created_at).getTime();
      if (eventTime < startMs || eventTime > endMs) continue;

      const activity = this.eventToActivity(event);
      if (!activity) continue;

      const key = getPacificDateKey(activity.timestamp);
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(activity);
    }

    return grouped;
  }

  private async ensureCacheInitialized(startDate: Date, endDate: Date): Promise<void> {
    if (
      this.cacheDateRange &&
      this.cacheDateRange.startDate <= startDate &&
      this.cacheDateRange.endDate >= endDate
    ) {
      return;
    }

    let newStartDate = startDate;
    let newEndDate = endDate;
    if (this.cacheDateRange) {
      newStartDate =
        this.cacheDateRange.startDate < startDate ? this.cacheDateRange.startDate : startDate;
      newEndDate =
        this.cacheDateRange.endDate > endDate ? this.cacheDateRange.endDate : endDate;
      this.cachedActivities.clear();
    }

    this.logger.log(
      `Initializing GitLab cache for date range: ${getPacificDateKey(newStartDate)} to ${getPacificDateKey(newEndDate)}`,
    );

    try {
      this.currentUser = await this.getCurrentUser();
      this.logger.debug(
        `Fetching events for user: ${this.currentUser?.name} (${this.currentUser?.username})`,
      );
    } catch (error) {
      this.logger.error('Failed to get current user information:', error);
      return;
    }

    try {
      const eventMap = await this.fetchEventsByDateRange(newStartDate, newEndDate);
      for (const [date, activities] of eventMap) {
        if (!this.cachedActivities.has(date)) this.cachedActivities.set(date, []);
        this.cachedActivities.get(date)!.push(...activities);
      }
      this.cacheDateRange = { startDate: newStartDate, endDate: newEndDate };

      const total = Array.from(this.cachedActivities.values()).flat().length;
      this.logger.log(
        `Cached ${total} GitLab activities across ${this.cachedActivities.size} days`,
      );
    } catch (error) {
      this.logger.error('Error initializing GitLab cache for date range:', error);
    }
  }

  private eventToActivity(event: GitLabEvent): ActivityData | null {
    const timestamp = new Date(event.created_at);
    const author = event.author?.name;
    const action = event.action_name;
    const targetType = event.target_type?.toLowerCase();
    const baseMeta = {
      eventId: event.id,
      action,
      targetType: event.target_type ?? null,
      projectId: event.project_id,
      localTime: formatPacificIso(timestamp),
    } as Record<string, any>;

    if (event.push_data) {
      const push = event.push_data;
      const ref = push.ref ?? '';
      const refType = push.ref_type ?? 'branch';
      const commitCount = push.commit_count ?? 0;
      const verb = push.action ?? action;
      const title = push.commit_title
        ? `Push (${verb}) to ${refType} ${ref}: ${push.commit_title}`
        : `Push (${verb}) to ${refType} ${ref} (${commitCount} commit${commitCount === 1 ? '' : 's'})`;

      return {
        id: `gitlab-event-${event.id}`,
        type: 'gitlab',
        timestamp,
        title,
        description: push.commit_title,
        author,
        url: undefined,
        metadata: {
          ...baseMeta,
          action: 'push',
          pushAction: verb,
          ref,
          refType,
          commitCount,
          commitFrom: push.commit_from,
          commitTo: push.commit_to,
        },
      };
    }

    if (event.note) {
      const note = event.note;
      const noteableType = note.noteable_type?.toLowerCase() ?? targetType ?? 'item';
      const snippet = (note.body ?? '').substring(0, 80);

      return {
        id: `gitlab-event-${event.id}`,
        type: 'gitlab',
        timestamp,
        title: `Comment on ${noteableType}: ${snippet}`,
        description: note.body,
        author,
        url: undefined,
        metadata: {
          ...baseMeta,
          action: 'comment',
          noteableType: note.noteable_type,
          noteableId: note.noteable_id,
          noteableIid: note.noteable_iid,
        },
      };
    }

    if (targetType === 'mergerequest' || targetType === 'merge_request') {
      return {
        id: `gitlab-event-${event.id}`,
        type: 'gitlab',
        timestamp,
        title: `Merge Request ${action}: ${event.target_title ?? ''}`.trim(),
        description: undefined,
        author,
        url: undefined,
        metadata: {
          ...baseMeta,
          action: 'merge_request',
          state: action,
          targetIid: event.target_iid,
        },
      };
    }

    if (targetType === 'issue' || targetType === 'workitem') {
      return {
        id: `gitlab-event-${event.id}`,
        type: 'gitlab',
        timestamp,
        title: `Issue ${action}: ${event.target_title ?? ''}`.trim(),
        description: undefined,
        author,
        url: undefined,
        metadata: {
          ...baseMeta,
          action: 'issue',
          state: action,
          targetIid: event.target_iid,
        },
      };
    }

    if (!event.target_title && !event.push_data && !event.note) {
      return null;
    }

    return {
      id: `gitlab-event-${event.id}`,
      type: 'gitlab',
      timestamp,
      title: `${action}${event.target_title ? `: ${event.target_title}` : ''}`,
      description: undefined,
      author,
      url: undefined,
      metadata: baseMeta,
    };
  }

  private toEventDate(date: Date): string {
    return getPacificDateKey(date);
  }

  private getBaseUrl(): string {
    return this.configService.get<string>('GITLAB_BASE_URL') || 'https://gitlab.com';
  }

  private makeRequest = createTracedRequest('GitLab', this.logger);

  private async makeGitLabRequest(url: string): Promise<any> {
    const accessToken = this.configService.get<string>('GITLAB_ACCESS_TOKEN');
    return this.makeRequest(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
      timeout: 30000,
      retryConfig: 'conservative',
      enableCircuitBreaker: true,
    });
  }
}