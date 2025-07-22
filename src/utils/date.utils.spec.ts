import { DateRangeIterator } from './date.utils';

describe('DateRangeIterator', () => {
  describe('iterateDateRange', () => {
    it('should iterate through a date range', () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-03');

      const dates = Array.from(DateRangeIterator.iterateDateRange(startDate, endDate));

      expect(dates).toHaveLength(3);
      expect(dates[0].toISOString().split('T')[0]).toBe('2024-01-01');
      expect(dates[1].toISOString().split('T')[0]).toBe('2024-01-02');
      expect(dates[2].toISOString().split('T')[0]).toBe('2024-01-03');
    });

    it('should handle single day range', () => {
      const date = new Date('2024-01-01');
      const dates = Array.from(DateRangeIterator.iterateDateRange(date, date));

      expect(dates).toHaveLength(1);
      expect(dates[0].toISOString().split('T')[0]).toBe('2024-01-01');
    });

    it('should handle empty range (end before start)', () => {
      const startDate = new Date('2024-01-03');
      const endDate = new Date('2024-01-01');

      const dates = Array.from(DateRangeIterator.iterateDateRange(startDate, endDate));

      expect(dates).toHaveLength(0);
    });
  });

  describe('getDateRange', () => {
    it('should return array of dates in range', () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-03');

      const dates = DateRangeIterator.getDateRange(startDate, endDate);

      expect(dates).toHaveLength(3);
      expect(dates[0].toISOString().split('T')[0]).toBe('2024-01-01');
      expect(dates[1].toISOString().split('T')[0]).toBe('2024-01-02');
      expect(dates[2].toISOString().split('T')[0]).toBe('2024-01-03');
    });
  });

  describe('getDaysInRange', () => {
    it('should calculate correct number of days', () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-03');

      const days = DateRangeIterator.getDaysInRange(startDate, endDate);

      expect(days).toBe(3);
    });

    it('should handle single day', () => {
      const date = new Date('2024-01-01');
      const days = DateRangeIterator.getDaysInRange(date, date);

      expect(days).toBe(1);
    });

    it('should handle empty range', () => {
      const startDate = new Date('2024-01-03');
      const endDate = new Date('2024-01-01');

      const days = DateRangeIterator.getDaysInRange(startDate, endDate);

      expect(days).toBe(0);
    });
  });

  describe('isDateInRange', () => {
    it('should return true for date within range', () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-03');
      const testDate = new Date('2024-01-02');

      const result = DateRangeIterator.isDateInRange(testDate, startDate, endDate);

      expect(result).toBe(true);
    });

    it('should return true for start date', () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-03');

      const result = DateRangeIterator.isDateInRange(startDate, startDate, endDate);

      expect(result).toBe(true);
    });

    it('should return true for end date', () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-03');

      const result = DateRangeIterator.isDateInRange(endDate, startDate, endDate);

      expect(result).toBe(true);
    });

    it('should return false for date outside range', () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-03');
      const testDate = new Date('2024-01-05');

      const result = DateRangeIterator.isDateInRange(testDate, startDate, endDate);

      expect(result).toBe(false);
    });
  });

  describe('getDayBounds', () => {
    it('should return start and end of day', () => {
      const date = new Date('2024-01-01T12:30:45.123Z');
      const bounds = DateRangeIterator.getDayBounds(date);

      expect(bounds.startOfDay.getUTCHours()).toBe(0);
      expect(bounds.startOfDay.getUTCMinutes()).toBe(0);
      expect(bounds.startOfDay.getUTCSeconds()).toBe(0);
      expect(bounds.startOfDay.getUTCMilliseconds()).toBe(0);

      expect(bounds.endOfDay.getUTCHours()).toBe(23);
      expect(bounds.endOfDay.getUTCMinutes()).toBe(59);
      expect(bounds.endOfDay.getUTCSeconds()).toBe(59);
      expect(bounds.endOfDay.getUTCMilliseconds()).toBe(999);
    });
  });

  describe('formatDateRange', () => {
    it('should format single day', () => {
      const date = new Date('2024-01-01');
      const result = DateRangeIterator.formatDateRange(date, date);

      expect(result).toBe('2024-01-01');
    });

    it('should format date range', () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-03');
      const result = DateRangeIterator.formatDateRange(startDate, endDate);

      expect(result).toBe('2024-01-01 to 2024-01-03');
    });
  });

  describe('getBoundedDateRange', () => {
    it('should return bounded date range', () => {
      const startDate = new Date('2024-01-01T12:30:45Z');
      const endDate = new Date('2024-01-03T18:45:30Z');

      const bounds = DateRangeIterator.getBoundedDateRange(startDate, endDate);

      expect(bounds.startOfDay.getUTCHours()).toBe(0);
      expect(bounds.startOfDay.getUTCMinutes()).toBe(0);
      expect(bounds.startOfDay.getUTCSeconds()).toBe(0);
      expect(bounds.startOfDay.getUTCMilliseconds()).toBe(0);

      expect(bounds.endOfDay.getUTCHours()).toBe(23);
      expect(bounds.endOfDay.getUTCMinutes()).toBe(59);
      expect(bounds.endOfDay.getUTCSeconds()).toBe(59);
      expect(bounds.endOfDay.getUTCMilliseconds()).toBe(999);
    });
  });

  describe('parseDate', () => {
    it('should parse valid date string', () => {
      const dateString = '2024-01-01T10:00:00Z';
      const result = DateRangeIterator.parseDate(dateString);

      expect(result).toEqual(new Date(dateString));
    });

    it('should throw error for invalid date string', () => {
      const invalidDateString = 'invalid-date';

      expect(() => DateRangeIterator.parseDate(invalidDateString)).toThrow('Invalid date string: invalid-date');
    });
  });

  describe('validateDateRange', () => {
    it('should return true for valid range', () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-03');

      const result = DateRangeIterator.validateDateRange(startDate, endDate);

      expect(result).toBe(true);
    });

    it('should return true for same start and end date', () => {
      const date = new Date('2024-01-01');

      const result = DateRangeIterator.validateDateRange(date, date);

      expect(result).toBe(true);
    });

    it('should return false for invalid range', () => {
      const startDate = new Date('2024-01-03');
      const endDate = new Date('2024-01-01');

      const result = DateRangeIterator.validateDateRange(startDate, endDate);

      expect(result).toBe(false);
    });
  });

  describe('getDateRangeDescription', () => {
    it('should describe single day', () => {
      const date = new Date('2024-01-01');
      const result = DateRangeIterator.getDateRangeDescription(date, date);

      expect(result).toBe('single day (2024-01-01)');
    });

    it('should describe multiple days', () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-05');
      const result = DateRangeIterator.getDateRangeDescription(startDate, endDate);

      expect(result).toBe('5 days');
    });

    it('should describe weeks', () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-15');
      const result = DateRangeIterator.getDateRangeDescription(startDate, endDate);

      expect(result).toBe('3 weeks');
    });

    it('should describe months', () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-03-15');
      const result = DateRangeIterator.getDateRangeDescription(startDate, endDate);

      expect(result).toBe('3 months');
    });
  });
});
