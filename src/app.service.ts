import { Injectable, Logger } from '@nestjs/common';
import { JiraService } from './services/jira.service';
import { TeamsService } from './services/teams.service';
import { GitLabService } from './services/gitlab.service';
import { SlackService } from './services/slack.service';
import { BaseActivityService } from './services/base-activity.service';
import { ConfigurationService } from './config/api.config';
import { ErrorUtils } from './utils/error.utils';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface ActivityData {
  id: string;
  type: 'gitlab' | 'slack' | 'teams' | 'jira';
  timestamp: Date;
  title: string;
  description?: string;
  author?: string;
  url?: string;
  metadata?: Record<string, any>;
}

export interface DailySummary {
  date: string;
  activities: ActivityData[];
  summary: {
    totalActivities: number;
    byType: Record<string, number>;
    byAuthor: Record<string, number>;
  };
}

export interface InvoiceData {
  author: string;
  date: string;
  type: string;
  title: string;
  description?: string;
  url?: string;
  timeSpent?: number; // in minutes
  billable?: boolean;
  project?: string;
  category?: string;
}

@Injectable()
export class AppService {
  private readonly logger = new Logger(AppService.name);

  constructor(
    private readonly jiraService: JiraService,
    private readonly teamsService: TeamsService,
    private readonly gitlabService: GitLabService,
    private readonly slackService: SlackService,
    private readonly configService: ConfigurationService,
  ) { }

  async generateActivitySummary(
    startDate: Date,
    endDate: Date,
    outputPath?: string,
  ): Promise<DailySummary[]> {
    this.logger.log(`Generating activity summary from ${startDate.toISOString()} to ${endDate.toISOString()}`);

    // Preload data for all services before day-by-day iteration
    const services: Array<{ service: BaseActivityService; config: any; name: string }> = [
      { service: this.slackService as BaseActivityService, config: this.configService.getSlackConfig(), name: 'Slack' },
      { service: this.teamsService as BaseActivityService, config: this.configService.getTeamsConfig(), name: 'Teams' },
      { service: this.jiraService as BaseActivityService, config: this.configService.getJiraConfig(), name: 'Jira' },
      { service: this.gitlabService as BaseActivityService, config: this.configService.getGitLabConfig(), name: 'GitLab' },
    ];

    // Preload data for all enabled services
    this.logger.log('Preloading data for all services...');
    const preloadPromises = services
      .filter(({ config }) => config.enabled)
      .map(async ({ service, name }) => {
        try {
          await service.preload(startDate, endDate);
          this.logger.debug(`Completed preload for ${name}`);
        } catch (error) {
          this.logger.error(`Error preloading ${name} data:`, error);
        }
      });

    await Promise.all(preloadPromises);
    this.logger.log('Completed preload for all services');

    const summaries: DailySummary[] = [];
    const currentDate = new Date(startDate);

    while (currentDate <= endDate) {
      const dateStr = currentDate.toISOString().split('T')[0];
      const activities: ActivityData[] = [];

      // Fetch activities from all configured services
      for (const { service, config, name } of services) {
        if (config.enabled) {
          this.logger.debug(`Fetching ${name} activities`);
          try {
            const serviceActivities = await service.fetchActivities(currentDate);
            activities.push(...serviceActivities);
            this.logger.debug(`Found ${serviceActivities.length} ${name} activities for ${dateStr}`);
          } catch (error) {
            this.logger.error(`Error fetching ${name} activities for ${dateStr}:`, error);
          }
        } else {
          this.logger.debug(`${name} integration is disabled`);
        }
      }

      const summary = this.createDailySummary(currentDate, activities);
      summaries.push(summary);

      // Move to next day
      currentDate.setDate(currentDate.getDate() + 1);
    }

    if (outputPath) {
      await this.writeSummaryToFile(summaries, outputPath);
    }

    return summaries;
  }

