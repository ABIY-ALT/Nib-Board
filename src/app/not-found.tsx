import Link from 'next/link';
import { FileQuestion } from 'lucide-react';

/**
 * 404 for any URL no route matches.
 *
 * Replaces the framework's built-in page, whose wording and markup identify
 * the framework (security assessment VA-009) and which draws itself with
 * inline style attributes the CSP refuses (VA-005).
 */
export default function NotFound() {
  return (
    <main className="min-h-screen bg-app text-ink flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl border border-line bg-surface">
          <FileQuestion className="h-8 w-8 text-ink-3" aria-hidden="true" />
        </div>
        <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-ink-3">Error 404</p>
        <h1 className="mb-3 text-2xl font-extrabold">Page Not Found</h1>
        <p className="mb-8 text-sm leading-relaxed text-ink-2">
          The page you asked for does not exist or is no longer available.
        </p>
        <Link
          href="/"
          className="inline-flex items-center justify-center rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Return to the workspace
        </Link>
      </div>
    </main>
  );
}
