import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { cookies, headers } from 'next/headers';
import { ColorSchemeScript } from '@mantine/core';
import { ApplicationProviders, resolveLocale } from '@wg-easy-plane/ui';

import './globals.css';

export const metadata: Metadata = {
  title: 'WG Easy Plane',
  description: 'Multi-node control plane for wg-easy',
};

export default async function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()]);
  const locale = resolveLocale(
    cookieStore.get('locale')?.value,
    headerStore.get('accept-language'),
  );
  const messages = (await import(`../messages/${locale}.json`)).default;

  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        <ColorSchemeScript defaultColorScheme="auto" />
      </head>
      <body>
        <ApplicationProviders locale={locale} messages={messages}>
          {children}
        </ApplicationProviders>
      </body>
    </html>
  );
}
