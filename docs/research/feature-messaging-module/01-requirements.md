# Messaging Module — Requirements Document

**Date:** 2026-03-23
**Branch:** `migration/messaging-module`
**Prerequisites:** Phase 3 (Clients) merged to main
**Legacy reference:** `legacy-app.html` lines 3650-4168

---

## Task Summary

Build a messaging module with template management, multi-client batch sending, scheduling with automatic cron execution, and a message history log. Messages are simulation-only (log to DB, no real delivery). Each firm gets 6 default templates auto-seeded on first use.

---

## User Decisions

1. **Client selection in send panel** — **Multi-select with checkboxes**, matching legacy behavior. Supports "select all" / "clear all" for batch-sending to multiple clients at once.
2. **Message delivery** — **Log-only / simulation**. Messages are recorded in the database with status "sent" but no actual email/SMS/WhatsApp delivery occurs. Real integrations are a separate future phase.
3. **Default template seeding** — **Per-firm seeding**. When a firm first opens the messaging module, auto-create 6 default template copies scoped to that firm. Firms can freely edit/customize their copies.
4. **Channel selection** — **Per-send override**. Templates have a default channel (email/sms/whatsapp), but the user can override it at send time via a channel dropdown in the send panel.
5. **Scheduled message execution** — **Automatic via cron**. A Supabase pg_cron job or scheduled edge function checks every hour and processes due messages. A manual "Run Now" button also exists as an override. Add `'cancelled'` to the `ScheduledMessage` status type.

---

## Chosen Approach

**Full-featured messaging module with simulation delivery and cron scheduling.** This builds the complete UI and data layer matching legacy behavior while deferring real delivery integrations. The cron job handles scheduled messages automatically, and the per-firm template seeding gives each firm ownership of their templates.

---

## Scope

**In scope:**
- 4-tab messaging view (Send, Schedule, History, Templates)
- Multi-client batch send with checkbox selection
- Template management (view, edit, create, delete custom templates)
- Template variable substitution engine (`{{variable}}` syntax)
- Per-send channel override (email/sms/whatsapp)
- Message scheduling with date/time picker
- Automatic scheduled message processing via cron (pg_cron or edge function)
- Manual "Run Now" button for scheduled messages
- Cancel scheduled messages
- Message history log with filters (client, channel, topic, date range)
- Message detail modal
- Per-firm default template seeding (6 templates)
- Variable reference sheet in template editor
- ClientMsgButton — quick-send from client detail view
- Preview before sending (variable substitution preview)
- Permission checks (`messaging.view`, `messaging.send`)
- i18n keys for all 3 languages (he, ar, en)
- Database migrations with RLS

**Out of scope:**
- Real email/SMS/WhatsApp delivery (future phase)
- Delivery status webhooks / read receipts
- Attachment support
- Template versioning / audit trail
- Bulk template import/export
- Client preferred channel stored in client profile

---

## Affected Files

### Existing files to modify
- `src/App.tsx` — Replace `SectionPlaceholder` for `/messaging` route with `MessagingView`
- `src/types/message.ts` — Add `'cancelled'` to `ScheduledMessage` status union; add `is_default` field to `MessageTemplate`; add `CreateMessageTemplateInput` and `CreateMessageInput` types
- `src/types/index.ts` — Already exports `message.ts`, no changes needed
- `src/i18n/he.ts` — Add `messaging.*` keys (~40-50 keys)
- `src/i18n/ar.ts` — Add `messaging.*` keys (~40-50 keys)
- `src/i18n/en.ts` — Add `messaging.*` keys (~40-50 keys)
- `docs/plans/SHARED-CODE-REGISTRY.md` — Register new service, hooks, components

### Client detail integration
- `src/components/clients/ClientDetailView.tsx` (or equivalent) — Add `ClientMsgButton` to client header

---

## New Files Needed

