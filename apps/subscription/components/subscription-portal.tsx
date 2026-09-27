'use client';

import {
  Alert,
  Badge,
  Button,
  Container,
  Group,
  Image,
  Loader,
  Modal,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import type { SubscriptionPlacement } from '@wg-easy-plane/contracts';
import { ShellControls } from '@wg-easy-plane/ui';
import { observer } from 'mobx-react-lite';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

import { SubscriptionStore } from '../stores/subscription-store';

const clientLinks = {
  wireguard: 'https://www.wireguard.com/install/',
  amnezia:
    'https://docs.amnezia.org/documentation/instructions/use-amneziawg-app/',
} as const;

function formatDate(value: string | null, locale: string): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function availabilityColor(
  availability: SubscriptionPlacement['availability'],
): string {
  return availability === 'available' ? 'green' : 'orange';
}

export const SubscriptionPortal = observer(function SubscriptionPortal() {
  const t = useTranslations('home');
  const locale = useLocale();
  const [store] = useState(() => new SubscriptionStore());
  const [qrPlacement, setQrPlacement] = useState<SubscriptionPlacement | null>(
    null,
  );

  useEffect(() => {
    void store.initialize(window);
  }, [store]);

  const summary = store.summary;

  return (
    <Container size="lg" py="xl">
      <Stack gap="xl">
        <Group justify="flex-end">
          <ShellControls />
        </Group>

        {store.state === 'idle' ||
        store.state === 'loading' ||
        store.state === 'exchanging' ? (
          <Paper p="xl" radius="lg" shadow="sm" withBorder>
            <Group justify="center" role="status" aria-live="polite">
              <Loader aria-label={t('loading')} />
              <Text>
                {store.state === 'exchanging' ? t('exchanging') : t('loading')}
              </Text>
            </Group>
          </Paper>
        ) : null}

        {store.state === 'unauthorized' ? (
          <Alert color="orange" title={t('invalidTitle')} role="alert">
            <Stack gap="sm">
              <Text>{t('invalidDescription')}</Text>
              <Text size="sm">{t('invalidHelp')}</Text>
            </Stack>
          </Alert>
        ) : null}

        {store.state === 'unavailable' ? (
          <Alert color="red" title={t('unavailableTitle')} role="alert">
            <Stack align="flex-start" gap="sm">
              <Text>{t('unavailableDescription')}</Text>
              <Button variant="light" onClick={() => void store.load()}>
                {t('retry')}
              </Button>
            </Stack>
          </Alert>
        ) : null}

        {store.state === 'ready' && summary ? (
          <>
            <Paper p="xl" radius="lg" shadow="sm" withBorder>
              <Stack gap="md">
                <Group justify="space-between" align="flex-start">
                  <div>
                    <Badge variant="light">{t('badge')}</Badge>
                    <Title mt="sm">{summary.name}</Title>
                    <Text c="dimmed">
                      {t('expires', {
                        value: formatDate(summary.expiresAt, locale),
                      })}
                    </Text>
                  </div>
                  <Stack align="flex-end" gap="xs">
                    <Badge
                      color={summary.status === 'active' ? 'green' : 'orange'}
                      variant="light"
                    >
                      {t(`status.${summary.status}`)}
                    </Badge>
                    <Button
                      size="xs"
                      variant="subtle"
                      onClick={() => void store.logout()}
                    >
                      {t('logout')}
                    </Button>
                  </Stack>
                </Group>
                <Text>{t('description')}</Text>
              </Stack>
            </Paper>

            {summary.placements.length === 0 ? (
              <Alert color="blue" title={t('emptyTitle')}>
                {t('emptyDescription')}
              </Alert>
            ) : (
              <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
                {summary.placements.map((placement) => {
                  const available = placement.availability === 'available';
                  return (
                    <Paper key={placement.id} p="lg" radius="lg" withBorder>
                      <Stack gap="md">
                        <Group justify="space-between" align="flex-start">
                          <div>
                            <Title order={3}>{placement.nodeName}</Title>
                            <Text c="dimmed" size="sm">
                              {placement.nodeMode
                                ? t(`mode.${placement.nodeMode}`)
                                : t('mode.unknown')}
                            </Text>
                          </div>
                          <Badge
                            color={availabilityColor(placement.availability)}
                            variant="light"
                          >
                            {t(`availability.${placement.availability}`)}
                          </Badge>
                        </Group>

                        {!available ? (
                          <Text c="dimmed" size="sm">
                            {t('placementUnavailable')}
                          </Text>
                        ) : null}

                        <Group gap="sm">
                          {available ? (
                            <Button
                              component="a"
                              href={`/api/placements/${placement.id}/configuration`}
                              download
                            >
                              {t('download')}
                            </Button>
                          ) : (
                            <Button disabled>{t('download')}</Button>
                          )}
                          <Button
                            variant="light"
                            disabled={!available}
                            onClick={() => setQrPlacement(placement)}
                          >
                            {t('qr')}
                          </Button>
                          {placement.nodeMode ? (
                            <Button
                              component="a"
                              href={clientLinks[placement.nodeMode]}
                              target="_blank"
                              rel="noreferrer"
                              variant="subtle"
                            >
                              {t('installApp')}
                            </Button>
                          ) : null}
                        </Group>
                      </Stack>
                    </Paper>
                  );
                })}
              </SimpleGrid>
            )}

            <Text c="dimmed" size="xs" ta="center">
              {t('privacyNotice')}
            </Text>
          </>
        ) : null}
      </Stack>

      <Modal
        opened={qrPlacement !== null}
        onClose={() => setQrPlacement(null)}
        title={qrPlacement ? t('qrTitle', { node: qrPlacement.nodeName }) : ''}
        centered
      >
        <Stack>
          <Text c="dimmed" size="sm">
            {t('qrDescription')}
          </Text>
          {qrPlacement ? (
            <Image
              src={`/api/placements/${qrPlacement.id}/qrcode.svg`}
              alt={t('qrAlt', { node: qrPlacement.nodeName })}
              fit="contain"
              mah={420}
            />
          ) : null}
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setQrPlacement(null)}>
              {t('close')}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Container>
  );
});
