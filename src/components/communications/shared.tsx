'use client';

import React from 'react';
import {
  AlertOctagon,
  AlertTriangle,
  CalendarClock,
  FileText,
  Landmark,
  Megaphone,
  MonitorCog,
  PartyPopper,
  ScrollText,
  Timer,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/components/ui/primitives';
import {
  ANNOUNCEMENT_TYPE_LABEL,
  type Announcement,
  type AnnouncementPriority,
  type AnnouncementType,
} from '@/lib/announcements';

/**
 * Presentation shared by the announcements view, the dashboard panel and the
 * detail dialog.
 *
 * One icon and one hue per announcement type, resolved in a single place — the
 * same discipline the status badges follow, so a meeting notice cannot be blue
 * on the dashboard and gold in the list.
 */

export const TYPE_ICON: Record<AnnouncementType, LucideIcon> = {
  GENERAL: Megaphone,
  MEETING: CalendarClock,
  TASK_REMINDER: Timer,
  NOTICE: AlertTriangle,
  BOARD_NOTICE: Landmark,
  POLICY: ScrollText,
  SYSTEM: MonitorCog,
  URGENT: AlertOctagon,
  EVENT: PartyPopper,
  OTHER: FileText,
};

const PRIORITY_CLASS: Record<AnnouncementPriority, string> = {
  Urgent: 'text-st-late bg-st-late-bg border-st-late/30',
  Important: 'text-st-review bg-st-review-bg border-st-review/25',
  Normal: 'text-st-neutral bg-st-neutral-bg border-st-neutral/25',
};

/** Priority, said in words as well as colour. */
export const AnnouncementPriorityBadge: React.FC<{
  priority: AnnouncementPriority;
  className?: string;
}> = ({ priority, className }) => (
  <span
    className={cn(
      'inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[11px] font-semibold',
      PRIORITY_CLASS[priority],
      className
    )}
  >
    {priority === 'Urgent' && <AlertOctagon className="w-3 h-3" />}
    {priority}
  </span>
);

export const AnnouncementTypeChip: React.FC<{
  type: AnnouncementType;
  className?: string;
}> = ({ type, className }) => {
  const Icon = TYPE_ICON[type];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[11px] font-medium',
        'bg-nib-gold-100 text-nib-brown-700 border-nib-gold-200',
        'dark:bg-nib-brown-700/25 dark:text-nib-gold-200 dark:border-nib-brown-600/40',
        className
      )}
    >
      <Icon className="w-3 h-3" />
      {ANNOUNCEMENT_TYPE_LABEL[type]}
    </span>
  );
};

/**
 * Where an announcement stands, from the author's point of view.
 *
 * Expiry is not a stored status — it is derived from the window on every read —
 * so it is rendered here rather than looked up in a status map.
 */
export const AnnouncementStatusBadge: React.FC<{ a: Announcement }> = ({ a }) => {
  const [label, tone] =
    a.status === 'CANCELLED'
      ? ['Withdrawn', 'text-st-neutral bg-st-neutral-bg border-st-neutral/25']
      : a.status === 'DRAFT'
        ? ['Draft', 'text-st-info bg-st-info-bg border-st-info/25']
        : a.isExpired
          ? ['Expired', 'text-st-neutral bg-st-neutral-bg border-st-neutral/25']
          : a.isLive
            ? ['Published', 'text-st-done bg-st-done-bg border-st-done/25']
            : ['Scheduled', 'text-st-wait bg-st-wait-bg border-st-wait/25'];

  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded-md border text-[11px] font-semibold whitespace-nowrap',
        tone
      )}
    >
      {label}
    </span>
  );
};

/** A date and time, or an em dash. Announcements carry a lot of optional dates. */
export const formatStamp = (iso?: string): string => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export const formatDay = (iso?: string): string => {
  if (!iso) return '—';
  const d = new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

/** How the audience reads to a person, rather than as a set of arrays. */
export const audienceLine = (a: Announcement): string => a.audienceSummary;

/** The meeting block, shown only for meeting announcements that carry details. */
export const MeetingDetailsCard: React.FC<{ a: Announcement }> = ({ a }) => {
  if (!a.meeting) return null;
  const { date, time, location, link, agenda, participants } = a.meeting;
  if (!date && !time && !location && !link && !agenda && participants.length === 0) return null;

  const rows: Array<[string, React.ReactNode]> = [];
  if (date) rows.push(['Date', formatDay(date)]);
  if (time) rows.push(['Time', time]);
  if (location) rows.push(['Location', location]);
  if (link)
    rows.push([
      'Meeting link',
      <a
        key="link"
        href={link}
        target="_blank"
        rel="noreferrer noopener"
        className="text-nib-gold-700 dark:text-nib-gold-300 hover:underline break-all"
      >
        {link}
      </a>,
    ]);
  if (participants.length) rows.push(['Participants', participants.join(', ')]);

  return (
    <div className="rounded-[--radius-card] border border-line bg-surface-2 p-3">
      <div className="flex items-center gap-1.5 mb-2">
        <CalendarClock className="w-3.5 h-3.5 text-nib-gold-600" />
        <h4 className="text-[12px] font-bold uppercase tracking-wide text-ink-3">
          Meeting details
        </h4>
        {a.isMeetingToday && (
          <span className="ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded bg-st-late-bg text-st-late border border-st-late/30">
            TODAY
          </span>
        )}
      </div>
      <dl className="grid grid-cols-[7rem_1fr] gap-x-3 gap-y-1.5">
        {rows.map(([label, value]) => (
          <React.Fragment key={label}>
            <dt className="text-[12px] text-ink-3">{label}</dt>
            <dd className="text-[12px] text-ink min-w-0">{value}</dd>
          </React.Fragment>
        ))}
      </dl>
      {agenda && (
        <div className="mt-2 pt-2 border-t border-line">
          <p className="text-[12px] text-ink-3 mb-1">Agenda</p>
          <p className="text-[12px] text-ink whitespace-pre-wrap leading-relaxed">{agenda}</p>
        </div>
      )}
    </div>
  );
};
