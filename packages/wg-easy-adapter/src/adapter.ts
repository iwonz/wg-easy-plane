import { z } from 'zod';

import { WgEasyAdapterError, type WgEasyOperation } from './errors';
import {
  safeClientProjection,
  SUPPORTED_WG_EASY_VERSION,
  WgEasyClientCreateRequestSchema,
  WgEasyClientListResponseSchema,
  WgEasyClientUpdateRequestSchema,
  WgEasyCreateResponseSchema,
  WgEasyInformationResponseSchema,
  WgEasySuccessResponseSchema,
  type WgEasyClient,
  type WgEasyClientCreateRequest,
  type WgEasyClientUpdateRequest,
} from './schemas';
import {
  NodeHttpTransport,
  type WgEasyTransport,
  type WgEasyTransportResponse,
} from './transport';

export type WgEasyConnection = {
  protocol: 'http' | 'https';
  host: string;
  port: number;
  username: string;
  password: string;
  timeoutMs?: number;
  maxResponseBytes?: number;
};

export type WgEasyInformation = {
  version: typeof SUPPORTED_WG_EASY_VERSION;
  mode: 'wireguard' | 'amnezia';
  upstreamInsecure: boolean;
  firewallEnabled: boolean;
  updateAvailable: boolean;
};

export type WgEasyProbe = {
  information: WgEasyInformation;
  clients: WgEasyClient[];
};

export type WgEasyLiveArtifact = {
  bytes: Uint8Array;
  mediaType: 'application/octet-stream' | 'image/svg+xml';
};

export type WgEasyDeleteResult = 'deleted' | 'not_found';

function mediaType(contentType: string | null): string | null {
  return contentType?.split(';', 1)[0]?.trim().toLowerCase() ?? null;
}

function parseJson<T>(
  response: WgEasyTransportResponse,
  schema: z.ZodType<T>,
  operation: WgEasyOperation,
): T {
  if (mediaType(response.contentType) !== 'application/json') {
    throw new WgEasyAdapterError({
      code: 'API_INCOMPATIBLE',
      operation,
      httpStatus: response.status,
    });
  }
  try {
    const input: unknown = JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(response.body),
    );
    const result = schema.safeParse(input);
    if (!result.success) throw new Error('schema mismatch');
    return result.data;
  } catch {
    throw new WgEasyAdapterError({
      code: 'API_INCOMPATIBLE',
      operation,
      httpStatus: response.status,
    });
  }
}

