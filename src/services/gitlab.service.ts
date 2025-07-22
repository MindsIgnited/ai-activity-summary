import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BaseActivityService } from './base-activity.service';
import { ActivityFactory } from '../utils/activity.factory';
import { DateRangeIterator } from '../utils/date.utils';
import { setEndOfDay } from '../utils/string.utils';
import { ActivityData } from '../app.service';
import pLimit from 'p-limit';
import { createTracedRequest } from '../utils/http.utils';
import { safeSubstring, formatContentForDisplay } from '../utils/string.utils';

interface GitLabCommit {
  id: string;
  short_id: string;
  title: string;
  message: string;
  author_name: string;
  author_email: string;
  created_at: string;
  web_url: string;
  project_id: number;
  project_name?: string;
}

interface GitLabMergeRequest {
  id: number;
  iid: number;
  title: string;
  description: string;
  state: string;
  created_at: string;
  updated_at: string;
  closed_at?: string;
  merged_at?: string;
  author: {
    id: number;
    name: string;
    username: string;
    email: string;
  };
  assignee?: {
    id: number;
    name: string;
    username: string;
    email: string;
  };
  web_url: string;
  project_id: number;
  project_name?: string;
  source_branch: string;
  target_branch: string;
  merge_status: string;
}

interface GitLabIssue {
  id: number;
  iid: number;
  title: string;
  description: string;
  state: string;
  created_at: string;
  updated_at: string;
  closed_at?: string;
  author: {
    id: number;
    name: string;
    username: string;
    email: string;
  };
  assignee?: {
    id: number;
    name: string;
    username: string;
    email: string;
  };
  web_url: string;
  project_id: number;
  project_name?: string;
  labels: string[];
  milestone?: {
    id: number;
    title: string;
  };
}

interface GitLabComment {
  id: number;
  body: string;
  author: {
    id: number;
    name: string;
    username: string;
    email: string;
  };
  created_at: string;
  updated_at: string;
  noteable_type: string; // 'Commit', 'MergeRequest', 'Issue'
  noteable_id: number;
  noteable_iid?: number;
  project_id: number;
  project_name?: string;
  web_url?: string;
}

interface GitLabProject {
  id: number;
  name: string;
  path: string;
  web_url: string;
  description?: string;
}

interface GitLabUser {
  id: number;
  name: string;
  username: string;
  email: string;
}

@Injectable()
export class GitLabService extends BaseActivityService {
  protected readonly serviceName = 'GitLab';
  protected readonly logger = new Logger(GitLabService.name);
  private currentUser: GitLabUser | null = null;

  constructor(private readonly configService: ConfigService) {
    super();
  }

  protected isConfigured(): boolean {
    const baseUrl = this.configService.get<string>('GITLAB_BASE_URL');
    const accessToken = this.configService.get<string>('GITLAB_ACCESS_TOKEN');
    return !!(baseUrl && accessToken);
  }

  protected async fetchActivitiesForDate(date: Date): Promise<ActivityData[]> {
    if (!this.isConfigured()) {
      this.logger.warn('GitLab configuration incomplete, skipping GitLab activities');
      return [];
    }

    // Get current user information
    try {
      this.currentUser = await this.getCurrentUser();
      this.logger.debug(`Fetching activities for user: ${this.currentUser?.name} (${this.currentUser?.username})`);
    } catch (error) {
      this.logger.error('Failed to get current user information:', error);
      return [];
    }

    const activities: ActivityData[] = [];
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    try {
      // Fetch commits
      const commits = await this.fetchCommits(startOfDay, endOfDay);
      activities.push(...commits.map(commit => this.createCommitActivity(commit)));

      // Fetch merge requests
      const mergeRequests = await this.fetchMergeRequests(startOfDay, endOfDay);
      activities.push(...mergeRequests.map(mr => this.createMergeRequestActivity(mr)));

      // Fetch issues
      const issues = await this.fetchIssues(startOfDay, endOfDay);
      activities.push(...issues.map(issue => this.createIssueActivity(issue)));

      // Fetch comments
      const comments = await this.fetchComments(startOfDay, endOfDay);
      activities.push(...comments.map(comment => this.createCommentActivity(comment)));

      this.logger.log(`Fetched ${activities.length} GitLab activities for user ${this.currentUser?.username} on ${date.toISOString().split('T')[0]}`);
    } catch (error) {
      this.logger.error(`Error fetching GitLab activities for ${date.toISOString()}:`, error);
    }

    return activities;
  }

