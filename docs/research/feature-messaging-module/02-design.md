# Messaging Module — Technical Design

**Date:** 2026-03-23
**Author:** Architect Agent
**Requirements:** `docs/research/feature-messaging-module/01-requirements.md`
**Branch:** `migration/messaging-module`

---

## Architecture Approach

Build a full messaging module following the exact same layered architecture used by billing and documents: migration -> types -> service -> hooks -> components -> route integration. The module is simulation-only (no real delivery), which means the entire data flow stays within Supabase (no external APIs).

**Why this approach over alternatives:**
- Matches every existing module pattern (billing, documents, CRM) — zero new architectural concepts
- Service-layer template engine keeps business logic out of components
- pg_cron for scheduled messages avoids creating the project's first edge function for a simple SQL operation
- Per-firm template seeding via idempotent upsert matches the document folder seeding pattern exactly

---

## File-by-File Change Plan

### Database

#### `supabase/migrations/20260324100000_create_messaging_tables.sql`
- **Action:** Create
- **Changes:** 3 tables (message_templates, messages, scheduled_messages), RLS policies, indexes, triggers, GRANTs, and `process_scheduled_messages(p_firm_id)` function for authenticated callers
- **Rationale:** Core tables migration must succeed independently of pg_cron availability. Matches pattern of `20260323100000_create_documents_tables.sql`

#### `supabase/migrations/20260324100001_create_messaging_cron.sql`
- **Action:** Create
- **Changes:** `CREATE EXTENSION IF NOT EXISTS pg_cron`, unparameterized `process_all_scheduled_messages()` wrapper for cron, `cron.schedule()` call. Wrapped in DO/EXCEPTION block so failure does not break the deployment.
- **Rationale:** pg_cron is unavailable on Supabase free tier. Separating this into its own migration ensures the core tables are created even if cron setup fails. The manual "Run Now" button provides full functionality as a fallback.

### Types

#### `src/types/message.ts`
- **Action:** Modify
- **Changes:**
  - Add `is_default: boolean` to `MessageTemplate`
  - Add `'cancelled'` to `ScheduledMessage.status` union
  - Add `deleted_at?: string` to `MessageTemplate`
  - Add `channel?: MessageChannel` to `ScheduledMessage` (per-send override stored)
  - Add `CreateMessageTemplateInput`, `UpdateMessageTemplateInput`, `CreateMessageInput`, `CreateScheduledInput` types
- **Rationale:** Requirements specify these additions; input types follow the `billing.ts` pattern (`Omit<...>` for create, `Partial<Omit<...>>` for update)

### Service Layer

#### `src/services/messageService.ts`
- **Action:** Create
- **Changes:** Export `messageService` object with all CRUD methods plus template engine (`buildMsgVars`, `fillTemplate`), seeding logic (`seedDefaultTemplates`), and scheduled message processing (`runScheduledMessages`)
- **Rationale:** Follows `billingService.ts` and `documentService.ts` patterns — const object, rowToX mappers, supabase client

### Hook Layer

#### `src/hooks/useMessages.ts`
- **Action:** Create
- **Changes:** Export `messageKeys` factory + all query/mutation hooks for templates, messages, scheduled messages
- **Rationale:** Follows `useBilling.ts` pattern — query key factory, `useQuery` for reads, `useMutation` for writes, toast on success/error

### Components

#### `src/components/messaging/MessagingView.tsx`
- **Action:** Create
- **Changes:** Main view with permission check, PageHeader, shadcn Tabs with 4 tab panels
- **Rationale:** Entry point component, follows `BillingView.tsx` structure

#### `src/components/messaging/MsgSendPanel.tsx`
- **Action:** Create
- **Changes:** Multi-client checkbox list, template picker, variable inputs, channel override, preview, send button
- **Rationale:** Core send functionality with batch support

#### `src/components/messaging/MsgSchedulePanel.tsx`
- **Action:** Create
- **Changes:** Split layout — schedule form (left) + scheduled message list (right) with cancel and "Run Now" buttons
- **Rationale:** Scheduling UI as specified in requirements

#### `src/components/messaging/MsgLogPanel.tsx`
- **Action:** Create
- **Changes:** DataTable with filters (client, topic, channel, date range), message detail Dialog on row click
- **Rationale:** History view using established DataTable pattern

#### `src/components/messaging/MsgTemplatesPanel.tsx`
- **Action:** Create
- **Changes:** Template card list with inline edit form, variable reference sheet, create/delete for custom templates
- **Rationale:** Template management UI

#### `src/components/messaging/ClientMsgButton.tsx`
- **Action:** Create
- **Changes:** Button with Popover containing template picker, variable inputs, channel picker, send button — pre-filled with client
- **Rationale:** Quick-send from client detail view

### Route Integration

#### `src/App.tsx`
- **Action:** Modify (line 81)
- **Changes:** Replace `<SectionPlaceholder section="messaging" />` with `<MessagingView />`, add import
- **Rationale:** Wire up the /messaging route

### Client Detail Integration

#### `src/components/clients/ClientDetailView.tsx`
- **Action:** Modify (line ~64, inside action buttons div)
- **Changes:** Add `<ClientMsgButton client={client} />` after existing action buttons
- **Rationale:** Requirements specify ClientMsgButton in client header area

### i18n

#### `src/i18n/he.ts`
- **Action:** Modify
- **Changes:** Add ~45 `messaging.*` keys (full list below)
- **Rationale:** Hebrew primary language

#### `src/i18n/ar.ts`
- **Action:** Modify
- **Changes:** Add matching ~45 `messaging.*` keys in Arabic
- **Rationale:** Arabic secondary language

#### `src/i18n/en.ts`
- **Action:** Modify
- **Changes:** Add matching ~45 `messaging.*` keys in English
- **Rationale:** English tertiary language

### Registry

#### `docs/plans/SHARED-CODE-REGISTRY.md`
- **Action:** Modify
- **Changes:** Add `messageService`, `useMessages` hook, messaging components to registry
- **Rationale:** Keep shared code registry up to date

---

## Database Migration

### Migration 1: `supabase/migrations/20260324100000_create_messaging_tables.sql`

