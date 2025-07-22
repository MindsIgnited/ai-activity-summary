import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BaseActivityService } from './base-activity.service';
import { ActivityFactory } from '../utils/activity.factory';
import { DateRangeIterator } from '../utils/date.utils';
import { ActivityData } from '../app.service';
import { createTracedRequest } from '../utils/http.utils';

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
export class SlackService extends BaseActivityService {
  protected readonly serviceName = 'Slack';
  protected readonly logger = new Logger(SlackService.name);
  private userCache: Record<string, SlackUser> = {};

  constructor(private readonly configService: ConfigService) {
    super();
  }

  protected isConfigured(): boolean {
    const botToken = this.configService.get<string>('SLACK_BOT_TOKEN');
    return !!botToken;
  }

  protected async fetchActivitiesForDate(date: Date): Promise<ActivityData[]> {
    const activities: ActivityData[] = [];
    const { startOfDay, endOfDay } = DateRangeIterator.getDayBounds(date);
    const oldest = (startOfDay.getTime() / 1000).toString();
    const latest = (endOfDay.getTime() / 1000).toString();

    const channels = this.getChannels();
    const userEmail = this.configService.get<string>('SLACK_USER_EMAIL');

    if (!userEmail) {
      this.logger.warn('SLACK_USER_EMAIL not configured, fetching all messages (no user filtering)');
    }

    for (const channel of channels) {
      try {
        // Fetch messages for the channel
        const messages = await this.fetchChannelMessages(channel, oldest, latest);

        // Filter messages by current user if email is configured
        const userMessages = userEmail
          ? messages.filter(msg => {
            const user = this.userCache[msg.user || ''];
            return user?.profile?.email === userEmail;
          })
          : messages;

        for (const msg of userMessages) {
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
        const response = await this.makeSlackRequest(url.toString());
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
        this.logger.error(`Failed to fetch Slack messages: ${error}`);
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
      const response = await this.makeSlackRequest(url);
      if (response.ok && response.user) {
        this.userCache[userId] = response.user;
        return response.user;
      }
    } catch (error) {
      this.logger.error(`Failed to fetch Slack user: ${error}`);
      throw error;
    }
    return undefined;
  }

  private async createMessageActivity(msg: SlackMessage, channel: string): Promise<ActivityData> {
    const user = await this.fetchUser(msg.user || '');
    const timestamp = new Date(parseInt(msg.ts) * 1000);
    const title = `Message in #${channel}: ${msg.text.substring(0, 50)}`;

    return ActivityFactory.createSlackActivity(
      `slack-message-${msg.ts}`,
      timestamp,
      title,
      msg.text,
      user?.real_name || user?.name || 'Unknown User',
      undefined, // No URL for Slack messages
      {
        action: 'message',
        channel,
        userId: msg.user,
        threadTs: msg.thread_ts,
        parentUserId: msg.parent_user_id,
        hasReactions: msg.reactions && msg.reactions.length > 0,
        reactionCount: msg.reactions?.length || 0,
      }
    );
  }

  private async createReactionActivity(msg: SlackMessage, reaction: SlackReaction, channel: string): Promise<ActivityData> {
    const user = await this.fetchUser(msg.user || '');
    const timestamp = new Date(parseInt(msg.ts) * 1000);
    const title = `Reaction ${reaction.name} in #${channel}`;

    return ActivityFactory.createSlackActivity(
      `slack-reaction-${msg.ts}-${reaction.name}`,
      timestamp,
      title,
      `Reaction ${reaction.name} on message: ${msg.text.substring(0, 100)}`,
      user?.real_name || user?.name || 'Unknown User',
      undefined, // No URL for reactions
      {
        action: 'reaction',
        channel,
        reactionName: reaction.name,
        reactionCount: reaction.count,
        messageTs: msg.ts,
        userId: msg.user,
      }
    );
  }

  private makeRequest = createTracedRequest('Slack', this.logger);

  private async makeSlackRequest(url: string): Promise<any> {
    return this.makeRequest(url, {
      headers: {
        'Authorization': `Bearer ${this.getBotToken()}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
      },
      timeout: 15000, // 15 second timeout for Slack
      retryConfig: 'aggressive', // Use aggressive retry for rate-limited Slack API
      enableCircuitBreaker: true,
    });
  }
}
