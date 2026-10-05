'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import { AlertTriangle, CheckCircle, Lock, Eye, EyeOff, Monitor, Moon, Sun } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useTheme, ThemePreference } from '@/context/ThemeContext';
import { BoardroomScene } from '@/components/BoardroomScene';
import { EpmoBadge } from '@/components/EpmoBadge';

const THEMES: Array<{ id: ThemePreference; label: string; icon: React.ReactNode }> = [
  { id: 'light', label: 'Light', icon: <Sun className="w-3.5 h-3.5" /> },
  { id: 'dark', label: 'Dark', icon: <Moon className="w-3.5 h-3.5" /> },
  { id: 'system', label: 'System', icon: <Monitor className="w-3.5 h-3.5" /> },
];

/**
 * Appearance control, offered before sign-in.
 *
 * The same three choices as the Appearance menu inside the application, writing
 * to the same stored preference — so whichever an officer picks here is the one
 * the workspace opens in. It is placed opposite the EPMO badge, well clear of
 * the credential card, because it is a comfort setting and must not read as
 * part of signing in.
 */
const ThemeSwitch: React.FC = () => {
  const { preference, setPreference } = useTheme();

  return (
    <div
      role="group"
      aria-label="Appearance"
      className="flex items-center gap-0.5 rounded-full border border-nib-brown-900/15 bg-white/70 p-1 shadow-lg backdrop-blur-md dark:border-nib-gold-400/25 dark:bg-nib-brown-900/70"
    >
      {THEMES.map((t) => {
        const on = preference === t.id;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => setPreference(t.id)}
            aria-pressed={on}
            title={`${t.label} appearance`}
            className={[
              'flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors',
              on
                ? 'bg-nib-gold-500 text-nib-brown-900 shadow-sm'
                : 'text-nib-brown-700 hover:bg-nib-brown-900/8 dark:text-nib-gold-100/70 dark:hover:bg-white/10',
            ].join(' ')}
          >
            {t.icon}
            <span className="hidden sm:inline">{t.label}</span>
          </button>
        );
      })}
    </div>
  );
};

/**
 * Institutional sign-in — centered layout.
 *
 * Themed rather than fixed dark: the boardroom scene stays the backdrop in both
 * appearances, washed back to a faint warm etching under cream in light mode
 * and lit as a room in dark mode. The form itself is identical either way.
 */
