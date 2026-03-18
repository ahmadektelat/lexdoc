// CREATED: 2026-03-19
// UPDATED: 2026-03-19 10:00 IST (Jerusalem)
//          - Initial implementation

import { useState, useEffect } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuthStore } from '@/stores/useAuthStore';
import { useCreateRole, useUpdateRole } from '@/hooks/useRoles';
import { FormField } from '@/components/shared/FormField';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import type { Role } from '@/types';

interface RoleFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  role?: Role;
}

interface FormState {
  name: string;
  description: string;
  color: string;
}

type FormErrors = Partial<Record<keyof FormState, string>>;

const COLOR_SWATCHES = [
  '#3b82f6',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#8b5cf6',
  '#06b6d4',
  '#64748b',
];

const INITIAL_STATE: FormState = {
  name: '',
  description: '',
  color: '#3b82f6',
};

export function RoleForm({ open, onOpenChange, role }: RoleFormProps) {
  const { t } = useLanguage();
  const firmId = useAuthStore((s) => s.firmId);
  const createRole = useCreateRole();
  const updateRole = useUpdateRole();
  const isEdit = !!role;

  const [form, setForm] = useState<FormState>(INITIAL_STATE);
  const [errors, setErrors] = useState<FormErrors>({});

  // Reset form when dialog opens/closes or role changes
  useEffect(() => {
    if (open) {
      setForm(
        role
          ? { name: role.name, description: role.description ?? '', color: role.color }
          : INITIAL_STATE
      );
      setErrors({});
    }
  }, [open, role]);

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
    if (!form.name.trim()) {
      errs.name = t('common.required');
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    if (!firmId) return;

    if (isEdit && role) {
      updateRole.mutate(
        {
          firmId,
          id: role.id,
          input: {
            name: form.name.trim(),
            description: form.description.trim(),
            color: form.color,
          },
        },
        { onSuccess: () => onOpenChange(false) }
      );
    } else {
      createRole.mutate(
        {
          firmId,
          input: {
            name: form.name.trim(),
            description: form.description.trim(),
            color: form.color,
            locked: false,
            permissions: [],
          },
        },
        { onSuccess: () => onOpenChange(false) }
      );
    }
  };

  const isSubmitting = createRole.isPending || updateRole.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? t('permissions.editRole') : t('permissions.addRole')}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Name */}
          <FormField label={t('permissions.roleName')} required error={errors.name}>
            <Input
              value={form.name}
              onChange={(e) => setField('name', e.target.value)}
            />
          </FormField>

          {/* Description */}
          <FormField label={t('permissions.roleDesc')}>
            <Input
              value={form.description}
              onChange={(e) => setField('description', e.target.value)}
            />
          </FormField>

          {/* Color */}
          <FormField label={t('permissions.roleColor')}>
            <div className="flex items-center gap-2">
              {COLOR_SWATCHES.map((hex) => (
                <button
                  key={hex}
                  type="button"
                  onClick={() => setField('color', hex)}
                  className={`h-8 w-8 rounded-full border-2 transition-all ${
                    form.color === hex
                      ? 'border-foreground scale-110'
                      : 'border-transparent hover:border-muted-foreground/50'
                  }`}
                  style={{ backgroundColor: hex }}
                />
              ))}
            </div>
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
