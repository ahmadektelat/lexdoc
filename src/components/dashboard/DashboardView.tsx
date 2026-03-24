// CREATED: 2026-03-24
// UPDATED: 2026-03-24 16:00 IST (Jerusalem)
//          - Initial implementation

import { useNavigate } from 'react-router-dom';
import { Users, Receipt, ListTodo, AlertTriangle } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuthStore } from '@/stores/useAuthStore';
import { useDashboardMetrics } from '@/hooks/useDashboard';
import { formatMoney } from '@/lib/money';
import { MetricCard } from './MetricCard';
import { RecentClients } from './RecentClients';
import { UpcomingFilings } from './UpcomingFilings';
import { PendingTasks } from './PendingTasks';
import { SubscriptionStatus } from './SubscriptionStatus';

export function DashboardView() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const firmId = useAuthStore((s) => s.firmId);
  const metrics = useDashboardMetrics(firmId);

  if (metrics.isLoading) {
    return <LoadingSpinner size="lg" className="py-20" />;
  }

  return (
    <div className="p-6 animate-fade-in">
      <PageHeader title={t('dashboard.title')} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <MetricCard
          icon={Users}
          label={t('dashboard.activeClients')}
          value={metrics.activeClients}
          onClick={() => navigate('/clients')}
        />
        <MetricCard
          icon={Receipt}
          label={t('dashboard.pendingCharges')}
          value={formatMoney(metrics.pendingCharges)}
          onClick={() => navigate('/billing')}
        />
        <MetricCard
          icon={ListTodo}
          label={t('dashboard.openTasks')}
          value={metrics.openTasks}
          onClick={() => navigate('/crm')}
        />
        <MetricCard
          icon={AlertTriangle}
          label={t('dashboard.overdueTasks')}
          value={metrics.overdueTasks}
          trend={metrics.overdueTasks > 0 ? 'danger' : 'normal'}
          onClick={() => navigate('/crm')}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <RecentClients />
        <UpcomingFilings />
        <PendingTasks />
        <SubscriptionStatus />
      </div>
    </div>
  );
}
