import { AppShell } from '@/components/AppShell';

/**
 * Rendered per request rather than prerendered.
 *
 * The workspace is entirely behind authentication, so static generation saves
 * nothing — and a prerendered page cannot carry the per-request nonce that the
 * strict Content-Security-Policy requires, which would leave Next.js's own
 * scripts blocked in production.
 */
export const dynamic = 'force-dynamic';

export default function Page() {
  return <AppShell />;
}
