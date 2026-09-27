import { isIP } from 'node:net';
import { z } from 'zod';

export const SUPPORTED_WG_EASY_VERSION = '15.4.0' as const;

const noControlCharacters = (value: string) => !/[\x00-\x1f\x7f]/.test(value);

const prototypeSafeString = z
  .string()
  .refine(
    (value) =>
      value !== '__proto__' && value !== 'constructor' && value !== 'prototype',
  );

const controlSafeString = prototypeSafeString.refine(noControlCharacters);

const nonEmptyPrototypeSafeString = prototypeSafeString.min(1);
const nonEmptyControlSafeString = controlSafeString.min(1);
const addressString = nonEmptyControlSafeString;
const nullableAddressArray = z.array(addressString).nullable();

function isIpOrCidr(value: string): boolean {
  if (isIP(value) !== 0) return true;
  const separator = value.lastIndexOf('/');
  if (separator < 1) return false;
  const address = value.slice(0, separator);
  const prefixText = value.slice(separator + 1);
  if (!/^\d+$/.test(prefixText)) return false;
  const version = isIP(address);
  const prefix = Number(prefixText);
  return (
    (version === 4 && prefix >= 0 && prefix <= 32) ||
    (version === 6 && prefix >= 0 && prefix <= 128)
  );
}

function isFirewallIp(value: string): boolean {
  const protocolMatch = value.match(/\/(tcp|udp)$/i);
  const withoutProtocol = protocolMatch
    ? value.slice(0, -protocolMatch[0].length)
    : value;

  if (!protocolMatch && isIpOrCidr(withoutProtocol)) return true;

  const bracketedWithoutPort = withoutProtocol.match(/^\[(.+)\]$/);
  if (!protocolMatch && bracketedWithoutPort?.[1]) {
    return isIpOrCidr(bracketedWithoutPort[1]);
  }

  const portMatch = withoutProtocol.match(/^(.+):(\d+)$/);
  if (!portMatch?.[1] || !portMatch[2]) return false;
  const address = portMatch[1].replace(/^\[|\]$/g, '');
  const port = Number(portMatch[2]);
  return isIpOrCidr(address) && port >= 1 && port <= 65_535;
}

const firewallIpString = nonEmptyPrototypeSafeString.refine(isFirewallIp);
const nullableFirewallIpArray = z.array(firewallIpString).nullable();
const isoDateTime = z.iso.datetime();

export const WgEasyInformationResponseSchema = z
  .object({
    currentRelease: z.string().regex(/^v\d+\.\d+\.\d+$/),
    latestRelease: z
      .object({
        version: z.string(),
        changelog: z.string(),
      })
      .strict(),
    updateAvailable: z.boolean(),
    insecure: z.boolean(),
    isAwg: z.boolean(),
    firewallEnabled: z.boolean(),
  })
  .strict();

const OneTimeLinkSchema = z
  .object({
    id: z.number().int().positive(),
    oneTimeLink: z.string().min(1),
    expiresAt: z.string().min(1),
    createdAt: z.string().min(1),
    updatedAt: z.string().min(1),
  })
  .strict();

