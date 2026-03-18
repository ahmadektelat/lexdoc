// CREATED: 2026-03-18
// UPDATED: 2026-03-18 10:00 IST (Jerusalem)
//          - Initial implementation

import { useLanguage } from '@/contexts/LanguageContext';
import { CLIENT_TYPES } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import type { ClientType } from '@/types';

interface ClientTypePickerProps {
  value: ClientType | 'all';
  onChange: (value: ClientType | 'all') => void;
}

const TYPE_OPTIONS: Array<{ value: ClientType | 'all'; labelKey: string }> = [
  { value: 'all', labelKey: 'clients.all' },
  ...Object.entries(CLIENT_TYPES).map(([value, labelKey]) => ({
    value: value as ClientType,
    labelKey,
  })),
];

export function ClientTypePicker({ value, onChange }: ClientTypePickerProps) {
  const { t } = useLanguage();

  return (
    <div className="flex flex-wrap gap-2">
      {TYPE_OPTIONS.map((option) => (
        <Button
          key={option.value}
          variant={value === option.value ? 'default' : 'outline'}
          size="sm"
          onClick={() => onChange(option.value)}
        >
          {t(option.labelKey)}
        </Button>
      ))}
    </div>
  );
}
