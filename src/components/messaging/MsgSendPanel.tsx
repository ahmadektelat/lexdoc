// CREATED: 2026-03-24
// UPDATED: 2026-03-24 11:00 IST (Jerusalem)
//          - Initial implementation

import { useState, useMemo } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuthStore } from '@/stores/useAuthStore';
import { useClients } from '@/hooks/useClients';
import { useTemplates, useSendMessage } from '@/hooks/useMessages';
import { messageService } from '@/services/messageService';
import { FormField } from '@/components/shared/FormField';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { SearchInput } from '@/components/shared/SearchInput';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Send, Eye } from 'lucide-react';
import type { MessageTemplate, MessageChannel, CreateMessageInput } from '@/types';

/** Extract user-fillable variables from template (excluding auto-filled ones) */
function extractVars(template: MessageTemplate): string[] {
  const matches = (template.subject + template.body).matchAll(/\{\{(\w+)\}\}/g);
  const vars = new Set<string>();
  for (const m of matches) vars.add(m[1]);
  const autoFilled = ['client_name', 'staff_name', 'firm_name', 'today', 'phone', 'email'];
  autoFilled.forEach((v) => vars.delete(v));
  return Array.from(vars);
}

export function MsgSendPanel() {
  const { t } = useLanguage();
  const firmId = useAuthStore((s) => s.firmId);
  const firmName = useAuthStore((s) => s.firmName) ?? '';
  const userName = useAuthStore((s) => s.user?.name) ?? '';
  const can = useAuthStore((s) => s.can);

  const { data: clients = [], isLoading: clientsLoading } = useClients(firmId);
  const { data: templates = [] } = useTemplates(firmId);
  const sendMessage = useSendMessage();

  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [selectedClientIds, setSelectedClientIds] = useState<Set<string>>(new Set());
  const [channelOverride, setChannelOverride] = useState<MessageChannel | null>(null);
  const [extraVars, setExtraVars] = useState<Record<string, string>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [showPreview, setShowPreview] = useState(false);

  const activeClients = useMemo(
    () => clients.filter((c) => c.status === 'active' && !c.deleted_at),
    [clients]
  );

  const filteredClients = useMemo(() => {
    if (!searchQuery) return activeClients;
    const q = searchQuery.toLowerCase();
    return activeClients.filter(
      (c) => c.name.toLowerCase().includes(q) || c.caseNum.toLowerCase().includes(q)
    );
  }, [activeClients, searchQuery]);

  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId) ?? null;
  const templateVars = selectedTemplate ? extractVars(selectedTemplate) : [];
  const channel = channelOverride ?? selectedTemplate?.channel ?? 'email';

  // Preview for first selected client
  const previewClient = useMemo(() => {
    const firstId = Array.from(selectedClientIds)[0];
    return activeClients.find((c) => c.id === firstId) ?? null;
  }, [selectedClientIds, activeClients]);

  const previewText = useMemo(() => {
    if (!selectedTemplate || !previewClient) return null;
    const vars = messageService.buildMsgVars(previewClient, firmName, userName, extraVars);
    return {
      subject: messageService.fillTemplate(selectedTemplate.subject, vars),
      body: messageService.fillTemplate(selectedTemplate.body, vars),
    };
  }, [selectedTemplate, previewClient, firmName, userName, extraVars]);

  const handleToggleClient = (clientId: string) => {
    setSelectedClientIds((prev) => {
      const next = new Set(prev);
      if (next.has(clientId)) next.delete(clientId);
      else next.add(clientId);
      return next;
    });
  };

  const handleSelectAll = () => {
    setSelectedClientIds(new Set(filteredClients.map((c) => c.id)));
  };

  const handleClearAll = () => {
    setSelectedClientIds(new Set());
  };

  const handleSend = () => {
    if (!firmId || !selectedTemplate || selectedClientIds.size === 0) return;

    const inputs: CreateMessageInput[] = [];
    for (const clientId of selectedClientIds) {
      const client = activeClients.find((c) => c.id === clientId);
      if (!client) continue;
      const vars = messageService.buildMsgVars(client, firmName, userName, extraVars);
      inputs.push({
        client_id: client.id,
        clientName: client.name,
        templateId: selectedTemplate.id,
        topic: selectedTemplate.topic,
        channel,
        subject: messageService.fillTemplate(selectedTemplate.subject, vars),
        body: messageService.fillTemplate(selectedTemplate.body, vars),
        sentBy: userName,
        toEmail: client.email,
        toPhone: client.mobile,
      });
    }

    sendMessage.mutate(
      { firmId, inputs },
      {
        onSuccess: () => {
          setSelectedClientIds(new Set());
          setExtraVars({});
          setShowPreview(false);
        },
      }
    );
  };

  if (clientsLoading) return <LoadingSpinner size="lg" className="py-20" />;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
      {/* Left column: Template + Variables + Preview (60%) */}
      <div className="lg:col-span-3 space-y-4">
        {/* Template selector */}
        <FormField label={t('messaging.selectTemplate')}>
          <Select
            value={selectedTemplateId ?? ''}
            onValueChange={(v) => {
              setSelectedTemplateId(v);
              setChannelOverride(null);
              setExtraVars({});
              setShowPreview(false);
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

        {/* Preview */}
        {selectedTemplate && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowPreview(!showPreview)}
            disabled={selectedClientIds.size === 0}
          >
            <Eye className="h-4 w-4 me-2" />
            {t('messaging.preview')}
          </Button>
        )}

        {showPreview && previewText && (
          <div className="rounded-md border border-border bg-muted/30 p-4 space-y-2">
            <h4 className="text-sm font-medium">{t('messaging.previewTitle')}</h4>
            <p className="text-sm font-medium">{previewText.subject}</p>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">
              {previewText.body}
            </p>
          </div>
        )}

        {/* Send button */}
        <Button
          onClick={handleSend}
          disabled={
            !selectedTemplate ||
            selectedClientIds.size === 0 ||
            sendMessage.isPending ||
            !can('messaging.send')
          }
          className="w-full"
        >
          <Send className="h-4 w-4 me-2" />
          {selectedClientIds.size > 0
            ? t('messaging.sendCount').replace('{{count}}', String(selectedClientIds.size))
            : t('messaging.send')}
        </Button>
      </div>

      {/* Right column: Client multi-select (40%) */}
      <div className="lg:col-span-2 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium">{t('messaging.selectClients')}</h3>
          {selectedClientIds.size > 0 && (
            <Badge variant="secondary">
              {t('messaging.clientsSelected').replace('{{count}}', String(selectedClientIds.size))}
            </Badge>
          )}
        </div>

        <SearchInput
          value={searchQuery}
          onChange={setSearchQuery}
          className="w-full"
        />

        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleSelectAll}>
            {t('messaging.selectAll')}
          </Button>
          <Button variant="outline" size="sm" onClick={handleClearAll}>
            {t('messaging.clearAll')}
          </Button>
        </div>

        {activeClients.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('messaging.noClients')}</p>
        ) : (
          <div className="max-h-96 overflow-y-auto border border-border rounded-md">
            {filteredClients.map((client) => (
              <label
                key={client.id}
                className="flex items-center gap-3 px-3 py-2 hover:bg-muted/50 cursor-pointer border-b border-border last:border-b-0"
              >
                <Checkbox
                  checked={selectedClientIds.has(client.id)}
                  onCheckedChange={() => handleToggleClient(client.id)}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{client.name}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {client.email ?? t('messaging.noEmail')}
                  </p>
                </div>
              </label>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
