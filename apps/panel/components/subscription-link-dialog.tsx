'use client';

import {
  Alert,
  Badge,
  Button,
  Group,
  Loader,
  Modal,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import { SubscriptionLinkSchema } from '@wg-easy-plane/contracts';
import type { SubscriptionLink } from '@wg-easy-plane/contracts';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';

export type SubscriptionLinkTarget = {
  clientId: string;
  clientName: string;
};

export function SubscriptionLinkDialog({
  target,
  onClose,
}: {
  target: SubscriptionLinkTarget | null;
  onClose: () => void;
}) {
  const t = useTranslations('clients.subscription');
  const [link, setLink] = useState<SubscriptionLink | null>(null);
  const [loading, setLoading] = useState(false);
  const [mutating, setMutating] = useState(false);
  const [failure, setFailure] = useState(false);
  const [copied, setCopied] = useState(false);
  const currentLink = link && link.clientId === target?.clientId ? link : null;

  const clearTransientState = useCallback(() => {
    setLink(null);
    setFailure(false);
    setCopied(false);
    setLoading(false);
    setMutating(false);
  }, []);

  const load = useCallback(async (clientId: string, signal?: AbortSignal) => {
    setLoading(true);
    setFailure(false);
    setLink(null);
    setCopied(false);
    try {
      const response = await fetch(
        `/api/v1/clients/managed/${clientId}/subscription`,
        { credentials: 'same-origin', cache: 'no-store', signal },
      );
      const parsed = SubscriptionLinkSchema.safeParse(await response.json());
      if (!response.ok || !parsed.success) throw new Error('Request failed');
      setLink(parsed.data);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setFailure(true);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!target) return;
    const controller = new AbortController();
    void Promise.resolve().then(() => {
      if (!controller.signal.aborted) {
        return load(target.clientId, controller.signal);
      }
    });
    return () => controller.abort();
  }, [load, target]);

  const rotate = async () => {
    if (!target) return;
    setMutating(true);
    setFailure(false);
    setCopied(false);
    try {
      const response = await fetch(
        `/api/v1/clients/managed/${target.clientId}/subscription`,
        { method: 'POST', credentials: 'same-origin' },
      );
      const parsed = SubscriptionLinkSchema.safeParse(await response.json());
      if (!response.ok || !parsed.success) throw new Error('Request failed');
      setLink(parsed.data);
    } catch {
      setFailure(true);
    } finally {
      setMutating(false);
    }
  };

  const revoke = async () => {
    if (!target) return;
    setMutating(true);
    setFailure(false);
    setCopied(false);
    try {
      const response = await fetch(
        `/api/v1/clients/managed/${target.clientId}/subscription`,
        { method: 'DELETE', credentials: 'same-origin' },
      );
      if (!response.ok) throw new Error('Request failed');
      setLink((current) =>
        current
          ? {
              ...current,
              status: 'revoked',
              url: null,
              revokedAt: new Date().toISOString(),
            }
          : null,
      );
    } catch {
      setFailure(true);
    } finally {
      setMutating(false);
    }
  };

  const copy = async () => {
    if (!currentLink?.url) return;
    try {
      await navigator.clipboard.writeText(currentLink.url);
      setCopied(true);
    } catch {
      setFailure(true);
    }
  };

  const close = () => {
    clearTransientState();
    onClose();
  };

  return (
    <Modal
      opened={target !== null}
      onClose={close}
      title={target ? t('title', { name: target.clientName }) : t('fallback')}
      centered
      size="lg"
    >
      <Stack>
        <Text c="dimmed" size="sm">
          {t('description')}
        </Text>
        {failure ? <Alert color="red">{t('failure')}</Alert> : null}
        {loading ? (
          <Group justify="center">
            <Loader aria-label={t('loading')} />
          </Group>
        ) : currentLink ? (
          <>
            <Group>
              <Badge
                color={currentLink.status === 'active' ? 'green' : 'gray'}
                variant="light"
              >
                {t(`status.${currentLink.status}`)}
              </Badge>
              {currentLink.prefix ? (
                <Text c="dimmed" size="xs">
                  {t('prefix', { prefix: currentLink.prefix })}
                </Text>
              ) : null}
            </Group>
            {currentLink.url ? (
              <TextInput
                label={t('link')}
                value={currentLink.url}
                readOnly
                autoComplete="off"
              />
            ) : (
              <Text>{t('missing')}</Text>
            )}
            {copied ? <Alert color="green">{t('copied')}</Alert> : null}
          </>
        ) : null}
        <Group justify="space-between">
          <Button
            color="red"
            variant="light"
            disabled={!currentLink?.url}
            loading={mutating}
            onClick={() => void revoke()}
          >
            {t('revoke')}
          </Button>
          <Group>
            <Button variant="default" onClick={close}>
              {t('close')}
            </Button>
            {currentLink?.url ? (
              <Button
                variant="light"
                onClick={() => void copy()}
                disabled={mutating}
              >
                {t('copy')}
              </Button>
            ) : null}
            <Button
              onClick={() => void rotate()}
              loading={mutating}
              disabled={loading || !target}
            >
              {currentLink?.status === 'active' ? t('rotate') : t('create')}
            </Button>
          </Group>
        </Group>
      </Stack>
    </Modal>
  );
}
