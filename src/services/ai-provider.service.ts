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

    // Register Open WebUI provider
    if (this.configService.get<string>('OPENWEBUI_BASE_URL')) {
      this.providers.set('openwebui', new OpenWebUIProvider(this.configService));
      this.logger.debug('Open WebUI provider registered');
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
      const start = Date.now();
      this.logger.verbose(`[TRACE] POST ${baseUrl}/chat/completions - sending request`);
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
      const duration = Date.now() - start;
      this.logger.verbose(`[TRACE] POST ${baseUrl}/chat/completions - status ${response.status} (${duration}ms)`);

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
      const start = Date.now();
      this.logger.verbose(`[TRACE] POST https://api.anthropic.com/v1/messages - sending request`);
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
      const duration = Date.now() - start;
      this.logger.verbose(`[TRACE] POST https://api.anthropic.com/v1/messages - status ${response.status} (${duration}ms)`);

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
      const start = Date.now();
      this.logger.verbose(`[TRACE] POST https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey} - sending request`);
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
      const duration = Date.now() - start;
      this.logger.verbose(`[TRACE] POST https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey} - status ${response.status} (${duration}ms)`);

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
      const start = Date.now();
      this.logger.verbose(`[TRACE] POST ${baseUrl}/api/generate - sending request`);
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
      const duration = Date.now() - start;
      this.logger.verbose(`[TRACE] POST ${baseUrl}/api/generate - status ${response.status} (${duration}ms)`);

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
      const start = Date.now();
      this.logger.verbose(`[TRACE] POST https://api-inference.huggingface.co/models/${model} - sending request`);
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
      const duration = Date.now() - start;
      this.logger.verbose(`[TRACE] POST https://api-inference.huggingface.co/models/${model} - status ${response.status} (${duration}ms)`);

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

// Open WebUI Provider
class OpenWebUIProvider implements AiProvider {
  name = 'openwebui';
  private readonly logger = new Logger(OpenWebUIProvider.name);

  constructor(private readonly configService: ConfigService) { }

  async generateSummary(activities: ActivityData[], date: string): Promise<string> {
    const baseUrl = this.configService.get<string>('OPENWEBUI_BASE_URL') || 'http://localhost:8080';
    const model = this.configService.get<string>('OPENWEBUI_MODEL') || 'llama2';
    const apiKey = this.configService.get<string>('OPENWEBUI_API_KEY');

    const prompt = this.buildPrompt(activities, date);
    const systemPrompt = 'You are an expert productivity analyst who creates clear, professional daily activity summaries. Focus on extracting meaningful insights, identifying patterns, and highlighting key accomplishments. Structure your response in a scannable format with clear sections and actionable insights.';

    // Define different endpoint configurations to try
    const endpointConfigs = [
      {
        name: 'OpenAI-compatible chat completions (v1)',
        url: `${baseUrl}/v1/chat/completions`,
        method: 'POST',
        body: {
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: prompt },
          ],
          max_tokens: 1500,
          temperature: 0.3,
        },
      },
      {
        name: 'OpenAI-compatible completions (v1)',
        url: `${baseUrl}/v1/completions`,
        method: 'POST',
        body: {
          model,
          prompt: `${systemPrompt}\n\nUser: ${prompt}\n\nAssistant:`,
          max_tokens: 1500,
          temperature: 0.3,
        },
      },
      {
        name: 'OpenAI-compatible chat completions (api/v1)',
        url: `${baseUrl}/api/v1/chat/completions`,
        method: 'POST',
        body: {
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: prompt },
          ],
          max_tokens: 1500,
          temperature: 0.3,
        },
      },
      {
        name: 'OpenAI-compatible completions (api/v1)',
        url: `${baseUrl}/api/v1/completions`,
        method: 'POST',
        body: {
          model,
          prompt: `${systemPrompt}\n\nUser: ${prompt}\n\nAssistant:`,
          max_tokens: 1500,
          temperature: 0.3,
        },
      },
      {
        name: 'OpenAI-compatible chat completions (api)',
        url: `${baseUrl}/api/chat/completions`,
        method: 'POST',
        body: {
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: prompt },
          ],
          max_tokens: 1500,
          temperature: 0.3,
        },
      },
      {
        name: 'OpenAI-compatible completions (api)',
        url: `${baseUrl}/api/completions`,
        method: 'POST',
        body: {
          model,
          prompt: `${systemPrompt}\n\nUser: ${prompt}\n\nAssistant:`,
          max_tokens: 1500,
          temperature: 0.3,
        },
      },
      {
        name: 'OpenAI-compatible chat completions (root)',
        url: `${baseUrl}/chat/completions`,
        method: 'POST',
        body: {
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: prompt },
          ],
          max_tokens: 1500,
          temperature: 0.3,
        },
      },
      {
        name: 'OpenAI-compatible completions (root)',
        url: `${baseUrl}/completions`,
        method: 'POST',
        body: {
          model,
          prompt: `${systemPrompt}\n\nUser: ${prompt}\n\nAssistant:`,
          max_tokens: 1500,
          temperature: 0.3,
        },
      },
      {
        name: 'OpenWebUI chat endpoint (v1)',
        url: `${baseUrl}/api/v1/chat`,
        method: 'POST',
        body: {
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: prompt },
          ],
          stream: false,
          options: {
            temperature: 0.3,
            top_p: 0.9,
            max_tokens: 1500,
          },
        },
      },
      {
        name: 'OpenWebUI generate endpoint (v1)',
        url: `${baseUrl}/api/v1/generate`,
        method: 'POST',
        body: {
          model,
          prompt: `${systemPrompt}\n\nUser: ${prompt}\n\nAssistant:`,
          stream: false,
          options: {
            temperature: 0.3,
            top_p: 0.9,
            max_tokens: 1500,
          },
        },
      },
      {
        name: 'OpenWebUI legacy chat endpoint',
        url: `${baseUrl}/api/chat`,
        method: 'POST',
        body: {
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: prompt },
          ],
          stream: false,
          options: {
            temperature: 0.3,
            top_p: 0.9,
            max_tokens: 1500,
          },
        },
      },
      {
        name: 'OpenWebUI legacy generate endpoint',
        url: `${baseUrl}/api/generate`,
        method: 'POST',
        body: {
          model,
          prompt: `${systemPrompt}\n\nUser: ${prompt}\n\nAssistant:`,
          stream: false,
          options: {
            temperature: 0.3,
            top_p: 0.9,
            max_tokens: 1500,
          },
        },
      },
    ];

    let lastError: Error | null = null;

    for (const config of endpointConfigs) {
      try {
        this.logger.debug(`Trying OpenWebUI endpoint: ${config.name}`);

        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };

        // Add API key if provided
        if (apiKey) {
          headers['Authorization'] = `Bearer ${apiKey}`;
        }

        const start = Date.now();
        this.logger.verbose(`[TRACE] ${config.method || 'POST'} ${config.url || baseUrl} - sending request`);
        const response = await fetch(config.url, {
          method: config.method,
          headers,
          body: JSON.stringify(config.body),
        });
        const duration = Date.now() - start;
        this.logger.verbose(`[TRACE] ${config.method || 'POST'} ${config.url || baseUrl} - status ${response.status} (${duration}ms)`);

        if (!response.ok) {
          const errorText = await response.text().catch(() => 'Unknown error');
          throw new Error(`${response.status} ${response.statusText} - ${errorText}`);
        }

        const data = await response.json();

        // Handle different response formats
        let content: string;
        if (data.choices?.[0]?.message?.content) {
          // OpenAI-compatible format
          content = data.choices[0].message.content;
        } else if (data.response) {
          // Ollama-compatible format
          content = data.response;
        } else if (data.content) {
          // Direct content format
          content = data.content;
        } else if (data.text) {
          // Text format
          content = data.text;
        } else if (typeof data === 'string') {
          // String response
          content = data;
        } else {
          throw new Error('Unexpected response format');
        }

        this.logger.debug(`Successfully used OpenWebUI endpoint: ${config.name}`);
        return content.trim();
      } catch (error) {
        lastError = error as Error;
        this.logger.debug(`Failed to use OpenWebUI endpoint ${config.name}: ${error}`);
        continue;
      }
    }

    // If all endpoints failed, throw the last error
    this.logger.error('All OpenWebUI endpoints failed');
    throw new Error(`All OpenWebUI endpoints failed. Last error: ${lastError?.message}`);
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
