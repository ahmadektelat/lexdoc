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
    const { data: { subscription } } = authService.onAuthStateChange(
      async (event, session) => {
        // Only act on events that change auth state.
        // Ignore TOKEN_REFRESHED, PASSWORD_RECOVERY, USER_UPDATED, etc.
        if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN') {
          if (session?.user) {
            const result = await firmService.getFirmByUserId(session.user.id);
            if (result) {
              useAuthStore.getState().setUser({
                id: session.user.id,
                email: session.user.email!,
                name: session.user.email!,
              });
              useAuthStore.getState().setFirmData(result.firm, result.role);

              // Load granular permissions for this user
              try {
                const permissions = await roleService.getPermissionsForUser(
                  result.firm.id
                );
                const permissionsRecord: Record<string, boolean> = {};
                for (const p of permissions) {
                  permissionsRecord[p] = true;
                }
                useAuthStore.getState().setPermissions(permissionsRecord);
              } catch {
                // Permission loading failure = default deny (empty permissions).
                // superAdmin bypass in can() ensures firm owners always have access.
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
            // INITIAL_SESSION with no session — user never logged in
            useAuthStore.getState().logout();
          }
          useAuthStore.getState().setLoading(false);
        } else if (event === 'SIGNED_OUT') {
          useAuthStore.getState().logout();
          useAuthStore.getState().setLoading(false);
        }
        // All other events (TOKEN_REFRESHED, etc.) are ignored.
      }
    );

    return () => {
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
