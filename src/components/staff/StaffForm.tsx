// CREATED: 2026-03-18
// UPDATED: 2026-03-18 14:00 IST (Jerusalem)
//          - Initial implementation

import { useState, useEffect } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuthStore } from '@/stores/useAuthStore';
import { useCreateStaff, useUpdateStaff } from '@/hooks/useStaff';
import { STAFF_ROLES } from '@/lib/constants';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { Staff, StaffRole } from '@/types';

interface StaffFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  staff?: Staff;
}

interface FormState {
  name: string;
  role: StaffRole;
}

type FormErrors = Partial<Record<keyof FormState, string>>;

const INITIAL_STATE: FormState = {
  name: '',
  role: 'attorney',
};

export function StaffForm({ open, onOpenChange, staff }: StaffFormProps) {
  const { t } = useLanguage();
  const firmId = useAuthStore((s) => s.firmId);
  const createStaff = useCreateStaff();
  const updateStaff = useUpdateStaff();
  const isEdit = !!staff;

  const [form, setForm] = useState<FormState>(INITIAL_STATE);
  const [errors, setErrors] = useState<FormErrors>({});

  // Reset form when dialog opens/closes or staff changes
  useEffect(() => {
    if (open) {
      setForm(
        staff
          ? { name: staff.name, role: staff.role }
          : INITIAL_STATE
      );
      setErrors({});
    }
  }, [open, staff]);

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

    if (isEdit && staff) {
      updateStaff.mutate(
        {
          firmId,
          id: staff.id,
          input: { name: form.name.trim(), role: form.role },
        },
        { onSuccess: () => onOpenChange(false) }
      );
    } else {
      createStaff.mutate(
        {
          firmId,
          input: { name: form.name.trim(), role: form.role, isActive: true },
        },
        { onSuccess: () => onOpenChange(false) }
      );
    }
  };

  const isSubmitting = createStaff.isPending || updateStaff.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? t('staff.editTitle') : t('staff.addTitle')}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Name */}
          <FormField label={t('staff.name')} required error={errors.name}>
            <Input
              value={form.name}
              onChange={(e) => setField('name', e.target.value)}
            />
          </FormField>

          {/* Role */}
          <FormField label={t('staff.role')}>
            <Select value={form.role} onValueChange={(v) => setField('role', v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(STAFF_ROLES).map(([value, labelKey]) => (
                  <SelectItem key={value} value={value}>
                    {t(labelKey)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