  private async fetchDailyActivities(date: Date): Promise<ActivityData[]> {
    const activities: ActivityData[] = [];

    const services: Array<{ service: BaseActivityService; config: any; name: string }> = [
      { service: this.slackService as BaseActivityService, config: this.configService.getSlackConfig(), name: 'Slack' },
      { service: this.teamsService as BaseActivityService, config: this.configService.getTeamsConfig(), name: 'Teams' },
      { service: this.jiraService as BaseActivityService, config: this.configService.getJiraConfig(), name: 'Jira' },
      { service: this.gitlabService as BaseActivityService, config: this.configService.getGitLabConfig(), name: 'GitLab' },
    ];

    for (const { service, config, name } of services) {
      if (config.enabled) {
        this.logger.debug(`Fetching ${name} activities`);
        try {
          const serviceActivities = await service.fetchActivities(date);
          activities.push(...serviceActivities);
        } catch (error) {
          this.logger.error(`Error fetching ${name} activities:`, error);
        }
      } else {
        this.logger.debug(`${name} integration is disabled`);
      }
    }

    return activities;
  }

  private createDailySummary(date: Date, activities: ActivityData[]): DailySummary {
    const dateString = date.toISOString().split('T')[0];

    const byType: Record<string, number> = {};
    const byAuthor: Record<string, number> = {};

    activities.forEach(activity => {
      // Count by type
      byType[activity.type] = (byType[activity.type] || 0) + 1;

      // Count by author
      if (activity.author) {
        byAuthor[activity.author] = (byAuthor[activity.author] || 0) + 1;
      }
    });

    return {
      date: dateString,
      activities,
      summary: {
        totalActivities: activities.length,
        byType,
        byAuthor,
      },
    };
  }

  private async writeSummaryToFile(summaries: DailySummary[], outputPath: string): Promise<void> {
    try {
      // Ensure output directory exists
      const outputDir = path.dirname(outputPath);
      await fs.mkdir(outputDir, { recursive: true });

      const fileExtension = path.extname(outputPath).toLowerCase();
      const fileName = path.basename(outputPath).toLowerCase();

      // Check for invoice formats first
      if (fileName.includes('invoice') && fileExtension === '.json') {
        await this.writeInvoiceJsonFile(summaries, outputPath);
      } else if (fileName.includes('invoice') && fileExtension === '.csv') {
        await this.writeInvoiceCsvFile(summaries, outputPath);
      } else {
        // Regular formats
        switch (fileExtension) {
          case '.json':
            await this.writeJsonFile(summaries, outputPath);
            break;
          case '.csv':
            await this.writeCsvFile(summaries, outputPath);
            break;
          default:
            // Default to JSON if no extension or unknown extension
            const jsonPath = outputPath.endsWith('.json') ? outputPath : `${outputPath}.json`;
            await this.writeJsonFile(summaries, jsonPath);
        }
      }

      this.logger.log(`Successfully wrote summary to ${outputPath}`);
    } catch (error) {
      ErrorUtils.logError(this.logger, error as Error, 'write-summary-to-file', { outputPath });
      throw error;
    }
  }

  private async writeJsonFile(summaries: DailySummary[], outputPath: string): Promise<void> {
    const output = {
      generatedAt: new Date().toISOString(),
      dateRange: {
        start: summaries[0]?.date,
        end: summaries[summaries.length - 1]?.date,
      },
      totalDays: summaries.length,
      totalActivities: summaries.reduce((sum, day) => sum + day.summary.totalActivities, 0),
      summaries,
    };

    await fs.writeFile(outputPath, JSON.stringify(output, null, 2), 'utf8');
  }

  private async writeCsvFile(summaries: DailySummary[], outputPath: string): Promise<void> {
    const csvRows: string[] = [];

    // Header
    csvRows.push('Date,Type,Author,Title,Description,URL,Timestamp');

    // Data rows
    summaries.forEach(day => {
      day.activities.forEach(activity => {
        const row = [
          day.date,
          activity.type,
          activity.author || '',
          `"${activity.title.replace(/"/g, '""')}"`,
          `"${(activity.description || '').replace(/"/g, '""')}"`,
          activity.url || '',
          activity.timestamp.toISOString(),
        ];
        csvRows.push(row.join(','));
      });
    });

    await fs.writeFile(outputPath, csvRows.join('\n'), 'utf8');
  }

