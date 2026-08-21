'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  ServerCrash,
  RefreshCw,
  Clock,
  Wifi,
  WifiOff,
  CheckCircle2,
} from 'lucide-react';

/**
 * Default estimated comeback time — 5 minutes from first render.
 * Can be overridden via `estimatedBackAt` prop (ISO string or Date).
 */
const DEFAULT_COMEBACK_MINUTES = 5;

interface ServerDownPageProps {
  /** Callback fired when the server becomes reachable again. */
  onServerBack?: () => void;
  /** An optional fixed comeback time. Defaults to 5 min from mount. */
  estimatedBackAt?: Date | string;
  /** How often (ms) to poll the server health. Default 10 000 ms. */
  pollInterval?: number;
}

/**
 * Full-screen maintenance / server-down page.
 *
 * Shows a countdown to the estimated comeback time, a pulsing status
 * indicator, and quietly polls the health endpoint in the background.
 * When the server responds, it fades to a "We're back!" state and fires
 * `onServerBack` so the caller can reload the app.
 */
export const ServerDownPage: React.FC<ServerDownPageProps> = ({
  onServerBack,
  estimatedBackAt,
  pollInterval = 10_000,
}) => {
  /* ── countdown state ─────────────────────────────────────────────── */
  const [targetTime] = useState<Date>(() => {
    if (estimatedBackAt) {
      return typeof estimatedBackAt === 'string'
        ? new Date(estimatedBackAt)
        : estimatedBackAt;
    }
    return new Date(Date.now() + DEFAULT_COMEBACK_MINUTES * 60 * 1000);
  });

  const [remaining, setRemaining] = useState(() => computeRemaining(targetTime));
  const [isBack, setIsBack] = useState(false);
  const [checking, setChecking] = useState(false);
  const [manualRetries, setManualRetries] = useState(0);

  /* ── countdown tick ──────────────────────────────────────────────── */
  useEffect(() => {
    const id = setInterval(() => setRemaining(computeRemaining(targetTime)), 1_000);
    return () => clearInterval(id);
  }, [targetTime]);

  /* ── background health poll ──────────────────────────────────────── */
  const checkHealth = useCallback(async () => {
    setChecking(true);
    try {
      const res = await fetch('/api/auth/session', { method: 'GET' });
      // Any non-network response means the server is up.
      if (res.ok || res.status === 401 || res.status === 403) {
        setIsBack(true);
        setTimeout(() => onServerBack?.(), 1_800);
      }
    } catch {
      // still down
    } finally {
      setChecking(false);
    }
  }, [onServerBack]);

  useEffect(() => {
    const id = setInterval(checkHealth, pollInterval);
    return () => clearInterval(id);
  }, [checkHealth, pollInterval]);

  const handleManualRetry = () => {
    setManualRetries((n) => n + 1);
    void checkHealth();
  };

  /* ── render ──────────────────────────────────────────────────────── */
  return (
    <div className="server-down-root">
      {/* Animated background particles */}
      <div className="server-down-particles" aria-hidden>
        {Array.from({ length: 20 }).map((_, i) => (
          <span
            key={i}
            className="server-down-particle"
            style={{
              '--x': `${Math.random() * 100}%`,
              '--y': `${Math.random() * 100}%`,
              '--size': `${2 + Math.random() * 4}px`,
              '--delay': `${Math.random() * 6}s`,
              '--duration': `${4 + Math.random() * 6}s`,
            } as React.CSSProperties}
          />
        ))}
      </div>

      <div className={`server-down-card ${isBack ? 'is-back' : ''}`}>
        {/* Status icon */}
        <div className={`server-down-icon ${isBack ? 'icon-back' : 'icon-down'}`}>
          {isBack ? (
            <CheckCircle2 className="w-10 h-10" />
          ) : (
            <ServerCrash className="w-10 h-10" />
          )}
        </div>

        {/* Heading */}
        <h1 className="server-down-title">
          {isBack ? 'We\'re Back!' : 'System Maintenance'}
        </h1>

        <p className="server-down-subtitle">
          {isBack
            ? 'The Board Governance System is now available. Reconnecting…'
            : 'The Board Governance Management System is temporarily unavailable while we perform scheduled maintenance.'}
        </p>

        {/* Countdown */}
        {!isBack && (
          <div className="server-down-countdown">
            <div className="countdown-label">
              <Clock className="w-4 h-4" />
              <span>Estimated time remaining</span>
            </div>

            <div className="countdown-grid">
              <CountdownUnit value={remaining.hours} label="Hours" />
              <span className="countdown-sep">:</span>
              <CountdownUnit value={remaining.minutes} label="Minutes" />
              <span className="countdown-sep">:</span>
              <CountdownUnit value={remaining.seconds} label="Seconds" />
            </div>
          </div>
        )}

        {/* Connection status */}
        <div className={`server-down-status ${isBack ? 'status-ok' : 'status-waiting'}`}>
          {isBack ? (
            <>
              <Wifi className="w-4 h-4" />
              <span>Connection restored</span>
            </>
          ) : checking ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span>Checking server status…</span>
            </>
          ) : (
            <>
              <WifiOff className="w-4 h-4" />
              <span>Waiting for server…</span>
            </>
          )}
        </div>

        {/* Retry button */}
        {!isBack && (
          <button className="server-down-retry" onClick={handleManualRetry} disabled={checking}>
            <RefreshCw className={`w-4 h-4 ${checking ? 'animate-spin' : ''}`} />
            Try Now
          </button>
        )}

        {/* Progress bar (auto-poll visual) */}
        {!isBack && (
          <div className="server-down-progress-track">
            <div
              className="server-down-progress-bar"
              key={manualRetries}
              style={{ animationDuration: `${pollInterval}ms` }}
            />
          </div>
        )}

        {/* Footer */}
        <p className="server-down-footer">
          {isBack
            ? 'Thank you for your patience.'
            : 'The page will refresh automatically once the server is online.'}
        </p>
      </div>

      {/* Inline styles — self-contained, no globals needed */}
      <style>{styles}</style>
    </div>
  );
};

