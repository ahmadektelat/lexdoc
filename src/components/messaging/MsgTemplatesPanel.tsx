// CREATED: 2026-03-24
// UPDATED: 2026-03-24 10:30 IST (Jerusalem)
//          - Initial implementation

import { useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuthStore } from '@/stores/useAuthStore';
import {
  useTemplates,
  useCreateTemplate,
  useUpdateTemplate,
  useDeleteTemplate,
} from '@/hooks/useMessages';
import { FormField } from '@/components/shared/FormField';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { EmptyState } from '@/components/shared/EmptyState';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { MessageSquare, Plus, Pencil, Trash2, X, Info } from 'lucide-react';
import type { MessageTemplate, CreateMessageTemplateInput, MessageChannel } from '@/types';

const AVAILABLE_VARS = [
  { key: 'client_name', desc: 'שם הלקוח' },
  { key: 'staff_name', desc: 'שם איש הצוות' },
  { key: 'firm_name', desc: 'שם המשרד' },
  { key: 'period', desc: 'תקופה' },
  { key: 'due_date', desc: 'מועד הגשה' },
  { key: 'task_due', desc: 'מועד העברת חומר' },
  { key: 'amount', desc: 'סכום' },
  { key: 'today', desc: 'תאריך היום' },
  { key: 'phone', desc: 'טלפון הלקוח' },
  { key: 'email', desc: 'מייל הלקוח' },
  { key: 'subject', desc: 'נושא חופשי' },
  { key: 'body', desc: 'תוכן חופשי' },
];

const CHANNEL_OPTIONS: { value: MessageChannel; label: string }[] = [
  { value: 'email', label: 'messaging.channelEmail' },
  { value: 'sms', label: 'messaging.channelSms' },
  { value: 'whatsapp', label: 'messaging.channelWhatsapp' },
];

const EMPTY_TEMPLATE: CreateMessageTemplateInput = {
  topic: '',
  topicLabel: '',
  subject: '',
  body: '',
  channel: 'email',
  color: '#64748b',
  icon: 'mail',
};

