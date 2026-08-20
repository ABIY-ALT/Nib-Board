'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle,
  Database,
  Info,
  KeyRound,
  Lock,
  Mail,
  Plus,
  RefreshCw,
  Send,
  Server,
  ShieldCheck,
  Trash2,
  UserCheck,
  UserCog,
  UserPlus,
  UserX,
  Users as UsersIcon,
  X,
} from 'lucide-react';
import { useAuth, useAuthenticatedUser } from '@/context/AuthContext';
import {
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  Field,
  PageHeader,
  StatusBadge,
  TableSkeleton,
  cn,
  inputClass,
} from '@/components/ui/primitives';
import { Column, DataTable, FilterBar } from '@/components/ui/DataTable';
import { AuditLogEntry, BODMatter, User } from '@/lib/types';
import { USER_ADMIN_ROLES } from '@/lib/users';
import { UserFormModal } from '@/components/admin/UserFormModal';
import { RolesMatrix } from '@/components/admin/RolesMatrix';

/** A directory row as the administration screen sees it: with its account state. */
type AdminUser = User & { isActive: boolean };
import { navItem } from '@/lib/navigation';
import { ROLE_LABEL, formatDateTime, matchesQuery } from '@/lib/matters';

/* ─────────────────────────────────────────────────── Users & Roles */

const ROLE_TONE: Record<string, string> = {
  BOARD_SECRETARIAT: 'bg-nib-gold-100 text-nib-brown-800 border-nib-gold-200 dark:bg-nib-brown-700/30 dark:text-nib-gold-200 dark:border-nib-brown-600/40',
  BOARD_MEMBER: 'bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950/40 dark:text-amber-200 dark:border-amber-700',
  CEO: 'bg-st-wait-bg text-st-wait border-st-wait/25',
  CHIEF: 'bg-st-info-bg text-st-info border-st-info/25',
  DEPUTY_CHIEF: 'bg-st-active-bg text-st-active border-st-active/25',
  DIRECTOR: 'bg-st-done-bg text-st-done border-st-done/25',
  ADMIN: 'bg-st-neutral-bg text-st-neutral border-st-neutral/25',
};

