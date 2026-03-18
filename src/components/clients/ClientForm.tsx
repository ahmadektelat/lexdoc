// CREATED: 2026-03-18
// UPDATED: 2026-03-18 10:00 IST (Jerusalem)
//          - Initial implementation

import { useState, useEffect } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuthStore } from '@/stores/useAuthStore';
import { useCreateClient, useUpdateClient } from '@/hooks/useClients';
import { CLIENT_TYPES } from '@/lib/constants';
import { shekelToAgorot, agorotToShekel } from '@/lib/money';
import { validateEmail, validatePhone, validateTaxId, validateCompanyId } from '@/lib/validation';
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
import type { Client, ClientType, CreateClientInput, UpdateClientInput } from '@/types';

interface ClientFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  client?: Client; // If provided, we're in edit mode
}

interface FormState {
  name: string;
  type: 'company' | 'private';
  clientType: ClientType;
  taxId: string;
  mobile: string;
  email: string;
  address: string;
  city: string;
  tags: string;
  monthlyFee: string; // display as shekels, stored as agorot
  billingDay: string;
  notes: string;
}

type FormErrors = Partial<Record<keyof FormState, string>>;

const INITIAL_STATE: FormState = {
  name: '',
  type: 'private',
  clientType: 'self_employed',
  taxId: '',
  mobile: '',
  email: '',
  address: '',
  city: '',
  tags: '',
  monthlyFee: '',
  billingDay: '',
  notes: '',
};

function clientToFormState(client: Client): FormState {
  return {
    name: client.name,
    type: client.type,
    clientType: client.clientType,
    taxId: client.taxId ?? '',
    mobile: client.mobile ?? '',
    email: client.email ?? '',
    address: client.address ?? '',
    city: client.city ?? '',
    tags: client.tags.join(', '),
    monthlyFee: client.monthlyFee ? String(agorotToShekel(client.monthlyFee)) : '',
    billingDay: client.billingDay ? String(client.billingDay) : '',
    notes: client.notes ?? '',
  };
}

