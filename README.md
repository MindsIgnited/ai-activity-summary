<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

## Project setup

```bash
$ pnpm install
```

## Compile and run the project

```bash
# development
$ pnpm run start

# watch mode
$ pnpm run start:dev

# production mode
$ pnpm run start:prod
```

## Run tests

```bash
# unit tests
$ pnpm run test

# e2e tests
$ pnpm run test:e2e

# test coverage
$ pnpm run test:cov
```

## Deployment

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ pnpm install -g @nestjs/mau
$ mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).

# Activity Summary

A NestJS data processing application that fetches activity data from multiple APIs (GitLab, Slack, Teams, Jira) and generates daily summary reports. The application runs as a command-line tool rather than a web server.

## Features

- **Multi-API Integration**: Fetch activities from GitLab, Slack, Microsoft Teams, and Jira
- **Configurable Integrations**: Enable/disable individual APIs via environment variables
- **Flexible Date Ranges**: Generate summaries for today, week, month, or custom date ranges
- **Comprehensive Logging**: Detailed logging for debugging and monitoring
- **Error Handling**: Graceful error handling with fallback mechanisms
- **TypeScript**: Full TypeScript support with strict typing

## Project Setup

```bash
$ pnpm install
```

## Environment Configuration

Copy the example environment file and configure your API credentials:

```bash
$ cp env.example .env.local
```

Edit `.env.local` with your actual API credentials. See [SETUP.md](./SETUP.md) for detailed configuration instructions.

## Usage

### Generate Activity Summaries

```bash
# Generate summary for today
$ pnpm run generate:today

# Generate summary for the last week
$ pnpm run generate:week

# Generate summary for the last month
$ pnpm run generate:month

# Generate summary for custom date range
$ pnpm run generate --start-date 2024-01-01 --end-date 2024-01-31

# Generate and save to file
$ pnpm run generate --start-date 2024-01-01 --end-date 2024-01-31 --output ./summary.json

# Using the new --period option (recommended)
$ pnpm run generate --period today
$ pnpm run generate --period week --output ./summary.json
$ pnpm run generate --period month
```

### Command Line Options

The application supports two ways to specify date ranges:

#### Using `--period` (Recommended)
```bash
# Quick options for common time periods
$ node dist/main --period today
$ node dist/main --period week
$ node dist/main --period month
```

#### Using `--start-date` and `--end-date`
```bash
# Custom date ranges
$ node dist/main --start-date 2024-01-01 --end-date 2024-01-31
```

#### Output Options
```bash
# Save output to file
$ node dist/main --period today --output ./summary.json
```

### Development

```bash
# Run in development mode
$ pnpm run generate:dev --period today

# Build the application
$ pnpm run build

# Format code
$ pnpm run format

# Lint code
$ pnpm run lint
```

## Debugging

This project includes comprehensive VS Code debugging configurations. Open the project in VS Code and use the debug panel to:

### Debug Configurations Available:

1. **Debug Activity Summary (Today)** - Debug with today's date range
2. **Debug Activity Summary (Week)** - Debug with last 7 days
3. **Debug Activity Summary (Month)** - Debug with last 30 days
4. **Debug Activity Summary (Custom Range)** - Debug with custom date range
5. **Debug Activity Summary (With Output)** - Debug and save output to file
6. **Debug Tests** - Debug all tests
7. **Debug Specific Test** - Debug specific test patterns

### How to Debug:

1. Set breakpoints in your TypeScript files
2. Select a debug configuration from the Run and Debug panel
3. Press F5 or click the green play button
4. Use the debug console to inspect variables and step through code

### Debug Features:

- **Source Maps**: Full TypeScript debugging with source maps
- **Variable Inspection**: Inspect all variables and objects
- **Call Stack**: Navigate through the call stack
- **Watch Expressions**: Monitor specific expressions
- **Conditional Breakpoints**: Set breakpoints with conditions
- **Logpoints**: Add logging without code changes

## Testing

```bash
# Run all tests
$ pnpm run test

# Run tests in watch mode
$ pnpm run test:watch

# Run tests with coverage
$ pnpm run test:cov

# Run e2e tests
$ pnpm run test:e2e
```

