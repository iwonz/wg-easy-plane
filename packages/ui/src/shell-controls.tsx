'use client';

import { Group, SegmentedControl, Select } from '@mantine/core';
import { useMantineColorScheme } from '@mantine/core';
import { useMounted } from '@mantine/hooks';
import { observer } from 'mobx-react-lite';
import { useTranslations } from 'next-intl';

import { useUiStore } from './store';
import type { AppLocale } from './types';

export const ShellControls = observer(function ShellControls() {
  const t = useTranslations('shell');
  const store = useUiStore();
  const { colorScheme, setColorScheme } = useMantineColorScheme();
  const mounted = useMounted();

  const changeLocale = (locale: string | null) => {
    if (locale !== 'en' && locale !== 'ru') return;
    document.cookie = `locale=${locale}; Path=/; Max-Age=31536000; SameSite=Lax`;
    store.setLocale(locale as AppLocale);
    window.location.reload();
  };

  return (
    <Group justify="space-between" gap="md">
      <Select
        aria-label={t('language')}
        data={[
          { value: 'en', label: 'English' },
          { value: 'ru', label: 'Русский' },
        ]}
        onChange={changeLocale}
        value={store.locale}
      />
      <SegmentedControl
        aria-label={t('colorScheme')}
        data={[
          { label: t('light'), value: 'light' },
          { label: t('dark'), value: 'dark' },
          { label: t('system'), value: 'auto' },
        ]}
        onChange={(value) => setColorScheme(value as 'light' | 'dark' | 'auto')}
        value={mounted ? colorScheme : 'auto'}
      />
    </Group>
  );
});
