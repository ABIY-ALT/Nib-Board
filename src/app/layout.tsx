import type { Metadata } from 'next';
import { headers } from 'next/headers';
import Script from 'next/script';
import { themeBootstrapScript } from '@/context/ThemeContext';
import './globals.css';

export const metadata: Metadata = {
  title: 'Board Governance Management System | NIB International Bank',
  description:
    'Register, route, monitor and audit every direction issued by the Board of Directors of NIB International Bank, from issuance through implementation to formal closure.',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // The production Content-Security-Policy admits inline script only with the
  // per-request nonce src/proxy.ts generates; without it this script is blocked.
  const nonce = (await headers()).get('x-nonce') ?? undefined;

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Applies the stored theme before first paint so the page does not
            flash light before switching to dark. */}
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: themeBootstrapScript }} />
      </head>
      <body>
        <Script id="rt" strategy="beforeInteractive">
          {HIDE_FRAMEWORK_BUILD}
        </Script>
        {children}
      </body>
    </html>
  );
}

/**
 * Next.js publishes its build on the window.next global — the exact version,
 * the bundler, the router flavour — and that is where fingerprinting tools
 * read it (security assessment VA-009). Nothing in the framework reads those
 * fields back. They are the only plain values there; the router state that
 * shares the object (the router instance, a pending URL) is all objects, and
 * is left alone.
 *
 * Deliberately does not spell the field names out: this text ships in every
 * page, and would otherwise advertise exactly what it removes.
 *
 * beforeInteractive scripts run inside the same task that sets those fields,
 * before hydration and before any other script on the page can look. Next.js
 * puts the request's CSP nonce on it.
 */
const HIDE_FRAMEWORK_BUILD =
  "var n=window.next;if(n)for(var k in n)if(typeof n[k]!=='object')delete n[k];";