  /**
   * Fetch all commits for the date range and group by date (YYYY-MM-DD)
   */
  public async fetchCommitsByDateRange(startDate: Date, endDate: Date): Promise<Map<string, ActivityData[]>> {
    endDate = setEndOfDay(endDate);
    const projects = await this.getProjects();
    const projectLimit = pLimit(this.getProjectConcurrency());
    const allCommits: ActivityData[] = [];
    await Promise.all(
      projects.map(project =>
        projectLimit(async () => {
          try {
            const url = `${this.getBaseUrl()}/api/v4/projects/${project.id}/repository/commits?since=${startDate.toISOString()}&until=${endDate.toISOString()}&per_page=100`;
            const response = await this.makeGitLabRequest(url);
            const projectCommits = response.map((commit: GitLabCommit) => this.createCommitActivity({ ...commit, project_name: project.name }));
            // Filter by current user
            const userCommits = projectCommits.filter(commit =>
              commit.metadata?.authorEmail === this.currentUser?.email ||
              commit.author === this.currentUser?.name
            );
            allCommits.push(...userCommits);
          } catch (error) {
            this.logger.warn(`Failed to fetch commits for project ${project.name}:`, error);
          }
        })
      )
    );
    // Group by date
    const map = new Map<string, ActivityData[]>();
    for (const commit of allCommits) {
      const date = commit.timestamp.toISOString().split('T')[0];
      if (!map.has(date)) map.set(date, []);
      map.get(date)!.push(commit);
    }
    return map;
  }

  /**
   * Fetch all merge requests for the date range and group by date (YYYY-MM-DD)
   * Only fetch MRs authored by the current user using author_id or author_username.
   */
  public async fetchMergeRequestsByDateRange(startDate: Date, endDate: Date): Promise<Map<string, ActivityData[]>> {
    endDate = setEndOfDay(endDate);
    const projects = await this.getProjects();
    const projectLimit = pLimit(this.getProjectConcurrency());
    const allMRs: ActivityData[] = [];
    await Promise.all(
      projects.map(project =>
        projectLimit(async () => {
          try {
            // Use author_id or author_username to filter by current user
            const authorParam = this.currentUser?.id
              ? `author_id=${this.currentUser.id}`
              : this.currentUser?.username
                ? `author_username=${encodeURIComponent(this.currentUser.username)}`
                : '';
            const url = `${this.getBaseUrl()}/api/v4/projects/${project.id}/merge_requests?created_after=${startDate.toISOString()}&created_before=${endDate.toISOString()}&per_page=100&state=all${authorParam ? `&${authorParam}` : ''}`;
            const response = await this.makeGitLabRequest(url);
            const projectMRs = response.map((mr: GitLabMergeRequest) => this.createMergeRequestActivity({ ...mr, project_name: project.name }));
            allMRs.push(...projectMRs);
          } catch (error) {
            this.logger.warn(`Failed to fetch merge requests for project ${project.name}:`, error);
          }
        })
      )
    );
    // Group by date
    const map = new Map<string, ActivityData[]>();
    for (const mr of allMRs) {
      const date = mr.timestamp.toISOString().split('T')[0];
      if (!map.has(date)) map.set(date, []);
      map.get(date)!.push(mr);
    }
    return map;
  }