export const UsersView: React.FC = () => {
  const { allUsers, matters, refreshUsers } = useAuth();
  const viewer = useAuthenticatedUser();
  const item = navItem('users')!;

  const canAdminister = USER_ADMIN_ROLES.includes(viewer.role);

  const [query, setQuery] = useState('');
  const [role, setRole] = useState('ALL');

  /**
   * Administrators see deactivated accounts too — they are the only people who
   * can bring one back, so they are the only people who need to see one. Every
   * other viewer gets the same active roster the rest of the app works from.
   */
  const [roster, setRoster] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(canAdminister);
  const [failed, setFailed] = useState(false);

  const loadRoster = React.useCallback(async () => {
    if (!canAdminister) return;
    setLoading(true);
    setFailed(false);
    try {
      const res = await fetch('/api/users?scope=all');
      if (!res.ok) throw new Error();
      setRoster(await res.json());
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [canAdminister]);

  useEffect(() => {
    void loadRoster();
  }, [loadRoster]);

  const officers: AdminUser[] = canAdminister
    ? roster
    : allUsers.map((u) => ({ ...u, isActive: true }));

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [emailSent, setEmailSent] = useState<{ name: string; email: string } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  /** Applies a PATCH and folds the result back into both rosters. */
  const amend = async (target: AdminUser, body: Record<string, unknown>, label: string) => {
    setPendingId(target.id);
    setActionError(null);
    try {
      const res = await fetch(`/api/users/${target.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        setActionError(payload.error ?? `Could not ${label}.`);
        return;
      }
      if (payload.emailSent) {
        setEmailSent({ name: target.name, email: target.email });
      }
      await Promise.all([loadRoster(), refreshUsers()]);
    } catch {
      setActionError('Could not reach the server.');
    } finally {
      setPendingId(null);
    }
  };

  const rows = useMemo(
    () =>
      officers.filter(
        (u) =>
          (role === 'ALL' || u.role === role) &&
          (!query.trim() ||
            [u.name, u.email, u.title, u.businessArea, u.department]
              .filter(Boolean)
              .some((f) => String(f).toLowerCase().includes(query.trim().toLowerCase())))
      ),
    [officers, query, role]
  );

  /** Live workload, so the directory shows who is actually carrying matters. */
  const workload = useMemo(() => {
    const map = new Map<string, number>();
    matters.forEach((m) => {
      if (m.status !== 'Closed') map.set(m.currentOwnerId, (map.get(m.currentOwnerId) ?? 0) + 1);
    });
    return map;
  }, [matters]);

  const columns: Array<Column<AdminUser>> = [
    {
      key: 'user',
      header: 'Officer',
      sortValue: (u) => u.name,
      render: (u) => (
        <div className="flex items-center gap-2.5 min-w-0">
          <span
            className={cn(
              'w-8 h-8 rounded-full text-[11px] font-bold flex items-center justify-center shrink-0',
              u.isActive
                ? 'bg-nib-brown-700 text-nib-gold-200'
                : 'bg-surface-3 text-ink-3'
            )}
          >
            {u.name.split(' ').map((p) => p[0]).slice(0, 2).join('')}
          </span>
          <div className="min-w-0">
            <div className="font-medium text-ink truncate flex items-center gap-1.5">
              {u.name}
              {!u.isActive && (
                <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-3 border border-line rounded px-1 py-px">
                  Deactivated
                </span>
              )}
            </div>
            <div className="text-[11px] text-ink-3 truncate">{u.email}</div>
          </div>
        </div>
      ),
    },
    {
      key: 'role',
      header: 'Role',
      sortValue: (u) => u.role,
      render: (u) => (
        <span
          className={cn(
            'inline-flex items-center px-2 py-0.5 rounded-md border text-[11px] font-semibold whitespace-nowrap',
            ROLE_TONE[u.role] ?? ROLE_TONE.ADMIN
          )}
        >
          {ROLE_LABEL[u.role] ?? u.role}
        </span>
      ),
    },
    {
      key: 'title',
      header: 'Position',
      sortValue: (u) => u.title,
      secondary: true,
      className: 'text-ink-2 max-w-[16rem]',
      render: (u) => <span className="line-clamp-1">{u.title}</span>,
    },
    {
      key: 'area',
      header: 'Business Area',
      sortValue: (u) => u.businessArea,
      secondary: true,
      className: 'text-ink-2',
      render: (u) => u.businessArea,
    },
    {
      key: 'load',
      header: 'Open Matters',
      sortValue: (u) => workload.get(u.id) ?? 0,
      className: 'tabular',
      render: (u) => {
        const n = workload.get(u.id) ?? 0;
        return n > 0 ? (
          <span className="font-semibold text-ink">{n}</span>
        ) : (
          <span className="text-ink-3">—</span>
        );
      },
    },
  ];

  if (canAdminister) {
    columns.push({
      key: 'actions',
      header: '',
      render: (u) => (
        <div className="flex items-center justify-end gap-1.5">
          <Button
            size="sm"
            variant="ghost"
            disabled={pendingId === u.id}
            onClick={() => {
              setEditing(u);
              setFormOpen(true);
            }}
            icon={<UserCog className="w-3.5 h-3.5" />}
          >
            Edit
          </Button>
          <Button
            size="sm"
            variant="ghost"
            loading={pendingId === u.id}
            onClick={() => void amend(u, { resetPassword: true }, 'send a password reset email')}
            icon={<Mail className="w-3.5 h-3.5" />}
          >
            Reset
          </Button>
          {u.id !== viewer.id &&
            (u.isActive ? (
              <Button
                size="sm"
                variant="danger"
                loading={pendingId === u.id}
                onClick={() => void amend(u, { isActive: false }, 'deactivate the account')}
                icon={<UserX className="w-3.5 h-3.5" />}
              >
                Deactivate
              </Button>
            ) : (
              <Button
                size="sm"
                variant="secondary"
                loading={pendingId === u.id}
                onClick={() => void amend(u, { isActive: true }, 'reactivate the account')}
                icon={<UserCheck className="w-3.5 h-3.5" />}
              >
                Reactivate
              </Button>
            ))}
        </div>
      ),
    });
  }

  return (
    <div>
      <PageHeader
        title={item.title}
        description={item.description}
        actions={
          canAdminister ? (
            <Button
              variant="primary"
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
              icon={<UserPlus className="w-3.5 h-3.5" />}
            >
              Add officer
            </Button>
          ) : undefined
        }
      />

      {emailSent && (
        <Card className="mb-4 border-l-[3px] border-l-st-done">
          <div className="flex items-start gap-2.5 p-3">
            <Mail className="w-4 h-4 text-st-done shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <p className="text-[12px] text-ink-2 leading-relaxed">
                A setup email has been sent to <strong>{emailSent.name}</strong> at{' '}
                <code className="text-[11px] bg-surface-2 border border-line rounded px-1 py-px">
                  {emailSent.email}
                </code>.
                They must click the link to set their password. The link is valid for 24 hours.
              </p>
            </div>
            <button
              onClick={() => setEmailSent(null)}
              aria-label="Dismiss"
              className="text-ink-3 hover:text-ink p-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </Card>
      )}

      {actionError && (
        <Card className="mb-4 border-l-[3px] border-l-st-late">
          <div className="flex items-start gap-2.5 p-3">
            <Info className="w-4 h-4 text-st-late shrink-0 mt-0.5" />
            <p className="text-[12px] text-ink-2">{actionError}</p>
          </div>
        </Card>
      )}

      {!canAdminister && (
        <Card className="mb-4 border-l-[3px] border-l-st-info">
          <div className="flex items-start gap-2.5 p-3">
            <Info className="w-4 h-4 text-st-info shrink-0 mt-0.5" />
            <p className="text-[12px] text-ink-2 leading-relaxed">
              This directory is read-only for your role. Provisioning, amending and deactivating
              officer accounts is restricted to an administrator or the Board Secretariat.
            </p>
          </div>
        </Card>
      )}

      <Card className="overflow-hidden">
        <FilterBar
          search={query}
          onSearch={setQuery}
          searchPlaceholder="Search officers…"
          onReset={() => {
            setQuery('');
            setRole('ALL');
          }}
          filters={[
            {
              id: 'role',
              label: 'Role',
              value: role,
              onChange: setRole,
              options: [
                { value: 'ALL', label: 'All roles' },
                ...Object.entries(ROLE_LABEL).map(([v, l]) => ({ value: v, label: l })),
              ],
            },
          ]}
        />
        {loading ? (
          <TableSkeleton rows={6} cols={5} />
        ) : failed ? (
          <ErrorState
            title="Unable to load the officer directory"
            message="We couldn't retrieve the roster."
            onRetry={() => void loadRoster()}
          />
        ) : (
          <DataTable
            columns={columns}
            rows={rows}
            rowKey={(u) => u.id}
            empty={<EmptyState icon={<UsersIcon className="w-5 h-5" />} title="No officers match" />}
          />
        )}
      </Card>

      <UserFormModal
        isOpen={formOpen}
        onClose={() => setFormOpen(false)}
        editing={editing}
        onSaved={async (result) => {
          if (result.emailSent) {
            setEmailSent({ name: result.user.name, email: result.user.email });
          }
          await Promise.all([loadRoster(), refreshUsers()]);
        }}
      />
    </div>
  );
};


export const SettingsView: React.FC = () => {
  const { matterTypes, addMatterType, removeMatterType, matters } = useAuth();
  const user = useAuthenticatedUser();
  const item = navItem('settings')!;
  
  // Matter Types State
  const [newType, setNewType] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingType, setDeletingType] = useState<string | null>(null);

  const canConfigure = user.role === 'BOARD_SECRETARIAT' || user.role === 'ADMIN';

  const usage = useMemo(() => {
    const map = new Map<string, number>();
    matters.forEach((m) => map.set(m.matterType, (map.get(m.matterType) ?? 0) + 1));
    return map;
  }, [matters]);

  const submitNewType = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newType.trim();
    if (!name) return;
    setBusy(true);
    setError(null);
    try {
      await addMatterType(name);
      setNewType('');
    } catch {
      setError('Could not add the matter type.');
    } finally {
      setBusy(false);
    }
  };

  const handleRemoveType = async (typeName: string) => {
    const count = usage.get(typeName) ?? 0;
    const confirmMsg = count > 0
      ? `"${typeName}" is in use by ${count} matter(s). Retiring it will prevent new matters from choosing it while preserving existing records. Proceed?`
      : `Are you sure you want to remove matter type "${typeName}"?`;

    if (!window.confirm(confirmMsg)) return;

    setDeletingType(typeName);
    setError(null);
    try {
      const res = await removeMatterType(typeName);
      if (!res.success) {
        setError(res.error || 'Could not remove matter type.');
      }
    } finally {
      setDeletingType(null);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader title={item.title} description={item.description} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Card 1: Matter Types Management */}
        <Card>
          <CardHeader
            title="Matter Classifications"
            description="Official categorization applied to every Board direction."
            icon={<ShieldCheck className="w-4 h-4" />}
          />
          <ul className="divide-y divide-line max-h-[22rem] overflow-y-auto">
            {matterTypes.map((t) => {
              const inUseCount = usage.get(t) ?? 0;
              return (
                <li key={t} className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-surface-2/40 transition">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[13px] text-ink font-medium truncate">{t}</span>
                    {inUseCount > 0 ? (
                      <span className="text-[11px] text-ink-3 tabular shrink-0 bg-surface-2 border border-line px-1.5 py-0.5 rounded">
                        {inUseCount} in use
                      </span>
                    ) : (
                      <span className="text-[10px] text-ink-3 uppercase tracking-wide border border-line/60 px-1 py-0.5 rounded">
                        Unused
                      </span>
                    )}
                  </div>
                  {canConfigure && (
                    <Button
                      size="sm"
                      variant="ghost"
                      loading={deletingType === t}
                      onClick={() => void handleRemoveType(t)}
                      icon={<Trash2 className="w-3.5 h-3.5 text-ink-3 hover:text-st-late" />}
                      aria-label={`Remove ${t}`}
                    />
                  )}
                </li>
              );
            })}
          </ul>

          {canConfigure && (
            <form onSubmit={submitNewType} className="p-4 border-t border-line bg-surface-2/50">
              <Field
                label="Add a matter type"
                htmlFor="new-matter-type"
                hint="New types become available immediately for matter registration."
                error={error ?? undefined}
              >
                <div className="flex gap-2">
                  <input
                    id="new-matter-type"
                    value={newType}
                    onChange={(e) => setNewType(e.target.value)}
                    placeholder="e.g. Board Advisory"
                    className={inputClass}
                  />
                  <Button
                    type="submit"
                    variant="primary"
                    loading={busy}
                    disabled={!newType.trim()}
                    icon={<Plus className="w-3.5 h-3.5" />}
                  >
                    Add
                  </Button>
                </div>
              </Field>
            </form>
          )}
        </Card>

        {/* Card 2: Security & Session Policy */}
        <Card>
          <CardHeader
            title="Authentication & Security Policy"
            description="Credential constraints and session lifetime protections."
            icon={<Lock className="w-4 h-4 text-nib-gold-600" />}
          />
          <dl className="divide-y divide-line text-[13px]">
            {[
              ['Password Complexity', 'Minimum 6 characters, excludes name/email parts, non-repeating'],
              ['Invitation / Setup Token', '24 hours validity, 256-bit random entropy, SHA-256 stored'],
              ['Session Idle Timeout', '30 minutes sliding window'],
              ['Absolute Session Lifetime', '8 hours maximum from sign-in'],
              ['Account Lockout Rule', '5 consecutive failed attempts locks account for 15 minutes'],
              ['Source Rate Limiting', 'Maximum 20 failed attempts per IP within 15 minutes'],
            ].map(([k, v]) => (
              <div key={k} className="px-4 py-2.5">
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">{k}</dt>
                <dd className="text-ink-2 mt-0.5 leading-relaxed">{v}</dd>
              </div>
            ))}
          </dl>
        </Card>
      </div>

      {/* Editable Roles & Permissions Matrix */}
      <div>
        <RolesMatrix />
      </div>
    </div>
  );
};

/* ────────────────────────────────────────────────────── Audit Trail */

const ACTION_TONE: Record<string, string> = {
  'Matter Created': 'bg-nib-gold-500',
  'Matter Accepted': 'bg-st-active',
  'Matter Assigned': 'bg-st-info',
  'Matter Forwarded': 'bg-st-info',
  'Clarification Requested': 'bg-st-wait',
  'Clarification Provided': 'bg-st-wait',
  'Implementation Submitted': 'bg-st-review',
  'Completion Confirmed': 'bg-st-done',
  'Completion Reviewed': 'bg-st-review',
  'Matter Closed': 'bg-st-done',
};

export const AuditTrailView: React.FC<{ onSelectMatter: (m: BODMatter) => void }> = ({
  onSelectMatter,
}) => {
  const { matters } = useAuth();
  const item = navItem('audit')!;

  const [selectedId, setSelectedId] = useState<string>('');
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState('');

  /**
   * The history of a long-running matter is dozens of events; an auditor asking
   * "what happened between the September and December Board meetings" needs to
   * bound it. Both ends are inclusive and compared on the event's own date.
   */
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const sorted = useMemo(
    () =>
      [...matters].sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      ),
    [matters]
  );

  useEffect(() => {
    if (!selectedId && sorted.length > 0) setSelectedId(sorted[0].id);
  }, [sorted, selectedId]);

  const load = React.useCallback(async (id: string) => {
    if (!id) return;
    setLoading(true);
    setFailed(false);
    try {
      const res = await fetch(`/api/matters/${id}/audit-trail`);
      if (!res.ok) throw new Error();
      setEntries(await res.json());
    } catch {
      setFailed(true);
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(selectedId);
  }, [selectedId, load]);

  const selected = matters.find((m) => m.id === selectedId);
  const listed = sorted.filter((m) => matchesQuery(m, query));

  const shown = entries.filter((e) => {
    const day = e.timestamp.slice(0, 10);
    return (!from || day >= from) && (!to || day <= to);
  });

  return (
    <div>
      <PageHeader
        title={item.title}
        description={item.description}
        actions={
          selected ? (
            <Button variant="secondary" onClick={() => onSelectMatter(selected)}>
              Open matter
            </Button>
          ) : undefined
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-[20rem_1fr] gap-5">
        <Card className="overflow-hidden lg:max-h-[calc(100vh-13rem)] flex flex-col">
          <div className="p-3 border-b border-line">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Find a matter…"
              aria-label="Find a matter"
              className={inputClass}
            />
          </div>
          {listed.length === 0 ? (
            <EmptyState title="No matters" message="Nothing within your scope." />
          ) : (
            <ul className="overflow-y-auto divide-y divide-line">
              {listed.map((m) => (
                <li key={m.id}>
                  <button
                    onClick={() => setSelectedId(m.id)}
                    className={cn(
                      'w-full text-left px-3 py-2.5 transition-colors border-l-2',
                      m.id === selectedId
                        ? 'bg-nib-gold-100/60 dark:bg-surface-2 border-l-nib-gold-500'
                        : 'border-l-transparent hover:bg-surface-2'
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[12px] font-bold text-ink tabular">{m.id}</span>
                      <StatusBadge status={m.status} />
                    </div>
                    <p className="text-[12px] text-ink-2 line-clamp-1 mt-0.5">{m.title}</p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="overflow-hidden">
          <CardHeader
            title={selected ? `History — ${selected.id}` : 'History'}
            description={
              selected
                ? `${selected.title} · immutable record of every action.`
                : 'Select a Board matter.'
            }
            icon={<ShieldCheck className="w-4 h-4" />}
            action={
              <div className="flex items-center gap-1.5">
                <input
                  type="date"
                  aria-label="Events from"
                  value={from}
                  max={to || undefined}
                  onChange={(e) => setFrom(e.target.value)}
                  className={cn(inputClass, 'w-[9rem] tabular')}
                />
                <span className="text-ink-3 text-[12px]">to</span>
                <input
                  type="date"
                  aria-label="Events to"
                  value={to}
                  min={from || undefined}
                  onChange={(e) => setTo(e.target.value)}
                  className={cn(inputClass, 'w-[9rem] tabular')}
                />
                {(from || to) && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setFrom('');
                      setTo('');
                    }}
                  >
                    Clear
                  </Button>
                )}
              </div>
            }
          />
          {loading ? (
            <TableSkeleton rows={6} cols={3} />
          ) : failed ? (
            <ErrorState
              title="Unable to load the audit trail"
              message="We couldn't retrieve the history for this matter."
              onRetry={() => load(selectedId)}
            />
          ) : shown.length === 0 ? (
            <EmptyState
              title={entries.length === 0 ? 'No events recorded' : 'No events in that period'}
              message={
                entries.length === 0
                  ? 'This matter has no history yet.'
                  : `This matter has ${entries.length} recorded event${
                      entries.length === 1 ? '' : 's'
                    }, none of them between the dates chosen.`
              }
            />
          ) : (
            <ol className="p-4 space-y-0">
              {shown.map((e, i) => (
                <li key={e.id} className="relative pl-6 pb-5 last:pb-0">
                  {i < shown.length - 1 && (
                    <span className="absolute left-[5px] top-3 bottom-0 w-px bg-line" aria-hidden="true" />
                  )}
                  <span
                    className={cn(
                      'absolute left-0 top-1.5 w-[11px] h-[11px] rounded-full ring-2 ring-surface',
                      ACTION_TONE[e.action] ?? 'bg-st-neutral'
                    )}
                    aria-hidden="true"
                  />
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <span className="text-[13px] font-semibold text-ink">{e.action}</span>
                    <span className="text-[11px] text-ink-3 tabular">{formatDateTime(e.timestamp)}</span>
                  </div>
                  <p className="text-[12px] text-ink-2 mt-0.5">
                    {e.userName}
                    <span className="text-ink-3"> · {ROLE_LABEL[e.userRole] ?? e.userRole}</span>
                  </p>
                  {(e.previousStatus || e.newStatus) && (
                    <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                      {e.previousStatus && <StatusBadge status={e.previousStatus} />}
                      {e.previousStatus && e.newStatus && (
                        <span className="text-ink-3 text-[11px]">→</span>
                      )}
                      {e.newStatus && <StatusBadge status={e.newStatus} />}
                    </div>
                  )}
                  {(e.previousOwner || e.newOwner) && (
                    <p className="text-[11px] text-ink-3 mt-1">
                      Owner: {e.previousOwner?.name ?? '—'} → {e.newOwner?.name ?? '—'}
                    </p>
                  )}
                  {e.comment && (
                    <p className="text-[12px] text-ink-2 mt-1.5 bg-surface-2 border border-line rounded-md px-2.5 py-1.5 leading-relaxed">
                      {e.comment}
                    </p>
                  )}
                  {e.supportingDocName && (
                    <p className="text-[11px] text-ink-3 mt-1">Document: {e.supportingDocName}</p>
                  )}
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>
    </div>
  );
};
