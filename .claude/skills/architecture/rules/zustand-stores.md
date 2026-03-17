# Zustand Store Patterns

## When to Use Zustand

Use Zustand for **client-side state** that doesn't come from the database:
- UI state (sidebar open/closed, active tab, navigation)
- Auth state (current user, firm, session)
- Theme preference (with localStorage persistence)
- Temporary form state shared across components

Use **React Query** for server state (database data). Don't duplicate server data in Zustand.

## Store File Convention

Store files live in `src/stores/` with the naming pattern `useXStore.ts`:

```
src/stores/
├── useAppStore.ts      # UI state: sidebar, navigation
├── useAuthStore.ts     # Current user, firm, session
└── useThemeStore.ts    # Active theme with persistence
```

## Base Store Pattern

```typescript
// CREATED: YYYY-MM-DD IST (Jerusalem)
import { create } from 'zustand';

interface AppStore {
  sidebarOpen: boolean;
  activeSection: string;
  toggleSidebar: () => void;
  setActiveSection: (section: string) => void;
}

export const useAppStore = create<AppStore>()((set) => ({
  sidebarOpen: true,
  activeSection: 'dashboard',
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  setActiveSection: (section) => set({ activeSection: section }),
}));
```

## Persisted Store Pattern

Use `persist` middleware for state that should survive page reloads:

```typescript
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type Theme = 'sky' | 'dark' | 'blue';

interface ThemeStore {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

export const useThemeStore = create<ThemeStore>()(
  persist(
    (set) => ({
      theme: 'sky',
      setTheme: (theme) => set({ theme }),
    }),
    { name: 'lexdoc-theme' }
  )
);
```

## Auth Store Pattern

```typescript
import { create } from 'zustand';

interface AuthStore {
  user: User | null;
  firmId: string | null;
  firmName: string | null;
  role: string | null;
  setUser: (user: User | null) => void;
  setFirm: (firmId: string, firmName: string) => void;
  setRole: (role: string) => void;
  hasRole: (requiredRole: string) => boolean;
  can: (permission: string) => boolean;
  logout: () => void;
}

export const useAuthStore = create<AuthStore>()((set, get) => ({
  user: null,
  firmId: null,
  firmName: null,
  role: null,
  setUser: (user) => set({ user }),
  setFirm: (firmId, firmName) => set({ firmId, firmName }),
  setRole: (role) => set({ role }),
  hasRole: (requiredRole) => {
    const { role } = get();
    const hierarchy = ['external', 'staff', 'manager', 'superAdmin'];
    return hierarchy.indexOf(role ?? '') >= hierarchy.indexOf(requiredRole);
  },
  can: (permission) => {
    // Check against role's permission set
    // Implementation depends on role permissions loaded from DB
    return false;
  },
  logout: () => set({ user: null, firmId: null, firmName: null, role: null }),
}));
```

## Rules

- One store per concern — don't put everything in a single store
- Minimal state — only store what can't be derived
- Actions alongside state — define setters in the same store
- TypeScript interfaces — always define the store interface
- Persist sparingly — only for user preferences, not transient UI state
