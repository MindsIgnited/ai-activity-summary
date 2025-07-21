import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ActivityData } from '../app.service';
import { setEndOfDay } from '../utils/date.utils';

interface SlackMessage {
  type: string;
  ts: string;
  user?: string;
  text: string;
  thread_ts?: string;
  parent_user_id?: string;
  reactions?: SlackReaction[];
  blocks?: any[];
  channel: string;
}

interface SlackReaction {
  name: string;
  users: string[];
  count: number;
}

interface SlackUser {
  id: string;
  name: string;
  real_name: string;
  profile: {
    email?: string;
    display_name?: string;
    real_name?: string;
  };
}

@Injectable()
export class SlackService {
  private readonly logger = new Logger(SlackService.name);
  private userCache: Record<string, SlackUser> = {};

  constructor(private readonly configService: ConfigService) { }

  async fetchActivities(date: Date): Promise<ActivityData[]> {
    if (!this.isConfigured()) {
      this.logger.warn('Slack configuration incomplete, skipping Slack activities');
      return [];
    }

    const activities: ActivityData[] = [];
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = setEndOfDay(date);
    const oldest = (startOfDay.getTime() / 1000).toString();
    const latest = (endOfDay.getTime() / 1000).toString();

    const channels = this.getChannels();
    for (const channel of channels) {
      try {
        // Fetch messages for the channel
        const messages = await this.fetchChannelMessages(channel, oldest, latest);
        for (const msg of messages) {
          activities.push(await this.createMessageActivity(msg, channel));
          // Add reactions as separate activities
          if (msg.reactions) {
            for (const reaction of msg.reactions) {
              activities.push(await this.createReactionActivity(msg, reaction, channel));
            }
          }
        }
      } catch (error) {
        this.logger.warn(`Failed to fetch messages for channel ${channel}:`, error);
      }
    }

    this.logger.log(`Fetched ${activities.length} Slack activities for ${date.toISOString().split('T')[0]}`);
    return activities;
  }

  private isConfigured(): boolean {
    const botToken = this.configService.get<string>('SLACK_BOT_TOKEN');
    return !!botToken;
  }

  private getChannels(): string[] {
    return this.configService.get<string>('SLACK_CHANNELS')?.split(',').map(c => c.trim()) || [];
  }

  private getBotToken(): string {
    return this.configService.get<string>('SLACK_BOT_TOKEN')!;
  }

  private async fetchChannelMessages(channel: string, oldest: string, latest: string): Promise<SlackMessage[]> {
    let messages: SlackMessage[] = [];
    let cursor: string | undefined = undefined;
    let hasMore = true;
    const limit = 200;

    while (hasMore) {
      const url = new URL('https://slack.com/api/conversations.history');
      url.searchParams.set('channel', channel);
      url.searchParams.set('oldest', oldest);
      url.searchParams.set('latest', latest);
      url.searchParams.set('limit', limit.toString());
      if (cursor) url.searchParams.set('cursor', cursor);

      const start = Date.now();
      this.logger.verbose(`[TRACE] GET ${url} - sending request`);
      try {
        const response = await this.makeRequest(url.toString());
        const duration = Date.now() - start;
        this.logger.verbose(`[TRACE] GET ${url} - status ${response.status} (${duration}ms)`);
        if (!response.ok) {
          this.logger.warn(`Slack API error: ${response.error}`);
          break;
        }
        const batch = (response.messages || []).map((msg: any) => ({ ...msg, channel }));
        messages.push(...batch);
        hasMore = response.has_more;
        cursor = response.response_metadata?.next_cursor;
        // Slack rate limit: 1 request per second for history
        if (hasMore) await new Promise(res => setTimeout(res, 1100));
      } catch (error) {
        const duration = Date.now() - start;
        this.logger.error(`[TRACE] GET ${url} - ERROR after ${duration}ms: ${error}`);
        throw error;
      }
    }
    return messages;
  }

  private async fetchUser(userId: string): Promise<SlackUser | undefined> {
    if (this.userCache[userId]) return this.userCache[userId];
    const url = `https://slack.com/api/users.info?user=${userId}`;
    const start = Date.now();
    this.logger.verbose(`[TRACE] GET ${url} - sending request`);
    try {
      const response = await this.makeRequest(url);
      const duration = Date.now() - start;
      this.logger.verbose(`[TRACE] GET ${url} - status ${response.status} (${duration}ms)`);
      if (response.ok && response.user) {
        this.userCache[userId] = response.user;
        return response.user;
      }
    } catch (error) {
      const duration = Date.now() - start;
      this.logger.error(`[TRACE] GET ${url} - ERROR after ${duration}ms: ${error}`);
      throw error;
    }
    return undefined;
  }

  private async createMessageActivity(msg: SlackMessage, channel: string): Promise<ActivityData> {
    const user = msg.user ? await this.fetchUser(msg.user) : undefined;
    return {
      id: `slack-msg-${msg.ts}`,
      type: 'slack',
      timestamp: new Date(parseFloat(msg.ts) * 1000),
      title: `Slack Message in #${channel}`,
      description: msg.text,
      author: user?.real_name || user?.name || msg.user || 'Unknown',
      url: `https://slack.com/app_redirect?channel=${channel}&message_ts=${msg.ts}`,
      metadata: {
        channel,
        threadTs: msg.thread_ts,
        parentUserId: msg.parent_user_id,
        reactions: msg.reactions,
        userId: msg.user,
        userEmail: user?.profile?.email,
      },
    };
  }

  private async createReactionActivity(msg: SlackMessage, reaction: SlackReaction, channel: string): Promise<ActivityData> {
    return {
      id: `slack-reaction-${msg.ts}-${reaction.name}`,
      type: 'slack',
      timestamp: new Date(parseFloat(msg.ts) * 1000),
      title: `Reaction :${reaction.name}: in #${channel}`,
      description: `Reaction :${reaction.name}: by ${reaction.users.length} user(s)`,
      author: 'Multiple',
      url: `https://slack.com/app_redirect?channel=${channel}&message_ts=${msg.ts}`,
      metadata: {
        channel,
        messageTs: msg.ts,
        reaction: reaction.name,
        count: reaction.count,
        users: reaction.users,
      },
    };
  }

  private async makeRequest(url: string): Promise<any> {
    const start = Date.now();
    this.logger.verbose(`[TRACE] POST ${url} - sending request`);
    try {
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${this.getBotToken()}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json',
        },
      });
      const duration = Date.now() - start;
      this.logger.verbose(`[TRACE] POST ${url} - status ${response.status} (${duration}ms)`);
      return response.json();
    } catch (error) {
      const duration = Date.now() - start;
      this.logger.error(`[TRACE] POST ${url} - ERROR after ${duration}ms: ${error}`);
      throw error;
    }
  }
}
