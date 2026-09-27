'use client';

import { Button, Group, Image, Modal, Stack, Text } from '@mantine/core';
import { useTranslations } from 'next-intl';

export type QrCodeTarget = {
  label: string;
  url: string;
};

export function QrCodeDialog({
  target,
  onClose,
}: {
  target: QrCodeTarget | null;
  onClose: () => void;
}) {
  const t = useTranslations('clients.delivery');

  return (
    <Modal
      opened={target !== null}
      onClose={onClose}
      title={target ? t('title', { label: target.label }) : t('titleFallback')}
      centered
    >
      <Stack>
        <Text c="dimmed" size="sm">
          {t('description')}
        </Text>
        {target ? (
          <Image
            src={target.url}
            alt={t('alt', { label: target.label })}
            fit="contain"
            mah={420}
          />
        ) : null}
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            {t('close')}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
