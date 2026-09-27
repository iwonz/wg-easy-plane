'use client';

import {
  Alert,
  Badge,
  Button,
  Code,
  Group,
  Loader,
  Modal,
  NumberInput,
  Paper,
  PasswordInput,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import type {
  NodeMetadata,
  NodeProtocol,
  NodeStatus,
  UpdateNodeRequest,
} from '@wg-easy-plane/contracts';
import { observer } from 'mobx-react-lite';
import { useTranslations } from 'next-intl';
import { useEffect, useState, type FormEvent } from 'react';

import { NodeStore } from '../stores/node-store';

const statusColors: Record<NodeStatus, string> = {
  healthy: 'green',
  unreachable: 'gray',
  auth_failed: 'red',
  tls_error: 'red',
  unsupported_version: 'orange',
  api_incompatible: 'orange',
};

function formatDate(value: string | null): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function endpoint(node: NodeMetadata): string {
  const host =
    node.host.includes(':') && !node.host.startsWith('[')
      ? `[${node.host}]`
      : node.host;
  return `${node.protocol}://${host}:${node.port}`;
}

export const NodeManagement = observer(function NodeManagement() {
  const t = useTranslations('nodes');
  const [store] = useState(() => new NodeStore());
  const [editorOpened, setEditorOpened] = useState(false);
  const [editing, setEditing] = useState<NodeMetadata | null>(null);
  const [deleteCandidate, setDeleteCandidate] = useState<NodeMetadata | null>(
    null,
  );
  const [name, setName] = useState('');
  const [protocol, setProtocol] = useState<NodeProtocol>('https');
  const [host, setHost] = useState('');
  const [port, setPort] = useState<string | number>(51821);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  useEffect(() => {
    void store.load();
  }, [store]);

  const clearCredentials = () => {
    setUsername('');
    setPassword('');
  };

  const closeEditor = () => {
    clearCredentials();
    store.clearTestResult();
    setEditorOpened(false);
    setEditing(null);
  };

  const openCreate = () => {
    setEditing(null);
    setName('');
    setProtocol('https');
    setHost('');
    setPort(51821);
    clearCredentials();
    store.clearTestResult();
    setEditorOpened(true);
  };

  const openEdit = (node: NodeMetadata) => {
    setEditing(node);
    setName(node.name);
    setProtocol(node.protocol);
    setHost(node.host);
    setPort(node.port);
    clearCredentials();
    store.clearTestResult();
    setEditorOpened(true);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const numericPort = Number(port);
    let success = false;
    if (editing) {
      const update: UpdateNodeRequest = {};
      if (name.trim() !== editing.name) update.name = name;
      if (protocol !== editing.protocol) update.protocol = protocol;
      if (host.trim() !== editing.host) update.host = host;
      if (numericPort !== editing.port) update.port = numericPort;
      if (username) update.username = username;
      if (password) update.password = password;
      success =
        Object.keys(update).length === 0 ||
        (await store.update(editing.id, update));
    } else {
      success = await store.create({
        name,
        protocol,
        host,
        port: numericPort,
        username,
        password,
      });
    }
    clearCredentials();
    if (success) closeEditor();
  };

  const testConnection = async () => {
    await store.testConnection({
      protocol,
      host,
      port: Number(port),
      username,
      password,
    });
    clearCredentials();
  };

  const confirmDelete = async () => {
    if (!deleteCandidate) return;
    if (await store.delete(deleteCandidate.id)) setDeleteCandidate(null);
  };

  const hasCompatibilityIssue = store.items.some(
    (node) =>
      node.status === 'unsupported_version' ||
      node.status === 'api_incompatible',
  );

  return (
    <>
      <Paper p="xl" radius="lg" shadow="sm" withBorder>
        <Stack gap="lg">
          <Group justify="space-between" align="flex-start">
            <div>
              <Title order={2}>{t('title')}</Title>
              <Text c="dimmed">{t('description')}</Text>
            </div>
            <Button onClick={openCreate}>{t('add')}</Button>
          </Group>

          {hasCompatibilityIssue ? (
            <Alert color="orange" title={t('compatibilityGlobalTitle')}>
              {t('compatibilityGlobalDescription')}
            </Alert>
          ) : null}

          {store.failure ? (
            <Alert color="red" onClose={store.clearFailure} withCloseButton>
              {t(`failures.${store.failure}`)}
            </Alert>
          ) : null}

          {store.loading && store.items.length === 0 ? (
            <Group justify="center">
              <Loader aria-label={t('loading')} />
            </Group>
          ) : store.items.length === 0 ? (
            <Text c="dimmed">{t('empty')}</Text>
          ) : (
            <Table.ScrollContainer minWidth={900}>
              <Table highlightOnHover verticalSpacing="sm">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>{t('columns.name')}</Table.Th>
                    <Table.Th>{t('columns.endpoint')}</Table.Th>
                    <Table.Th>{t('columns.mode')}</Table.Th>
                    <Table.Th>{t('columns.status')}</Table.Th>
                    <Table.Th>{t('columns.checked')}</Table.Th>
                    <Table.Th>{t('columns.actions')}</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {store.items.map((node) => (
                    <Table.Tr key={node.id}>
                      <Table.Td>
                        <Text fw={600}>{node.name}</Text>
                      </Table.Td>
                      <Table.Td>
                        <Code>{endpoint(node)}</Code>
                      </Table.Td>
                      <Table.Td>
                        {node.mode ? t(`modes.${node.mode}`) : '—'}
                      </Table.Td>
                      <Table.Td>
                        <Stack gap={4}>
                          <Badge
                            color={statusColors[node.status]}
                            variant="light"
                          >
                            {t(`statuses.${node.status}`)}
                          </Badge>
                          {node.detectedVersion ? (
                            <Text c="dimmed" size="xs">
                              v{node.detectedVersion}
                            </Text>
                          ) : null}
                        </Stack>
                      </Table.Td>
                      <Table.Td>
                        <Stack gap={2}>
                          <Text size="sm">
                            {t('checkedAt', {
                              value: formatDate(node.lastCheckedAt),
                            })}
                          </Text>
                          <Text c="dimmed" size="xs">
                            {t('syncedAt', {
                              value: formatDate(node.lastSyncedAt),
                            })}
                          </Text>
                        </Stack>
                      </Table.Td>
                      <Table.Td>
                        <Group gap="xs" wrap="nowrap">
                          <Button
                            loading={store.testingNodeId === node.id}
                            onClick={() => void store.retest(node.id)}
                            size="xs"
                            variant="light"
                          >
                            {t('test')}
                          </Button>
                          <Button
                            loading={store.syncingNodeId === node.id}
                            onClick={() => void store.sync(node.id)}
                            size="xs"
                            variant="light"
                          >
                            {t('sync')}
                          </Button>
                          <Button
                            onClick={() => openEdit(node)}
                            size="xs"
                            variant="subtle"
                          >
                            {t('edit')}
                          </Button>
                          <Button
                            color="red"
                            onClick={() => setDeleteCandidate(node)}
                            size="xs"
                            variant="subtle"
                          >
                            {t('delete')}
                          </Button>
                        </Group>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          )}

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
      </Paper>

      <Modal
        onClose={closeEditor}
        opened={editorOpened}
        title={editing ? t('editTitle') : t('addTitle')}
      >
        <form onSubmit={(event) => void submit(event)}>
          <Stack gap="md">
            {store.failure && store.failure !== 'load' ? (
              <Alert color="red" onClose={store.clearFailure} withCloseButton>
                {t(`failures.${store.failure}`)}
              </Alert>
            ) : null}
            <TextInput
              label={t('fields.name')}
              maxLength={80}
              onChange={(event) => setName(event.currentTarget.value)}
              required
              value={name}
            />
            <Select
              allowDeselect={false}
              data={[
                { value: 'https', label: 'HTTPS' },
                { value: 'http', label: 'HTTP' },
              ]}
              label={t('fields.protocol')}
              onChange={(value) =>
                setProtocol(value === 'http' ? 'http' : 'https')
              }
              value={protocol}
            />
            <TextInput
              autoComplete="off"
              description={t('fields.hostHint')}
              label={t('fields.host')}
              maxLength={253}
              onChange={(event) => setHost(event.currentTarget.value)}
              required
              value={host}
            />
            <NumberInput
              allowDecimal={false}
              allowNegative={false}
              label={t('fields.port')}
              max={65535}
              min={1}
              onChange={setPort}
              required
              value={port}
            />
            <TextInput
              autoComplete="off"
              description={editing ? t('fields.credentialEditHint') : undefined}
              label={t('fields.username')}
              maxLength={256}
              onChange={(event) => setUsername(event.currentTarget.value)}
              required={!editing}
              value={username}
            />
            <PasswordInput
              autoComplete="new-password"
              description={editing ? t('fields.credentialEditHint') : undefined}
              label={t('fields.password')}
              maxLength={1024}
              onChange={(event) => setPassword(event.currentTarget.value)}
              required={!editing}
              value={password}
            />
            {store.lastTestResult ? (
              <Alert
                color={
                  store.lastTestResult.status === 'healthy' ? 'green' : 'red'
                }
                title={t(`statuses.${store.lastTestResult.status}`)}
              >
                {store.lastTestResult.detectedVersion
                  ? t('testVersion', {
                      version: store.lastTestResult.detectedVersion,
                    })
                  : t('testNoVersion')}
              </Alert>
            ) : null}
            <Group justify="space-between">
              <Button
                disabled={!username || !password || !host || !port}
                loading={store.submitting}
                onClick={() => void testConnection()}
                type="button"
                variant="light"
              >
                {t('testConnection')}
              </Button>
              <Group gap="xs">
                <Button onClick={closeEditor} type="button" variant="subtle">
                  {t('cancel')}
                </Button>
                <Button loading={store.submitting} type="submit">
                  {editing ? t('save') : t('add')}
                </Button>
              </Group>
            </Group>
          </Stack>
        </form>
      </Modal>

      <Modal
        onClose={() => setDeleteCandidate(null)}
        opened={deleteCandidate !== null}
        title={t('deleteTitle')}
      >
        <Stack gap="md">
          <Text>
            {t('deleteDescription', { name: deleteCandidate?.name ?? '' })}
          </Text>
          <Group justify="flex-end">
            <Button onClick={() => setDeleteCandidate(null)} variant="subtle">
              {t('cancel')}
            </Button>
            <Button
              color="red"
              loading={store.submitting}
              onClick={() => void confirmDelete()}
            >
              {t('confirmDelete')}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
});
