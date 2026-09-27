'use client';

import {
  Alert,
  Button,
  Group,
  Loader,
  Modal,
  Stack,
  Table,
  Text,
} from '@mantine/core';
import type { ManagedPlacement } from '@wg-easy-plane/contracts';
import { observer } from 'mobx-react-lite';
import { useTranslations } from 'next-intl';
import { useEffect } from 'react';

import type { InventoryStore } from '../stores/inventory-store';

type DriftTarget = {
  clientId: string;
  placement: ManagedPlacement;
};

type DriftResolutionDialogProps = {
  store: InventoryStore;
  target: DriftTarget | null;
  onClose: () => void;
};

function formatValue(value: string | number | boolean | string[] | null) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return value.length > 0 ? value.join(', ') : '[]';
  return String(value);
}

export const DriftResolutionDialog = observer(function DriftResolutionDialog({
  store,
  target,
  onClose,
}: DriftResolutionDialogProps) {
  const t = useTranslations('clients.drift');

  useEffect(() => {
    if (target) void store.loadDrift(target.clientId, target.placement.id);
    else store.clearDrift();
  }, [store, target]);

  const complete = async (
    action: (clientId: string, placementId: string) => Promise<boolean>,
  ) => {
    if (!target) return;
    if (await action(target.clientId, target.placement.id)) onClose();
  };

  return (
    <Modal
      opened={target !== null}
      onClose={onClose}
      title={t('title', { node: target?.placement.nodeName ?? '' })}
      size="lg"
    >
      <Stack>
        {store.driftLoading ? (
          <Group justify="center">
            <Loader aria-label={t('loading')} />
          </Group>
        ) : store.driftFailure || !store.driftState ? (
          <Alert color="red">{t('loadFailure')}</Alert>
        ) : (
          <>
            <Text c="dimmed" size="sm">
              {store.driftState.remote
                ? t('description')
                : t('missingDescription')}
            </Text>
            {store.driftState.remote ? (
              store.driftState.differences.length > 0 ? (
                <Table.ScrollContainer minWidth={560}>
                  <Table verticalSpacing="xs">
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>{t('field')}</Table.Th>
                        <Table.Th>{t('desired')}</Table.Th>
                        <Table.Th>{t('remote')}</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {store.driftState.differences.map((difference) => (
                        <Table.Tr key={difference.field}>
                          <Table.Td>{difference.field}</Table.Td>
                          <Table.Td>{formatValue(difference.desired)}</Table.Td>
                          <Table.Td>{formatValue(difference.remote)}</Table.Td>
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>
                </Table.ScrollContainer>
              ) : (
                <Text>{t('noDifferences')}</Text>
              )
            ) : null}
            <Group justify="space-between">
              <Button variant="default" onClick={onClose}>
                {t('close')}
              </Button>
              {store.driftState.remote ? (
                <Group>
                  <Button
                    variant="light"
                    loading={store.mutating}
                    onClick={() => void complete(store.acceptRemote)}
                  >
                    {t('acceptRemote')}
                  </Button>
                  <Button
                    loading={store.mutating}
                    onClick={() => void complete(store.reapplyDesired)}
                  >
                    {t('reapplyDesired')}
                  </Button>
                </Group>
              ) : (
                <Button
                  loading={store.mutating}
                  onClick={() => void complete(store.recreateMissing)}
                >
                  {t('recreate')}
                </Button>
              )}
            </Group>
          </>
        )}
      </Stack>
    </Modal>
  );
});

export type { DriftTarget };
