// CREATED: 2026-03-19
// UPDATED: 2026-03-19 12:00 IST (Jerusalem)
//          - Initial implementation

import { useState, useMemo } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuthStore } from '@/stores/useAuthStore';
import { useContacts, useDeleteContact } from '@/hooks/useContacts';
import { useClients } from '@/hooks/useClients';
import { CONTACT_TYPES } from '@/lib/constants';
import { SearchInput } from '@/components/shared/SearchInput';
import { EmptyState } from '@/components/shared/EmptyState';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ContactForm } from './ContactForm';
import { Plus, Users, Pencil, Trash2 } from 'lucide-react';
import type { Contact, ContactType } from '@/types';

interface ContactsPanelProps {
  clientId?: string;
}

export function ContactsPanel({ clientId }: ContactsPanelProps) {
  const { t } = useLanguage();
  const firmId = useAuthStore((s) => s.firmId);
  const can = useAuthStore((s) => s.can);
  const canManage = can('crm.manage');
  const { data: contacts, isLoading } = useContacts(firmId, clientId);
  const { data: clients } = useClients(firmId);
  const deleteContact = useDeleteContact();

  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<ContactType | 'all'>('all');
  const [formOpen, setFormOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | undefined>();
  const [deleteTarget, setDeleteTarget] = useState<Contact | null>(null);

  // Client name lookup
  const clientMap = useMemo(() => {
    const map = new Map<string, string>();
    clients?.forEach((c) => map.set(c.id, c.name));
    return map;
  }, [clients]);

  // Client-side filtering
  const filteredContacts = useMemo(() => {
    if (!contacts) return [];
    return contacts.filter((c) => {
      if (typeFilter !== 'all' && c.type !== typeFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          c.name.toLowerCase().includes(q) ||
          (c.role?.toLowerCase().includes(q) ?? false) ||
          (c.email?.toLowerCase().includes(q) ?? false)
        );
      }
      return true;
    });
  }, [contacts, typeFilter, search]);

  const handleEdit = (contact: Contact) => {
    setEditingContact(contact);
    setFormOpen(true);
  };

  const handleFormClose = (open: boolean) => {
    setFormOpen(open);
    if (!open) setEditingContact(undefined);
  };

  const confirmDelete = () => {
    if (deleteTarget) {
      deleteContact.mutate(deleteTarget.id);
      setDeleteTarget(null);
    }
  };

  if (isLoading) {
    return <LoadingSpinner size="lg" className="py-20" />;
  }

  return (
    <div>
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4 mb-4">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder={t('common.searchPlaceholder')}
          className="max-w-md"
        />

        <div className="flex gap-2 flex-wrap">
          <Button
            variant={typeFilter === 'all' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setTypeFilter('all')}
          >
            {t('common.all')}
          </Button>
          {Object.entries(CONTACT_TYPES).map(([value, labelKey]) => (
            <Button
              key={value}
              variant={typeFilter === value ? 'default' : 'outline'}
              size="sm"
              onClick={() => setTypeFilter(value as ContactType)}
            >
              {t(labelKey)}
            </Button>
          ))}
        </div>

        {canManage && (
          <Button onClick={() => setFormOpen(true)} className="ms-auto">
            <Plus className="h-4 w-4 me-2" />
            {t('contacts.addContact')}
          </Button>
        )}
      </div>

      {/* Contact grid */}
      {filteredContacts.length === 0 ? (
        <EmptyState
          icon={Users}
          title={t('contacts.noContacts')}
          description={t('contacts.noContactsDesc')}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredContacts.map((contact) => (
            <div key={contact.id} className="rounded-lg border p-4">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 h-10 w-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-sm">
                  {contact.name.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium truncate">{contact.name}</span>
                    <Badge variant="outline" className="text-xs flex-shrink-0">
                      {t(CONTACT_TYPES[contact.type])}
                    </Badge>
                  </div>
                  {contact.role && (
                    <p className="text-sm text-muted-foreground">{contact.role}</p>
                  )}
                  {contact.client_id && clientMap.get(contact.client_id) && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {clientMap.get(contact.client_id)}
                    </p>
                  )}
                  <div className="flex flex-col gap-0.5 mt-2">
                    {contact.phone && (
                      <span dir="ltr" className="text-sm text-muted-foreground">
                        {contact.phone}
                      </span>
                    )}
                    {contact.email && (
                      <span dir="ltr" className="text-sm text-muted-foreground">
                        {contact.email}
                      </span>
                    )}
                  </div>
                </div>

                {canManage && (
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => handleEdit(contact)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive"
                      onClick={() => setDeleteTarget(contact)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit form dialog */}
      <ContactForm
        open={formOpen}
        onOpenChange={handleFormClose}
        contact={editingContact}
        defaultClientId={clientId}
      />

      {/* Delete confirmation */}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={t('contacts.deleteContact')}
        description={t('contacts.confirmDelete')}
        confirmLabel={t('common.delete')}
        onConfirm={confirmDelete}
        variant="destructive"
      />
    </div>
  );
}