function assertSafeSvg(
  bytes: Uint8Array,
  operation: WgEasyOperation,
  httpStatus: number,
): void {
  try {
    const svg = new TextDecoder('utf-8', { fatal: true }).decode(bytes).trim();
    const hasSvgRoot = /^(?:<\?xml[^>]*>\s*)?<svg(?:\s|>)/i.test(svg);
    const containsActiveContent =
      /<!doctype|<script|<foreignobject|\son[a-z]+\s*=/i.test(svg);
    const containsExternalReference =
      /\b(?:href|xlink:href)\s*=\s*["'](?!#)/i.test(svg);
    if (!hasSvgRoot || containsActiveContent || containsExternalReference) {
      throw new Error('unsafe svg');
    }
  } catch {
    throw new WgEasyAdapterError({
      code: 'API_INCOMPATIBLE',
      operation,
      httpStatus,
    });
  }
}

function normalizedVersion(release: string): string {
  return release.startsWith('v') ? release.slice(1) : release;
}

export class WgEasyAdapter {
  #username: string;
  #password: string;
  #transport: WgEasyTransport;
  #compatibleInformation: WgEasyInformation | null = null;

  constructor(
    connection: WgEasyConnection,
    options: { transport?: WgEasyTransport } = {},
  ) {
    if (
      connection.username.length === 0 ||
      connection.username.includes(':') ||
      connection.password.length === 0
    ) {
      throw new Error('Invalid wg-easy adapter credentials');
    }
    this.#username = connection.username;
    this.#password = connection.password;
    this.#transport =
      options.transport ??
      new NodeHttpTransport({
        protocol: connection.protocol,
        host: connection.host,
        port: connection.port,
        timeoutMs: connection.timeoutMs,
        maxResponseBytes: connection.maxResponseBytes,
      });
  }

  async getInformation(): Promise<WgEasyInformation> {
    const operation = 'information' as const;
    const response = await this.#request({
      operation,
      method: 'GET',
      path: '/api/information',
      authenticated: false,
    });
    this.#requireSuccess(response, operation);
    const raw = parseJson(response, WgEasyInformationResponseSchema, operation);
    const detectedVersion = normalizedVersion(raw.currentRelease);
    if (detectedVersion !== SUPPORTED_WG_EASY_VERSION) {
      throw new WgEasyAdapterError({
        code: 'UNSUPPORTED_VERSION',
        operation,
        detectedVersion,
      });
    }

    const information: WgEasyInformation = {
      version: SUPPORTED_WG_EASY_VERSION,
      mode: raw.isAwg ? 'amnezia' : 'wireguard',
      upstreamInsecure: raw.insecure,
      firewallEnabled: raw.firewallEnabled,
      updateAvailable: raw.updateAvailable,
    };
    this.#compatibleInformation = information;
    return information;
  }

  async probe(): Promise<WgEasyProbe> {
    const information = await this.getInformation();
    const clients = await this.#listClients();
    return { information, clients };
  }

  async listClients(): Promise<WgEasyClient[]> {
    await this.#ensureCompatible();
    return this.#listClients();
  }

  async createClient(input: WgEasyClientCreateRequest): Promise<number> {
    const operation = 'create_client' as const;
    const body = this.#validateRequest(
      WgEasyClientCreateRequestSchema,
      input,
      operation,
    );
    await this.#ensureCompatible();
    const response = await this.#requestJson({
      operation,
      method: 'POST',
      path: '/api/client',
      body,
    });
    const result = parseJson(response, WgEasyCreateResponseSchema, operation);
    return result.clientId;
  }

  async updateClient(
    clientId: number,
    input: WgEasyClientUpdateRequest,
  ): Promise<void> {
    const operation = 'update_client' as const;
    this.#validateClientId(clientId, operation);
    const body = this.#validateRequest(
      WgEasyClientUpdateRequestSchema,
      input,
      operation,
    );
    await this.#ensureCompatible();
    await this.#successMutation(
      operation,
      `/api/client/${clientId}`,
      'POST',
      body,
    );
  }

  async enableClient(clientId: number): Promise<void> {
    await this.#toggleClient(clientId, true);
  }

  async disableClient(clientId: number): Promise<void> {
    await this.#toggleClient(clientId, false);
  }

  async deleteClient(clientId: number): Promise<WgEasyDeleteResult> {
    const operation = 'delete_client' as const;
    this.#validateClientId(clientId, operation);
    await this.#ensureCompatible();
    const response = await this.#request({
      operation,
      method: 'DELETE',
      path: `/api/client/${clientId}`,
      authenticated: true,
    });
    if (response.status === 404) return 'not_found';
    this.#requireSuccess(response, operation);
    parseJson(response, WgEasySuccessResponseSchema, operation);
    return 'deleted';
  }

  async getConfiguration(clientId: number): Promise<WgEasyLiveArtifact> {
    const operation = 'configuration' as const;
    this.#validateClientId(clientId, operation);
    await this.#ensureCompatible();
    const response = await this.#request({
      operation,
      method: 'GET',
      path: `/api/client/${clientId}/configuration`,
      authenticated: true,
    });
    this.#requireSuccess(response, operation);
    if (mediaType(response.contentType) !== 'application/octet-stream') {
      throw new WgEasyAdapterError({
        code: 'API_INCOMPATIBLE',
        operation,
        httpStatus: response.status,
      });
    }
    return {
      bytes: response.body.slice(),
      mediaType: 'application/octet-stream',
    };
  }

  async getQrCode(clientId: number): Promise<WgEasyLiveArtifact> {
    const operation = 'qr_code' as const;
    this.#validateClientId(clientId, operation);
    await this.#ensureCompatible();
    const response = await this.#request({
      operation,
      method: 'GET',
      path: `/api/client/${clientId}/qrcode.svg`,
      authenticated: true,
    });
    this.#requireSuccess(response, operation);
    if (mediaType(response.contentType) !== 'image/svg+xml') {
      throw new WgEasyAdapterError({
        code: 'API_INCOMPATIBLE',
        operation,
        httpStatus: response.status,
      });
    }
    assertSafeSvg(response.body, operation, response.status);
    return { bytes: response.body.slice(), mediaType: 'image/svg+xml' };
  }

  async #listClients(): Promise<WgEasyClient[]> {
    const operation = 'list_clients' as const;
    const response = await this.#request({
      operation,
      method: 'GET',
      path: '/api/client',
      authenticated: true,
    });
    this.#requireSuccess(response, operation);
    return parseJson(response, WgEasyClientListResponseSchema, operation).map(
      safeClientProjection,
    );
  }

  async #toggleClient(clientId: number, enabled: boolean): Promise<void> {
    const operation = enabled ? 'enable_client' : 'disable_client';
    this.#validateClientId(clientId, operation);
    await this.#ensureCompatible();
    await this.#successMutation(
      operation,
      `/api/client/${clientId}/${enabled ? 'enable' : 'disable'}`,
      'POST',
    );
  }

  async #successMutation(
    operation: WgEasyOperation,
    path: string,
    method: 'POST',
    body?: unknown,
  ): Promise<void> {
    const response = body
      ? await this.#requestJson({ operation, method, path, body })
      : await this.#request({
          operation,
          method,
          path,
          authenticated: true,
        });
    this.#requireSuccess(response, operation);
    parseJson(response, WgEasySuccessResponseSchema, operation);
  }

  async #ensureCompatible(): Promise<WgEasyInformation> {
    return this.#compatibleInformation ?? this.getInformation();
  }

  #validateClientId(clientId: number, operation: WgEasyOperation): void {
    if (!Number.isInteger(clientId) || clientId < 1) {
      throw new WgEasyAdapterError({ code: 'INVALID_REQUEST', operation });
    }
  }

  #validateRequest<T>(
    schema: z.ZodType<T>,
    input: unknown,
    operation: WgEasyOperation,
  ): T {
    const result = schema.safeParse(input);
    if (!result.success) {
      throw new WgEasyAdapterError({ code: 'INVALID_REQUEST', operation });
    }
    return result.data;
  }

  async #requestJson(input: {
    operation: WgEasyOperation;
    method: 'POST';
    path: string;
    body: unknown;
  }): Promise<WgEasyTransportResponse> {
    const response = await this.#request({
      ...input,
      authenticated: true,
      body: Buffer.from(JSON.stringify(input.body), 'utf8'),
      contentType: 'application/json',
    });
    this.#requireSuccess(response, input.operation);
    return response;
  }

  async #request(input: {
    operation: WgEasyOperation;
    method: 'GET' | 'POST' | 'DELETE';
    path: string;
    authenticated: boolean;
    body?: Uint8Array;
    contentType?: string;
  }): Promise<WgEasyTransportResponse> {
    const headers: Record<string, string> = { Accept: '*/*' };
    if (input.authenticated) {
      headers.Authorization = `Basic ${Buffer.from(
        `${this.#username}:${this.#password}`,
        'utf8',
      ).toString('base64')}`;
    }
    if (input.contentType) headers['Content-Type'] = input.contentType;
    if (input.body) headers['Content-Length'] = String(input.body.byteLength);

    try {
      return await this.#transport.request({
        operation: input.operation,
        method: input.method,
        path: input.path,
        headers,
        body: input.body,
      });
    } catch (error) {
      if (error instanceof WgEasyAdapterError) throw error;
      throw new WgEasyAdapterError({
        code: 'UNREACHABLE',
        operation: input.operation,
      });
    }
  }

  #requireSuccess(
    response: WgEasyTransportResponse,
    operation: WgEasyOperation,
  ): void {
    if (response.status >= 200 && response.status < 300) return;
    if (response.status === 401 || response.status === 403) {
      throw new WgEasyAdapterError({
        code: 'AUTH_FAILED',
        operation,
        httpStatus: response.status,
      });
    }
    if (response.status === 404) {
      throw new WgEasyAdapterError({
        code: 'NOT_FOUND',
        operation,
        httpStatus: response.status,
      });
    }
    throw new WgEasyAdapterError({
      code: 'UPSTREAM_ERROR',
      operation,
      httpStatus: response.status,
    });
  }
}

export const adapterTestExports = {
  assertSafeSvg,
};
