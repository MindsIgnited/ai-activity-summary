import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { AppService } from './app.service';
import { AiSummaryService } from './services/ai-summary.service';
import { Logger, LogLevel } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';

function calculateDates(period: string): { startDate: Date; endDate: Date } {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  switch (period.toLowerCase()) {
    case 'today': {
      const end = new Date(today);
      end.setHours(23, 59, 59, 999);
      return { startDate: today, endDate: end };
    }
    case 'week': {
      const weekAgo = new Date(today);
      weekAgo.setDate(today.getDate() - 7);
      const end = new Date(today);
      end.setHours(23, 59, 59, 999);
      return { startDate: weekAgo, endDate: end };
    }
    case 'month': {
      const monthAgo = new Date(today);
      monthAgo.setDate(today.getDate() - 30);
      const end = new Date(today);
      end.setHours(23, 59, 59, 999);
      return { startDate: monthAgo, endDate: end };
    }
    default:
      throw new Error(`Invalid period: ${period}. Use 'today', 'week', or 'month'`);
  }
}

const DEFAULT_OUTPUT_DIR = 'summaries';

async function bootstrap() {
  // Configure logger levels based on LOG_LEVEL env
  const logLevel = process.env.LOG_LEVEL || 'log';
  const logLevels: LogLevel[] =
    logLevel === 'verbose'
      ? ['error', 'warn', 'log', 'debug', 'verbose']
      : logLevel === 'debug'
        ? ['error', 'warn', 'log', 'debug']
        : logLevel === 'log' || logLevel === 'info'
          ? ['error', 'warn', 'log']
          : ['error', 'warn'];

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: logLevels,
  });
  const appService = app.get(AppService);
  const aiSummaryService = app.get(AiSummaryService);

  // Parse command line arguments
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`
Activity Summary Generator

Usage:
  pnpm start --period PERIOD [--output path/to/file]
  pnpm start --start-date YYYY-MM-DD --end-date YYYY-MM-DD [--output path/to/file]

AI Summary Generation:
  pnpm start --ai-summary --date YYYY-MM-DD [--format json|txt|md] [--provider openai|anthropic|gemini|ollama|huggingface]
  pnpm start --ai-summary --period PERIOD [--format json|txt|md] [--provider openai|anthropic|gemini|ollama|huggingface]
  pnpm start --ai-summary --start-date YYYY-MM-DD --end-date YYYY-MM-DD [--format json|txt|md] [--provider openai|anthropic|gemini|ollama|huggingface]

Options:
  --period        Time period: 'today', 'week', or 'month' (mutually exclusive with --start-date/--end-date)
  --start-date    Start date in YYYY-MM-DD format
  --end-date      End date in YYYY-MM-DD format
  --output        Output file path (optional)
  --ai-summary    Generate AI-powered human-readable summaries
  --date          Specific date for AI summary (YYYY-MM-DD format)
  --format        Output format for AI summaries: json, txt, or md (default: json)
  --provider      AI provider to use: openai, anthropic, gemini, ollama, huggingface, openwebui (auto-selects if not specified)
  --list-providers Show available AI providers
  --help, -h      Show this help message

Examples:
  # Generate activity data
  pnpm start --period today
  pnpm start --period week --output ./summary.json
  pnpm start --period month
  pnpm start --start-date 2024-01-01 --end-date 2024-01-31

  # Generate AI summaries
  pnpm start --ai-summary --date 2024-01-15
  pnpm start --ai-summary --date 2024-01-15 --format txt
  pnpm start --ai-summary --period week --format md
  pnpm start --ai-summary --start-date 2024-01-01 --end-date 2024-01-31 --format json
  pnpm start --ai-summary --date 2024-01-15 --provider openai --format txt
  pnpm start --ai-summary --period week --provider anthropic --format md
  pnpm start --ai-summary --date 2024-01-15 --provider openwebui --format txt
  pnpm start --ai-summary --list-providers
    `);
    await app.close();
    return;
  }

  try {
    // Check if this is an AI summary request
    const isAiSummary = args.includes('--ai-summary');

    if (isAiSummary) {
      await handleAiSummary(args, aiSummaryService);
    } else {
      await handleActivitySummary(args, appService);
    }
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  } finally {
    await app.close();
  }
}

