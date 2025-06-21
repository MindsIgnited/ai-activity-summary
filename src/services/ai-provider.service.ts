import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface AiProvider {
  name: string;
  generateSummary(activities: ActivityData[], date: string): Promise<string>;
}

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

@Injectable()
export class AiProviderService {
  private readonly logger = new Logger(AiProviderService.name);
  private providers: Map<string, AiProvider> = new Map();

  constructor(private readonly configService: ConfigService) {
    this.initializeProviders();
  }

  private initializeProviders() {
    // Register OpenAI provider
    if (this.configService.get<string>('OPENAI_API_KEY')) {
      this.providers.set('openai', new OpenAiProvider(this.configService));
      this.logger.debug('OpenAI provider registered');
    }

    // Register Anthropic provider
    if (this.configService.get<string>('ANTHROPIC_API_KEY')) {
      this.providers.set('anthropic', new AnthropicProvider(this.configService));
      this.logger.debug('Anthropic provider registered');
    }

    // Register Google Gemini provider
    if (this.configService.get<string>('GOOGLE_API_KEY')) {
      this.providers.set('gemini', new GeminiProvider(this.configService));
      this.logger.debug('Google Gemini provider registered');
    }

    // Register Ollama provider (local)
    if (this.configService.get<string>('OLLAMA_BASE_URL')) {
      this.providers.set('ollama', new OllamaProvider(this.configService));
      this.logger.debug('Ollama provider registered');
    }

    // Register Hugging Face provider
    if (this.configService.get<string>('HUGGINGFACE_API_KEY')) {
      this.providers.set('huggingface', new HuggingFaceProvider(this.configService));
      this.logger.debug('Hugging Face provider registered');
    }

    this.logger.log(`Registered ${this.providers.size} AI providers`);
  }

  getAvailableProviders(): string[] {
    return Array.from(this.providers.keys());
  }

  async generateSummary(activities: ActivityData[], date: string, providerName?: string): Promise<string> {
    const availableProviders = this.getAvailableProviders();

    if (availableProviders.length === 0) {
      this.logger.warn('No AI providers available, falling back to template summary');
      return this.generateTemplateSummary(activities, date);
    }

    // Use specified provider or first available
    const providerKey = providerName || availableProviders[0];
    const provider = this.providers.get(providerKey);

    if (!provider) {
      this.logger.warn(`Provider '${providerKey}' not found, using first available provider`);
      const firstProvider = this.providers.get(availableProviders[0]);
      return firstProvider!.generateSummary(activities, date);
    }

    try {
      this.logger.debug(`Using AI provider: ${providerKey}`);
      return await provider.generateSummary(activities, date);
    } catch (error) {
      this.logger.error(`Failed to generate summary with ${providerKey}:`, error);

      // Fallback to template summary
      this.logger.warn('Falling back to template summary');
      return this.generateTemplateSummary(activities, date);
    }
  }

