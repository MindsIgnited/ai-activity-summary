# Activity Summary Setup Guide

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

   # Slack API Configuration
   SLACK_ENABLED=true
   SLACK_BOT_TOKEN=xoxb-your_actual_slack_token
   SLACK_APP_TOKEN=xapp-your_actual_slack_token
   SLACK_CHANNELS=general,random,project-updates

   # Microsoft Teams API Configuration
   TEAMS_ENABLED=true
   TEAMS_CLIENT_ID=your_actual_teams_client_id
   TEAMS_CLIENT_SECRET=your_actual_teams_client_secret
   TEAMS_TENANT_ID=your_actual_teams_tenant_id
   TEAMS_EMAIL=your-email@company.com
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

# Disable all integrations (useful for testing)
GITLAB_ENABLED=false
SLACK_ENABLED=false
TEAMS_ENABLED=false
JIRA_ENABLED=false
```

**Behavior:**
- **Default behavior**: All integrations are enabled by default
- **Explicit disable**: Set `{INTEGRATION}_ENABLED=false` to disable
- **Explicit enable**: Set `{INTEGRATION}_ENABLED=true` to enable
- **Missing variable**: Treated as enabled (true)
- **Invalid values**: Any value other than "false" is treated as enabled

**Benefits:**
- **Performance**: Disable unused integrations to reduce API calls and processing time
- **Troubleshooting**: Isolate issues by disabling specific integrations
- **Flexibility**: Configure different setups for different environments
- **Cost control**: Reduce API usage by only enabling needed integrations

### Security Notes:

- **`.env.local` is in `.gitignore`** and will never be committed to version control
- **Never commit real API tokens or secrets** to version control
- **Use `.env.local` for all sensitive configuration**
- **Use `.env` for non-sensitive defaults** (optional)
- **System environment variables** can override both files

### Environment File Precedence:

1. **`.env.local`** (highest priority) - Your local secrets
2. **`.env`** (medium priority) - Default configuration
3. **System environment variables** (lowest priority) - Runtime overrides

This ensures your secrets stay local while allowing for flexible configuration management.

## API Setup Instructions

### GitLab API
1. Go to your GitLab instance
2. Navigate to User Settings > Access Tokens
3. Create a new token with the following scopes:
   - `read_api` - Read API access
   - `read_repository` - Read repository access
   - `read_user` - Read user information
4. Add the token to `GITLAB_ACCESS_TOKEN` in `.env.local`
5. Set your GitLab instance URL in `GITLAB_BASE_URL` (defaults to gitlab.com)
6. Optionally specify project IDs in `GITLAB_PROJECT_IDS` (comma-separated)
   - If not specified, will fetch from all projects you have access to

**Important Notes for GitLab API:**
- The token needs appropriate scopes to read project data
- Project IDs can be found in the project's main page URL
- If no projects are specified, the app will fetch from all accessible projects
- Supports both GitLab.com and self-hosted GitLab instances

### Slack API
1. Go to https://api.slack.com/apps
2. Create a new app
3. Add the following OAuth scopes:
   - `channels:history`
   - `groups:history`
   - `im:history`
   - `mpim:history`
4. Install the app to your workspace
5. Copy the Bot User OAuth Token to `SLACK_BOT_TOKEN` in `.env.local`
6. Optionally specify channels in `SLACK_CHANNELS` (comma-separated)

### Microsoft Teams API

To enable Microsoft Teams integration, you must register an application in Azure AD and grant the correct Microsoft Graph API permissions. You can choose between **Application permissions** (client credentials flow) or **Delegated permissions** (device code flow).

#### Option 1: Application Permissions (Recommended for Server Applications)

1. **Register an Application in Azure AD**
   - Go to [Azure Portal > Azure Active Directory > App registrations](https://portal.azure.com/#blade/Microsoft_AAD_IAM/ActiveDirectoryMenuBlade/RegisteredApps)
   - Click **New registration**
   - Name your app (e.g., `Activity Summary`)
   - Set the supported account type (usually "Accounts in this organizational directory only")
   - Click **Register**

2. **Create a Client Secret**
   - In your app registration, go to **Certificates & secrets**
   - Click **New client secret**
   - Add a description and set an expiry (choose as appropriate)
   - Click **Add** and copy the value (you'll use this in `.env.local`)

3. **Configure API Permissions**
   - Go to **API permissions** > **Add a permission** > **Microsoft Graph** > **Application permissions**
   - Add the following permissions:
     - `ChannelMessage.Read.All` (Read all channel messages)
     - `Chat.Read.All` (Read all chat messages)
     - `CallRecords.Read.All` (Read call records)
     - `OnlineMeetings.Read.All` (Read online meetings)
     - `Calendars.Read` (Read user calendars)
     - `User.Read.All` (Read all users' profiles)
     - `Team.ReadBasic.All` (Read all teams' basic info)
     - `Group.Read.All` (Read all groups)
   - Click **Add permissions**

4. **Grant Admin Consent**
   - In **API permissions**, click **Grant admin consent for [Your Tenant]**
   - Confirm the consent
   - Ensure all permissions show "Granted for [Your Tenant]"

5. **Configure Environment Variables**
   - In `.env.local`, set:
     - `TEAMS_CLIENT_ID` = Application (client) ID
     - `TEAMS_CLIENT_SECRET` = Value from Certificates & secrets
     - `TEAMS_TENANT_ID` = Directory (tenant) ID
     - `TEAMS_EMAIL` = The user email to filter activities for

#### Option 2: Delegated Permissions (Recommended for User-Specific Data)

1. **Register an Application in Azure AD**
   - Follow the same steps as above for app registration

2. **Create a Client Secret**
   - Follow the same steps as above for client secret

3. **Configure API Permissions**
   - Go to **API permissions** > **Add a permission** > **Microsoft Graph** > **Delegated permissions**
   - Add the following permissions:
     - `Calendars.Read`
     - `Channel.ReadBasic.All`
     - `ChannelMessage.Read.All`
     - `Group.Read.All`
     - `Team.ReadBasic.All`
     - `User.Read.All`
     - `User.Read`
   - Click **Add permissions**

4. **Grant Admin Consent**
   - In **API permissions**, click **Grant admin consent for [Your Tenant]**
   - Confirm the consent

5. **Configure Environment Variables**
   - Same as above

6. **Authentication Flow**
   - The application will use device code flow for authentication
   - When you run the app, it will display a URL and code
   - Visit the URL, enter the code, and authenticate with your Microsoft account
   - The app will automatically refresh tokens as needed

#### Configuration Notes

**For Application Permissions:**
- The app uses the client credentials flow (application permissions)
- Admin consent is required for most permissions
- The app can access data across all users in the tenant, but will filter by `TEAMS_EMAIL`
- No user interaction required during runtime

**For Delegated Permissions:**
- The app uses device code flow for authentication
- User interaction is required for initial authentication
- The app accesses data on behalf of the authenticated user
- More secure for user-specific data access
- Tokens are automatically refreshed

**Troubleshooting:**
- If you see 403 Forbidden errors, double-check that admin consent was granted and the correct permissions are present
- For delegated permissions, ensure the user has access to the Teams data being requested
- For more details, see the [Microsoft Graph permissions reference](https://learn.microsoft.com/en-us/graph/permissions-reference)

6. **(Optional) Restrict to Specific Channels**
   - Set `TEAMS_CHANNELS` to a comma-separated list of channel names

### Jira API
1. Go to https://id.atlassian.com/manage-profile/security/api-tokens
2. Click "Create API token"
3. Give it a label (e.g., "Activity Summary App")
4. Copy the generated token to `JIRA_API_TOKEN` in `.env.local`
5. Add your Jira email to `JIRA_EMAIL` in `.env.local`
6. Set your Jira instance URL in `JIRA_BASE_URL` in `.env.local`
7. Optionally specify project keys in `JIRA_PROJECT_KEYS` (comma-separated)
8. Optionally specify issue types in `JIRA_ISSUE_TYPES` (comma-separated)

## Usage

### Basic Usage
```bash
# Generate summary for a date range
pnpm run generate --start-date 2024-01-01 --end-date 2024-01-31