  /**
   * Fetch all issues for the date range and group by date (YYYY-MM-DD)
   * Only fetch issues authored by the current user using author_id or author_username.
   */
  public async fetchIssuesByDateRange(startDate: Date, endDate: Date): Promise<Map<string, ActivityData[]>> {
    endDate = setEndOfDay(endDate);
    const projects = await this.getProjects();
    const projectLimit = pLimit(this.getProjectConcurrency());
    const allIssues: ActivityData[] = [];
    await Promise.all(
      projects.map(project =>
        projectLimit(async () => {
          try {
            // Use author_id or author_username to filter by current user
            const authorParam = this.currentUser?.id
              ? `author_id=${this.currentUser.id}`
              : this.currentUser?.username
                ? `author_username=${encodeURIComponent(this.currentUser.username)}`
                : '';
            const url = `${this.getBaseUrl()}/api/v4/projects/${project.id}/issues?created_after=${startDate.toISOString()}&created_before=${endDate.toISOString()}&per_page=100&state=all${authorParam ? `&${authorParam}` : ''}`;
            const response = await this.makeGitLabRequest(url);
            const projectIssues = response.map((issue: GitLabIssue) => this.createIssueActivity({ ...issue, project_name: project.name }));
            allIssues.push(...projectIssues);
          } catch (error) {
            this.logger.warn(`Failed to fetch issues for project ${project.name}:`, error);
          }
        })
      )
    );
    // Group by date
    const map = new Map<string, ActivityData[]>();
    for (const issue of allIssues) {
      const date = issue.timestamp.toISOString().split('T')[0];
      if (!map.has(date)) map.set(date, []);
      map.get(date)!.push(issue);
    }
    return map;
  }

  public async fetchComments(startDate: Date, endDate: Date): Promise<GitLabComment[]> {
    // Check if notes fetching is disabled
    if (this.configService.get<boolean>('GITLAB_FETCH_NOTES') === false) {
      this.logger.debug('Skipping all GitLab note/comment fetching as GITLAB_FETCH_NOTES is false.');
      return [];
    }

    endDate = setEndOfDay(endDate);
    const comments: GitLabComment[] = [];
    const projects = await this.getProjects();

    // Set concurrency limit for parallel project fetches
    const projectLimit = pLimit(this.getProjectConcurrency());

    const results = await Promise.all(
      projects.map(project =>
        projectLimit(async () => {
          try {
            // Fetch comments on merge requests
            if (this.configService.get<boolean>('GITLAB_FETCH_MR_NOTES') !== false) {
              const mrComments = await this.fetchMergeRequestComments(project, startDate, endDate);
              comments.push(...mrComments);
            } else {
              this.logger.debug(`Skipping fetch of merge request comments for project ${project.name} as GITLAB_FETCH_MR_NOTES is false.`);
            }
            // Fetch comments on issues
            const issueComments = await this.fetchIssueComments(project, startDate, endDate);
            comments.push(...issueComments);
            // Fetch comments on commits
            const commitComments = await this.fetchCommitComments(project, startDate, endDate);
            comments.push(...commitComments);
            return comments;
          } catch (error) {
            this.logger.warn(`Failed to fetch comments for project ${project.name}:`, error);
            return [];
          }
        })
      )
    );
    return results.flat();
  }

  private async fetchMergeRequestComments(project: GitLabProject, startDate: Date, endDate: Date): Promise<GitLabComment[]> {
    // Check if notes fetching is disabled
    if (this.configService.get<boolean>('GITLAB_FETCH_NOTES') === false) {
      return [];
    }

    endDate = setEndOfDay(endDate);
    const comments: GitLabComment[] = [];

    try {
      // First get merge requests, then get comments for each
      const mrs = await this.makeGitLabRequest(`${this.getBaseUrl()}/api/v4/projects/${project.id}/merge_requests?per_page=100&state=all`);

      for (const mr of mrs) {
        const url = `${this.getBaseUrl()}/api/v4/projects/${project.id}/merge_requests/${mr.iid}/notes?per_page=100`;
        const response = await this.makeGitLabRequest(url);

        const filteredComments = response.filter((comment: GitLabComment) => {
          const commentDate = new Date(comment.created_at);
          return commentDate >= startDate && commentDate <= endDate;
        }).map((comment: GitLabComment) => ({
          ...comment,
          project_name: project.name,
          web_url: `${mr.web_url}#note_${comment.id}`,
        }));

        // Filter comments by current user
        const userComments = filteredComments.filter(comment =>
          comment.author.id === this.currentUser?.id ||
          comment.author.username === this.currentUser?.username ||
          comment.author.email === this.currentUser?.email
        );

        comments.push(...userComments);
      }
    } catch (error) {
      this.logger.warn(`Failed to fetch merge request comments for project ${project.name}:`, error);
    }

    return comments;
  }

