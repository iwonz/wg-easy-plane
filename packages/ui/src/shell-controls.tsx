'use client';

import {
  ActionIcon,
  Group,
  Tooltip,
  useMantineColorScheme,
  type MantineColorScheme,
} from '@mantine/core';
import { useMounted } from '@mantine/hooks';
import { observer } from 'mobx-react-lite';
import { useTranslations } from 'next-intl';

import { useUiStore } from './store';
import type { AppLocale } from './types';

export function nextLocale(locale: AppLocale): AppLocale {
  return locale === 'en' ? 'ru' : 'en';
}

export function nextColorScheme(
  colorScheme: MantineColorScheme,
): MantineColorScheme {
  if (colorScheme === 'auto') return 'light';
  if (colorScheme === 'light') return 'dark';
  return 'auto';
}

function ThemeIcon({ colorScheme }: { colorScheme: MantineColorScheme }) {
  if (colorScheme === 'light') {
    return (
      <svg
        aria-hidden="true"
        fill="none"
        height="20"
        viewBox="0 0 24 24"
        width="20"
      >
        <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.8" />
        <path
          d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.66 6.34l1.41-1.41"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="1.8"
        />
      </svg>
    );
  }

  if (colorScheme === 'dark') {
    return (
      <svg
        aria-hidden="true"
        fill="none"
        height="20"
        viewBox="0 0 24 24"
        width="20"
      >
        <path
          d="M20.4 15.2A8.5 8.5 0 0 1 8.8 3.6 8.5 8.5 0 1 0 20.4 15.2Z"
          stroke="currentColor"
          strokeLinejoin="round"
          strokeWidth="1.8"
        />
      </svg>
    );
  }

  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="20"
      viewBox="0 0 24 24"
      width="20"
    >
      <rect
        height="13"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.8"
        width="19"
        x="2.5"
        y="3.5"
      />
      <path
        d="M8 20.5h8M12 16.5v4"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

export const ShellControls = observer(function ShellControls() {
  const t = useTranslations('shell');
  const store = useUiStore();
  const { colorScheme, setColorScheme } = useMantineColorScheme();
  const mounted = useMounted();

  const changeLocale = () => {
    const locale = nextLocale(store.locale);
    document.cookie = `locale=${locale}; Path=/; Max-Age=31536000; SameSite=Lax`;
    store.setLocale(locale);
    window.location.reload();
  };

  const selectedColorScheme = mounted ? colorScheme : 'auto';
  const nextTheme = nextColorScheme(selectedColorScheme);
  const localeLabel =
    store.locale === 'en' ? t('switchToRussian') : t('switchToEnglish');
  const themeLabel = t(
    `switchTo${
      nextTheme === 'auto' ? 'System' : nextTheme === 'light' ? 'Light' : 'Dark'
    }`,
  );

  return (
    <Group gap="xs" wrap="nowrap">
      <Tooltip label={themeLabel}>
        <ActionIcon
          aria-label={themeLabel}
          onClick={() => setColorScheme(nextTheme)}
          size="lg"
          variant="subtle"
        >
          <ThemeIcon colorScheme={selectedColorScheme} />
        </ActionIcon>
      </Tooltip>
      <Tooltip label={localeLabel}>
        <ActionIcon
          aria-label={localeLabel}
          onClick={changeLocale}
          size="lg"
          variant="subtle"
        >
          <span aria-hidden="true" style={{ fontSize: '1.15rem' }}>
            {store.locale === 'en' ? '🇬🇧' : '🇷🇺'}
          </span>
        </ActionIcon>
      </Tooltip>
    </Group>
  );
});
