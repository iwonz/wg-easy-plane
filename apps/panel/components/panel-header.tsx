'use client';

import { Avatar, Box, Group, Image, Menu, UnstyledButton } from '@mantine/core';
import { ShellControls } from '@wg-easy-plane/ui';
import { useTranslations } from 'next-intl';

type PanelHeaderProps = {
  username?: string;
  onOpenTokens?: () => void;
  onLogout?: () => void;
  loggingOut?: boolean;
};

export function PanelHeader({
  username,
  onOpenTokens,
  onLogout,
  loggingOut = false,
}: PanelHeaderProps) {
  const t = useTranslations('auth');
  const initial = username?.trim().charAt(0).toLocaleUpperCase() || '?';

  return (
    <Box component="header" py="xs">
      <Group justify="space-between" wrap="nowrap">
        <Image alt="WG Easy Plane" h={44} src="/logo.png" w={44} />
        <Group gap="xs" wrap="nowrap">
          <ShellControls />
          {username ? (
            <Menu position="bottom-end" shadow="md" width={180}>
              <Menu.Target>
                <UnstyledButton aria-label={t('profileMenu')}>
                  <Avatar color="violet" radius="xl" size="md">
                    {initial}
                  </Avatar>
                </UnstyledButton>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Item onClick={onOpenTokens}>{t('tokens')}</Menu.Item>
                <Menu.Divider role="separator" />
                <Menu.Item color="red" disabled={loggingOut} onClick={onLogout}>
                  {t('logout')}
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          ) : null}
        </Group>
      </Group>
    </Box>
  );
}
