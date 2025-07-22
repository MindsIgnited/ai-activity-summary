import { ActivityData } from '../app.service';

/**
 * Factory class for creating standardized ActivityData objects
 */
export class ActivityFactory {
  /**
   * Create a standardized activity object
   */
  static createActivity(
    type: 'gitlab' | 'slack' | 'teams' | 'jira',
    id: string,
    timestamp: Date,
    title: string,
    description?: string,
    author?: string,
    url?: string,
    metadata?: Record<string, any>
  ): ActivityData {
    return {
      id,
      type,
      timestamp,
      title,
      description,
      author,
      url,
      metadata,
    };
  }

  /**
   * Create a GitLab activity
   */
  static createGitLabActivity(
    id: string,
    timestamp: Date,
    title: string,
    description?: string,
    author?: string,
    url?: string,
    metadata?: Record<string, any>
  ): ActivityData {
    return this.createActivity('gitlab', id, timestamp, title, description, author, url, metadata);
  }

  /**
   * Create a Slack activity
   */
  static createSlackActivity(
    id: string,
    timestamp: Date,
    title: string,
    description?: string,
    author?: string,
    url?: string,
    metadata?: Record<string, any>
  ): ActivityData {
    return this.createActivity('slack', id, timestamp, title, description, author, url, metadata);
  }

  /**
   * Create a Teams activity
   */
  static createTeamsActivity(
    id: string,
    timestamp: Date,
    title: string,
    description?: string,
    author?: string,
    url?: string,
    metadata?: Record<string, any>
  ): ActivityData {
    return this.createActivity('teams', id, timestamp, title, description, author, url, metadata);
  }

  /**
   * Create a Jira activity
   */
  static createJiraActivity(
    id: string,
    timestamp: Date,
    title: string,
    description?: string,
    author?: string,
    url?: string,
    metadata?: Record<string, any>
  ): ActivityData {
    return this.createActivity('jira', id, timestamp, title, description, author, url, metadata);
  }

  /**
   * Create an activity with a generated ID based on type and source ID
   */
  static createActivityWithGeneratedId(
    type: 'gitlab' | 'slack' | 'teams' | 'jira',
    sourceId: string,
    timestamp: Date,
    title: string,
    description?: string,
    author?: string,
    url?: string,
    metadata?: Record<string, any>
  ): ActivityData {
    const id = `${type}-${sourceId}`;
    return this.createActivity(type, id, timestamp, title, description, author, url, metadata);
  }

  /**
   * Create an activity with timestamp-based ID
   */
  static createActivityWithTimestampId(
    type: 'gitlab' | 'slack' | 'teams' | 'jira',
    timestamp: Date,
    title: string,
    description?: string,
    author?: string,
    url?: string,
    metadata?: Record<string, any>
  ): ActivityData {
    const id = `${type}-${timestamp.getTime()}`;
    return this.createActivity(type, id, timestamp, title, description, author, url, metadata);
  }

  /**
   * Create an activity with a custom ID prefix
   */
  static createActivityWithPrefix(
    type: 'gitlab' | 'slack' | 'teams' | 'jira',
    prefix: string,
    identifier: string,
    timestamp: Date,
    title: string,
    description?: string,
    author?: string,
    url?: string,
    metadata?: Record<string, any>
  ): ActivityData {
    const id = `${type}-${prefix}-${identifier}`;
    return this.createActivity(type, id, timestamp, title, description, author, url, metadata);
  }

  /**
   * Create a GitLab commit activity
   */
  static createCommitActivity(commit: any): ActivityData {
    return this.createActivity(
      'gitlab',
      `gitlab-commit-${commit.id}`,
      new Date(commit.created_at),
      `Commit: ${commit.title}`,
      commit.message,
      commit.author_name,
      commit.web_url,
      {
        action: 'commit',
        shortId: commit.short_id,
        projectId: commit.project_id,
        projectName: commit.project_name,
        authorEmail: commit.author_email,
      }
    );
  }

  /**
   * Create a GitLab merge request activity
   */
  static createMergeRequestActivity(mr: any): ActivityData {
    const action = mr.state === 'merged' ? 'merged' : mr.state === 'closed' ? 'closed' : 'created';
    return this.createActivity(
      'gitlab',
      `gitlab-mr-${mr.id}`,
      new Date(mr.created_at),
      `Merge Request ${action}: ${mr.title}`,
      mr.description,
      mr.author?.name,
      mr.web_url,
      {
        action: 'merge_request',
        state: mr.state,
        mergeStatus: mr.merge_status,
        projectId: mr.project_id,
        projectName: mr.project_name,
        sourceBranch: mr.source_branch,
        targetBranch: mr.target_branch,
        authorEmail: mr.author?.email,
        assigneeEmail: mr.assignee?.email,
        iid: mr.iid,
      }
    );
  }

  /**
   * Create a GitLab issue activity
   */
  static createIssueActivity(issue: any): ActivityData {
    const action = issue.state === 'closed' ? 'closed' : 'created';
    return this.createActivity(
      'gitlab',
      `gitlab-issue-${issue.id}`,
      new Date(issue.created_at),
      `Issue ${action}: ${issue.title}`,
      issue.description,
      issue.author?.name,
      issue.web_url,
      {
        action: 'issue',
        state: issue.state,
        projectId: issue.project_id,
        projectName: issue.project_name,
        labels: issue.labels,
        authorEmail: issue.author?.email,
        assigneeEmail: issue.assignee?.email,
        iid: issue.iid,
        milestone: issue.milestone?.title,
      }
    );
  }

