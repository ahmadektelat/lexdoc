// CREATED: 2026-03-19
// UPDATED: 2026-03-19 13:00 IST (Jerusalem)
//          - Replace empty string Select value with __none__ sentinel

import { useState, useEffect } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuthStore } from '@/stores/useAuthStore';
import { useClients } from '@/hooks/useClients';
import { useCreateContact, useUpdateContact } from '@/hooks/useContacts';
import { CONTACT_TYPES } from '@/lib/constants';
import { FormField } from '@/components/shared/FormField';
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
import type { Contact, ContactType } from '@/types';

interface ContactFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contact?: Contact;
  defaultClientId?: string;
}

interface FormState {
  type: ContactType;
  name: string;
  role: string;
  phone: string;
  email: string;
  notes: string;
  client_id: string;
}

type FormErrors = Partial<Record<keyof FormState, string>>;

const INITIAL_STATE: FormState = {
  type: 'client',
  name: '',
  role: '',
  phone: '',
  email: '',
  notes: '',
  client_id: '',
};

export function ContactForm({ open, onOpenChange, contact, defaultClientId }: ContactFormProps) {
  const { t } = useLanguage();
  const firmId = useAuthStore((s) => s.firmId);
  const { data: clients } = useClients(firmId);
  const createContact = useCreateContact();
  const updateContact = useUpdateContact();
  const isEdit = !!contact;

  const [form, setForm] = useState<FormState>(INITIAL_STATE);
  const [errors, setErrors] = useState<FormErrors>({});

  useEffect(() => {
    if (open) {
      setForm(
        contact
          ? {
              type: contact.type,
              name: contact.name,
              role: contact.role ?? '',
              phone: contact.phone ?? '',
              email: contact.email ?? '',
              notes: contact.notes ?? '',
              client_id: contact.client_id ?? '',
            }
          : { ...INITIAL_STATE, client_id: defaultClientId ?? '' }
      );
      setErrors({});
    }
  }, [open, contact, defaultClientId]);

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
      errs.name = t('contacts.nameRequired');
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    if (!firmId) return;

    const input = {
      type: form.type,
      name: form.name.trim(),
      role: form.role.trim() || undefined,
      phone: form.phone.trim() || undefined,
      email: form.email.trim() || undefined,
      notes: form.notes.trim() || undefined,
      client_id: form.client_id || undefined,
    };

    if (isEdit && contact) {
      updateContact.mutate(
        { firmId, id: contact.id, input },
        { onSuccess: () => onOpenChange(false) }
      );
    } else {
      createContact.mutate(
        { firmId, input },
        { onSuccess: () => onOpenChange(false) }
      );
    }
  };

  const isSubmitting = createContact.isPending || updateContact.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? t('contacts.editContact') : t('contacts.addContact')}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Client */}
          <FormField label={t('contacts.client')}>
            <Select value={form.client_id || '__none__'} onValueChange={(v) => setField('client_id', v === '__none__' ? '' : v)}>
              <SelectTrigger>
                <SelectValue placeholder={t('crm.allClients')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">{t('crm.allClients')}</SelectItem>
                {clients?.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          {/* Type */}
          <FormField label={t('contacts.type')}>
            <Select value={form.type} onValueChange={(v) => setField('type', v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(CONTACT_TYPES).map(([value, labelKey]) => (
                  <SelectItem key={value} value={value}>
                    {t(labelKey)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          {/* Name */}
          <FormField label={t('contacts.name')} required error={errors.name}>
            <Input
              value={form.name}
              onChange={(e) => setField('name', e.target.value)}
            />
          </FormField>

          {/* Role */}
          <FormField label={t('contacts.role')}>
            <Input
              value={form.role}
              onChange={(e) => setField('role', e.target.value)}
            />
          </FormField>

          {/* Phone */}
          <FormField label={t('contacts.phone')}>
            <Input
              dir="ltr"
              value={form.phone}
              onChange={(e) => setField('phone', e.target.value)}
            />
          </FormField>

          {/* Email */}
          <FormField label={t('contacts.email')}>
            <Input
              dir="ltr"
              value={form.email}
              onChange={(e) => setField('email', e.target.value)}
            />
          </FormField>

          {/* Notes */}
          <FormField label={t('contacts.notes')}>
            <Textarea
              value={form.notes}
              onChange={(e) => setField('notes', e.target.value)}
              rows={3}
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
