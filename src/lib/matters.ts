import { BODMatter, User } from './types';
import { ViewId } from './navigation';

/** Matters still in play — closed records drop out of every work queue. */
export const isOpen = (m: BODMatter) => m.status !== 'Closed';

/** Waiting on this user to do something before it can move on. */
export const awaitsAction = (m: BODMatter, user: User) =>
  isOpen(m) && m.currentOwnerId === user.id && m.status !== 'In Progress';

/** Routed here but ownership not yet accepted. */
export const isIncoming = (m: BODMatter, user: User) =>
  isOpen(m) &&
  m.currentOwnerId === user.id &&
  ['Received', 'Under Review', 'Assigned'].includes(m.status);

export const isOverdue = (m: BODMatter) => isOpen(m) && m.isOverdue;

export const isDueSoon = (m: BODMatter) =>
  isOpen(m) && !m.isOverdue && m.daysRemaining <= 7;

/**
 * Rows for a given navigation view.
 *
 * Every view is a projection of the matters the API already returned for this
 * user, so no view can widen what the caller is entitled to see.
 */
export function mattersForView(view: ViewId, matters: BODMatter[], user: User): BODMatter[] {
  switch (view) {
    case 'decisions':
      // Board Decisions acts as the Master Register across all matter types
      return matters;
    case 'directives':
      return matters.filter((m) => m.matterType === 'Directive');
    case 'resolutions':
      return matters.filter((m) => m.matterType === 'Resolution');
    case 'incoming':
      return matters.filter((m) => isIncoming(m, user));
    case 'archive':
      return matters.filter((m) => m.status === 'Closed');
    case 'my-tasks':
      return matters.filter((m) => isOpen(m) && m.currentOwnerId === user.id);
    case 'pending-actions':
      return matters.filter((m) => awaitsAction(m, user));
    case 'overdue':
      return matters.filter(isOverdue);
    case 'implementation':
      return matters.filter(
        (m) => m.status !== 'Received' && m.status !== 'Under Review'
      );
    default:
      return matters;
  }
}

export function navCounts(matters: BODMatter[], user: User) {
  return {
    incoming: matters.filter((m) => isIncoming(m, user)).length,
    myTasks: matters.filter((m) => isOpen(m) && m.currentOwnerId === user.id).length,
    overdue: matters.filter(isOverdue).length,
    pendingActions: matters.filter((m) => awaitsAction(m, user)).length,
    decisions: matters.length,
    closed: matters.filter((m) => m.status === 'Closed').length,
  };
}

/* ────────────────────────────────────────────────────────── aging */

export type AgingBucket = '1–3 days' | '4–7 days' | '8–14 days' | '15+ days';

export const AGING_BUCKETS: AgingBucket[] = ['1–3 days', '4–7 days', '8–14 days', '15+ days'];

/** How far past its deadline a matter is, bucketed for the overdue view. */
export function overdueBucket(m: BODMatter): AgingBucket {
  const late = Math.abs(m.daysRemaining);
  if (late <= 3) return '1–3 days';
  if (late <= 7) return '4–7 days';
  if (late <= 14) return '8–14 days';
  return '15+ days';
}

/** Calendar days since the Board issued the matter. */
export function daysOpen(m: BODMatter): number {
  const created = new Date(m.createdAt).getTime();
  return Math.max(0, Math.floor((Date.now() - created) / 86_400_000));
}

/* ────────────────────────────────────────────────── workflow stages */

/**
 * The operational pipeline. Stage membership is derived from where a matter
 * actually sits — its owner's role and its status — rather than from a stored
 * stage field, so the pipeline cannot disagree with the record.
 */
export const PIPELINE_STAGES = [
  { id: 'secretariat', label: 'Board Secretariat', match: (m: BODMatter) => m.currentOwnerRole === 'BOARD_SECRETARIAT' && m.status !== 'Closed' },
  { id: 'ceo', label: 'CEO / CEO Secretariat', match: (m: BODMatter) => (m.currentOwnerRole === 'CEO' || m.currentOwnerRole === 'CEO_SECRETARIAT') && m.status !== 'Closed' },
  { id: 'chief', label: 'Chief / Executive', match: (m: BODMatter) => m.currentOwnerRole === 'CHIEF' && m.status !== 'Closed' },
  { id: 'deputy', label: 'Deputy Chief', match: (m: BODMatter) => m.currentOwnerRole === 'DEPUTY_CHIEF' && m.status !== 'Closed' },
  { id: 'director', label: 'Director', match: (m: BODMatter) => m.currentOwnerRole === 'DIRECTOR' && m.status !== 'Closed' },
  { id: 'implementation', label: 'Implementation Review', match: (m: BODMatter) => m.status === 'Implementation Submitted' || m.status === 'Under Review / Confirmation' },
  { id: 'closed', label: 'Closed / Reported', match: (m: BODMatter) => m.status === 'Closed' },
] as const;

export interface StageSummary {
  id: string;
  label: string;
  count: number;
  overdue: number;
  averageAge: number;
}

export function pipelineSummary(matters: BODMatter[]): StageSummary[] {
  return PIPELINE_STAGES.map((stage) => {
    const inStage = matters.filter(stage.match);
    const ages = inStage.map(daysOpen);
    return {
      id: stage.id,
      label: stage.label,
      count: inStage.length,
      overdue: inStage.filter(isOverdue).length,
      averageAge: ages.length ? Math.round(ages.reduce((a, b) => a + b, 0) / ages.length) : 0,
    };
  });
}

/* ─────────────────────────────────────────────────────── searching */

export function matchesQuery(m: BODMatter, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [
    m.id,
    m.resolutionNumber,
    m.title,
    m.description,
    m.matterType,
    m.status,
    m.priority,
    m.businessArea,
    m.currentOwnerName,
    m.responsibleDirectorName,
    m.responsibleChiefName,
    m.responsibleDeputyChiefName,
  ]
    .filter(Boolean)
    .some((f) => String(f).toLowerCase().includes(q));
}

export const formatDate = (iso: string): string => {
  if (!iso) return '—';
  const d = new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

export const formatDateTime = (iso: string): string => {
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

export const ROLE_LABEL: Record<string, string> = {
  BOARD_SECRETARIAT: 'Board Secretariat',
  BOARD_MEMBER: 'Board Member',
  CEO: 'Chief Executive Officer',
  CEO_SECRETARIAT: 'CEO Secretariat',
  CHIEF: 'Chief Officer',
  DEPUTY_CHIEF: 'Deputy Chief',
  DIRECTOR: 'Director',
  ADMIN: 'Administrator',
};
