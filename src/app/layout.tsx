import type { Metadata } from 'next';
import { themeBootstrapScript } from '@/context/ThemeContext';
import './globals.css';

export const metadata: Metadata = {
  title: 'Board Governance Management System | NIB International Bank',
  description:
    'Register, route, monitor and audit every direction issued by the Board of Directors of NIB International Bank, from issuance through implementation to formal closure.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Applies the stored theme before first paint so the page does not
            flash light before switching to dark. */}
        <script dangerouslySetInnerHTML={{ __html: themeBootstrapScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
