import { setEndOfDay } from './string.utils';

/**
 * Utility class for date range processing and iteration
 */
export class DateRangeIterator {
  /**
   * Iterate through a date range efficiently
   */
  static *iterateDateRange(startDate: Date, endDate: Date): Generator<Date> {
    const current = new Date(startDate);
    while (current <= endDate) {
      yield new Date(current);
      current.setDate(current.getDate() + 1);
    }
  }

  /**
   * Get all dates in a range as an array
   */
  static getDateRange(startDate: Date, endDate: Date): Date[] {
    return Array.from(this.iterateDateRange(startDate, endDate));
  }

  /**
   * Get the number of days in a date range
   */
  static getDaysInRange(startDate: Date, endDate: Date): number {
    if (endDate < startDate) {
      return 0;
    }
    const timeDiff = endDate.getTime() - startDate.getTime();
    return Math.ceil(timeDiff / (1000 * 3600 * 24)) + 1;
  }

  /**
   * Check if a date is within a range (inclusive)
   */
  static isDateInRange(date: Date, startDate: Date, endDate: Date): boolean {
    return date >= startDate && date <= endDate;
  }

    /**
   * Get the start and end of day for a given date
   */
  static getDayBounds(date: Date): { startOfDay: Date; endOfDay: Date } {
    const startOfDay = new Date(date);
    startOfDay.setUTCHours(0, 0, 0, 0);

    const endOfDay = setEndOfDay(date);

    return { startOfDay, endOfDay };
  }

  /**
   * Format a date range for display
   */
  static formatDateRange(startDate: Date, endDate: Date): string {
    const startStr = startDate.toISOString().split('T')[0];
    const endStr = endDate.toISOString().split('T')[0];

    if (startStr === endStr) {
      return startStr;
    }

    return `${startStr} to ${endStr}`;
  }

    /**
   * Get a date range with proper bounds (start of day to end of day)
   */
  static getBoundedDateRange(startDate: Date, endDate: Date): { startOfDay: Date; endOfDay: Date } {
    const startOfDay = new Date(startDate);
    startOfDay.setUTCHours(0, 0, 0, 0);

    const endOfDay = setEndOfDay(endDate);

    return { startOfDay, endOfDay };
  }

  /**
   * Parse a date string and return a Date object
   */
  static parseDate(dateString: string): Date {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) {
      throw new Error(`Invalid date string: ${dateString}`);
    }
    return date;
  }

  /**
   * Validate a date range (start date should be before or equal to end date)
   */
  static validateDateRange(startDate: Date, endDate: Date): boolean {
    return startDate <= endDate;
  }

  /**
   * Get a human-readable description of a date range
   */
  static getDateRangeDescription(startDate: Date, endDate: Date): string {
    const days = this.getDaysInRange(startDate, endDate);

    if (days === 1) {
      return `single day (${startDate.toISOString().split('T')[0]})`;
    } else if (days <= 7) {
      return `${days} days`;
    } else if (days <= 31) {
      const weeks = Math.ceil(days / 7);
      return `${weeks} week${weeks > 1 ? 's' : ''}`;
    } else {
      const months = Math.ceil(days / 30);
      return `${months} month${months > 1 ? 's' : ''}`;
    }
  }
}
