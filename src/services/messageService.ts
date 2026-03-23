// CREATED: 2026-03-24
// UPDATED: 2026-03-24 10:00 IST (Jerusalem)
//          - Initial implementation

import { supabase } from '@/integrations/supabase/client';
import type {
  MessageTemplate, Message, ScheduledMessage,
  CreateMessageTemplateInput, UpdateMessageTemplateInput,
  CreateMessageInput, CreateScheduledInput, MessageChannel,
} from '@/types';
import type { Client } from '@/types/client';

// --- Default templates seeded per firm ---
const DEFAULT_MESSAGE_TEMPLATES = [
  {
    topic: 'vat',
    topic_label: 'מע"מ',
    subject: 'בקשה להעברת חומר לדוח מע"מ — {{period}}',
    body: 'שלום {{client_name}},\n\nאנו מבקשים להעביר את חומרי החשבונאות לצורך הכנת דוח המע"מ לתקופה {{period}}.\n\nמועד הגשה: {{due_date}}\nנא להעביר את החומרים עד: {{task_due}}\n\nחומרים נדרשים:\n• חשבוניות קנייה ומכירה\n• קבלות הוצאות\n• תדפיסי בנק לתקופה\n\nלפרטים נוספים ניתן לפנות ל{{staff_name}}.\n\nבברכה,\n{{firm_name}}',
    channel: 'email' as const,
    color: '#f59e0b',
    icon: 'receipt',
  },
  {
    topic: 'salary',
    topic_label: 'משכורות',
    subject: 'בקשה להעברת חומר למשכורות — {{period}}',
    body: 'שלום {{client_name}},\n\nלקראת הכנת תלושי השכר לחודש {{period}}, אנו מבקשים להעביר:\n\n• דוח נוכחות / שעות עבודה\n• שינויים בשכר / תוספות\n• ימי מחלה / חופשה\n• עובדים חדשים / עזיבות\n\nנא להעביר עד תאריך: {{task_due}}\n\nלפרטים: {{staff_name}} | {{firm_name}}',
    channel: 'email' as const,
    color: '#10b981',
    icon: 'banknote',
  },
  {
    topic: 'annual',
    topic_label: 'דוחות כספיים',
    subject: 'הכנת דוחות כספיים שנתיים — {{period}}',
    body: 'שלום {{client_name}},\n\nהגיע הזמן להכנת הדוחות הכספיים השנתיים לשנת {{period}}.\n\nנא להעביר:\n• כל חשבוניות הקנייה והמכירה לשנה\n• תדפיסי בנק שנתיים\n• רשימת מלאי (אם רלוונטי)\n• נכסים קבועים שנרכשו / נמכרו\n• הלוואות ואשראי\n\nמועד יעד: {{due_date}}\n\nבברכה,\n{{staff_name}}\n{{firm_name}}',
    channel: 'email' as const,
    color: '#3b82f6',
    icon: 'bar-chart',
  },
  {
    topic: 'wealth',
    topic_label: 'הצהרת הון',
    subject: 'הכנת הצהרת הון — {{period}}',
    body: 'שלום {{client_name}},\n\nקיבלנו דרישה / מועד להגשת הצהרת הון.\n\nנדרש לאסוף:\n• נכסי נדל"ן ורכבים\n• חשבונות בנק ותיקי השקעות\n• הלוואות וחובות\n• ביטוחי חיים עם ערך פדיון\n• מניות וזכויות בחברות\n\nנא לפנות אלינו לקביעת פגישה.\nמועד הגשה: {{due_date}}\n\nבברכה,\n{{firm_name}}',
    channel: 'email' as const,
    color: '#8b5cf6',
    icon: 'landmark',
  },
  {
    topic: 'taxAdv',
    topic_label: 'מקדמות מס',
    subject: 'עדכון תשלום מקדמת מס הכנסה — {{period}}',
    body: 'שלום {{client_name}},\n\nלידיעתכם, מועד תשלום מקדמת מס הכנסה לתקופה {{period}} הינו {{due_date}}.\n\nסכום לתשלום: {{amount}}\n\nניתן לשלם דרך אתר רשות המסים או בבנק.\n\nלסיוע: {{staff_name}} | {{firm_name}}',
    channel: 'email' as const,
    color: '#ef4444',
    icon: 'calendar',
  },
  {
    topic: 'general',
    topic_label: 'עדכון כללי',
    subject: '{{subject}}',
    body: 'שלום {{client_name}},\n\n{{body}}\n\nבברכה,\n{{staff_name}}\n{{firm_name}}',
    channel: 'email' as const,
    color: '#64748b',
    icon: 'megaphone',
  },
];