```sql
-- ============================================================
-- Messaging Module: message_templates, messages, scheduled_messages
-- CREATED: 2026-03-24
-- ============================================================

-- ========== MESSAGE TEMPLATES ==========
CREATE TABLE message_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id UUID NOT NULL REFERENCES firms(id),
  topic TEXT NOT NULL,
  topic_label TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'email' CHECK (channel IN ('email', 'sms', 'whatsapp')),
  color TEXT NOT NULL DEFAULT '#64748b',
  icon TEXT NOT NULL DEFAULT 'mail',
  is_default BOOLEAN NOT NULL DEFAULT false,
  deleted_at TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_msg_templates_firm ON message_templates(firm_id) WHERE deleted_at IS NULL;

-- Unique partial index: prevents duplicate default templates per firm+topic.
-- Used by seedDefaultTemplates upsert (ON CONFLICT DO NOTHING).
CREATE UNIQUE INDEX idx_msg_templates_default_unique
  ON message_templates(firm_id, topic) WHERE is_default = true AND deleted_at IS NULL;

-- RLS
ALTER TABLE message_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "msg_templates_select" ON message_templates FOR SELECT
  USING (firm_id IN (SELECT user_firm_ids()));
CREATE POLICY "msg_templates_insert" ON message_templates FOR INSERT
  WITH CHECK (firm_id IN (SELECT user_firm_ids()) AND firm_subscription_active(firm_id));
CREATE POLICY "msg_templates_update" ON message_templates FOR UPDATE
  USING (firm_id IN (SELECT user_firm_ids()) AND firm_subscription_active(firm_id));
CREATE POLICY "msg_templates_delete" ON message_templates FOR DELETE
  USING (firm_id IN (SELECT user_firm_ids()) AND firm_subscription_active(firm_id));

-- Trigger
CREATE TRIGGER msg_templates_updated_at BEFORE UPDATE ON message_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- GRANTs
GRANT SELECT, INSERT, UPDATE, DELETE ON message_templates TO authenticated;

-- ========== MESSAGES (log) ==========
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id UUID NOT NULL REFERENCES firms(id),
  client_id UUID NOT NULL REFERENCES clients(id),
  client_name TEXT NOT NULL,
  template_id UUID REFERENCES message_templates(id),
  topic TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('email', 'sms', 'whatsapp')),
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'failed', 'pending')),
  sent_by TEXT NOT NULL,
  to_email TEXT,
  to_phone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_messages_firm ON messages(firm_id);
CREATE INDEX idx_messages_firm_client ON messages(firm_id, client_id);
CREATE INDEX idx_messages_firm_sent_at ON messages(firm_id, sent_at DESC);

-- RLS
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "messages_select" ON messages FOR SELECT
  USING (firm_id IN (SELECT user_firm_ids()));
CREATE POLICY "messages_insert" ON messages FOR INSERT
  WITH CHECK (firm_id IN (SELECT user_firm_ids()) AND firm_subscription_active(firm_id));
-- Messages are immutable — no update or delete
CREATE POLICY "messages_update" ON messages FOR UPDATE USING (false);
CREATE POLICY "messages_delete" ON messages FOR DELETE USING (false);

-- GRANTs (no UPDATE/DELETE)
GRANT SELECT, INSERT ON messages TO authenticated;

-- ========== SCHEDULED MESSAGES ==========
-- NOTE: `resolved_subject` and `resolved_body` store the fully-substituted
-- message text at schedule time. This eliminates variable substitution
-- divergence between the TypeScript client and the SQL cron processor.
-- The cron/Run Now function simply copies these into the messages table.
CREATE TABLE scheduled_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id UUID NOT NULL REFERENCES firms(id),
  client_id UUID NOT NULL REFERENCES clients(id),
  template_id UUID NOT NULL REFERENCES message_templates(id),
  send_date DATE NOT NULL,
  channel TEXT NOT NULL DEFAULT 'email' CHECK (channel IN ('email', 'sms', 'whatsapp')),
  resolved_subject TEXT NOT NULL,
  resolved_body TEXT NOT NULL,
  created_by TEXT NOT NULL,
  extra_vars JSONB DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sent', 'failed', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_scheduled_msgs_firm ON scheduled_messages(firm_id);
CREATE INDEX idx_scheduled_msgs_pending ON scheduled_messages(firm_id, status, send_date)
  WHERE status = 'pending';

-- RLS
ALTER TABLE scheduled_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "scheduled_msgs_select" ON scheduled_messages FOR SELECT
  USING (firm_id IN (SELECT user_firm_ids()));
CREATE POLICY "scheduled_msgs_insert" ON scheduled_messages FOR INSERT
  WITH CHECK (firm_id IN (SELECT user_firm_ids()) AND firm_subscription_active(firm_id));
CREATE POLICY "scheduled_msgs_update" ON scheduled_messages FOR UPDATE
  USING (firm_id IN (SELECT user_firm_ids()) AND firm_subscription_active(firm_id));
CREATE POLICY "scheduled_msgs_delete" ON scheduled_messages FOR DELETE
  USING (firm_id IN (SELECT user_firm_ids()) AND firm_subscription_active(firm_id));

-- Trigger
CREATE TRIGGER scheduled_msgs_updated_at BEFORE UPDATE ON scheduled_messages
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- GRANTs
GRANT SELECT, INSERT, UPDATE, DELETE ON scheduled_messages TO authenticated;

-- ========== PROCESS SCHEDULED MESSAGES — FIRM-SCOPED ==========
-- Parameterized by firm_id so authenticated users can only process their own firm.
-- The "Run Now" button calls this via RPC with the user's firmId.
-- Since it takes p_firm_id and runs through the authenticated client,
-- RLS on the messages INSERT policy also validates firm membership.
CREATE OR REPLACE FUNCTION process_scheduled_messages(p_firm_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_rec RECORD;
  v_client RECORD;
  v_count INTEGER := 0;
BEGIN
  FOR v_rec IN
    SELECT sm.*
    FROM scheduled_messages sm
    WHERE sm.firm_id = p_firm_id
      AND sm.status = 'pending'
      AND sm.send_date <= CURRENT_DATE
    FOR UPDATE SKIP LOCKED
  LOOP
    -- Fetch client (for name, email, mobile)
    SELECT * INTO v_client
    FROM clients
    WHERE id = v_rec.client_id AND deleted_at IS NULL;

    IF NOT FOUND THEN
      UPDATE scheduled_messages SET status = 'failed', updated_at = now()
      WHERE id = v_rec.id;
      CONTINUE;
    END IF;

    -- Insert message log entry using pre-resolved subject and body
    INSERT INTO messages (
      firm_id, client_id, client_name, template_id,
      topic, channel, subject, body, sent_at,
      status, sent_by, to_email, to_phone
    ) VALUES (
      v_rec.firm_id, v_rec.client_id, v_client.name, v_rec.template_id,
      (SELECT topic FROM message_templates WHERE id = v_rec.template_id),
      v_rec.channel, v_rec.resolved_subject, v_rec.resolved_body, now(),
      'sent', v_rec.created_by, v_client.email, v_client.mobile
    );

    -- Mark scheduled message as sent
    UPDATE scheduled_messages SET status = 'sent', updated_at = now()
    WHERE id = v_rec.id;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION process_scheduled_messages(UUID) TO authenticated;
```