  private async writeInvoiceJsonFile(summaries: DailySummary[], outputPath: string): Promise<void> {
    const invoiceData: InvoiceData[] = [];

    summaries.forEach(day => {
      day.activities.forEach(activity => {
        const invoiceItem: InvoiceData = {
          author: activity.author || 'Unknown',
          date: day.date,
          type: activity.type,
          title: activity.title,
          description: activity.description,
          url: activity.url,
          timeSpent: this.estimateTimeSpent(activity),
          billable: this.isBillable(activity),
          project: this.extractProject(activity),
          category: this.categorizeActivity(activity),
        };
        invoiceData.push(invoiceItem);
      });
    });

    const output = {
      generatedAt: new Date().toISOString(),
      dateRange: {
        start: summaries[0]?.date,
        end: summaries[summaries.length - 1]?.date,
      },
      totalActivities: invoiceData.length,
      totalBillableHours: this.calculateTotalBillableHours(invoiceData),
      activities: invoiceData,
      summary: this.generateInvoiceSummary(invoiceData),
    };

    await fs.writeFile(outputPath, JSON.stringify(output, null, 2), 'utf8');
  }

  private async writeInvoiceCsvFile(summaries: DailySummary[], outputPath: string): Promise<void> {
    const csvRows: string[] = [];

    // Header
    csvRows.push('Author,Date,Type,Title,Description,URL,TimeSpent(minutes),Billable,Project,Category');

    // Data rows
    summaries.forEach(day => {
      day.activities.forEach(activity => {
        const timeSpent = this.estimateTimeSpent(activity);
        const billable = this.isBillable(activity);
        const project = this.extractProject(activity);
        const category = this.categorizeActivity(activity);

        const row = [
          activity.author || 'Unknown',
          day.date,
          activity.type,
          `"${activity.title.replace(/"/g, '""')}"`,
          `"${(activity.description || '').replace(/"/g, '""')}"`,
          activity.url || '',
          timeSpent || '',
          billable ? 'Yes' : 'No',
          project || '',
          category || '',
        ];
        csvRows.push(row.join(','));
      });
    });

    await fs.writeFile(outputPath, csvRows.join('\n'), 'utf8');
  }

  private estimateTimeSpent(activity: ActivityData): number | undefined {
    // Estimate time spent based on activity type
    switch (activity.type) {
      case 'gitlab':
        if (activity.metadata?.type === 'commit') return 15; // 15 minutes per commit
        if (activity.metadata?.type === 'merge_request') return 60; // 1 hour per MR
        if (activity.metadata?.type === 'issue') return 30; // 30 minutes per issue
        return 20; // Default 20 minutes
      case 'jira':
        if (activity.metadata?.type === 'issue_created') return 30;
        if (activity.metadata?.type === 'issue_updated') return 15;
        if (activity.metadata?.type === 'comment') return 10;
        return 20;
      case 'slack':
        return 5; // 5 minutes per message
      case 'teams':
        return 5; // 5 minutes per message
      default:
        return 15; // Default 15 minutes
    }
  }

  private isBillable(activity: ActivityData): boolean {
    // Determine if activity is billable
    switch (activity.type) {
      case 'gitlab':
        return true; // GitLab activities are typically billable
      case 'jira':
        return true; // Jira activities are typically billable
      case 'slack':
        // Slack messages might not always be billable
        return activity.metadata?.channel?.includes('project') ||
          activity.metadata?.channel?.includes('dev') ||
          activity.metadata?.channel?.includes('team');
      case 'teams':
        // Teams messages might not always be billable
        return activity.metadata?.channel?.includes('project') ||
          activity.metadata?.channel?.includes('dev') ||
          activity.metadata?.channel?.includes('team');
      default:
        return true;
    }
  }

  private extractProject(activity: ActivityData): string | undefined {
    // Extract project information from activity
    if (activity.metadata?.project) return activity.metadata.project;
    if (activity.metadata?.repository) return activity.metadata.repository;
    if (activity.metadata?.channel) return activity.metadata.channel;
    if (activity.url) {
      // Try to extract project from URL
      const urlMatch = activity.url.match(/\/([^\/]+)\/([^\/]+)/);
      if (urlMatch) return `${urlMatch[1]}/${urlMatch[2]}`;
    }
    return undefined;
  }

