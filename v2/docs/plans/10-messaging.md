# Messaging Module

Templates with dynamic variables, message sending, scheduling, and history log.

**Branch:** `migration/messaging-module`
**Prerequisites:** Phase 3 (Clients) merged to main

## Context

- Read legacy-app.html lines 3650-4078 for messaging system
- Read MSG_TEMPLATES (6 default templates), MSG_LOG, SCHEDULED_MSGS
- Templates use {{variable}} syntax for dynamic substitution
- Variables: {{client_name}}, {{firm_name}}, {{staff_name}}, {{period}}, {{due_date}}, {{amount}}, {{today}}, {{phone}}, {{email}}, etc.
- Channels: email, sms, whatsapp
- firm_id scoping on ALL queries
- Hebrew primary — all strings use t()
- Read `docs/plans/SHARED-CODE-REGISTRY.md` — import shared code

## Existing Shared Code

Import these, DO NOT recreate:
- Types: `import { MessageTemplate, Message, ScheduledMessage, MessageChannel } from '@/types'`
- Utils: `import { formatDate, formatDateTime } from '@/lib/dates'`
- Components: `import { PageHeader, DataTable, EmptyState, LoadingSpinner, FormField, StatusBadge, SearchInput } from '@/components/shared'`

## Features to Implement

1. **MessagingView** — 4-tab layout:
   - Tabs: Send, Schedule, History, Templates

2. **MsgTemplatesPanel** — Template management:
   - 6 default templates (VAT reminder, salary reminder, annual report, wealth declaration, tax payment, general update)
   - Each template: topic, subject, body with {{variables}}, channel, color, icon
   - Create/edit/delete custom templates
   - Variable reference sheet

3. **MsgSendPanel** — Send message:
   - Client picker (dropdown)
   - Template picker (dropdown, shows preview)
   - Variable substitution preview
   - Extra variables override (key-value pairs)
   - Channel selection (email/sms/whatsapp)
   - Send button — creates message log entry

4. **MsgSchedulePanel** — Schedule messages:
   - Same as send panel + date/time picker for send date
   - Scheduled message list: client, template, send date, status
   - Cancel scheduled message button

5. **MsgLogPanel** — History:
   - Table: date, client, template topic, channel badge, status (sent/failed), actions
   - Filter by client, channel, date range
   - Message detail modal (shows full content)

6. **ClientMsgButton** — Quick send from ClientView:
   - Button in client header
   - Opens send panel pre-filled with client

7. **Template engine** — in messageService:
   - buildMsgVars(client, firm, staff, extra) — builds variable map
   - fillTemplate(template, vars) — replaces all {{var}} with values
   - sendMessage(clientId, templateId, extraVars) — fills template + creates log
   - scheduleMessage(clientId, templateId, sendDate, extraVars)
   - runScheduledMessages() — fires pending scheduled messages

8. **Seed default templates** — Insert 6 default templates on first run

9. **Database migrations**:
   - `message_templates` (firm_id, topic, topicLabel, subject, body, channel, color, icon, is_default)
   - `messages` (firm_id, client_id, clientName, templateId, topic, channel, subject, body, sentAt, status, sentBy, toEmail, toPhone)
   - `scheduled_messages` (firm_id, client_id, templateId, sendDate, extraVars JSONB, status)
   - RLS, indexes

10. **Route** — Add /messaging route

Add i18n keys (messaging.* section) to all 3 language files.

Files to create:
- `src/components/messaging/MessagingView.tsx`
- `src/components/messaging/MsgTemplatesPanel.tsx`
- `src/components/messaging/MsgSendPanel.tsx`
- `src/components/messaging/MsgSchedulePanel.tsx`
- `src/components/messaging/MsgLogPanel.tsx`
- `src/components/messaging/ClientMsgButton.tsx`
- `src/services/messageService.ts`
- `src/hooks/useMessages.ts`
- Database migrations for `messages`, `message_templates`, `scheduled_messages` tables