### Migration 2: `supabase/migrations/20260324100001_create_messaging_cron.sql`

```sql
-- ============================================================
-- Messaging Module: pg_cron scheduled job (optional)
-- CREATED: 2026-03-24
--
-- This migration is separated from the core tables so that failure
-- (e.g., on Supabase free tier where pg_cron is unavailable) does
-- not prevent table creation. Wrapped in DO/EXCEPTION for safety.
-- ============================================================

-- Unparameterized wrapper for cron: iterates all firms with pending messages.
-- SECURITY DEFINER bypasses RLS since cron runs as postgres, not authenticated.
-- This function is NOT granted to authenticated — only callable by cron.
CREATE OR REPLACE FUNCTION process_all_scheduled_messages()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_firm_id UUID;
  v_total INTEGER := 0;
  v_count INTEGER;
BEGIN
  FOR v_firm_id IN
    SELECT DISTINCT firm_id FROM scheduled_messages
    WHERE status = 'pending' AND send_date <= CURRENT_DATE
  LOOP
    SELECT process_scheduled_messages(v_firm_id) INTO v_count;
    v_total := v_total + v_count;
  END LOOP;
  RETURN v_total;
END;
$$;

-- NOTE: No GRANT to authenticated — only pg_cron (running as postgres) calls this.

-- Attempt to enable pg_cron and schedule the job.
-- Wrapped in DO/EXCEPTION so this migration succeeds even if pg_cron is unavailable.
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron;

  PERFORM cron.schedule(
    'process-scheduled-messages',
    '0 * * * *',  -- every hour, on the hour
    $$SELECT process_all_scheduled_messages()$$
  );
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'pg_cron not available — skipping cron job setup. Use manual "Run Now" button.';
END;
$$;
```

### Cron Job Decision: pg_cron with Two-Function Architecture

**Two SQL functions:**
1. `process_scheduled_messages(p_firm_id UUID)` — firm-scoped, `SECURITY INVOKER`, granted to `authenticated`. Called by the "Run Now" button via RPC. RLS on the `messages` INSERT policy validates the caller's firm membership.
2. `process_all_scheduled_messages()` — unparameterized, `SECURITY DEFINER`, NOT granted to `authenticated`. Called only by pg_cron. Iterates all firms with pending messages and delegates to the parameterized version.

**Why pg_cron over edge function:**
1. The operation is pure SQL (read scheduled_messages, copy pre-resolved subject/body into messages, update status) — no external API calls needed
2. pg_cron runs inside the database, avoiding cold starts and network round-trips
3. No edge function infrastructure exists in the project yet — introducing it for a simple SQL job adds unnecessary complexity
4. `FOR UPDATE SKIP LOCKED` ensures correctness under concurrent execution

**Why pre-resolved subject/body (Issue 3 fix):**
- The original design had the SQL function doing its own `{{variable}}` substitution, but only for `{{client_name}}` and `extra_vars` — missing `{{firm_name}}`, `{{staff_name}}`, `{{today}}`, etc.
- The TypeScript `fillTemplate()` substitutes ALL variables correctly.
- Storing pre-resolved `resolved_subject` and `resolved_body` at schedule time means the SQL function simply copies them into the messages table. Zero substitution logic in PL/pgSQL. The TypeScript client is the single source of truth for template rendering.

**Fallback:** If pg_cron is unavailable (Supabase free tier), the second migration's DO/EXCEPTION block catches the error gracefully. The manual "Run Now" button calls `process_scheduled_messages(firmId)` via the authenticated client and works identically.

---

## Type Changes

File: `src/types/message.ts`

### Full updated file content:

```typescript
// CREATED: 2026-03-17
// UPDATED: 2026-03-24 XX:XX IST (Jerusalem)
//          - Added is_default, deleted_at to MessageTemplate
//          - Added 'cancelled' to ScheduledMessage status
//          - Added channel to ScheduledMessage for per-send override
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
```

**Key changes from current file:**
1. `MessageTemplate.firm_id` changed from `optional` to `required` — per-firm copies always have firm_id
2. `MessageTemplate.is_default` added
3. `MessageTemplate.deleted_at` added for soft-delete
4. `ScheduledMessage.status` now includes `'cancelled'`
5. `ScheduledMessage.channel` added (was missing — per-send channel override)
6. `ScheduledMessage.resolvedSubject` and `resolvedBody` added — pre-filled at schedule time to eliminate cron/client substitution divergence
7. `ScheduledMessage.createdBy` added — preserves scheduler identity for audit trail and `sent_by` in message log
8. Four new input types added (with matching new fields in `CreateScheduledInput`)

---

## Service Layer

File: `src/services/messageService.ts`

### Method Signatures and Logic

