'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle, History, KeyRound, LogOut, MonitorSmartphone } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { apiFetch } from '@/lib/api-client';
import { formatDateTime } from '@/lib/matters';
import {
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  PageHeader,
  Skeleton,
  cn,
} from '@/components/ui/primitives';
import { ChangePasswordForm } from '@/components/ChangePasswordPage';

interface LiveSession {
  current: boolean;
  signedInAt: string;
  lastSeenAt: string;
  ip: string | null;
  userAgent: string | null;
}

interface ActivityEvent {
  id: string;
  occurredAt: string;
  event: string;
  ip: string | null;
  userAgent: string | null;
  detail: string | null;
}

interface SecurityOverview {
  sessions: LiveSession[];
  activity: ActivityEvent[];
  policy: { maxConcurrentSessions: number; idleTimeoutMinutes: number; absoluteTimeoutHours: number };
}

const PILL: Record<'done' | 'late' | 'info' | 'wait' | 'neutral', string> = {
  done: 'text-st-done bg-st-done-bg border-st-done/25',
  late: 'text-st-late bg-st-late-bg border-st-late/30',
  info: 'text-st-info bg-st-info-bg border-st-info/25',
  wait: 'text-st-wait bg-st-wait-bg border-st-wait/25',
  neutral: 'text-st-neutral bg-st-neutral-bg border-st-neutral/25',
};

const EVENT_LABEL: Record<string, { label: string; tone: keyof typeof PILL }> = {
  LOGIN_SUCCEEDED: { label: 'Signed in', tone: 'done' },
  LOGIN_FAILED: { label: 'Failed sign-in attempt', tone: 'late' },
  LOGIN_BLOCKED_LOCKED: { label: 'Refused: account locked', tone: 'late' },
  ACCOUNT_LOCKED: { label: 'Account locked', tone: 'late' },
  ACCOUNT_UNLOCKED: { label: 'Account unlocked', tone: 'info' },
  LOGOUT: { label: 'Signed out', tone: 'neutral' },
  PASSWORD_CHANGED: { label: 'Password changed', tone: 'info' },
  PASSWORD_RESET: { label: 'Password reset', tone: 'wait' },
  SESSION_REVOKED: { label: 'Session ended', tone: 'wait' },
  SESSION_EXPIRED: { label: 'Session expired', tone: 'neutral' },
};

/**
 * "Firefox on Linux", from a user-agent string: enough for an officer to
 * recognise their own device. The full string is kept in the tooltip.
 */
function describeDevice(ua: string | null): string {
  if (!ua) return 'Unknown device';
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /OPR\/|Opera/.test(ua)
      ? 'Opera'
      : /Firefox\//.test(ua)
        ? 'Firefox'
        : /Chrome\//.test(ua)
          ? 'Chrome'
          : /Safari\//.test(ua)
            ? 'Safari'
            : null;
  // Android reports Linux, and iOS reports Mac OS X, so each is tested first.
  const os = /Windows/.test(ua)
    ? 'Windows'
    : /Android/.test(ua)
      ? 'Android'
      : /iPhone|iPad|iPod/.test(ua)
        ? 'iOS'
        : /Mac OS X|Macintosh/.test(ua)
          ? 'macOS'
          : /Linux/.test(ua)
            ? 'Linux'
            : null;
  if (browser && os) return `${browser} on ${os}`;
  return browser ?? os ?? 'Unknown device';
}

/**
 * Account security: the signed-in officer's own password and sessions.
 *
 * Answers security assessment findings VA-001 (no way to change a password
 * that may have leaked) and VA-002 (no view of where the account is signed in,
 * and no way to end it). Every role reaches it from the account menu; the API
 * behind it only ever returns the caller's own records.
 */
