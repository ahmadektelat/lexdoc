// CREATED: 2026-03-17 IST (Jerusalem)
// UPDATED: 2026-03-17 16:00 IST (Jerusalem)
//          - Added plan, expiry, firmData fields for subscription checks
//          - Added setFirmData, setPlan, isSubscriptionExpired methods
// useAuthStore - Auth state: current user, firm, session, subscription
import { create } from 'zustand';
import type { User } from '@/types/user';
import type { Firm } from '@/types/firm';

interface AuthStore {
  user: User | null;
  firmId: string | null;
  firmName: string | null;
  role: string | null;
  permissions: Record<string, boolean>;
  isLoading: boolean;
  plan: string | null;
  expiry: string | null;
  firmData: Firm | null;
  setUser: (user: User | null) => void;
  setFirm: (firmId: string, firmName: string) => void;
  setRole: (role: string) => void;
  setPermissions: (permissions: Record<string, boolean>) => void;
  setLoading: (loading: boolean) => void;
  setPlan: (plan: string, expiry: string) => void;
  setFirmData: (firm: Firm, role: string) => void;
  isSubscriptionExpired: () => boolean;
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
  plan: null,
  expiry: null,
  firmData: null,
  setUser: (user) => set({ user }),
  setFirm: (firmId, firmName) => set({ firmId, firmName }),
  setRole: (role) => set({ role }),
  setPermissions: (permissions) => set({ permissions }),
  setLoading: (isLoading) => set({ isLoading }),
  setPlan: (plan, expiry) => set({ plan, expiry }),
  setFirmData: (firm, role) =>
    set({
      firmId: firm.id,
      firmName: firm.name,
      plan: firm.plan,
      expiry: firm.expiry,
      firmData: firm,
      role,
    }),
  isSubscriptionExpired: () => {
    const { expiry } = get();
    if (!expiry) return false;
    return new Date(expiry) < new Date();
  },
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
      plan: null,
      expiry: null,
      firmData: null,
    }),
}));