### Components (`src/components/messaging/`)
- `MessagingView.tsx` — Main view with 4-tab layout (Send, Schedule, History, Templates). Uses `PageHeader`, tab buttons, permission check via `useAuthStore.can('messaging.view')`.
- `MsgSendPanel.tsx` — Multi-select client list with checkboxes, template picker, variable input fields, per-send channel override dropdown, preview button, send button. Uses `useClients` for client list, `useTemplates` for template list.
- `MsgSchedulePanel.tsx` — Same as send panel + date/time picker for scheduled send date. Left panel: schedule form. Right panel: scheduled message list with cancel button and "Run Now" button.
- `MsgLogPanel.tsx` — Message history table using `DataTable`. Filters: client dropdown, topic dropdown, channel dropdown, date range. Message detail modal on row click or "view" button.
- `MsgTemplatesPanel.tsx` — Template list with inline edit. Variable reference sheet. Create/delete custom templates. Default templates are editable (per-firm copies).
- `ClientMsgButton.tsx` — Small button for client detail header. Opens popover/dropdown with template picker, variable inputs, and send button pre-filled with client.

### Service (`src/services/`)
- `messageService.ts` — Supabase CRUD service object:
  - `listTemplates(firmId)` — list firm's templates
  - `getTemplate(firmId, id)` — get single template
  - `createTemplate(firmId, input)` — create custom template
  - `updateTemplate(firmId, id, input)` — update template
  - `deleteTemplate(firmId, id)` — soft-delete template
  - `seedDefaultTemplates(firmId)` — create 6 default templates for firm (idempotent check)
  - `listMessages(firmId, filters?)` — list message log with optional filters
  - `createMessage(firmId, input)` — log a sent message
  - `listScheduled(firmId)` — list scheduled messages
  - `createScheduled(firmId, input)` — create scheduled message
  - `cancelScheduled(firmId, id)` — set status to 'cancelled'
  - `runScheduledMessages(firmId)` — process pending messages whose sendDate <= now
  - `buildMsgVars(client, firm, staffName, extra)` — build variable substitution map
  - `fillTemplate(template, vars)` — replace `{{var}}` placeholders with values

### Hooks (`src/hooks/`)
- `useMessages.ts` — TanStack Query hooks:
  - `messageKeys` — query key factory
  - `useTemplates(firmId)` — list templates (triggers seed if empty)
  - `useCreateTemplate()` — mutation
  - `useUpdateTemplate()` — mutation
  - `useDeleteTemplate()` — mutation
  - `useMessages(firmId, filters?)` — list message log
  - `useSendMessage()` — mutation (creates message log entry)
  - `useScheduledMessages(firmId)` — list scheduled
  - `useScheduleMessage()` — mutation
  - `useCancelScheduled()` — mutation
  - `useRunScheduledMessages()` — mutation

---

## Database Changes

### Table: `message_templates`
```sql
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

GRANT SELECT, INSERT, UPDATE, DELETE ON message_templates TO authenticated;
```

### Table: `messages`
```sql
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
-- Messages are immutable (no update/delete)
CREATE POLICY "messages_update" ON messages FOR UPDATE
  USING (false);
CREATE POLICY "messages_delete" ON messages FOR DELETE
  USING (false);

GRANT SELECT, INSERT ON messages TO authenticated;
```

### Table: `scheduled_messages`
```sql
CREATE TABLE scheduled_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id UUID NOT NULL REFERENCES firms(id),
  client_id UUID NOT NULL REFERENCES clients(id),
  template_id UUID NOT NULL REFERENCES message_templates(id),
  send_date DATE NOT NULL,
  channel TEXT NOT NULL DEFAULT 'email' CHECK (channel IN ('email', 'sms', 'whatsapp')),
  extra_vars JSONB DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'cancelled')),
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

GRANT SELECT, INSERT, UPDATE, DELETE ON scheduled_messages TO authenticated;
```

### Cron job (pg_cron or edge function)
- Schedule: every hour (or every 15 minutes)
- Logic: SELECT pending scheduled_messages WHERE send_date <= CURRENT_DATE AND status = 'pending', process each by inserting into messages table, update status to 'sent'
- Option A: pg_cron SQL function that runs directly in the database
- Option B: Supabase scheduled edge function that calls the service endpoint
- The architect should decide which approach fits the infrastructure best