```typescript
import { supabase } from '@/integrations/supabase/client';
import type {
  MessageTemplate, Message, ScheduledMessage, MessageChannel,
  CreateMessageTemplateInput, UpdateMessageTemplateInput,
  CreateMessageInput, CreateScheduledInput,
} from '@/types';
import type { Client } from '@/types/client';
import type { Firm } from '@/types/firm';

// --- Row mappers (DB snake_case -> TS camelCase) ---

function rowToTemplate(row: Record<string, unknown>): MessageTemplate { ... }
function rowToMessage(row: Record<string, unknown>): Message { ... }
function rowToScheduled(row: Record<string, unknown>): ScheduledMessage { ... }

// Column mapping for row->type:
// message_templates: topic_label -> topicLabel, is_default -> is_default (same)
// messages: client_name -> clientName, template_id -> templateId, sent_at -> sentAt,
//           sent_by -> sentBy, to_email -> toEmail, to_phone -> toPhone
// scheduled_messages: template_id -> templateId, send_date -> sendDate,
//                     extra_vars -> extraVars, resolved_subject -> resolvedSubject,
//                     resolved_body -> resolvedBody, created_by -> createdBy

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

export const messageService = {
  // ===== TEMPLATES =====

  async listTemplates(firmId: string): Promise<MessageTemplate[]> {
    // Query message_templates WHERE firm_id = firmId AND deleted_at IS NULL
    // ORDER BY is_default DESC, topic ASC
    // Returns array of MessageTemplate
  },

  async getTemplate(firmId: string, id: string): Promise<MessageTemplate> {
    // Single template by id + firm_id guard
  },

  async createTemplate(firmId: string, input: CreateMessageTemplateInput): Promise<MessageTemplate> {
    // Insert with firm_id, is_default = false
    // Uses templateInputToRow mapper
  },

  async updateTemplate(firmId: string, id: string, input: UpdateMessageTemplateInput): Promise<MessageTemplate> {
    // Update specific fields, map camelCase to snake_case
    // Only updates provided fields (partial update)
    // Build update object dynamically from input keys
  },

  async deleteTemplate(firmId: string, id: string): Promise<void> {
    // Soft delete: UPDATE SET deleted_at = now() WHERE id AND firm_id
  },

  async seedDefaultTemplates(firmId: string): Promise<void> {
    // Build 6 default template rows from DEFAULT_MESSAGE_TEMPLATES constant,
    // each with firm_id and is_default = true.
    // Upsert with onConflict: 'firm_id,topic' and ignoreDuplicates: true.
    // The unique partial index idx_msg_templates_default_unique ensures
    // concurrent calls produce exactly 6 defaults (no duplicates).
    // Matches documentService.ensureDefaultFolders pattern.
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
    // Base query: SELECT * FROM messages WHERE firm_id = firmId ORDER BY sent_at DESC
    // Apply optional filters via .eq() / .gte() / .lte() chaining
    // Limit to 500 rows for performance
  },

  async createMessage(firmId: string, input: CreateMessageInput): Promise<Message> {
    // Insert single message log entry with firm_id
    // Uses messageInputToRow mapper
  },

  async createBatchMessages(firmId: string, inputs: CreateMessageInput[]): Promise<Message[]> {
    // Insert multiple message log entries in a single Supabase .insert([...])
    // Maps each input via messageInputToRow, adds firm_id to each
    // Returns array of created messages
  },

  // ===== SCHEDULED MESSAGES =====

  async listScheduled(firmId: string): Promise<ScheduledMessage[]> {
    // SELECT * FROM scheduled_messages WHERE firm_id = firmId
    // ORDER BY send_date ASC, created_at ASC
  },

  async createScheduled(firmId: string, input: CreateScheduledInput): Promise<ScheduledMessage> {
    // Insert with firm_id
    // Maps: templateId -> template_id, sendDate -> send_date, extraVars -> extra_vars,
    //        resolvedSubject -> resolved_subject, resolvedBody -> resolved_body,
    //        createdBy -> created_by
    // The component pre-fills resolvedSubject and resolvedBody by calling
    // buildMsgVars() + fillTemplate() BEFORE calling this method.
  },

  async cancelScheduled(firmId: string, id: string): Promise<ScheduledMessage> {
    // UPDATE SET status = 'cancelled' WHERE id AND firm_id AND status = 'pending'
    // If no rows affected, throw error (already processed or cancelled)
  },

  async runScheduledMessages(firmId: string): Promise<number> {
    // Call the firm-scoped process_scheduled_messages(p_firm_id) via Supabase RPC:
    //   const { data, error } = await supabase.rpc('process_scheduled_messages', { p_firm_id: firmId });
    //
    // This runs through the authenticated client, so RLS on the messages
    // INSERT policy validates the caller's firm membership.
    // The function uses pre-resolved subject/body from scheduled_messages,
    // so no variable substitution happens here — just a simple copy.
    // Returns the count of messages processed.
  },

  // ===== TEMPLATE ENGINE =====

  buildMsgVars(
    client: Client,
    firmName: string,
    staffName: string,
    extra?: Record<string, string>
  ): Record<string, string> {
    // Returns a map of all available variables:
    // {
    //   client_name: client.name,
    //   staff_name: staffName,
    //   firm_name: firmName,
    //   today: new Date().toISOString().slice(0, 10),
    //   phone: client.mobile ?? '',
    //   email: client.email ?? '',
    //   period: extra?.period ?? new Date().toLocaleDateString('he-IL', { month: 'long', year: 'numeric' }),
    //   due_date: extra?.due_date ?? '',
    //   task_due: extra?.task_due ?? '',
    //   amount: extra?.amount ?? '',
    //   subject: extra?.subject ?? '',
    //   body: extra?.body ?? '',
    //   ...extra,
    // }
    //
    // NOTE: Client type has `mobile` not `phone`.
    // Legacy used both phone and mobile — we map mobile to the phone variable.
  },

  fillTemplate(template: string, vars: Record<string, string>): string {
    // Replace all {{key}} occurrences with corresponding values
    // Uses regex: /\{\{(\w+)\}\}/g
    // Replaces with vars[key] ?? '' (unknown vars become empty string)
    // Security: output is for display only (simulation), but we still
    // avoid innerHTML — React's JSX auto-escapes.
  },
};
```

### Default Templates Constant

