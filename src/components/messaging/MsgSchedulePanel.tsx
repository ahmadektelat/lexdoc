// CREATED: 2026-03-24
// UPDATED: 2026-03-24 12:00 IST (Jerusalem)
//          - Initial implementation

import { useState, useMemo } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuthStore } from '@/stores/useAuthStore';
import { useClients } from '@/hooks/useClients';
import {
  useTemplates,
  useScheduledMessages,
  useScheduleMessage,
  useCancelScheduled,
  useRunScheduledMessages,
} from '@/hooks/useMessages';
import { messageService } from '@/services/messageService';
import { FormField } from '@/components/shared/FormField';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { EmptyState } from '@/components/shared/EmptyState';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CalendarClock, Play, X } from 'lucide-react';
import { formatDate } from '@/lib/dates';
import type { MessageTemplate, MessageChannel, CreateScheduledInput } from '@/types';

/** Extract user-fillable variables from template (excluding auto-filled ones) */
function extractVars(template: MessageTemplate): string[] {
  const matches = (template.subject + template.body).matchAll(/\{\{(\w+)\}\}/g);
  const vars = new Set<string>();
  for (const m of matches) vars.add(m[1]);
  const autoFilled = ['client_name', 'staff_name', 'firm_name', 'today', 'phone', 'email'];
  autoFilled.forEach((v) => vars.delete(v));
  return Array.from(vars);
}

