// CREATED: 2026-03-18
// UPDATED: 2026-03-18 10:00 IST (Jerusalem)
//          - Initial implementation

import { useNavigate } from 'react-router-dom';
import { useLanguage } from '@/contexts/LanguageContext';
import { CLIENT_TYPES } from '@/lib/constants';
import { formatMoney } from '@/lib/money';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import type { Client } from '@/types';

interface ClientCardProps {
  client: Client;
}

export function ClientCard({ client }: ClientCardProps) {
  const navigate = useNavigate();
  const { t } = useLanguage();

  return (
    <Card
      className="cursor-pointer hover:bg-muted/50 transition-colors"
      onClick={() => navigate(`/clients/${client.id}`)}
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          {/* Avatar */}
          <div className="flex-shrink-0 h-10 w-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-lg">
            {client.name.charAt(0)}
          </div>

          <div className="flex-1 min-w-0">
            {/* Name + case number */}
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-foreground truncate">{client.name}</h3>
              <span className="text-xs text-muted-foreground" dir="ltr">
                {client.caseNum}
              </span>
            </div>

            {/* Badges row */}
            <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
              <Badge variant="secondary" className="text-xs">
                {t(CLIENT_TYPES[client.clientType])}
              </Badge>
              <StatusBadge status={client.status} />
            </div>

            {/* Fee */}
            {client.monthlyFee ? (
              <p className="text-sm text-muted-foreground mt-1.5">
                {formatMoney(client.monthlyFee)} {t('clients.perMonth')}
              </p>
            ) : null}

            {/* Tags */}
            {client.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1.5">
                {client.tags.map((tag) => (
                  <Badge key={tag} variant="outline" className="text-xs">
                    {tag}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
