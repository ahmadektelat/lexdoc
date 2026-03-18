// CREATED: 2026-03-19
// UPDATED: 2026-03-19 12:00 IST (Jerusalem)
//          - Initial implementation

import { useState, useEffect } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuthStore } from '@/stores/useAuthStore';
import { useClients } from '@/hooks/useClients';
import { useCreateTask, useUpdateTask } from '@/hooks/useTasks';
import { TASK_PRIORITIES, TASK_CATEGORIES } from '@/lib/constants';
import { FormField } from '@/components/shared/FormField';
import { StaffPicker } from '@/components/staff/StaffPicker';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { Task, TaskPriority, TaskCategory } from '@/types';

interface TaskFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task?: Task;
  defaultClientId?: string;
}

interface FormState {
  title: string;
  description: string;
  dueDate: string;
  priority: TaskPriority;
  category: TaskCategory;
  assignedTo: string;
  client_id: string;
}

type FormErrors = Partial<Record<keyof FormState, string>>;

const INITIAL_STATE: FormState = {
  title: '',
  description: '',
  dueDate: '',
  priority: 'medium',
  category: 'client',
  assignedTo: '',
  client_id: '',
};

export function TaskForm({ open, onOpenChange, task, defaultClientId }: TaskFormProps) {
  const { t } = useLanguage();
  const firmId = useAuthStore((s) => s.firmId);
  const { data: clients } = useClients(firmId);
  const createTask = useCreateTask();
  const updateTask = useUpdateTask();
  const isEdit = !!task;

  const [form, setForm] = useState<FormState>(INITIAL_STATE);
  const [errors, setErrors] = useState<FormErrors>({});

  useEffect(() => {
    if (open) {
      setForm(
        task
          ? {
              title: task.title,
              description: task.desc ?? '',
              dueDate: task.dueDate ?? '',
              priority: task.priority,
              category: task.category,
              assignedTo: task.assignedTo ?? '',
              client_id: task.client_id ?? '',
            }
          : { ...INITIAL_STATE, client_id: defaultClientId ?? '' }
      );
      setErrors({});
    }
  }, [open, task, defaultClientId]);

  const setField = (field: keyof FormState, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  const validate = (): boolean => {
    const errs: FormErrors = {};
    if (!form.title.trim()) {
      errs.title = t('tasks.titleRequired');
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    if (!firmId) return;

    if (isEdit && task) {
      updateTask.mutate(
        {
          firmId,
          id: task.id,
          input: {
            title: form.title.trim(),
            desc: form.description.trim() || undefined,
            dueDate: form.dueDate || undefined,
            priority: form.priority,
            category: form.category,
            assignedTo: form.assignedTo || undefined,
            client_id: form.client_id || undefined,
          },
        },
        { onSuccess: () => onOpenChange(false) }
      );
    } else {
      createTask.mutate(
        {
          firmId,
          input: {
            seq: 0,
            title: form.title.trim(),
            desc: form.description.trim() || undefined,
            dueDate: form.dueDate || undefined,
            priority: form.priority,
            status: 'open',
            category: form.category,
            isAuto: false,
            assignedTo: form.assignedTo || undefined,
            client_id: form.client_id || undefined,
          },
        },
        { onSuccess: () => onOpenChange(false) }
      );
    }
  };

  const isSubmitting = createTask.isPending || updateTask.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? t('tasks.editTask') : t('tasks.addTask')}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Title */}
          <FormField label={t('tasks.title')} required error={errors.title}>
            <Input
              value={form.title}
              onChange={(e) => setField('title', e.target.value)}
            />
          </FormField>

          {/* Description */}
          <FormField label={t('tasks.description')}>
            <Textarea
              value={form.description}
              onChange={(e) => setField('description', e.target.value)}
              rows={3}
            />
          </FormField>

          {/* Client */}
          <FormField label={t('tasks.client')}>
            <Select value={form.client_id} onValueChange={(v) => setField('client_id', v)}>
              <SelectTrigger>
                <SelectValue placeholder={t('tasks.noClient')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">{t('tasks.noClient')}</SelectItem>
                {clients?.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          {/* Due date */}
          <FormField label={t('tasks.dueDate')}>
            <Input
              type="date"
              dir="ltr"
              value={form.dueDate}
              onChange={(e) => setField('dueDate', e.target.value)}
            />
          </FormField>

          {/* Priority */}
          <FormField label={t('tasks.priority')}>
            <Select value={form.priority} onValueChange={(v) => setField('priority', v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(TASK_PRIORITIES).map(([value, labelKey]) => (
                  <SelectItem key={value} value={value}>
                    {t(labelKey)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          {/* Category */}
          <FormField label={t('tasks.category')}>
            <Select value={form.category} onValueChange={(v) => setField('category', v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(TASK_CATEGORIES).map(([value, labelKey]) => (
                  <SelectItem key={value} value={value}>
                    {t(labelKey)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          {/* Assigned to */}
          <FormField label={t('tasks.assignedTo')}>
            <StaffPicker
              firmId={firmId!}
              value={form.assignedTo || undefined}
              onChange={(v) => setField('assignedTo', v ?? '')}
            />
          </FormField>
        </div>

        <DialogFooter className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? t('common.loading') : t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