export function MsgSchedulePanel() {
  const { t } = useLanguage();
  const firmId = useAuthStore((s) => s.firmId);
  const firmName = useAuthStore((s) => s.firmName) ?? '';
  const userName = useAuthStore((s) => s.user?.name) ?? '';
  const can = useAuthStore((s) => s.can);

  const { data: clients = [], isLoading: clientsLoading } = useClients(firmId);
  const { data: templates = [] } = useTemplates(firmId);
  const { data: scheduledMessages = [], isLoading: scheduledLoading } = useScheduledMessages(firmId);

  const scheduleMessage = useScheduleMessage();
  const cancelScheduled = useCancelScheduled();
  const runScheduled = useRunScheduledMessages();

  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [sendDate, setSendDate] = useState('');
  const [channelOverride, setChannelOverride] = useState<MessageChannel | null>(null);
  const [extraVars, setExtraVars] = useState<Record<string, string>>({});

  const activeClients = useMemo(
    () => clients.filter((c) => c.status === 'active' && !c.deleted_at),
    [clients]
  );

  const clientMap = useMemo(() => {
    const m = new Map<string, string>();
    clients.forEach((c) => m.set(c.id, c.name));
    return m;
  }, [clients]);

  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId) ?? null;
  const templateVars = selectedTemplate ? extractVars(selectedTemplate) : [];
  const channel = channelOverride ?? selectedTemplate?.channel ?? 'email';

  const tomorrow = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  }, []);

  const pendingCount = scheduledMessages.filter((m) => m.status === 'pending').length;

  const handleSchedule = () => {
    if (!firmId || !selectedClientId || !selectedTemplateId || !selectedTemplate || !sendDate) return;

    const client = activeClients.find((c) => c.id === selectedClientId);
    if (!client) return;

    const vars = messageService.buildMsgVars(client, firmName, userName, extraVars);
    const resolvedSubject = messageService.fillTemplate(selectedTemplate.subject, vars);
    const resolvedBody = messageService.fillTemplate(selectedTemplate.body, vars);

    const input: CreateScheduledInput = {
      client_id: selectedClientId,
      templateId: selectedTemplateId,
      sendDate,
      channel,
      resolvedSubject,
      resolvedBody,
      createdBy: userName,
      extraVars,
    };

    scheduleMessage.mutate(
      { firmId, input },
      {
        onSuccess: () => {
          setSelectedClientId(null);
          setSelectedTemplateId(null);
          setSendDate('');
          setChannelOverride(null);
          setExtraVars({});
        },
      }
    );
  };

  const handleCancel = (id: string) => {
    if (!firmId) return;
    cancelScheduled.mutate({ firmId, id });
  };

  const handleRunNow = () => {
    if (!firmId) return;
    runScheduled.mutate({ firmId });
  };

  if (clientsLoading || scheduledLoading) return <LoadingSpinner size="lg" className="py-20" />;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Left: Schedule form */}
      <div className="space-y-4">
        <h3 className="text-sm font-medium">{t('messaging.scheduleAdd')}</h3>

        {/* Client picker */}
        <FormField label={t('messaging.selectClients')}>
          <Select
            value={selectedClientId ?? ''}
            onValueChange={setSelectedClientId}
          >
            <SelectTrigger>
              <SelectValue placeholder={t('messaging.selectClients')} />
            </SelectTrigger>
            <SelectContent>
              {activeClients.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>

        {/* Template picker */}
        <FormField label={t('messaging.selectTemplate')}>
          <Select
            value={selectedTemplateId ?? ''}
            onValueChange={(v) => {
              setSelectedTemplateId(v);
              setChannelOverride(null);
              setExtraVars({});
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder={t('messaging.selectTemplate')} />
            </SelectTrigger>
            <SelectContent>
              {templates.map((tpl) => (
                <SelectItem key={tpl.id} value={tpl.id}>
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-block h-2 w-2 rounded-full"
                      style={{ backgroundColor: tpl.color }}
                    />
                    {tpl.topicLabel}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>

        {/* Date picker */}
        <FormField label={t('messaging.scheduleDate')}>
          <Input
            type="date"
            value={sendDate}
            onChange={(e) => setSendDate(e.target.value)}
            min={tomorrow}
            dir="ltr"
          />
        </FormField>

        {/* Channel override */}
        <FormField label={t('messaging.channel')}>
          <Select
            value={channel}
            onValueChange={(v) => setChannelOverride(v as MessageChannel)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="email">{t('messaging.channelEmail')}</SelectItem>
              <SelectItem value="sms">{t('messaging.channelSms')}</SelectItem>
              <SelectItem value="whatsapp">{t('messaging.channelWhatsapp')}</SelectItem>
            </SelectContent>
          </Select>
        </FormField>

        {/* Variable inputs */}
        {templateVars.length > 0 && (
          <div className="space-y-3">
            {templateVars.map((varName) => (
              <FormField
                key={varName}
                label={t('messaging.variableHint').replace('{{var}}', varName)}
              >
                <Input
                  value={extraVars[varName] ?? ''}
                  onChange={(e) =>
                    setExtraVars((prev) => ({ ...prev, [varName]: e.target.value }))
                  }
                />
              </FormField>
            ))}
          </div>
        )}

        {/* Schedule button */}
        <Button
          onClick={handleSchedule}
          disabled={
            !selectedClientId ||
            !selectedTemplateId ||
            !sendDate ||
            scheduleMessage.isPending ||
            !can('messaging.send')
          }
          className="w-full"
        >
          <CalendarClock className="h-4 w-4 me-2" />
          {t('messaging.scheduleAdd')}
        </Button>
      </div>

      {/* Right: Scheduled messages list */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium">
            {t('messaging.schedulePending')} ({pendingCount})
          </h3>
          {pendingCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleRunNow}
              disabled={runScheduled.isPending}
            >
              <Play className="h-4 w-4 me-2" />
              {t('messaging.runNow')}
            </Button>
          )}
        </div>

        {scheduledMessages.length === 0 ? (
          <EmptyState icon={CalendarClock} title={t('messaging.noScheduled')} />
        ) : (
          <div className="space-y-2">
            {scheduledMessages.map((msg) => (
              <div
                key={msg.id}
                className="rounded-md border border-border p-3 flex items-center justify-between"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {clientMap.get(msg.client_id) ?? msg.client_id}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {msg.resolvedSubject}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-muted-foreground" dir="ltr">
                      {formatDate(msg.sendDate)}
                    </span>
                    <StatusBadge status={msg.status} />
                  </div>
                </div>
                {msg.status === 'pending' && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleCancel(msg.id)}
                    disabled={cancelScheduled.isPending}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