export const LoginPage: React.FC = () => {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const searchParams = useSearchParams();
  const setupSuccess = searchParams.get('setup') === 'success';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError('Enter your institutional email address and password.');
      return;
    }
    setBusy(true);
    setError(null);
    const res = await login(email.trim(), password);
    setBusy(false);
    if (!res.success) setError(res.error ?? 'Sign-in failed. Please try again.');
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden bg-nib-cream p-4 sm:p-6 dark:bg-nib-brown-900">
      {/* Background Boardroom Scene — a faint etching in light, a lit room in dark */}
      <BoardroomScene className="absolute inset-0 w-full h-full opacity-15 dark:opacity-100" />

      {/* Scrim Overlay */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-b from-nib-cream/85 via-white/75 to-nib-cream/95 backdrop-blur-[2px] dark:from-nib-brown-900/90 dark:via-nib-brown-900/80 dark:to-nib-brown-900/95"
      />

      {/* Appearance Control */}
      <div className="absolute top-5 left-4 sm:left-10 md:left-16 z-20">
        <ThemeSwitch />
      </div>

      {/* Hanging EPMO Badge */}
      <div className="absolute top-0 right-4 sm:right-10 md:right-16 z-20">
        <EpmoBadge />
      </div>

      {/* Centered Sign-in Card */}
      <div className="relative w-full max-w-md z-10 flex flex-col items-center">
        {/* Brand Lockup */}
        <div className="flex flex-col items-center text-center mb-6">
          <div className="w-14 h-14 rounded-2xl bg-white p-1.5 shadow-2xl border border-nib-gold-500/40 flex items-center justify-center mb-3 dark:border-nib-gold-400/40">
            <Image
              src="/nib-logo.png"
              alt="NIB Bank"
              width={52}
              height={52}
              priority
              className="w-full h-full object-contain"
            />
          </div>
          <h1 className="text-[17px] font-extrabold text-nib-brown-900 tracking-tight leading-tight dark:text-white">
            NIB INTERNATIONAL BANK S.C.
          </h1>
          <p className="text-[11px] text-nib-gold-700 font-bold tracking-[0.18em] uppercase mt-0.5 dark:text-nib-gold-400">
            Board Governance Portal
          </p>
        </div>

        {/* Credential Card */}
        <div className="w-full rounded-2xl border border-nib-brown-900/10 bg-white/85 backdrop-blur-2xl shadow-[0_24px_60px_-12px_rgba(58,28,5,0.25)] p-7 sm:p-8 dark:border-nib-gold-400/25 dark:bg-nib-brown-900/85 dark:shadow-[0_24px_60px_-12px_rgba(0,0,0,0.8)]">
          <div className="mb-6 text-center">
            <h2 className="text-[20px] font-bold text-nib-brown-900 tracking-tight dark:text-white">
              Sign In
            </h2>
            <p className="text-[12px] text-nib-brown-700/70 mt-1 dark:text-nib-gold-100/70">
              Authorized personnel of NIB International Bank
            </p>
          </div>

          {error && (
            <div
              role="alert"
              className="flex items-start gap-2.5 rounded-lg border border-red-300 bg-red-50 px-3.5 py-3 mb-5 text-left dark:border-red-400/30 dark:bg-red-950/50"
            >
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-red-600 dark:text-red-300" />
              <p className="text-[12px] leading-relaxed text-red-800 dark:text-red-200">{error}</p>
            </div>
          )}

          {setupSuccess && !error && (
            <div
              role="status"
              className="flex items-start gap-2.5 rounded-lg border border-green-300 bg-green-50 px-3.5 py-3 mb-5 text-left dark:border-green-400/30 dark:bg-green-950/50"
            >
              <CheckCircle className="w-4 h-4 shrink-0 mt-0.5 text-green-700 dark:text-green-300" />
              <p className="text-[12px] leading-relaxed text-green-800 dark:text-green-200">
                Password set successfully. Sign in now with your new credentials.
              </p>
            </div>
          )}

          <form onSubmit={submit} className="space-y-4" noValidate>
            <div>
              <label
                htmlFor="login-email"
                className="block text-[12px] font-semibold text-nib-brown-800 mb-1.5 text-left dark:text-nib-gold-100/85"
              >
                Institutional Email
              </label>
              <input
                id="login-email"
                type="email"
                autoComplete="username"
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@nibbank.com.et"
                className="w-full h-10 rounded-lg bg-white border border-nib-brown-900/15 px-3.5 text-[13px] text-nib-brown-900 placeholder:text-nib-brown-700/35 focus:outline-none focus:border-nib-gold-500 focus:ring-2 focus:ring-nib-gold-500/20 transition dark:bg-black/35 dark:border-nib-gold-400/30 dark:text-white dark:placeholder:text-nib-gold-100/30 dark:focus:border-nib-gold-400"
              />
            </div>

            <div>
              <label
                htmlFor="login-password"
                className="block text-[12px] font-semibold text-nib-brown-800 mb-1.5 text-left dark:text-nib-gold-100/85"
              >
                Password
              </label>
              <div className="relative">
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full h-10 rounded-lg bg-white border border-nib-brown-900/15 pl-3.5 pr-10 text-[13px] text-nib-brown-900 placeholder:text-nib-brown-700/35 focus:outline-none focus:border-nib-gold-500 focus:ring-2 focus:ring-nib-gold-500/20 transition dark:bg-black/35 dark:border-nib-gold-400/30 dark:text-white dark:placeholder:text-nib-gold-100/30 dark:focus:border-nib-gold-400"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-nib-brown-700 hover:text-nib-brown-900 p-1 rounded-md hover:bg-nib-brown-900/8 transition dark:text-nib-gold-300 dark:hover:text-white dark:hover:bg-white/15"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? (
                    <EyeOff className="w-5 h-5 stroke-[2.8]" />
                  ) : (
                    <Eye className="w-5 h-5 stroke-[2.8]" />
                  )}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={busy}
              className="w-full h-11 rounded-lg bg-nib-gold-500 hover:bg-nib-gold-400 active:bg-nib-gold-600 disabled:bg-nib-gold-700/50 disabled:text-nib-gold-100/50 text-nib-brown-900 font-bold text-[13px] inline-flex items-center justify-center gap-2 transition shadow-lg mt-2"
            >
              <Lock className="w-3.5 h-3.5" />
              {busy ? 'Signing in…' : 'Sign In'}
            </button>
          </form>
        </div>

        {/* Security Footer Note */}
        <p className="text-[11px] text-nib-brown-700/70 text-center mt-6 leading-relaxed dark:text-nib-gold-100/50">
          Protected institutional access · All activity is logged and audited
          <br />© {new Date().getFullYear()} NIB International Bank S.C.
        </p>
      </div>
    </div>
  );
};