  /**
   * Create a GitLab comment activity
   */
  static createCommentActivity(comment: any): ActivityData {
    const noteableType = comment.noteable_type?.toLowerCase?.() || 'unknown';
    return this.createActivity(
      'gitlab',
      `gitlab-comment-${comment.id}`,
      new Date(comment.created_at),
      `Comment on ${noteableType}: ${comment.body?.substring(0, 50)}`,
      comment.body,
      comment.author?.name,
      comment.web_url || '#',
      {
        action: 'comment',
        noteableType: comment.noteable_type,
        noteableId: comment.noteable_id,
        projectId: comment.project_id,
        projectName: comment.project_name,
        authorEmail: comment.author?.email,
      }
    );
  }

  /**
   * Create a Teams message activity
   */
  static createTeamsMessageActivity(message: any): ActivityData {
    const timestamp = new Date(message.createdDateTime);
    const title = `Message: ${message.subject || message.body.content.substring(0, 50)}`;

    return this.createActivity(
      'teams',
      `teams-message-${message.id}`,
      timestamp,
      title,
      message.body.content,
      message.from.user.displayName,
      message.webUrl,
      {
        action: 'message',
        importance: message.importance,
        contentType: message.body.contentType,
        subject: message.subject,
        authorEmail: message.from.user.email,
      }
    );
  }

  /**
   * Create a Teams calendar activity
   */
  static createTeamsCalendarActivity(event: any): ActivityData {
    const startTime = new Date(event.start.dateTime);
    const title = `Calendar Event: ${event.subject}`;

    return this.createActivity(
      'teams',
      `teams-calendar-${event.id}`,
      startTime,
      title,
      event.body.content,
      event.organizer.emailAddress.name,
      event.webLink,
      {
        action: 'calendar_event',
        startTime: event.start.dateTime,
        endTime: event.end.dateTime,
        timeZone: event.start.timeZone,
        isOnlineMeeting: event.isOnlineMeeting,
        joinUrl: event.onlineMeeting?.joinUrl,
        attendeeCount: event.attendees?.length || 0,
        organizerEmail: event.organizer.emailAddress.address,
      }
    );
  }

  /**
   * Create a Jira issue activity
   */
  static createJiraIssueActivity(issue: any, action: string): ActivityData {
    const timestamp = new Date(issue.fields.created);
    const title = `Issue ${action}: ${issue.key} - ${issue.fields.summary}`;

    return this.createActivity(
      'jira',
      `jira-issue-${issue.key}`,
      timestamp,
      title,
      issue.fields.description,
      issue.fields.reporter?.displayName || 'Unknown',
      undefined, // URL will be constructed in the service
      {
        action: 'issue',
        issueKey: issue.key,
        issueType: issue.fields.issuetype.name,
        status: issue.fields.status.name,
        projectKey: issue.fields.project.key,
        projectName: issue.fields.project.name,
        assignee: issue.fields.assignee?.displayName,
        assigneeEmail: issue.fields.assignee?.emailAddress,
        reporterEmail: issue.fields.reporter?.emailAddress,
      }
    );
  }

  /**
   * Create a Jira comment activity
   */
  static createJiraCommentActivity(issue: any, comment: any): ActivityData {
    const timestamp = new Date(comment.created);
    const title = `Comment on ${issue.key}: ${comment.body.substring(0, 50)}`;

    return this.createActivity(
      'jira',
      `jira-comment-${comment.id}`,
      timestamp,
      title,
      comment.body,
      comment.author.displayName,
      undefined, // URL will be constructed in the service
      {
        action: 'comment',
        issueKey: issue.key,
        commentId: comment.id,
        authorEmail: comment.author.emailAddress,
        projectKey: issue.fields.project.key,
        projectName: issue.fields.project.name,
      }
    );
  }

  /**
   * Create a Jira worklog activity
   */
  static createJiraWorklogActivity(issue: any, worklog: any): ActivityData {
    const timestamp = new Date(worklog.started);
    const hoursSpent = worklog.timeSpentSeconds / 3600;
    const title = `Work logged on ${issue.key}: ${hoursSpent.toFixed(1)}h`;

    return this.createActivity(
      'jira',
      `jira-worklog-${worklog.id}`,
      timestamp,
      title,
      worklog.comment,
      worklog.author.displayName,
      undefined, // URL will be constructed in the service
      {
        action: 'worklog',
        issueKey: issue.key,
        worklogId: worklog.id,
        timeSpentSeconds: worklog.timeSpentSeconds,
        timeSpentHours: hoursSpent,
        authorEmail: worklog.author.emailAddress,
        projectKey: issue.fields.project.key,
        projectName: issue.fields.project.name,
      }
    );
  }

  /**
   * Create a Jira changelog activity
   */
  static createJiraChangelogActivity(issue: any, changelog: any): ActivityData {
    const timestamp = new Date(changelog.created);
    const changes = changelog.items.map((item: any) => `${item.field}: ${item.fromString || 'null'} → ${item.toString || 'null'}`).join(', ');
    const title = `Field changes on ${issue.key}: ${changes.substring(0, 50)}`;

    return this.createActivity(
      'jira',
      `jira-changelog-${changelog.id}`,
      timestamp,
      title,
      changes,
      changelog.author.displayName,
      undefined, // URL will be constructed in the service
      {
        action: 'changelog',
        issueKey: issue.key,
        changelogId: changelog.id,
        changes: changelog.items,
        authorEmail: changelog.author.emailAddress,
        projectKey: issue.fields.project.key,
        projectName: issue.fields.project.name,
      }
    );
  }
}
