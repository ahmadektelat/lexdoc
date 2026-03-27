// CREATED: 2026-03-18
// UPDATED: 2026-03-18 21:00 IST (Jerusalem)
//          - Use shared useIsMobile hook

import { useState, useMemo } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuthStore } from '@/stores/useAuthStore';
import { useStaff, useDeleteStaff } from '@/hooks/useStaff';
import { useStaffClientAssignments } from '@/hooks/useClientStaff';
import { useIsMobile } from '@/hooks/useIsMobile';
import { STAFF_ROLES } from '@/lib/constants';
import { PageHeader } from '@/components/shared/PageHeader';
import { SearchInput } from '@/components/shared/SearchInput';
import { DataTable } from '@/components/shared/DataTable';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { EmptyState } from '@/components/shared/EmptyState';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { StaffForm } from './StaffForm';
import { StaffCard } from './StaffCard';
import { StaffTasksPanel } from './StaffTasksPanel';
import { Plus, UserCog, Pencil, Trash2 } from 'lucide-react';
import type { ColumnDef } from '@tanstack/react-table';
import type { Staff } from '@/types';

// Active client count cell — fetches count per staff member
function ActiveClientsCell({ staffId }: { staffId: string }) {
  const { data: assignments } = useStaffClientAssignments(staffId);
  return <span>{assignments?.length ?? '-'}</span>;
}

export function StaffView() {
  const { t } = useLanguage();
  const firmId = useAuthStore((s) => s.firmId);
  const { data: staffList, isLoading } = useStaff(firmId);
  const deleteStaff = useDeleteStaff();
  const isMobile = useIsMobile();

  const [search, setSearch] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState<Staff | undefined>();
  const [selectedStaff, setSelectedStaff] = useState<Staff | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Staff | null>(null);

  // Client-side filtering
  const filteredStaff = useMemo(() => {
    if (!staffList) return [];
    if (!search) return staffList;
    const q = search.toLowerCase();
    return staffList.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.role.toLowerCase().includes(q)
    );
  }, [staffList, search]);

  const handleEdit = (staff: Staff) => {
    setEditingStaff(staff);
    setFormOpen(true);
  };

  const handleDelete = (staff: Staff) => {
    if (staff.role === 'partner') return;
    setDeleteTarget(staff);
  };

  const confirmDelete = () => {
    if (deleteTarget) {
      deleteStaff.mutate(deleteTarget.id);
      setDeleteTarget(null);
      if (selectedStaff?.id === deleteTarget.id) {
        setSelectedStaff(null);
      }
    }
  };

  const handleFormClose = (open: boolean) => {
    setFormOpen(open);
    if (!open) setEditingStaff(undefined);
  };

  // Column definitions for DataTable
  const columns: ColumnDef<Staff, unknown>[] = useMemo(
    () => [
      {
        accessorKey: 'name',
        header: t('staff.name'),
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <div className="flex-shrink-0 h-8 w-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-sm">
              {row.original.name.charAt(0)}
            </div>
            <span className="font-medium">{row.original.name}</span>
          </div>
        ),
      },
      {
        accessorKey: 'role',
        header: t('staff.role'),
        cell: ({ row }) => (
          <Badge variant="secondary">
            {t(STAFF_ROLES[row.original.role])}
          </Badge>
        ),
      },
      {
        id: 'totalHours',
        header: t('staff.totalHours'),
        cell: () => <span className="text-muted-foreground">-</span>,
      },
      {
        id: 'activeClients',
        header: t('staff.activeClients'),
        cell: ({ row }) => <ActiveClientsCell staffId={row.original.id} />,
      },
      {
        id: 'tasks',
        header: t('staff.tasks'),
        cell: () => <span className="text-muted-foreground">-</span>,
      },
      {
        id: 'status',
        header: t('staff.active'),
        cell: ({ row }) => (
          <StatusBadge status={row.original.isActive ? 'active' : 'archived'} />
        ),
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) => (
          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => handleEdit(row.original)}
            >
              <Pencil className="h-4 w-4" />
            </Button>
            {row.original.role !== 'partner' && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-destructive"
                onClick={() => handleDelete(row.original)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        ),
      },
    ],
    [t]
  );

  if (isLoading) {
    return <LoadingSpinner size="lg" className="py-20" />;
  }

  return (
    <div className="p-6 animate-fade-in">
      <PageHeader title={t('staff.title')} description={t('staff.description')}>
        <Button onClick={() => setFormOpen(true)}>
          <Plus className="h-4 w-4 me-2" />
          {t('staff.addMember')}
        </Button>
      </PageHeader>

      {/* Search */}
      <div className="mb-6">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder={t('staff.searchPlaceholder')}
          className="max-w-md"
        />
      </div>

      <div className="flex gap-6">
        {/* Main content */}
        <div className="flex-1 min-w-0">
          {filteredStaff.length === 0 && !search ? (
            <EmptyState
              icon={UserCog}
              title={t('staff.noStaff')}
              description={t('staff.noStaffDesc')}
            />
          ) : isMobile ? (
            <div className="space-y-3">
              {filteredStaff.map((staff) => (
                <StaffCard
                  key={staff.id}
                  staff={staff}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                  onClick={(staff) => setSelectedStaff(staff)}
                />
              ))}
            </div>
          ) : (
            <DataTable
              columns={columns}
              data={filteredStaff}
              onRowClick={(staff) => setSelectedStaff(staff)}
              emptyMessage={t('common.noResults')}
            />
          )}
        </div>

        {/* Tasks panel (desktop only) */}
        {selectedStaff && !isMobile && (
          <div className="w-80 flex-shrink-0">
            <StaffTasksPanel
              staff={selectedStaff}
              onClose={() => setSelectedStaff(null)}
            />
          </div>
        )}
      </div>

      {/* Mobile tasks panel */}
      {selectedStaff && isMobile && (
        <div className="mt-4">
          <StaffTasksPanel
            staff={selectedStaff}
            onClose={() => setSelectedStaff(null)}
          />
        </div>
      )}

      {/* Create/Edit form dialog */}
      <StaffForm
        open={formOpen}
        onOpenChange={handleFormClose}
        staff={editingStaff}
      />

      {/* Delete confirmation */}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={t('staff.deleteConfirm')}
        description={t('staff.deleteConfirmDesc')}
        confirmLabel={t('common.delete')}
        onConfirm={confirmDelete}
        variant="destructive"
      />
    </div>
  );
}
