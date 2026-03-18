// CREATED: 2026-03-17 IST (Jerusalem)
// UPDATED: 2026-03-19 12:00 IST (Jerusalem)
//          - Replaced CRM placeholder route with CrmView
// App - Root component with providers and routing
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LanguageProvider } from '@/contexts/LanguageContext';
import { Toaster } from 'sonner';
import { AppShell } from '@/components/layout/AppShell';
import { useThemeStore } from '@/stores/useThemeStore';
import { useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { WelcomeScreen } from '@/components/auth/WelcomeScreen';
import { Login } from '@/components/auth/Login';
import { Onboard } from '@/components/auth/Onboard';
import { ExpiredScreen } from '@/components/auth/ExpiredScreen';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { ClientsView } from '@/components/clients/ClientsView';
import { ClientDetailView } from '@/components/clients/ClientDetailView';
import { StaffView } from '@/components/staff/StaffView';
import { PermissionsView } from '@/components/permissions/PermissionsView';
import { CrmView } from '@/components/crm/CrmView';

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

function AuthInitializer() {
  useAuth();
  return null;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <LanguageProvider>
        <ThemeInitializer />
        <AuthInitializer />
        <BrowserRouter>
          <Routes>
            {/* Public routes */}
            <Route path="/welcome" element={<WelcomeScreen />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Onboard />} />
            <Route path="/expired" element={<ExpiredScreen />} />

            {/* Protected routes */}
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <AppShell />
                </ProtectedRoute>
              }
            >
              <Route index element={<Navigate to="/dashboard" replace />} />
              <Route path="dashboard" element={<DashboardPlaceholder />} />
              <Route path="clients" element={<ClientsView />} />
              <Route path="clients/:id" element={<ClientDetailView />} />
              <Route path="filings" element={<SectionPlaceholder section="filings" />} />
              <Route path="billing" element={<SectionPlaceholder section="billing" />} />
              <Route path="staff" element={<StaffView />} />
              <Route path="crm" element={<CrmView />} />
              <Route path="documents" element={<SectionPlaceholder section="documents" />} />
              <Route path="reports" element={<SectionPlaceholder section="reports" />} />
              <Route path="messaging" element={<SectionPlaceholder section="messaging" />} />
              <Route path="permissions" element={<PermissionsView />} />
              <Route path="audit" element={<SectionPlaceholder section="audit" />} />
              <Route path="backup" element={<SectionPlaceholder section="backup" />} />
            </Route>

            {/* Catch-all redirect */}
            <Route path="*" element={<Navigate to="/welcome" replace />} />
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
