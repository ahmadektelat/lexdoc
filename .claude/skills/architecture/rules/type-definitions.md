# Type Definition Patterns

## Base Interface (mirrors DB columns)

```typescript
export interface X {
  id: string;
  firm_id: string;
  // All columns from the table
  // Use `string | null` for nullable DB columns (NOT undefined)
  name: string;
  description: string | null;
  metadata: Record<string, unknown>;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}
```

## LexDoc Core Entity Interfaces

```typescript
export interface Client {
  id: string;
  firm_id: string;
  name: string;
  type: 'company' | 'self_employed' | 'economic' | 'private';
  tax_id: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
  assigned_staff_id: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Filing {
  id: string;
  firm_id: string;
  client_id: string;
  type: 'maam' | 'mekadmot' | 'nikuyim' | 'nii';
  period_start: string;
  period_end: string;
  due_date: string;
  status: 'pending' | 'filed' | 'late';
  filed_at: string | null;
  amount: number | null;     // stored as integer agorot
  notes: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Invoice {
  id: string;
  firm_id: string;
  client_id: string;
  number: string;
  amount: number;            // integer agorot
  vat_amount: number;        // integer agorot
  total: number;             // integer agorot
  status: 'draft' | 'sent' | 'paid' | 'cancelled';
  issued_at: string;
  due_date: string;
  paid_at: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Staff {
  id: string;
  firm_id: string;
  user_id: string;
  name: string;
  email: string;
  phone: string | null;
  role: string;
  is_active: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Task {
  id: string;
  firm_id: string;
  client_id: string | null;
  filing_id: string | null;
  assigned_to: string | null;
  title: string;
  description: string | null;
  status: 'pending' | 'in_progress' | 'done';
  priority: 'low' | 'medium' | 'high';
  due_date: string | null;
  completed_at: string | null;
  auto_generated: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface BillingEntry {
  id: string;
  firm_id: string;
  client_id: string;
  type: 'monthly_fee' | 'hourly' | 'one_time';
  description: string;
  amount: number;            // integer agorot
  hours: number | null;
  date: string;
  invoice_id: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Contact {
  id: string;
  firm_id: string;
  client_id: string | null;
  name: string;
  role: string | null;
  phone: string | null;
  email: string | null;
  type: 'client' | 'tax_authority' | 'nii' | 'other';
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Interaction {
  id: string;
  firm_id: string;
  contact_id: string;
  client_id: string | null;
  type: 'call' | 'email' | 'meeting' | 'note';
  summary: string;
  date: string;
  staff_id: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Document {
  id: string;
  firm_id: string;
  client_id: string | null;
  name: string;
  category: string;
  sensitivity: 'normal' | 'confidential' | 'restricted';
  file_path: string | null;
  content: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Role {
  id: string;
  firm_id: string;
  name: string;
  permissions: Record<string, boolean>;
  is_system: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AuditEntry {
  id: string;
  firm_id: string;
  user_id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  details: Record<string, unknown>;
  ip_address: string | null;
  created_at: string;
  // NO deleted_at — audit entries are immutable
}

export interface Message {
  id: string;
  firm_id: string;
  client_id: string;
  template_id: string | null;
  channel: 'sms' | 'email' | 'whatsapp';
  content: string;
  status: 'pending' | 'sent' | 'delivered' | 'failed';
  sent_at: string | null;
  created_at: string;
}

export interface MessageTemplate {
  id: string;
  firm_id: string;
  name: string;
  channel: 'sms' | 'email' | 'whatsapp';
  content: string;
  variables: string[];
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}
```

## Extended Types (with joins)

Use `extends` for types that include related data:

```typescript
export interface ClientWithFilings extends Client {
  filings?: Filing[];
  active_tasks_count?: number;
}
```

## Input Types (only mutable fields)

Separate types for create/update — exclude `id`, timestamps, computed columns:

```typescript
export interface CreateXInput {
  firm_id: string;           // Required for creation
  name: string;
  description?: string;      // Optional fields use `?`
}

export interface UpdateXInput {
  name?: string;             // All optional for partial updates
  description?: string;
}
```

## Helper Functions

Keep helpers close to their types:

```typescript
export function getClientDisplayName(client: Client): string {
  return client.name || client.tax_id || client.id;
}
```

## Nullable Convention

- DB nullable columns → `string | null` (matches Supabase types)
- Optional input fields → `string?` (TypeScript optional)
- Never use `undefined` for DB column types

## Barrel Exports

All types re-exported from `src/types/index.ts`:

```typescript
export type {
  Client,
  ClientWithFilings,
  CreateClientInput,
  UpdateClientInput,
} from './client';
```

## Naming Convention

- Base type: `X`
- Extended: `XWithFilings`, `XWithTasks`
- Create input: `CreateXInput`
- Update input: `UpdateXInput`
- List options: `XListOptions`
- Paginated result: `PaginatedResult<T>` (generic, shared)
