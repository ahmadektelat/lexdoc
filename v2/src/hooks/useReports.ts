// CREATED: 2026-03-24
// UPDATED: 2026-03-24 18:00 IST (Jerusalem)
//          - Initial implementation

import { useQuery } from '@tanstack/react-query';
import { reportService } from '@/services/reportService';
import type { HoursEntry, Filing } from '@/types';

export const reportKeys = {
  all: ['reports'] as const,
  hours: (firmId: string, from: string, to: string) =>
    [...reportKeys.all, 'hours', firmId, from, to] as const,
  filings: (firmId: string, year: number) =>
    [...reportKeys.all, 'filings', firmId, year] as const,
};

export function useReportHours(firmId: string | null, fromDate: string, toDate: string) {
  return useQuery<HoursEntry[]>({
    queryKey: reportKeys.hours(firmId ?? '', fromDate, toDate),
    queryFn: () => reportService.hoursByFirm(firmId!, fromDate, toDate),
    enabled: !!firmId,
  });
}

export function useReportFilings(firmId: string | null, year: number) {
  return useQuery<Filing[]>({
    queryKey: reportKeys.filings(firmId ?? '', year),
    queryFn: () => reportService.filingsByFirm(firmId!, year),
    enabled: !!firmId,
  });
}
