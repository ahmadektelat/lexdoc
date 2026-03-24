// CREATED: 2026-03-17 16:00 IST (Jerusalem)
// UPDATED: 2026-03-19 10:00 IST (Jerusalem)
//          - Added permission loading after firm data fetch
// useAuth - React hook managing auth lifecycle: initialization, session persistence

import { useEffect } from 'react';
import { authService } from '@/services/authService';
import { firmService } from '@/services/firmService';
import { roleService } from '@/services/roleService';
import { useAuthStore } from '@/stores/useAuthStore';

export function useAuth() {
  const store = useAuthStore();

  useEffect(() => {
    let cancelled = false;

    // Load session data — called on mount and on SIGNED_IN events.
    // Extracted so it works even if INITIAL_SESSION is missed (React StrictMode).
    async function loadSession() {
      useAuthStore.getState().setLoading(true);
      try {
        const session = await authService.getSession();
        if (cancelled) return;
        if (session?.user) {
          const result = await firmService.getFirmByUserId(session.user.id);
          if (cancelled) return;
          if (result) {
            useAuthStore.getState().setUser({
              id: session.user.id,
              email: session.user.email!,
              name: session.user.email!,
            });
            useAuthStore.getState().setFirmData(result.firm, result.role);

            try {
              const permissions = await roleService.getPermissionsForUser(
                result.firm.id
              );
              if (cancelled) return;
              const permissionsRecord: Record<string, boolean> = {};
              for (const p of permissions) {
                permissionsRecord[p] = true;
              }
              useAuthStore.getState().setPermissions(permissionsRecord);
            } catch {
              // Permission loading failure = default deny (empty permissions).
            }
          } else {
            // Orphaned user: auth session exists but no firm record.
            useAuthStore.getState().setUser({
              id: session.user.id,
              email: session.user.email!,
              name: session.user.email!,
            });
          }
        } else {
          useAuthStore.getState().logout();
        }
      } finally {
        if (!cancelled) {
          useAuthStore.getState().setLoading(false);
        }
      }
    }

    // Load on mount — handles existing session from localStorage.
    loadSession();

    // Listen for auth changes (sign in, sign out).
    const { data: { subscription } } = authService.onAuthStateChange(
      (event) => {
        if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') {
          loadSession();
        }
      }
    );

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  return {
    isAuthenticated: !!store.user,
    isLoading: store.isLoading,
    user: store.user,
    firmData: store.firmData,
  };
}