async function handleAiSummary(args: string[], aiSummaryService: AiSummaryService) {
  const dateIndex = args.indexOf('--date');
  const periodIndex = args.indexOf('--period');
  const startDateIndex = args.indexOf('--start-date');
  const endDateIndex = args.indexOf('--end-date');
  const formatIndex = args.indexOf('--format');
  const providerIndex = args.indexOf('--provider');
  const outputIndex = args.indexOf('--output');

  const format = formatIndex !== -1 ? args[formatIndex + 1] as 'json' | 'txt' | 'md' : 'json';
  const provider = providerIndex !== -1 ? args[providerIndex + 1] : undefined;
  const outputPathArg = outputIndex !== -1 ? args[outputIndex + 1] : undefined;

  if (!['json', 'txt', 'md'].includes(format)) {
    throw new Error('Invalid format. Use json, txt, or md');
  }

  // Show available providers if requested
  if (args.includes('--list-providers')) {
    const availableProviders = aiSummaryService.getAvailableProviders();
    console.log('Available AI providers:');
    if (availableProviders.length === 0) {
      console.log('  No providers configured. Add API keys to use AI summaries.');
    } else {
      availableProviders.forEach(p => console.log(`  - ${p}`));
    }
    return;
  }

  // Ensure output directory exists
  await fs.mkdir(DEFAULT_OUTPUT_DIR, { recursive: true });

  if (dateIndex !== -1) {
    // Single date AI summary
    const date = args[dateIndex + 1];
    if (!date) {
      throw new Error('--date requires a value (YYYY-MM-DD)');
    }

    console.log(`Generating AI summary for ${date}${provider ? ` using ${provider}` : ''}`);
    const summary = await aiSummaryService.generateDailySummary(date, provider);

    if (summary) {
      let filePath: string;
      if (outputPathArg) {
        filePath = await aiSummaryService.saveSummary(summary, format, outputPathArg);
      } else {
        // Default file name: ai-output/YYYY-MM-DD.{format}
        const ext = format === 'json' ? 'json' : format;
        filePath = path.join(DEFAULT_OUTPUT_DIR, `ai-summary-${date.replace(/-/g, '')}.${ext}`);
        await aiSummaryService.saveSummary(summary, format, filePath);
      }
      console.log(`AI summary saved to: ${outputPathArg || filePath}`);
      console.log('\n=== AI SUMMARY PREVIEW ===');
      console.log(summary.aiSummary);
    } else {
      console.log(`No activities found for ${date}`);
    }
  } else if (periodIndex !== -1) {
    // Period-based AI summary
    const period = args[periodIndex + 1];
    if (!period) {
      throw new Error('--period requires a value (today, week, or month)');
    }

    const dates = calculateDates(period);
    const startDate = dates.startDate.toISOString().split('T')[0];
    const endDate = dates.endDate.toISOString().split('T')[0];

    console.log(`Generating AI summaries for period: ${startDate} to ${endDate}${provider ? ` using ${provider}` : ''}`);
    const summaries = await aiSummaryService.generateWeeklySummary(startDate, endDate, provider);

    if (summaries.length > 0) {
      for (const summary of summaries) {
        let filePath: string;
        if (outputPathArg) {
          filePath = await aiSummaryService.saveSummary(summary, format, outputPathArg);
        } else {
          const ext = format === 'json' ? 'json' : format;
          filePath = path.join(DEFAULT_OUTPUT_DIR, `ai-summary-${summary.date.replace(/-/g, '')}.${ext}`);
          await aiSummaryService.saveSummary(summary, format, filePath);
        }
        console.log(`AI summary for ${summary.date} saved to: ${outputPathArg || filePath}`);
      }
      console.log(`\nGenerated ${summaries.length} AI summaries`);
    } else {
      console.log('No activities found for the specified period');
    }
  } else if (startDateIndex !== -1 && endDateIndex !== -1) {
    // Date range AI summary
    const startDate = args[startDateIndex + 1];
    const endDate = args[endDateIndex + 1];

    if (!startDate || !endDate) {
      throw new Error('Both --start-date and --end-date require values (YYYY-MM-DD)');
    }

    console.log(`Generating AI summaries for period: ${startDate} to ${endDate}${provider ? ` using ${provider}` : ''}`);
    const summaries = await aiSummaryService.generateWeeklySummary(startDate, endDate, provider);

    if (summaries.length > 0) {
      for (const summary of summaries) {
        let filePath: string;
        if (outputPathArg) {
          filePath = await aiSummaryService.saveSummary(summary, format, outputPathArg);
        } else {
          const ext = format === 'json' ? 'json' : format;
          filePath = path.join(DEFAULT_OUTPUT_DIR, `ai-summary-${summary.date.replace(/-/g, '')}.${ext}`);
          await aiSummaryService.saveSummary(summary, format, filePath);
        }
        console.log(`AI summary for ${summary.date} saved to: ${outputPathArg || filePath}`);
      }
      console.log(`\nGenerated ${summaries.length} AI summaries`);
    } else {
      console.log('No activities found for the specified period');
    }
  } else {
    throw new Error('AI summary requires --date, --period, or --start-date/--end-date');
  }
}

