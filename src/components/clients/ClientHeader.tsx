// CREATED: 2026-03-18
// UPDATED: 2026-03-18 10:00 IST (Jerusalem)
//          - Initial implementation

import { useLanguage } from '@/contexts/LanguageContext';
import { CLIENT_TYPES } from '@/lib/constants';
import { formatMoney } from '@/lib/money';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Badge } from '@/components/ui/badge';
import type { Client } from '@/types';

interface ClientHeaderProps {
  client: Client;
}

export function ClientHeader({ client }: ClientHeaderProps) {
  const { t } = useLanguage();

  return (
    <div className="flex flex-col sm:flex-row items-start gap-4 mb-6">
      {/* Avatar */}
      <div className="flex-shrink-0 h-16 w-16 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-2xl">
        {client.name.charAt(0)}
      </div>

      <div className="flex-1 min-w-0">
        {/* Name + case number */}
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold text-foreground">{client.name}</h1>
          <span className="text-sm text-muted-foreground" dir="ltr">
            {client.caseNum}
          </span>
        </div>

        {/* Badges */}
        <div className="flex flex-wrap items-center gap-2 mt-2">
          <Badge variant="secondary">
            {t(CLIENT_TYPES[client.clientType])}
          </Badge>
          <StatusBadge status={client.status} />
        </div>

        {/* Details row */}
        <div className="flex flex-wrap items-center gap-4 mt-3 text-sm text-muted-foreground">
          {client.monthlyFee ? (
            <span>
              {formatMoney(client.monthlyFee)} {t('clients.perMonth')}
            </span>
          ) : null}

          {client.taxId && (
            <span dir="ltr">{client.taxId}</span>
          )}

          {client.mobile && (
            <span dir="ltr">{client.mobile}</span>
          )}

          {client.email && (
            <span dir="ltr">{client.email}</span>
          )}
        </div>

        {/* TODO: Display assigned staff name once staff module is built.
            Currently only assignedStaffId (UUID) is available.
            Add: .select('*, staff!assigned_staff_id(name)') to the service query. */}

        {/* Tags */}
        {client.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {client.tags.map((tag) => (
              <Badge key={tag} variant="outline" className="text-xs">
                {tag}
              </Badge>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
