// CREATED: 2026-03-24
// UPDATED: 2026-03-24 18:30 IST (Jerusalem)
//          - Replaced all hardcoded Hebrew with t() calls
//          - Fixed CSV role column to use translated label
//          - Added t parameter to generateCsvContent

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';
import { toast } from 'sonner';
import {
  aggregateHoursByStaff,
  aggregateHoursByClient,
  aggregateFilingStatus,
} from '@/lib/report-utils';
import { formatDate } from '@/lib/dates';
import { STAFF_ROLES } from '@/lib/constants';
import type { HoursEntry, Filing, Staff, Client, StaffRole } from '@/types';

interface ReportExportProps {
  activeTab: string;
  hours: HoursEntry[];
  filings: Filing[];
  staff: Staff[];
  clients: Client[];
  fromDate: string;
  toDate: string;
  filingYear: number;
  t: (key: string) => string;
}

function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function getDateStamp(): string {
  return new Date().toISOString().split('T')[0];
}

/** Sanitize a cell value to prevent CSV formula injection. */
function sanitizeCsvValue(value: string): string {
  if (/^[=+\-@\t\r]/.test(value)) {
    return "'" + value;
  }
  return value;
}

function csvField(value: string | number): string {
  const str = sanitizeCsvValue(String(value));
  return `"${str.replace(/"/g, '""')}"`;
}

function getRoleLabel(role: string, t: (key: string) => string): string {
  const roleLabelKey = STAFF_ROLES[role as StaffRole];
  return roleLabelKey ? t(roleLabelKey) : '';
}

function generateTxtContent(
  activeTab: string,
  hours: HoursEntry[],
  filings: Filing[],
  staff: Staff[],
  clients: Client[],
  fromDate: string,
  toDate: string,
  filingYear: number,
  t: (key: string) => string,
): string {
  const sep = '========================================';
  const subSep = '----------------------------------------';

  if (activeTab === 'hoursByStaff') {
    const agg = aggregateHoursByStaff(hours, staff, clients);
    let txt = `${sep}\n`;
    txt += `${t('reports.tabs.hoursByStaff')}\n`;
    txt += `${t('reports.export.dateLabel')}: ${formatDate(fromDate)} - ${formatDate(toDate)}\n`;
    txt += `${sep}\n`;

    for (const item of agg) {
      txt += `\n${t('reports.export.staffLabel')}: ${item.staffName}\n`;
      txt += `${t('reports.export.roleLabel')}: ${getRoleLabel(item.role, t)}\n`;
      txt += `${t('reports.totalHours')}: ${item.totalHours.toFixed(1)}\n`;
      txt += `${t('reports.export.entryCount')}: ${item.entryCount}\n`;
      txt += `${subSep}\n`;
      for (const cb of item.clientBreakdown.sort((a, b) => b.hours - a.hours)) {
        txt += `  ${t('reports.export.clientLabel')}: ${cb.name} — ${cb.hours.toFixed(1)} ${t('reports.export.hoursUnit')}\n`;
      }
      txt += `${sep}\n`;
    }
    return txt;
  }

  if (activeTab === 'hoursByClient') {
    const agg = aggregateHoursByClient(hours, staff, clients);
    let txt = `${sep}\n`;
    txt += `${t('reports.tabs.hoursByClient')}\n`;
    txt += `${t('reports.export.dateLabel')}: ${formatDate(fromDate)} - ${formatDate(toDate)}\n`;
    txt += `${sep}\n`;

    for (const item of agg) {
      txt += `\n${t('reports.export.clientLabel')}: ${item.clientName} (${t('reports.export.caseLabel')}: ${item.caseNum})\n`;
      txt += `${t('reports.totalHours')}: ${item.totalHours.toFixed(1)}\n`;
      txt += `${subSep}\n`;
      for (const sb of item.staffBreakdown.sort((a, b) => b.hours - a.hours)) {
        txt += `  ${t('reports.export.staffLabel')}: ${sb.name} — ${sb.hours.toFixed(1)} ${t('reports.export.hoursUnit')}\n`;
      }
      txt += `${sep}\n`;
    }
    return txt;
  }

  // Filing status
  const { rows, summary } = aggregateFilingStatus(filings, clients, t('reports.summaryRow'));
  let txt = `${sep}\n`;
  txt += `${t('reports.tabs.filingStatus')} — ${t('reports.year')} ${filingYear}\n`;
  txt += `${sep}\n`;

  for (const row of rows) {
    txt += `\n${t('reports.export.clientLabel')}: ${row.clientName}\n`;
    txt += `${t('reports.filed')}: ${row.filed} | ${t('reports.pending')}: ${row.pending} | ${t('reports.late')}: ${row.late} | ${t('reports.total')}: ${row.total} | ${t('reports.completion')}: ${row.completionPct}%\n`;
    txt += `${sep}\n`;
  }

  txt += `\n${t('reports.export.overallSummary')}:\n`;
  txt += `${t('reports.filed')}: ${summary.filed} | ${t('reports.pending')}: ${summary.pending} | ${t('reports.late')}: ${summary.late} | ${t('reports.total')}: ${summary.total} | ${t('reports.completion')}: ${summary.completionPct}%\n`;
  return txt;
}

