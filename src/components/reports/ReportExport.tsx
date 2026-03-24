// CREATED: 2026-03-24
// UPDATED: 2026-03-24 18:00 IST (Jerusalem)
//          - Initial implementation

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
    txt += `דוח שעות לפי עובד\n`;
    txt += `תאריך: ${formatDate(fromDate)} - ${formatDate(toDate)}\n`;
    txt += `${sep}\n`;

    for (const item of agg) {
      const roleLabelKey = STAFF_ROLES[item.role as StaffRole];
      const roleLabel = roleLabelKey ? t(roleLabelKey) : '';
      txt += `\nעובד: ${item.staffName}\n`;
      txt += `תפקיד: ${roleLabel}\n`;
      txt += `סה"כ שעות: ${item.totalHours.toFixed(1)}\n`;
      txt += `מספר רשומות: ${item.entryCount}\n`;
      txt += `${subSep}\n`;
      for (const cb of item.clientBreakdown.sort((a, b) => b.hours - a.hours)) {
        txt += `  לקוח: ${cb.name} — ${cb.hours.toFixed(1)} שעות\n`;
      }
      txt += `${sep}\n`;
    }
    return txt;
  }

  if (activeTab === 'hoursByClient') {
    const agg = aggregateHoursByClient(hours, staff, clients);
    let txt = `${sep}\n`;
    txt += `דוח שעות לפי לקוח\n`;
    txt += `תאריך: ${formatDate(fromDate)} - ${formatDate(toDate)}\n`;
    txt += `${sep}\n`;

    for (const item of agg) {
      txt += `\nלקוח: ${item.clientName} (תיק: ${item.caseNum})\n`;
      txt += `סה"כ שעות: ${item.totalHours.toFixed(1)}\n`;
      txt += `${subSep}\n`;
      for (const sb of item.staffBreakdown.sort((a, b) => b.hours - a.hours)) {
        txt += `  עובד: ${sb.name} — ${sb.hours.toFixed(1)} שעות\n`;
      }
      txt += `${sep}\n`;
    }
    return txt;
  }

  // Filing status
  const { rows, summary } = aggregateFilingStatus(filings, clients, 'סיכום');
  let txt = `${sep}\n`;
  txt += `דוח סטטוס הגשות — שנת ${filingYear}\n`;
  txt += `${sep}\n`;

  for (const row of rows) {
    txt += `\nלקוח: ${row.clientName}\n`;
    txt += `הוגש: ${row.filed} | ממתין: ${row.pending} | באיחור: ${row.late} | סה"כ: ${row.total} | השלמה: ${row.completionPct}%\n`;
    txt += `${sep}\n`;
  }

  txt += `\nסיכום כללי:\n`;
  txt += `הוגש: ${summary.filed} | ממתין: ${summary.pending} | באיחור: ${summary.late} | סה"כ: ${summary.total} | השלמה: ${summary.completionPct}%\n`;
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
): string {
  const BOM = '\uFEFF';

  if (activeTab === 'hoursByStaff') {
    const agg = aggregateHoursByStaff(hours, staff, clients);
    const header = [csvField('עובד'), csvField('תפקיד'), csvField('סה"כ שעות'), csvField('רשומות')].join(',');
    const rows = agg.map((item) =>
      [csvField(item.staffName), csvField(item.role), csvField(item.totalHours.toFixed(1)), csvField(item.entryCount)].join(',')
    );
    return BOM + [header, ...rows].join('\n');
  }

  if (activeTab === 'hoursByClient') {
    const agg = aggregateHoursByClient(hours, staff, clients);
    const header = [csvField('לקוח'), csvField('מספר תיק'), csvField('סה"כ שעות'), csvField('רשומות')].join(',');
    const rows = agg.map((item) =>
      [csvField(item.clientName), csvField(item.caseNum), csvField(item.totalHours.toFixed(1)), csvField(item.entryCount)].join(',')
    );
    return BOM + [header, ...rows].join('\n');
  }

  // Filing status
  const { rows, summary } = aggregateFilingStatus(filings, clients, 'סיכום');
  const header = [csvField('לקוח'), csvField('הוגש'), csvField('ממתין'), csvField('באיחור'), csvField('סה"כ'), csvField('אחוז השלמה')].join(',');
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
        : generateCsvContent(activeTab, hours, filings, staff, clients, fromDate, toDate, filingYear);

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
