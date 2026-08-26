'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CalendarClock,
  CheckCircle2,
  Megaphone,
  Pencil,
  Plus,
  RefreshCw,
  Send,
  Trash2,
} from 'lucide-react';
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  PageHeader,
  Tabs,
  cn,
  inputClass,
  selectClass,
} from '@/components/ui/primitives';
import { useAuth } from '@/context/AuthContext';
import { PERMISSIONS } from '@/lib/permissions';
import {
  ANNOUNCEMENT_TYPES,
  ANNOUNCEMENT_TYPE_LABEL,
  sortForFeed,
  type Announcement,
  type AnnouncementType,
} from '@/lib/announcements';
import { navItem } from '@/lib/navigation';
import { AnnouncementDetail } from './AnnouncementDetail';
import { AnnouncementFormModal } from './AnnouncementFormModal';
import {
  AnnouncementPriorityBadge,
  AnnouncementStatusBadge,
  AnnouncementTypeChip,
  TYPE_ICON,
  formatDay,
  formatStamp,
} from './shared';

interface Props {
  onOpenMatter?: (matterId: string) => void;
}

/**
 * Announcements, from both sides.
 *
 * "Addressed to me" is the feed the API already scopes to this reader's
 * audience. "Managed" is the authoring list, and it only appears for someone
 * whose role carries an authoring permission — the API returns 403 for anyone
 * else, so the tab would be an empty promise.
 */
