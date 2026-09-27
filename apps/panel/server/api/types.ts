import type { ErrorCode, ErrorResponse } from '@wg-easy-plane/contracts';

export type ApiEnvironment = {
  Variables: {
    requestId: string;
  };
};

export function errorBody(
  requestId: string,
  code: ErrorCode,
  message: string,
  details?: Record<string, unknown>,
): ErrorResponse {
  return {
    error: {
      code,
      message,
      requestId,
      ...(details === undefined ? {} : { details }),
    },
  };
}
