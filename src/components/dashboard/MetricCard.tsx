// CREATED: 2026-03-24
// UPDATED: 2026-03-24 16:00 IST (Jerusalem)
//          - Initial implementation

import type { LucideIcon } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface MetricCardProps {
  icon: LucideIcon;
  label: string;
  value: string | number;
  trend?: 'normal' | 'danger';
  onClick: () => void;
}

export function MetricCard({ icon: Icon, label, value, trend = 'normal', onClick }: MetricCardProps) {
  return (
    <Card
      className="cursor-pointer hover:shadow-md transition-shadow"
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <Icon className="h-8 w-8 text-primary shrink-0" />
          <div>
            <p className={cn(
              'text-2xl font-bold',
              trend === 'danger' ? 'text-destructive' : 'text-foreground'
            )}>
              {value}
            </p>
            <p className="text-sm text-muted-foreground">{label}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
