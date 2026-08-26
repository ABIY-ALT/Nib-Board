'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BellRing,
  CheckCircle2,
  Clock,
  Hourglass,
  RefreshCw,
  Send,
  X,
} from 'lucide-react';
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  PageHeader,
  PriorityBadge,
  SlaPill,
  StatusBadge,
  Tabs,
  cn,
  modalOverlayClass,
  textareaClass,
} from '@/components/ui/primitives';
import { Column, DataTable } from '@/components/ui/DataTable';
import { useAuth } from '@/context/AuthContext';
import { PERMISSIONS } from '@/lib/permissions';
import { REMINDER_REASON_LABEL, type TaskReminderRow } from '@/lib/announcements';
import { formatDate, formatDateTime } from '@/lib/matters';
import { navItem } from '@/lib/navigation';

interface Props {
  onOpenMatter?: (matterId: string) => void;
}

type Bucket = 'all' | 'overdue' | 'due-soon' | 'not-started' | 'reminded';

/**
 * The chasing queue.
 *
 * Every row is a Board matter that is late, nearly late, or has not been
 * touched since it was routed — with who is holding it and for how long. The
 * server scopes the list by the caller's organizational visibility, so this
 * view can only ever show matters they could already open.
 *
 * Whether a reminder has already gone out is shown on the row rather than
 * discovered by sending one: the point of tracking reminders is that the next
 * person to look at the queue can see the chase already happened.
 */