export const AnnouncementsView: React.FC<Props> = ({ onOpenMatter }) => {
  const { announcements, refreshAnnouncements, markAnnouncementRead, can } = useAuth();
  const item = navItem('announcements')!;

  const canCreate = can(PERMISSIONS.ANNOUNCEMENT_CREATE);
  const canEdit = can(PERMISSIONS.ANNOUNCEMENT_EDIT);
  const canPublish = can(PERMISSIONS.ANNOUNCEMENT_PUBLISH);
  const canDelete = can(PERMISSIONS.ANNOUNCEMENT_DELETE);
  const canManage = canCreate || canEdit || canPublish || canDelete;

  const [tab, setTab] = useState<'inbox' | 'managed'>('inbox');
  const [managed, setManaged] = useState<Announcement[]>([]);
  const [managedState, setManagedState] = useState<'idle' | 'loading' | 'error'>('idle');

  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'ALL' | AnnouncementType>('ALL');

  const [open, setOpen] = useState<Announcement | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Announcement | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadManaged = useCallback(async () => {
    if (!canManage) return;
    setManagedState('loading');
    try {
      const res = await fetch('/api/announcements?scope=manage');
      if (!res.ok) {
        setManagedState('error');
        return;
      }
      setManaged(await res.json());
      setManagedState('idle');
    } catch {
      setManagedState('error');
    }
  }, [canManage]);

  useEffect(() => {
    if (tab === 'managed') void loadManaged();
  }, [tab, loadManaged]);

  const source = tab === 'inbox' ? announcements : managed;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = source.filter((a) => {
      if (typeFilter !== 'ALL' && a.type !== typeFilter) return false;
      if (!q) return true;
      return [a.title, a.message, a.reference ?? '', a.createdByName].some((f) =>
        f.toLowerCase().includes(q)
      );
    });
    return tab === 'inbox' ? sortForFeed(rows) : rows;
  }, [source, query, typeFilter, tab]);

  const unread = announcements.filter((a) => !a.isRead).length;

  const openAnnouncement = (a: Announcement) => {
    setOpen(a);
    // Reading it is what settles both the receipt and the bell entry. Only a
    // genuine recipient leaves a receipt, so the management list does not.
    if (tab === 'inbox' && !a.isRead) void markAnnouncementRead(a.id);
  };

  const publish = async (a: Announcement) => {
    setBusyId(a.id);
    setNotice(null);
    try {
      const res = await fetch(`/api/announcements/${a.id}/publish`, { method: 'POST' });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNotice(payload.error ?? 'The announcement could not be published.');
        return;
      }
      setNotice(
        `Published to ${payload.recipients} recipient(s)` +
          (payload.emailed ? `, ${payload.emailed} emailed.` : '.')
      );
      await Promise.all([loadManaged(), refreshAnnouncements()]);
    } finally {
      setBusyId(null);
    }
  };

  const withdraw = async (a: Announcement) => {
    const question =
      a.status === 'PUBLISHED'
        ? `Withdraw "${a.title}"? It leaves every recipient's feed, and the record of it stays in the audit trail.`
        : `Delete the draft "${a.title}"? This cannot be undone.`;
    if (!window.confirm(question)) return;

    setBusyId(a.id);
    setNotice(null);
    try {
      const res = await fetch(`/api/announcements/${a.id}`, { method: 'DELETE' });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNotice(payload.error ?? 'The announcement could not be withdrawn.');
        return;
      }
      setOpen(null);
      await Promise.all([loadManaged(), refreshAnnouncements()]);
    } finally {
      setBusyId(null);
    }
  };

  const compose = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const amend = (a: Announcement) => {
    setEditing(a);
    setFormOpen(true);
  };

  const row = (a: Announcement) => {
    const Icon = TYPE_ICON[a.type];
    const unopened = tab === 'inbox' && !a.isRead;

    return (
      <li key={a.id}>
        <div
          className={cn(
            'w-full flex items-start gap-3 px-4 py-3 border-l-2 transition-colors',
            a.priority === 'Urgent'
              ? 'border-l-st-late'
              : a.priority === 'Important'
                ? 'border-l-st-review'
                : 'border-l-transparent',
            unopened ? 'bg-nib-gold-100/30 dark:bg-nib-brown-900/25' : ''
          )}
        >
          <button
            onClick={() => openAnnouncement(a)}
            className="flex items-start gap-3 min-w-0 flex-1 text-left group"
          >
            <span
              className={cn(
                'w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5',
                a.priority === 'Urgent'
                  ? 'bg-st-late-bg text-st-late'
                  : 'bg-surface-2 text-ink-3'
              )}
            >
              <Icon className="w-4 h-4" />
            </span>

            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5 flex-wrap">
                {unopened && <span className="w-1.5 h-1.5 rounded-full bg-nib-gold-600 shrink-0" />}
                <span
                  className={cn(
                    'text-[13px] text-ink leading-snug group-hover:text-nib-gold-700 dark:group-hover:text-nib-gold-300 transition-colors',
                    unopened ? 'font-bold' : 'font-semibold'
                  )}
                >
                  {a.title}
                </span>
              </span>

              <span className="block text-[12px] text-ink-2 line-clamp-2 mt-0.5">{a.message}</span>

              <span className="flex flex-wrap items-center gap-1.5 mt-1.5">
                <AnnouncementTypeChip type={a.type} />
                <AnnouncementPriorityBadge priority={a.priority} />
                {tab === 'managed' && <AnnouncementStatusBadge a={a} />}
                {a.isMeetingToday && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-st-late">
                    <CalendarClock className="w-3 h-3" /> Meeting today
                  </span>
                )}
                {!a.isMeetingToday && a.isUpcomingMeeting && a.meeting?.date && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-st-review">
                    <CalendarClock className="w-3 h-3" /> {formatDay(a.meeting.date)}
                  </span>
                )}
              </span>

              <span className="block text-[11px] text-ink-3 mt-1 tabular">
                {a.createdByName} · {formatStamp(a.publishAt || a.createdAt)}
                {tab === 'managed' && ` · ${a.audienceSummary}`}
                {tab === 'managed' && typeof a.readCount === 'number'
                  ? ` · read by ${a.readCount}/${a.recipientCount}`
                  : ''}
              </span>
            </span>
          </button>

          {tab === 'managed' && (
            <div className="flex items-center gap-1 shrink-0">
              {canPublish && a.status === 'DRAFT' && (
                <Button
                  size="sm"
                  variant="primary"
                  loading={busyId === a.id}
                  disabled={busyId !== null}
                  onClick={() => publish(a)}
                  icon={<Send className="w-3 h-3" />}
                >
                  Publish
                </Button>
              )}
              {canEdit && a.status !== 'CANCELLED' && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => amend(a)}
                  aria-label={`Amend ${a.title}`}
                  icon={<Pencil className="w-3.5 h-3.5" />}
                />
              )}
              {canDelete && a.status !== 'CANCELLED' && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-st-late hover:bg-st-late-bg"
                  disabled={busyId !== null}
                  onClick={() => withdraw(a)}
                  aria-label={`Withdraw ${a.title}`}
                  icon={<Trash2 className="w-3.5 h-3.5" />}
                />
              )}
            </div>
          )}
        </div>
      </li>
    );
  };

  return (
    <div>
      <PageHeader
        title={item.title}
        description={item.description}
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              icon={<RefreshCw className="w-3.5 h-3.5" />}
              onClick={() => {
                void refreshAnnouncements();
                void loadManaged();
              }}
            >
              Refresh
            </Button>
            {canCreate && (
              <Button variant="primary" icon={<Plus className="w-3.5 h-3.5" />} onClick={compose}>
                New announcement
              </Button>
            )}
          </div>
        }
      />

      {notice && (
        <div className="mb-4 flex items-start gap-2 rounded-[--radius-control] border border-line bg-surface-2 px-3 py-2">
          <CheckCircle2 className="w-4 h-4 text-st-done shrink-0 mt-0.5" />
          <p className="text-[12px] text-ink-2">{notice}</p>
        </div>
      )}

      <Card className="overflow-hidden">
        <div className="px-4 pt-2">
          <Tabs
            items={[
              { id: 'inbox', label: 'Addressed to me', count: announcements.length },
              ...(canManage
                ? [{ id: 'managed', label: 'Managed', count: managed.length }]
                : []),
            ]}
            active={tab}
            onChange={(id) => setTab(id as 'inbox' | 'managed')}
          />
        </div>

        <div className="flex flex-col sm:flex-row gap-2 px-4 py-3 border-b border-line">
          <input
            className={cn(inputClass, 'h-8 text-[12px] flex-1')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search announcements…"
            aria-label="Search announcements"
          />
          <select
            className={cn(selectClass, 'h-8 text-[12px] sm:w-64')}
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as 'ALL' | AnnouncementType)}
            aria-label="Filter by type"
          >
            <option value="ALL">All types</option>
            {ANNOUNCEMENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {ANNOUNCEMENT_TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </div>

        {tab === 'managed' && managedState === 'error' ? (
          <ErrorState
            title="Unable to load the announcement register"
            onRetry={() => void loadManaged()}
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<Megaphone className="w-5 h-5" />}
            title={tab === 'inbox' ? 'No announcements' : 'Nothing drafted yet'}
            message={
              tab === 'inbox'
                ? 'Nothing has been addressed to you, or everything has expired.'
                : 'Announcements you compose will be listed here before and after they go out.'
            }
            action={
              tab === 'managed' && canCreate ? (
                <Button variant="primary" onClick={compose} icon={<Plus className="w-3.5 h-3.5" />}>
                  New announcement
                </Button>
              ) : undefined
            }
          />
        ) : (
          <ul className="divide-y divide-line">{filtered.map(row)}</ul>
        )}
      </Card>

      {unread > 0 && tab === 'inbox' && (
        <p className="mt-2 text-[11px] text-ink-3">
          {unread} unread. Opening an announcement records that you have read it.
        </p>
      )}

      <AnnouncementDetail
        announcement={open}
        onClose={() => setOpen(null)}
        onOpenMatter={onOpenMatter}
        actions={
          open && tab === 'managed' ? (
            <>
              {canEdit && open.status !== 'CANCELLED' && (
                <Button
                  variant="secondary"
                  icon={<Pencil className="w-3.5 h-3.5" />}
                  onClick={() => {
                    setOpen(null);
                    amend(open);
                  }}
                >
                  Amend
                </Button>
              )}
              {canPublish && open.status === 'DRAFT' && (
                <Button
                  variant="primary"
                  icon={<Send className="w-3.5 h-3.5" />}
                  loading={busyId === open.id}
                  onClick={() => publish(open)}
                >
                  Publish
                </Button>
              )}
            </>
          ) : undefined
        }
      />

      <AnnouncementFormModal
        isOpen={formOpen}
        editing={editing}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
        onSaved={() => {
          void loadManaged();
          void refreshAnnouncements();
          setTab('managed');
        }}
      />
    </div>
  );
};
