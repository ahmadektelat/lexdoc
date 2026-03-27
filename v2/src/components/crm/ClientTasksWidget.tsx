// CREATED: 2026-03-19
// UPDATED: 2026-03-19 12:00 IST (Jerusalem)
//          - Initial implementation

import { useState, useMemo } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuthStore } from '@/stores/useAuthStore';
import { useTasks, useToggleTaskStatus, useDeleteTask } from '@/hooks/useTasks';
import { useStaff } from '@/hooks/useStaff';
import { EmptyState } from '@/components/shared/EmptyState';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { TaskCard } from './TaskCard';
import { TaskForm } from './TaskForm';
import { Plus, CheckSquare } from 'lucide-react';
import type { Task } from '@/types';

interface ClientTasksWidgetProps {
  clientId: string;
}

export function ClientTasksWidget({ clientId }: ClientTasksWidgetProps) {
  const { t } = useLanguage();
  const firmId = useAuthStore((s) => s.firmId);
  const can = useAuthStore((s) => s.can);
  const canManage = can('crm.manage');
  const { data: tasks, isLoading } = useTasks(firmId, clientId);
  const { data: staffList } = useStaff(firmId);
  const toggleTask = useToggleTaskStatus();
  const deleteTask = useDeleteTask();

  const [statusFilter, setStatusFilter] = useState<'open' | 'done' | 'all'>('open');
  const [formOpen, setFormOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | undefined>();
  const [deleteTarget, setDeleteTarget] = useState<Task | null>(null);

  // Staff name lookup
  const staffMap = useMemo(() => {
    const map = new Map<string, string>();
    staffList?.forEach((s) => map.set(s.id, s.name));
    return map;
  }, [staffList]);

  // Filtering
  const filteredTasks = useMemo(() => {
    if (!tasks) return [];
    return tasks.filter((t) => {
      if (statusFilter === 'open' && t.status !== 'open') return false;
      if (statusFilter === 'done' && t.status !== 'done') return false;
      return true;
    });
  }, [tasks, statusFilter]);

  const handleEdit = (task: Task) => {
    setEditingTask(task);
    setFormOpen(true);
  };

  const handleFormClose = (open: boolean) => {
    setFormOpen(open);
    if (!open) setEditingTask(undefined);
  };

  const confirmDelete = () => {
    if (deleteTarget) {
      deleteTask.mutate(deleteTarget.id);
      setDeleteTarget(null);
    }
  };

  if (isLoading) {
    return <LoadingSpinner size="lg" className="py-10" />;
  }

  return (
    <div>
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {(['open', 'done', 'all'] as const).map((status) => (
          <Button
            key={status}
            variant={statusFilter === status ? 'default' : 'outline'}
            size="sm"
            onClick={() => setStatusFilter(status)}
          >
            {t(`tasks.filter.${status}`)}
          </Button>
        ))}

        {canManage && (
          <Button onClick={() => setFormOpen(true)} size="sm" className="ms-auto">
            <Plus className="h-4 w-4 me-2" />
            {t('tasks.addTask')}
          </Button>
        )}
      </div>

      {/* Task list */}
      {filteredTasks.length === 0 ? (
        <EmptyState
          icon={CheckSquare}
          title={statusFilter === 'open' ? t('tasks.noOpenTasks') : t('tasks.noTasks')}
          description={t('tasks.noTasksDesc')}
        />
      ) : (
        <div className="space-y-3">
          {filteredTasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              onToggle={(t) => toggleTask.mutate(t.id)}
              onEdit={handleEdit}
              onDelete={setDeleteTarget}
              canManage={canManage}
              staffName={task.assignedTo ? staffMap.get(task.assignedTo) : undefined}
            />
          ))}
        </div>
      )}

      {/* Create/Edit form dialog */}
      <TaskForm
        open={formOpen}
        onOpenChange={handleFormClose}
        task={editingTask}
        defaultClientId={clientId}
      />

      {/* Delete confirmation */}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={t('tasks.deleteTask')}
        description={t('tasks.confirmDelete')}
        confirmLabel={t('common.delete')}
        onConfirm={confirmDelete}
        variant="destructive"
      />
    </div>
  );
}
