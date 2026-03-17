// CREATED: 2026-03-17 IST (Jerusalem)
// Sidebar - Navigation sidebar with theme picker and language selector
import { useNavigate, useLocation } from 'react-router-dom';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAppStore } from '@/stores/useAppStore';
import { useThemeStore, Theme } from '@/stores/useThemeStore';
import {
  LayoutDashboard,
  Users,
  FileText,
  Receipt,
  UserCog,
  Contact,
  FolderOpen,
  BarChart3,
  MessageSquare,
  Shield,
  ScrollText,
  HardDrive,
  X,
  Sun,
  Moon,
  Palette,
  Languages,
} from 'lucide-react';
import type { Language } from '@/contexts/LanguageContext';

const NAV_ITEMS = [
  { path: '/dashboard', icon: LayoutDashboard, labelKey: 'nav.dashboard' },
  { path: '/clients', icon: Users, labelKey: 'nav.clients' },
  { path: '/filings', icon: FileText, labelKey: 'nav.filings' },
  { path: '/billing', icon: Receipt, labelKey: 'nav.billing' },
  { path: '/staff', icon: UserCog, labelKey: 'nav.staff' },
  { path: '/crm', icon: Contact, labelKey: 'nav.crm' },
  { path: '/documents', icon: FolderOpen, labelKey: 'nav.documents' },
  { path: '/reports', icon: BarChart3, labelKey: 'nav.reports' },
  { path: '/messaging', icon: MessageSquare, labelKey: 'nav.messaging' },
  { path: '/permissions', icon: Shield, labelKey: 'nav.permissions' },
  { path: '/audit', icon: ScrollText, labelKey: 'nav.audit' },
  { path: '/backup', icon: HardDrive, labelKey: 'nav.backup' },
];

const THEMES: { value: Theme; labelKey: string; icon: typeof Sun }[] = [
  { value: 'sky', labelKey: 'theme.sky', icon: Sun },
  { value: 'dark', labelKey: 'theme.dark', icon: Moon },
  { value: 'blue', labelKey: 'theme.blue', icon: Palette },
];

const LANGUAGES: { value: Language; labelKey: string }[] = [
  { value: 'he', labelKey: 'language.hebrew' },
  { value: 'ar', labelKey: 'language.arabic' },
  { value: 'en', labelKey: 'language.english' },
];

export function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { t, direction } = useLanguage();
  const { sidebarOpen, setSidebarOpen } = useAppStore();
  const { theme, setTheme } = useThemeStore();
  const { language, setLanguage } = useLanguage();

  return (
    <>
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={`
          fixed md:static inset-y-0 z-50
          ${direction === 'rtl' ? 'right-0' : 'left-0'}
          w-64 bg-sidebar text-sidebar-foreground
          border-${direction === 'rtl' ? 'l' : 'r'} border-sidebar-border
          transform transition-transform duration-200 ease-in-out
          ${sidebarOpen ? 'translate-x-0' : direction === 'rtl' ? 'translate-x-full' : '-translate-x-full'}
          md:translate-x-0 flex flex-col
        `}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-sidebar-border">
          <h1 className="text-lg font-bold">LexDoc</h1>
          <button
            onClick={() => setSidebarOpen(false)}
            className="p-1 rounded hover:bg-sidebar-accent md:hidden"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto p-2 space-y-1">
          {NAV_ITEMS.map(({ path, icon: Icon, labelKey }) => {
            const isActive = location.pathname === path;
            return (
              <button
                key={path}
                onClick={() => {
                  navigate(path);
                  setSidebarOpen(false);
                }}
                className={`
                  w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm
                  transition-colors
                  ${
                    isActive
                      ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
                      : 'hover:bg-sidebar-accent/50 text-sidebar-foreground/80'
                  }
                `}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span>{t(labelKey)}</span>
              </button>
            );
          })}
        </nav>

        {/* Footer — Theme & Language */}
        <div className="p-3 border-t border-sidebar-border space-y-3">
          {/* Theme picker */}
          <div className="flex items-center gap-1">
            {THEMES.map(({ value, labelKey, icon: Icon }) => (
              <button
                key={value}
                onClick={() => setTheme(value)}
                title={t(labelKey)}
                className={`
                  flex-1 flex items-center justify-center gap-1 py-1.5 rounded text-xs
                  transition-colors
                  ${
                    theme === value
                      ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                      : 'hover:bg-sidebar-accent/30 text-sidebar-foreground/60'
                  }
                `}
              >
                <Icon className="h-3.5 w-3.5" />
              </button>
            ))}
          </div>

          {/* Language selector */}
          <div className="flex items-center gap-1">
            <Languages className="h-3.5 w-3.5 text-sidebar-foreground/60 shrink-0" />
            {LANGUAGES.map(({ value, labelKey }) => (
              <button
                key={value}
                onClick={() => setLanguage(value)}
                className={`
                  flex-1 py-1 rounded text-xs text-center transition-colors
                  ${
                    language === value
                      ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
                      : 'hover:bg-sidebar-accent/30 text-sidebar-foreground/60'
                  }
                `}
              >
                {t(labelKey)}
              </button>
            ))}
          </div>
        </div>
      </aside>
    </>
  );
}
