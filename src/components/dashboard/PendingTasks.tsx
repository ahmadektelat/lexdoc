// CREATED: 2026-03-24
// UPDATED: 2026-03-24 16:00 IST (Jerusalem)
//          - Initial implementation

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ListTodo } from 'lucide-react';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { EmptyState } from '@/components/shared/EmptyState';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { PriorityBadge } from '@/components/shared/PriorityBadge';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuthStore } from '@/stores/useAuthStore';
import { usePendingTasks, dashboardKeys } from '@/hooks/useDashboard';
import { useToggleTaskStatus } from '@/hooks/useTasks';
import { formatDate, isOverdue } from '@/lib/dates';
import { cn } from '@/lib/utils';

export function PendingTasks() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const firmId = useAuthStore((s) => s.firmId);
  const { data: tasks, isLoading } = usePendingTasks(firmId, 5);
  const toggleStatus = useToggleTaskStatus();
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const handleToggle = (taskId: string) => {
    setTogglingId(taskId);
    toggleStatus.mutate(taskId, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: dashboardKeys.all });
      },
      onSettled: () => {
        setTogglingId(null);
      },
    });
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <h3 className="text-lg font-semibold text-foreground">{t('dashboard.pendingTasks')}</h3>
        <Button variant="ghost" size="sm" onClick={() => navigate('/crm')}>
          {t('dashboard.viewAll')}
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <LoadingSpinner size="sm" className="py-8" />
        ) : !tasks?.length ? (
          <EmptyState icon={ListTodo} title={t('dashboard.noTasks')} />
        ) : (
          <div className="space-y-3">
            {tasks.map((task) => (
              <div
                key={task.id}
                className="flex items-center gap-3 p-2 rounded-md hover:bg-muted/50 transition-colors"
              >
                {togglingId === task.id ? (
                  <LoadingSpinner size="sm" />
                ) : (
                  <Checkbox
                    checked={false}
                    onCheckedChange={() => handleToggle(task.id)}
                    aria-label={t('dashboard.markDone')}
                  />
                )}
                <div
                  className="flex-1 min-w-0 cursor-pointer"
                  onClick={() => navigate('/crm')}
                >
                  <p className="font-medium text-foreground truncate">{task.title}</p>
                  {task.clientName && (
                    <p className="text-sm text-muted-foreground truncate">{task.clientName}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <PriorityBadge priority={task.priority} />
                  {task.dueDate && (
                    <span
                      className={cn(
                        'text-xs',
                        isOverdue(task.dueDate) ? 'text-destructive font-medium' : 'text-muted-foreground'
                      )}
                      dir="ltr"
                    >
                      {formatDate(task.dueDate)}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