  private async fetchIssueComments(project: GitLabProject, startDate: Date, endDate: Date): Promise<GitLabComment[]> {
    // Check if notes fetching is disabled
    if (this.configService.get<boolean>('GITLAB_FETCH_NOTES') === false) {
      return [];
    }

    endDate = setEndOfDay(endDate);
    const comments: GitLabComment[] = [];

    try {
      // First get issues, then get comments for each
      const issues = await this.makeGitLabRequest(`${this.getBaseUrl()}/api/v4/projects/${project.id}/issues?per_page=100&state=all`);

      for (const issue of issues) {
        const url = `${this.getBaseUrl()}/api/v4/projects/${project.id}/issues/${issue.iid}/notes?per_page=100`;
        const response = await this.makeGitLabRequest(url);

        const filteredComments = response.filter((comment: GitLabComment) => {
          const commentDate = new Date(comment.created_at);
          return commentDate >= startDate && commentDate <= endDate;
        }).map((comment: GitLabComment) => ({
          ...comment,
          project_name: project.name,
          web_url: `${issue.web_url}#note_${comment.id}`,
        }));

        // Filter comments by current user
        const userComments = filteredComments.filter(comment =>
          comment.author.id === this.currentUser?.id ||
          comment.author.username === this.currentUser?.username ||
          comment.author.email === this.currentUser?.email
        );

        comments.push(...userComments);
      }
    } catch (error) {
      this.logger.warn(`Failed to fetch issue comments for project ${project.name}:`, error);
    }

    return comments;
  }

  private async fetchCommitComments(project: GitLabProject, startDate: Date, endDate: Date): Promise<GitLabComment[]> {
    // Check if notes fetching is disabled
    if (this.configService.get<boolean>('GITLAB_FETCH_NOTES') === false) {
      return [];
    }

    endDate = setEndOfDay(endDate);
    const comments: GitLabComment[] = [];

    try {
      // First get commits, then get comments for each
      const commits = await this.makeGitLabRequest(`${this.getBaseUrl()}/api/v4/projects/${project.id}/repository/commits?per_page=100`);

      for (const commit of commits) {
        const url = `${this.getBaseUrl()}/api/v4/projects/${project.id}/repository/commits/${commit.id}/comments?per_page=100`;
        const response = await this.makeGitLabRequest(url);

        const filteredComments = response.filter((comment: GitLabComment) => {
          const commentDate = new Date(comment.created_at);
          return commentDate >= startDate && commentDate <= endDate;
        }).map((comment: GitLabComment) => ({
          ...comment,
          project_name: project.name,
          web_url: `${commit.web_url}#note_${comment.id}`,
        }));

        // Filter comments by current user
        const userComments = filteredComments.filter(comment =>
          comment.author.id === this.currentUser?.id ||
          comment.author.username === this.currentUser?.username ||
          comment.author.email === this.currentUser?.email
        );

        comments.push(...userComments);
      }
    } catch (error) {
      this.logger.warn(`Failed to fetch commit comments for project ${project.name}:`, error);
    }

    return comments;
  }

  public async getCurrentUser(): Promise<GitLabUser> {
    const url = `${this.getBaseUrl()}/api/v4/user`;
    return await this.makeGitLabRequest(url);
  }

  public async fetchCommits(startDate: Date, endDate: Date): Promise<GitLabCommit[]> {
    const projects = await this.getProjects();
    const projectLimit = pLimit(this.getProjectConcurrency());
    const allCommits: GitLabCommit[] = [];

    await Promise.all(
      projects.map(project =>
        projectLimit(async () => {
          try {
            const url = `${this.getBaseUrl()}/api/v4/projects/${project.id}/repository/commits?since=${startDate.toISOString()}&until=${endDate.toISOString()}&per_page=100`;
            const response = await this.makeGitLabRequest(url);
            const projectCommits = response.map((commit: any) => ({ ...commit, project_name: project.name }));
            allCommits.push(...projectCommits);
          } catch (error) {
            this.logger.warn(`Failed to fetch commits for project ${project.name}:`, error);
          }
        })
      )
    );

    return allCommits;
  }

