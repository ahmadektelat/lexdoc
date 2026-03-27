// CREATED: 2026-03-17
// UPDATED: 2026-03-17 14:30 IST (Jerusalem)
//          - Uses Hebrew transliteration filing codes (amendment 1)

import { format, parseISO, addMonths, subDays } from 'date-fns';
import type { Filing, FilingType, FilingSetting } from '@/types';
import { FILING_TYPES, FILING_TYPE_COLORS, AUTO_TASK_LEAD_DAYS } from './constants';

/**
 * Calculate filing due date: 15th of the month after the period end.
 * @param periodEnd - ISO date string (last day of the period, e.g., "2026-01-31")
 * @returns ISO date string for the due date
 */
export function calculateDueDate(periodEnd: string): string {
  const endDate = parseISO(periodEnd);
  const nextMonth = addMonths(endDate, 1);
  return format(new Date(nextMonth.getFullYear(), nextMonth.getMonth(), 15), 'yyyy-MM-dd');
}

/** Generate all 12 monthly periods for a given year. */
export function getMonthlyPeriods(year: number): { start: string; end: string }[] {
  const periods: { start: string; end: string }[] = [];
  for (let m = 0; m < 12; m++) {
    const start = new Date(year, m, 1);
    const end = new Date(year, m + 1, 0); // last day of month
    periods.push({
      start: format(start, 'yyyy-MM-dd'),
      end: format(end, 'yyyy-MM-dd'),
    });
  }
  return periods;
}

/** Generate all 6 bimonthly periods for a given year. */
export function getBimonthlyPeriods(year: number): { start: string; end: string }[] {
  const periods: { start: string; end: string }[] = [];
  for (let m = 0; m < 12; m += 2) {
    const start = new Date(year, m, 1);
    const end = new Date(year, m + 2, 0); // last day of second month
    periods.push({
      start: format(start, 'yyyy-MM-dd'),
      end: format(end, 'yyyy-MM-dd'),
    });
  }
  return periods;
}

/**
 * Generate a full year of filing records for a client based on their settings.
 * Returns partial Filing objects (without id, firm_id, timestamps).
 */
export function generateFilingSchedule(
  settings: FilingSetting,
  year: number
): Partial<Filing>[] {
  const filings: Partial<Filing>[] = [];

  const addFilings = (type: FilingType, freq: 'monthly' | 'bimonthly') => {
    const periods = freq === 'monthly' ? getMonthlyPeriods(year) : getBimonthlyPeriods(year);
    for (const p of periods) {
      filings.push({
        client_id: settings.clientId,
        type,
        period: freq === 'monthly'
          ? format(parseISO(p.start), 'yyyy-MM')
          : `${format(parseISO(p.start), 'yyyy-MM')}/${format(parseISO(p.end), 'yyyy-MM')}`,
        due: calculateDueDate(p.end),
        status: 'pending',
      });
    }
  };

  // VAT is always enabled for clients that have filing settings
  addFilings('maam', settings.vatFreq);

  if (settings.taxAdvEnabled) {
    addFilings('mekadmot', settings.taxAdvFreq);
  }
  if (settings.taxDeductEnabled) {
    addFilings('nikuyim', settings.taxDeductFreq);
  }
  if (settings.niiDeductEnabled) {
    addFilings('nii', settings.niiDeductFreq);
  }

  return filings;
}

/** Get the Hebrew label for a filing type. */
export function getFilingTypeLabel(type: FilingType): string {
  return FILING_TYPES[type];
}

/** Get the color key for a filing type. */
export function getFilingTypeColor(type: FilingType): string {
  return FILING_TYPE_COLORS[type];
}

/**
 * Calculate the auto-task due date for a filing.
 * Returns a date AUTO_TASK_LEAD_DAYS before the filing due date.
 */
export function taskDueDateForFiling(filingDueDate: string): string {
  return format(subDays(parseISO(filingDueDate), AUTO_TASK_LEAD_DAYS), 'yyyy-MM-dd');
}

/** Get the auto-generated task label for a filing type. */
export function getAutoTaskLabel(type: FilingType): string {
  return `הגשת ${FILING_TYPES[type]}`;
}