Defined at the top of `messageService.ts` (not in `constants.ts` because the template bodies are long, messaging-specific strings that wouldn't be reused elsewhere):

```typescript
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
```

### Template Seeding — Idempotency Strategy

The `seedDefaultTemplates` method uses **upsert with `ON CONFLICT DO NOTHING`**, backed by the unique partial index `idx_msg_templates_default_unique` on `(firm_id, topic) WHERE is_default = true AND deleted_at IS NULL`.

The method:

1. Builds an array of 6 default template rows, each with `is_default: true` and the firm's `firm_id`
2. Calls `supabase.from('message_templates').upsert(rows, { onConflict: 'firm_id,topic', ignoreDuplicates: true })`
3. The unique partial index ensures that concurrent seeding from two browser tabs results in exactly 6 defaults — duplicates are silently ignored

This mirrors the document folder seeding pattern (`documentService.ensureDefaultFolders`) which uses `upsert` with `onConflict` and `ignoreDuplicates: true`.

**Note:** Custom templates created by users are NOT `is_default`, so they are unaffected by the unique partial index. A firm can freely create a custom template with the same topic as a default.

---

## Hook Layer

File: `src/hooks/useMessages.ts`

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { messageService } from '@/services/messageService';
import type {
  CreateMessageTemplateInput, UpdateMessageTemplateInput,
  CreateMessageInput, CreateScheduledInput, MessageChannel,
} from '@/types';
import { useLanguage } from '@/contexts/LanguageContext';
import { toast } from 'sonner';

// --- Query Key Factory ---
export const messageKeys = {
  all: ['messages'] as const,
  templates: () => [...messageKeys.all, 'templates'] as const,
  templateList: (firmId: string) => [...messageKeys.templates(), firmId] as const,
  lists: () => [...messageKeys.all, 'list'] as const,
  list: (firmId: string, filters?: Record<string, unknown>) =>
    [...messageKeys.lists(), firmId, filters ?? {}] as const,
  scheduled: () => [...messageKeys.all, 'scheduled'] as const,
  scheduledList: (firmId: string) => [...messageKeys.scheduled(), firmId] as const,
};

// --- Template Queries ---

export function useTemplates(firmId: string | null) {
  // useQuery: fetches messageService.listTemplates(firmId)
  // enabled: !!firmId
  //
  // SEEDING: The component (MsgTemplatesPanel or MessagingView) calls
  // useSeedTemplates() on mount when the template list is empty.
  // This is handled at the component level, not inside the query,
  // to avoid side-effects in queryFn.
}

export function useSeedTemplates() {
  // useMutation: calls messageService.seedDefaultTemplates(firmId)
  // onSuccess: invalidates messageKeys.templates()
  // No toast — seeding is invisible to the user
}

export function useCreateTemplate() {
  // useMutation: { firmId, input: CreateMessageTemplateInput }
  // calls messageService.createTemplate(firmId, input)
  // onSuccess: invalidate messageKeys.templates(), toast t('messaging.templateSaved')
  // onError: toast t('errors.saveFailed')
}

export function useUpdateTemplate() {
  // useMutation: { firmId, id, input: UpdateMessageTemplateInput }
  // calls messageService.updateTemplate(firmId, id, input)
  // onSuccess: invalidate messageKeys.templates(), toast t('messaging.templateSaved')
  // onError: toast t('errors.saveFailed')
}

export function useDeleteTemplate() {
  // useMutation: { firmId, id }
  // calls messageService.deleteTemplate(firmId, id)
  // onSuccess: invalidate messageKeys.templates(), toast success
  // onError: toast t('errors.saveFailed')
}

// --- Message Log Queries ---

export function useMessageLog(
  firmId: string | null,
  filters?: { clientId?: string; topic?: string; channel?: MessageChannel; fromDate?: string; toDate?: string }
) {
  // useQuery: fetches messageService.listMessages(firmId, filters)
  // enabled: !!firmId
  // queryKey includes filters for automatic refetch on filter change
}

export function useSendMessage() {
  // useMutation: { firmId, inputs: CreateMessageInput[] }
  // calls messageService.createBatchMessages(firmId, inputs)
  // onSuccess: invalidate messageKeys.lists(), toast t('messaging.sendSuccess')
  // onError: toast t('errors.saveFailed')
}

// --- Scheduled Message Queries ---

export function useScheduledMessages(firmId: string | null) {
  // useQuery: fetches messageService.listScheduled(firmId)
  // enabled: !!firmId
}

export function useScheduleMessage() {
  // useMutation: { firmId, input: CreateScheduledInput }
  // calls messageService.createScheduled(firmId, input)
  // onSuccess: invalidate messageKeys.scheduled(), toast t('messaging.scheduleSuccess')
  // onError: toast t('errors.saveFailed')
}

export function useCancelScheduled() {
  // useMutation: { firmId, id }
  // calls messageService.cancelScheduled(firmId, id)
  // onSuccess: invalidate messageKeys.scheduled(), toast success
  // onError: toast t('errors.saveFailed')
}

export function useRunScheduledMessages() {
  // useMutation: { firmId }
  // calls messageService.runScheduledMessages(firmId)
  // onSuccess: invalidate messageKeys.scheduled() + messageKeys.lists()
  //   toast t('messaging.runResult') with count interpolation
  // onError: toast t('errors.saveFailed')
}
```

---

## Component Design

### `MessagingView.tsx`

**Props:** None (gets firmId from store)

**State:**
- None (tab state managed by shadcn Tabs)

**Behavior:**
1. Permission check: `if (!can('messaging.view')) return <Navigate to="/dashboard" />`
2. Gets `firmId` from `useAuthStore`
3. Renders `PageHeader` with title `t('messaging.title')` and description `t('messaging.subtitle')`
4. Renders shadcn `Tabs` with 4 tabs:
   - `send` -> `MsgSendPanel`
   - `schedule` -> `MsgSchedulePanel`
   - `history` -> `MsgLogPanel`
   - `templates` -> `MsgTemplatesPanel`
5. Default tab: `send`
6. Triggers template seeding: calls `useSeedTemplates().mutate()` via `useEffect` when `useTemplates()` returns empty data and `isSuccess` is true. This ensures first-time seeding happens once transparently.

**Imports:**
```typescript
import { Navigate } from 'react-router-dom';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuthStore } from '@/stores/useAuthStore';
import { useTemplates, useSeedTemplates } from '@/hooks/useMessages';
import { PageHeader } from '@/components/shared/PageHeader';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { MsgSendPanel } from './MsgSendPanel';
import { MsgSchedulePanel } from './MsgSchedulePanel';
import { MsgLogPanel } from './MsgLogPanel';
import { MsgTemplatesPanel } from './MsgTemplatesPanel';
```

### `MsgSendPanel.tsx`

**Props:** None (gets firmId from store)

**State:**
- `selectedTemplateId: string | null` — currently selected template
- `selectedClientIds: Set<string>` — checked clients
- `channelOverride: MessageChannel | null` — per-send channel override
- `extraVars: Record<string, string>` — user-entered variable values (period, due_date, etc.)
- `searchQuery: string` — client list search filter
- `showPreview: boolean` — toggle preview section

**Behavior:**
1. Left column (60%): Template selector (Select dropdown), variable input fields (dynamically generated from template body's `{{var}}` placeholders — extract with regex), channel override dropdown (defaults to template's channel), preview section showing filled subject + body for first selected client
2. Right column (40%): Client multi-select list with search, "Select All" / "Clear All" buttons, checkbox per client, shows count badge `t('messaging.clientsSelected')`
3. Send button: disabled unless template selected AND at least 1 client selected. Permission check: `can('messaging.send')`
4. On send: for each selected client, build vars via `messageService.buildMsgVars()`, fill template, create `CreateMessageInput`. Call `useSendMessage().mutate()` with the batch. Reset state on success.

**Key logic — extracting variable placeholders:**
```typescript
function extractVars(template: MessageTemplate): string[] {
  const matches = (template.subject + template.body).matchAll(/\{\{(\w+)\}\}/g);
  const vars = new Set<string>();
  for (const m of matches) vars.add(m[1]);
  // Remove auto-filled vars (client_name, staff_name, firm_name, today, phone, email)
  const autoFilled = ['client_name', 'staff_name', 'firm_name', 'today', 'phone', 'email'];
  autoFilled.forEach(v => vars.delete(v));
  return Array.from(vars);
}
```
Only the remaining vars (period, due_date, task_due, amount, subject, body) get input fields.

### `MsgSchedulePanel.tsx`

**Props:** None

**State:**
- `selectedClientId: string | null` — single client (scheduling is per-client, not batch)
- `selectedTemplateId: string | null`
- `sendDate: string` — ISO date for scheduling
- `channelOverride: MessageChannel | null`
- `extraVars: Record<string, string>`

**Layout:**
1. Left panel (50%): Schedule form
   - Client picker (Select dropdown — single client for scheduling)
   - Template picker (Select)
   - Date picker (`<Input type="date" min={tomorrow}>`)
   - Channel override (Select)
   - Variable inputs (same extraction logic as MsgSendPanel)
   - "Schedule" button: builds vars via `buildMsgVars()`, fills template via `fillTemplate()` to produce `resolvedSubject` and `resolvedBody`, then calls `useScheduleMessage().mutate()` with all pre-resolved fields + `createdBy` from `useAuthStore.user.name`
2. Right panel (50%): Scheduled messages list
   - Uses `useScheduledMessages(firmId)` query
   - **Client name resolution:** The component calls `useClients(firmId)` (same cached query used by MsgSendPanel) and builds a `Map<clientId, clientName>` for display lookup. This avoids a DB join and reuses the already-cached client list from TanStack Query.
   - Each item shows: client name (from cached clients map), template topic (from `resolvedSubject` preview), send_date, StatusBadge, cancel button (if pending)
   - "Run Now" button at top — calls `useRunScheduledMessages().mutate()`. Only shown if there are pending messages.
   - Empty state with `EmptyState` component when no scheduled messages

### `MsgLogPanel.tsx`

**Props:** None

**State:**
- `filters: { clientId?: string; topic?: string; channel?: MessageChannel }`
- `selectedMessage: Message | null` — for detail dialog

**Behavior:**
1. Filter bar: three Select dropdowns (client, topic, channel) + date range (two date inputs). All optional, "all" as default.
2. DataTable with columns:
   - `sentAt` — formatted via `formatDateTime()`
   - `clientName`
   - `topic` — with topic label
   - `channel` — Badge with channel name
   - `status` — StatusBadge (sent/failed/pending)
   - Actions column: "View" button
3. Row click or "View" button opens Dialog showing full message detail (subject, body, metadata)
4. Uses `useMessageLog(firmId, filters)` query

**DataTable columns:**
```typescript
const columns: ColumnDef<Message, unknown>[] = [
  { accessorKey: 'sentAt', header: t('common.date'), cell: ... },
  { accessorKey: 'clientName', header: t('common.client') },
  { accessorKey: 'topic', header: t('messaging.subject') },
  { accessorKey: 'channel', header: t('messaging.channel'), cell: ... },
  { accessorKey: 'status', header: t('common.status'), cell: ... },
  { id: 'actions', header: '', cell: ... },
];
```

### `MsgTemplatesPanel.tsx`

**Props:** None

**State:**
- `editingTemplate: MessageTemplate | null` — template being edited inline
- `showCreateForm: boolean`
- `newTemplate: Partial<CreateMessageTemplateInput>` — form state for new template

**Behavior:**
1. Template list: card layout (not table — templates have long bodies). Each card shows:
   - Color dot + icon + topicLabel
   - Subject line
   - Body preview (first 100 chars)
   - Channel badge
   - "Default" badge if `is_default`
   - Edit button, Delete button (only for non-default OR allow delete for all custom)
2. Editing: clicking Edit replaces the card with an inline form (topic, topicLabel, subject, body textarea, channel select, color picker, icon picker)
3. Variable reference sheet: a small info box listing all available `{{variables}}` with descriptions. Always visible at the top or as a collapsible section.
4. Create button: opens a blank form at the top
5. Save calls `useUpdateTemplate()` or `useCreateTemplate()`
6. Delete calls `useDeleteTemplate()` with `ConfirmDialog`

### `ClientMsgButton.tsx`

**Props:**
```typescript
interface ClientMsgButtonProps {
  client: Client;
}
```

**State:**
- `open: boolean` — popover open state
- `selectedTemplateId: string | null`
- `channelOverride: MessageChannel | null`
- `extraVars: Record<string, string>`

**Behavior:**
1. Renders a small Button with MessageSquare icon + `t('messaging.quickSend')`
2. On click opens Popover with:
   - Template picker (Select)
   - Variable inputs (extracted from selected template)
   - Channel override (Select)
   - Preview (subject + body with variables filled for this specific client)
   - Send button
3. Send: builds single `CreateMessageInput` for this client, calls `useSendMessage().mutate()`
4. On success: closes popover, toast
5. Uses `useTemplates(firmId)` for template list — triggers seed if needed

---

## Data Flow Diagram

```
User Action (Send)
        │
        ▼
  Component (MsgSendPanel / ClientMsgButton)
        │  1. Extract vars from template (regex)
        │  2. Build extraVars from user inputs
        │  3. For each client:
        │     a. messageService.buildMsgVars(client, firmName, staffName, extraVars)
        │     b. messageService.fillTemplate(template.subject, vars)
        │     c. messageService.fillTemplate(template.body, vars)
        │     d. Construct CreateMessageInput with resolved text
        ▼
  Hook (useSendMessage) → Service (createBatchMessages)
        │  Supabase .insert([...]) into messages table
        ▼
  DB: messages rows created (status = 'sent')

