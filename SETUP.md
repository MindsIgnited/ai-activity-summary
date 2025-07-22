# Activity Summary Setup Guide

## Architecture Overview

The application uses a unified service architecture where all activity services inherit from `BaseActivityService`. This provides:

- **Consistent Interface**: All services implement the same `fetchActivities()` method
- **Shared Error Handling**: Common error handling and logging patterns
- **Unified Configuration**: Standardized configuration checking across all services
- **Reduced Duplication**: Common patterns shared in the base class

### Service Structure

```
BaseActivityService (Abstract)
├── GitLabService
├── SlackService
├── TeamsService
└── JiraService
```

### Activity Factory

The `ActivityFactory` ensures consistent activity data structure across all services:

```typescript
// GitLab activities
ActivityFactory.createCommitActivity(commit)
ActivityFactory.createMergeRequestActivity(mr)
ActivityFactory.createIssueActivity(issue)
ActivityFactory.createCommentActivity(comment)

// Teams activities
ActivityFactory.createTeamsMessageActivity(message)
ActivityFactory.createTeamsCalendarActivity(event)

// Jira activities
ActivityFactory.createJiraIssueActivity(issue, action)
ActivityFactory.createJiraCommentActivity(issue, comment)
ActivityFactory.createJiraWorklogActivity(issue, worklog)
ActivityFactory.createJiraChangelogActivity(issue, changelog)
```

## User Filtering & Privacy

The application implements comprehensive user filtering to ensure only activities from the designated user are processed for privacy and accuracy.

### User-Specific Data Fetching

All services filter activities by the current user:

- **GitLab**: Uses API-level filtering with `author_id`/`author_username` parameters and post-fetch filtering by email
- **Slack**: Post-fetch filtering by user email (requires `SLACK_USER_EMAIL` configuration)
- **Teams**: Post-fetch filtering by user email for messages, user-specific calendar events
- **Jira**: Uses JQL with user email filtering for issues, post-fetch filtering for comments/worklogs/changelog

### Required User Configuration

To enable user filtering, configure these environment variables:

```bash
# GitLab (uses token user automatically - no additional config needed)
GITLAB_ACCESS_TOKEN=your_token

# Slack (NEW - required for user filtering)
SLACK_BOT_TOKEN=your_token
SLACK_USER_EMAIL=user@example.com

# Teams (already configured)
TEAMS_USER_EMAIL=user@example.com

# Jira (already configured)
JIRA_EMAIL=user@example.com
```

### Fallback Behavior

If user email is not configured for a service:
- The service will fetch all activities (with warning logs)
- This maintains backward compatibility
- **Recommended**: Configure user emails for privacy

### Privacy Benefits

- **Data Minimization**: Only processes user's own activities
- **Performance**: Reduces data transfer and processing overhead
- **Accuracy**: Ensures summaries contain only relevant activities
- **Compliance**: Respects data privacy requirements and regulations

## Environment Configuration

The application supports multiple environment files with the following precedence (highest to lowest):
1. `.env.local` - **Local secrets (never committed)**
2. `.env` - Default configuration
3. System environment variables

### Setup Steps:

1. **Copy the example file**:
   ```bash
   cp env.example .env.local
   ```

2. **Edit `.env.local`** with your actual API credentials:
   ```bash
   # GitLab API Configuration
   GITLAB_ENABLED=true
   GITLAB_BASE_URL=https://gitlab.com
   GITLAB_ACCESS_TOKEN=your_actual_gitlab_token
   GITLAB_PROJECT_IDS=123,456,789
   # Optional: Control how many GitLab projects are fetched in parallel (default: 5)
   GITLAB_PROJECT_CONCURRENCY=5
   # Optional: Control whether to fetch commits, comments, issues, or merge request notes (all default to true)
   GITLAB_FETCH_COMMITS=true
   GITLAB_FETCH_COMMENTS=true
   GITLAB_FETCH_ISSUES=true
   GITLAB_FETCH_MR_NOTES=true
   # Optional: If false, disables all note/comment fetching from GitLab (blanket flag that overrides all comment/note fetching)
   GITLAB_FETCH_NOTES=true
   # Optional: If false, disables all nested fetching (comments, notes, etc) from GitLab (overrides other nested fetch flags)
   GITLAB_FETCH_NESTED=true

   # Slack API Configuration
   SLACK_ENABLED=true
   SLACK_BOT_TOKEN=xoxb-your_actual_slack_token
   SLACK_APP_TOKEN=xapp-your_actual_slack_token
   SLACK_CHANNELS=general,random,project-updates
   # NEW: Required for user filtering - only fetch messages from this user
   SLACK_USER_EMAIL=your-email@company.com

   # Microsoft Teams API Configuration
   TEAMS_ENABLED=true
   TEAMS_CLIENT_ID=your_actual_teams_client_id
   TEAMS_CLIENT_SECRET=your_actual_teams_client_secret
   TEAMS_TENANT_ID=your_actual_teams_tenant_id
   TEAMS_USER_EMAIL=your-email@company.com
   TEAMS_CHANNELS=General,Project Updates,Team Chat

   # Jira API Configuration
   JIRA_ENABLED=true
   JIRA_BASE_URL=https://your-domain.atlassian.net
   JIRA_EMAIL=your-email@company.com
   JIRA_API_TOKEN=your_actual_jira_token
   JIRA_PROJECT_KEYS=PROJ,DEV,QA
   JIRA_ISSUE_TYPES=Task,Bug,Story,Epic

   # Application Configuration
   NODE_ENV=development
   LOG_LEVEL=info
   ```