# Generate summary for today
pnpm run generate:today

# Generate summary for the last week
pnpm run generate:week

# Generate summary for the last month
pnpm run generate:month

# Generate and save to file
pnpm run generate --start-date 2024-01-01 --end-date 2024-01-31 --output ./summary.json

# Using the new --period option (recommended)
pnpm run generate --period today
pnpm run generate --period week --output ./summary.json
pnpm run generate --period month
```

### Command Line Options

The application supports two ways to specify date ranges:

#### Using `--period` (Recommended)
```bash
# Quick options for common time periods
node dist/main --period today
node dist/main --period week
node dist/main --period month
```

#### Using `--start-date` and `--end-date`
```bash
# Custom date ranges
node dist/main --start-date 2024-01-01 --end-date 2024-01-31
```

#### Output Options
```bash
# Save output to file
node dist/main --period today --output ./summary.json
```

### Development
```bash
# Run in development mode
pnpm run generate:dev --start-date 2024-01-01 --end-date 2024-01-31
```

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

The GitLab integration tracks the following activities:

### Commits
- Code commits with commit messages and author information
- Direct links to commit details in GitLab
- Project and branch information
- Commit timestamps and short IDs

### Merge Requests
- Created, merged, and closed merge requests
- MR titles, descriptions, and status information
- Source and target branch details
- Author and assignee information
- Direct links to merge requests

### Issues
- Created and closed issues
- Issue titles, descriptions, and labels
- Milestone information when available
- Author and assignee details
- Direct links to issues

### Comments
- Comments on commits, merge requests, and issues
- Comment content and author information
- Direct links to specific comments
- Project context for each comment

## Teams Activity Types

The Teams integration tracks the following activities for the specified user:

### Messages
- Channel messages sent by the specified user
- Message content, author, and timestamps
- Direct links to messages in Teams
- Filtered by `TEAMS_EMAIL` configuration

### Calls
- Teams call records where the user was organizer or participant
- Call subject and organizer information
- Join URLs for recorded calls
- Filtered by `TEAMS_EMAIL` configuration

### Calendar Events
- Calendar events from the specified user's calendar
- Event details, attendees, and duration
- Online meeting information when available
- Direct links to calendar events
- User-specific calendar access via `TEAMS_EMAIL`