export function MsgTemplatesPanel() {
  const { t } = useLanguage();
  const firmId = useAuthStore((s) => s.firmId);
  const { data: templates = [], isLoading } = useTemplates(firmId);

  const createTemplate = useCreateTemplate();
  const updateTemplate = useUpdateTemplate();
  const deleteTemplate = useDeleteTemplate();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<CreateMessageTemplateInput>>({});
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newTemplate, setNewTemplate] = useState<CreateMessageTemplateInput>({ ...EMPTY_TEMPLATE });
  const [deleteTarget, setDeleteTarget] = useState<MessageTemplate | null>(null);
  const [showVarRef, setShowVarRef] = useState(false);

  if (isLoading) return <LoadingSpinner size="lg" className="py-20" />;

  const handleStartEdit = (tpl: MessageTemplate) => {
    setEditingId(tpl.id);
    setEditForm({
      topic: tpl.topic,
      topicLabel: tpl.topicLabel,
      subject: tpl.subject,
      body: tpl.body,
      channel: tpl.channel,
      color: tpl.color,
      icon: tpl.icon,
    });
  };

  const handleSaveEdit = () => {
    if (!firmId || !editingId) return;
    updateTemplate.mutate(
      { firmId, id: editingId, input: editForm },
      { onSuccess: () => setEditingId(null) }
    );
  };

  const handleCreate = () => {
    if (!firmId || !newTemplate.topic || !newTemplate.topicLabel || !newTemplate.subject || !newTemplate.body) return;
    createTemplate.mutate(
      { firmId, input: newTemplate },
      {
        onSuccess: () => {
          setShowCreateForm(false);
          setNewTemplate({ ...EMPTY_TEMPLATE });
        },
      }
    );
  };

  const handleDelete = () => {
    if (!firmId || !deleteTarget) return;
    deleteTemplate.mutate(
      { firmId, id: deleteTarget.id },
      { onSuccess: () => setDeleteTarget(null) }
    );
  };

  return (
    <div className="space-y-4">
      {/* Header with create button and var reference toggle */}
      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowVarRef(!showVarRef)}
        >
          <Info className="h-4 w-4 me-2" />
          {t('messaging.templateVarsHint')}
        </Button>
        <Button size="sm" onClick={() => setShowCreateForm(true)}>
          <Plus className="h-4 w-4 me-2" />
          {t('messaging.templateCreate')}
        </Button>
      </div>

      {/* Variable reference sheet */}
      {showVarRef && (
        <div className="rounded-md border border-border bg-muted/30 p-4">
          <h4 className="text-sm font-medium mb-2">{t('messaging.templateVarsHint')}</h4>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {AVAILABLE_VARS.map((v) => (
              <div key={v.key} className="text-xs">
                <code className="bg-muted px-1 py-0.5 rounded">{`{{${v.key}}}`}</code>
                <span className="text-muted-foreground ms-1">{v.desc}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Create form */}
      {showCreateForm && (
        <div className="rounded-md border border-border p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium">{t('messaging.templateCreate')}</h4>
            <Button variant="ghost" size="sm" onClick={() => setShowCreateForm(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          <TemplateForm
            value={newTemplate}
            onChange={(v) => setNewTemplate((prev) => ({ ...prev, ...v }))}
            t={t}
          />
          <Button
            size="sm"
            onClick={handleCreate}
            disabled={createTemplate.isPending || !newTemplate.topic || !newTemplate.topicLabel || !newTemplate.subject || !newTemplate.body}
          >
            {t('messaging.templateSave')}
          </Button>
        </div>
      )}

      {/* Template list */}
      {templates.length === 0 ? (
        <EmptyState icon={MessageSquare} title={t('messaging.noMessages')} />
      ) : (
        <div className="space-y-3">
          {templates.map((tpl) =>
            editingId === tpl.id ? (
              <div key={tpl.id} className="rounded-md border border-border p-4 space-y-3">
                <TemplateForm
                  value={editForm}
                  onChange={setEditForm}
                  t={t}
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={handleSaveEdit}
                    disabled={updateTemplate.isPending}
                  >
                    {t('messaging.templateSave')}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setEditingId(null)}>
                    {t('common.cancel')}
                  </Button>
                </div>
              </div>
            ) : (
              <TemplateCard
                key={tpl.id}
                template={tpl}
                t={t}
                onEdit={() => handleStartEdit(tpl)}
                onDelete={() => setDeleteTarget(tpl)}
              />
            )
          )}
        </div>
      )}

      {/* Delete confirmation */}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={() => setDeleteTarget(null)}
        title={t('messaging.templateDelete')}
        description={t('messaging.confirmDelete')}
        variant="destructive"
        onConfirm={handleDelete}
      />
    </div>
  );
}

// --- Sub-components ---

function TemplateCard({
  template,
  t,
  onEdit,
  onDelete,
}: {
  template: MessageTemplate;
  t: (key: string) => string;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="rounded-md border border-border p-4 hover:bg-muted/30 transition-colors">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2 mb-2">
          <span
            className="inline-block h-3 w-3 rounded-full"
            style={{ backgroundColor: template.color }}
          />
          <span className="font-medium text-sm">{template.topicLabel}</span>
          {template.is_default && (
            <Badge variant="outline" className="text-xs">
              {t('messaging.templateDefault')}
            </Badge>
          )}
          <Badge variant="secondary" className="text-xs">
            {t(`messaging.channel${template.channel.charAt(0).toUpperCase() + template.channel.slice(1)}`)}
          </Badge>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={onEdit}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={onDelete}>
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      </div>
      <p className="text-sm text-foreground mb-1">{template.subject}</p>
      <p className="text-xs text-muted-foreground line-clamp-2">{template.body}</p>
    </div>
  );
}

function TemplateForm({
  value,
  onChange,
  t,
}: {
  value: Partial<CreateMessageTemplateInput>;
  onChange: (v: Partial<CreateMessageTemplateInput>) => void;
  t: (key: string) => string;
}) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <FormField label={t('messaging.templateName')} required>
          <Input
            value={value.topicLabel ?? ''}
            onChange={(e) => onChange({ ...value, topicLabel: e.target.value })}
          />
        </FormField>
        <FormField label="Topic ID" required>
          <Input
            value={value.topic ?? ''}
            onChange={(e) => onChange({ ...value, topic: e.target.value })}
            dir="ltr"
          />
        </FormField>
      </div>
      <FormField label={t('messaging.subject')} required>
        <Input
          value={value.subject ?? ''}
          onChange={(e) => onChange({ ...value, subject: e.target.value })}
        />
      </FormField>
      <FormField label={t('messaging.templateBody')} required>
        <Textarea
          value={value.body ?? ''}
          onChange={(e) => onChange({ ...value, body: e.target.value })}
          rows={5}
        />
      </FormField>
      <div className="grid grid-cols-3 gap-3">
        <FormField label={t('messaging.channel')}>
          <Select
            value={value.channel ?? 'email'}
            onValueChange={(v) => onChange({ ...value, channel: v as MessageChannel })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CHANNEL_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {t(opt.label)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
        <FormField label={t('messaging.templateColor')}>
          <Input
            type="color"
            value={value.color ?? '#64748b'}
            onChange={(e) => onChange({ ...value, color: e.target.value })}
            className="h-9 p-1"
          />
        </FormField>
        <FormField label={t('messaging.templateIcon')}>
          <Input
            value={value.icon ?? 'mail'}
            onChange={(e) => onChange({ ...value, icon: e.target.value })}
            dir="ltr"
          />
        </FormField>
      </div>
    </div>
  );
}
