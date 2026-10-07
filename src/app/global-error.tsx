'use client';

import './globals.css';

/**
 * Last-resort error page, shown when the root layout itself fails.
 *
 * Replaces the framework's built-in one for the same reasons as ./error.tsx
 * (security assessment VA-005, VA-009). It renders in place of the root
 * layout, so it brings its own <html>, <body> and stylesheet.
 */
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <html lang="en">
      <body>
        <title>Board Governance Management System | NIB International Bank</title>
        <main className="min-h-screen bg-app text-ink flex items-center justify-center px-4">
          <div className="max-w-md w-full text-center">
            <h1 className="mb-3 text-2xl font-extrabold">Something Went Wrong</h1>
            <p className="mb-2 text-sm leading-relaxed text-ink-2">
              The service could not complete the request. Please try again; if it keeps happening,
              contact the System Administrator.
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
      </body>
    </html>
  );
}
