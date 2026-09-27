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
  Stack,
  Table,
  Text,
  TextInput,
  useModalsStack,
} from '@mantine/core';
import {
  API_TOKEN_SCOPES,
  type ApiTokenMetadata,
  type ApiTokenScope,
} from '@wg-easy-plane/contracts';
import { observer } from 'mobx-react-lite';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState, type FormEvent } from 'react';

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

type ApiTokenManagementProps = {
  opened: boolean;
  onClose: () => void;
};

export const ApiTokenManagement = observer(function ApiTokenManagement({
  opened,
  onClose,
}: ApiTokenManagementProps) {
  const t = useTranslations('tokens');
  const [store] = useState(() => new ApiTokenStore());
  const [revokeCandidate, setRevokeCandidate] =
    useState<ApiTokenMetadata | null>(null);
  const [name, setName] = useState('');
  const [scopes, setScopes] = useState<ApiTokenScope[]>([]);
  const [expiration, setExpiration] = useState('');
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>(
    'idle',
  );
  const stack = useModalsStack(['tokens', 'create', 'revoke']);
  const { close, closeAll, open, register } = stack;

  const resetTransientState = useCallback(() => {
    store.clearSensitiveState();
    store.clearFailure();
    setRevokeCandidate(null);
    setName('');
    setScopes([]);
    setExpiration('');
    setCopyState('idle');
  }, [store]);

  useEffect(() => {
    if (opened) {
      open('tokens');
      void store.load();
    } else {
      closeAll();
      resetTransientState();
    }
  }, [closeAll, open, opened, resetTransientState, store]);

  useEffect(
    () => () => {
      store.clearSensitiveState();
    },
    [store],
  );

  const closeManagement = () => {
    closeAll();
    resetTransientState();
    onClose();
  };

  const closeCreate = () => {
    close('create');
    setName('');
    setScopes([]);
    setExpiration('');
    store.clearFailure();
  };

  const closeRevoke = () => {
    close('revoke');
    setRevokeCandidate(null);
    store.clearFailure();
  };

  const submitCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const expiresAt = expiration ? new Date(expiration).toISOString() : null;
    if (await store.create({ name, scopes, expiresAt })) {
      close('create');
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
    if (await store.revoke(revokeCandidate.id)) closeRevoke();
  };

  return (
    <Modal.Stack>
      <Modal
        {...register('tokens')}
        onClose={closeManagement}
        size="xl"
        title={t('title')}
      >
        <Stack gap="lg">
          <Group justify="space-between" align="flex-start">
            <Text c="dimmed">{t('description')}</Text>
            <Button onClick={() => open('create')}>{t('create')}</Button>
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
                            onClick={() => {
                              setRevokeCandidate(token);
                              open('revoke');
                            }}
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
      </Modal>

      <Modal
        {...register('create')}
        onClose={closeCreate}
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
              <Button onClick={closeCreate} variant="subtle">
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
        {...register('revoke')}
        onClose={closeRevoke}
        title={t('revokeTitle')}
      >
        <Stack gap="md">
          <Text>
            {t('revokeDescription', { name: revokeCandidate?.name ?? '' })}
          </Text>
          <Group justify="flex-end">
            <Button onClick={closeRevoke} variant="subtle">
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
    </Modal.Stack>
  );
});