### Enabling Trace-Level Logging

To enable detailed trace-level logging for all network requests (including all API calls to GitLab, Slack, Teams, Jira, and AI providers), set the following in your `.env.local` or `.env` file:

```bash
LOG_LEVEL=verbose
```

With `LOG_LEVEL=verbose`, you will see `[TRACE]` logs in the console for every network request, including:
- When a request is sent (method, URL)
- When a response is received (status, duration in ms)
- Any errors, with full context and duration

This is useful for debugging performance issues, slow endpoints, or network failures. For normal operation, you may want to set `LOG_LEVEL=info` or higher to reduce log verbosity.

## Integration Configuration

### Enabling/Disabling Integrations

You can selectively enable or disable each integration using environment variables. This is useful when you only want to pull data from specific APIs or when troubleshooting individual integrations.

**Enable/Disable Variables:**
- `GITLAB_ENABLED` - Enable/disable GitLab integration (default: true)
- `SLACK_ENABLED` - Enable/disable Slack integration (default: true)
- `TEAMS_ENABLED` - Enable/disable Teams integration (default: true)
- `JIRA_ENABLED` - Enable/disable Jira integration (default: true)

**Configuration Examples:**

```bash
# Enable only GitLab and Slack
GITLAB_ENABLED=true
SLACK_ENABLED=true
TEAMS_ENABLED=false
JIRA_ENABLED=false

# Enable only Teams and Jira
GITLAB_ENABLED=false
SLACK_ENABLED=false
TEAMS_ENABLED=true
JIRA_ENABLED=true
```

### Service-Specific Configuration

Each service inherits from `BaseActivityService` and implements its own configuration checking:

- **GitLabService**: Checks for `GITLAB_BASE_URL` and `GITLAB_ACCESS_TOKEN`
- **SlackService**: Checks for `SLACK_BOT_TOKEN`
- **TeamsService**: Checks for `TEAMS_CLIENT_ID`, `TEAMS_CLIENT_SECRET`, `TEAMS_TENANT_ID`, and `TEAMS_USER_EMAIL`
- **JiraService**: Checks for `JIRA_BASE_URL`, `JIRA_EMAIL`, and `JIRA_API_TOKEN`

If any service is not properly configured, it will be automatically disabled and logged as a warning.

## Development Patterns

### Adding New Services

To add a new activity service:

1. **Extend BaseActivityService**:
```typescript
@Injectable()
export class NewService extends BaseActivityService {
  protected readonly serviceName = 'NewService';
  protected readonly logger = new Logger(NewService.name);

  protected isConfigured(): boolean {
    // Check configuration
    return true;
  }

  protected async fetchActivitiesForDate(date: Date): Promise<ActivityData[]> {
    // Implement service-specific logic
    return [];
  }
}
```

2. **Add ActivityFactory Methods**:
```typescript
// In ActivityFactory
static createNewServiceActivity(data: any): ActivityData {
  return this.createActivity('newservice', id, timestamp, title, description, author, url, metadata);
}
```

3. **Register in AppModule** and update `AppService` to include the new service.

### Error Handling

All services inherit common error handling patterns from `BaseActivityService`:

- Automatic configuration validation
- Standardized error logging
- Graceful fallback mechanisms
- Consistent error context

## API Setup Instructions

### GitLab API

1. **Create a Personal Access Token**:
   - Go to GitLab → Settings → Access Tokens
   - Create a token with `read_api` scope
   - Copy the token to your `.env.local`

2. **Configure Projects**:
   - Set `GITLAB_PROJECT_IDS` to comma-separated project IDs
   - Or leave empty to fetch all accessible projects

3. **Optional Settings**:
   - `GITLAB_PROJECT_CONCURRENCY`: Number of parallel project requests (default: 5)
   - `GITLAB_FETCH_COMMITS`: Enable/disable commit fetching (default: true)
   - `GITLAB_FETCH_ISSUES`: Enable/disable issue fetching (default: true)
   - `GITLAB_FETCH_COMMENTS`: Enable/disable comment fetching (default: true)

### Slack API

