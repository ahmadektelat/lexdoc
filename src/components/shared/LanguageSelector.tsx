// CREATED: 2026-03-17 16:00 IST (Jerusalem)
// LanguageSelector - Reusable language selector (extracted from Sidebar)

import { useLanguage } from '@/contexts/LanguageContext';
import type { Language } from '@/contexts/LanguageContext';
import { Languages } from 'lucide-react';
import { cn } from '@/lib/utils';

const LANGUAGES: { value: Language; labelKey: string }[] = [
  { value: 'he', labelKey: 'language.hebrew' },
  { value: 'ar', labelKey: 'language.arabic' },
  { value: 'en', labelKey: 'language.english' },
];

export function LanguageSelector({ className }: { className?: string }) {
  const { language, setLanguage, t } = useLanguage();

  return (
    <div className={cn('flex items-center gap-1', className)}>
      <Languages className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      {LANGUAGES.map(({ value, labelKey }) => (
        <button
          key={value}
          onClick={() => setLanguage(value)}
          className={cn(
            'flex-1 py-1 rounded text-xs text-center transition-colors',
            language === value
              ? 'bg-accent text-accent-foreground font-medium'
              : 'hover:bg-accent/30 text-muted-foreground'
          )}
        >
          {t(labelKey)}
        </button>
      ))}
    </div>
  );
}
