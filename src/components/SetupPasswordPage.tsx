'use client';

import React, { useEffect, useState } from 'react';
import Image from 'next/image';
import { useSearchParams } from 'next/navigation';
import { KeyRound, ShieldCheck, AlertTriangle, Check, Loader2, CheckCircle } from 'lucide-react';
import { passwordRules } from '@/lib/password-policy';

type Phase = 'loading' | 'ready' | 'submitting' | 'success' | 'error';

/**
 * Public page for setting a password via an emailed setup link.
 *
 * The URL carries a `?token=...` parameter. The page validates it with the
 * server, shows the officer's name, and lets them choose a password. On
 * success, the officer is redirected to the login page after a brief delay.
 *
 * Styled to match the NIB Board branding — same palette and card structure as
 * ChangePasswordPage.
 */
export const SetupPasswordPage: React.FC = () => {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [phase, setPhase] = useState<Phase>('loading');
  const [name, setName] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Validate the token on mount.
  useEffect(() => {
    if (!token) {
      setErrorMessage('No setup token provided. Please use the link from your invitation email.');
      setPhase('error');
      return;
    }

    (async () => {
      try {
        const res = await fetch(`/api/auth/setup-password?token=${encodeURIComponent(token)}`);
        if (res.ok) {
          const data = await res.json();
          setName(data.name);
          setPhase('ready');
        } else {
          const data = await res.json().catch(() => ({}));
          setErrorMessage(
            data.error || 'This setup link is invalid or has expired. Please contact your administrator.'
          );
          setPhase('error');
        }
      } catch {
        setErrorMessage('Unable to reach the server. Please try again.');
        setPhase('error');
      }
    })();
  }, [token]);

  // Password policy rules, bound to the resolved user name.
  const rules = passwordRules({ name });
  const satisfied = rules.map((r) => r.test(newPassword));
  const allSatisfied = satisfied.every(Boolean);
  const matches = newPassword.length > 0 && newPassword === confirmPassword;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    if (!allSatisfied) return setSubmitError('The password does not meet the policy requirements.');
    if (!matches) return setSubmitError('The two password entries do not match.');

    setPhase('submitting');

    try {
      const res = await fetch('/api/auth/setup-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSubmitError(data.error || 'Could not set the password. Please try again.');
        setPhase('ready');
        return;
      }

      setPhase('success');

      // Redirect to login after a brief pause so the success message is visible.
      setTimeout(() => {
        window.location.href = '/?setup=success';
      }, 2500);
    } catch {
      setSubmitError('Unable to reach the server. Please try again.');
      setPhase('ready');
    }
  };

  // ────────────────────────────────────────────────── Loading state
  if (phase === 'loading') {
    return (
      <div className="min-h-screen bg-app flex items-center justify-center p-4">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-nib-gold-500 animate-spin" />
          <p className="text-[13px] text-ink-3">Validating your setup link…</p>
        </div>
      </div>
    );
  }

  // ────────────────────────────────────────────────── Error state (invalid/expired token)
  if (phase === 'error') {
    return (
      <div className="min-h-screen bg-app flex items-center justify-center p-4 text-ink">
        <div className="w-full max-w-md">
          <div className="flex items-center space-x-3 mb-6">
            <Image
              src="/nib-logo.png"
              alt=""
              width={44}
              height={44}
              priority
              className="w-11 h-11 rounded-[--radius-card] object-contain"
            />
            <div>
              <h1 className="font-bold text-sm">NIB International Bank</h1>
              <p className="text-[11px] text-ink-3">Board Governance Portal</p>
            </div>
          </div>

          <div className="bg-surface border border-line rounded-[--radius-card] p-6 shadow-overlay">
            <div className="flex items-start space-x-3">
              <AlertTriangle className="w-5 h-5 text-st-late shrink-0 mt-0.5" />
              <div>
                <h2 className="font-bold text-sm">Link unavailable</h2>
                <p className="text-[12px] text-ink-2 mt-2 leading-relaxed">{errorMessage}</p>
              </div>
            </div>

            <a
              href="/"
              className="block w-full mt-5 bg-nib-gold-500 hover:bg-nib-gold-400 text-nib-brown-900 font-bold text-xs rounded-lg py-2.5 text-center transition"
            >
              Go to sign-in
            </a>
          </div>
        </div>
      </div>
    );
  }

  // ────────────────────────────────────────────────── Success state
  if (phase === 'success') {
    return (
      <div className="min-h-screen bg-app flex items-center justify-center p-4 text-ink">
        <div className="w-full max-w-md">
          <div className="flex items-center space-x-3 mb-6">
            <Image
              src="/nib-logo.png"
              alt=""
              width={44}
              height={44}
              priority
              className="w-11 h-11 rounded-[--radius-card] object-contain"
            />
            <div>
              <h1 className="font-bold text-sm">NIB International Bank</h1>
              <p className="text-[11px] text-ink-3">Board Governance Portal</p>
            </div>
          </div>

          <div className="bg-surface border border-line rounded-[--radius-card] p-6 shadow-overlay">
            <div className="flex items-start space-x-3">
              <CheckCircle className="w-5 h-5 text-st-done shrink-0 mt-0.5" />
              <div>
                <h2 className="font-bold text-sm">Password set successfully</h2>
                <p className="text-[12px] text-ink-2 mt-2 leading-relaxed">
                  Your password has been set, {name}. You will be redirected to the sign-in page
                  momentarily.
                </p>
              </div>
            </div>

            <a
              href="/"
              className="block w-full mt-5 bg-nib-gold-500 hover:bg-nib-gold-400 text-nib-brown-900 font-bold text-xs rounded-lg py-2.5 text-center transition"
            >
              Sign in now
            </a>
          </div>
        </div>
      </div>
    );
  }

  // ────────────────────────────────────────────────── Ready / submitting — the password form
  return (
    <div className="min-h-screen bg-app flex items-center justify-center p-4 text-ink">
      <div className="w-full max-w-md">
        <div className="flex items-center space-x-3 mb-6">
          <Image
            src="/nib-logo.png"
            alt=""
            width={44}
            height={44}
            priority
            className="w-11 h-11 rounded-[--radius-card] object-contain"
          />
          <div>
            <h1 className="font-bold text-sm">NIB International Bank</h1>
            <p className="text-[11px] text-ink-3">Board Governance Portal</p>
          </div>
        </div>

        <div className="bg-surface border border-line rounded-[--radius-card] p-6 shadow-overlay">
          <div className="flex items-start space-x-3 mb-5">
            <KeyRound className="w-5 h-5 text-nib-gold-400 mt-0.5 shrink-0" />
            <div>
              <h2 className="font-bold text-sm">Set your password</h2>
              <p className="text-[11px] text-ink-3 mt-1">
                Welcome, <strong>{name}</strong>. Choose a password for your Board Governance Portal
                account.
              </p>
            </div>
          </div>

          {submitError && (
            <div className="flex items-start space-x-2 bg-st-late-bg border border-st-late/30 text-st-late rounded-lg p-3 mb-4 text-[11px]">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{submitError}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="block text-[11px] font-semibold text-ink-2 mb-1">
                New password
              </label>
              <input
                type="password"
                autoComplete="new-password"
                autoFocus
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full bg-app border border-line rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-nib-gold-400/60"
                required
                disabled={phase === 'submitting'}
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-ink-2 mb-1">
                Confirm password
              </label>
              <input
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full bg-app border border-line rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-nib-gold-400/60"
                required
                disabled={phase === 'submitting'}
              />
              {confirmPassword.length > 0 && !matches && (
                <p className="text-[10px] text-st-late mt-1">The entries do not match.</p>
              )}
            </div>

            <ul className="space-y-1 pt-1">
              {rules.map((rule, i) => (
                <li
                  key={rule.label}
                  className={`flex items-center space-x-2 text-[10px] ${
                    satisfied[i] ? 'text-st-done' : 'text-ink-3'
                  }`}
                >
                  <Check className={`w-3 h-3 ${satisfied[i] ? 'opacity-100' : 'opacity-30'}`} />
                  <span>{rule.label}</span>
                </li>
              ))}
            </ul>

            <button
              type="submit"
              disabled={phase === 'submitting' || !allSatisfied || !matches}
              className="w-full bg-nib-gold-500 hover:bg-nib-gold-400 disabled:bg-surface-3 disabled:text-ink-3 text-nib-brown-900 font-bold text-xs rounded-lg py-2.5 transition flex items-center justify-center space-x-2"
            >
              {phase === 'submitting' ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Setting password…</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4" />
                  <span>Set password & continue</span>
                </>
              )}
            </button>
          </form>
        </div>

        <p className="text-[10px] text-ink-3 text-center mt-4">
          This link expires 24 hours after it was sent.
        </p>
      </div>
    </div>
  );
};