export const AccountSecurityView: React.FC = () => {
  const { signOutEverywhere } = useAuth();
  const [data, setData] = useState<SecurityOverview | null>(null);
  const [failed, setFailed] = useState(false);
  const [changed, setChanged] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      const res = await apiFetch('/api/auth/sessions');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSignOutEverywhere = async () => {
    if (!window.confirm('Sign out of every session on your account, including this one?')) return;
    setSigningOut(true);
    setSignOutError(null);
    // On success the page returns to the sign-in screen, so only a failure
    // needs handling here.
    const res = await signOutEverywhere();
    if (!res.success) {
      setSigningOut(false);
      setSignOutError(res.error ?? 'Could not sign out of every session.');
    }
  };

  const policy = data?.policy;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Account security"
        description="Change your password, see where your account is signed in, and review recent sign-in activity. If anything here was not you, change your password straight away."
      />

      <div className="grid gap-4 lg:grid-cols-2 items-start">
        <Card>
          <CardHeader
            icon={<KeyRound className="w-4 h-4" />}
            title="Change password"
            description="Your current password is required. Changing it signs out every other session on your account."
          />
          <div className="p-4">
            {changed && (
              <div
                role="status"
                className="flex items-start gap-2 rounded-lg border border-st-done/25 bg-st-done-bg text-st-done p-3 mb-4 text-[11px]"
              >
                <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>Password changed. Any other session on your account has been signed out.</span>
              </div>
            )}
            <ChangePasswordForm
              submitLabel="Change password"
              onChanged={() => {
                setChanged(true);
                void load();
              }}
            />
          </div>
        </Card>

        <Card>
          <CardHeader
            icon={<MonitorSmartphone className="w-4 h-4" />}
            title="Active sessions"
            description={
              policy
                ? `One session per account: signing in somewhere else ends this one. A session also ends after ${policy.idleTimeoutMinutes} minutes without activity, and after ${policy.absoluteTimeoutHours} hours in any case.`
                : undefined
            }
          />
          <div className="p-4">
            {failed ? (
              <ErrorState message="Your sessions could not be loaded." onRetry={() => void load()} />
            ) : !data ? (
              <div className="space-y-2">
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-3 w-3/4" />
              </div>
            ) : (
              <ul className="divide-y divide-line">
                {data.sessions.map((s) => (
                  <li key={s.signedInAt} className="flex items-start gap-3 py-3 first:pt-0">
                    <MonitorSmartphone className="w-4 h-4 text-ink-3 mt-0.5 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className="text-[13px] font-semibold text-ink"
                          title={s.userAgent ?? undefined}
                        >
                          {describeDevice(s.userAgent)}
                        </span>
                        {s.current && (
                          <span
                            className={cn(
                              'px-2 py-0.5 rounded-full text-[10px] font-bold border',
                              PILL.done
                            )}
                          >
                            This browser
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-ink-3 mt-0.5 tabular">
                        {s.ip ?? 'Unknown address'} · signed in {formatDateTime(s.signedInAt)} ·
                        last active {formatDateTime(s.lastSeenAt)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {signOutError && <p className="text-[11px] text-st-late mt-3">{signOutError}</p>}

            <div className="mt-4 pt-4 border-t border-line flex flex-col sm:flex-row sm:items-center gap-3">
              <p className="text-[11px] text-ink-3 flex-1">
                Think someone else has used your account? Change your password, or sign out of
                every session.
              </p>
              <Button
                variant="danger"
                size="sm"
                icon={<LogOut className="w-3.5 h-3.5" />}
                loading={signingOut}
                onClick={handleSignOutEverywhere}
              >
                Sign out everywhere
              </Button>
            </div>
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader
          icon={<History className="w-4 h-4" />}
          title="Recent sign-in activity"
          description="The latest sign-ins, failed attempts, password changes and session events on your account."
        />
        {failed ? (
          <ErrorState message="Your sign-in activity could not be loaded." onRetry={() => void load()} />
        ) : !data ? (
          <div className="p-4 space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        ) : data.activity.length === 0 ? (
          <EmptyState title="No activity recorded yet" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-surface-2/70 border-b border-line text-[11px] font-semibold text-ink-3 uppercase tracking-wider">
                  <th className="py-3 px-4">When</th>
                  <th className="py-3 px-4">Event</th>
                  <th className="py-3 px-4">Source IP</th>
                  <th className="py-3 px-4">Device</th>
                  <th className="py-3 px-4">Detail</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line text-xs">
                {data.activity.map((e) => {
                  const kind = EVENT_LABEL[e.event] ?? {
                    label: e.event.replace(/_/g, ' ').toLowerCase(),
                    tone: 'neutral' as const,
                  };
                  return (
                    <tr key={e.id} className="hover:bg-surface-2/40 transition">
                      <td className="py-3 px-4 font-mono text-[11px] text-ink-3 whitespace-nowrap">
                        {formatDateTime(e.occurredAt)}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span
                          className={cn(
                            'px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide border',
                            PILL[kind.tone]
                          )}
                        >
                          {kind.label}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono text-[11px] text-ink-2 whitespace-nowrap">
                        {e.ip ?? '—'}
                      </td>
                      <td
                        className="py-3 px-4 text-ink-2 whitespace-nowrap"
                        title={e.userAgent ?? undefined}
                      >
                        {describeDevice(e.userAgent)}
                      </td>
                      <td className="py-3 px-4 text-ink-3 leading-relaxed">{e.detail || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
};
