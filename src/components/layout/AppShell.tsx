// CREATED: 2026-03-17 IST (Jerusalem)
// AppShell - Main layout with sidebar and content area
import { Outlet } from 'react-router-dom';
import { useLanguage } from '@/contexts/LanguageContext';
import { Sidebar } from './Sidebar';
import { useAppStore } from '@/stores/useAppStore';
import { Menu } from 'lucide-react';

export function AppShell() {
  const { direction } = useLanguage();
  const { sidebarOpen, toggleSidebar } = useAppStore();

  return (
    <div dir={direction} className="flex h-screen bg-background text-foreground overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <header className="sticky top-0 z-10 flex items-center gap-3 px-4 py-3 bg-background/80 backdrop-blur border-b border-border md:hidden">
          <button
            onClick={toggleSidebar}
            className="p-2 rounded-md hover:bg-accent/10"
          >
            <Menu className="h-5 w-5" />
          </button>
          <span className="font-semibold">LexDoc</span>
        </header>
        <Outlet />
      </main>
    </div>
  );
}
