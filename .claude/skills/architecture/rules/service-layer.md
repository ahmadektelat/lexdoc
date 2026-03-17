# Service Layer Patterns

## Structure

Services are plain object exports with async methods. No classes.

```typescript
import { supabase } from '@/integrations/supabase/client';
import { X, CreateXInput, UpdateXInput } from '@/types';

export const xService = {
  async getById(id: string): Promise<X | null> { ... },
  async list(options: XListOptions): Promise<PaginatedResult<X>> { ... },
  async create(input: CreateXInput): Promise<X> { ... },
  async update(id: string, input: UpdateXInput): Promise<X> { ... },
  async delete(id: string): Promise<void> { ... },
};
```

## Supabase Client Import

Always from the shared client:
```typescript
import { supabase } from '@/integrations/supabase/client';
```

## Firm Scoping

All queries MUST include `firm_id` scoping:
```typescript
async list(firmId: string): Promise<X[]> {
  const { data, error } = await supabase
    .from('x')
    .select('*')
    .eq('firm_id', firmId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });
  if (error) throw new Error(`Failed to list: ${error.message}`);
  return data as X[];
},
```

## Soft Delete Filter

All read queries must exclude soft-deleted records:
```typescript
query = query.is('deleted_at', null);
```

Delete operations use soft delete:
```typescript
async delete(id: string): Promise<void> {
  const { error } = await supabase
    .from('x')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(`Failed to delete: ${error.message}`);
},
```

## Cursor-Based Pagination

Use keyset pagination with `(created_at, id)` compound cursor:

```typescript
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?([+-]\d{2}:\d{2}|Z)$/;

function parseCursor(cursor: string): { timestamp: string; id: string } {
  const [timestamp, id] = cursor.split('|');
  if (!ISO_RE.test(timestamp) || !UUID_RE.test(id)) {
    throw new Error('Invalid cursor format');
  }
  return { timestamp, id };
}
```

Cursor format: `"2026-01-01T00:00:00Z|uuid-here"`

## Error Handling

- Not found: check `error.code === 'PGRST116'` → return `null`
- Duplicate: check `error.code === '23505'` → throw descriptive error
- All other errors: `throw new Error('Failed to X: ${error.message}')`

## Search Sanitization

Sanitize user input before PostgREST `.ilike` filters:
```typescript
const sanitized = search.replace(/[,().\\:]/g, '').replace(/%/g, '\\%').replace(/_/g, '\\_');
query = query.or(`name.ilike.%${sanitized}%,email.ilike.%${sanitized}%`);
```

## Bulk Operations

Process in batches of 500. On batch failure, fall back to individual inserts:
```typescript
const BATCH_SIZE = 500;
for (let i = 0; i < items.length; i += BATCH_SIZE) {
  const batch = items.slice(i, i + BATCH_SIZE);
  const { data, error } = await supabase.from('x').upsert(batch, {
    onConflict: 'firm_id,tax_id',
    ignoreDuplicates: false,
  }).select();
  // If error, try individual inserts...
}
```

## Options Interface Pattern

```typescript
export interface XListOptions {
  firmId: string;
  limit?: number;
  cursor?: string;
  direction?: 'next' | 'prev';
  search?: string;
}

export interface PaginatedResult<T> {
  data: T[];
  nextCursor: string | null;
  prevCursor: string | null;
  hasMore: boolean;
}
```