---

## Type Changes

### `src/types/message.ts` — Updates needed

1. Add `'cancelled'` to `ScheduledMessage.status`:
   ```typescript
   status: 'pending' | 'sent' | 'failed' | 'cancelled';
   ```

2. Add `is_default` to `MessageTemplate`:
   ```typescript
   is_default: boolean;
   ```

3. Add input types:
   ```typescript
   export type CreateMessageTemplateInput = Omit<MessageTemplate, 'id' | 'firm_id' | 'created_at' | 'updated_at'>;
   export type UpdateMessageTemplateInput = Partial<Omit<MessageTemplate, 'id' | 'firm_id' | 'created_at' | 'updated_at'>>;
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
     sendDate: string;
     channel: MessageChannel;
     extraVars?: Record<string, string>;
   }
   ```

---

## Existing Code to Reuse

### Types (already exist in `src/types/message.ts`)
```typescript
import { MessageTemplate, Message, ScheduledMessage, MessageChannel } from '@/types';
```

### Shared components
```typescript
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable } from '@/components/shared/DataTable';
import { EmptyState } from '@/components/shared/EmptyState';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { FormField } from '@/components/shared/FormField';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { SearchInput } from '@/components/shared/SearchInput';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
```

### Utilities
```typescript
import { formatDate, formatDateTime } from '@/lib/dates';
import { cn } from '@/lib/utils';
import { validateEmail, validatePhone } from '@/lib/validation';
```

### Hooks and stores
```typescript
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuthStore } from '@/stores/useAuthStore';
import { useClients } from '@/hooks/useClients'; // for client picker
```

### UI components
```typescript
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
```

---

## Patterns to Follow

### Service pattern (from `billingService.ts`)
- Export a const object with async methods
- Use `rowToX` mapper function for DB rows to TypeScript types
- Use `xInputToRow` mapper for input types to DB rows
- Supabase client imported from `@/integrations/supabase/client`
- Error handling: `if (error) throw new Error(error.message)`

### Hook pattern (from `useBilling.ts`)
- Export `xKeys` query key factory object
- `useQuery` for reads, `useMutation` for writes
- Mutations invalidate relevant query keys on success
- Toast on success/error using `toast` from sonner + `t()` for messages
- `enabled: !!firmId` guard on queries

### Component pattern (from `BillingView.tsx`)
- Permission check: `if (!can('messaging.view')) return <Navigate to="/dashboard" />`
- Get `firmId` from `useAuthStore`
- Use `useLanguage()` for `t()` function
- `DataTable` with `ColumnDef` array for tabular data
- `PageHeader` for page title and action buttons

### Migration pattern (from `20260320100000_create_billing_tables.sql`)
- UUID primary keys with `gen_random_uuid()`
- `firm_id UUID NOT NULL REFERENCES firms(id)` on all tables
- RLS with `user_firm_ids()` and `firm_subscription_active(firm_id)`
- `deleted_at TIMESTAMPTZ DEFAULT NULL` for soft delete (on templates only; messages are immutable)
- `updated_at` trigger using `update_updated_at()`
- GRANT statements for `authenticated` role
- Indexes on `firm_id` and common query patterns

---

## i18n Keys Needed

Section: `messaging.*` (~40-50 keys). Key examples:

| Key | Hebrew | Arabic | English |
|-----|--------|--------|---------|
| `messaging.title` | תקשורת עם לקוחות | التواصل مع العملاء | Client Messaging |
| `messaging.subtitle` | שליחת הודעות, תיזמון וניהול תבניות | إرسال الرسائل والجدولة وإدارة القوالب | Send messages, schedule, and manage templates |
| `messaging.tabSend` | שליחה | إرسال | Send |
| `messaging.tabSchedule` | תיזמון | جدولة | Schedule |
| `messaging.tabHistory` | יומן | السجل | History |
| `messaging.tabTemplates` | תבניות | القوالب | Templates |
| `messaging.selectTemplate` | בחר תבנית הודעה | اختر قالب رسالة | Select message template |
| `messaging.selectClients` | בחר לקוחות | اختر العملاء | Select clients |
| `messaging.selectAll` | הכל | تحديد الكل | Select all |
| `messaging.clearAll` | נקה | مسح الكل | Clear all |
| `messaging.preview` | תצוגה מקדימה | معاينة | Preview |
| `messaging.send` | שלח | إرسال | Send |
| `messaging.sendCount` | שלח {{count}} הודעות | إرسال {{count}} رسائل | Send {{count}} messages |
| `messaging.sendSuccess` | הודעות נשלחו בהצלחה | تم إرسال الرسائل بنجاح | Messages sent successfully |
| `messaging.period` | תקופה | الفترة | Period |
| `messaging.dueDate` | מועד הגשה | تاريخ الاستحقاق | Due date |
| `messaging.taskDue` | העבר חומר עד | الموعد النهائي للتسليم | Material due by |
| `messaging.subject` | נושא | الموضوع | Subject |
| `messaging.body` | תוכן ההודעה | محتوى الرسالة | Message body |
| `messaging.channel` | ערוץ שליחה | قناة الإرسال | Channel |
| `messaging.channelEmail` | מייל | بريد إلكتروني | Email |
| `messaging.channelSms` | SMS | رسالة نصية | SMS |
| `messaging.channelWhatsapp` | WhatsApp | واتساب | WhatsApp |
| `messaging.scheduleDate` | תאריך שליחה | تاريخ الإرسال | Send date |
| `messaging.scheduleAdd` | תזמן הודעה | جدولة رسالة | Schedule message |
| `messaging.scheduleSuccess` | הודעה תוזמנה בהצלחה | تمت جدولة الرسالة بنجاح | Message scheduled successfully |
| `messaging.schedulePending` | ממתינות | قيد الانتظار | Pending |
| `messaging.runNow` | הפעל הודעות ממתינות | تشغيل الرسائل المعلقة | Run pending messages |
| `messaging.runResult` | {{count}} הודעות נשלחו | تم إرسال {{count}} رسائل | {{count}} messages sent |
| `messaging.cancelScheduled` | בטל | إلغاء | Cancel |
| `messaging.noScheduled` | אין הודעות מתוזמנות | لا توجد رسائل مجدولة | No scheduled messages |
| `messaging.noMessages` | אין הודעות ביומן | لا توجد رسائل في السجل | No messages in log |
| `messaging.filterClient` | כל הלקוחות | جميع العملاء | All clients |
| `messaging.filterTopic` | כל הנושאים | جميع المواضيع | All topics |
| `messaging.templateEdit` | ערוך | تعديل | Edit |
| `messaging.templateSave` | שמור תבנית | حفظ القالب | Save template |
| `messaging.templateSaved` | תבנית עודכנה | تم تحديث القالب | Template updated |
| `messaging.templateCreate` | תבנית חדשה | قالب جديد | New template |
| `messaging.templateDelete` | מחק תבנית | حذف القالب | Delete template |
| `messaging.templateVarsHint` | משתנים זמינים | المتغيرات المتاحة | Available variables |
| `messaging.noEmail` | אין מייל | لا يوجد بريد إلكتروني | No email |
| `messaging.clientsSelected` | {{count}} לקוחות נבחרו | {{count}} عملاء محددين | {{count}} clients selected |
| `messaging.viewDetail` | צפה | عرض | View |
| `messaging.quickSend` | שלח הודעה | إرسال رسالة | Send message |
| `messaging.statusSent` | נשלח | تم الإرسال | Sent |
| `messaging.statusFailed` | נכשל | فشل | Failed |
| `messaging.statusPending` | ממתין | قيد الانتظار | Pending |
| `messaging.statusCancelled` | בוטל | ملغى | Cancelled |

---

## Component Hierarchy

