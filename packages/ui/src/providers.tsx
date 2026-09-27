'use client';

import { useState, type ReactNode } from 'react';
import { MantineProvider } from '@mantine/core';
import { NextIntlClientProvider, type AbstractIntlMessages } from 'next-intl';

import { createUiStore, UiStoreContext } from './store';
import { theme } from './theme';
import type { AppLocale } from './types';

type ApplicationProvidersProps = {
  children: ReactNode;
  locale: AppLocale;
  messages: AbstractIntlMessages;
};

export function ApplicationProviders({
  children,
  locale,
  messages,
}: ApplicationProvidersProps) {
  const [store] = useState(() => createUiStore(locale));

  return (
    <NextIntlClientProvider locale={locale} messages={messages} timeZone="UTC">
      <UiStoreContext.Provider value={store}>
        <MantineProvider defaultColorScheme="auto" theme={theme}>
          {children}
        </MantineProvider>
      </UiStoreContext.Provider>
    </NextIntlClientProvider>
  );
}