  private generateTemplateSummary(activities: ActivityData[], date: string): string {
    if (activities.length === 0) {
      return `No activities recorded for ${date}.`;
    }

    const byType = this.groupByType(activities);
    const byAuthor = this.groupByAuthor(activities);

    let summary = `Daily Activity Summary for ${date}\n\n`;

    // Overview
    summary += `📊 Overview:\n`;
    summary += `• Total activities: ${activities.length}\n`;
    summary += `• Activity types: ${Object.keys(byType).join(', ')}\n`;
    summary += `• Contributors: ${Object.keys(byAuthor).join(', ')}\n\n`;

    // By type breakdown
    summary += `📈 Activity Breakdown:\n`;
    for (const [type, count] of Object.entries(byType)) {
      const emoji = this.getTypeEmoji(type);
      summary += `• ${emoji} ${type}: ${count} activities\n`;
    }
    summary += '\n';

    // By author breakdown
    summary += `👥 Contributor Activity:\n`;
    for (const [author, count] of Object.entries(byAuthor)) {
      summary += `• ${author}: ${count} activities\n`;
    }
    summary += '\n';

    // Detailed activities
    summary += `📝 Detailed Activities:\n`;
    for (const activity of activities) {
      const emoji = this.getTypeEmoji(activity.type);
      const time = new Date(activity.timestamp).toLocaleTimeString();
      summary += `• ${time} - ${emoji} ${activity.title}\n`;
      if (activity.author) {
        summary += `  👤 ${activity.author}\n`;
      }
      if (activity.description && activity.description.length > 100) {
        summary += `  📄 ${activity.description.substring(0, 100)}...\n`;
      } else if (activity.description) {
        summary += `  📄 ${activity.description}\n`;
      }
      summary += '\n';
    }

    return summary;
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

  private getTypeEmoji(type: string): string {
    const emojis: Record<string, string> = {
      gitlab: '🔧',
      slack: '💬',
      teams: '👥',
      jira: '📋',
    };
    return emojis[type] || '📝';
  }
}

// OpenAI Provider
class OpenAiProvider implements AiProvider {
  name = 'openai';
  private readonly logger = new Logger(OpenAiProvider.name);

  constructor(private readonly configService: ConfigService) { }

  async generateSummary(activities: ActivityData[], date: string): Promise<string> {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');
    const model = this.configService.get<string>('OPENAI_MODEL') || 'gpt-4o';
    const baseUrl = this.configService.get<string>('OPENAI_BASE_URL') || 'https://api.openai.com/v1';

    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is required');
    }

    const prompt = this.buildPrompt(activities, date);

