// CREATED: 2026-03-19
// UPDATED: 2026-03-19 10:00 IST (Jerusalem)
//          - Initial implementation

import { useLanguage } from '@/contexts/LanguageContext';
import { useAuthStore } from '@/stores/useAuthStore';
import { useStaff } from '@/hooks/useStaff';
import { useStaffRoles, useAssignRole, useRemoveRole } from '@/hooks/useRoles';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { Role } from '@/types';

interface StaffRolesTableProps {
  selectedRoleId: string;
  roles: Role[];
}

export function StaffRolesTable({ selectedRoleId, roles }: StaffRolesTableProps) {
  const { t } = useLanguage();
  const firmId = useAuthStore((s) => s.firmId);
  const { data: staffList } = useStaff(firmId);
  const { data: staffRoles } = useStaffRoles(firmId);
  const assignRole = useAssignRole();
  const removeRole = useRemoveRole();

  // Build a lookup: staffId -> staffRoleRow
  const assignmentMap = new Map(
    (staffRoles ?? []).map((sr) => [sr.staffId, sr])
  );

  const handleRoleChange = (staffId: string, roleId: string) => {
    if (roleId === '__none__') {
      removeRole.mutate(staffId);
    } else {
      assignRole.mutate({ staffId, roleId });
    }
  };

  const activeStaff = (staffList ?? []).filter((s) => s.isActive);

  if (activeStaff.length === 0) return null;

  return (
    <div>
      <h4 className="text-sm font-semibold text-foreground mb-3">
        {t('permissions.staffInRole')}
      </h4>
      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-start px-4 py-2 font-medium text-muted-foreground">
                {t('common.name')}
              </th>
              <th className="text-start px-4 py-2 font-medium text-muted-foreground">
                {t('permissions.currentRole')}
              </th>
              <th className="text-start px-4 py-2 font-medium text-muted-foreground">
                {t('permissions.changeRole')}
              </th>
            </tr>
          </thead>
          <tbody>
            {activeStaff.map((staff) => {
              const assignment = assignmentMap.get(staff.id);
              const isHighlighted = assignment?.roleId === selectedRoleId;

              return (
                <tr
                  key={staff.id}
                  className={`border-t ${isHighlighted ? 'bg-primary/5' : ''}`}
                >
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2">
                      <div className="flex-shrink-0 h-7 w-7 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs">
                        {staff.name.charAt(0)}
                      </div>
                      <span className="font-medium">{staff.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2">
                    {assignment ? (
                      <span
                        className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium text-white"
                        style={{ backgroundColor: assignment.roleColor }}
                      >
                        {assignment.roleName}
                      </span>
                    ) : (
                      <span className="text-muted-foreground text-xs">
                        {t('permissions.noPermissionRole')}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <Select
                      value={assignment?.roleId ?? '__none__'}
                      onValueChange={(v) => handleRoleChange(staff.id, v)}
                    >
                      <SelectTrigger className="h-8 w-40">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">
                          {t('permissions.noPermissionRole')}
                        </SelectItem>
                        {roles.map((role) => (
                          <SelectItem key={role.id} value={role.id}>
                            <div className="flex items-center gap-2">
                              <div
                                className="h-2.5 w-2.5 rounded-full flex-shrink-0"
                                style={{ backgroundColor: role.color }}
                              />
                              {role.name}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