User Action (Schedule)
        │
        ▼
  Component (MsgSchedulePanel)
        │  1. Same var extraction + filling as Send
        │  2. Pre-resolve subject + body via fillTemplate()
        │  3. Construct CreateScheduledInput with:
        │     resolvedSubject, resolvedBody, createdBy, sendDate, channel
        ▼
  Hook (useScheduleMessage) → Service (createScheduled)
        │  Supabase .insert() into scheduled_messages table
        ▼
  DB: scheduled_messages row created (status = 'pending',
      resolved_subject and resolved_body stored)

Cron / "Run Now" (processes pending scheduled messages)
        │
        ▼
  pg_cron → process_all_scheduled_messages() [SECURITY DEFINER, iterates firms]
  OR "Run Now" button → supabase.rpc('process_scheduled_messages', { p_firm_id })
        │
        ▼
  SQL function: FOR each pending row WHERE send_date <= today:
        │  Copy resolved_subject/resolved_body into new messages row
        │  sent_by = scheduled_messages.created_by
        │  Update scheduled_messages.status = 'sent'
        ▼
  DB: messages row inserted, scheduled_messages.status updated
```

### Template Seeding Flow

```
MessagingView mounts
        │
        ▼
  useTemplates(firmId) → queryFn → messageService.listTemplates(firmId)
        │
        ▼
  Returns [] (empty for new firm)
        │
        ▼
  useEffect detects empty + isSuccess
        │
        ▼
  useSeedTemplates().mutate({ firmId })
        │
        ▼
  messageService.seedDefaultTemplates(firmId)
        │  Checks count → 0 → inserts 6 defaults
        │
        ▼
  onSuccess → invalidates templateList → refetch shows 6 templates