    try {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: 'system',
              content: 'You are an expert productivity analyst who creates clear, professional daily activity summaries. Focus on extracting meaningful insights, identifying patterns, and highlighting key accomplishments. Structure your response in a scannable format with clear sections and actionable insights.',
            },
            {
              role: 'user',
              content: prompt,
            },
          ],
          max_tokens: 1500,
          temperature: 0.3,
        }),
      });

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      return data.choices[0].message.content.trim();
    } catch (error) {
      this.logger.error('OpenAI API request failed:', error);
      throw error;
    }
  }

  private buildPrompt(activities: ActivityData[], date: string): string {
    const activityText = activities.map(activity => {
      const time = new Date(activity.timestamp).toLocaleTimeString();
      const type = activity.type.toUpperCase();
      const author = activity.author ? ` (by ${activity.author})` : '';
      const description = activity.description ? ` - ${activity.description.substring(0, 300)}` : '';
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
}

// Anthropic Provider
class AnthropicProvider implements AiProvider {
  name = 'anthropic';
  private readonly logger = new Logger(AnthropicProvider.name);

  constructor(private readonly configService: ConfigService) { }

  async generateSummary(activities: ActivityData[], date: string): Promise<string> {
    const apiKey = this.configService.get<string>('ANTHROPIC_API_KEY');
    const model = this.configService.get<string>('ANTHROPIC_MODEL') || 'claude-3-haiku-20240307';

    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY is required');
    }

    const prompt = this.buildPrompt(activities, date);

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          max_tokens: 1500,
          temperature: 0.3,
          messages: [
            {
              role: 'user',
              content: prompt,
            },
          ],
        }),
      });

      if (!response.ok) {
        throw new Error(`Anthropic API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      return data.content[0].text.trim();
    } catch (error) {
      this.logger.error('Anthropic API request failed:', error);
      throw error;
    }
  }

  private buildPrompt(activities: ActivityData[], date: string): string {
    const activityText = activities.map(activity => {
      const time = new Date(activity.timestamp).toLocaleTimeString();
      const type = activity.type.toUpperCase();
      const author = activity.author ? ` (by ${activity.author})` : '';
      const description = activity.description ? ` - ${activity.description.substring(0, 300)}` : '';
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
}

// Google Gemini Provider
class GeminiProvider implements AiProvider {
  name = 'gemini';
  private readonly logger = new Logger(GeminiProvider.name);

  constructor(private readonly configService: ConfigService) { }

  async generateSummary(activities: ActivityData[], date: string): Promise<string> {
    const apiKey = this.configService.get<string>('GOOGLE_API_KEY');
    const model = this.configService.get<string>('GOOGLE_MODEL') || 'gemini-1.5-flash';

    if (!apiKey) {
      throw new Error('GOOGLE_API_KEY is required');
    }

    const prompt = this.buildPrompt(activities, date);

    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: prompt,
                },
              ],
            },
          ],
          generationConfig: {
            maxOutputTokens: 1500,
            temperature: 0.3,
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`Google Gemini API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      return data.candidates[0].content.parts[0].text.trim();
    } catch (error) {
      this.logger.error('Google Gemini API request failed:', error);
      throw error;
    }
  }

  private buildPrompt(activities: ActivityData[], date: string): string {
    const activityText = activities.map(activity => {
      const time = new Date(activity.timestamp).toLocaleTimeString();
      const type = activity.type.toUpperCase();
      const author = activity.author ? ` (by ${activity.author})` : '';
      const description = activity.description ? ` - ${activity.description.substring(0, 300)}` : '';
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
}

// Ollama Provider (Local)
class OllamaProvider implements AiProvider {
  name = 'ollama';
  private readonly logger = new Logger(OllamaProvider.name);

  constructor(private readonly configService: ConfigService) { }

  async generateSummary(activities: ActivityData[], date: string): Promise<string> {
    const baseUrl = this.configService.get<string>('OLLAMA_BASE_URL') || 'http://localhost:11434';
    const model = this.configService.get<string>('OLLAMA_MODEL') || 'llama2';

    const prompt = this.buildPrompt(activities, date);

    try {
      const response = await fetch(`${baseUrl}/api/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          prompt,
          stream: false,
          options: {
            temperature: 0.3,
            num_predict: 1500,
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      return data.response.trim();
    } catch (error) {
      this.logger.error('Ollama API request failed:', error);
      throw error;
    }
  }

  private buildPrompt(activities: ActivityData[], date: string): string {
    const activityText = activities.map(activity => {
      const time = new Date(activity.timestamp).toLocaleTimeString();
      const type = activity.type.toUpperCase();
      const author = activity.author ? ` (by ${activity.author})` : '';
      const description = activity.description ? ` - ${activity.description.substring(0, 300)}` : '';
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
}

// Hugging Face Provider
class HuggingFaceProvider implements AiProvider {
  name = 'huggingface';
  private readonly logger = new Logger(HuggingFaceProvider.name);

  constructor(private readonly configService: ConfigService) { }

  async generateSummary(activities: ActivityData[], date: string): Promise<string> {
    const apiKey = this.configService.get<string>('HUGGINGFACE_API_KEY');
    const model = this.configService.get<string>('HUGGINGFACE_MODEL') || 'microsoft/DialoGPT-medium';

    if (!apiKey) {
      throw new Error('HUGGINGFACE_API_KEY is required');
    }

    const prompt = this.buildPrompt(activities, date);

    try {
      const response = await fetch(`https://api-inference.huggingface.co/models/${model}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          inputs: prompt,
          parameters: {
            max_length: 1500,
            temperature: 0.3,
            do_sample: true,
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`Hugging Face API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      return Array.isArray(data) ? data[0].generated_text : data.generated_text;
    } catch (error) {
      this.logger.error('Hugging Face API request failed:', error);
      throw error;
    }
  }

  private buildPrompt(activities: ActivityData[], date: string): string {
    const activityText = activities.map(activity => {
      const time = new Date(activity.timestamp).toLocaleTimeString();
      const type = activity.type.toUpperCase();
      const author = activity.author ? ` (by ${activity.author})` : '';
      const description = activity.description ? ` - ${activity.description.substring(0, 300)}` : '';
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
}
