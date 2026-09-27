import { createRoute, z } from '@hono/zod-openapi';

export const ErrorCodeSchema = z
  .enum([
    'BAD_REQUEST',
    'UNAUTHORIZED',
    'FORBIDDEN',
    'NOT_FOUND',
    'CONFLICT',
    'VALIDATION_ERROR',
    'RATE_LIMITED',
    'UPSTREAM_ERROR',
    'INTERNAL_ERROR',
  ])
  .openapi('ErrorCode');

export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

export const ErrorResponseSchema = z
  .object({
    error: z.object({
      code: ErrorCodeSchema,
      message: z.string(),
      details: z.record(z.string(), z.unknown()).optional(),
      requestId: z.uuid(),
    }),
  })
  .openapi('ErrorResponse');

export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;

export const RequestIdHeaderSchema = z.object({
  'X-Request-Id': z.uuid().openapi({
    description: 'Request correlation identifier',
  }),
});

export const CursorQuerySchema = z
  .object({
    cursor: z.string().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(200).default(50),
  })
  .openapi('CursorQuery');

export const CursorPageSchema = z
  .object({
    nextCursor: z.string().nullable(),
  })
  .openapi('CursorPage');

export const SystemStatusSchema = z
  .object({
    name: z.literal('wg-easy-plane'),
    version: z.string(),
    apiVersion: z.literal('v1'),
    supportedWgEasyVersion: z.literal('15.4.0'),
  })
  .openapi('SystemStatus');

export type SystemStatus = z.infer<typeof SystemStatusSchema>;

export const systemStatusRoute = createRoute({
  method: 'get',
  path: '/v1/system/status',
  tags: ['System'],
  summary: 'Read public control-plane compatibility status',
  responses: {
    200: {
      description: 'Control-plane status',
      content: {
        'application/json': {
          schema: SystemStatusSchema,
        },
      },
      headers: RequestIdHeaderSchema,
    },
    500: {
      description: 'Unexpected server error',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
      headers: RequestIdHeaderSchema,
    },
  },
});
