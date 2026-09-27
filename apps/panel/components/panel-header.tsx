'use client';

import {
  Avatar,
  Box,
  Group,
  Image,
  Menu,
  Text,
  UnstyledButton,
} from '@mantine/core';
import { ShellControls } from '@wg-easy-plane/ui';
import { useTranslations } from 'next-intl';

import { IconKey, IconLogout } from './icons';

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
        <Group gap="sm" wrap="nowrap">
          <Image alt="" h={44} src="/logo.png" w={44} />
          <Text fw={800} size="lg">
            WG Easy Plane
          </Text>
        </Group>
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
                <Menu.Item
                  leftSection={<IconKey size={16} />}
                  onClick={onOpenTokens}
                >
                  {t('tokens')}
                </Menu.Item>
                <Menu.Item
                  color="red"
                  disabled={loggingOut}
                  leftSection={<IconLogout size={16} />}
                  onClick={onLogout}
                >
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