function generateCsvContent(
  activeTab: string,
  hours: HoursEntry[],
  filings: Filing[],
  staff: Staff[],
  clients: Client[],
  fromDate: string,
  toDate: string,
  filingYear: number,
  t: (key: string) => string,
): string {
  const BOM = '\uFEFF';

  if (activeTab === 'hoursByStaff') {
    const agg = aggregateHoursByStaff(hours, staff, clients);
    const header = [csvField(t('reports.export.staffLabel')), csvField(t('reports.export.roleLabel')), csvField(t('reports.totalHours')), csvField(t('reports.entries'))].join(',');
    const rows = agg.map((item) =>
      [csvField(item.staffName), csvField(getRoleLabel(item.role, t)), csvField(item.totalHours.toFixed(1)), csvField(item.entryCount)].join(',')
    );
    return BOM + [header, ...rows].join('\n');
  }

  if (activeTab === 'hoursByClient') {
    const agg = aggregateHoursByClient(hours, staff, clients);
    const header = [csvField(t('reports.export.clientLabel')), csvField(t('reports.export.caseLabel')), csvField(t('reports.totalHours')), csvField(t('reports.entries'))].join(',');
    const rows = agg.map((item) =>
      [csvField(item.clientName), csvField(item.caseNum), csvField(item.totalHours.toFixed(1)), csvField(item.entryCount)].join(',')
    );
    return BOM + [header, ...rows].join('\n');
  }

  // Filing status
  const { rows, summary } = aggregateFilingStatus(filings, clients, t('reports.summaryRow'));
  const header = [csvField(t('reports.export.clientLabel')), csvField(t('reports.filed')), csvField(t('reports.pending')), csvField(t('reports.late')), csvField(t('reports.total')), csvField(t('reports.completion'))].join(',');
  const dataRows = [...rows, summary].map((row) =>
    [csvField(row.clientName), csvField(row.filed), csvField(row.pending), csvField(row.late), csvField(row.total), csvField(`${row.completionPct}%`)].join(',')
  );
  return BOM + [header, ...dataRows].join('\n');
}

export function ReportExport({
  activeTab,
  hours,
  filings,
  staff,
  clients,
  fromDate,
  toDate,
  filingYear,
  t,
}: ReportExportProps) {
  const tabLabel =
    activeTab === 'hoursByStaff'
      ? 'hours-by-staff'
      : activeTab === 'hoursByClient'
        ? 'hours-by-client'
        : 'filing-status';

  const handleExport = (format: 'txt' | 'csv') => {
    const content =
      format === 'txt'
        ? generateTxtContent(activeTab, hours, filings, staff, clients, fromDate, toDate, filingYear, t)
        : generateCsvContent(activeTab, hours, filings, staff, clients, fromDate, toDate, filingYear, t);

    const filename = `lexdoc-${tabLabel}-${getDateStamp()}.${format}`;
    const mimeType = format === 'txt' ? 'text/plain;charset=utf-8' : 'text/csv;charset=utf-8';
    downloadFile(content, filename, mimeType);
    toast.success(t('reports.exportSuccess'));
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          <Download className="h-4 w-4 me-2" />
          {t('reports.export')}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem onClick={() => handleExport('txt')}>
          {t('reports.exportTxt')}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleExport('csv')}>
          {t('reports.exportCsv')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
