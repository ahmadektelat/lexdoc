// CREATED: 2026-03-19
// UPDATED: 2026-03-19 13:00 IST (Jerusalem)
//          - Replace empty string Select values with __none__ sentinels

import { useState, useEffect, useMemo } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuthStore } from '@/stores/useAuthStore';
import { useClients } from '@/hooks/useClients';
import { useContacts } from '@/hooks/useContacts';
import { useCreateInteraction, useUpdateInteraction } from '@/hooks/useInteractions';
import { INTERACTION_CHANNELS, AUTHORITY_TYPES } from '@/lib/constants';
import { getToday } from '@/lib/dates';
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
import type { Interaction, InteractionChannel, AuthorityType } from '@/types';

interface InteractionFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  interaction?: Interaction;
  defaultClientId?: string;
}

interface FormState {
  client_id: string;
  contact_id: string;
  date: string;
  channel: InteractionChannel;
  subject: string;
  notes: string;
  authorityType: AuthorityType | '';
  staffId: string;
  outcome: string;
}

type FormErrors = Partial<Record<keyof FormState, string>>;

const INITIAL_STATE: FormState = {
  client_id: '',
  contact_id: '',
  date: getToday(),
  channel: 'call',
  subject: '',
  notes: '',
  authorityType: '',
  staffId: '',
  outcome: '',
};

export function InteractionForm({ open, onOpenChange, interaction, defaultClientId }: InteractionFormProps) {
  const { t } = useLanguage();
  const firmId = useAuthStore((s) => s.firmId);
  const { data: clients } = useClients(firmId);
  const createInteraction = useCreateInteraction();
  const updateInteraction = useUpdateInteraction();
  const isEdit = !!interaction;

  const [form, setForm] = useState<FormState>(INITIAL_STATE);
  const [errors, setErrors] = useState<FormErrors>({});

  // Fetch contacts for the selected client
  const { data: contacts } = useContacts(firmId, form.client_id || undefined);

  // Filter to non-deleted contacts
  const contactOptions = useMemo(() => contacts ?? [], [contacts]);

  useEffect(() => {
    if (open) {
      setForm(
        interaction
          ? {
              client_id: interaction.client_id ?? '',
              contact_id: interaction.contact_id ?? '',
              date: interaction.date,
              channel: interaction.channel,
              subject: interaction.subject,
              notes: interaction.notes ?? '',
              authorityType: interaction.authorityType ?? '',
              staffId: interaction.staffId ?? '',
              outcome: interaction.outcome ?? '',
            }
          : { ...INITIAL_STATE, client_id: defaultClientId ?? '', date: getToday() }
      );
      setErrors({});
    }
  }, [open, interaction, defaultClientId]);

  const setField = (field: keyof FormState, value: string) => {
    setForm((prev) => {
      const next = { ...prev, [field]: value };
      // Clear contact when client changes
      if (field === 'client_id') {
        next.contact_id = '';
      }
      return next;
    });
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
    if (!form.subject.trim()) {
      errs.subject = t('interactions.subjectRequired');
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    if (!firmId) return;

    const input = {
      client_id: form.client_id || undefined,
      contact_id: form.contact_id || undefined,
      date: form.date,
      channel: form.channel,
      subject: form.subject.trim(),
      notes: form.notes.trim() || undefined,
      authorityType: form.authorityType || undefined,
      staffId: form.staffId || undefined,
      outcome: form.outcome.trim() || undefined,
    };

    if (isEdit && interaction) {
      updateInteraction.mutate(
        { firmId, id: interaction.id, input },
        { onSuccess: () => onOpenChange(false) }
      );
    } else {
      createInteraction.mutate(
        { firmId, input },
        { onSuccess: () => onOpenChange(false) }
      );
    }
  };

  const isSubmitting = createInteraction.isPending || updateInteraction.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? t('interactions.editInteraction') : t('interactions.addInteraction')}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Client */}
          <FormField label={t('interactions.client')}>
            <Select value={form.client_id || '__none__'} onValueChange={(v) => setField('client_id', v === '__none__' ? '' : v)}>
              <SelectTrigger>
                <SelectValue placeholder={t('interactions.generalInteraction')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">{t('interactions.generalInteraction')}</SelectItem>
                {clients?.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          {/* Contact (only when client is selected) */}
          {form.client_id && contactOptions.length > 0 && (
            <FormField label={t('interactions.contact')}>
              <Select value={form.contact_id || '__none__'} onValueChange={(v) => setField('contact_id', v === '__none__' ? '' : v)}>
                <SelectTrigger>
                  <SelectValue placeholder={t('common.all')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">{t('common.all')}</SelectItem>
                  {contactOptions.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
          )}

          {/* Date */}
          <FormField label={t('interactions.date')}>
            <Input
              type="date"
              dir="ltr"
              value={form.date}
              onChange={(e) => setField('date', e.target.value)}
            />
          </FormField>

          {/* Channel */}
          <FormField label={t('interactions.channel')}>
            <Select value={form.channel} onValueChange={(v) => setField('channel', v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(INTERACTION_CHANNELS).map(([value, labelKey]) => (
                  <SelectItem key={value} value={value}>
                    {t(labelKey)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          {/* Authority */}
          <FormField label={t('interactions.authority')}>
            <Select value={form.authorityType || '__none__'} onValueChange={(v) => setField('authorityType', v === '__none__' ? '' : v)}>
              <SelectTrigger>
                <SelectValue placeholder={t('authorityTypes.client')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">{t('authorityTypes.client')}</SelectItem>
                {Object.entries(AUTHORITY_TYPES).map(([value, labelKey]) => (
                  <SelectItem key={value} value={value}>
                    {t(labelKey)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          {/* Subject */}
          <FormField label={t('interactions.subject')} required error={errors.subject}>
            <Input
              value={form.subject}
              onChange={(e) => setField('subject', e.target.value)}
            />
          </FormField>

          {/* Notes */}
          <FormField label={t('interactions.notes')}>
            <Textarea
              value={form.notes}
              onChange={(e) => setField('notes', e.target.value)}
              rows={3}
            />
          </FormField>

          {/* Staff */}
          <FormField label={t('interactions.staff')}>
            <StaffPicker
              firmId={firmId!}
              value={form.staffId || undefined}
              onChange={(v) => setField('staffId', v ?? '')}
            />
          </FormField>

          {/* Outcome */}
          <FormField label={t('interactions.outcome')}>
            <Input
              value={form.outcome}
              onChange={(e) => setField('outcome', e.target.value)}
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
