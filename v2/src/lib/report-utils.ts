// CREATED: 2026-03-24
// UPDATED: 2026-03-24 18:00 IST (Jerusalem)
//          - Initial implementation

import { isOverdue } from '@/lib/dates';
import type { HoursEntry, Filing, Staff, Client } from '@/types';

// --- Shared aggregation types ---

export interface BreakdownItem {
  id: string;
  name: string;
  hours: number;
}

export interface StaffAggregation {
  staffId: string;
  staffName: string;
  role: string;
  totalHours: number;
  entryCount: number;
  clientBreakdown: BreakdownItem[];
}

export interface ClientHoursAggregation {
  clientId: string;
  clientName: string;
  caseNum: string;
  totalHours: number;
  entryCount: number;
  staffBreakdown: BreakdownItem[];
}

export interface ClientFilingRow {
  clientId: string;
  clientName: string;
  filed: number;
  pending: number;
  late: number;
  total: number;
  completionPct: number;
}

// --- Aggregation functions ---

/** Aggregate hours entries grouped by staff member. Sorted by total hours descending. */
export function aggregateHoursByStaff(
  hours: HoursEntry[],
  staff: Staff[],
  clients: Client[],
): StaffAggregation[] {
  const map = new Map<string, StaffAggregation>();

  for (const entry of hours) {
    const existing = map.get(entry.staffId) || {
      staffId: entry.staffId,
      staffName: entry.staffName,
      role: staff.find((s) => s.id === entry.staffId)?.role ?? '',
      totalHours: 0,
      entryCount: 0,
      clientBreakdown: [],
    };
    existing.totalHours += entry.hours;
    existing.entryCount += 1;

    const clientEntry = existing.clientBreakdown.find((c) => c.id === entry.client_id);
    if (clientEntry) {
      clientEntry.hours += entry.hours;
    } else {
      existing.clientBreakdown.push({
        id: entry.client_id,
        name: clients.find((c) => c.id === entry.client_id)?.name ?? '',
        hours: entry.hours,
      });
    }
    map.set(entry.staffId, existing);
  }

  return Array.from(map.values()).sort((a, b) => b.totalHours - a.totalHours);
}

/** Aggregate hours entries grouped by client. Sorted by total hours descending. */
export function aggregateHoursByClient(
  hours: HoursEntry[],
  staff: Staff[],
  clients: Client[],
): ClientHoursAggregation[] {
  const map = new Map<string, ClientHoursAggregation>();

  for (const entry of hours) {
    const client = clients.find((c) => c.id === entry.client_id);
    const existing = map.get(entry.client_id) || {
      clientId: entry.client_id,
      clientName: client?.name ?? '',
      caseNum: client?.caseNum ?? '',
      totalHours: 0,
      entryCount: 0,
      staffBreakdown: [],
    };
    existing.totalHours += entry.hours;
    existing.entryCount += 1;

    const staffEntry = existing.staffBreakdown.find((s) => s.id === entry.staffId);
    if (staffEntry) {
      staffEntry.hours += entry.hours;
    } else {
      existing.staffBreakdown.push({
        id: entry.staffId,
        name: entry.staffName,
        hours: entry.hours,
      });
    }
    map.set(entry.client_id, existing);
  }

  return Array.from(map.values()).sort((a, b) => b.totalHours - a.totalHours);
}

/**
 * Aggregate filings grouped by client. Returns rows + summary.
 * Uses isOverdue() from dates.ts for timezone-correct late detection.
 */
export function aggregateFilingStatus(
  filings: Filing[],
  clients: Client[],
  summaryLabel: string,
): { rows: ClientFilingRow[]; summary: ClientFilingRow } {
  const map = new Map<string, ClientFilingRow>();

  for (const f of filings) {
    const client = clients.find((c) => c.id === f.client_id);
    const existing = map.get(f.client_id) || {
      clientId: f.client_id,
      clientName: client?.name ?? '',
      filed: 0,
      pending: 0,
      late: 0,
      total: 0,
      completionPct: 0,
    };

    existing.total += 1;

    if (f.status === 'filed') {
      existing.filed += 1;
    } else if (f.status === 'late' || (f.status === 'pending' && isOverdue(f.due))) {
      existing.late += 1;
    } else {
      existing.pending += 1;
    }

    map.set(f.client_id, existing);
  }

  const rows = Array.from(map.values()).map((r) => ({
    ...r,
    completionPct: r.total > 0 ? Math.round((r.filed / r.total) * 100) : 0,
  }));

  const summary: ClientFilingRow = {
    clientId: '__summary__',
    clientName: summaryLabel,
    filed: rows.reduce((s, r) => s + r.filed, 0),
    pending: rows.reduce((s, r) => s + r.pending, 0),
    late: rows.reduce((s, r) => s + r.late, 0),
    total: rows.reduce((s, r) => s + r.total, 0),
    completionPct: 0,
  };
  summary.completionPct =
    summary.total > 0 ? Math.round((summary.filed / summary.total) * 100) : 0;

  return { rows, summary };
}
