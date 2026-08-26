'use client';

import React, { useMemo } from 'react';
import { ArrowRight, Bell, CheckCircle2 } from 'lucide-react';
import { Button, Card, CardHeader, EmptyState, cn } from '@/components/ui/primitives';
import { useAuth, useAuthenticatedUser } from '@/context/AuthContext';
import { PERMISSIONS } from '@/lib/permissions';
import { sortForFeed, type Announcement } from '@/lib/announcements';
import { isOverdue } from '@/lib/matters';
import type { BODMatter } from '@/lib/types';
import type { ViewId } from '@/lib/navigation';
import { AnnouncementPriorityBadge, TYPE_ICON, formatDay, formatStamp } from '@/components/communications/shared';

interface Props {
  onOpenAnnouncement: (a: Announcement) => void;
  onSelectMatter: (m: BODMatter) => void;
  onNavigate: (v: ViewId) => void;
}

/**
 * Announcements & Reminders on the dashboard.
 *
 * Six bands, each of which is a question an officer actually opens the
 * dashboard to answer: what is urgent, what am I late on, what is important,
 * am I in a meeting today, what is coming, and what has been said lately.
 *
 * The whole section is drawn only for someone whose role carries the matching
 * permission — and each half independently, so a role granted the reminder
 * permissions but not the announcement ones gets the overdue band and nothing
 * else. Its data comes from what the API already scoped for this user, so
 * nothing here can surface a record the rest of the application would refuse.
 */
