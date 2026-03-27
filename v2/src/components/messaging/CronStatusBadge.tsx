// CREATED: 2026-03-26
// UPDATED: 2026-03-26 12:30 IST (Jerusalem)
//          - Initial implementation — small badge showing cron status

import { useCronStatus } from '@/hooks/useMessages';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

export function CronStatusBadge() {
  const { t } = useLanguage();
  const { data: isActive } = useCronStatus();

  // While loading, don't render anything
  if (isActive === undefined) return null;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <span
              className={`inline-block h-2 w-2 rounded-full ${
                isActive
                  ? 'bg-green-500'
                  : 'bg-yellow-500'
              }`}
            />
          </span>
        </TooltipTrigger>
        <TooltipContent>
          <p>{isActive ? t('messaging.cronActive') : t('messaging.cronInactive')}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
