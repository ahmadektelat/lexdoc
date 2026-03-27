// CREATED: 2026-03-19
// UPDATED: 2026-03-19 11:00 IST (Jerusalem)
//          - Fixed auto-select to use useEffect instead of setState-during-render

import { useState, useEffect } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuthStore } from '@/stores/useAuthStore';
import { useRoles, useDeleteRole } from '@/hooks/useRoles';
import { useIsMobile } from '@/hooks/useIsMobile';
import { PageHeader } from '@/components/shared/PageHeader';
import { EmptyState } from '@/components/shared/EmptyState';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { RoleForm } from './RoleForm';
import { PermissionMatrix } from './PermissionMatrix';
import { StaffRolesTable } from './StaffRolesTable';
import { Plus, Shield, Lock, Pencil, Trash2 } from 'lucide-react';
import type { Role } from '@/types';

export function PermissionsView() {
  const { t } = useLanguage();
  const firmId = useAuthStore((s) => s.firmId);
  const { data: roles, isLoading } = useRoles(firmId);
  const deleteRole = useDeleteRole();
  const isMobile = useIsMobile();

  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | undefined>();
  const [deleteTarget, setDeleteTarget] = useState<Role | null>(null);

  const roleList = roles ?? [];

  // Auto-select first role when data loads and nothing is selected
  useEffect(() => {
    if (roleList.length > 0 && !selectedRole) {
      setSelectedRole(roleList[0]);
    }
  }, [roleList, selectedRole]);

  // Keep selected role in sync with data updates
  const currentSelected = selectedRole
    ? roleList.find((r) => r.id === selectedRole.id) ?? null
    : null;

  const handleEdit = (role: Role) => {
    if (role.locked) return;
    setEditingRole(role);
    setFormOpen(true);
  };

  const handleDelete = (role: Role) => {
    if (role.locked) return;
    setDeleteTarget(role);
  };

  const confirmDelete = () => {
    if (deleteTarget) {
      deleteRole.mutate(deleteTarget.id);
      if (currentSelected?.id === deleteTarget.id) {
        setSelectedRole(null);
      }
      setDeleteTarget(null);
    }
  };

  const handleFormClose = (open: boolean) => {
    setFormOpen(open);
    if (!open) setEditingRole(undefined);
  };

  if (isLoading) {
    return <LoadingSpinner size="lg" className="py-20" />;
  }

  return (
    <div className="p-6 animate-fade-in">
      <PageHeader title={t('permissions.title')} description={t('permissions.description')}>
        <Button onClick={() => setFormOpen(true)}>
          <Plus className="h-4 w-4 me-2" />
          {t('permissions.addRole')}
        </Button>
      </PageHeader>

      {roleList.length === 0 ? (
        <EmptyState
          icon={Shield}
          title={t('permissions.noRoles')}
          description={t('permissions.noRolesDesc')}
        />
      ) : (
        <div className={`flex ${isMobile ? 'flex-col' : 'flex-row'} gap-6`}>
          {/* Sidebar: role list */}
          <div className={`${isMobile ? 'w-full' : 'w-64'} flex-shrink-0 space-y-2`}>
            {roleList.map((role) => {
              const isSelected = currentSelected?.id === role.id;
              return (
                <button
                  key={role.id}
                  onClick={() => setSelectedRole(role)}
                  className={`w-full text-start rounded-lg border px-4 py-3 transition-colors ${
                    isSelected
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-muted-foreground/30 hover:bg-muted/30'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <div
                      className="h-3 w-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: role.color }}
                    />
                    <span className="font-medium text-sm text-foreground">
                      {role.name}
                    </span>
                    {role.locked && (
                      <Lock className="h-3 w-3 text-muted-foreground ms-auto" />
                    )}
                  </div>
                  {role.description && (
                    <p className="text-xs text-muted-foreground truncate">
                      {role.description}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">
                    {role.permissions?.length ?? 0} {t('permissions.permissionCount')}
                  </p>
                </button>
              );
            })}
          </div>

          {/* Main panel */}
          <div className="flex-1 min-w-0">
            {currentSelected ? (
              <div className="space-y-6">
                {/* Role header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className="h-4 w-4 rounded-full"
                      style={{ backgroundColor: currentSelected.color }}
                    />
                    <h2 className="text-lg font-semibold text-foreground">
                      {currentSelected.name}
                    </h2>
                    {currentSelected.locked && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted text-muted-foreground text-xs">
                        <Lock className="h-3 w-3" />
                        {t('permissions.locked')}
                      </span>
                    )}
                  </div>
                  {!currentSelected.locked && (
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => handleEdit(currentSelected)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive"
                        onClick={() => handleDelete(currentSelected)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>

                {/* Locked role notice */}
                {currentSelected.locked && (
                  <p className="text-sm text-muted-foreground">
                    {t('permissions.lockedDesc')}
                  </p>
                )}

                {/* Permission matrix */}
                <PermissionMatrix
                  role={currentSelected}
                  disabled={currentSelected.locked}
                />

                {/* Staff roles table */}
                <StaffRolesTable
                  selectedRoleId={currentSelected.id}
                  roles={roleList}
                />
              </div>
            ) : (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                {t('permissions.selectRole')}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Create/Edit form dialog */}
      <RoleForm
        open={formOpen}
        onOpenChange={handleFormClose}
        role={editingRole}
      />

      {/* Delete confirmation */}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={t('permissions.deleteConfirm')}
        description={t('permissions.deleteConfirmDesc')}
        confirmLabel={t('common.delete')}
        onConfirm={confirmDelete}
        variant="destructive"
      />
    </div>
  );
}
