// CREATED: 2026-03-19
// UPDATED: 2026-03-19 10:00 IST (Jerusalem)
//          - Initial implementation

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

  const handleToggle = (permissionId: string) => {
    if (disabled || !firmId) return;

    const current = role.permissions ?? [];
    const newPermissions = current.includes(permissionId)
      ? current.filter((p) => p !== permissionId)
      : [...current, permissionId];

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
              const isChecked = role.permissions?.includes(permission.id) ?? false;
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