// --- Row mappers (DB snake_case -> TS camelCase) ---

// Column mapping: topic_label -> topicLabel, is_default -> is_default (same)
function rowToTemplate(row: Record<string, unknown>): MessageTemplate {
  return {
    id: row.id as string,
    firm_id: row.firm_id as string,
    topic: row.topic as string,
    topicLabel: row.topic_label as string,
    subject: row.subject as string,
    body: row.body as string,
    channel: row.channel as MessageChannel,
    color: row.color as string,
    icon: row.icon as string,
    is_default: row.is_default as boolean,
    deleted_at: (row.deleted_at as string) ?? undefined,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

// Column mapping: client_name -> clientName, template_id -> templateId,
// sent_at -> sentAt, sent_by -> sentBy, to_email -> toEmail, to_phone -> toPhone
function rowToMessage(row: Record<string, unknown>): Message {
  return {
    id: row.id as string,
    firm_id: row.firm_id as string,
    client_id: row.client_id as string,
    clientName: row.client_name as string,
    templateId: (row.template_id as string) ?? undefined,
    topic: row.topic as string,
    channel: row.channel as MessageChannel,
    subject: row.subject as string,
    body: row.body as string,
    sentAt: row.sent_at as string,
    status: row.status as Message['status'],
    sentBy: row.sent_by as string,
    toEmail: (row.to_email as string) ?? undefined,
    toPhone: (row.to_phone as string) ?? undefined,
    created_at: row.created_at as string,
  };
}

// Column mapping: template_id -> templateId, send_date -> sendDate,
// extra_vars -> extraVars, resolved_subject -> resolvedSubject,
// resolved_body -> resolvedBody, created_by -> createdBy
function rowToScheduled(row: Record<string, unknown>): ScheduledMessage {
  return {
    id: row.id as string,
    firm_id: row.firm_id as string,
    client_id: row.client_id as string,
    templateId: row.template_id as string,
    sendDate: row.send_date as string,
    channel: row.channel as MessageChannel,
    resolvedSubject: row.resolved_subject as string,
    resolvedBody: row.resolved_body as string,
    createdBy: row.created_by as string,
    extraVars: (row.extra_vars as Record<string, string>) ?? undefined,
    status: row.status as ScheduledMessage['status'],
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

function templateInputToRow(input: CreateMessageTemplateInput): Record<string, unknown> {
  return {
    topic: input.topic,
    topic_label: input.topicLabel,
    subject: input.subject,
    body: input.body,
    channel: input.channel,
    color: input.color,
    icon: input.icon,
  };
}

function messageInputToRow(input: CreateMessageInput): Record<string, unknown> {
  return {
    client_id: input.client_id,
    client_name: input.clientName,
    template_id: input.templateId ?? null,
    topic: input.topic,
    channel: input.channel,
    subject: input.subject,
    body: input.body,
    sent_by: input.sentBy,
    to_email: input.toEmail ?? null,
    to_phone: input.toPhone ?? null,
  };
}

const MAX_BATCH_SIZE = 200;

export const messageService = {
  // ===== TEMPLATES =====

  async listTemplates(firmId: string): Promise<MessageTemplate[]> {
    const { data, error } = await supabase
      .from('message_templates')
      .select('*')
      .eq('firm_id', firmId)
      .is('deleted_at', null)
      .order('is_default', { ascending: false })
      .order('topic', { ascending: true });

    if (error) throw new Error(error.message);
    return (data as Record<string, unknown>[]).map(rowToTemplate);
  },

  async getTemplate(firmId: string, id: string): Promise<MessageTemplate> {
    const { data, error } = await supabase
      .from('message_templates')
      .select('*')
      .eq('id', id)
      .eq('firm_id', firmId)
      .is('deleted_at', null)
      .single();

    if (error) throw new Error(error.message);
    return rowToTemplate(data as Record<string, unknown>);
  },

  async createTemplate(firmId: string, input: CreateMessageTemplateInput): Promise<MessageTemplate> {
    const row = templateInputToRow(input);
    row.firm_id = firmId;
    row.is_default = false;

    const { data, error } = await supabase
      .from('message_templates')
      .insert(row)
      .select('*')
      .single();

    if (error) throw new Error(error.message);
    return rowToTemplate(data as Record<string, unknown>);
  },

  async updateTemplate(firmId: string, id: string, input: UpdateMessageTemplateInput): Promise<MessageTemplate> {
    const updateObj: Record<string, unknown> = {};
    if (input.topic !== undefined) updateObj.topic = input.topic;
    if (input.topicLabel !== undefined) updateObj.topic_label = input.topicLabel;
    if (input.subject !== undefined) updateObj.subject = input.subject;
    if (input.body !== undefined) updateObj.body = input.body;
    if (input.channel !== undefined) updateObj.channel = input.channel;
    if (input.color !== undefined) updateObj.color = input.color;
    if (input.icon !== undefined) updateObj.icon = input.icon;

    const { data, error } = await supabase
      .from('message_templates')
      .update(updateObj)
      .eq('id', id)
      .eq('firm_id', firmId)
      .select('*')
      .single();

    if (error) throw new Error(error.message);
    return rowToTemplate(data as Record<string, unknown>);
  },

  async deleteTemplate(firmId: string, id: string): Promise<void> {
    const { error } = await supabase
      .from('message_templates')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
      .eq('firm_id', firmId);

    if (error) throw new Error(error.message);
  },

  async seedDefaultTemplates(firmId: string): Promise<void> {
    const rows = DEFAULT_MESSAGE_TEMPLATES.map((t) => ({
      firm_id: firmId,
      topic: t.topic,
      topic_label: t.topic_label,
      subject: t.subject,
      body: t.body,
      channel: t.channel,
      color: t.color,
      icon: t.icon,
      is_default: true,
    }));

    const { error } = await supabase
      .from('message_templates')
      .upsert(rows, { onConflict: 'firm_id,topic', ignoreDuplicates: true });

    if (error) throw new Error(error.message);
  },

  // ===== MESSAGES (log) =====

  async listMessages(
    firmId: string,
    filters?: {
      clientId?: string;
      topic?: string;
      channel?: MessageChannel;
      fromDate?: string;
      toDate?: string;
    }
  ): Promise<Message[]> {
    let query = supabase
      .from('messages')
      .select('*')
      .eq('firm_id', firmId)
      .order('sent_at', { ascending: false })
      .limit(500);

    if (filters?.clientId) query = query.eq('client_id', filters.clientId);
    if (filters?.topic) query = query.eq('topic', filters.topic);
    if (filters?.channel) query = query.eq('channel', filters.channel);
    if (filters?.fromDate) query = query.gte('sent_at', filters.fromDate);
    if (filters?.toDate) query = query.lte('sent_at', filters.toDate + 'T23:59:59');

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return (data as Record<string, unknown>[]).map(rowToMessage);
  },

  async createMessage(firmId: string, input: CreateMessageInput): Promise<Message> {
    const row = messageInputToRow(input);
    row.firm_id = firmId;

    const { data, error } = await supabase
      .from('messages')
      .insert(row)
      .select('*')
      .single();

    if (error) throw new Error(error.message);
    return rowToMessage(data as Record<string, unknown>);
  },

  async createBatchMessages(firmId: string, inputs: CreateMessageInput[]): Promise<Message[]> {
    if (inputs.length > MAX_BATCH_SIZE) {
      throw new Error(`Batch size ${inputs.length} exceeds maximum of ${MAX_BATCH_SIZE}`);
    }

    const rows = inputs.map((input) => {
      const row = messageInputToRow(input);
      row.firm_id = firmId;
      return row;
    });

    const { data, error } = await supabase
      .from('messages')
      .insert(rows)
      .select('*');

    if (error) throw new Error(error.message);
    return (data as Record<string, unknown>[]).map(rowToMessage);
  },

  // ===== SCHEDULED MESSAGES =====

  async listScheduled(firmId: string): Promise<ScheduledMessage[]> {
    const { data, error } = await supabase
      .from('scheduled_messages')
      .select('*')
      .eq('firm_id', firmId)
      .order('send_date', { ascending: true })
      .order('created_at', { ascending: true });

    if (error) throw new Error(error.message);
    return (data as Record<string, unknown>[]).map(rowToScheduled);
  },

  async createScheduled(firmId: string, input: CreateScheduledInput): Promise<ScheduledMessage> {
    // Verify template is not soft-deleted before inserting
    const { data: tplCheck, error: tplError } = await supabase
      .from('message_templates')
      .select('id')
      .eq('id', input.templateId)
      .is('deleted_at', null)
      .single();

    if (tplError || !tplCheck) {
      throw new Error('Template not found or deleted');
    }

    const row: Record<string, unknown> = {
      firm_id: firmId,
      client_id: input.client_id,
      template_id: input.templateId,
      send_date: input.sendDate,
      channel: input.channel,
      resolved_subject: input.resolvedSubject,
      resolved_body: input.resolvedBody,
      created_by: input.createdBy,
      extra_vars: input.extraVars ?? {},
    };

    const { data, error } = await supabase
      .from('scheduled_messages')
      .insert(row)
      .select('*')
      .single();

    if (error) throw new Error(error.message);
    return rowToScheduled(data as Record<string, unknown>);
  },

  async cancelScheduled(firmId: string, id: string): Promise<ScheduledMessage> {
    const { data, error } = await supabase
      .from('scheduled_messages')
      .update({ status: 'cancelled' })
      .eq('id', id)
      .eq('firm_id', firmId)
      .eq('status', 'pending')
      .select('*')
      .single();

    if (error) throw new Error(error.message);
    return rowToScheduled(data as Record<string, unknown>);
  },

  async runScheduledMessages(firmId: string): Promise<number> {
    const { data, error } = await supabase.rpc('process_scheduled_messages', {
      p_firm_id: firmId,
    });

    if (error) throw new Error(error.message);
    return (data as number) ?? 0;
  },

  // ===== TEMPLATE ENGINE =====

  buildMsgVars(
    client: Client,
    firmName: string,
    staffName: string,
    extra?: Record<string, string>
  ): Record<string, string> {
    return {
      client_name: client.name,
      staff_name: staffName,
      firm_name: firmName,
      today: new Date().toISOString().slice(0, 10),
      phone: client.mobile ?? '',
      email: client.email ?? '',
      period: extra?.period ?? new Date().toLocaleDateString('he-IL', { month: 'long', year: 'numeric' }),
      due_date: extra?.due_date ?? '',
      task_due: extra?.task_due ?? '',
      amount: extra?.amount ?? '',
      subject: extra?.subject ?? '',
      body: extra?.body ?? '',
      ...extra,
    };
  },

  fillTemplate(template: string, vars: Record<string, string>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => vars[key] ?? '');
  },
};
