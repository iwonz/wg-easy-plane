import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { cookies, headers } from 'next/headers';
import { ColorSchemeScript } from '@mantine/core';
import { ApplicationProviders, resolveLocale } from '@wg-easy-plane/ui';

import './globals.css';

export const metadata: Metadata = {
  title: 'WG Easy Plane Subscription',
  description: 'Read-only VPN subscription portal',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

export default async function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()]);
  const locale = resolveLocale(
    cookieStore.get('locale')?.value,
    headerStore.get('accept-language'),
  );
  const [englishMessages, russianMessages] = await Promise.all([
    import('../messages/en.json'),
    import('../messages/ru.json'),
  ]);

  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        <ColorSchemeScript defaultColorScheme="auto" />
      </head>
      <body>
        <ApplicationProviders
          locale={locale}
          messages={{
            en: englishMessages.default,
            ru: russianMessages.default,
          }}
        >
          {children}
        </ApplicationProviders>
      </body>
    </html>
  );
}
