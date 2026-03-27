// CREATED: 2026-03-18
// UPDATED: 2026-03-18 14:00 IST (Jerusalem)
//          - Initial implementation

import { useLanguage } from '@/contexts/LanguageContext';
import { STAFF_ROLES } from '@/lib/constants';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Pencil, Trash2 } from 'lucide-react';
import type { Staff } from '@/types';

interface StaffCardProps {
  staff: Staff;
  onEdit: (staff: Staff) => void;
  onDelete: (staff: Staff) => void;
  onClick: (staff: Staff) => void;
}

export function StaffCard({ staff, onEdit, onDelete, onClick }: StaffCardProps) {
  const { t } = useLanguage();

  return (
    <Card
      className="cursor-pointer hover:bg-muted/50 transition-colors"
      onClick={() => onClick(staff)}
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          {/* Avatar */}
          <div className="flex-shrink-0 h-10 w-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-lg">
            {staff.name.charAt(0)}
          </div>

          <div className="flex-1 min-w-0">
            {/* Name */}
            <h3 className="font-semibold text-foreground truncate">{staff.name}</h3>

            {/* Badges */}
            <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
              <Badge variant="secondary" className="text-xs">
                {t(STAFF_ROLES[staff.role])}
              </Badge>
              <StatusBadge status={staff.isActive ? 'active' : 'archived'} />
            </div>
          </div>

          {/* Actions */}
          <div
            className="flex items-center gap-1"
            onClick={(e) => e.stopPropagation()}
          >
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => onEdit(staff)}
            >
              <Pencil className="h-4 w-4" />
            </Button>
            {staff.role !== 'partner' && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-destructive"
                onClick={() => onDelete(staff)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
