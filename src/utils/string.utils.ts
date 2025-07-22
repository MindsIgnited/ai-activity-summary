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