export const AnnouncementsPanel: React.FC<Props> = ({
  onOpenAnnouncement,
  onSelectMatter,
  onNavigate,
}) => {
  const { announcements, matters, can } = useAuth();
  const user = useAuthenticatedUser();

  const seesAnnouncements = can(PERMISSIONS.ANNOUNCEMENT_VIEW);
  const seesReminders = can(PERMISSIONS.TASK_REMINDER_VIEW);

  const urgent = useMemo(
    () => sortForFeed(announcements.filter((a) => a.priority === 'Urgent')),
    [announcements]
  );
  const important = useMemo(
    () => sortForFeed(announcements.filter((a) => a.priority === 'Important')),
    [announcements]
  );
  const meetingsToday = useMemo(
    () => announcements.filter((a) => a.isMeetingToday),
    [announcements]
  );
  const upcomingMeetings = useMemo(
    () =>
      announcements
        .filter((a) => a.isUpcomingMeeting)
        .sort((a, b) => (a.meeting?.date ?? '').localeCompare(b.meeting?.date ?? '')),
    [announcements]
  );
  const recent = useMemo(() => sortForFeed(announcements).slice(0, 5), [announcements]);
  const unread = announcements.filter((a) => !a.isRead).length;

  /**
   * The overdue band is the reminder half of this section.
   *
   * It is derived from the matters already loaded for this user rather than
   * fetched again: those have been through the same visibility rule the
   * reminder queue uses, so the two agree by construction. Matters the user
   * holds themselves come first — that is the reminder that is actually theirs
   * to act on.
   */
  const overdue = useMemo(
    () =>
      matters
        .filter(isOverdue)
        .sort(
          (a, b) =>
            Number(b.currentOwnerId === user.id) - Number(a.currentOwnerId === user.id) ||
            a.daysRemaining - b.daysRemaining
        )
        .slice(0, 5),
    [matters, user.id]
  );

  if (!seesAnnouncements && !seesReminders) return null;

  const nothingAtAll =
    (!seesAnnouncements || announcements.length === 0) &&
    (!seesReminders || overdue.length === 0);

  const Band: React.FC<{
    emoji: string;
    label: string;
    count: number;
    tone?: 'late' | 'review';
    children: React.ReactNode;
  }> = ({ emoji, label, count, tone, children }) => {
    if (count === 0) return null;
    return (
      <section className="px-4 py-3 border-b border-line last:border-b-0">
        <div className="flex items-center gap-2 mb-2">
          <span aria-hidden="true">{emoji}</span>
          <h3 className="text-[12px] font-bold uppercase tracking-wide text-ink-3">{label}</h3>
          <span
            className={cn(
              'text-[11px] font-bold tabular px-1.5 py-0.5 rounded',
              tone === 'late'
                ? 'bg-st-late/15 text-st-late'
                : tone === 'review'
                  ? 'bg-st-review/15 text-st-review'
                  : 'bg-surface-3 text-ink-2'
            )}
          >
            {count}
          </span>
        </div>
        <ul className="space-y-1">{children}</ul>
      </section>
    );
  };

  const announcementRow = (a: Announcement) => {
    const Icon = TYPE_ICON[a.type];
    return (
      <li key={a.id}>
        <button
          onClick={() => onOpenAnnouncement(a)}
          className={cn(
            'w-full text-left rounded-md px-2 py-1.5 hover:bg-surface-2 transition-colors group',
            !a.isRead && 'bg-nib-gold-100/30 dark:bg-nib-brown-900/25'
          )}
        >
          <span className="flex items-center gap-2 min-w-0">
            <Icon className="w-3.5 h-3.5 text-ink-3 shrink-0" />
            <span
              className={cn(
                'text-[12px] text-ink truncate flex-1 group-hover:text-nib-gold-700 dark:group-hover:text-nib-gold-300',
                a.isRead ? 'font-medium' : 'font-bold'
              )}
            >
              {a.title}
            </span>
            {a.priority !== 'Normal' && <AnnouncementPriorityBadge priority={a.priority} />}
          </span>
          <span className="block text-[11px] text-ink-3 truncate mt-0.5 pl-5.5 tabular">
            {a.meeting?.date
              ? `${formatDay(a.meeting.date)}${a.meeting.time ? ` · ${a.meeting.time}` : ''}${a.meeting.location ? ` · ${a.meeting.location}` : ''}`
              : `${a.createdByName} · ${formatStamp(a.publishAt || a.createdAt)}`}
          </span>
        </button>
      </li>
    );
  };

  return (
    <Card className="mb-5 overflow-hidden">
      <CardHeader
        title="Announcements & Reminders"
        description={
          seesAnnouncements
            ? `${unread} unread · what needs your attention right now.`
            : 'Board matters in your scope that are past their deadline.'
        }
        icon={<Bell className="w-4 h-4" />}
        action={
          <div className="flex items-center gap-1">
            {seesReminders && (
              <Button size="sm" variant="ghost" onClick={() => onNavigate('task-reminders')}>
                Reminders
                <ArrowRight className="w-3 h-3" />
              </Button>
            )}
            {seesAnnouncements && (
              <Button size="sm" variant="ghost" onClick={() => onNavigate('announcements')}>
                All
                <ArrowRight className="w-3 h-3" />
              </Button>
            )}
          </div>
        }
      />

      {nothingAtAll ? (
        <EmptyState
          icon={<CheckCircle2 className="w-5 h-5" />}
          title="Nothing outstanding"
          message="No urgent notices, no meetings today, and nothing in your scope is overdue."
        />
      ) : (
        <div>
          {seesAnnouncements && (
            <Band emoji="🔴" label="Urgent announcements" count={urgent.length} tone="late">
              {urgent.slice(0, 4).map(announcementRow)}
            </Band>
          )}

          {seesReminders && (
            <Band emoji="⚠️" label="Overdue task reminders" count={overdue.length} tone="late">
              {overdue.map((m) => (
                <li key={m.id}>
                  <button
                    onClick={() => onSelectMatter(m)}
                    className="w-full text-left rounded-md px-2 py-1.5 hover:bg-surface-2 transition-colors group"
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <span className="text-[12px] font-bold text-ink tabular shrink-0">{m.id}</span>
                      <span className="text-[12px] text-ink-2 truncate flex-1 group-hover:text-nib-gold-700 dark:group-hover:text-nib-gold-300">
                        {m.title}
                      </span>
                      <span className="text-[11px] font-semibold text-st-late tabular shrink-0">
                        {Math.abs(m.daysRemaining)}d late
                      </span>
                    </span>
                    <span className="block text-[11px] text-ink-3 truncate mt-0.5">
                      {m.currentOwnerId === user.id
                        ? 'Held by you'
                        : `${m.currentOwnerName} · ${m.currentOwnerTitle}`}
                    </span>
                  </button>
                </li>
              ))}
            </Band>
          )}

          {seesAnnouncements && (
            <>
              <Band
                emoji="📌"
                label="Important announcements"
                count={important.length}
                tone="review"
              >
                {important.slice(0, 4).map(announcementRow)}
              </Band>

              <Band emoji="📅" label="Meetings today" count={meetingsToday.length} tone="late">
                {meetingsToday.map(announcementRow)}
              </Band>

              <Band emoji="📅" label="Upcoming meetings" count={upcomingMeetings.length}>
                {upcomingMeetings.slice(0, 4).map(announcementRow)}
              </Band>

              <Band emoji="🔔" label="Recent announcements" count={recent.length}>
                {recent.map(announcementRow)}
              </Band>
            </>
          )}
        </div>
      )}
    </Card>
  );
};
