import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BaseActivityService } from './base-activity.service';
import { ActivityFactory } from '../utils/activity.factory';
import { DateRangeIterator } from '../utils/date.utils';
import { setEndOfDay } from '../utils/string.utils';
import { ActivityData } from '../app.service';
import { createTracedRequest } from '../utils/http.utils';
import { ErrorUtils } from '../utils/error.utils';

interface TeamsMessage {
  id: string;
  createdDateTime: string;
  lastModifiedDateTime: string;
  body: {
    content: string;
    contentType: string;
  };
  from: {
    user: {
      displayName: string;
      email: string;
    };
  };
  subject?: string;
  importance: string;
  webUrl: string;
}

interface TeamsCalendarEvent {
  id: string;
  subject: string;
  start: {
    dateTime: string;
    timeZone: string;
  };
  end: {
    dateTime: string;
    timeZone: string;
  };
  body: {
    content: string;
    contentType: string;
  };
  organizer: {
    emailAddress: {
      name: string;
      address: string;
    };
  };
  attendees: {
    emailAddress: {
      name: string;
      address: string;
    };
    status: {
      response: string;
    };
  }[];
  webLink: string;
  isOnlineMeeting: boolean;
  onlineMeeting?: {
    joinUrl: string;
  };
}

interface TeamsChannel {
  id: string;
  displayName: string;
  description?: string;
}

interface TeamsTeam {
  id: string;
  displayName: string;
  description?: string;
}

@Injectable()
export class TeamsService extends BaseActivityService {
  protected readonly serviceName = 'Teams';
  protected readonly logger = new Logger(TeamsService.name);
  private accessToken: string | null = null;
  private tokenExpiry: Date | null = null;
  private refreshToken: string | null = null;

  constructor(private readonly configService: ConfigService) {
    super();
  }

  protected isConfigured(): boolean {
    const clientId = this.configService.get<string>('TEAMS_CLIENT_ID');
    const clientSecret = this.configService.get<string>('TEAMS_CLIENT_SECRET');
    const tenantId = this.configService.get<string>('TEAMS_TENANT_ID');
    const userEmail = this.configService.get<string>('TEAMS_USER_EMAIL');
    return !!(clientId && clientSecret && tenantId && userEmail);
  }

  protected async fetchActivitiesForDate(date: Date): Promise<ActivityData[]> {
    this.logger.log(`Fetching Teams activities for ${date.toISOString().split('T')[0]}`);
    const activities: ActivityData[] = [];

    const { startOfDay, endOfDay } = DateRangeIterator.getDayBounds(date);

    try {
      // Ensure we have a valid access token
      await this.ensureAccessToken();

      // Fetch channel messages
      const channelMessages = await this.fetchChannelMessages(startOfDay, endOfDay);
      for (const message of channelMessages) {
        activities.push(this.createMessageActivity(message));
      }

      // Fetch calendar events
      const calendarEvents = await this.fetchCalendarEvents(startOfDay, endOfDay);
      for (const event of calendarEvents) {
        activities.push(this.createCalendarActivity(event));
      }

      // Fetch chat messages
      const chatMessages = await this.fetchChatMessages(startOfDay, endOfDay);
      for (const message of chatMessages) {
        activities.push(this.createMessageActivity(message));
      }

      this.logger.log(`Fetched ${activities.length} Teams activities for ${date.toISOString().split('T')[0]}`);
    } catch (error) {
      this.logger.error('Error fetching Teams activities:', error);
    }

    return activities;
  }

  private async ensureAccessToken(): Promise<void> {
    if (this.accessToken && this.tokenExpiry && this.tokenExpiry > new Date()) {
      return; // Token is still valid
    }

    if (this.refreshToken) {
      await this.refreshAccessToken();
    } else {
      await this.authenticate();
    }
  }