  private categorizeActivity(activity: ActivityData): string {
    // Categorize activity for invoicing
    switch (activity.type) {
      case 'gitlab':
        if (activity.metadata?.type === 'commit') return 'Development';
        if (activity.metadata?.type === 'merge_request') return 'Code Review';
        if (activity.metadata?.type === 'issue') return 'Issue Management';
        return 'Development';
      case 'jira':
        if (activity.metadata?.type === 'issue_created') return 'Project Management';
        if (activity.metadata?.type === 'issue_updated') return 'Project Management';
        if (activity.metadata?.type === 'comment') return 'Communication';
        return 'Project Management';
      case 'slack':
      case 'teams':
        return 'Communication';
      default:
        return 'General';
    }
  }

  private calculateTotalBillableHours(invoiceData: InvoiceData[]): number {
    const totalMinutes = invoiceData
      .filter(item => item.billable && item.timeSpent)
      .reduce((sum, item) => sum + (item.timeSpent || 0), 0);
    return Math.round((totalMinutes / 60) * 100) / 100; // Round to 2 decimal places
  }

  private generateInvoiceSummary(invoiceData: InvoiceData[]): {
    byAuthor: Record<string, { totalActivities: number; totalHours: number; billableHours: number }>;
    byCategory: Record<string, { totalActivities: number; totalHours: number }>;
    byProject: Record<string, { totalActivities: number; totalHours: number }>;
  } {
    const byAuthor: Record<string, { totalActivities: number; totalHours: number; billableHours: number }> = {};
    const byCategory: Record<string, { totalActivities: number; totalHours: number }> = {};
    const byProject: Record<string, { totalActivities: number; totalHours: number }> = {};

    invoiceData.forEach(item => {
      const hours = (item.timeSpent || 0) / 60;

      // By author
      if (!byAuthor[item.author]) {
        byAuthor[item.author] = { totalActivities: 0, totalHours: 0, billableHours: 0 };
      }
      byAuthor[item.author].totalActivities++;
      byAuthor[item.author].totalHours += hours;
      if (item.billable) {
        byAuthor[item.author].billableHours += hours;
      }

      // By category
      const category = item.category || 'General';
      if (!byCategory[category]) {
        byCategory[category] = { totalActivities: 0, totalHours: 0 };
      }
      byCategory[category].totalActivities++;
      byCategory[category].totalHours += hours;

      // By project
      const project = item.project || 'Unknown';
      if (!byProject[project]) {
        byProject[project] = { totalActivities: 0, totalHours: 0 };
      }
      byProject[project].totalActivities++;
      byProject[project].totalHours += hours;
    });

    // Round hours to 2 decimal places
    Object.values(byAuthor).forEach(author => {
      author.totalHours = Math.round(author.totalHours * 100) / 100;
      author.billableHours = Math.round(author.billableHours * 100) / 100;
    });
    Object.values(byCategory).forEach(category => {
      category.totalHours = Math.round(category.totalHours * 100) / 100;
    });
    Object.values(byProject).forEach(project => {
      project.totalHours = Math.round(project.totalHours * 100) / 100;
    });

    return { byAuthor, byCategory, byProject };
  }

  async getSummaryStats(summaries: DailySummary[]): Promise<{
    totalDays: number;
    totalActivities: number;
    averageActivitiesPerDay: number;
    mostActiveDay: string;
    mostActiveAuthor: string;
  }> {
    if (summaries.length === 0) {
      return {
        totalDays: 0,
        totalActivities: 0,
        averageActivitiesPerDay: 0,
        mostActiveDay: '',
        mostActiveAuthor: '',
      };
    }

    const totalActivities = summaries.reduce((sum, day) => sum + day.summary.totalActivities, 0);
    const averageActivitiesPerDay = totalActivities / summaries.length;

    const mostActiveDay = summaries.reduce((max, day) =>
      day.summary.totalActivities > max.summary.totalActivities ? day : max
    ).date;

    // Find most active author across all days
    const authorCounts: Record<string, number> = {};
    summaries.forEach(day => {
      Object.entries(day.summary.byAuthor).forEach(([author, count]) => {
        authorCounts[author] = (authorCounts[author] || 0) + count;
      });
    });

    const mostActiveAuthor = Object.entries(authorCounts).reduce((max, [author, count]) =>
      count > max.count ? { author, count } : max
      , { author: '', count: 0 }).author;

    return {
      totalDays: summaries.length,
      totalActivities,
      averageActivitiesPerDay,
      mostActiveDay,
      mostActiveAuthor,
    };
  }
}
