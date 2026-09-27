'use client';

import { Badge, Container, Paper, Stack, Text, Title } from '@mantine/core';
import { ShellControls } from '@wg-easy-plane/ui';
import { useTranslations } from 'next-intl';

export default function SubscriptionHome() {
  const t = useTranslations('home');

  return (
    <Container size="sm" py="xl">
      <Stack gap="xl">
        <ShellControls />
        <Paper p="xl" radius="lg" shadow="sm" withBorder>
          <Stack gap="md">
            <Badge variant="light">{t('badge')}</Badge>
            <Title>{t('title')}</Title>
            <Text c="dimmed">{t('description')}</Text>
          </Stack>
        </Paper>
      </Stack>
    </Container>
  );
}
