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
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { ShellControls } from '@wg-easy-plane/ui';
import { observer } from 'mobx-react-lite';
import { useTranslations } from 'next-intl';

import { AuthStore } from '../stores/auth-store';
import { ApiTokenManagement } from './api-token-management';

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

  useEffect(() => {
    void store.initialize();
  }, [store]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (store.state === 'setup') void store.setup(username, password);
    if (store.state === 'login') void store.login(username, password);
  };

  if (store.state === 'loading') {
    return (
      <Container size="sm" py="xl">
        <Paper p="xl" radius="lg" shadow="sm" withBorder>
          <Group justify="center">
            <Loader aria-label={t('auth.loading')} />
          </Group>
        </Paper>
      </Container>
    );
  }

  if (store.state === 'error') {
    return (
      <Container size="sm" py="xl">
        <Stack gap="xl">
          <ShellControls />
          <Alert color="red" title={t('auth.unavailableTitle')}>
            <Stack gap="md">
              <Text>{t('auth.requestFailed')}</Text>
              <Button onClick={() => void store.initialize()} variant="light">
                {t('auth.retry')}
              </Button>
            </Stack>
          </Alert>
        </Stack>
      </Container>
    );
  }

  if (store.state === 'authenticated' && store.admin) {
    return (
      <Container size="md" py="xl">
        <Stack gap="xl">
          <ShellControls />
          <Paper p="xl" radius="lg" shadow="sm" withBorder>
            <Stack gap="md">
              <Group justify="space-between" align="center">
                <Badge variant="light">{t('home.badge')}</Badge>
                <Button
                  loading={store.submitting}
                  onClick={() => void store.logout()}
                  variant="subtle"
                >
                  {t('auth.logout')}
                </Button>
              </Group>
              <Title>{t('home.title')}</Title>
              <Text>
                {t('auth.signedInAs', { username: store.admin.username })}
              </Text>
              <Text c="dimmed">{t('home.description')}</Text>
            </Stack>
          </Paper>
          <ApiTokenManagement />
        </Stack>
      </Container>
    );
  }

  const isSetup = store.state === 'setup';
  return (
    <Container size="sm" py="xl">
      <Stack gap="xl">
        <ShellControls />
        <Paper p="xl" radius="lg" shadow="sm" withBorder>
          <form onSubmit={submit}>
            <Stack gap="md">
              <Badge variant="light">
                {isSetup ? t('auth.setupBadge') : t('auth.loginBadge')}
              </Badge>
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
      </Stack>
    </Container>
  );
});
