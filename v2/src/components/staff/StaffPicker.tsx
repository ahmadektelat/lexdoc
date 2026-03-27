// CREATED: 2026-03-18
// UPDATED: 2026-03-18 14:00 IST (Jerusalem)
//          - Initial implementation

import { useLanguage } from '@/contexts/LanguageContext';
import { useStaff } from '@/hooks/useStaff';
import { STAFF_ROLES } from '@/lib/constants';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface StaffPickerProps {
  value?: string;
  onChange: (staffId: string | undefined) => void;
  firmId: string;
  placeholder?: string;
  disabled?: boolean;
}

export function StaffPicker({ value, onChange, firmId, placeholder, disabled }: StaffPickerProps) {
  const { t } = useLanguage();
  const { data: staffList } = useStaff(firmId);

  // Filter to active, non-deleted staff only
  const activeStaff = staffList?.filter((s) => s.isActive) ?? [];

  return (
    <Select
      value={value ?? ''}
      onValueChange={(v) => onChange(v || undefined)}
      disabled={disabled}
    >
      <SelectTrigger>
        <SelectValue placeholder={placeholder ?? t('staff.selectStaff')} />
      </SelectTrigger>
      <SelectContent>
        {activeStaff.map((s) => (
          <SelectItem key={s.id} value={s.id}>
            <span className="flex items-center gap-2">
              {s.name}
              <span className="text-xs text-muted-foreground">
                {t(STAFF_ROLES[s.role])}
              </span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
