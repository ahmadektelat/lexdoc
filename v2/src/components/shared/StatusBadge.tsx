// CREATED: 2026-03-17
// UPDATED: 2026-03-17 14:30 IST (Jerusalem)

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/contexts/LanguageContext';

type Status = 'filed' | 'pending' | 'late' | 'active' | 'archived' | 'sent' | 'paid' | 'open' | 'done' | 'cancelled' | 'failed';

export interface StatusBadgeProps {
  status: Status;
  className?: string;
}

const STATUS_COLORS: Record<Status, string> = {
  filed: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  active: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  sent: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  paid: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  done: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  pending: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  open: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  late: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  cancelled: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  failed: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  archived: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400',
};

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const { t } = useLanguage();

  return (
    <Badge className={cn('border-transparent', STATUS_COLORS[status], className)}>
      {t(`status.${status}`)}
    </Badge>
  );
}
