// CREATED: 2026-03-24
// UPDATED: 2026-03-24 13:00 IST (Jerusalem)
//          - Initial implementation

import { useState, useMemo } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuthStore } from '@/stores/useAuthStore';
import { useTemplates, useSendMessage, useSeedTemplates } from '@/hooks/useMessages';
import { messageService } from '@/services/messageService';
import { FormField } from '@/components/shared/FormField';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { MessageSquare, Send } from 'lucide-react';
import type { Client } from '@/types/client';
import type { MessageTemplate, MessageChannel, CreateMessageInput } from '@/types';
import { useEffect, useRef } from 'react';

function extractVars(template: MessageTemplate): string[] {
  const matches = (template.subject + template.body).matchAll(/\{\{(\w+)\}\}/g);
  const vars = new Set<string>();
  for (const m of matches) vars.add(m[1]);
  const autoFilled = ['client_name', 'staff_name', 'firm_name', 'today', 'phone', 'email'];
  autoFilled.forEach((v) => vars.delete(v));
  return Array.from(vars);
}

interface ClientMsgButtonProps {
  client: Client;
}

export function ClientMsgButton({ client }: ClientMsgButtonProps) {
  const { t } = useLanguage();
  const firmId = useAuthStore((s) => s.firmId);
  const firmName = useAuthStore((s) => s.firmName) ?? '';
  const userName = useAuthStore((s) => s.user?.name) ?? '';
  const can = useAuthStore((s) => s.can);

  const { data: templates = [], isSuccess } = useTemplates(firmId);
  const seedTemplates = useSeedTemplates();
  const sendMessage = useSendMessage();
  const seededRef = useRef(false);

  const [open, setOpen] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [channelOverride, setChannelOverride] = useState<MessageChannel | null>(null);
  const [extraVars, setExtraVars] = useState<Record<string, string>>({});

  // Seed templates if needed
  useEffect(() => {
    if (firmId && isSuccess && templates.length === 0 && !seededRef.current) {
      seededRef.current = true;
      seedTemplates.mutate({ firmId });
    }
  }, [firmId, isSuccess, templates, seedTemplates]);

  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId) ?? null;
  const templateVars = selectedTemplate ? extractVars(selectedTemplate) : [];
  const channel = channelOverride ?? selectedTemplate?.channel ?? 'email';

  const previewText = useMemo(() => {
    if (!selectedTemplate) return null;
    const vars = messageService.buildMsgVars(client, firmName, userName, extraVars);
    return {
      subject: messageService.fillTemplate(selectedTemplate.subject, vars),
      body: messageService.fillTemplate(selectedTemplate.body, vars),
    };
  }, [selectedTemplate, client, firmName, userName, extraVars]);

  const handleSend = () => {
    if (!firmId || !selectedTemplate) return;

    const vars = messageService.buildMsgVars(client, firmName, userName, extraVars);
    const input: CreateMessageInput = {
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
    };

    sendMessage.mutate(
      { firmId, inputs: [input] },
      {
        onSuccess: () => {
          setOpen(false);
          setSelectedTemplateId(null);
          setChannelOverride(null);
          setExtraVars({});
        },
      }
    );
  };

  if (!can('messaging.send')) return null;

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <MessageSquare className="h-4 w-4 me-2" />
        {t('messaging.quickSend')}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('messaging.quickSend')} — {client.name}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
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

            {/* Variable inputs */}
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
            {previewText && (
              <div className="rounded-md border border-border bg-muted/30 p-3 space-y-1">
                <p className="text-sm font-medium">{previewText.subject}</p>
                <p className="text-xs text-muted-foreground whitespace-pre-wrap line-clamp-6">
                  {previewText.body}
                </p>
              </div>
            )}

            {/* Send button */}
            <Button
              onClick={handleSend}
              disabled={!selectedTemplate || sendMessage.isPending}
              className="w-full"
            >
              <Send className="h-4 w-4 me-2" />
              {t('messaging.send')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
