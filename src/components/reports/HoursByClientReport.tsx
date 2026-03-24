// CREATED: 2026-03-24
// UPDATED: 2026-03-24 18:00 IST (Jerusalem)
//          - Initial implementation

import { useState, useMemo } from 'react';
import { Clock } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { EmptyState } from '@/components/shared/EmptyState';
import { aggregateHoursByClient } from '@/lib/report-utils';
import type { ClientHoursAggregation } from '@/lib/report-utils';
import type { HoursEntry, Staff, Client } from '@/types';

interface HoursByClientReportProps {
  hours: HoursEntry[];
  staff: Staff[];
  clients: Client[];
}

export function HoursByClientReport({ hours, staff, clients }: HoursByClientReportProps) {
  const { t } = useLanguage();
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const aggregated = useMemo<ClientHoursAggregation[]>(
    () => aggregateHoursByClient(hours, staff, clients),
    [hours, staff, clients],
  );

  const maxHours = aggregated[0]?.totalHours ?? 1;

  const toggleExpand = (clientId: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(clientId)) next.delete(clientId);
      else next.add(clientId);
      return next;
    });
  };

  if (aggregated.length === 0) {
    return <EmptyState icon={Clock} title={t('reports.noData')} />;
  }

  return (
    <div className="space-y-3">
      {aggregated.map((agg) => (
        <div
          key={agg.clientId}
          className="border rounded-lg p-4 bg-card cursor-pointer hover:bg-muted/50 transition-colors"
          onClick={() => toggleExpand(agg.clientId)}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-sm font-medium text-primary">
                {agg.clientName.charAt(0)}
              </div>
              <div>
                <div className="font-medium">{agg.clientName}</div>
                <div className="text-xs text-muted-foreground" dir="ltr">
                  {agg.caseNum}
                </div>
              </div>
            </div>
            <div className="text-end">
              <div className="font-bold text-lg" dir="ltr">{agg.totalHours.toFixed(1)}</div>
              <div className="text-xs text-muted-foreground">
                {agg.entryCount} {t('reports.entries')}
              </div>
            </div>
          </div>

          {/* Progress bar */}
          <div className="mt-3 h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all"
              style={{ width: `${(agg.totalHours / maxHours) * 100}%` }}
            />
          </div>

          {/* Expandable staff breakdown */}
          {expandedIds.has(agg.clientId) && (
            <div className="mt-3 pt-3 border-t flex flex-wrap gap-2">
              {agg.staffBreakdown
                .sort((a, b) => b.hours - a.hours)
                .map((sb) => (
                  <span
                    key={sb.id}
                    className="inline-flex items-center gap-1 px-2 py-1 bg-muted rounded-md text-xs"
                  >
                    <span>{sb.name}</span>
                    <span className="font-medium" dir="ltr">{sb.hours.toFixed(1)}</span>
                  </span>
                ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