export function ClientForm({ open, onOpenChange, client }: ClientFormProps) {
  const { t } = useLanguage();
  const firmId = useAuthStore((s) => s.firmId);
  const createClient = useCreateClient();
  const updateClient = useUpdateClient();
  const isEdit = !!client;

  const [form, setForm] = useState<FormState>(INITIAL_STATE);
  const [errors, setErrors] = useState<FormErrors>({});

  // Reset form when dialog opens/closes or client changes
  useEffect(() => {
    if (open) {
      setForm(client ? clientToFormState(client) : INITIAL_STATE);
      setErrors({});
    }
  }, [open, client]);

  const setField = (field: keyof FormState, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    // Clear error on change
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

    if (form.email && !validateEmail(form.email)) {
      errs.email = t('auth.errors.invalidEmail');
    }

    if (form.mobile && !validatePhone(form.mobile)) {
      errs.mobile = t('auth.errors.invalidPhone');
    }

    if (form.taxId) {
      const isCompanyType = form.type === 'company';
      const isValid = isCompanyType
        ? validateCompanyId(form.taxId)
        : validateTaxId(form.taxId);
      if (!isValid) {
        errs.taxId = t('errors.generic');
      }
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    if (!firmId) return;

    const tagsArray = form.tags
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean);

    const feeAgorot = form.monthlyFee
      ? shekelToAgorot(parseFloat(form.monthlyFee))
      : 0;

    if (isEdit && client) {
      const input: UpdateClientInput = {
        name: form.name.trim(),
        type: form.type,
        clientType: form.clientType,
        taxId: form.taxId || undefined,
        mobile: form.mobile || undefined,
        email: form.email || undefined,
        address: form.address || undefined,
        city: form.city || undefined,
        tags: tagsArray,
        monthlyFee: feeAgorot,
        billingDay: form.billingDay ? parseInt(form.billingDay, 10) : undefined,
        notes: form.notes || undefined,
      };
      updateClient.mutate(
        { id: client.id, input },
        { onSuccess: () => onOpenChange(false) }
      );
    } else {
      // caseNum and status are omitted — set by service layer and DB trigger
      const input: CreateClientInput = {
        name: form.name.trim(),
        type: form.type,
        clientType: form.clientType,
        taxId: form.taxId || undefined,
        mobile: form.mobile || undefined,
        email: form.email || undefined,
        address: form.address || undefined,
        city: form.city || undefined,
        tags: tagsArray,
        monthlyFee: feeAgorot,
        billingDay: form.billingDay ? parseInt(form.billingDay, 10) : undefined,
        notes: form.notes || undefined,
      };
      createClient.mutate(
        { firmId, input },
        { onSuccess: () => onOpenChange(false) }
      );
    }
  };

  const isSubmitting = createClient.isPending || updateClient.isPending;

  const billingDayOptions = Array.from({ length: 28 }, (_, i) => i + 1);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? t('clients.editClient') : t('clients.addNew')}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Name */}
          <FormField label={t('clients.name')} required error={errors.name}>
            <Input
              value={form.name}
              onChange={(e) => setField('name', e.target.value)}
            />
          </FormField>

          {/* Type (high-level) */}
          <FormField label={t('clients.highLevelType')}>
            <Select value={form.type} onValueChange={(v) => setField('type', v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="company">{t('clients.type.company')}</SelectItem>
                <SelectItem value="private">{t('clients.type.private')}</SelectItem>
              </SelectContent>
            </Select>
          </FormField>

          {/* Client Type (registration type) */}
          <FormField label={t('clients.registrationType')}>
            <Select
              value={form.clientType}
              onValueChange={(v) => setField('clientType', v)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(CLIENT_TYPES).map(([value, labelKey]) => (
                  <SelectItem key={value} value={value}>
                    {t(labelKey)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          {/* Tax ID */}
          <FormField label={t('clients.taxId')} error={errors.taxId}>
            <Input
              dir="ltr"
              value={form.taxId}
              onChange={(e) => setField('taxId', e.target.value)}
              className="text-start"
            />
          </FormField>

          {/* Mobile */}
          <FormField label={t('clients.phone')} error={errors.mobile}>
            <Input
              dir="ltr"
              value={form.mobile}
              onChange={(e) => setField('mobile', e.target.value)}
              placeholder="05X-XXXXXXX"
              className="text-start"
            />
          </FormField>

          {/* Email */}
          <FormField label={t('clients.email')} error={errors.email}>
            <Input
              dir="ltr"
              type="email"
              value={form.email}
              onChange={(e) => setField('email', e.target.value)}
              className="text-start"
            />
          </FormField>

          {/* Address */}
          <FormField label={t('clients.address')}>
            <Input
              value={form.address}
              onChange={(e) => setField('address', e.target.value)}
            />
          </FormField>

          {/* City */}
          <FormField label={t('clients.city')}>
            <Input
              value={form.city}
              onChange={(e) => setField('city', e.target.value)}
            />
          </FormField>

          {/* Tags */}
          <FormField label={t('clients.tags')} hint={t('clients.tagsHint')}>
            <Input
              value={form.tags}
              onChange={(e) => setField('tags', e.target.value)}
            />
          </FormField>

          {/* Monthly Fee */}
          <FormField label={t('clients.monthlyFee')}>
            <Input
              dir="ltr"
              type="number"
              min="0"
              step="0.01"
              value={form.monthlyFee}
              onChange={(e) => setField('monthlyFee', e.target.value)}
              className="text-start"
            />
          </FormField>

          {/* Billing Day */}
          <FormField label={t('clients.billingDay')}>
            <Select
              value={form.billingDay}
              onValueChange={(v) => setField('billingDay', v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="-" />
              </SelectTrigger>
              <SelectContent>
                {billingDayOptions.map((day) => (
                  <SelectItem key={day} value={String(day)}>
                    {day}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          {/* Notes */}
          <FormField label={t('clients.notes')}>
            <textarea
              value={form.notes}
              onChange={(e) => setField('notes', e.target.value)}
              rows={3}
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
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
