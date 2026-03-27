// CREATED: 2026-03-17 16:00 IST (Jerusalem)
// ThemePicker - Reusable theme picker (extracted from Sidebar)

import { useThemeStore, Theme } from '@/stores/useThemeStore';
import { useLanguage } from '@/contexts/LanguageContext';
import { Sun, Moon, Palette } from 'lucide-react';
import { cn } from '@/lib/utils';

const THEMES: { value: Theme; labelKey: string; icon: typeof Sun }[] = [
  { value: 'sky', labelKey: 'theme.sky', icon: Sun },
  { value: 'dark', labelKey: 'theme.dark', icon: Moon },
  { value: 'blue', labelKey: 'theme.blue', icon: Palette },
];

export function ThemePicker({ className }: { className?: string }) {
  const { theme, setTheme } = useThemeStore();
  const { t } = useLanguage();

  return (
    <div className={cn('flex items-center gap-1', className)}>
      {THEMES.map(({ value, labelKey, icon: Icon }) => (
        <button
          key={value}
          onClick={() => setTheme(value)}
          title={t(labelKey)}
          className={cn(
            'flex-1 flex items-center justify-center gap-1 py-1.5 rounded text-xs transition-colors',
            theme === value
              ? 'bg-accent text-accent-foreground'
              : 'hover:bg-accent/30 text-muted-foreground'
          )}
        >
          <Icon className="h-3.5 w-3.5" />
        </button>
      ))}
    </div>
  );
}