  public async fetchMergeRequests(startDate: Date, endDate: Date): Promise<GitLabMergeRequest[]> {
    const projects = await this.getProjects();
    const projectLimit = pLimit(this.getProjectConcurrency());
    const allMRs: GitLabMergeRequest[] = [];

    await Promise.all(
      projects.map(project =>
        projectLimit(async () => {
          try {
            const url = `${this.getBaseUrl()}/api/v4/projects/${project.id}/merge_requests?created_after=${startDate.toISOString()}&created_before=${endDate.toISOString()}&per_page=100&state=all`;
            const response = await this.makeGitLabRequest(url);
            const projectMRs = response.map((mr: any) => ({ ...mr, project_name: project.name }));
            allMRs.push(...projectMRs);
          } catch (error) {
            this.logger.warn(`Failed to fetch merge requests for project ${project.name}:`, error);
          }
        })
      )
    );

    return allMRs;
  }

  public async fetchIssues(startDate: Date, endDate: Date): Promise<GitLabIssue[]> {
    const projects = await this.getProjects();
    const projectLimit = pLimit(this.getProjectConcurrency());
    const allIssues: GitLabIssue[] = [];

    await Promise.all(
      projects.map(project =>
        projectLimit(async () => {
          try {
            const url = `${this.getBaseUrl()}/api/v4/projects/${project.id}/issues?created_after=${startDate.toISOString()}&created_before=${endDate.toISOString()}&per_page=100&state=all`;
            const response = await this.makeGitLabRequest(url);
            const projectIssues = response.map((issue: any) => ({ ...issue, project_name: project.name }));
            allIssues.push(...projectIssues);
          } catch (error) {
            this.logger.warn(`Failed to fetch issues for project ${project.name}:`, error);
          }
        })
      )
    );

    return allIssues;
  }

  private async getProjects(): Promise<GitLabProject[]> {
    const projectIds = this.configService.get<string>('GITLAB_PROJECT_IDS')?.split(',') || [];

    if (projectIds.length === 0) {
      // If no specific projects configured, fetch all accessible projects
      try {
        const url = `${this.getBaseUrl()}/api/v4/projects?membership=true&per_page=100`;
        return await this.makeRequest(url);
      } catch (error) {
        this.logger.warn('Failed to fetch projects, using empty list');
        return [];
      }
    }

    const projects: GitLabProject[] = [];

    for (const projectId of projectIds) {
      try {
        const url = `${this.getBaseUrl()}/api/v4/projects/${projectId.trim()}`;
        const project = await this.makeGitLabRequest(url);
        projects.push(project);
      } catch (error) {
        this.logger.warn(`Failed to fetch project ${projectId}:`, error);
      }
    }

    return projects;
  }

  private getProjectConcurrency(): number {
    const envValue = this.configService.get<string>('GITLAB_PROJECT_CONCURRENCY');
    const parsed = envValue ? parseInt(envValue, 10) : NaN;
    return !isNaN(parsed) && parsed > 0 ? parsed : 5;
  }

  private getBaseUrl(): string {
    return this.configService.get<string>('GITLAB_BASE_URL') || 'https://gitlab.com';
  }

  private makeRequest = createTracedRequest('GitLab', this.logger);

  private async makeGitLabRequest(url: string): Promise<any> {
    const accessToken = this.configService.get<string>('GITLAB_ACCESS_TOKEN');
    return this.makeRequest(url, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
      },
      timeout: 30000, // 30 second timeout
      retryConfig: 'conservative', // Use conservative retry for GitLab API
      enableCircuitBreaker: true,
    });
  }

  public createCommitActivity(commit: GitLabCommit): ActivityData {
    return ActivityFactory.createCommitActivity(commit);
  }

  public createMergeRequestActivity(mr: GitLabMergeRequest): ActivityData {
    return ActivityFactory.createMergeRequestActivity(mr);
  }

  public createIssueActivity(issue: GitLabIssue): ActivityData {
    return ActivityFactory.createIssueActivity(issue);
  }

  public createCommentActivity(comment: GitLabComment): ActivityData {
    return ActivityFactory.createCommentActivity(comment);
  }
}
