// CREATED: 2026-03-19
// UPDATED: 2026-03-19 12:00 IST (Jerusalem)
//          - Initial implementation

import { useState, useMemo } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuthStore } from '@/stores/useAuthStore';
import { useTasks, useToggleTaskStatus, useDeleteTask } from '@/hooks/useTasks';
import { useClients } from '@/hooks/useClients';
import { useStaff } from '@/hooks/useStaff';
import { TASK_PRIORITIES, TASK_CATEGORIES } from '@/lib/constants';
import { isOverdue } from '@/lib/dates';
import { EmptyState } from '@/components/shared/EmptyState';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { TaskCard } from './TaskCard';
import { TaskForm } from './TaskForm';
import { Plus, CheckSquare } from 'lucide-react';
import type { Task, TaskPriority, TaskCategory } from '@/types';

const STAT_COLORS = {
  amber: 'bg-amber-50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-800',
  red: 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-800',
  green: 'bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-800',
  blue: 'bg-blue-50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-800',
};

function StatCard({ label, count, color }: { label: string; count: number; color: keyof typeof STAT_COLORS }) {
  return (
    <div className={`rounded-lg border p-4 ${STAT_COLORS[color]}`}>
      <p className="text-2xl font-bold">{count}</p>
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  );
}

const PRIORITY_WEIGHT: Record<TaskPriority, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

interface TasksPanelProps {
  clientId?: string;
}

export function TasksPanel({ clientId }: TasksPanelProps) {
  const { t } = useLanguage();
  const firmId = useAuthStore((s) => s.firmId);
  const can = useAuthStore((s) => s.can);
  const canManage = can('crm.manage');
  const { data: tasks, isLoading } = useTasks(firmId, clientId);
  const { data: clients } = useClients(firmId);
  const { data: staffList } = useStaff(firmId);
  const toggleTask = useToggleTaskStatus();
  const deleteTask = useDeleteTask();

  const [statusFilter, setStatusFilter] = useState<'open' | 'done' | 'auto' | 'all'>('open');
  const [priorityFilter, setPriorityFilter] = useState<TaskPriority | 'all'>('all');
  const [categoryFilter, setCategoryFilter] = useState<TaskCategory | 'all'>('all');
  const [formOpen, setFormOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | undefined>();
  const [deleteTarget, setDeleteTarget] = useState<Task | null>(null);

  // Lookup maps
  const clientMap = useMemo(() => {
    const map = new Map<string, string>();
    clients?.forEach((c) => map.set(c.id, c.name));
    return map;
  }, [clients]);

  const staffMap = useMemo(() => {
    const map = new Map<string, string>();
    staffList?.forEach((s) => map.set(s.id, s.name));
    return map;
  }, [staffList]);

  // Stats
  const stats = useMemo(() => {
    if (!tasks) return { open: 0, overdue: 0, done: 0, total: 0 };
    const open = tasks.filter((t) => t.status === 'open').length;
    const overdue = tasks.filter(
      (t) => t.status === 'open' && t.dueDate && isOverdue(t.dueDate)
    ).length;
    const done = tasks.filter((t) => t.status === 'done').length;
    return { open, overdue, done, total: tasks.length };
  }, [tasks]);

  // Filtering + sorting
  const filteredTasks = useMemo(() => {
    if (!tasks) return [];
    let result = tasks.filter((t) => {
      if (statusFilter === 'open' && t.status !== 'open') return false;
      if (statusFilter === 'done' && t.status !== 'done') return false;
      if (statusFilter === 'auto' && !(t.isAuto && t.status === 'open')) return false;
      if (priorityFilter !== 'all' && t.priority !== priorityFilter) return false;
      if (categoryFilter !== 'all' && t.category !== categoryFilter) return false;
      return true;
    });

    // Sort: open before done, then by priority weight, then by dueDate ascending (nulls last)
    result = [...result].sort((a, b) => {
      const statusOrder = a.status === 'open' ? 0 : a.status === 'done' ? 1 : 2;
      const statusOrderB = b.status === 'open' ? 0 : b.status === 'done' ? 1 : 2;
      if (statusOrder !== statusOrderB) return statusOrder - statusOrderB;
      const pw = PRIORITY_WEIGHT[a.priority] - PRIORITY_WEIGHT[b.priority];
      if (pw !== 0) return pw;
      if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
      if (a.dueDate) return -1;
      if (b.dueDate) return 1;
      return 0;
    });

    return result;
  }, [tasks, statusFilter, priorityFilter, categoryFilter]);

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
    return <LoadingSpinner size="lg" className="py-20" />;
  }

  return (
    <div>
      {/* Stats cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <StatCard label={t('tasks.stats.open')} count={stats.open} color="amber" />
        <StatCard label={t('tasks.stats.overdue')} count={stats.overdue} color="red" />
        <StatCard label={t('tasks.stats.done')} count={stats.done} color="green" />
        <StatCard label={t('tasks.stats.total')} count={stats.total} color="blue" />
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {/* Status filters */}
        {(['open', 'done', 'auto', 'all'] as const).map((status) => (
          <Button
            key={status}
            variant={statusFilter === status ? 'default' : 'outline'}
            size="sm"
            onClick={() => setStatusFilter(status)}
          >
            {t(`tasks.filter.${status}`)}
          </Button>
        ))}

        <div className="w-px h-6 bg-border mx-1" />

        {/* Priority filters */}
        <Button
          variant={priorityFilter === 'all' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setPriorityFilter('all')}
        >
          {t('tasks.filter.allPriorities')}
        </Button>
        {Object.entries(TASK_PRIORITIES).map(([value, labelKey]) => (
          <Button
            key={value}
            variant={priorityFilter === value ? 'default' : 'outline'}
            size="sm"
            onClick={() => setPriorityFilter(value as TaskPriority)}
          >
            {t(labelKey)}
          </Button>
        ))}

        <div className="w-px h-6 bg-border mx-1" />

        {/* Category filters */}
        <Button
          variant={categoryFilter === 'all' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setCategoryFilter('all')}
        >
          {t('tasks.filter.allCategories')}
        </Button>
        {Object.entries(TASK_CATEGORIES).map(([value, labelKey]) => (
          <Button
            key={value}
            variant={categoryFilter === value ? 'default' : 'outline'}
            size="sm"
            onClick={() => setCategoryFilter(value as TaskCategory)}
          >
            {t(labelKey)}
          </Button>
        ))}

        {canManage && (
          <Button onClick={() => setFormOpen(true)} className="ms-auto">
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
              clientName={task.client_id ? clientMap.get(task.client_id) : undefined}
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