  private async authenticate(): Promise<void> {
    const clientId = this.configService.get<string>('TEAMS_CLIENT_ID');
    const clientSecret = this.configService.get<string>('TEAMS_CLIENT_SECRET');
    const tenantId = this.configService.get<string>('TEAMS_TENANT_ID');
    const userEmail = this.configService.get<string>('TEAMS_USER_EMAIL');

    if (!clientId || !clientSecret || !tenantId || !userEmail) {
      throw ErrorUtils.createConfigurationError(
        'Missing required Teams configuration: TEAMS_CLIENT_ID, TEAMS_CLIENT_SECRET, TEAMS_TENANT_ID, or TEAMS_USER_EMAIL',
        'Teams',
        'credentials'
      );
    }

    // For delegated permissions, we need to use the authorization code flow
    // This requires user interaction to get the authorization code
    // For CLI applications, you'll need to implement a web server or use device code flow

    // For now, we'll use device code flow which is suitable for CLI applications
    await this.authenticateWithDeviceCode(clientId, clientSecret, tenantId, userEmail);
  }

  private async authenticateWithDeviceCode(clientId: string, clientSecret: string, tenantId: string, userEmail: string): Promise<void> {
    // Step 1: Get device code
    const deviceCodeUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/devicecode`;
    const deviceCodeResponse = await fetch(deviceCodeUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: clientId,
        scope: 'https://graph.microsoft.com/.default',
      }),
    });

    if (!deviceCodeResponse.ok) {
      let errorText = 'Unknown error';
      try {
        if (typeof deviceCodeResponse.text === 'function') {
          errorText = await deviceCodeResponse.text();
        } else {
          errorText = `HTTP ${deviceCodeResponse.status} ${deviceCodeResponse.statusText}`;
        }
      } catch (textError) {
        errorText = `HTTP ${deviceCodeResponse.status} ${deviceCodeResponse.statusText}`;
      }

      this.logger.error(`Device code request failed: ${deviceCodeResponse.status} ${deviceCodeResponse.statusText}`);
      this.logger.error(`Error details: ${errorText}`);
      throw ErrorUtils.createAuthError(
        `Device code request failed: ${deviceCodeResponse.status} ${deviceCodeResponse.statusText}`,
        'Teams',
        { status: deviceCodeResponse.status, errorText }
      );
    }

    const deviceCodeData = await deviceCodeResponse.json();

    // Display the device code to the user
    this.logger.log('=== MICROSOFT TEAMS AUTHENTICATION REQUIRED ===');
    this.logger.log(`Please visit: ${deviceCodeData.verification_uri}`);
    this.logger.log(`Enter this code: ${deviceCodeData.user_code}`);
    this.logger.log('Waiting for authentication...');

    // Step 2: Poll for token
    const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
    const maxAttempts = 30; // 5 minutes with 10-second intervals
    let attempts = 0;

    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, deviceCodeData.interval * 1000));

      const tokenResponse = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_id: clientId,
          device_code: deviceCodeData.device_code,
          grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        }),
      });

      if (tokenResponse.ok) {
        const tokenData = await tokenResponse.json();
        this.accessToken = tokenData.access_token;
        this.refreshToken = tokenData.refresh_token;
        this.tokenExpiry = new Date(Date.now() + (tokenData.expires_in * 1000));

        this.logger.log('Successfully authenticated with Microsoft Graph API');
        return;
      }

      const errorData = await tokenResponse.json();
      if (errorData.error === 'authorization_pending') {
        attempts++;
        continue;
      } else if (errorData.error === 'authorization_declined') {
        throw ErrorUtils.createAuthError('Authentication was declined by the user', 'Teams');
      } else {
        this.logger.error(`Token request failed: ${errorData.error} - ${errorData.error_description}`);
        throw ErrorUtils.createAuthError(`Token request failed: ${errorData.error}`, 'Teams', { errorData });
      }
    }

    throw ErrorUtils.createAuthError('Authentication timeout - please try again', 'Teams');
  }

  private async refreshAccessToken(): Promise<void> {
    const clientId = this.configService.get<string>('TEAMS_CLIENT_ID');
    const clientSecret = this.configService.get<string>('TEAMS_CLIENT_SECRET');
    const tenantId = this.configService.get<string>('TEAMS_TENANT_ID');

    if (!this.refreshToken || !clientId || !clientSecret || !tenantId) {
      throw ErrorUtils.createConfigurationError('Missing required configuration for token refresh', 'Teams', 'refreshToken');
    }

    const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: this.refreshToken,
        grant_type: 'refresh_token',
      }),
    });

    if (!response.ok) {
      let errorText = 'Unknown error';
      try {
        if (typeof response.text === 'function') {
          errorText = await response.text();
        } else {
          errorText = `HTTP ${response.status} ${response.statusText}`;
        }
      } catch (textError) {
        errorText = `HTTP ${response.status} ${response.statusText}`;
      }

      this.logger.error(`Token refresh failed: ${response.status} ${response.statusText}`);
      this.logger.error(`Error details: ${errorText}`);
      // Clear the refresh token so we can re-authenticate
      this.refreshToken = null;
      throw ErrorUtils.createAuthError(`Token refresh failed: ${response.status} ${response.statusText}`, 'Teams', { status: response.status, errorText });
    }

    const data = await response.json();
    this.accessToken = data.access_token;
    this.refreshToken = data.refresh_token;
    this.tokenExpiry = new Date(Date.now() + (data.expires_in * 1000));

    this.logger.log('Successfully refreshed access token');
  }

  private async fetchChannelMessages(startDate: Date, endDate: Date): Promise<TeamsMessage[]> {
    const messages: TeamsMessage[] = [];
    const userEmail = this.configService.get<string>('TEAMS_USER_EMAIL');
    const teams = await this.getTeams();

    if (!userEmail) {
      this.logger.warn('TEAMS_USER_EMAIL not configured, skipping message filtering');
      return [];
    }

    for (const team of teams) {
      try {
        // Get channels for this specific team
        const url = `https://graph.microsoft.com/v1.0/teams/${team.id}/channels`;
        const response = await this.makeTeamsRequest(url);
        const teamChannels = response.value || [];

        // Process each channel in this team
        for (const channel of teamChannels) {
          try {
            const messagesUrl = `https://graph.microsoft.com/v1.0/teams/${team.id}/channels/${channel.id}/messages?$top=50`;

            const messagesResponse = await this.makeTeamsRequest(messagesUrl);
            const channelMessages = messagesResponse.value || [];

            // Filter messages by date and user in the application
            const filteredMessages = channelMessages.filter((msg: TeamsMessage) => {
              const messageDate = new Date(msg.createdDateTime);
              return msg.from?.user?.email === userEmail &&
                messageDate >= startDate &&
                messageDate <= endDate;
            });

            messages.push(...filteredMessages);
          } catch (error) {
            this.logger.warn(`Failed to fetch messages for channel ${channel.displayName} in team ${team.displayName}:`, error);
          }
        }
      } catch (error) {
        this.logger.warn(`Failed to fetch channels for team ${team.displayName}:`, error);
      }
    }

    return messages;
  }

  private async fetchCalendarEvents(startDate: Date, endDate: Date): Promise<TeamsCalendarEvent[]> {
    try {
      const userEmail = this.configService.get<string>('TEAMS_USER_EMAIL');

      if (!userEmail) {
        this.logger.warn('TEAMS_USER_EMAIL not configured, skipping calendar events');
        return [];
      }

      // Get user ID from email
      const user = await this.getUserByEmail(userEmail);
      if (!user) {
        this.logger.warn(`User not found for email: ${userEmail}`);
        return [];
      }

      const url = `https://graph.microsoft.com/v1.0/users/${user.id}/calendarView?startDateTime=${startDate.toISOString()}&endDateTime=${endDate.toISOString()}&$top=100&$orderby=start/dateTime`;

      const response = await this.makeTeamsRequest(url);
      return response.value || [];
    } catch (error) {
      this.logger.warn('Failed to fetch calendar events:', error);
      return [];
    }
  }

  private async getUserByEmail(email: string): Promise<{ id: string; displayName: string } | null> {
    try {
      const url = `https://graph.microsoft.com/v1.0/users/${email}`;
      const response = await this.makeTeamsRequest(url);
      return {
        id: response.id,
        displayName: response.displayName,
      };
    } catch (error) {
      this.logger.warn(`Failed to get user by email ${email}:`, error);
      return null;
    }
  }

  private async getChannels(): Promise<TeamsChannel[]> {
    const channels: TeamsChannel[] = [];
    const teams = await this.getTeams();

    for (const team of teams) {
      try {
        const url = `https://graph.microsoft.com/v1.0/teams/${team.id}/channels`;
        const response = await this.makeTeamsRequest(url);
        const teamChannels = response.value || [];
        channels.push(...teamChannels);
      } catch (error) {
        this.logger.warn(`Failed to fetch channels for team ${team.displayName}:`, error);
      }
    }

    return channels;
  }

  private async getTeams(): Promise<TeamsTeam[]> {
    try {
      const userEmail = this.configService.get<string>('TEAMS_USER_EMAIL');

      if (!userEmail) {
        this.logger.warn('TEAMS_USER_EMAIL not configured, skipping teams fetch');
        return [];
      }

      const user = await this.getUserByEmail(userEmail);

      if (!user) {
        this.logger.warn(`User not found for email: ${userEmail}`);
        return [];
      }

      const url = `https://graph.microsoft.com/v1.0/users/${user.id}/joinedTeams`;
      const response = await this.makeGraphRequest(url);
      const allTeams = response.value || [];

      // Filter out teams that don't have valid GUID IDs
      const validTeams = allTeams.filter((team: TeamsTeam) => this.isValidGuid(team.id));

      if (validTeams.length < allTeams.length) {
        this.logger.debug(`Filtered out ${allTeams.length - validTeams.length} teams with invalid GUIDs`);
      }

      return validTeams;
    } catch (error) {
      this.logger.warn('Failed to fetch Teams:', error);
      return [];
    }
  }

  private isValidGuid(guid: string): boolean {
    const guidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return guidRegex.test(guid);
  }

  private makeGraphRequest = createTracedRequest('Teams', this.logger);

  private async makeTeamsRequest(url: string): Promise<any> {
    if (!this.accessToken) {
      throw ErrorUtils.createAuthError('No access token available', 'Teams');
    }

    this.logger.debug(`Making Graph API request to: ${url}`);

    return this.makeGraphRequest(url, {
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Accept': 'application/json',
      },
      timeout: 30000, // 30 second timeout
      retryConfig: 'conservative', // Use conservative retry for Teams API
      enableCircuitBreaker: true,
    });
  }

  private createMessageActivity(message: TeamsMessage): ActivityData {
    return ActivityFactory.createTeamsMessageActivity(message);
  }

  private createCalendarActivity(event: TeamsCalendarEvent): ActivityData {
    return ActivityFactory.createTeamsCalendarActivity(event);
  }

  private async fetchChatMessages(startDate: Date, endDate: Date): Promise<TeamsMessage[]> {
    const messages: TeamsMessage[] = [];
    const userEmail = this.configService.get<string>('TEAMS_USER_EMAIL');

    if (!userEmail) {
      this.logger.warn('TEAMS_USER_EMAIL not configured, skipping chat message filtering');
      return [];
    }

    try {
      // Get user ID from email first
      const user = await this.getUserByEmail(userEmail);
      if (!user) {
        this.logger.warn(`User not found for email: ${userEmail}, skipping chat messages`);
        return [];
      }

      // Fetch chat messages for the user
      const url = `https://graph.microsoft.com/v1.0/users/${user.id}/chats?$expand=messages&$filter=messages/any(m:m/createdDateTime ge '${startDate.toISOString()}' and m/createdDateTime le '${endDate.toISOString()}')&$top=100`;

      this.logger.debug(`Fetching Teams chat messages from: ${url}`);

      const response = await this.makeTeamsRequest(url);
      const chats = response.value || [];

      // Extract messages from chats
      for (const chat of chats) {
        if (chat.messages && Array.isArray(chat.messages)) {
          const chatMessages = chat.messages.filter((msg: TeamsMessage) =>
            msg.from?.user?.email === userEmail &&
            new Date(msg.createdDateTime) >= startDate &&
            new Date(msg.createdDateTime) <= endDate
          );
          messages.push(...chatMessages);
        }
      }

      this.logger.debug(`Found ${messages.length} chat messages for user ${userEmail}`);
      return messages;
    } catch (error) {
      this.logger.warn('Failed to fetch chat messages:', error);
      return [];
    }
  }
}
