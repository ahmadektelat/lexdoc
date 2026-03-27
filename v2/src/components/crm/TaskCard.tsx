// CREATED: 2026-03-19
// UPDATED: 2026-03-19 12:00 IST (Jerusalem)
//          - Initial implementation

import { useLanguage } from '@/contexts/LanguageContext';
import { TASK_CATEGORIES } from '@/lib/constants';
import { formatDate, isOverdue } from '@/lib/dates';
import { PriorityBadge } from '@/components/shared/PriorityBadge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { Pencil, Trash2, Zap } from 'lucide-react';
import type { Task } from '@/types';

interface TaskCardProps {
  task: Task;
  onToggle: (task: Task) => void;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
  canManage: boolean;
  clientName?: string;
  staffName?: string;
}

export function TaskCard({ task, onToggle, onEdit, onDelete, canManage, clientName, staffName }: TaskCardProps) {
  const { t } = useLanguage();

  return (
    <div
      className={cn(
        'rounded-lg border p-4 transition-colors',
        task.status === 'done' && 'opacity-60',
        task.dueDate && task.status === 'open' && isOverdue(task.dueDate) && 'border-red-300 dark:border-red-800'
      )}
    >
      <div className="flex items-start gap-3">
        <Checkbox
          checked={task.status === 'done'}
          onCheckedChange={() => onToggle(task)}
          disabled={!canManage || task.status === 'cancelled'}
        />

        <div className="flex-1 min-w-0">
          {/* Title row */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">#{task.seq}</span>
            <span className={cn('font-medium', task.status === 'done' && 'line-through')}>
              {task.title}
            </span>
            {task.isAuto && (
              <span title={t('tasks.autoIndicator')}>
                <Zap className="h-3 w-3 text-amber-500" />
              </span>
            )}
          </div>

          {/* Meta row */}
          <div className="flex flex-wrap items-center gap-2 mt-1">
            <PriorityBadge priority={task.priority} />
            <Badge variant="outline">{t(TASK_CATEGORIES[task.category])}</Badge>
            {clientName && (
              <Badge variant="secondary" className="truncate max-w-[150px]">
                {clientName}
              </Badge>
            )}
            {task.dueDate && (
              <span
                className={cn(
                  'text-xs',
                  isOverdue(task.dueDate) && task.status === 'open'
                    ? 'text-red-600 font-medium'
                    : 'text-muted-foreground'
                )}
              >
                {t('tasks.dueLabel')} {formatDate(task.dueDate)}
              </span>
            )}
            {staffName && (
              <span className="text-xs text-muted-foreground">
                {t('tasks.assignedLabel')} {staffName}
              </span>
            )}
          </div>
        </div>

        {/* Action buttons */}
        {canManage && (
          <div className="flex items-center gap-1 flex-shrink-0">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEdit(task)}>
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-destructive"
              onClick={() => onDelete(task)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
