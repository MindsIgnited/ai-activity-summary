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
