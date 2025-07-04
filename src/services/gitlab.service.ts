import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ActivityData } from '../app.service';

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

@Injectable()
export class GitLabService {
  private readonly logger = new Logger(GitLabService.name);

  constructor(private readonly configService: ConfigService) {}

  async fetchActivities(date: Date): Promise<ActivityData[]> {
    if (!this.isConfigured()) {
      this.logger.warn('GitLab configuration incomplete, skipping GitLab activities');
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

      this.logger.log(`Fetched ${activities.length} GitLab activities for ${date.toISOString().split('T')[0]}`);
    } catch (error) {
      this.logger.error(`Error fetching GitLab activities for ${date.toISOString()}:`, error);
    }

    return activities;
  }

  private isConfigured(): boolean {
    const baseUrl = this.configService.get<string>('GITLAB_BASE_URL');
    const accessToken = this.configService.get<string>('GITLAB_ACCESS_TOKEN');
    
    return !!(baseUrl && accessToken);
  }

  private async fetchCommits(startDate: Date, endDate: Date): Promise<GitLabCommit[]> {
    const commits: GitLabCommit[] = [];
    const projects = await this.getProjects();

    for (const project of projects) {
      try {
        const url = `${this.getBaseUrl()}/api/v4/projects/${project.id}/repository/commits?since=${startDate.toISOString()}&until=${endDate.toISOString()}&per_page=100`;
        
        const response = await this.makeRequest(url);
        const projectCommits = response.map((commit: GitLabCommit) => ({
          ...commit,
          project_name: project.name,
        }));
        
        commits.push(...projectCommits);
      } catch (error) {
        this.logger.warn(`Failed to fetch commits for project ${project.name}:`, error);
      }
    }

    return commits;
  }

  private async fetchMergeRequests(startDate: Date, endDate: Date): Promise<GitLabMergeRequest[]> {
    const mergeRequests: GitLabMergeRequest[] = [];
    const projects = await this.getProjects();

    for (const project of projects) {
      try {
        const url = `${this.getBaseUrl()}/api/v4/projects/${project.id}/merge_requests?created_after=${startDate.toISOString()}&created_before=${endDate.toISOString()}&per_page=100&state=all`;
        
        const response = await this.makeRequest(url);
        const projectMRs = response.map((mr: GitLabMergeRequest) => ({
          ...mr,
          project_name: project.name,
        }));
        
        mergeRequests.push(...projectMRs);
      } catch (error) {
        this.logger.warn(`Failed to fetch merge requests for project ${project.name}:`, error);
      }
    }

    return mergeRequests;
  }

  private async fetchIssues(startDate: Date, endDate: Date): Promise<GitLabIssue[]> {
    const issues: GitLabIssue[] = [];
    const projects = await this.getProjects();

    for (const project of projects) {
      try {
        const url = `${this.getBaseUrl()}/api/v4/projects/${project.id}/issues?created_after=${startDate.toISOString()}&created_before=${endDate.toISOString()}&per_page=100&state=all`;
        
        const response = await this.makeRequest(url);
        const projectIssues = response.map((issue: GitLabIssue) => ({
          ...issue,
          project_name: project.name,
        }));
        
        issues.push(...projectIssues);
      } catch (error) {
        this.logger.warn(`Failed to fetch issues for project ${project.name}:`, error);
      }
    }

    return issues;
  }

  private async fetchComments(startDate: Date, endDate: Date): Promise<GitLabComment[]> {
    const comments: GitLabComment[] = [];
    const projects = await this.getProjects();

    for (const project of projects) {
      try {
        // Fetch comments on merge requests
        const mrComments = await this.fetchMergeRequestComments(project, startDate, endDate);
        comments.push(...mrComments);

        // Fetch comments on issues
        const issueComments = await this.fetchIssueComments(project, startDate, endDate);
        comments.push(...issueComments);

        // Fetch comments on commits
        const commitComments = await this.fetchCommitComments(project, startDate, endDate);
        comments.push(...commitComments);
      } catch (error) {
        this.logger.warn(`Failed to fetch comments for project ${project.name}:`, error);
      }
    }

    return comments;
  }

  private async fetchMergeRequestComments(project: GitLabProject, startDate: Date, endDate: Date): Promise<GitLabComment[]> {
    const comments: GitLabComment[] = [];
    
    try {
      // First get merge requests, then get comments for each
      const mrs = await this.makeRequest(`${this.getBaseUrl()}/api/v4/projects/${project.id}/merge_requests?per_page=100&state=all`);
      
      for (const mr of mrs) {
        const url = `${this.getBaseUrl()}/api/v4/projects/${project.id}/merge_requests/${mr.iid}/notes?per_page=100`;
        const response = await this.makeRequest(url);
        
        const filteredComments = response.filter((comment: GitLabComment) => {
          const commentDate = new Date(comment.created_at);
          return commentDate >= startDate && commentDate <= endDate;
        }).map((comment: GitLabComment) => ({
          ...comment,
          project_name: project.name,
          web_url: `${mr.web_url}#note_${comment.id}`,
        }));
        
        comments.push(...filteredComments);
      }
    } catch (error) {
      this.logger.warn(`Failed to fetch merge request comments for project ${project.name}:`, error);
    }

    return comments;
  }