export const TaskRemindersView: React.FC<Props> = ({ onOpenMatter }) => {
  const { can } = useAuth();
  const item = navItem('task-reminders')!;
  const canSend = can(PERMISSIONS.TASK_REMINDER_SEND);

  const [rows, setRows] = useState<TaskReminderRow[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [bucket, setBucket] = useState<Bucket>('all');
  const [target, setTarget] = useState<TaskReminderRow | null>(null);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);

  const load = useCallback(async () => {
    setState('loading');
    try {
      const res = await fetch('/api/task-reminders');
      if (!res.ok) {
        setState('error');
        return;
      }
      setRows(await res.json());
      setState('ready');
    } catch {
      setState('error');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const counts = useMemo(
    () => ({
      all: rows.length,
      overdue: rows.filter((r) => r.isOverdue).length,
      dueSoon: rows.filter((r) => !r.isOverdue && r.reason === 'DUE_SOON').length,
      notStarted: rows.filter((r) => r.notStarted).length,
      reminded: rows.filter((r) => r.reminderCount > 0).length,
    }),
    [rows]
  );

  const filtered = useMemo(() => {
    switch (bucket) {
      case 'overdue':
        return rows.filter((r) => r.isOverdue);
      case 'due-soon':
        return rows.filter((r) => !r.isOverdue && r.reason === 'DUE_SOON');
      case 'not-started':
        return rows.filter((r) => r.notStarted);
      case 'reminded':
        return rows.filter((r) => r.reminderCount > 0);
      default:
        return rows;
    }
  }, [rows, bucket]);

  const columns: Array<Column<TaskReminderRow>> = [
    {
      key: 'ref',
      header: 'Reference',
      className: 'font-semibold tabular whitespace-nowrap',
      sortValue: (r) => r.matterId,
      render: (r) => (
        <div>
          <div className="text-ink">{r.matterId}</div>
          <div className="text-[11px] text-ink-3 font-normal">{r.resolutionNumber}</div>
        </div>
      ),
    },
    {
      key: 'title',
      header: 'Matter',
      className: 'min-w-[13rem] max-w-[20rem]',
      sortValue: (r) => r.title,
      render: (r) => (
        <div>
          <div className="font-medium text-ink line-clamp-1">{r.title}</div>
          <div className="flex items-center gap-1.5 mt-1">
            <PriorityBadge priority={r.priority} />
            <span className="text-[11px] text-ink-3 truncate">{r.businessArea}</span>
          </div>
        </div>
      ),
    },
    {
      key: 'owner',
      header: 'Held by',
      secondary: true,
      sortValue: (r) => r.ownerName,
      render: (r) => (
        <div className="min-w-0">
          <div className="text-ink truncate">{r.ownerName}</div>
          <div className="text-[11px] text-ink-3 truncate">{r.ownerTitle}</div>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      sortValue: (r) => r.status,
      render: (r) => <StatusBadge status={r.status} />,
    },
    {
      key: 'assigned',
      header: 'Assigned',
      secondary: true,
      className: 'whitespace-nowrap',
      sortValue: (r) => r.assignedAt,
      render: (r) => <span className="text-ink-2 tabular">{formatDate(r.assignedAt)}</span>,
    },
    {
      key: 'pending',
      header: 'Pending',
      className: 'whitespace-nowrap',
      sortValue: (r) => r.pendingDays,
      render: (r) => (
        <div>
          <span
            className={cn(
              'text-[12px] font-semibold tabular',
              r.pendingDays >= 14 ? 'text-st-late' : r.pendingDays >= 7 ? 'text-st-review' : 'text-ink-2'
            )}
          >
            {r.pendingDays} {r.pendingDays === 1 ? 'day' : 'days'}
          </span>
          <div className="text-[11px] text-ink-3">{REMINDER_REASON_LABEL[r.reason]}</div>
        </div>
      ),
    },
    {
      key: 'due',
      header: 'Due',
      className: 'whitespace-nowrap',
      sortValue: (r) => r.deadline,
      render: (r) => (
        <div>
          <div className="text-ink tabular">{formatDate(r.deadline)}</div>
          <SlaPill daysRemaining={r.daysRemaining} isOverdue={r.isOverdue} />
        </div>
      ),
    },
    {
      key: 'reminder',
      header: 'Reminder',
      className: 'whitespace-nowrap',
      sortValue: (r) => r.lastReminderAt ?? '',
      render: (r) =>
        r.reminderCount === 0 ? (
          <span className="text-[12px] text-ink-3">Not sent</span>
        ) : (
          <div>
            <span className="inline-flex items-center gap-1 text-[12px] font-medium text-st-done">
              <CheckCircle2 className="w-3 h-3" />
              Sent{r.reminderCount > 1 ? ` ×${r.reminderCount}` : ''}
            </span>
            <div className="text-[11px] text-ink-3 tabular">
              {formatDateTime(r.lastReminderAt!)}
              {r.lastReminderBy ? ` · ${r.lastReminderBy}` : ''}
            </div>
          </div>
        ),
    },
    {
      key: 'action',
      header: '',
      render: (r) =>
        canSend ? (
          <Button
            size="sm"
            variant={r.canRemind ? 'primary' : 'secondary'}
            disabled={!r.canRemind}
            title={
              r.canRemind
                ? `Remind ${r.ownerName}`
                : 'A reminder has already gone out about this matter in the last 24 hours.'
            }
            onClick={(e) => {
              e.stopPropagation();
              setNotice(null);
              setTarget(r);
            }}
            icon={<Send className="w-3 h-3" />}
          >
            {r.canRemind ? 'Remind' : 'Sent'}
          </Button>
        ) : null,
    },
  ];

  return (
    <div>
      <PageHeader
        title={item.title}
        description={item.description}
        actions={
          <Button
            variant="secondary"
            size="sm"
            icon={<RefreshCw className="w-3.5 h-3.5" />}
            onClick={() => void load()}
          >
            Refresh
          </Button>
        }
      />

      {notice && (
        <div
          className={cn(
            'mb-4 flex items-start gap-2 rounded-[--radius-control] border px-3 py-2',
            notice.tone === 'ok'
              ? 'border-line bg-surface-2'
              : 'border-st-late/30 bg-st-late-bg'
          )}
        >
          {notice.tone === 'ok' ? (
            <CheckCircle2 className="w-4 h-4 text-st-done shrink-0 mt-0.5" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-st-late shrink-0 mt-0.5" />
          )}
          <p className={cn('text-[12px]', notice.tone === 'ok' ? 'text-ink-2' : 'text-st-late')}>
            {notice.text}
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <Summary
          label="Overdue"
          value={counts.overdue}
          tone="late"
          icon={<AlertTriangle className="w-4 h-4" />}
          onClick={() => setBucket('overdue')}
          active={bucket === 'overdue'}
        />
        <Summary
          label="Approaching deadline"
          value={counts.dueSoon}
          tone="review"
          icon={<Clock className="w-4 h-4" />}
          onClick={() => setBucket('due-soon')}
          active={bucket === 'due-soon'}
        />
        <Summary
          label="Not yet worked on"
          value={counts.notStarted}
          icon={<Hourglass className="w-4 h-4" />}
          onClick={() => setBucket('not-started')}
          active={bucket === 'not-started'}
        />
        <Summary
          label="Reminded"
          value={counts.reminded}
          icon={<BellRing className="w-4 h-4" />}
          onClick={() => setBucket('reminded')}
          active={bucket === 'reminded'}
        />
      </div>

      <Card className="overflow-hidden">
        <div className="px-4 pt-2">
          <Tabs
            items={[
              { id: 'all', label: 'Whole queue', count: counts.all },
              { id: 'overdue', label: 'Overdue', count: counts.overdue },
              { id: 'due-soon', label: 'Due soon', count: counts.dueSoon },
              { id: 'not-started', label: 'Not started', count: counts.notStarted },
              { id: 'reminded', label: 'Already reminded', count: counts.reminded },
            ]}
            active={bucket}
            onChange={(id) => setBucket(id as Bucket)}
          />
        </div>

        {state === 'error' ? (
          <ErrorState title="Unable to load the reminder queue" onRetry={() => void load()} />
        ) : (
          <DataTable
            columns={columns}
            rows={filtered}
            rowKey={(r) => r.matterId}
            onRowClick={onOpenMatter ? (r) => onOpenMatter(r.matterId) : undefined}
            loading={state === 'loading'}
            pageSize={15}
            rowAccent={(r) => (r.isOverdue ? 'late' : r.reason === 'DUE_SOON' ? 'review' : null)}
            empty={
              <EmptyState
                icon={<CheckCircle2 className="w-5 h-5" />}
                title="Nothing needs chasing"
                message="No Board matter in your scope is overdue, approaching its deadline, or sitting untouched."
              />
            }
          />
        )}
      </Card>

      {target && (
        <SendReminderDialog
          row={target}
          onClose={() => setTarget(null)}
          onSent={(text) => {
            setNotice({ tone: 'ok', text });
            setTarget(null);
            void load();
          }}
          onFailed={(text) => {
            setNotice({ tone: 'bad', text });
            setTarget(null);
            void load();
          }}
        />
      )}
    </div>
  );
};

const Summary: React.FC<{
  label: string;
  value: number;
  icon: React.ReactNode;
  tone?: 'late' | 'review';
  active?: boolean;
  onClick: () => void;
}> = ({ label, value, icon, tone, active, onClick }) => (
  <button
    onClick={onClick}
    className={cn(
      'bg-surface border rounded-[--radius-card] shadow-card p-3.5 text-left w-full transition-all',
      active ? 'border-nib-gold-500 shadow-raised' : 'border-line hover:border-nib-gold-500/60'
    )}
  >
    <div className="flex items-start justify-between gap-2 mb-2">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-3 leading-tight">
        {label}
      </p>
      <span className="text-ink-3 shrink-0">{icon}</span>
    </div>
    <p
      className={cn(
        'text-[26px] font-bold leading-none tabular',
        value === 0 ? 'text-ink' : tone === 'late' ? 'text-st-late' : tone === 'review' ? 'text-st-review' : 'text-ink'
      )}
    >
      {value}
    </p>
  </button>
);

/**
 * Confirms who is about to be chased, and about what.
 *
 * A reminder is a message from one officer to another, so it is never sent
 * from a single unguarded click on a row: the dialog names the recipient and
 * lets the sender say why.
 */
const SendReminderDialog: React.FC<{
  row: TaskReminderRow;
  onClose: () => void;
  onSent: (message: string) => void;
  onFailed: (message: string) => void;
}> = ({ row, onClose, onSent, onFailed }) => {
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const send = async () => {
    setBusy(true);
    try {
      const res = await fetch('/api/task-reminders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matterId: row.matterId, message: message.trim() || undefined }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        onFailed(payload.error ?? 'The reminder could not be sent.');
        return;
      }
      onSent(
        `Reminder sent to ${payload.recipient}` +
          (payload.emailed ? ' and emailed.' : ' in the portal.')
      );
    } catch {
      onFailed('Could not reach the server.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={modalOverlayClass}>
      <div className="bg-surface rounded-[--radius-card] shadow-overlay border border-line w-full max-w-lg overflow-hidden">
        <div className="bg-nib-brown-800 text-nib-gold-100 px-5 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-lg bg-nib-gold-500 text-nib-brown-900 flex items-center justify-center">
              <BellRing className="w-4 h-4" />
            </span>
            <div>
              <h3 className="font-bold text-[13px]">Send reminder</h3>
              <p className="text-[11px] text-nib-gold-200/80">
                {row.matterId} — {row.ownerName}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-nib-gold-200/70 hover:text-white p-1 rounded-lg"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <dl className="grid grid-cols-[7.5rem_1fr] gap-x-3 gap-y-1.5">
            <dt className="text-[12px] text-ink-3">Matter</dt>
            <dd className="text-[12px] text-ink">{row.title}</dd>
            <dt className="text-[12px] text-ink-3">Recipient</dt>
            <dd className="text-[12px] text-ink">
              {row.ownerName}, {row.ownerTitle}
            </dd>
            <dt className="text-[12px] text-ink-3">Standing</dt>
            <dd className="text-[12px] text-ink">
              {REMINDER_REASON_LABEL[row.reason]} · pending {row.pendingDays} day(s) · due{' '}
              {formatDate(row.deadline)}
            </dd>
            {row.reminderCount > 0 && (
              <>
                <dt className="text-[12px] text-ink-3">Last reminder</dt>
                <dd className="text-[12px] text-ink">
                  {formatDateTime(row.lastReminderAt!)}
                  {row.lastReminderBy ? ` by ${row.lastReminderBy}` : ''}
                </dd>
              </>
            )}
          </dl>

          <Field
            label="Note"
            hint="Optional — included in the notification and the email."
            htmlFor="reminder-note"
          >
            <textarea
              id="reminder-note"
              className={textareaClass}
              rows={3}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="e.g. The Board expects an implementation report before Friday's sitting."
            />
          </Field>

          <p className="text-[11px] text-ink-3">
            The reminder is recorded against this matter&rsquo;s audit trail. Another reminder to
            the same officer about the same matter cannot be sent for 24 hours.
          </p>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-line bg-surface-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={busy}
            onClick={send}
            icon={<Send className="w-3.5 h-3.5" />}
          >
            Send reminder
          </Button>
        </div>
      </div>
    </div>
  );
};
