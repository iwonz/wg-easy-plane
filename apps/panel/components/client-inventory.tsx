'use client';

import {
  Alert,
  Badge,
  Button,
  Group,
  Loader,
  Paper,
  Stack,
  Table,
  Tabs,
  Text,
  Title,
} from '@mantine/core';
import { observer } from 'mobx-react-lite';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

import { InventoryStore } from '../stores/inventory-store';

function formatDate(value: string | null): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export const ClientInventory = observer(function ClientInventory() {
  const t = useTranslations('clients');
  const [store] = useState(() => new InventoryStore());

  useEffect(() => {
    void store.load();
  }, [store]);

  return (
    <Paper p="xl" radius="lg" shadow="sm" withBorder>
      <Stack gap="lg">
        <Group justify="space-between" align="flex-start">
          <div>
            <Title order={2}>{t('title')}</Title>
            <Text c="dimmed">{t('description')}</Text>
          </div>
          <Button
            loading={store.loading}
            onClick={() => void store.load()}
            variant="light"
          >
            {t('refresh')}
          </Button>
        </Group>

        {store.failure ? (
          <Alert color="red" onClose={store.clearFailure} withCloseButton>
            {t('loadFailure')}
          </Alert>
        ) : null}

        <Tabs defaultValue="discovered">
          <Tabs.List>
            <Tabs.Tab value="managed">{t('tabs.managed')}</Tabs.Tab>
            <Tabs.Tab value="discovered">{t('tabs.discovered')}</Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel pt="md" value="managed">
            <Text c="dimmed">{t('managedPending')}</Text>
          </Tabs.Panel>

          <Tabs.Panel pt="md" value="discovered">
            {store.loading && store.items.length === 0 ? (
              <Group justify="center">
                <Loader aria-label={t('loading')} />
              </Group>
            ) : store.items.length === 0 ? (
              <Text c="dimmed">{t('empty')}</Text>
            ) : (
              <Stack gap="md">
                <Table.ScrollContainer minWidth={820}>
                  <Table highlightOnHover verticalSpacing="sm">
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>{t('columns.client')}</Table.Th>
                        <Table.Th>{t('columns.node')}</Table.Th>
                        <Table.Th>{t('columns.addresses')}</Table.Th>
                        <Table.Th>{t('columns.expiry')}</Table.Th>
                        <Table.Th>{t('columns.seen')}</Table.Th>
                        <Table.Th>{t('columns.state')}</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {store.items.map((item) => (
                        <Table.Tr key={`${item.nodeId}:${item.remoteClientId}`}>
                          <Table.Td>
                            <Stack gap={2}>
                              <Text fw={600}>{item.publicData.name}</Text>
                              <Text c="dimmed" size="xs">
                                #{item.remoteClientId}
                              </Text>
                            </Stack>
                          </Table.Td>
                          <Table.Td>
                            <Stack gap={2}>
                              <Text>{item.nodeName}</Text>
                              <Text c="dimmed" size="xs">
                                {item.nodeMode
                                  ? t(`modes.${item.nodeMode}`)
                                  : '—'}
                              </Text>
                            </Stack>
                          </Table.Td>
                          <Table.Td>
                            <Text size="sm">{item.publicData.ipv4Address}</Text>
                            <Text c="dimmed" size="xs">
                              {item.publicData.ipv6Address}
                            </Text>
                          </Table.Td>
                          <Table.Td>
                            {formatDate(item.publicData.expiresAt)}
                          </Table.Td>
                          <Table.Td>{formatDate(item.lastSeenAt)}</Table.Td>
                          <Table.Td>
                            <Stack gap={4}>
                              <Badge
                                color={
                                  item.missingAt ||
                                  item.nodeStatus !== 'healthy'
                                    ? 'orange'
                                    : 'green'
                                }
                                variant="light"
                              >
                                {item.missingAt
                                  ? t('states.missing')
                                  : item.nodeStatus !== 'healthy'
                                    ? t('states.stale')
                                    : t('states.current')}
                              </Badge>
                              {!item.publicData.enabled ? (
                                <Badge color="gray" variant="light">
                                  {t('states.disabled')}
                                </Badge>
                              ) : null}
                            </Stack>
                          </Table.Td>
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>
                </Table.ScrollContainer>

                {store.nextCursor ? (
                  <Button
                    loading={store.loading}
                    onClick={() => void store.load(false)}
                    variant="light"
                  >
                    {t('loadMore')}
                  </Button>
                ) : null}
              </Stack>
            )}
          </Tabs.Panel>
        </Tabs>
      </Stack>
    </Paper>
  );
});