  private async fetchIssueComments(project: GitLabProject, startDate: Date, endDate: Date): Promise<GitLabComment[]> {
    const comments: GitLabComment[] = [];
    
    try {
      // First get issues, then get comments for each
      const issues = await this.makeRequest(`${this.getBaseUrl()}/api/v4/projects/${project.id}/issues?per_page=100&state=all`);
      
      for (const issue of issues) {
        const url = `${this.getBaseUrl()}/api/v4/projects/${project.id}/issues/${issue.iid}/notes?per_page=100`;
        const response = await this.makeRequest(url);
        
        const filteredComments = response.filter((comment: GitLabComment) => {
          const commentDate = new Date(comment.created_at);
          return commentDate >= startDate && commentDate <= endDate;
        }).map((comment: GitLabComment) => ({
          ...comment,
          project_name: project.name,
          web_url: `${issue.web_url}#note_${comment.id}`,
        }));
        
        comments.push(...filteredComments);
      }
    } catch (error) {
      this.logger.warn(`Failed to fetch issue comments for project ${project.name}:`, error);
    }

    return comments;
  }

  private async fetchCommitComments(project: GitLabProject, startDate: Date, endDate: Date): Promise<GitLabComment[]> {
    const comments: GitLabComment[] = [];
    
    try {
      // First get commits, then get comments for each
      const commits = await this.makeRequest(`${this.getBaseUrl()}/api/v4/projects/${project.id}/repository/commits?per_page=100`);
      
      for (const commit of commits) {
        const url = `${this.getBaseUrl()}/api/v4/projects/${project.id}/repository/commits/${commit.id}/comments?per_page=100`;
        const response = await this.makeRequest(url);
        
        const filteredComments = response.filter((comment: GitLabComment) => {
          const commentDate = new Date(comment.created_at);
          return commentDate >= startDate && commentDate <= endDate;
        }).map((comment: GitLabComment) => ({
          ...comment,
          project_name: project.name,
          web_url: `${commit.web_url}#note_${comment.id}`,
        }));
        
        comments.push(...filteredComments);
      }
    } catch (error) {
      this.logger.warn(`Failed to fetch commit comments for project ${project.name}:`, error);
    }

    return comments;
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
        const project = await this.makeRequest(url);
        projects.push(project);
      } catch (error) {
        this.logger.warn(`Failed to fetch project ${projectId}:`, error);
      }
    }

    return projects;
  }

  private getBaseUrl(): string {
    return this.configService.get<string>('GITLAB_BASE_URL') || 'https://gitlab.com';
  }

  private async makeRequest(url: string): Promise<any> {
    const accessToken = this.configService.get<string>('GITLAB_ACCESS_TOKEN');
    
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`GitLab API request failed: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  private createCommitActivity(commit: GitLabCommit): ActivityData {
    return {
      id: `gitlab-commit-${commit.id}`,
      type: 'gitlab',
      timestamp: new Date(commit.created_at),
      title: `Commit: ${commit.title}`,
      description: commit.message,
      author: commit.author_name,
      url: commit.web_url,
      metadata: {
        action: 'commit',
        shortId: commit.short_id,
        projectId: commit.project_id,
        projectName: commit.project_name,
        authorEmail: commit.author_email,
      },
    };
  }

  private createMergeRequestActivity(mr: GitLabMergeRequest): ActivityData {
    const action = mr.state === 'merged' ? 'merged' : mr.state === 'closed' ? 'closed' : 'created';
    
    return {
      id: `gitlab-mr-${mr.id}`,
      type: 'gitlab',
      timestamp: new Date(mr.created_at),
      title: `Merge Request ${action}: ${mr.title}`,
      description: mr.description,
      author: mr.author.name,
      url: mr.web_url,
      metadata: {
        action: 'merge_request',
        state: mr.state,
        mergeStatus: mr.merge_status,
        projectId: mr.project_id,
        projectName: mr.project_name,
        sourceBranch: mr.source_branch,
        targetBranch: mr.target_branch,
        authorEmail: mr.author.email,
        assigneeEmail: mr.assignee?.email,
        iid: mr.iid,
      },
    };
  }

  private createIssueActivity(issue: GitLabIssue): ActivityData {
    const action = issue.state === 'closed' ? 'closed' : 'created';
    
    return {
      id: `gitlab-issue-${issue.id}`,
      type: 'gitlab',
      timestamp: new Date(issue.created_at),
      title: `Issue ${action}: ${issue.title}`,
      description: issue.description,
      author: issue.author.name,
      url: issue.web_url,
      metadata: {
        action: 'issue',
        state: issue.state,
        projectId: issue.project_id,
        projectName: issue.project_name,
        labels: issue.labels,
        authorEmail: issue.author.email,
        assigneeEmail: issue.assignee?.email,
        iid: issue.iid,
        milestone: issue.milestone?.title,
      },
    };
  }

  private createCommentActivity(comment: GitLabComment): ActivityData {
    const noteableType = comment.noteable_type.toLowerCase();
    
    return {
      id: `gitlab-comment-${comment.id}`,
      type: 'gitlab',
      timestamp: new Date(comment.created_at),
      title: `Comment on ${noteableType}: ${comment.body.substring(0, 50)}${comment.body.length > 50 ? '...' : ''}`,
      description: comment.body,
      author: comment.author.name,
      url: comment.web_url || '#',
      metadata: {
        action: 'comment',
        noteableType: comment.noteable_type,
        noteableId: comment.noteable_id,
        projectId: comment.project_id,
        projectName: comment.project_name,
        authorEmail: comment.author.email,
      },
    };
  }
} 