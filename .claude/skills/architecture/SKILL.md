---
name: architecture
description: >
  Use when creating or modifying frontend code — services, hooks, types,
  Zustand stores, or React components. Use this for any work in services/, hooks/, types/,
  stores/, or components, including service layer CRUD, React Query hooks, type
  definitions, Zustand stores, and component structure.
---

# Architecture Patterns

> Project-specific skill for LexDoc implementation patterns.

## When to Use

Use when creating or modifying services, hooks, types, stores, or components.

## Directory Layout

```
src/services/    → Supabase CRUD services (xService objects)
src/hooks/       → React Query hooks (useX functions)
src/types/       → TypeScript interfaces (X types)
src/stores/      → Zustand stores (useXStore)
src/components/  → React components
  ├── dashboard/       # Dashboard views and widgets
  ├── clients/         # Client management
  ├── staff/           # Staff/employee management
  ├── crm/             # CRM — contacts, interactions, tasks
  ├── filings/         # Tax filing tracking
  ├── billing/         # Invoicing, billing, hours
  ├── documents/       # Document management and generation
  ├── reports/         # Reports and analytics
  ├── messaging/       # Client communication
  ├── permissions/     # RBAC permission management
  ├── audit/           # Audit log viewer
  ├── backup/          # Backup and data export
  ├── auth/            # Authentication and onboarding
  ├── shared/          # Shared/reusable business components
  ├── ui/              # shadcn/ui primitives
  └── layout/          # App shell, sidebar, navigation
```

## New Feature Checklist

1. **Types** → Define interfaces in `src/types/` — base, extended, input types
2. **Service** → Add CRUD methods in `src/services/` — Supabase queries with `firm_id` scoping
3. **Hook** → Wrap service in React Query hooks in `src/hooks/`
4. **Store** → Add Zustand store in `src/stores/` if client-side state is needed
5. **Component** → Build UI in `src/components/`

## Quick Reference Templates

### Service Pattern
```typescript
export const xService = {
  async getById(id: string): Promise<X | null> {
    const { data, error } = await supabase
      .from('x').select('*').eq('id', id).is('deleted_at', null).single();
    if (error) { if (error.code === 'PGRST116') return null; throw error; }
    return data as X;
  },
};
```

### Hook Pattern
```typescript
export const xKeys = {
  all: ['x'] as const,
  lists: () => [...xKeys.all, 'list'] as const,
  list: (firmId: string) => [...xKeys.lists(), firmId] as const,
  detail: (id: string) => [...xKeys.all, 'detail', id] as const,
};

export function useX(id: string | undefined) {
  return useQuery({
    queryKey: xKeys.detail(id!),
    queryFn: () => xService.getById(id!),
    enabled: !!id,
  });
}
```

### Store Pattern
```typescript
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface XStore {
  value: string;
  setValue: (v: string) => void;
}

export const useXStore = create<XStore>()(
  persist(
    (set) => ({
      value: 'default',
      setValue: (v) => set({ value: v }),
    }),
    { name: 'x-store' }
  )
);
```

### Type Pattern
```typescript
export interface X {
  id: string;
  firm_id: string;
  // ... DB columns, use `string | null` for nullable
  created_at: string;
  updated_at: string;
}
export interface CreateXInput {
  firm_id: string;
  // only mutable fields
}
```

### Component Pattern
```typescript
// CREATED: YYYY-MM-DD IST (Jerusalem)
import { useLanguage } from '@/contexts/LanguageContext';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

export function XComponent() {
  const { t, direction } = useLanguage();
  // ...
}
```

## Import Conventions

- Supabase client: `import { supabase } from '@/integrations/supabase/client'`
- Types: `import { X } from '@/types'`
- Services: `import { xService } from '@/services'`
- Hooks: `import { useX } from '@/hooks/useX'`
- Stores: `import { useXStore } from '@/stores/useXStore'`
- UI: `import { Button } from '@/components/ui/button'`
- Icons: `import { X, Upload } from 'lucide-react'`
- Toast: `import { toast } from 'sonner'`

## Theme System

Three themes via CSS custom properties — never hardcode a single theme's palette:
- **Sky**: Light mode — slate/blue gradients
- **Dark**: Dark mode — zinc palette
- **Blue**: Medium mode — blue/indigo palette

Access colors via CSS variables: `var(--bg)`, `var(--text)`, `var(--accent)`, etc.
Portal overrides (Select, Dialog): use `!important` on styles.
**Mobile-first**: Design responsive layouts.

## Key Rules

- `firm_id` scoping on all queries — one firm never sees another's data
- Soft delete: `.is('deleted_at', null)` on all queries
- Barrel exports in `src/types/index.ts` and `src/services/index.ts`
- All timestamps in file headers use Jerusalem time (IST)

## Detailed Rules

For full examples and patterns, read:
- `rules/service-layer.md` — Complete service patterns with pagination
- `rules/react-query-hooks.md` — Query keys, infinite scroll, mutations
- `rules/type-definitions.md` — Interface conventions and helpers
- `rules/component-patterns.md` — Component structure, UI, theming
- `rules/zustand-stores.md` — Client-side state management patterns
