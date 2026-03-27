// CREATED: 2026-03-17
// UPDATED: 2026-03-24 10:00 IST (Jerusalem)
//          - Added is_default, deleted_at to MessageTemplate
//          - Added 'cancelled' to ScheduledMessage status
//          - Added channel, resolvedSubject, resolvedBody, createdBy to ScheduledMessage
//          - Added input types: CreateMessageTemplateInput, UpdateMessageTemplateInput,
//            CreateMessageInput, CreateScheduledInput

export type MessageChannel = 'email' | 'sms' | 'whatsapp';

export interface MessageTemplate {
  id: string;
  firm_id: string;          // always set — per-firm copies
  topic: string;
  topicLabel: string;
  subject: string;
  body: string;
  channel: MessageChannel;
  color: string;
  icon: string;
  is_default: boolean;
  deleted_at?: string;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  firm_id: string;
  client_id: string;
  clientName: string;
  templateId?: string;
  topic: string;
  channel: MessageChannel;
  subject: string;
  body: string;
  sentAt: string;         // ISO datetime
  status: 'sent' | 'failed' | 'pending';
  sentBy: string;
  toEmail?: string;
  toPhone?: string;
  created_at: string;
}

export interface ScheduledMessage {
  id: string;
  firm_id: string;
  client_id: string;
  templateId: string;
  sendDate: string;       // ISO date
  channel: MessageChannel;
  resolvedSubject: string; // pre-filled subject at schedule time
  resolvedBody: string;    // pre-filled body at schedule time
  createdBy: string;       // scheduler's display name (for sent_by in message log)
  /**
   * Original template variable map stored for display/audit purposes.
   * NOT used for substitution at send time — resolved_subject/body are used instead.
   */
  extraVars?: Record<string, string>;
  status: 'pending' | 'sent' | 'failed' | 'cancelled';
  created_at: string;
  updated_at: string;
}

// --- Input types ---

export type CreateMessageTemplateInput = Omit<
  MessageTemplate,
  'id' | 'firm_id' | 'is_default' | 'deleted_at' | 'created_at' | 'updated_at'
>;

export type UpdateMessageTemplateInput = Partial<
  Omit<MessageTemplate, 'id' | 'firm_id' | 'is_default' | 'deleted_at' | 'created_at' | 'updated_at'>
>;

export interface CreateMessageInput {
  client_id: string;
  clientName: string;
  templateId?: string;
  topic: string;
  channel: MessageChannel;
  subject: string;
  body: string;
  sentBy: string;
  toEmail?: string;
  toPhone?: string;
}

export interface CreateScheduledInput {
  client_id: string;
  templateId: string;
  sendDate: string;         // ISO date string 'YYYY-MM-DD'
  channel: MessageChannel;
  resolvedSubject: string;  // pre-filled at schedule time by client
  resolvedBody: string;     // pre-filled at schedule time by client
  createdBy: string;        // scheduler's display name
  extraVars?: Record<string, string>;
}
