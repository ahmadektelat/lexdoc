// CREATED: 2026-03-17 IST (Jerusalem)
// useAuthStore - Auth state: current user, firm, session
import { create } from 'zustand';

interface User {
  id: string;
  email: string;
  name: string;
}

interface AuthStore {
  user: User | null;
  firmId: string | null;
  firmName: string | null;
  role: string | null;
  permissions: Record<string, boolean>;
  isLoading: boolean;
  setUser: (user: User | null) => void;
  setFirm: (firmId: string, firmName: string) => void;
  setRole: (role: string) => void;
  setPermissions: (permissions: Record<string, boolean>) => void;
  setLoading: (loading: boolean) => void;
  hasRole: (requiredRole: string) => boolean;
  can: (permission: string) => boolean;
  logout: () => void;
}

const ROLE_HIERARCHY: Record<string, number> = {
  external: 1,
  staff: 2,
  manager: 3,
  superAdmin: 4,
};

export const useAuthStore = create<AuthStore>()((set, get) => ({
  user: null,
  firmId: null,
  firmName: null,
  role: null,
  permissions: {},
  isLoading: true,
  setUser: (user) => set({ user }),
  setFirm: (firmId, firmName) => set({ firmId, firmName }),
  setRole: (role) => set({ role }),
  setPermissions: (permissions) => set({ permissions }),
  setLoading: (isLoading) => set({ isLoading }),
  hasRole: (requiredRole) => {
    const { role } = get();
    return (ROLE_HIERARCHY[role ?? ''] ?? 0) >= (ROLE_HIERARCHY[requiredRole] ?? 0);
  },
  can: (permission) => {
    const { role, permissions } = get();
    if (role === 'superAdmin') return true;
    return permissions[permission] === true;
  },
  logout: () =>
    set({
      user: null,
      firmId: null,
      firmName: null,
      role: null,
      permissions: {},
    }),
}));
