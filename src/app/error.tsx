'use client';

import { AlertTriangle } from 'lucide-react';

/**
 * Error boundary for every page under the root layout.
 *
 * Replaces the framework's built-in error screen, whose wording and markup
 * identify the framework (security assessment VA-009) and which draws itself
 * with inline style attributes the CSP refuses (VA-005).
 *
 * Shows nothing about the failure. In production a server error reaches the
 * browser as a generic message plus a digest; only the digest is shown, so it
 * can be quoted to an administrator and matched to the server log.
 */
export default function ErrorPage({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <main className="min-h-screen bg-app text-ink flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl border border-line bg-st-late-bg">
          <AlertTriangle className="h-8 w-8 text-st-late" aria-hidden="true" />
        </div>
        <h1 className="mb-3 text-2xl font-extrabold">Something Went Wrong</h1>
        <p className="mb-2 text-sm leading-relaxed text-ink-2">
          The request could not be completed. Please try again; if it keeps happening, contact the
          System Administrator.
        </p>
        {error.digest && (
          <p className="mb-8 font-mono text-[11px] text-ink-3">Reference: {error.digest}</p>
        )}
        <button
          type="button"
          onClick={() => retry()}
          className="inline-flex items-center justify-center rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Try again
        </button>
      </div>
    </main>
  );
}
