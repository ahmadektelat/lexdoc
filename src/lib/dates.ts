// CREATED: 2026-03-17
// UPDATED: 2026-03-17 14:30 IST (Jerusalem)

import { format, differenceInDays, addMonths as dfnsAddMonths, addDays as dfnsAddDays, parseISO, isBefore, startOfDay } from 'date-fns';

/** Format ISO date string as DD/MM/YYYY. */
export function formatDate(iso: string): string {
  return format(parseISO(iso), 'dd/MM/yyyy');
}

/** Format ISO datetime string as DD/MM/YYYY HH:MM. */
export function formatDateTime(iso: string): string {
  return format(parseISO(iso), 'dd/MM/yyyy HH:mm');
}

/** Days remaining until an expiry date. Negative if expired. */
export function daysLeft(expiry: string): number {
  return differenceInDays(parseISO(expiry), startOfDay(new Date()));
}

/** Add n months to a date. */
export function addMonths(date: Date, n: number): Date {
  return dfnsAddMonths(date, n);
}

/** Add n days to a date. */
export function addDays(date: Date, n: number): Date {
  return dfnsAddDays(date, n);
}

/** Check if a due date (ISO string) is in the past. */
export function isOverdue(dueDate: string): boolean {
  return isBefore(parseISO(dueDate), startOfDay(new Date()));
}

/** Get today's date as ISO date string (YYYY-MM-DD). */
export function getToday(): string {
  return format(new Date(), 'yyyy-MM-dd');
}
