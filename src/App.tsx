// CREATED: 2026-03-17 IST (Jerusalem)
// App - Root component with providers and routing
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LanguageProvider } from '@/contexts/LanguageContext';
import { Toaster } from 'sonner';
import { AppShell } from '@/components/layout/AppShell';
import { useThemeStore } from '@/stores/useThemeStore';
import { useEffect } from 'react';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      retry: 1,
    },
  },
});

function ThemeInitializer() {
  const theme = useThemeStore((s) => s.theme);
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);
  return null;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <LanguageProvider>
        <ThemeInitializer />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<AppShell />}>
              <Route index element={<Navigate to="/dashboard" replace />} />
              <Route path="dashboard" element={<DashboardPlaceholder />} />
              <Route path="clients" element={<SectionPlaceholder section="clients" />} />
              <Route path="filings" element={<SectionPlaceholder section="filings" />} />
              <Route path="billing" element={<SectionPlaceholder section="billing" />} />
              <Route path="staff" element={<SectionPlaceholder section="staff" />} />
              <Route path="crm" element={<SectionPlaceholder section="crm" />} />
              <Route path="documents" element={<SectionPlaceholder section="documents" />} />
              <Route path="reports" element={<SectionPlaceholder section="reports" />} />
              <Route path="messaging" element={<SectionPlaceholder section="messaging" />} />
              <Route path="permissions" element={<SectionPlaceholder section="permissions" />} />
              <Route path="audit" element={<SectionPlaceholder section="audit" />} />
              <Route path="backup" element={<SectionPlaceholder section="backup" />} />
            </Route>
          </Routes>
        </BrowserRouter>
        <Toaster position="top-center" dir="rtl" richColors />
      </LanguageProvider>
    </QueryClientProvider>
  );
}

// Temporary placeholders — will be replaced by actual components during module migration
function DashboardPlaceholder() {
  return (
    <div className="p-6 animate-fade-in">
      <h1 className="text-2xl font-bold text-foreground mb-4">לוח בקרה</h1>
      <p className="text-muted-foreground">מודול לוח הבקרה יועבר בשלב הבא.</p>
    </div>
  );
}

function SectionPlaceholder({ section }: { section: string }) {
  return (
    <div className="p-6 animate-fade-in">
      <h1 className="text-2xl font-bold text-foreground mb-4">{section}</h1>
      <p className="text-muted-foreground">מודול זה יועבר בשלב הבא.</p>
    </div>
  );
}
