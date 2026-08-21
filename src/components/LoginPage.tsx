'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import { AlertTriangle, CheckCircle, Lock, ShieldCheck, Eye, EyeOff } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { BoardroomScene } from '@/components/BoardroomScene';

/**
 * Institutional sign-in — Centered layout.
 *
 * Clean, elegant and centered over the NIB boardroom backdrop.
 * Free of external links or reveal icons for maximum security.
 */
export const LoginPage: React.FC = () => {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(false);
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
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden bg-nib-brown-900 p-4 sm:p-6">
      {/* Background Boardroom Scene */}
      <BoardroomScene className="absolute inset-0 w-full h-full" />

      {/* Scrim Overlay */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-b from-nib-brown-900/90 via-nib-brown-900/80 to-nib-brown-900/95 backdrop-blur-[2px]"
      />

      {/* Centered Sign-in Card */}
      <div className="relative w-full max-w-md z-10 flex flex-col items-center">
        {/* Brand Lockup */}
        <div className="flex flex-col items-center text-center mb-6">
          <div className="w-14 h-14 rounded-2xl bg-white p-1.5 shadow-2xl border border-nib-gold-400/40 flex items-center justify-center mb-3">
            <Image
              src="/nib-logo.png"
              alt="NIB Bank"
              width={52}
              height={52}
              priority
              className="w-full h-full object-contain"
            />
          </div>
          <h1 className="text-[17px] font-extrabold text-white tracking-tight leading-tight">
            NIB INTERNATIONAL BANK S.C.
          </h1>
          <p className="text-[11px] text-nib-gold-400 font-bold tracking-[0.18em] uppercase mt-0.5">
            Board Governance Portal
          </p>
        </div>

        {/* Credential Card */}
        <div className="w-full rounded-2xl border border-nib-gold-400/25 bg-nib-brown-900/85 backdrop-blur-2xl shadow-[0_24px_60px_-12px_rgba(0,0,0,0.8)] p-7 sm:p-8">
          <div className="mb-6 text-center">
            <h2 className="text-[20px] font-bold text-white tracking-tight">Officer Sign-in</h2>
            <p className="text-[12px] text-nib-gold-100/70 mt-1">
              Authorized personnel of NIB International Bank
            </p>
          </div>

          {error && (
            <div
              role="alert"
              className="flex items-start gap-2.5 rounded-lg border border-red-400/30 bg-red-950/50 px-3.5 py-3 mb-5 text-left"
            >
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-red-300" />
              <p className="text-[12px] leading-relaxed text-red-200">{error}</p>
            </div>
          )}

          {setupSuccess && !error && (
            <div
              role="status"
              className="flex items-start gap-2.5 rounded-lg border border-green-400/30 bg-green-950/50 px-3.5 py-3 mb-5 text-left"
            >
              <CheckCircle className="w-4 h-4 shrink-0 mt-0.5 text-green-300" />
              <p className="text-[12px] leading-relaxed text-green-200">
                Password set successfully. Sign in now with your new credentials.
              </p>
            </div>
          )}

          <form onSubmit={submit} className="space-y-4" noValidate>
            <div>
              <label
                htmlFor="login-email"
                className="block text-[12px] font-semibold text-nib-gold-100/85 mb-1.5 text-left"
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
                className="w-full h-10 rounded-lg bg-black/35 border border-nib-gold-400/30 px-3.5 text-[13px] text-white placeholder:text-nib-gold-100/30 focus:outline-none focus:border-nib-gold-400 focus:ring-2 focus:ring-nib-gold-500/20 transition"
              />
            </div>

            <div>
              <label
                htmlFor="login-password"
                className="block text-[12px] font-semibold text-nib-gold-100/85 mb-1.5 text-left"
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
                  className="w-full h-10 rounded-lg bg-black/35 border border-nib-gold-400/30 pl-3.5 pr-10 text-[13px] text-white placeholder:text-nib-gold-100/30 focus:outline-none focus:border-nib-gold-400 focus:ring-2 focus:ring-nib-gold-500/20 transition"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-nib-gold-300 hover:text-white p-1 rounded-md hover:bg-white/15 transition"
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

            <div className="flex items-center justify-start pt-1">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  className="w-3.5 h-3.5 rounded border-nib-gold-400/40 bg-black/30 text-nib-gold-500 focus:ring-nib-gold-500/30"
                />
                <span className="text-[12px] text-nib-gold-100/75">Remember this device</span>
              </label>
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
        <p className="text-[11px] text-nib-gold-100/50 text-center mt-6 leading-relaxed">
          Protected institutional access · All activity is logged and audited
          <br />© {new Date().getFullYear()} NIB International Bank S.C.
        </p>
      </div>
    </div>
  );
};