export const WgEasyRawClientSchema = z
  .object({
    id: z.number().int().positive(),
    userId: z.number().int().positive(),
    interfaceId: nonEmptyPrototypeSafeString,
    name: nonEmptyControlSafeString,
    ipv4Address: z.string().refine((value) => isIP(value) === 4),
    ipv6Address: z.string().refine((value) => isIP(value) === 6),
    preUp: prototypeSafeString,
    postUp: prototypeSafeString,
    preDown: prototypeSafeString,
    postDown: prototypeSafeString,
    publicKey: nonEmptyPrototypeSafeString,
    expiresAt: nonEmptyPrototypeSafeString.nullable(),
    allowedIps: nullableAddressArray,
    serverAllowedIps: z.array(addressString),
    firewallIps: nullableFirewallIpArray,
    persistentKeepalive: z.number().min(0).max(65_535),
    mtu: z.number().min(1_024).max(9_000),
    jC: z.number().min(1).max(128).nullable(),
    jMin: z.number().max(1_279).nullable(),
    jMax: z.number().max(1_280).nullable(),
    i1: controlSafeString.nullable(),
    i2: controlSafeString.nullable(),
    i3: controlSafeString.nullable(),
    i4: controlSafeString.nullable(),
    i5: controlSafeString.nullable(),
    dns: nullableAddressArray,
    serverEndpoint: addressString.nullable(),
    enabled: z.boolean(),
    createdAt: isoDateTime,
    updatedAt: isoDateTime,
    oneTimeLink: OneTimeLinkSchema.nullable(),
    latestHandshakeAt: isoDateTime.nullable(),
    endpoint: z.string().nullable(),
    transferRx: z.number().nonnegative().nullable(),
    transferTx: z.number().nonnegative().nullable(),
  })
  .strict();

export const WgEasyClientListResponseSchema = z
  .array(WgEasyRawClientSchema)
  .superRefine((clients, context) => {
    const seen = new Set<number>();
    for (const [index, client] of clients.entries()) {
      if (seen.has(client.id)) {
        context.addIssue({
          code: 'custom',
          path: [index, 'id'],
          message: 'Client identifiers must be unique',
        });
      }
      seen.add(client.id);
    }
  });

export const WgEasyClientSchema = WgEasyRawClientSchema.omit({
  oneTimeLink: true,
  endpoint: true,
}).strict();

export const WgEasyClientCreateRequestSchema = z
  .object({
    name: nonEmptyControlSafeString,
    expiresAt: nonEmptyPrototypeSafeString.nullable(),
  })
  .strict();

export const WgEasyClientUpdateRequestSchema = z
  .object({
    name: nonEmptyControlSafeString,
    enabled: z.boolean(),
    expiresAt: nonEmptyPrototypeSafeString.nullable(),
    ipv4Address: z.string().refine((value) => isIP(value) === 4),
    ipv6Address: z.string().refine((value) => isIP(value) === 6),
    preUp: prototypeSafeString,
    postUp: prototypeSafeString,
    preDown: prototypeSafeString,
    postDown: prototypeSafeString,
    allowedIps: nullableAddressArray,
    serverAllowedIps: z.array(addressString),
    firewallIps: nullableFirewallIpArray,
    mtu: z.number().min(1_024).max(9_000),
    jC: z.number().min(1).max(128).nullable(),
    jMin: z.number().max(1_279).nullable(),
    jMax: z.number().max(1_280).nullable(),
    i1: controlSafeString.nullable(),
    i2: controlSafeString.nullable(),
    i3: controlSafeString.nullable(),
    i4: controlSafeString.nullable(),
    i5: controlSafeString.nullable(),
    persistentKeepalive: z.number().min(0).max(65_535),
    serverEndpoint: addressString.nullable(),
    dns: nullableAddressArray,
  })
  .strict();

export const WgEasyCreateResponseSchema = z
  .object({
    success: z.literal(true),
    clientId: z.number().int().positive(),
  })
  .strict();

export const WgEasySuccessResponseSchema = z
  .object({ success: z.literal(true) })
  .strict();

export type WgEasyRawClient = z.infer<typeof WgEasyRawClientSchema>;
export type WgEasyClientCreateRequest = z.infer<
  typeof WgEasyClientCreateRequestSchema
>;
export type WgEasyClientUpdateRequest = z.infer<
  typeof WgEasyClientUpdateRequestSchema
>;

export type WgEasyClient = z.infer<typeof WgEasyClientSchema>;

export function safeClientProjection(client: WgEasyRawClient): WgEasyClient {
  const { oneTimeLink, endpoint, ...safe } = client;
  void oneTimeLink;
  void endpoint;
  return WgEasyClientSchema.parse(safe);
}
