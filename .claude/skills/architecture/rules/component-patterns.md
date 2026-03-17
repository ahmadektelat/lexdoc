# Component Patterns

## File Header

Every component file must start with a timestamp header:

```typescript
// CREATED: YYYY-MM-DD IST (Jerusalem)
// UPDATED: YYYY-MM-DD HH:MM IST (Jerusalem)
//          - Brief description of what changed
// ComponentName - Brief description of component purpose
```

## Imports Order

1. React imports
2. Context imports (`useLanguage`)
3. UI component imports (shadcn)
4. Type imports
5. Utility imports
6. Hook imports
7. Store imports
8. Child component imports

```typescript
import { useState, useCallback } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Client } from '@/types';
import { toast } from 'sonner';
import { Plus, Trash2 } from 'lucide-react';
import { useClients } from '@/hooks/useClients';
import { useAppStore } from '@/stores/useAppStore';
import { ChildComponent } from './ChildComponent';
```

## Language & Direction

Always use `useLanguage` for translations and RTL:

```typescript
export function XComponent() {
  const { t, direction } = useLanguage();

  return (
    <div dir={direction}>
      <h1>{t('section.title')}</h1>
    </div>
  );
}
```

## Firm Context

Get current firm from the context:

```typescript
import { useAuthStore } from '@/stores/useAuthStore';

const { firmId, user, hasRole } = useAuthStore();
```

## shadcn UI Components

Import from `@/components/ui/*`:

```typescript
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
```

## Theme System — 3 Themes via CSS Variables

This app supports 3 themes (sky/dark/blue). Use CSS custom properties, not hardcoded colors:

```typescript
// Use theme-aware classes via CSS variables
<div className="bg-[var(--bg)] text-[var(--text)] border-[var(--border)]">
  <span className="text-[var(--muted)]">Secondary text</span>
  <Button className="bg-[var(--accent)] hover:bg-[var(--accent-hover)]">
    Action
  </Button>
</div>
```

Theme palettes:
- **Sky**: `--bg: slate-50`, `--text: slate-900`, `--accent: blue-600` (light mode)
- **Dark**: `--bg: zinc-950`, `--text: zinc-50`, `--accent: emerald-500` (dark mode)
- **Blue**: `--bg: blue-950`, `--text: blue-50`, `--accent: indigo-400` (medium mode)

## Portal Overrides

shadcn portals (Select, Dialog, DropdownMenu) render outside the app root.
Use `!important` for theme and RTL overrides:

```css
[data-radix-popper-content-wrapper] {
  direction: rtl !important;
}
```

## Toast Notifications

Use Sonner for toasts:

```typescript
import { toast } from 'sonner';

toast.success(t('section.successMessage'));
toast.error(t('section.errorMessage'));
```

## Icons

Use Lucide React for icons:

```typescript
import { Plus, Upload, ChevronRight, Trash2, X } from 'lucide-react';

<Button variant="ghost" size="icon">
  <X className="h-4 w-4" />
</Button>
```

## Props Interface

Define props interface above the component:

```typescript
interface XComponentProps {
  isOpen: boolean;
  onClose: () => void;
  firmId: string;
}

export function XComponent({ isOpen, onClose, firmId }: XComponentProps) {
  // ...
}
```

## Responsive Design

Design mobile-first. Many users access from phones:

```typescript
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
  {/* Cards */}
</div>
```