async function handleActivitySummary(args: string[], appService: AppService) {
  let startDate: Date;
  let endDate: Date;
  const outputIndex = args.indexOf('--output');
  const outputPathArg = outputIndex !== -1 ? args[outputIndex + 1] : undefined;

  // Check if using --period or --start-date/--end-date
  const periodIndex = args.indexOf('--period');
  const startDateIndex = args.indexOf('--start-date');
  const endDateIndex = args.indexOf('--end-date');

  if (periodIndex !== -1) {
    // Using --period option
    if (startDateIndex !== -1 || endDateIndex !== -1) {
      throw new Error('--period cannot be used with --start-date or --end-date');
    }

    const period = args[periodIndex + 1];
    if (!period) {
      throw new Error('--period requires a value (today, week, or month)');
    }

    const dates = calculateDates(period);
    startDate = dates.startDate;
    endDate = dates.endDate;
  } else {
    // Using --start-date and --end-date
    if (startDateIndex === -1 || endDateIndex === -1) {
      throw new Error('Either --period or both --start-date and --end-date are required');
    }

    startDate = new Date(args[startDateIndex + 1]);
    endDate = new Date(args[endDateIndex + 1]);
    endDate.setHours(23, 59, 59, 999);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      throw new Error('Invalid date format. Use YYYY-MM-DD');
    }

    if (startDate > endDate) {
      throw new Error('Start date must be before or equal to end date');
    }
  }

  console.log(`Generating activity summary from ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`);

  // Ensure output directory exists
  await fs.mkdir(DEFAULT_OUTPUT_DIR, { recursive: true });

  // Generate summary
  let outputPath: string | undefined = outputPathArg;
  if (!outputPathArg) {
    // Default file name: ai-output/YYYY-MM-DD.json or ai-output/YYYY-MM-DD_YYYY-MM-DD.json
    if (startDate.toISOString().split('T')[0] === endDate.toISOString().split('T')[0]) {
      outputPath = path.join(DEFAULT_OUTPUT_DIR, `${startDate.toISOString().split('T')[0]}.json`);
    } else {
      outputPath = path.join(
        DEFAULT_OUTPUT_DIR,
        `${startDate.toISOString().split('T')[0]}_${endDate.toISOString().split('T')[0]}.json`
      );
    }
  }

  const summaries = await appService.generateActivitySummary(startDate, endDate, outputPath);

  // Get and display statistics
  const stats = await appService.getSummaryStats(summaries);

  console.log('\n=== SUMMARY STATISTICS ===');
  console.log(`Total Days: ${stats.totalDays}`);
  console.log(`Total Activities: ${stats.totalActivities}`);
  console.log(`Average Activities per Day: ${stats.averageActivitiesPerDay.toFixed(2)}`);
  console.log(`Most Active Day: ${stats.mostActiveDay}`);
  console.log(`Most Active Author: ${stats.mostActiveAuthor || 'N/A'}`);

  if (outputPath) {
    console.log(`\nSummary written to: ${outputPath}`);
  }
}

bootstrap();
