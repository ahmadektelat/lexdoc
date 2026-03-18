// CREATED: 2026-03-19
// UPDATED: 2026-03-19 11:00 IST (Jerusalem)
//          - Added optimistic local state to prevent race conditions on rapid toggles

import { useState, useEffect } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuthStore } from '@/stores/useAuthStore';
import { useUpdateRole } from '@/hooks/useRoles';
import { PERMISSION_GROUPS } from '@/types/role';
import type { Role } from '@/types';

interface PermissionMatrixProps {
  role: Role;
  disabled: boolean;
}

export function PermissionMatrix({ role, disabled }: PermissionMatrixProps) {
  const { t } = useLanguage();
  const firmId = useAuthStore((s) => s.firmId);
  const updateRole = useUpdateRole();

  // Optimistic local state — prevents race conditions when toggling fast
  const [localPermissions, setLocalPermissions] = useState<string[]>(role.permissions ?? []);

  // Reset local state when the role prop changes (different role selected or server data refreshes)
  useEffect(() => {
    setLocalPermissions(role.permissions ?? []);
  }, [role.id, role.permissions]);

  const handleToggle = (permissionId: string) => {
    if (disabled || !firmId) return;

    const newPermissions = localPermissions.includes(permissionId)
      ? localPermissions.filter((p) => p !== permissionId)
      : [...localPermissions, permissionId];

    // Update local state immediately (optimistic)
    setLocalPermissions(newPermissions);

    // Fire mutation with the latest local state
    updateRole.mutate({
      firmId,
      id: role.id,
      input: { permissions: newPermissions },
    });
  };

  return (
    <div className="space-y-6">
      {PERMISSION_GROUPS.map((group) => (
        <div key={group.group}>
          <h4 className="text-sm font-semibold text-foreground mb-3">
            {t(`permissions.group.${group.group}`)}
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {group.permissions.map((permission) => {
              const isChecked = localPermissions.includes(permission.id);
              return (
                <label
                  key={permission.id}
                  className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors ${
                    disabled
                      ? 'opacity-50 cursor-not-allowed'
                      : 'cursor-pointer hover:bg-muted/50'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => handleToggle(permission.id)}
                    disabled={disabled}
                    className="h-4 w-4 rounded border-border text-primary focus:ring-primary disabled:opacity-50"
                  />
                  <span className="text-foreground">{t(permission.label)}</span>
                </label>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
