import http from 'node:http';
import https from 'node:https';
import { isIP } from 'node:net';

import { WgEasyAdapterError, type WgEasyOperation } from './errors';

export const DEFAULT_TIMEOUT_MS = 10_000;
export const DEFAULT_MAX_RESPONSE_BYTES = 1024 * 1024;

export type WgEasyTransportRequest = {
  operation: WgEasyOperation;
  method: 'GET' | 'POST' | 'DELETE';
  path: string;
  headers?: Record<string, string>;
  body?: Uint8Array;
};

export type WgEasyTransportResponse = {
  status: number;
  contentType: string | null;
  body: Uint8Array;
};

export interface WgEasyTransport {
  request(input: WgEasyTransportRequest): Promise<WgEasyTransportResponse>;
}

const tlsErrorCodes = new Set([
  'CERT_HAS_EXPIRED',
  'CERT_SIGNATURE_FAILURE',
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'EPROTO',
  'ERR_SSL_CERTIFICATE_VERIFY_FAILED',
  'ERR_TLS_CERT_ALTNAME_INVALID',
  'SELF_SIGNED_CERT_IN_CHAIN',
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
]);

function mapNetworkFailure(
  error: unknown,
  operation: WgEasyOperation,
): WgEasyAdapterError {
  const code =
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string'
      ? error.code
      : null;
  return new WgEasyAdapterError({
    code: code && tlsErrorCodes.has(code) ? 'TLS_ERROR' : 'UNREACHABLE',
    operation,
  });
}

function formatHost(host: string): string {
  return isIP(host) === 6 ? `[${host}]` : host;
}

function requestHostname(hostname: string): string {
  return hostname.startsWith('[') && hostname.endsWith(']')
    ? hostname.slice(1, -1)
    : hostname;
}

export class NodeHttpTransport implements WgEasyTransport {
  readonly security: Readonly<{
    protocol: 'http' | 'https';
    allowInsecureTls: boolean;
  }>;

  #baseUrl: URL;
  #timeoutMs: number;
  #maxResponseBytes: number;
  #allowInsecureTls: boolean;

  constructor(input: {
    protocol: 'http' | 'https';
    host: string;
    port: number;
    allowInsecureTls?: boolean;
    timeoutMs?: number;
    maxResponseBytes?: number;
  }) {
    const host = input.host.trim();
    const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const maxResponseBytes =
      input.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES;
    if (
      host.length === 0 ||
      host.includes('/') ||
      host.includes('\\') ||
      host.includes('@') ||
      host.includes('?') ||
      host.includes('#') ||
      /\s/.test(host) ||
      !Number.isInteger(input.port) ||
      input.port < 1 ||
      input.port > 65_535 ||
      !Number.isInteger(timeoutMs) ||
      timeoutMs < 1 ||
      !Number.isInteger(maxResponseBytes) ||
      maxResponseBytes < 1
    ) {
      throw new Error('Invalid wg-easy transport configuration');
    }

    try {
      this.#baseUrl = new URL(
        `${input.protocol}://${formatHost(host)}:${input.port}`,
      );
    } catch {
      throw new Error('Invalid wg-easy transport configuration');
    }
    this.#timeoutMs = timeoutMs;
    this.#maxResponseBytes = maxResponseBytes;
    this.#allowInsecureTls = input.allowInsecureTls ?? false;
    this.security = Object.freeze({
      protocol: input.protocol,
      allowInsecureTls: this.#allowInsecureTls,
    });
  }

  request(input: WgEasyTransportRequest): Promise<WgEasyTransportResponse> {
    if (!input.path.startsWith('/api/')) {
      return Promise.reject(
        new WgEasyAdapterError({
          code: 'INVALID_REQUEST',
          operation: input.operation,
        }),
      );
    }
    const url = new URL(input.path, this.#baseUrl);
    if (!url.pathname.startsWith('/api/')) {
      return Promise.reject(
        new WgEasyAdapterError({
          code: 'INVALID_REQUEST',
          operation: input.operation,
        }),
      );
    }
    const client = url.protocol === 'https:' ? https : http;

    return new Promise((resolve, reject) => {
      let settled = false;
      const succeed = (response: WgEasyTransportResponse) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        resolve(response);
      };
      const fail = (error: WgEasyAdapterError) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        reject(error);
      };

      const request = client.request(
        {
          protocol: url.protocol,
          hostname: requestHostname(url.hostname),
          port: url.port,
          path: `${url.pathname}${url.search}`,
          method: input.method,
          headers: input.headers,
          ...(url.protocol === 'https:'
            ? { rejectUnauthorized: !this.#allowInsecureTls }
            : {}),
        },
        (response) => {
          const status = response.statusCode ?? 0;
          if (status >= 300 && status < 400) {
            response.resume();
            fail(
              new WgEasyAdapterError({
                code: 'REDIRECT_BLOCKED',
                operation: input.operation,
                httpStatus: status,
              }),
            );
            return;
          }

          const declaredLength = Number(response.headers['content-length']);
          if (
            Number.isFinite(declaredLength) &&
            declaredLength > this.#maxResponseBytes
          ) {
            response.destroy();
            fail(
              new WgEasyAdapterError({
                code: 'RESPONSE_TOO_LARGE',
                operation: input.operation,
                httpStatus: status,
              }),
            );
            return;
          }

          const chunks: Buffer[] = [];
          let received = 0;
          response.on('data', (chunk: Buffer | string) => {
            const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
            received += bytes.byteLength;
            if (received > this.#maxResponseBytes) {
              response.destroy();
              fail(
                new WgEasyAdapterError({
                  code: 'RESPONSE_TOO_LARGE',
                  operation: input.operation,
                  httpStatus: status,
                }),
              );
              return;
            }
            chunks.push(bytes);
          });
          response.on('end', () => {
            succeed({
              status,
              contentType:
                typeof response.headers['content-type'] === 'string'
                  ? response.headers['content-type']
                  : null,
              body: Buffer.concat(chunks),
            });
          });
          response.on('error', (error) => {
            fail(mapNetworkFailure(error, input.operation));
          });
        },
      );

      const timeout = setTimeout(() => {
        fail(
          new WgEasyAdapterError({
            code: 'TIMEOUT',
            operation: input.operation,
          }),
        );
        request.destroy();
      }, this.#timeoutMs);
      request.on('error', (error) => {
        fail(mapNetworkFailure(error, input.operation));
      });

      if (input.body) request.write(input.body);
      request.end();
    });
  }
}

export const transportTestExports = {
  mapNetworkFailure,
  requestHostname,
};
