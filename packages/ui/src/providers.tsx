'use client';

import { useState, type ReactNode } from 'react';
import {
  defaultCssVariablesResolver,
  MantineProvider,
  type CSSVariablesResolver,
} from '@mantine/core';
import { NextIntlClientProvider, type AbstractIntlMessages } from 'next-intl';

import { createUiStore, UiStoreContext } from './store';
import { theme } from './theme';
import type { AppLocale } from './types';

type ApplicationProvidersProps = {
  children: ReactNode;
  locale: AppLocale;
  messages: AbstractIntlMessages;
};

const cssVariablesResolver: CSSVariablesResolver = (resolvedTheme) => {
  const defaults = defaultCssVariablesResolver(resolvedTheme);

  return {
    variables: defaults.variables,
    light: {
      ...defaults.light,
      '--mantine-color-dimmed': resolvedTheme.colors.gray[7],
    },
    dark: {
      ...defaults.dark,
      '--mantine-color-dimmed': resolvedTheme.colors.dark[1],
    },
  };
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
        <MantineProvider
          cssVariablesResolver={cssVariablesResolver}
          defaultColorScheme="auto"
          theme={theme}
        >
          {children}
        </MantineProvider>
      </UiStoreContext.Provider>
    </NextIntlClientProvider>
  );
}