```

---

## i18n Keys

All keys follow the `messaging.*` namespace. The requirements document provides the complete list of ~45 keys with translations. The implementer should add all keys listed in the requirements document's "i18n Keys Needed" table to all three files.

Additionally, the following keys are needed that were not in the original table:

| Key | Hebrew | Arabic | English |
|-----|--------|--------|---------|
| `messaging.templateName` | שם תבנית | اسم القالب | Template name |
| `messaging.templateBody` | תוכן התבנית | محتوى القالب | Template body |
| `messaging.templateColor` | צבע | اللون | Color |
| `messaging.templateIcon` | אייקון | الأيقونة | Icon |
| `messaging.templateDefault` | ברירת מחדל | افتراضي | Default |
| `messaging.confirmDelete` | למחוק תבנית זו? | هل تريد حذف هذا القالب؟ | Delete this template? |
| `messaging.deleteSuccess` | תבנית נמחקה | تم حذف القالب | Template deleted |
| `messaging.previewTitle` | תצוגה מקדימה | معاينة | Preview |
| `messaging.noClients` | אין לקוחות פעילים | لا يوجد عملاء نشطون | No active clients |
| `messaging.cancelSuccess` | הודעה מתוזמנת בוטלה | تم إلغاء الرسالة المجدولة | Scheduled message cancelled |
| `messaging.variableHint` | הכנס ערך עבור {{var}} | أدخل قيمة لـ {{var}} | Enter value for {{var}} |

**Status keys** (`status.sent`, `status.pending`, `status.failed`, `status.cancelled`) already exist in all three language files and should be reused via `StatusBadge`.

---

## Route Integration

In `src/App.tsx`:

**Line 81 change:**
```diff
- <Route path="messaging" element={<SectionPlaceholder section="messaging" />} />
+ <Route path="messaging" element={<MessagingView />} />
```

**Add import:**
```diff
+ import { MessagingView } from '@/components/messaging/MessagingView';
```

---

## ClientMsgButton Integration

In `src/components/clients/ClientDetailView.tsx`:

**Add import:**
```typescript
import { ClientMsgButton } from '@/components/messaging/ClientMsgButton';
```

**Add button in the action buttons div (line ~64, inside `<div className="flex flex-wrap gap-2 mb-6">`):**
```diff
  <div className="flex flex-wrap gap-2 mb-6">
+   <ClientMsgButton client={client} />
    <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