```
MessagingView
├── PageHeader (shared)
├── Tabs (shadcn)
│   ├── MsgSendPanel
│   │   ├── Template picker (Select)
│   │   ├── Variable input fields (FormField)
│   │   ├── Channel override (Select)
│   │   ├── Client multi-select list (Checkbox list with search/filter)
│   │   ├── Preview section
│   │   └── Send button
│   ├── MsgSchedulePanel
│   │   ├── Schedule form (left)
│   │   │   ├── Client picker (Select)
│   │   │   ├── Template picker (Select)
│   │   │   ├── Date picker (Input type=date)
│   │   │   ├── Channel override (Select)
│   │   │   ├── Variable inputs (FormField)
│   │   │   └── Schedule button
│   │   └── Scheduled list (right)
│   │       ├── StatusBadge per item
│   │       ├── Cancel button per pending item
│   │       └── "Run Now" button
│   ├── MsgLogPanel
│   │   ├── Filter bar (client, topic, channel dropdowns)
│   │   ├── DataTable (message history)
│   │   └── Message detail Dialog
│   └── MsgTemplatesPanel
│       ├── Template list with inline edit
│       ├── Variable reference sheet
│       └── Create new template button

ClientMsgButton (standalone, used in ClientDetailView)
├── Popover trigger button
└── PopoverContent
    ├── Template picker
    ├── Variable inputs
    ├── Channel picker
    └── Send button
```

---

## Default Templates (6 seeds per firm)

| topic | topicLabel (he) | subject | channel | color | icon |
|-------|-----------------|---------|---------|-------|------|
| `vat` | מע"מ | בקשה להעברת חומר לדוח מע"מ — {{period}} | email | `#f59e0b` | receipt |
| `salary` | משכורות | בקשה להעברת חומר למשכורות — {{period}} | email | `#10b981` | banknote |
| `annual` | דוחות כספיים | הכנת דוחות כספיים שנתיים — {{period}} | email | `#3b82f6` | bar-chart |
| `wealth` | הצהרת הון | הכנת הצהרת הון — {{period}} | email | `#8b5cf6` | landmark |
| `taxAdv` | מקדמות מס | עדכון תשלום מקדמת מס הכנסה — {{period}} | email | `#ef4444` | calendar |
| `general` | עדכון כללי | {{subject}} | email | `#64748b` | megaphone |

Template bodies: use the full Hebrew text from legacy `MSG_TEMPLATES` array (lines 3652-3712 of `legacy-app.html`).

Available variables: `{{client_name}}`, `{{staff_name}}`, `{{firm_name}}`, `{{period}}`, `{{due_date}}`, `{{task_due}}`, `{{amount}}`, `{{today}}`, `{{phone}}`, `{{email}}`, `{{subject}}`, `{{body}}`.

---

## Success Criteria

- [ ] MessagingView renders with 4 tabs (Send, Schedule, History, Templates)
- [ ] Send panel supports multi-select clients with checkboxes, select all, clear all
- [ ] Template picker shows all firm templates with preview
- [ ] Variable substitution works correctly (all `{{var}}` replaced)
- [ ] Channel override dropdown appears in send panel, defaults to template's channel
- [ ] Sending creates message log entries in DB (one per client in batch)
- [ ] Schedule panel creates scheduled messages with future send date
- [ ] Scheduled messages list shows with correct status badges
- [ ] Cancel button sets scheduled message status to 'cancelled'
- [ ] "Run Now" button processes pending scheduled messages
- [ ] Cron job (pg_cron or edge function) processes pending scheduled messages automatically
- [ ] History tab shows message log with filters (client, topic, channel)
- [ ] Message detail modal shows full content
- [ ] Templates panel allows edit, create, delete of templates
- [ ] Default templates are seeded on first access per firm (6 templates)
- [ ] ClientMsgButton works from client detail view
- [ ] Permission checks: `messaging.view` and `messaging.send` enforced
- [ ] All UI text uses `t()` with keys in all 3 language files
- [ ] RTL layout correct for Hebrew/Arabic
- [ ] Database tables have proper RLS policies
- [ ] `ScheduledMessage` type includes `'cancelled'` status
- [ ] `npm run build` passes
- [ ] `npx tsc --noEmit` passes
