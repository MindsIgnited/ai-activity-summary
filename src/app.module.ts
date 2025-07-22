import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppService } from './app.service';
import { JiraService } from './services/jira.service';
import { TeamsService } from './services/teams.service';
import { GitLabService } from './services/gitlab.service';
import { SlackService } from './services/slack.service';
import { AiSummaryService } from './services/ai-summary.service';
import { AiProviderService } from './services/ai-provider.service';
import { ConfigurationService } from './config/api.config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
      ignoreEnvFile: false,
    }),
  ],
  controllers: [],
  providers: [
    AppService,
    JiraService,
    TeamsService,
    GitLabService,
    SlackService,
    AiProviderService,
    AiSummaryService,
    ConfigurationService,
  ],
})
export class AppModule { }
