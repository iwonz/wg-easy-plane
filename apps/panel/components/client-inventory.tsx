'use client';

import {
  Alert,
  Badge,
  Button,
  Checkbox,
  Group,
  Loader,
  Modal,
  MultiSelect,
  Paper,
  Select,
  Stack,
  Table,
  Tabs,
  Text,
  TextInput,
} from '@mantine/core';
import type {
  AmbiguousCreateCandidate,
  DiscoveredClient,
  ManagedClient,
  ManagedPlacement,
} from '@wg-easy-plane/contracts';
import { segmentedTabsStyles } from '@wg-easy-plane/ui';
import { observer } from 'mobx-react-lite';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

import { InventoryStore } from '../stores/inventory-store';
import { AdvancedPlacementEditor } from './advanced-placement-editor';
import { DriftResolutionDialog } from './drift-resolution-dialog';
import { IconAction, IconLinkAction } from './icon-action';
import {
  IconDownload,
  IconInspect,
  IconLink,
  IconPencil,
  IconPlus,
  IconPower,
  IconQrCode,
  IconRefresh,
  IconSliders,
  IconTrash,
  IconUnlink,
} from './icons';
import { QrCodeDialog } from './qr-code-dialog';
import type { QrCodeTarget } from './qr-code-dialog';
import { SubscriptionLinkDialog } from './subscription-link-dialog';
import type { SubscriptionLinkTarget } from './subscription-link-dialog';

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
  const [createOpened, setCreateOpened] = useState(false);
  const [name, setName] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [nodeIds, setNodeIds] = useState<string[]>([]);
  const [editClient, setEditClient] = useState<ManagedClient | null>(null);
  const [placementClientId, setPlacementClientId] = useState<string | null>(
    null,
  );
  const [placementNodeId, setPlacementNodeId] = useState<string | null>(null);
  const [resolution, setResolution] = useState<{
    clientId: string;
    placement: ManagedPlacement;
  } | null>(null);
  const [candidates, setCandidates] = useState<AmbiguousCreateCandidate[]>([]);
  const [candidatesLoading, setCandidatesLoading] = useState(false);
  const [advancedTarget, setAdvancedTarget] = useState<{
    clientId: string;
    placement: ManagedPlacement;
  } | null>(null);
  const [driftTarget, setDriftTarget] = useState<{
    clientId: string;
    placement: ManagedPlacement;
  } | null>(null);
  const [adoptOpened, setAdoptOpened] = useState(false);
  const [adoptionSelections, setAdoptionSelections] = useState<
    DiscoveredClient[]
  >([]);
  const [adoptionName, setAdoptionName] = useState('');
  const [adoptionExpiresAt, setAdoptionExpiresAt] = useState('');
  const [adoptionEnabled, setAdoptionEnabled] = useState(true);
  const [qrTarget, setQrTarget] = useState<QrCodeTarget | null>(null);
  const [subscriptionTarget, setSubscriptionTarget] =
    useState<SubscriptionLinkTarget | null>(null);

  useEffect(() => {
    void store.loadAll();
  }, [store]);

  const nodeOptions = store.nodes.map((node) => ({
    value: node.id,
    label: `${node.name} · ${node.status}`,
    disabled: node.status !== 'healthy' || node.detectedVersion !== '15.4.0',
  }));

  const submitCreate = async () => {
    const success = await store.createManaged({
      name,
      expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
      nodeIds,
    });
    if (success) {
      setCreateOpened(false);
      setName('');
      setExpiresAt('');
      setNodeIds([]);
    }
  };

  const openEdit = (client: ManagedClient) => {
    setName(client.name);
    setExpiresAt(client.expiresAt ? client.expiresAt.slice(0, 16) : '');
    setEditClient(client);
  };

  const submitEdit = async () => {
    if (!editClient) return;
    const success = await store.updateManaged(editClient.id, {
      name,
      expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
    });
    if (success) {
      setEditClient(null);
      setName('');
      setExpiresAt('');
    }
  };

  const openResolution = async (
    clientId: string,
    placement: ManagedPlacement,
  ) => {
    setResolution({ clientId, placement });
    setCandidatesLoading(true);
    try {
      setCandidates(await store.listCandidates(clientId, placement.id));
    } catch {
      setCandidates([]);
    } finally {
      setCandidatesLoading(false);
    }
  };

  const toggleAdoption = (candidate: DiscoveredClient, checked: boolean) => {
    setAdoptionSelections((current) => {
      const withoutNode = current.filter(
        (selection) => selection.nodeId !== candidate.nodeId,
      );
      return checked ? [...withoutNode, candidate] : withoutNode;
    });
    if (checked && !adoptionName) setAdoptionName(candidate.publicData.name);
  };

  const submitAdoption = async () => {
    const success = await store.adoptManaged({
      name: adoptionName,
      expiresAt: adoptionExpiresAt
        ? new Date(adoptionExpiresAt).toISOString()
        : null,
      enabled: adoptionEnabled,
      selections: adoptionSelections.map((selection) => ({
        nodeId: selection.nodeId,
        remoteClientId: selection.remoteClientId,
      })),
    });
    if (success) {
      setAdoptOpened(false);
      setAdoptionSelections([]);
      setAdoptionName('');
      setAdoptionExpiresAt('');
      setAdoptionEnabled(true);
    }
  };

  return (
    <Paper p="xl" radius="lg" shadow="sm" withBorder>
      <Stack gap="lg">
        <Group justify="space-between" align="center">
          <Text c="dimmed">{t('description')}</Text>
          <Button
            loading={store.loading || store.managedLoading}
            onClick={() => void store.loadAll()}
            variant="light"
          >
            {t('refresh')}
          </Button>
        </Group>

        {store.failure || store.managedFailure ? (
          <Alert color="red" onClose={store.clearFailure} withCloseButton>
            {t('loadFailure')}
          </Alert>
        ) : null}

        <Tabs
          defaultValue="discovered"
          styles={segmentedTabsStyles}
          variant="pills"
        >
          <Tabs.List>
            <Tabs.Tab value="managed">{t('tabs.managed')}</Tabs.Tab>
            <Tabs.Tab value="discovered">{t('tabs.discovered')}</Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel pt="md" value="managed">
            <Stack gap="md">
              <Group justify="space-between">
                <Text c="dimmed">{t('managedDescription')}</Text>
                <Button
                  onClick={() => setCreateOpened(true)}
                  disabled={nodeOptions.length === 0}
                >
                  {t('create')}
                </Button>
              </Group>
              {store.managedLoading && store.managedItems.length === 0 ? (
                <Group justify="center">
                  <Loader aria-label={t('managedLoading')} />
                </Group>
              ) : store.managedItems.length === 0 ? (
                <Text c="dimmed">{t('managedEmpty')}</Text>
              ) : (
                store.managedItems.map((client) => (
                  <Paper key={client.id} withBorder p="md" radius="md">
                    <Stack gap="sm">
                      <Group justify="space-between" align="flex-start">
                        <div>
                          <Group gap="xs">
                            <Text fw={700}>{client.name}</Text>
                            <Badge
                              color={client.enabled ? 'green' : 'gray'}
                              variant="light"
                            >
                              {client.enabled
                                ? t('states.enabled')
                                : t('states.disabled')}
                            </Badge>
                            {client.lifecycleStatus === 'deleting' ? (
                              <Badge color="orange" variant="light">
                                {t('states.deleting')}
                              </Badge>
                            ) : null}
                          </Group>
                          <Text c="dimmed" size="sm">
                            {t('expiresValue', {
                              value: formatDate(client.expiresAt),
                            })}
                          </Text>
                        </div>
                        <Group gap="xs">
                          <IconAction
                            label={t('subscription.open')}
                            onClick={() =>
                              setSubscriptionTarget({
                                clientId: client.id,
                                clientName: client.name,
                              })
                            }
                            disabled={client.lifecycleStatus === 'deleting'}
                            variant="light"
                          >
                            <IconLink />
                          </IconAction>
                          <IconAction
                            label={t('edit')}
                            onClick={() => openEdit(client)}
                            disabled={client.lifecycleStatus === 'deleting'}
                          >
                            <IconPencil />
                          </IconAction>
                          <IconAction
                            label={client.enabled ? t('disable') : t('enable')}
                            onClick={() =>
                              void store.setManagedEnabled(
                                client,
                                !client.enabled,
                              )
                            }
                            loading={store.mutating}
                            disabled={client.lifecycleStatus === 'deleting'}
                            variant="light"
                          >
                            <IconPower />
                          </IconAction>
                          <IconAction
                            label={t('addPlacement')}
                            onClick={() => setPlacementClientId(client.id)}
                            disabled={client.lifecycleStatus === 'deleting'}
                            variant="light"
                          >
                            <IconPlus />
                          </IconAction>
                          <IconAction
                            color="red"
                            label={t('delete')}
                            onClick={() => void store.deleteManaged(client.id)}
                            loading={store.mutating}
                            variant="light"
                          >
                            <IconTrash />
                          </IconAction>
                        </Group>
                      </Group>
                      <Table.ScrollContainer minWidth={680}>
                        <Table verticalSpacing="xs">
                          <Table.Thead>
                            <Table.Tr>
                              <Table.Th>{t('columns.node')}</Table.Th>
                              <Table.Th>{t('columns.remoteId')}</Table.Th>
                              <Table.Th>{t('columns.state')}</Table.Th>
                              <Table.Th>{t('columns.actions')}</Table.Th>
                            </Table.Tr>
                          </Table.Thead>
                          <Table.Tbody>
                            {client.placements.map((placement) => (
                              <Table.Tr key={placement.id}>
                                <Table.Td>{placement.nodeName}</Table.Td>
                                <Table.Td>
                                  {placement.remoteClientId ?? '—'}
                                </Table.Td>
                                <Table.Td>
                                  <Stack gap={2}>
                                    <Badge
                                      color={
                                        placement.status === 'active'
                                          ? 'green'
                                          : placement.status === 'ambiguous'
                                            ? 'yellow'
                                            : 'orange'
                                      }
                                      variant="light"
                                    >
                                      {t(`placementStates.${placement.status}`)}
                                    </Badge>
                                    {placement.lastErrorCode ? (
                                      <Text c="dimmed" size="xs">
                                        {placement.lastErrorCode}
                                      </Text>
                                    ) : null}
                                  </Stack>
                                </Table.Td>
                                <Table.Td>
                                  <Group gap="xs">
                                    {placement.remoteClientId !== null &&
                                    ['active', 'drift', 'error'].includes(
                                      placement.status,
                                    ) ? (
                                      <>
                                        <IconLinkAction
                                          label={t('delivery.download')}
                                          href={`/api/v1/clients/managed/${client.id}/placements/${placement.id}/configuration`}
                                          download
                                        >
                                          <IconDownload />
                                        </IconLinkAction>
                                        <IconAction
                                          label={t('delivery.qr')}
                                          onClick={() =>
                                            setQrTarget({
                                              label: `${client.name} · ${placement.nodeName}`,
                                              url: `/api/v1/clients/managed/${client.id}/placements/${placement.id}/qrcode.svg`,
                                            })
                                          }
                                          variant="light"
                                        >
                                          <IconQrCode />
                                        </IconAction>
                                      </>
                                    ) : null}
                                    {placement.remoteClientId !== null &&
                                    placement.status !== 'ambiguous' &&
                                    placement.status !== 'deleting' &&
                                    placement.status !== 'missing' ? (
                                      <IconAction
                                        label={t('advanced.open')}
                                        onClick={() =>
                                          setAdvancedTarget({
                                            clientId: client.id,
                                            placement,
                                          })
                                        }
                                        variant="light"
                                      >
                                        <IconSliders />
                                      </IconAction>
                                    ) : null}
                                    {placement.status === 'ambiguous' ? (
                                      <IconAction
                                        label={t('resolve')}
                                        onClick={() =>
                                          void openResolution(
                                            client.id,
                                            placement,
                                          )
                                        }
                                        variant="light"
                                      >
                                        <IconLink />
                                      </IconAction>
                                    ) : placement.status === 'drift' ||
                                      placement.status === 'missing' ? (
                                      <IconAction
                                        label={t('drift.inspect')}
                                        onClick={() =>
                                          setDriftTarget({
                                            clientId: client.id,
                                            placement,
                                          })
                                        }
                                        variant="light"
                                      >
                                        <IconInspect />
                                      </IconAction>
                                    ) : placement.status !== 'active' ? (
                                      <IconAction
                                        label={t('retry')}
                                        onClick={() =>
                                          void store.retryPlacement(
                                            client.id,
                                            placement.id,
                                          )
                                        }
                                        loading={store.mutating}
                                        variant="light"
                                      >
                                        <IconRefresh />
                                      </IconAction>
                                    ) : null}
                                    {client.lifecycleStatus === 'active' &&
                                    placement.status !== 'ambiguous' ? (
                                      <IconAction
                                        color="red"
                                        label={t('removePlacement')}
                                        onClick={() =>
                                          void store.removePlacement(
                                            client.id,
                                            placement.id,
                                          )
                                        }
                                        loading={store.mutating}
                                      >
                                        <IconUnlink />
                                      </IconAction>
                                    ) : null}
                                  </Group>
                                </Table.Td>
                              </Table.Tr>
                            ))}
                          </Table.Tbody>
                        </Table>
                      </Table.ScrollContainer>
                    </Stack>
                  </Paper>
                ))
              )}
              {store.managedNextCursor ? (
                <Button
                  variant="light"
                  onClick={() => void store.loadManaged(false)}
                  loading={store.managedLoading}
                >
                  {t('loadMore')}
                </Button>
              ) : null}
            </Stack>
          </Tabs.Panel>

          <Tabs.Panel pt="md" value="discovered">
            <Group justify="flex-end" mb="md">
              <Button
                variant="light"
                onClick={() => setAdoptOpened(true)}
                disabled={
                  store.items.filter((item) => item.missingAt === null)
                    .length === 0
                }
              >
                {t('adoption.open')}
              </Button>
            </Group>
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
                        <Table.Th>{t('columns.actions')}</Table.Th>
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
                          <Table.Td>
                            {item.missingAt === null ? (
                              <Group gap="xs">
                                <IconLinkAction
                                  label={t('delivery.download')}
                                  href={`/api/v1/clients/discovered/${item.nodeId}/${item.remoteClientId}/configuration`}
                                  download
                                >
                                  <IconDownload />
                                </IconLinkAction>
                                <IconAction
                                  label={t('delivery.qr')}
                                  onClick={() =>
                                    setQrTarget({
                                      label: `${item.publicData.name} · ${item.nodeName}`,
                                      url: `/api/v1/clients/discovered/${item.nodeId}/${item.remoteClientId}/qrcode.svg`,
                                    })
                                  }
                                  variant="light"
                                >
                                  <IconQrCode />
                                </IconAction>
                              </Group>
                            ) : null}
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

      <Modal
        opened={createOpened}
        onClose={() => setCreateOpened(false)}
        title={t('createTitle')}
      >
        <Stack>
          <TextInput
            label={t('fields.name')}
            value={name}
            onChange={(event) => setName(event.currentTarget.value)}
            required
          />
          <TextInput
            label={t('fields.expiration')}
            type="datetime-local"
            value={expiresAt}
            onChange={(event) => setExpiresAt(event.currentTarget.value)}
          />
          <MultiSelect
            label={t('fields.nodes')}
            data={nodeOptions}
            value={nodeIds}
            onChange={setNodeIds}
            required
            searchable
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setCreateOpened(false)}>
              {t('cancel')}
            </Button>
            <Button
              onClick={() => void submitCreate()}
              loading={store.mutating}
              disabled={!name.trim() || nodeIds.length === 0}
            >
              {t('create')}
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={editClient !== null}
        onClose={() => setEditClient(null)}
        title={t('editTitle')}
      >
        <Stack>
          <TextInput
            label={t('fields.name')}
            value={name}
            onChange={(event) => setName(event.currentTarget.value)}
            required
          />
          <TextInput
            label={t('fields.expiration')}
            type="datetime-local"
            value={expiresAt}
            onChange={(event) => setExpiresAt(event.currentTarget.value)}
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setEditClient(null)}>
              {t('cancel')}
            </Button>
            <Button
              onClick={() => void submitEdit()}
              loading={store.mutating}
              disabled={!name.trim()}
            >
              {t('save')}
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={placementClientId !== null}
        onClose={() => setPlacementClientId(null)}
        title={t('addPlacementTitle')}
      >
        <Stack>
          <Select
            label={t('fields.node')}
            data={nodeOptions}
            value={placementNodeId}
            onChange={setPlacementNodeId}
            searchable
          />
          <Group justify="flex-end">
            <Button
              variant="default"
              onClick={() => setPlacementClientId(null)}
            >
              {t('cancel')}
            </Button>
            <Button
              loading={store.mutating}
              disabled={!placementNodeId}
              onClick={() => {
                if (placementClientId && placementNodeId) {
                  void store
                    .addPlacement(placementClientId, placementNodeId)
                    .then((success) => {
                      if (success) {
                        setPlacementClientId(null);
                        setPlacementNodeId(null);
                      }
                    });
                }
              }}
            >
              {t('addPlacement')}
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={resolution !== null}
        onClose={() => setResolution(null)}
        title={t('resolveTitle')}
      >
        <Stack>
          <Text c="dimmed" size="sm">
            {t('resolveDescription')}
          </Text>
          {candidatesLoading ? (
            <Loader />
          ) : candidates.length === 0 ? (
            <Text>{t('noCandidates')}</Text>
          ) : (
            candidates.map((candidate) => (
              <Paper key={candidate.remoteClientId} withBorder p="sm">
                <Group justify="space-between">
                  <div>
                    <Text fw={600}>{candidate.name}</Text>
                    <Text c="dimmed" size="xs">
                      #{candidate.remoteClientId} ·{' '}
                      {formatDate(candidate.lastSeenAt)}
                    </Text>
                  </div>
                  <Button
                    size="xs"
                    onClick={() => {
                      if (resolution)
                        void store
                          .linkCandidate(
                            resolution.clientId,
                            resolution.placement.id,
                            candidate.remoteClientId,
                          )
                          .then((success) => {
                            if (success) setResolution(null);
                          });
                    }}
                  >
                    {t('link')}
                  </Button>
                </Group>
              </Paper>
            ))
          )}
          <Group justify="space-between">
            <Button
              color="red"
              variant="light"
              onClick={() => {
                if (resolution)
                  void store
                    .cancelAmbiguous(
                      resolution.clientId,
                      resolution.placement.id,
                    )
                    .then((success) => {
                      if (success) setResolution(null);
                    });
              }}
            >
              {t('cancelPlacement')}
            </Button>
            <Button variant="default" onClick={() => setResolution(null)}>
              {t('close')}
            </Button>
          </Group>
        </Stack>
      </Modal>

      <AdvancedPlacementEditor
        store={store}
        target={advancedTarget}
        onClose={() => setAdvancedTarget(null)}
      />

      <Modal
        opened={adoptOpened}
        onClose={() => setAdoptOpened(false)}
        title={t('adoption.title')}
        size="lg"
      >
        <Stack>
          <Text c="dimmed" size="sm">
            {t('adoption.description')}
          </Text>
          <TextInput
            label={t('fields.name')}
            value={adoptionName}
            onChange={(event) => setAdoptionName(event.currentTarget.value)}
            required
          />
          <TextInput
            label={t('fields.expiration')}
            type="datetime-local"
            value={adoptionExpiresAt}
            onChange={(event) =>
              setAdoptionExpiresAt(event.currentTarget.value)
            }
          />
          <Checkbox
            label={t('adoption.enabled')}
            checked={adoptionEnabled}
            onChange={(event) =>
              setAdoptionEnabled(event.currentTarget.checked)
            }
          />
          <Stack gap="xs">
            {store.items
              .filter((item) => item.missingAt === null)
              .map((item) => {
                const checked = adoptionSelections.some(
                  (selection) =>
                    selection.nodeId === item.nodeId &&
                    selection.remoteClientId === item.remoteClientId,
                );
                return (
                  <Checkbox
                    key={`${item.nodeId}:${item.remoteClientId}`}
                    checked={checked}
                    onChange={(event) =>
                      toggleAdoption(item, event.currentTarget.checked)
                    }
                    label={`${item.nodeName} · ${item.publicData.name} · #${item.remoteClientId}`}
                  />
                );
              })}
          </Stack>
          <Text c="dimmed" size="xs">
            {t('adoption.selected', { count: adoptionSelections.length })}
          </Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setAdoptOpened(false)}>
              {t('cancel')}
            </Button>
            <Button
              loading={store.mutating}
              disabled={!adoptionName.trim() || adoptionSelections.length === 0}
              onClick={() => void submitAdoption()}
            >
              {t('adoption.submit')}
            </Button>
          </Group>
        </Stack>
      </Modal>

      <DriftResolutionDialog
        store={store}
        target={driftTarget}
        onClose={() => setDriftTarget(null)}
      />

      <QrCodeDialog target={qrTarget} onClose={() => setQrTarget(null)} />

      <SubscriptionLinkDialog
        target={subscriptionTarget}
        onClose={() => setSubscriptionTarget(null)}
      />
    </Paper>
  );
});
