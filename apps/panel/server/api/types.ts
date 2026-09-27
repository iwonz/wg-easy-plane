import type {
  ApiTokenScope,
  ErrorCode,
  ErrorResponse,
} from '@wg-easy-plane/contracts';

export type RequestPrincipal =
  | { kind: 'admin'; adminId: string }
  | { kind: 'api-token'; tokenId: string; scopes: ApiTokenScope[] };

export type ApiEnvironment = {
  Variables: {
    requestId: string;
    principal: RequestPrincipal;
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