/* ── helpers ───────────────────────────────────────────────────────── */

function computeRemaining(target: Date) {
  const diff = Math.max(0, target.getTime() - Date.now());
  return {
    hours: Math.floor(diff / 3_600_000),
    minutes: Math.floor((diff % 3_600_000) / 60_000),
    seconds: Math.floor((diff % 60_000) / 1_000),
    total: diff,
  };
}

const CountdownUnit: React.FC<{ value: number; label: string }> = ({ value, label }) => (
  <div className="countdown-unit">
    <span className="countdown-value">{String(value).padStart(2, '0')}</span>
    <span className="countdown-unit-label">{label}</span>
  </div>
);

/* ── styles ────────────────────────────────────────────────────────── */

const styles = /* css */ `
  .server-down-root {
    position: fixed;
    inset: 0;
    z-index: 9999;
    display: flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(145deg, #1A130C 0%, #241A11 40%, #2C2016 100%);
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto,
      "Helvetica Neue", Arial, sans-serif;
    -webkit-font-smoothing: antialiased;
    overflow: hidden;
  }

  /* ── floating particles ─────────────────────────────────────────── */
  .server-down-particles { position: absolute; inset: 0; pointer-events: none; }

  .server-down-particle {
    position: absolute;
    left: var(--x);
    top: var(--y);
    width: var(--size);
    height: var(--size);
    border-radius: 50%;
    background: radial-gradient(circle, rgba(216, 154, 22, 0.35), transparent 70%);
    animation: sd-float var(--duration) ease-in-out var(--delay) infinite alternate;
  }

  @keyframes sd-float {
    0%   { transform: translateY(0) scale(1);   opacity: 0.25; }
    100% { transform: translateY(-40px) scale(1.3); opacity: 0.55; }
  }

  /* ── card ────────────────────────────────────────────────────────── */
  .server-down-card {
    position: relative;
    z-index: 1;
    max-width: 460px;
    width: 92%;
    padding: 2.5rem 2rem;
    text-align: center;
    background: rgba(36, 26, 17, 0.72);
    backdrop-filter: blur(24px) saturate(140%);
    border: 1px solid rgba(184, 147, 52, 0.18);
    border-radius: 1.25rem;
    box-shadow:
      0 0 0 1px rgba(216, 154, 22, 0.06),
      0 24px 80px -12px rgba(0, 0, 0, 0.55);
    transition: border-color 0.6s, box-shadow 0.6s;
  }

  .server-down-card.is-back {
    border-color: rgba(4, 120, 87, 0.40);
    box-shadow:
      0 0 0 1px rgba(4, 120, 87, 0.12),
      0 0 60px -10px rgba(4, 120, 87, 0.25),
      0 24px 80px -12px rgba(0, 0, 0, 0.55);
  }

  /* ── icon ────────────────────────────────────────────────────────── */
  .server-down-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 72px;
    height: 72px;
    border-radius: 50%;
    margin-bottom: 1.25rem;
    transition: background 0.5s, color 0.5s;
  }

  .icon-down {
    background: rgba(216, 154, 22, 0.12);
    color: #F3BD28;
    animation: sd-pulse 2.4s ease-in-out infinite;
  }

  .icon-back {
    background: rgba(4, 120, 87, 0.16);
    color: #4FBF8B;
    animation: sd-pop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  @keyframes sd-pulse {
    0%, 100% { box-shadow: 0 0 0 0 rgba(216, 154, 22, 0.25); }
    50%      { box-shadow: 0 0 0 14px rgba(216, 154, 22, 0); }
  }

  @keyframes sd-pop {
    0%   { transform: scale(0.6); opacity: 0; }
    100% { transform: scale(1);   opacity: 1; }
  }

  /* ── text ────────────────────────────────────────────────────────── */
  .server-down-title {
    margin: 0 0 0.5rem;
    font-size: 1.5rem;
    font-weight: 700;
    color: #F5EDE1;
    letter-spacing: -0.01em;
  }

  .server-down-subtitle {
    margin: 0 0 1.75rem;
    font-size: 0.875rem;
    line-height: 1.6;
    color: #A89179;
  }

  /* ── countdown ──────────────────────────────────────────────────── */
  .server-down-countdown {
    margin-bottom: 1.5rem;
  }

  .countdown-label {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #9A876F;
    margin-bottom: 0.75rem;
  }

  .countdown-grid {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.25rem;
  }

  .countdown-unit {
    display: flex;
    flex-direction: column;
    align-items: center;
    min-width: 72px;
  }

  .countdown-value {
    font-size: 2.5rem;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
    line-height: 1;
    background: linear-gradient(180deg, #F3BD28 0%, #B89334 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  .countdown-unit-label {
    font-size: 0.6875rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: #6B5940;
    margin-top: 0.25rem;
  }

  .countdown-sep {
    font-size: 2rem;
    font-weight: 700;
    color: #6B5940;
    padding-bottom: 1rem;
    animation: sd-blink 1s step-end infinite;
  }

  @keyframes sd-blink {
    0%, 100% { opacity: 1; }
    50%      { opacity: 0.2; }
  }

  /* ── status chip ────────────────────────────────────────────────── */
  .server-down-status {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.375rem 0.875rem;
    border-radius: 999px;
    font-size: 0.75rem;
    font-weight: 500;
    margin-bottom: 1.25rem;
    transition: background 0.4s, color 0.4s;
  }

  .status-waiting {
    background: rgba(216, 154, 22, 0.10);
    color: #D89A16;
  }

  .status-ok {
    background: rgba(4, 120, 87, 0.14);
    color: #4FBF8B;
  }

  /* ── retry button ───────────────────────────────────────────────── */
  .server-down-retry {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.625rem 1.5rem;
    border: 1px solid rgba(184, 147, 52, 0.28);
    border-radius: 0.625rem;
    background: rgba(184, 147, 52, 0.08);
    color: #F3BD28;
    font-size: 0.8125rem;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.2s, border-color 0.2s, transform 0.15s;
    margin-bottom: 1.25rem;
  }

  .server-down-retry:hover:not(:disabled) {
    background: rgba(184, 147, 52, 0.18);
    border-color: rgba(184, 147, 52, 0.40);
    transform: translateY(-1px);
  }

  .server-down-retry:active:not(:disabled) {
    transform: translateY(0);
  }

  .server-down-retry:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* ── progress bar (auto-poll interval) ──────────────────────────── */
  .server-down-progress-track {
    width: 100%;
    height: 3px;
    background: rgba(184, 147, 52, 0.08);
    border-radius: 999px;
    overflow: hidden;
    margin-bottom: 1.25rem;
  }

  .server-down-progress-bar {
    height: 100%;
    border-radius: 999px;
    background: linear-gradient(90deg, #D89A16, #F3BD28);
    animation: sd-fill linear forwards;
    animation-duration: inherit;
  }

  @keyframes sd-fill {
    0%   { width: 0; }
    100% { width: 100%; }
  }

  /* ── footer ─────────────────────────────────────────────────────── */
  .server-down-footer {
    margin: 0;
    font-size: 0.75rem;
    color: #6B5940;
  }

  /* ── reduced motion ─────────────────────────────────────────────── */
  @media (prefers-reduced-motion: reduce) {
    .server-down-particle,
    .icon-down,
    .countdown-sep { animation: none !important; }
  }
`;
