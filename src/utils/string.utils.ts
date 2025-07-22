/**
 * String utility functions for consistent string handling across the application
 */

/**
 * Sets a date to the end of the day (23:59:59.999) using UTC to preserve the original timezone
 * @param date The date to modify
 * @returns A new Date object set to the end of the day in UTC
 */
export function setEndOfDay(date: Date): Date {
  const d = new Date(date);
  d.setUTCHours(23, 59, 59, 999);
  return d;
}

/**
 * Sets a date to the start of the day (00:00:00.000) using UTC to preserve the original timezone
 * @param date The date to modify
 * @returns A new Date object set to the start of the day in UTC
 */
export function setStartOfDay(date: Date): Date {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/**
 * Safely truncates a string to a specified length
 * @param text The text to truncate
 * @param maxLength Maximum length before truncation
 * @param suffix Suffix to add when truncated (default: '...')
 * @returns The truncated string or original if no truncation needed
 */
export function safeTruncate(text: string | undefined | null, maxLength: number, suffix: string = '...'): string {
  if (!text || typeof text !== 'string') {
    return '';
  }

  if (text.length <= maxLength) {
    return text;
  }

  return text.substring(0, maxLength) + suffix;
}

/**
 * Safely extracts a substring from text with type checking
 * @param text The text to process
 * @param start Start index
 * @param end End index
 * @returns The substring or empty string if invalid
 */
export function safeSubstring(text: string | undefined | null, start: number, end?: number): string {
  if (!text || typeof text !== 'string') {
    return '';
  }

  return text.substring(start, end);
}

/**
 * Formats activity description for display with safe truncation
 * @param description The description to format
 * @param maxLength Maximum length (default: 300)
 * @returns Formatted description string
 */
export function formatActivityDescription(description: string | undefined | null, maxLength: number = 300): string {
  if (!description || typeof description !== 'string') {
    return '';
  }

  return ` - ${safeTruncate(description, maxLength)}`;
}

/**
 * Safely checks if a value is a non-empty string
 * @param value The value to check
 * @returns True if the value is a non-empty string
 */
export function isNonEmptyString(value: any): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Safely gets the length of a string, returning 0 for non-strings
 * @param value The value to check
 * @returns The length of the string or 0
 */
export function safeStringLength(value: any): number {
  return typeof value === 'string' ? value.length : 0;
}

/**
 * Creates a truncated title with smart suffix handling
 * @param text The text to truncate
 * @param maxLength Maximum length before truncation
 * @param context Optional context for the truncation
 * @returns The truncated title
 */
export function createTruncatedTitle(text: string | undefined | null, maxLength: number, context?: string): string {
  if (!text || typeof text !== 'string') {
    return context || 'Untitled';
  }

  if (text.length <= maxLength) {
    return text;
  }

  // Try to truncate at a word boundary
  const truncated = text.substring(0, maxLength);
  const lastSpace = truncated.lastIndexOf(' ');

  if (lastSpace > maxLength * 0.8) { // If we can break at a word boundary
    return truncated.substring(0, lastSpace) + '...';
  }

  return truncated + '...';
}

/**
 * Formats a comment or description for display in activity summaries
 * @param content The content to format
 * @param maxLength Maximum length (default: 100)
 * @param prefix Optional prefix to add
 * @returns Formatted content string
 */
export function formatContentForDisplay(content: string | undefined | null, maxLength: number = 100, prefix?: string): string {
  if (!content || typeof content !== 'string') {
    return '';
  }

  const truncated = safeTruncate(content, maxLength);
  return prefix ? `${prefix}${truncated}` : truncated;
}

/**
 * Strips HTML tags from text content
 * @param html The HTML content to strip
 * @returns Plain text without HTML tags
 */
export function stripHtmlTags(html: string | undefined | null): string {
  if (!html || typeof html !== 'string') {
    return '';
  }

  // Simple HTML tag removal - for more complex cases, consider using a library
  return html.replace(/<[^>]*>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

/**
 * Sanitizes text content for safe display
 * @param text The text to sanitize
 * @param maxLength Maximum length (default: 300)
 * @returns Sanitized text
 */
export function sanitizeText(text: string | undefined | null, maxLength: number = 300): string {
  if (!text || typeof text !== 'string') {
    return '';
  }

  // Strip HTML and truncate
  const sanitized = stripHtmlTags(text);
  return safeTruncate(sanitized, maxLength);
}