## API Integrations

### GitLab
- Commits, merge requests, issues, and comments
- Configurable project IDs
- Supports both GitLab.com and self-hosted instances

### Slack
- Channel messages and reactions
- Configurable channels
- Bot token authentication

### Microsoft Teams
- Channel messages, calls, and calendar events
- User-specific filtering by email
- Microsoft Graph API integration

### Jira
- Issues, comments, and work logs
- Configurable project keys and issue types
- Basic authentication

## AI Providers

The application supports multiple AI providers for generating human-readable summaries:

### OpenAI
- GPT-4, GPT-3.5, and other OpenAI models
- Requires OpenAI API key
- High-quality, professional summaries

### Anthropic (Claude)
- Claude 3 Haiku, Sonnet, and Opus models
- Requires Anthropic API key
- Excellent for detailed analysis

### Google Gemini
- Gemini 1.5 Flash and other Gemini models
- Requires Google API key
- Fast and cost-effective

### Ollama (Local)
- Local LLM models (Llama2, Mistral, etc.)
- No API key required
- Privacy-focused, runs locally

### Hugging Face
- Various open-source models
- Requires Hugging Face API key
- Customizable model selection

### Open WebUI
- Local or remote Open WebUI instances
- OpenAI-compatible API endpoint
- Supports any model available in Open WebUI
- Optional API key for authentication

### Provider Selection
The application automatically selects the first available provider, or you can specify one:
```bash
# Use specific provider
pnpm run ai-summary:today --provider openai
pnpm run ai-summary:today --provider openwebui

# List available providers
pnpm run ai-summary --list-providers
```

## Configuration

### Enable/Disable Integrations

Control which APIs to use via environment variables:

```bash
# Enable only GitLab and Slack
GITLAB_ENABLED=true
SLACK_ENABLED=true
TEAMS_ENABLED=false
JIRA_ENABLED=false
```

### Environment File Precedence

1. `.env.local` (highest priority) - Your local secrets
2. `.env` (medium priority) - Default configuration
3. System environment variables (lowest priority) - Runtime overrides

### Output Directory Configuration

The application uses separate directories for different types of output:

- **Activity Data**: Raw activity data from APIs (default: `activities/`)
- **AI Summaries**: Generated AI-powered summaries (default: `ai-summaries/`)

You can customize these directories using environment variables:

```bash
# Customize output directories
ACTIVITIES_OUTPUT_DIR=my-activities
AI_SUMMARIES_OUTPUT_DIR=my-ai-summaries
```

#### Directory Structure

```
activities/                    # Raw activity data
├── 2024-01-15.activity.json          # Single day summary
├── 2024-01-01_2024-01-31.activity.json  # Date range summary
└── all.activity.json          # Combined summary file

ai-summaries/                 # AI-generated summaries
├── ai-summary-20240115.txt   # Text format
├── ai-summary-20240115.md    # Markdown format
└── ai-summary-20240115.json  # JSON format
```

## Output Format

The application generates JSON summaries with the following structure:

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

## Documentation

- [Setup Guide](./SETUP.md) - Detailed setup and configuration instructions
- [API Documentation](./SETUP.md#api-setup-instructions) - API integration setup
- [Environment Configuration](./SETUP.md#environment-configuration) - Environment variable reference

## License

This project is [MIT licensed](LICENSE).

## Microsoft Teams Integration: Azure AD Permissions

To use the Teams integration, you must register an Azure AD application and grant the correct Microsoft Graph API permissions. See [SETUP.md](./SETUP.md#microsoft-teams-api) for a full step-by-step guide.

**Required Microsoft Graph API Application Permissions:**
- ChannelMessage.Read.All
- Chat.Read.All
- CallRecords.Read.All
- OnlineMeetings.Read.All
- Calendars.Read
- User.Read.All
- Team.ReadBasic.All
- Group.Read.All

After adding these permissions, click **Grant admin consent** in the Azure Portal. Then configure your `.env.local` with the app's client ID, secret, and tenant ID.
