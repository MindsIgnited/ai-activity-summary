import { formatActivityDescription } from './string.utils';

export interface ActivityData {
  id: string;
  type: 'gitlab' | 'slack' | 'teams' | 'jira';
  timestamp: string;
  title: string;
  description?: string;
  author?: string;
  url?: string;
  metadata?: Record<string, any>;
}

/**
 * Builds a standardized prompt for AI providers
 * @param activities Array of activities to summarize
 * @param date Date string for the summary
 * @returns Formatted prompt string
 */
export function buildStandardPrompt(activities: ActivityData[], date: string): string {
  const activityText = activities.map(activity => {
    const time = new Date(activity.timestamp).toLocaleTimeString();
    const type = activity.type.toUpperCase();
    const author = activity.author ? ` (by ${activity.author})` : '';
    const description = formatActivityDescription(activity.description, 300);
    return `[${time}] ${type}: ${activity.title}${author}${description}`;
  }).join('\n');

  return `Create a comprehensive daily activity summary for ${date} based on the following activities:

${activityText}

Please provide a structured summary that includes:

## 📊 Executive Summary
- Total activities and key metrics
- Most productive time periods
- Primary focus areas

## 🎯 Key Accomplishments
- Major milestones achieved
- Completed tasks and deliverables
- Significant progress made

## 🤝 Collaboration & Communication
- Team interactions and meetings
- Cross-functional work
- Communication patterns

## 📈 Productivity Insights
- Time allocation analysis
- Work patterns and trends
- Efficiency observations

## ⚠️ Areas of Attention
- Potential blockers or delays
- Items requiring follow-up
- Areas needing support or resources

## 🎯 Action Items & Recommendations
- Next steps and priorities
- Suggested improvements
- Follow-up actions needed

Keep the summary professional, actionable, and suitable for stakeholders. Use clear headings, bullet points, and concise language. Focus on insights that add value beyond just listing activities.`;
}

/**
 * Base class for AI providers to reduce code duplication
 */
export abstract class BaseAiProvider {
  abstract name: string;
  abstract generateSummary(activities: ActivityData[], date: string): Promise<string>;

  protected buildPrompt(activities: ActivityData[], date: string): string {
    return buildStandardPrompt(activities, date);
  }
}
