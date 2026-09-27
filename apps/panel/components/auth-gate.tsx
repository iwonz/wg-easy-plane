'use client';

import { useEffect, useState, type FormEvent } from 'react';
import {
  Alert,
  Badge,
  Button,
  Container,
  Group,
  Loader,
  Paper,
  PasswordInput,
  Stack,
  Tabs,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { observer } from 'mobx-react-lite';
import { useTranslations } from 'next-intl';

import { AuthStore } from '../stores/auth-store';
import { ApiTokenManagement } from './api-token-management';
import { ClientInventory } from './client-inventory';
import { NodeManagement } from './node-management';
import { PanelHeader } from './panel-header';

function failureKey(failure: AuthStore['failure']) {
  if (failure === 'invalid-credentials') return 'invalidCredentials' as const;
  if (failure === 'rate-limited') return 'rateLimited' as const;
  return 'requestFailed' as const;
}

export const AuthGate = observer(function AuthGate() {
  const t = useTranslations();
  const [store] = useState(() => new AuthStore());
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [tokensOpened, setTokensOpened] = useState(false);

  useEffect(() => {
    void store.initialize();
  }, [store]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (store.state === 'setup') void store.setup(username, password);
    if (store.state === 'login') void store.login(username, password);
  };

  let content;

  if (store.state === 'loading') {
    content = (
      <Container p={0} size="sm" w="100%">
        <Paper p="xl" radius="lg" shadow="sm" withBorder>
          <Group justify="center">
            <Loader aria-label={t('auth.loading')} />
          </Group>
        </Paper>
      </Container>
    );
  } else if (store.state === 'error') {
    content = (
      <Container p={0} size="sm" w="100%">
        <Alert color="red" title={t('auth.unavailableTitle')}>
          <Stack gap="md">
            <Text>{t('auth.requestFailed')}</Text>
            <Button onClick={() => void store.initialize()} variant="light">
              {t('auth.retry')}
            </Button>
          </Stack>
        </Alert>
      </Container>
    );
  } else if (store.state === 'authenticated' && store.admin) {
    content = (
      <>
        <Tabs defaultValue="nodes" keepMounted={false}>
          <Tabs.List>
            <Tabs.Tab value="nodes">{t('navigation.nodes')}</Tabs.Tab>
            <Tabs.Tab value="clients">{t('navigation.clients')}</Tabs.Tab>
          </Tabs.List>
          <Tabs.Panel pt="xl" value="nodes">
            <NodeManagement />
          </Tabs.Panel>
          <Tabs.Panel pt="xl" value="clients">
            <ClientInventory />
          </Tabs.Panel>
        </Tabs>
        <ApiTokenManagement
          onClose={() => setTokensOpened(false)}
          opened={tokensOpened}
        />
      </>
    );
  } else {
    const isSetup = store.state === 'setup';
    content = (
      <Container p={0} size="sm" w="100%">
        <Paper p="xl" radius="lg" shadow="sm" withBorder>
          <form onSubmit={submit}>
            <Stack gap="md">
              {!isSetup ? (
                <Badge variant="light">{t('auth.loginBadge')}</Badge>
              ) : null}
              <Title order={1}>
                {isSetup ? t('auth.setupTitle') : t('auth.loginTitle')}
              </Title>
              <Text c="dimmed">
                {isSetup
                  ? t('auth.setupDescription')
                  : t('auth.loginDescription')}
              </Text>
              {store.failure ? (
                <Alert color="red" onClose={store.clearFailure} withCloseButton>
                  {t(`auth.${failureKey(store.failure)}`)}
                </Alert>
              ) : null}
              <TextInput
                autoComplete="username"
                label={t('auth.username')}
                maxLength={64}
                minLength={isSetup ? 3 : 1}
                onChange={(event) => setUsername(event.currentTarget.value)}
                pattern={isSetup ? '[a-z0-9._\\-]{3,64}' : undefined}
                required
                value={username}
              />
              <PasswordInput
                autoComplete={isSetup ? 'new-password' : 'current-password'}
                description={isSetup ? t('auth.passwordHint') : undefined}
                label={t('auth.password')}
                maxLength={128}
                minLength={isSetup ? 12 : 1}
                onChange={(event) => setPassword(event.currentTarget.value)}
                required
                value={password}
              />
              <Button loading={store.submitting} type="submit">
                {isSetup ? t('auth.createAdmin') : t('auth.signIn')}
              </Button>
            </Stack>
          </form>
        </Paper>
      </Container>
    );
  }

  const authenticatedAdmin =
    store.state === 'authenticated' ? store.admin : null;

  return (
    <Container py="md" size="xl">
      <Stack gap="xl">
        <PanelHeader
          loggingOut={store.submitting}
          onLogout={() => {
            setTokensOpened(false);
            void store.logout();
          }}
          onOpenTokens={() => setTokensOpened(true)}
          username={authenticatedAdmin?.username}
        />
        {content}
      </Stack>
    </Container>
  );
});
