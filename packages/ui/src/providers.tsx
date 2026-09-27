'use client';

import { useEffect, useState, type ReactNode } from 'react';
import {
  defaultCssVariablesResolver,
  MantineProvider,
  type CSSVariablesResolver,
} from '@mantine/core';
import { NextIntlClientProvider, type AbstractIntlMessages } from 'next-intl';
import { observer } from 'mobx-react-lite';

import { createUiStore, UiStoreContext } from './store';
import { theme } from './theme';
import type { AppLocale } from './types';

type ApplicationProvidersProps = {
  children: ReactNode;
  locale: AppLocale;
  messages: Record<AppLocale, AbstractIntlMessages>;
};

type LocalizedIntlProviderProps = ApplicationProvidersProps & {
  store: ReturnType<typeof createUiStore>;
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
    <UiStoreContext.Provider value={store}>
      <LocalizedIntlProvider locale={locale} messages={messages} store={store}>
        <MantineProvider
          cssVariablesResolver={cssVariablesResolver}
          defaultColorScheme="auto"
          theme={theme}
        >
          {children}
        </MantineProvider>
      </LocalizedIntlProvider>
    </UiStoreContext.Provider>
  );
}

const LocalizedIntlProvider = observer(function LocalizedIntlProvider({
  children,
  messages,
  store,
}: LocalizedIntlProviderProps) {
  useEffect(() => {
    document.documentElement.lang = store.locale;
  }, [store.locale]);

  return (
    <NextIntlClientProvider
      locale={store.locale}
      messages={messages[store.locale]}
      timeZone="UTC"
    >
      {children}
    </NextIntlClientProvider>
  );
});