1. **Create a Slack App**:
   - Go to [api.slack.com/apps](https://api.slack.com/apps)
   - Create a new app
   - Add bot token scopes: `channels:history`, `users:read`, `reactions:read`

2. **Install the App**:
   - Install the app to your workspace
   - Copy the bot token (`xoxb-...`) to your `.env.local`

3. **Configure Channels**:
   - Set `SLACK_CHANNELS` to comma-separated channel names
   - The bot must be added to these channels

4. **Configure User Filtering** (NEW):
   - Set `SLACK_USER_EMAIL` to your email address
   - This ensures only your messages are fetched for privacy
   - If not configured, all messages will be fetched (with warning logs)

### Microsoft Teams API

1. **Register Azure AD Application**:
   - Go to Azure Portal → Azure Active Directory → App registrations
   - Create a new registration
   - Note the Application (client) ID and Directory (tenant) ID

2. **Configure API Permissions**:
   - Add Microsoft Graph API permissions:
     - `ChannelMessage.Read.All`
     - `Chat.Read.All`
     - `CallRecords.Read.All`
     - `OnlineMeetings.Read.All`
     - `Calendars.Read`
     - `User.Read.All`
     - `Team.ReadBasic.All`
     - `Group.Read.All`
   - Click "Grant admin consent"

3. **Create Client Secret**:
   - Go to Certificates & secrets
   - Create a new client secret
   - Copy the secret value to your `.env.local`

4. **Configure Environment**:
   - Set `TEAMS_CLIENT_ID` to your application ID
   - Set `TEAMS_CLIENT_SECRET` to your client secret
   - Set `TEAMS_TENANT_ID` to your tenant ID
   - Set `TEAMS_USER_EMAIL` to your email address

### Jira API

1. **Create API Token**:
   - Go to [id.atlassian.com/manage-profile/security/api-tokens](https://id.atlassian.com/manage-profile/security/api-tokens)
   - Create a new API token
   - Copy the token to your `.env.local`

2. **Configure Projects**:
   - Set `JIRA_PROJECT_KEYS` to comma-separated project keys
   - Set `JIRA_ISSUE_TYPES` to comma-separated issue types

3. **Set Base URL**:
   - For cloud: `https://your-domain.atlassian.net`
   - For server: `https://your-jira-server.com`

## Performance

GitLab project data is fetched in parallel with a concurrency limit (default: 5). This means that data for multiple projects is retrieved at the same time, making summary generation much faster for users with many projects. The concurrency limit can be set via the `GITLAB_PROJECT_CONCURRENCY` environment variable or adjusted in the code if you need to tune for your environment or API rate limits.

## Output Format

The application generates a JSON file with the following structure:

```json
[
  {
    "date": "2024-01-01",
    "activities": [
      {
        "id": "unique-id",
        "type": "gitlab|slack|teams|jira",
        "timestamp": "2024-01-01T10:00:00.000Z",
        "title": "Activity title",
        "description": "Activity description",
        "author": "Author name",
        "url": "Activity URL",
        "metadata": {}
      }
    ],
    "summary": {
      "totalActivities": 10,
      "byType": {
        "gitlab": 5,
        "slack": 3,
        "teams": 1,
        "jira": 1
      },
      "byAuthor": {
        "john.doe": 3,
        "jane.smith": 7
      }
    }
  }
]
```

## GitLab Activity Types

The GitLab integration tracks the following activities for the authenticated user:

### Commits
- Code commits with commit messages and author information
- Direct links to commit details in GitLab
- Project and branch information
- Commit timestamps and short IDs
- **User-Specific**: Only your own commits are included (filtered by author email/name)

### Merge Requests
- Created, merged, and closed merge requests
- MR titles, descriptions, and status information
- Source and target branch details
- Author and assignee information
- Direct links to merge requests
- **User-Specific**: Only merge requests you created are included (API-level filtering)

### Issues
- Created and closed issues
- Issue titles, descriptions, and labels
- Milestone information when available
- Author and assignee details
- Direct links to issues
- **User-Specific**: Only issues you created are included (API-level filtering)

### Comments
- Comments on commits, merge requests, and issues
- Comment content and author information
- Direct links to specific comments
- Project context for each comment
- **User-Specific**: Only comments you authored are included (post-fetch filtering)

## Teams Activity Types

The Teams integration tracks the following activities for the authenticated user:

### Messages
- Channel messages sent by the authenticated user
- Message content, author, and timestamps
- Direct links to messages in Teams
- **User-Specific**: Only your own messages are included (post-fetch filtering by email)

### Calls
- Teams call records where the user was organizer or participant
- Call subject and organizer information
- Join URLs for recorded calls
- **User-Specific**: Only calls you organized or participated in

### Calendar Events
- Calendar events from the authenticated user's calendar
- Event details, attendees, and meeting links
- **User-Specific**: Only your calendar events are included (user-specific API calls)
