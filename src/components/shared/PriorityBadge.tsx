// CREATED: 2026-03-17
// UPDATED: 2026-03-17 14:30 IST (Jerusalem)

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/contexts/LanguageContext';

type Priority = 'high' | 'medium' | 'low';

export interface PriorityBadgeProps {
  priority: Priority;
  className?: string;
}

const PRIORITY_COLORS: Record<Priority, string> = {
  high: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  medium: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  low: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
};

export function PriorityBadge({ priority, className }: PriorityBadgeProps) {
  const { t } = useLanguage();

  return (
    <Badge className={cn('border-transparent', PRIORITY_COLORS[priority], className)}>
      {t(`priority.${priority}`)}
    </Badge>
  );
}
