// CREATED: 2026-03-24
// UPDATED: 2026-03-24 11:30 IST (Jerusalem)
//          - Initial implementation

import { useState, useMemo } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuthStore } from '@/stores/useAuthStore';
import { useMessageLog, useTemplates } from '@/hooks/useMessages';
import { useClients } from '@/hooks/useClients';
import { DataTable } from '@/components/shared/DataTable';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { formatDateTime } from '@/lib/dates';
import type { ColumnDef } from '@tanstack/react-table';
import type { Message, MessageChannel } from '@/types';

const ALL_VALUE = '__all__';

export function MsgLogPanel() {
  const { t } = useLanguage();
  const firmId = useAuthStore((s) => s.firmId);
  const { data: clients = [] } = useClients(firmId);
  const { data: templates = [] } = useTemplates(firmId);

  const [filterClient, setFilterClient] = useState<string>(ALL_VALUE);
  const [filterTopic, setFilterTopic] = useState<string>(ALL_VALUE);
  const [filterChannel, setFilterChannel] = useState<string>(ALL_VALUE);
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);

  const filters = useMemo(() => ({
    clientId: filterClient !== ALL_VALUE ? filterClient : undefined,
    topic: filterTopic !== ALL_VALUE ? filterTopic : undefined,
    channel: (filterChannel !== ALL_VALUE ? filterChannel : undefined) as MessageChannel | undefined,
    fromDate: filterFrom || undefined,
    toDate: filterTo || undefined,
  }), [filterClient, filterTopic, filterChannel, filterFrom, filterTo]);

  const { data: messages = [], isLoading } = useMessageLog(firmId, filters);

  // Get unique topics from templates for filter dropdown
  const topics = useMemo(() => {
    const topicMap = new Map<string, string>();
    templates.forEach((tpl) => topicMap.set(tpl.topic, tpl.topicLabel));
    return Array.from(topicMap.entries());
  }, [templates]);

  const columns: ColumnDef<Message, unknown>[] = [
    {
      accessorKey: 'sentAt',
      header: t('common.date'),
      cell: ({ row }) => (
        <span className="text-xs" dir="ltr">{formatDateTime(row.original.sentAt)}</span>
      ),
    },
    {
      accessorKey: 'clientName',
      header: t('common.client'),
    },
    {
      accessorKey: 'topic',
      header: t('messaging.subject'),
      cell: ({ row }) => {
        const tpl = templates.find((t) => t.topic === row.original.topic);
        return <span>{tpl?.topicLabel ?? row.original.topic}</span>;
      },
    },
    {
      accessorKey: 'channel',
      header: t('messaging.channel'),
      cell: ({ row }) => (
        <Badge variant="outline" className="text-xs">
          {t(`messaging.channel${row.original.channel.charAt(0).toUpperCase() + row.original.channel.slice(1)}`)}
        </Badge>
      ),
    },
    {
      accessorKey: 'status',
      header: t('common.status'),
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            setSelectedMessage(row.original);
          }}
        >
          {t('messaging.viewDetail')}
        </Button>
      ),
    },
  ];

  if (isLoading) return <LoadingSpinner size="lg" className="py-20" />;

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex flex-wrap gap-3">
        {/* Client filter */}
        <Select value={filterClient} onValueChange={setFilterClient}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder={t('messaging.filterClient')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_VALUE}>{t('messaging.filterClient')}</SelectItem>
            {clients.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Topic filter */}
        <Select value={filterTopic} onValueChange={setFilterTopic}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder={t('messaging.filterTopic')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_VALUE}>{t('messaging.filterTopic')}</SelectItem>
            {topics.map(([topic, label]) => (
              <SelectItem key={topic} value={topic}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Channel filter */}
        <Select value={filterChannel} onValueChange={setFilterChannel}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder={t('messaging.channel')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_VALUE}>{t('messaging.channel')}</SelectItem>
            <SelectItem value="email">{t('messaging.channelEmail')}</SelectItem>
            <SelectItem value="sms">{t('messaging.channelSms')}</SelectItem>
            <SelectItem value="whatsapp">{t('messaging.channelWhatsapp')}</SelectItem>
          </SelectContent>
        </Select>

        {/* Date range */}
        <Input
          type="date"
          value={filterFrom}
          onChange={(e) => setFilterFrom(e.target.value)}
          className="w-40"
          dir="ltr"
        />
        <Input
          type="date"
          value={filterTo}
          onChange={(e) => setFilterTo(e.target.value)}
          className="w-40"
          dir="ltr"
        />
      </div>

      {/* Message table */}
      <DataTable
        columns={columns}
        data={messages}
        emptyMessage={t('messaging.noMessages')}
        onRowClick={(msg) => setSelectedMessage(msg)}
      />

      {/* Message detail dialog */}
      <Dialog open={!!selectedMessage} onOpenChange={() => setSelectedMessage(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{selectedMessage?.subject}</DialogTitle>
          </DialogHeader>
          {selectedMessage && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-muted-foreground">{t('common.client')}:</span>{' '}
                  {selectedMessage.clientName}
                </div>
                <div>
                  <span className="text-muted-foreground">{t('messaging.channel')}:</span>{' '}
                  {t(`messaging.channel${selectedMessage.channel.charAt(0).toUpperCase() + selectedMessage.channel.slice(1)}`)}
                </div>
                <div>
                  <span className="text-muted-foreground">{t('common.date')}:</span>{' '}
                  <span dir="ltr">{formatDateTime(selectedMessage.sentAt)}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">{t('common.status')}:</span>{' '}
                  <StatusBadge status={selectedMessage.status} />
                </div>
                {selectedMessage.toEmail && (
                  <div>
                    <span className="text-muted-foreground">Email:</span>{' '}
                    <span dir="ltr">{selectedMessage.toEmail}</span>
                  </div>
                )}
                {selectedMessage.toPhone && (
                  <div>
                    <span className="text-muted-foreground">Phone:</span>{' '}
                    <span dir="ltr">{selectedMessage.toPhone}</span>
                  </div>
                )}
              </div>
              <div className="border-t border-border pt-3">
                <p className="text-sm whitespace-pre-wrap">{selectedMessage.body}</p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
