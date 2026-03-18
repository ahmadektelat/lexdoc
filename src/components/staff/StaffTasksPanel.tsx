// CREATED: 2026-03-18
// UPDATED: 2026-03-18 14:00 IST (Jerusalem)
//          - Initial implementation (UI shell with empty state for Phase 6)

import { useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/shared/EmptyState';
import { X, ListTodo } from 'lucide-react';
import type { Staff } from '@/types';

interface StaffTasksPanelProps {
  staff: Staff;
  onClose: () => void;
}

type TabKey = 'open' | 'done' | 'all';

export function StaffTasksPanel({ staff, onClose }: StaffTasksPanelProps) {
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState<TabKey>('open');

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'open', label: t('staff.openTasks') },
    { key: 'done', label: t('staff.doneTasks') },
    { key: 'all', label: t('staff.allTasks') },
  ];

  return (
    <div className="border border-border rounded-lg bg-background">
      {/* Header */}
      <div className="flex items-center gap-3 p-4 border-b border-border">
        <div className="flex-shrink-0 h-10 w-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-lg">
          {staff.name.charAt(0)}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-foreground truncate">{staff.name}</h3>
          <p className="text-xs text-muted-foreground">{t('staff.tasks')}</p>
        </div>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Metrics grid */}
      <div className="grid grid-cols-3 gap-4 p-4 border-b border-border">
        <div className="text-center">
          <p className="text-2xl font-bold text-foreground">-</p>
          <p className="text-xs text-muted-foreground">{t('staff.openTasks')}</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold text-destructive">-</p>
          <p className="text-xs text-muted-foreground">{t('staff.overdueTasks')}</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold text-foreground">-</p>
          <p className="text-xs text-muted-foreground">{t('staff.doneTasks')}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            className={cn(
              'flex-1 py-2 text-sm font-medium transition-colors',
              activeTab === tab.key
                ? 'text-primary border-b-2 border-primary'
                : 'text-muted-foreground hover:text-foreground'
            )}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Empty state */}
      <div className="p-6">
        <EmptyState
          icon={ListTodo}
          title={t('staff.tasksComingSoon')}
        />
      </div>
    </div>
  );
}
