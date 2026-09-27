'use client';

import {
  Alert,
  Button,
  Checkbox,
  Divider,
  Group,
  Loader,
  Modal,
  NumberInput,
  SimpleGrid,
  Stack,
  Text,
  Textarea,
  TextInput,
} from '@mantine/core';
import type {
  ManagedPlacement,
  PlacementAdvancedValues,
} from '@wg-easy-plane/contracts';
import { observer } from 'mobx-react-lite';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

import type { InventoryStore } from '../stores/inventory-store';

type AdvancedTarget = {
  clientId: string;
  placement: ManagedPlacement;
};

type AdvancedPlacementEditorProps = {
  store: InventoryStore;
  target: AdvancedTarget | null;
  onClose: () => void;
};

const lineValue = (values: string[] | null): string => values?.join('\n') ?? '';
const parseLines = (value: string): string[] =>
  value
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean);
const numberOrNull = (value: string | number): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

export const AdvancedPlacementEditor = observer(
  function AdvancedPlacementEditor({
    store,
    target,
    onClose,
  }: AdvancedPlacementEditorProps) {
    const t = useTranslations('clients.advanced');
    const [values, setValues] = useState<PlacementAdvancedValues | null>(null);

    useEffect(() => {
      if (!target) {
        setValues(null);
        return;
      }
      let current = true;
      void store
        .loadAdvanced(target.clientId, target.placement.id)
        .then((state) => {
          if (current && state) setValues(state.values);
        });
      return () => {
        current = false;
      };
    }, [store, target]);

    const close = () => {
      store.clearAdvanced();
      setValues(null);
      onClose();
    };

    const setField = <Key extends keyof PlacementAdvancedValues>(
      key: Key,
      value: PlacementAdvancedValues[Key],
    ) => {
      setValues((current) =>
        current ? { ...current, [key]: value } : current,
      );
    };

    const submit = async () => {
      if (!target || !values) return;
      const updated = await store.updateAdvanced(
        target.clientId,
        target.placement.id,
        values,
      );
      if (updated && store.advancedState?.status === 'active') close();
    };

    const nullableLines = (
      key: 'allowedIps' | 'firewallIps' | 'dns',
      label: string,
    ) => (
      <Stack gap={4}>
        <Checkbox
          checked={values?.[key] === null}
          label={t('unset')}
          onChange={(event) =>
            setField(key, event.currentTarget.checked ? null : [])
          }
        />
        <Textarea
          autosize
          disabled={values?.[key] === null}
          label={label}
          minRows={2}
          value={lineValue(values?.[key] ?? null)}
          onChange={(event) =>
            setField(key, parseLines(event.currentTarget.value))
          }
        />
      </Stack>
    );

    const nullableString = (
      key: 'serverEndpoint' | 'i1' | 'i2' | 'i3' | 'i4' | 'i5',
      label: string,
    ) => (
      <Stack gap={4}>
        <Checkbox
          checked={values?.[key] === null}
          label={t('unset')}
          onChange={(event) =>
            setField(key, event.currentTarget.checked ? null : '')
          }
        />
        <TextInput
          disabled={values?.[key] === null}
          label={label}
          value={values?.[key] ?? ''}
          onChange={(event) => setField(key, event.currentTarget.value)}
        />
      </Stack>
    );

    const nullableNumber = (
      key: 'jC' | 'jMin' | 'jMax',
      label: string,
      min: number | undefined,
      max: number,
    ) => (
      <Stack gap={4}>
        <Checkbox
          checked={values?.[key] === null}
          label={t('unset')}
          onChange={(event) =>
            setField(key, event.currentTarget.checked ? null : (min ?? 0))
          }
        />
        <NumberInput
          allowDecimal={false}
          disabled={values?.[key] === null}
          label={label}
          min={min}
          max={max}
          value={values?.[key] ?? ''}
          onChange={(value) => setField(key, numberOrNull(value))}
        />
      </Stack>
    );

    return (
      <Modal
        opened={target !== null}
        onClose={close}
        size="xl"
        title={t('title', { node: target?.placement.nodeName ?? '' })}
      >
        {store.advancedLoading && !values ? (
          <Group justify="center" py="xl">
            <Loader aria-label={t('loading')} />
          </Group>
        ) : store.advancedFailure && !values ? (
          <Alert color="red">{t('loadFailure')}</Alert>
        ) : values ? (
          <Stack gap="md">
            {store.advancedFailure ||
            (store.advancedState && store.advancedState.status !== 'active') ? (
              <Alert color="orange">{t('updateFailure')}</Alert>
            ) : null}

            <SimpleGrid cols={{ base: 1, sm: 2 }}>
              <TextInput
                label={t('ipv4Address')}
                required
                value={values.ipv4Address}
                onChange={(event) =>
                  setField('ipv4Address', event.currentTarget.value)
                }
              />
              <TextInput
                label={t('ipv6Address')}
                required
                value={values.ipv6Address}
                onChange={(event) =>
                  setField('ipv6Address', event.currentTarget.value)
                }
              />
              <NumberInput
                allowDecimal={false}
                label={t('mtu')}
                min={1024}
                max={9000}
                value={values.mtu}
                onChange={(value) => {
                  if (typeof value === 'number') setField('mtu', value);
                }}
              />
              <NumberInput
                allowDecimal={false}
                label={t('persistentKeepalive')}
                min={0}
                max={65_535}
                value={values.persistentKeepalive}
                onChange={(value) => {
                  if (typeof value === 'number')
                    setField('persistentKeepalive', value);
                }}
              />
            </SimpleGrid>

            <SimpleGrid cols={{ base: 1, sm: 2 }}>
              {nullableLines('allowedIps', t('allowedIps'))}
              <Textarea
                autosize
                label={t('serverAllowedIps')}
                minRows={2}
                value={lineValue(values.serverAllowedIps)}
                onChange={(event) =>
                  setField(
                    'serverAllowedIps',
                    parseLines(event.currentTarget.value),
                  )
                }
              />
              {nullableLines('firewallIps', t('firewallIps'))}
              {nullableLines('dns', t('dns'))}
            </SimpleGrid>

            {nullableString('serverEndpoint', t('serverEndpoint'))}

            <Divider label={t('hooks')} labelPosition="left" />
            <SimpleGrid cols={{ base: 1, sm: 2 }}>
              {(
                [
                  ['preUp', t('preUp')],
                  ['postUp', t('postUp')],
                  ['preDown', t('preDown')],
                  ['postDown', t('postDown')],
                ] as const
              ).map(([key, label]) => (
                <Textarea
                  key={key}
                  autosize
                  label={label}
                  minRows={3}
                  value={values[key]}
                  onChange={(event) => setField(key, event.currentTarget.value)}
                />
              ))}
            </SimpleGrid>

            {target?.placement.nodeMode === 'amnezia' ? (
              <Stack gap="md">
                <Divider label={t('amneziaTitle')} labelPosition="left" />
                <Alert color="blue" variant="light">
                  <Text fw={600}>{t('compatibilityTitle')}</Text>
                  <Text size="sm">{t('compatibilityDescription')}</Text>
                </Alert>
                <SimpleGrid cols={{ base: 1, sm: 3 }}>
                  {nullableNumber('jC', 'jC', 1, 128)}
                  {nullableNumber('jMin', 'jMin', undefined, 1279)}
                  {nullableNumber('jMax', 'jMax', undefined, 1280)}
                </SimpleGrid>
                <SimpleGrid cols={{ base: 1, sm: 2 }}>
                  {(['i1', 'i2', 'i3', 'i4', 'i5'] as const).map((key) => (
                    <div key={key}>{nullableString(key, key)}</div>
                  ))}
                </SimpleGrid>
              </Stack>
            ) : null}

            <Group justify="flex-end">
              <Button variant="default" onClick={close}>
                {t('cancel')}
              </Button>
              <Button
                onClick={() => void submit()}
                loading={store.advancedLoading}
                disabled={!values.ipv4Address || !values.ipv6Address}
              >
                {t('save')}
              </Button>
            </Group>
          </Stack>
        ) : null}
      </Modal>
    );
  },
);

export type { AdvancedTarget };
