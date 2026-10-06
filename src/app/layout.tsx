import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import { RegisterSW } from '@/components/RegisterSW';
import { I18nProvider } from '@/lib/i18n';

export const metadata: Metadata = {
  title: 'CareLink SCD Ghana',
  description: 'Sickle Cell Disease Screening & Patient Care Management Platform',
  manifest: '/manifest.webmanifest',
  icons: { icon: '/icons/icon-192.png', apple: '/icons/apple-touch-icon.png' },
  appleWebApp: { capable: true, title: 'CareLink', statusBarStyle: 'default' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#047857',
};

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <I18nProvider>{children}</I18nProvider>
        <RegisterSW />
      </body>
    </html>
  );
}
