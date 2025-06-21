import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiProviderService, ActivityData } from './ai-provider.service';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface ActivitySummary {
  date: string;
  activities: ActivityData[];
  summary: {
    totalActivities: number;
    byType: Record<string, number>;
    byAuthor: Record<string, number>;
  };
}

export interface DailySummaryOutput {
  date: string;
  aiSummary: string;
  activities: ActivityData[];
  statistics: {
    totalActivities: number;
    byType: Record<string, number>;
    byAuthor: Record<string, number>;
  };
}

@Injectable()
export class AiSummaryService {
  private readonly logger = new Logger(AiSummaryService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly aiProviderService: AiProviderService,
  ) { }

  async generateDailySummary(date: string, providerName?: string): Promise<DailySummaryOutput | null> {
    try {
      this.logger.log(`Generating AI summary for ${date}`);

      // Read all activity files for the date
      const activities = await this.loadActivitiesForDate(date);

      if (activities.length === 0) {
        this.logger.debug(`No activities found for ${date}`);
        return null;
      }

      // Generate AI summary using the provider service
      const aiSummary = await this.aiProviderService.generateSummary(activities, date, providerName);

      // Calculate statistics
      const statistics = this.calculateStatistics(activities);

      return {
        date,
        aiSummary,
        activities,
        statistics,
      };
    } catch (error) {
      this.logger.error(`Failed to generate AI summary for ${date}:`, error);
      return null;
    }
  }

  async generateWeeklySummary(startDate: string, endDate: string, providerName?: string): Promise<DailySummaryOutput[]> {
    const summaries: DailySummaryOutput[] = [];
    const start = new Date(startDate);
    const end = new Date(endDate);

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0];
      const summary = await this.generateDailySummary(dateStr, providerName);
      if (summary) {
        summaries.push(summary);
      }
    }

    return summaries;
  }

  getAvailableProviders(): string[] {
    return this.aiProviderService.getAvailableProviders();
  }

  private async loadActivitiesForDate(date: string): Promise<ActivityData[]> {
    const activities: ActivityData[] = [];
    const outputDir = path.join(process.cwd(), 'output');

    try {
      const files = await fs.readdir(outputDir);
      const jsonFiles = files.filter(file => file.endsWith('.summary.json'));

      for (const file of jsonFiles) {
        try {
          const filePath = path.join(outputDir, file);
          const content = await fs.readFile(filePath, 'utf-8');
          const data = JSON.parse(content);

          // Find activities for the specific date
          if (data.summaries && Array.isArray(data.summaries)) {
            const daySummary = data.summaries.find((s: ActivitySummary) => s.date === date);
            if (daySummary && daySummary.activities) {
              activities.push(...daySummary.activities);
            }
          }
        } catch (error) {
          this.logger.warn(`Failed to read file ${file}:`, error);
        }
      }
    } catch (error) {
      this.logger.error('Failed to read output directory:', error);
    }

    return activities;
  }

  private calculateStatistics(activities: ActivityData[]) {
    return {
      totalActivities: activities.length,
      byType: this.groupByType(activities),
      byAuthor: this.groupByAuthor(activities),
    };
  }

  private groupByType(activities: ActivityData[]): Record<string, number> {
    return activities.reduce((acc, activity) => {
      acc[activity.type] = (acc[activity.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }

  private groupByAuthor(activities: ActivityData[]): Record<string, number> {
    return activities.reduce((acc, activity) => {
      if (activity.author) {
        acc[activity.author] = (acc[activity.author] || 0) + 1;
      }
      return acc;
    }, {} as Record<string, number>);
  }

  async saveSummary(summary: DailySummaryOutput, format: 'json' | 'txt' | 'md' = 'json'): Promise<string> {
    const outputDir = path.join(process.cwd(), 'output');
    const dateStr = summary.date.replace(/-/g, '');
    let filename: string;
    let content: string;

    switch (format) {
      case 'json':
        filename = `ai-summary-${dateStr}.json`;
        content = JSON.stringify(summary, null, 2);
        break;
      case 'txt':
        filename = `ai-summary-${dateStr}.txt`;
        content = summary.aiSummary;
        break;
      case 'md':
        filename = `ai-summary-${dateStr}.md`;
        content = this.convertToMarkdown(summary);
        break;
      default:
        throw new Error(`Unsupported format: ${format}`);
    }

    const filePath = path.join(outputDir, filename);
    await fs.writeFile(filePath, content, 'utf-8');

    this.logger.log(`AI summary saved to ${filename}`);
    return filePath;
  }

  private convertToMarkdown(summary: DailySummaryOutput): string {
    let md = `# Daily Activity Summary - ${summary.date}\n\n`;
    md += summary.aiSummary.replace(/\n/g, '\n\n');
    md += '\n\n---\n\n';
    md += `*Generated on ${new Date().toISOString()}*\n`;
    return md;
  }
}
