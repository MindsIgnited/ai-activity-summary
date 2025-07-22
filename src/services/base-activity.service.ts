import { Logger } from '@nestjs/common';
import { ActivityData } from '../app.service';

/**
 * Base service class that consolidates common patterns for activity services
 */
export abstract class BaseActivityService {
  protected abstract readonly serviceName: string;
  protected abstract readonly logger: Logger;

  /**
   * Check if the service is properly configured
   */
  protected abstract isConfigured(): boolean;

  /**
   * Fetch activities for a specific date - to be implemented by subclasses
   */
  protected abstract fetchActivitiesForDate(date: Date): Promise<ActivityData[]>;

  /**
   * Common fetchActivities implementation used by all services
   */
  async fetchActivities(date: Date): Promise<ActivityData[]> {
    if (!this.isConfigured()) {
      this.logger.warn(`${this.serviceName} not properly configured, skipping activities`);
      return [];
    }

    this.logger.log(`Fetching ${this.serviceName} activities for ${date.toISOString().split('T')[0]}`);
    const activities: ActivityData[] = [];

    try {
      const fetchedActivities = await this.fetchActivitiesForDate(date);
      activities.push(...fetchedActivities);

      this.logger.log(`Fetched ${activities.length} ${this.serviceName} activities for ${date.toISOString().split('T')[0]}`);
    } catch (error) {
      this.logger.error(`Error fetching ${this.serviceName} activities for ${date.toISOString()}:`, error);
    }

    return activities;
  }

  /**
   * Common method to handle service-specific errors with proper logging
   */
  protected handleServiceError(error: Error, operation: string, context?: Record<string, any>): void {
    this.logger.error(`${this.serviceName} ${operation} failed:`, {
      error: error.message,
      stack: error.stack,
      ...context,
    });
  }

  /**
   * Common method to log service-specific warnings
   */
  protected logServiceWarning(message: string, context?: Record<string, any>): void {
    this.logger.warn(`${this.serviceName}: ${message}`, context);
  }

  /**
   * Common method to log service-specific debug information
   */
  protected logServiceDebug(message: string, context?: Record<string, any>): void {
    this.logger.debug(`${this.serviceName}: ${message}`, context);
  }
}
