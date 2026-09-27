'use client';

import {
  Alert,
  Badge,
  Button,
  Checkbox,
  Code,
  Group,
  Loader,
  Modal,
  Paper,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import {
  API_TOKEN_SCOPES,
  type ApiTokenMetadata,
  type ApiTokenScope,
} from '@wg-easy-plane/contracts';
import { observer } from 'mobx-react-lite';
import { useTranslations } from 'next-intl';
import { useEffect, useState, type FormEvent } from 'react';

import { ApiTokenStore } from '../stores/api-token-store';

const scopeMessageKeys: Record<ApiTokenScope, string> = {
  'system:read': 'systemRead',
  'nodes:read': 'nodesRead',
  'nodes:write': 'nodesWrite',
  'clients:read': 'clientsRead',
  'clients:write': 'clientsWrite',
  'subscriptions:read': 'subscriptionsRead',
  'subscriptions:write': 'subscriptionsWrite',
  'tokens:manage': 'tokensManage',
};

function tokenStatus(
  token: ApiTokenMetadata,
): 'active' | 'expired' | 'revoked' {
  if (token.revokedAt) return 'revoked';
  if (token.expiresAt && new Date(token.expiresAt).getTime() <= Date.now()) {
    return 'expired';
  }
  return 'active';
}

function formatDate(value: string | null): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export const ApiTokenManagement = observer(function ApiTokenManagement() {
  const t = useTranslations('tokens');
  const [store] = useState(() => new ApiTokenStore());
  const [createOpened, setCreateOpened] = useState(false);
  const [revokeCandidate, setRevokeCandidate] =
    useState<ApiTokenMetadata | null>(null);
  const [name, setName] = useState('');
  const [scopes, setScopes] = useState<ApiTokenScope[]>([]);
  const [expiration, setExpiration] = useState('');
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>(
    'idle',
  );

  useEffect(() => {
    void store.load();
    return () => store.clearSensitiveState();
  }, [store]);

  const submitCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const expiresAt = expiration ? new Date(expiration).toISOString() : null;
    if (await store.create({ name, scopes, expiresAt })) {
      setCreateOpened(false);
      setName('');
      setScopes([]);
      setExpiration('');
      setCopyState('idle');
    }
  };

  const copySecret = async () => {
    if (!store.created) return;
    try {
      await navigator.clipboard.writeText(store.created.token);
      setCopyState('copied');
    } catch {
      setCopyState('failed');
    }
  };

  const confirmRevoke = async () => {
    if (!revokeCandidate) return;
    if (await store.revoke(revokeCandidate.id)) setRevokeCandidate(null);
  };

  return (
    <>
      <Paper p="xl" radius="lg" shadow="sm" withBorder>
        <Stack gap="lg">
          <Group justify="space-between" align="flex-start">
            <div>
              <Title order={2}>{t('title')}</Title>
              <Text c="dimmed">{t('description')}</Text>
            </div>
            <Button onClick={() => setCreateOpened(true)}>{t('create')}</Button>
          </Group>

          {store.created ? (
            <Alert color="yellow" title={t('secretTitle')}>
              <Stack gap="sm">
                <Text>{t('secretDescription')}</Text>
                <Code block data-testid="created-token-secret">
                  {store.created.token}
                </Code>
                {copyState === 'failed' ? (
                  <Text c="red" size="sm">
                    {t('copyFailed')}
                  </Text>
                ) : null}
                <Group>
                  <Button onClick={() => void copySecret()} variant="light">
                    {copyState === 'copied' ? t('copied') : t('copy')}
                  </Button>
                  <Button
                    onClick={() => {
                      store.dismissCreated();
                      setCopyState('idle');
                    }}
                    variant="subtle"
                  >
                    {t('dismiss')}
                  </Button>
                </Group>
              </Stack>
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
            <Table.ScrollContainer minWidth={760}>
              <Table highlightOnHover verticalSpacing="sm">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>{t('columns.name')}</Table.Th>
                    <Table.Th>{t('columns.scopes')}</Table.Th>
                    <Table.Th>{t('columns.expires')}</Table.Th>
                    <Table.Th>{t('columns.lastUsed')}</Table.Th>
                    <Table.Th>{t('columns.status')}</Table.Th>
                    <Table.Th>{t('columns.actions')}</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {store.items.map((token) => {
                    const status = tokenStatus(token);
                    return (
                      <Table.Tr key={token.id}>
                        <Table.Td>
                          <Stack gap={2}>
                            <Text fw={600}>{token.name}</Text>
                            <Code>{token.prefix}</Code>
                          </Stack>
                        </Table.Td>
                        <Table.Td>
                          <Group gap="xs">
                            {token.scopes.map((scope) => (
                              <Badge key={scope} variant="light">
                                {scope}
                              </Badge>
                            ))}
                          </Group>
                        </Table.Td>
                        <Table.Td>{formatDate(token.expiresAt)}</Table.Td>
                        <Table.Td>{formatDate(token.lastUsedAt)}</Table.Td>
                        <Table.Td>
                          <Badge
                            color={status === 'active' ? 'green' : 'gray'}
                            variant="light"
                          >
                            {t(`statuses.${status}`)}
                          </Badge>
                        </Table.Td>
                        <Table.Td>
                          <Button
                            color="red"
                            disabled={status === 'revoked'}
                            onClick={() => setRevokeCandidate(token)}
                            size="xs"
                            variant="subtle"
                          >
                            {t('revoke')}
                          </Button>
                        </Table.Td>
                      </Table.Tr>
                    );
                  })}
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
        onClose={() => setCreateOpened(false)}
        opened={createOpened}
        title={t('createTitle')}
      >
        <form onSubmit={submitCreate}>
          <Stack gap="md">
            <TextInput
              label={t('name')}
              maxLength={80}
              onChange={(event) => setName(event.currentTarget.value)}
              required
              value={name}
            />
            <Checkbox.Group
              label={t('scopeLabel')}
              onChange={(values) => setScopes(values as ApiTokenScope[])}
              required
              value={scopes}
            >
              <Stack gap="xs" mt="xs">
                {API_TOKEN_SCOPES.map((scope) => (
                  <Checkbox
                    key={scope}
                    label={t(`scopes.${scopeMessageKeys[scope]}`)}
                    value={scope}
                  />
                ))}
              </Stack>
            </Checkbox.Group>
            <TextInput
              description={t('expirationHint')}
              label={t('expiration')}
              min={new Date().toISOString().slice(0, 16)}
              onChange={(event) => setExpiration(event.currentTarget.value)}
              type="datetime-local"
              value={expiration}
            />
            <Group justify="flex-end">
              <Button onClick={() => setCreateOpened(false)} variant="subtle">
                {t('cancel')}
              </Button>
              <Button
                disabled={scopes.length === 0}
                loading={store.submitting}
                type="submit"
              >
                {t('create')}
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>

      <Modal
        onClose={() => setRevokeCandidate(null)}
        opened={revokeCandidate !== null}
        title={t('revokeTitle')}
      >
        <Stack gap="md">
          <Text>
            {t('revokeDescription', { name: revokeCandidate?.name ?? '' })}
          </Text>
          <Group justify="flex-end">
            <Button onClick={() => setRevokeCandidate(null)} variant="subtle">
              {t('cancel')}
            </Button>
            <Button
              color="red"
              loading={store.submitting}
              onClick={() => void confirmRevoke()}
            >
              {t('confirmRevoke')}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
});