```

Place it first in the button row for visibility, since messaging is a primary action from the client detail view.

---

## Edge Cases & Error Handling

1. **Template deleted while scheduled message references it** -> The `process_scheduled_messages()` function checks `deleted_at IS NULL` on the template. If not found, it marks the scheduled message as `'failed'`. The client-side `runScheduledMessages()` does the same check.

2. **Client deleted/archived while scheduled message references them** -> Same pattern: check client exists and `deleted_at IS NULL`. Mark as `'failed'` if not found.

3. **Concurrent "Run Now" clicks** -> The pg_cron function uses `FOR UPDATE SKIP LOCKED` to prevent double-processing. The client-side version should check `status = 'pending'` in the UPDATE WHERE clause — if no rows affected, the message was already processed.

4. **Empty template body** -> Template form validation requires non-empty subject and body. The service doesn't need to validate because the DB has `NOT NULL` constraints.

5. **Batch send with 100+ clients** -> Supabase `insert([...])` handles bulk inserts efficiently. No pagination needed. The UI may show a brief loading state.

6. **Variable not in template** -> `fillTemplate` silently ignores extra vars. Missing vars in template become empty string (`vars[key] ?? ''`).

7. **Seeding race condition** -> Two browser tabs opening messaging simultaneously for a new firm. Both call `seedDefaultTemplates`. The unique partial index `idx_msg_templates_default_unique` on `(firm_id, topic) WHERE is_default = true` combined with `upsert(..., { ignoreDuplicates: true })` ensures exactly 6 defaults are created. Duplicate inserts are silently ignored by the `ON CONFLICT DO NOTHING` behavior.

8. **XSS via template variables** -> React's JSX auto-escapes all string content rendered in `{}`. Since we never use `dangerouslySetInnerHTML`, variable values cannot inject HTML/script. The `fillTemplate` function produces a plain string that React escapes on render.

---

## Performance Considerations

1. **Client list in send panel** -> `useClients(firmId)` is already cached by TanStack Query with 5-min staleTime. For firms with 1000+ clients, the checkbox list should use a scrollable container with virtual scrolling if needed. For v1, a simple scrollable div with `max-h-96 overflow-y-auto` and search filter is sufficient.

2. **Message log query** -> `idx_messages_firm_sent_at` index handles the main query pattern. The 500-row limit prevents loading unbounded data. Filters are applied server-side via Supabase query builder.

3. **Template seeding** -> Single bulk insert of 6 rows. Negligible performance impact.

4. **pg_cron job** -> Runs hourly, processes only rows WHERE `status = 'pending' AND send_date <= today`. The `idx_scheduled_msgs_pending` partial index ensures this is a fast index scan even with millions of rows.

---

## Self-Critique

### What could go wrong:
1. **pg_cron availability**: Supabase free tier does not include pg_cron. **Mitigation (resolved)**: pg_cron setup is in a separate migration (`20260324100001`) wrapped in DO/EXCEPTION. Core tables are unaffected by cron failure. Manual "Run Now" button provides full functionality.

2. **Template seeding race condition**: **Mitigation (resolved)**: Unique partial index `idx_msg_templates_default_unique` on `(firm_id, topic) WHERE is_default = true AND deleted_at IS NULL` combined with `upsert(..., { ignoreDuplicates: true })` makes concurrent seeding safe at the DB level.

3. **DB column name mismatch**: The existing `message.ts` types use camelCase (`topicLabel`, `sentAt`, `clientName`) while the DB uses snake_case (`topic_label`, `sent_at`, `client_name`). The rowToX mappers handle this, but it's a source of bugs if a new field is added without updating the mapper. **Mitigation**: The implementer should add a comment listing the column mapping in each mapper function.

4. **`process_all_scheduled_messages()` runs as SECURITY DEFINER**: This bypasses RLS, which is necessary for the cron job. **Mitigation (resolved)**: The SECURITY DEFINER function is NOT granted to `authenticated` — only pg_cron (as postgres) can call it. The firm-scoped `process_scheduled_messages(p_firm_id)` uses SECURITY INVOKER and is the only version callable by users, with RLS validating firm membership.

5. **Pre-resolved text becomes stale if template is edited after scheduling**: If a user schedules a message, then edits the template, the scheduled message still uses the old text. **Mitigation**: This is intentional and correct — the scheduled message should reflect what the user saw when they scheduled it, not a later edit. The `extra_vars` JSONB is retained for audit purposes.

### Alternatives considered:
- **Edge function for cron**: Rejected — adds infrastructure complexity for a simple SQL operation. No edge functions exist in the project yet.
- **Supabase Realtime for message updates**: Rejected — overkill for simulation-only messaging. TanStack Query invalidation is sufficient.
- **Shared template constants in `constants.ts`**: Rejected — template bodies are long Hebrew strings specific to messaging. Keeping them in `messageService.ts` maintains cohesion.

---

## Implementation Order

The recommended sequence ensures each step builds on the previous one and can be verified independently:

### Step 1: Database Migrations
- Create `supabase/migrations/20260324100000_create_messaging_tables.sql` (core tables + firm-scoped function)
- Create `supabase/migrations/20260324100001_create_messaging_cron.sql` (pg_cron wrapper, optional)
- Apply via Supabase MCP or CLI
- Verify: tables exist, RLS policies active, `process_scheduled_messages(UUID)` callable via RPC

### Step 2: Type Changes
- Update `src/types/message.ts` with all additions
- Verify: `npx tsc --noEmit` passes

### Step 3: Service Layer
- Create `src/services/messageService.ts`
- Implement all methods with row mappers
- Verify: `npx tsc --noEmit` passes

### Step 4: Hook Layer
- Create `src/hooks/useMessages.ts`
- Implement all hooks
- Verify: `npx tsc --noEmit` passes

### Step 5: MsgTemplatesPanel + Seeding
- Create `src/components/messaging/MsgTemplatesPanel.tsx`
- Implement template list, edit, create, delete
- Verify: template seeding works, CRUD operations work

### Step 6: MsgSendPanel
- Create `src/components/messaging/MsgSendPanel.tsx`
- Implement client selection, template selection, variable filling, preview, batch send
- Verify: messages appear in DB after send

### Step 7: MsgLogPanel
- Create `src/components/messaging/MsgLogPanel.tsx`
- Implement history table with filters and detail modal
- Verify: sent messages appear, filters work

### Step 8: MsgSchedulePanel
- Create `src/components/messaging/MsgSchedulePanel.tsx`
- Implement schedule form, scheduled list, cancel, "Run Now"
- Verify: scheduling creates records, "Run Now" processes them

### Step 9: MessagingView + Route
- Create `src/components/messaging/MessagingView.tsx`
- Modify `src/App.tsx` to wire route
- Add template seeding trigger
- Verify: /messaging route loads, tabs switch, seeding works

### Step 10: ClientMsgButton
- Create `src/components/messaging/ClientMsgButton.tsx`
- Modify `src/components/clients/ClientDetailView.tsx`
- Verify: button appears, popover works, sending works

### Step 11: i18n
- Add all `messaging.*` keys to `he.ts`, `ar.ts`, `en.ts`
- This can be done incrementally with each component step above, or all at once
- Verify: no hardcoded strings, all 3 languages have all keys

### Step 12: Registry + Final Verification
- Update `docs/plans/SHARED-CODE-REGISTRY.md`
- Run `npm run build` and `npx tsc --noEmit`
- Verify all success criteria from requirements document

---

## Shared Code Registry Updates

Add to `docs/plans/SHARED-CODE-REGISTRY.md`:

**Types table:**
```
| `message.ts` | `MessageTemplate`, `Message`, `ScheduledMessage`, `MessageChannel`, `CreateMessageTemplateInput`, `UpdateMessageTemplateInput`, `CreateMessageInput`, `CreateScheduledInput` | Phase 1, Messaging |
```

**Services table:**
```
| `messageService.ts` | `messageService` — template CRUD, message log, scheduled messages, template engine (buildMsgVars, fillTemplate), default template seeding | Messaging |
```

**Hooks table:**
```
| `useMessages.ts` | `messageKeys`, `useTemplates`, `useSeedTemplates`, `useCreateTemplate`, `useUpdateTemplate`, `useDeleteTemplate`, `useMessageLog`, `useSendMessage`, `useScheduledMessages`, `useScheduleMessage`, `useCancelScheduled`, `useRunScheduledMessages` | Messaging |
```
