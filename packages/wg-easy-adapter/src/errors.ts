export type WgEasyOperation =
  | 'information'
  | 'list_clients'
  | 'create_client'
  | 'update_client'
  | 'enable_client'
  | 'disable_client'
  | 'delete_client'
  | 'configuration'
  | 'qr_code';

export type WgEasyAdapterErrorCode =
  | 'INVALID_REQUEST'
  | 'TIMEOUT'
  | 'TLS_ERROR'
  | 'UNREACHABLE'
  | 'REDIRECT_BLOCKED'
  | 'RESPONSE_TOO_LARGE'
  | 'AUTH_FAILED'
  | 'NOT_FOUND'
  | 'UNSUPPORTED_VERSION'
  | 'API_INCOMPATIBLE'
  | 'UPSTREAM_ERROR';

const errorMessages: Record<WgEasyAdapterErrorCode, string> = {
  INVALID_REQUEST: 'The wg-easy request is invalid',
  TIMEOUT: 'The wg-easy request timed out',
  TLS_ERROR: 'TLS verification for the wg-easy node failed',
  UNREACHABLE: 'The wg-easy node is unreachable',
  REDIRECT_BLOCKED: 'The wg-easy node returned a blocked redirect',
  RESPONSE_TOO_LARGE: 'The wg-easy response exceeded the safe size limit',
  AUTH_FAILED:
    'wg-easy authentication failed; credentials may be invalid or 2FA may be enabled',
  NOT_FOUND: 'The requested wg-easy resource does not exist',
  UNSUPPORTED_VERSION: 'The wg-easy version is not supported',
  API_INCOMPATIBLE: 'The wg-easy API response is incompatible',
  UPSTREAM_ERROR: 'The wg-easy node returned an error',
};

export class WgEasyAdapterError extends Error {
  readonly code: WgEasyAdapterErrorCode;
  readonly operation: WgEasyOperation;
  readonly httpStatus?: number;
  readonly detectedVersion?: string;

  constructor(input: {
    code: WgEasyAdapterErrorCode;
    operation: WgEasyOperation;
    httpStatus?: number;
    detectedVersion?: string;
  }) {
    super(errorMessages[input.code]);
    this.name = 'WgEasyAdapterError';
    this.code = input.code;
    this.operation = input.operation;
    this.httpStatus = input.httpStatus;
    this.detectedVersion = input.detectedVersion;
    this.stack = `${this.name}: ${this.message}`;
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      operation: this.operation,
      message: this.message,
      ...(this.httpStatus === undefined ? {} : { httpStatus: this.httpStatus }),
      ...(this.detectedVersion === undefined
        ? {}
        : { detectedVersion: this.detectedVersion }),
    };
  }
}
