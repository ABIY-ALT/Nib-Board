'use client';

import React, { useState } from 'react';
import { NibLogoImage } from '@/components/ui/NibLogoImage';
import { useAuth } from '@/context/AuthContext';
import { KeyRound, ShieldCheck, AlertTriangle, Check, Loader2, Eye, EyeOff } from 'lucide-react';
import { passwordRules } from '@/lib/password-policy';

const PasswordInput: React.FC<{
  id: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
}> = ({ id, value, onChange, autoComplete }) => {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <input
        id={id}
        type={visible ? 'text' : 'password'}
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-app border border-line rounded-lg pl-3 pr-10 py-2 text-xs focus:outline-none focus:border-nib-gold-400/60"
        required
      />
      <button
        type="button"
        onClick={() => setVisible(!visible)}
        className="absolute right-2 top-1/2 -translate-y-1/2 text-black hover:text-neutral-700 p-1 rounded transition"
        aria-label={visible ? 'Hide password' : 'Show password'}
      >
        {visible ? (
          <EyeOff className="w-5 h-5 stroke-[2.8] text-black" />
        ) : (
          <Eye className="w-5 h-5 stroke-[2.8] text-black" />
        )}
      </button>
    </div>
  );
};

/**
 * Current password, the new one twice, and the policy as a live checklist.
 *
 * Shared by the forced change below and by Account security, where an officer
 * changes a password they suspect has leaked (security assessment VA-001).
 * Either way the API demands the current password, applies the same policy and
 * signs out every other session.
 */
export const ChangePasswordForm: React.FC<{
  submitLabel: string;
  /** Called after the server has accepted the new password. */
  onChanged?: () => void;
}> = ({ submitLabel, onChanged }) => {
  const { currentUser, changePassword } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Same rules the API applies, so the button never disables on a valid password.
  const rules = passwordRules({ name: currentUser?.name, email: currentUser?.email });
  const satisfied = rules.map((r) => r.test(newPassword));
  const allSatisfied = satisfied.every(Boolean);
  const matches = newPassword.length > 0 && newPassword === confirmPassword;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!allSatisfied) return setError('The new password does not meet the policy.');
    if (!matches) return setError('The two new-password entries do not match.');

    setIsSubmitting(true);
    const res = await changePassword(currentPassword, newPassword);
    setIsSubmitting(false);
    if (!res.success) return setError(res.error ?? 'Could not change the password.');

    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    onChanged?.();
  };

  return (
    <>
      {error && (
        <div className="flex items-start space-x-2 bg-st-late-bg border border-st-late/30 text-st-late rounded-lg p-3 mb-4 text-[11px]">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label htmlFor="cp-current" className="block text-[11px] font-semibold text-ink-2 mb-1">
            Current password
          </label>
          <PasswordInput
            id="cp-current"
            autoComplete="current-password"
            value={currentPassword}
            onChange={setCurrentPassword}
          />
        </div>

        <div>
          <label htmlFor="cp-new" className="block text-[11px] font-semibold text-ink-2 mb-1">
            New password
          </label>
          <PasswordInput
            id="cp-new"
            autoComplete="new-password"
            value={newPassword}
            onChange={setNewPassword}
          />
        </div>

        <div>
          <label htmlFor="cp-confirm" className="block text-[11px] font-semibold text-ink-2 mb-1">
            Confirm new password
          </label>
          <PasswordInput
            id="cp-confirm"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={setConfirmPassword}
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
          disabled={isSubmitting || !allSatisfied || !matches}
          className="w-full bg-nib-gold-500 hover:bg-nib-gold-400 disabled:bg-surface-3 disabled:text-ink-3 text-nib-brown-900 font-bold text-xs rounded-lg py-2.5 transition flex items-center justify-center space-x-2"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Updating…</span>
            </>
          ) : (
            <>
              <ShieldCheck className="w-4 h-4" />
              <span>{submitLabel}</span>
            </>
          )}
        </button>
      </form>
    </>
  );
};

/**
 * Shown when the account carries a forced password change. The API refuses
 * every other endpoint until this is done, so this screen is the only thing a
 * user with a temporary credential can reach.
 */
export const ChangePasswordPage: React.FC = () => {
  const { currentUser, logout } = useAuth();

  return (
    <div className="min-h-screen bg-app flex items-center justify-center p-4 text-ink">
      <div className="w-full max-w-md">
        <div className="flex items-center space-x-3 mb-6">
          <NibLogoImage size={44} className="w-11 h-11 rounded-(--radius-card) object-contain" />
          <div>
            <h1 className="font-bold text-sm">NIB International Bank</h1>
            <p className="text-[11px] text-ink-3">Board Governance Portal</p>
          </div>
        </div>

        <div className="bg-surface border border-line rounded-(--radius-card) p-6 shadow-overlay">
          <div className="flex items-start space-x-3 mb-5">
            <KeyRound className="w-5 h-5 text-nib-gold-400 mt-0.5 shrink-0" />
            <div>
              <h2 className="font-bold text-sm">Set a new password</h2>
              <p className="text-[11px] text-ink-3 mt-1">
                {currentUser?.name}, your account uses a temporary password. Choose a new one to
                continue — the system is locked until you do.
              </p>
            </div>
          </div>

          <ChangePasswordForm submitLabel="Set new password" />

          <button
            onClick={logout}
            className="w-full mt-3 text-[11px] text-ink-3 hover:text-ink transition"
          >
            Sign out instead
          </button>
        </div>

        <p className="text-[10px] text-ink-3 text-center mt-4">
          Changing your password signs out every other device.
        </p>
      </div>
    </div>
  );
};
