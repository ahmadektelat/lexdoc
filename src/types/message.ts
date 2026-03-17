// CREATED: 2026-03-17
// UPDATED: 2026-03-17 14:30 IST (Jerusalem)
//          - Added timestamps to MessageTemplate, Message, ScheduledMessage (amendment 5)
//          - Added optional firm_id to MessageTemplate (amendment 5)
//          - Added JSDoc on ScheduledMessage.extraVars (security audit)

export type MessageChannel = 'email' | 'sms' | 'whatsapp';

export interface MessageTemplate {
  id: string;
  topic: string;
  topicLabel: string;
  subject: string;
  body: string;
  channel: MessageChannel;
  color: string;
  icon: string;
  firm_id?: string;     // null = system-wide, set = firm-specific
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
  /**
   * Template variable substitution map for send-time interpolation.
   * WARNING: Values are interpolated into message body — ensure HTML escaping
   * is applied before rendering in any HTML context to prevent XSS.
   */
  extraVars?: Record<string, string>;
  status: 'pending' | 'sent' | 'failed';
  created_at: string;
  updated_at: string;
}
