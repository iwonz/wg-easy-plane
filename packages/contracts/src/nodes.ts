import { createRoute, z } from '@hono/zod-openapi';

import {
  CursorPageSchema,
  CursorQuerySchema,
  ErrorResponseSchema,
  RequestIdHeaderSchema,
} from './schemas';

export const NODE_STATUSES = [
  'healthy',
  'unreachable',
  'auth_failed',
  'tls_error',
  'unsupported_version',
  'api_incompatible',
] as const;

export const NODE_ERROR_CODES = [
  'TIMEOUT',
  'TLS_ERROR',
  'UNREACHABLE',
  'REDIRECT_BLOCKED',
  'RESPONSE_TOO_LARGE',
  'AUTH_FAILED',
  'NOT_FOUND',
  'UNSUPPORTED_VERSION',
  'API_INCOMPATIBLE',
  'UPSTREAM_ERROR',
] as const;

export const NodeStatusSchema = z.enum(NODE_STATUSES).openapi('NodeStatus');
export const NodeErrorCodeSchema = z
  .enum(NODE_ERROR_CODES)
  .openapi('NodeErrorCode');
export const NodeModeSchema = z
  .enum(['wireguard', 'amnezia'])
  .openapi('NodeMode');
export const NodeProtocolSchema = z
  .enum(['http', 'https'])
  .openapi('NodeProtocol');

const controlCharacterPattern = /[\x00-\x1f\x7f]/;
const invalidHostCharacterPattern = /[\s/@?#\\]/;

function isValidIpv4(host: string): boolean {
  const parts = host.split('.');
  return (
    parts.length === 4 &&
    parts.every(
      (part) => /^(?:0|[1-9]\d{0,2})$/.test(part) && Number(part) <= 255,
    )
  );
}

function isValidIpv6(host: string): boolean {
  const raw =
    host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host;
  if (!raw.includes(':')) return false;
  try {
    const parsed = new URL(`http://[${raw}]`);
    return parsed.hostname.startsWith('[') && parsed.hostname.endsWith(']');
  } catch {
    return false;
  }
}

function isValidHostname(host: string): boolean {
  const candidate = host.endsWith('.') ? host.slice(0, -1) : host;
  if (candidate.length === 0) return false;
  return candidate
    .split('.')
    .every(
      (label) =>
        label.length >= 1 &&
        label.length <= 63 &&
        /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/.test(label),
    );
}

function isValidNodeHost(host: string): boolean {
  if (
    host !== host.trim() ||
    controlCharacterPattern.test(host) ||
    invalidHostCharacterPattern.test(host) ||
    host.includes('://')
  ) {
    return false;
  }
  if (/^\d+(?:\.\d+){3}$/.test(host)) return isValidIpv4(host);
  if (host.includes(':')) return isValidIpv6(host);
  return isValidHostname(host);
}

export const NodeHostSchema = z
  .string()
  .min(1)
  .max(253)
  .refine(isValidNodeHost, { message: 'Host is invalid' })
  .openapi('NodeHost', {
    example: 'node.example.test',
    description: 'Hostname or IP address without a scheme, path, or port',
  });

const NodeConnectionFieldsSchema = z.object({
  protocol: NodeProtocolSchema,
  host: NodeHostSchema,
  port: z.number().int().min(1).max(65_535),
  username: z
    .string()
    .min(1)
    .max(256)
    .refine(
      (value) => !value.includes(':') && !controlCharacterPattern.test(value),
      { message: 'Username contains unsupported characters' },
    ),
  password: z.string().min(1).max(1_024),
});

export const TestNodeConnectionRequestSchema =
  NodeConnectionFieldsSchema.strict().openapi('TestNodeConnectionRequest');

export const CreateNodeRequestSchema = NodeConnectionFieldsSchema.extend({
  name: z.string().trim().min(1).max(80),
})
  .strict()
  .openapi('CreateNodeRequest');

export const UpdateNodeRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    protocol: NodeProtocolSchema.optional(),
    host: NodeHostSchema.optional(),
    port: z.number().int().min(1).max(65_535).optional(),
    username: z
      .string()
      .min(1)
      .max(256)
      .refine(
        (value) => !value.includes(':') && !controlCharacterPattern.test(value),
        { message: 'Username contains unsupported characters' },
      )
      .optional(),
    password: z.string().min(1).max(1_024).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field is required',
  })
  .openapi('UpdateNodeRequest');

export const NodeMetadataSchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    protocol: NodeProtocolSchema,
    host: NodeHostSchema,
    port: z.number().int(),
    status: NodeStatusSchema,
    detectedVersion: z.string().nullable(),
    mode: NodeModeSchema.nullable(),
    lastErrorCode: NodeErrorCodeSchema.nullable(),
    lastCheckedAt: z.iso.datetime().nullable(),
    lastSyncedAt: z.iso.datetime().nullable(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .openapi('NodeMetadata');

export const NodeConnectionTestResultSchema = z
  .object({
    status: NodeStatusSchema,
    detectedVersion: z.string().nullable(),
    mode: NodeModeSchema.nullable(),
    lastErrorCode: NodeErrorCodeSchema.nullable(),
    lastCheckedAt: z.iso.datetime(),
  })
  .openapi('NodeConnectionTestResult');

export const NodeListSchema = z
  .object({
    items: z.array(NodeMetadataSchema),
    page: CursorPageSchema,
  })
  .openapi('NodeList');

export type NodeStatus = z.infer<typeof NodeStatusSchema>;
export type NodeErrorCode = z.infer<typeof NodeErrorCodeSchema>;
export type NodeMode = z.infer<typeof NodeModeSchema>;
export type NodeProtocol = z.infer<typeof NodeProtocolSchema>;
export type CreateNodeRequest = z.infer<typeof CreateNodeRequestSchema>;
export type UpdateNodeRequest = z.infer<typeof UpdateNodeRequestSchema>;
export type TestNodeConnectionRequest = z.infer<
  typeof TestNodeConnectionRequestSchema
>;
export type NodeMetadata = z.infer<typeof NodeMetadataSchema>;
export type NodeConnectionTestResult = z.infer<
  typeof NodeConnectionTestResultSchema
>;

const jsonRequest = <T extends z.ZodType>(schema: T) => ({
  content: { 'application/json': { schema } },
  required: true as const,
});

const jsonResponse = <T extends z.ZodType>(schema: T, description: string) => ({
  description,
  content: { 'application/json': { schema } },
  headers: RequestIdHeaderSchema,
});

const errorResponse = (description: string) =>
  jsonResponse(ErrorResponseSchema, description);

const nodeReadSecurity: Record<string, string[]>[] = [
  { cookieAuth: [] },
  { bearerAuth: [] },
];

export const listNodesRoute = createRoute({
  method: 'get',
  path: '/v1/nodes',
  operationId: 'listNodes',
  tags: ['Nodes'],
  summary: 'List safe node metadata',
  security: nodeReadSecurity,
  request: { query: CursorQuerySchema },
  responses: {
    200: jsonResponse(NodeListSchema, 'Cursor-paginated node metadata'),
    400: errorResponse('Invalid pagination input'),
    401: errorResponse('Authentication is required'),
    403: errorResponse('The credential lacks node-read authority'),
    500: errorResponse('Unexpected server error'),
  },
});

export const createNodeRoute = createRoute({
  method: 'post',
  path: '/v1/nodes',
  operationId: 'createNode',
  tags: ['Nodes'],
  summary: 'Create and probe a node',
  security: nodeReadSecurity,
  request: { body: jsonRequest(CreateNodeRequestSchema) },
  responses: {
    201: jsonResponse(
      NodeMetadataSchema,
      'Node created with safe probe status',
    ),
    400: errorResponse('Invalid node input'),
    401: errorResponse('Authentication is required'),
    403: errorResponse('Untrusted origin or insufficient scope'),
    409: errorResponse('Node name or endpoint already exists'),
    500: errorResponse('Unexpected server error'),
  },
});

export const testNodeConnectionRoute = createRoute({
  method: 'post',
  path: '/v1/nodes/test',
  operationId: 'testNodeConnection',
  tags: ['Nodes'],
  summary: 'Test unsaved node connection settings',
  security: nodeReadSecurity,
  request: { body: jsonRequest(TestNodeConnectionRequestSchema) },
  responses: {
    200: jsonResponse(NodeConnectionTestResultSchema, 'Safe probe result'),
    400: errorResponse('Invalid node input'),
    401: errorResponse('Authentication is required'),
    403: errorResponse('Untrusted origin or insufficient scope'),
    500: errorResponse('Unexpected server error'),
  },
});

const nodeIdRequest = { params: z.object({ nodeId: z.uuid() }) };

export const getNodeRoute = createRoute({
  method: 'get',
  path: '/v1/nodes/{nodeId}',
  operationId: 'getNode',
  tags: ['Nodes'],
  summary: 'Read safe node metadata',
  security: nodeReadSecurity,
  request: nodeIdRequest,
  responses: {
    200: jsonResponse(NodeMetadataSchema, 'Safe node metadata'),
    400: errorResponse('Invalid node identifier'),
    401: errorResponse('Authentication is required'),
    403: errorResponse('The credential lacks node-read authority'),
    404: errorResponse('Node does not exist'),
    500: errorResponse('Unexpected server error'),
  },
});

export const updateNodeRoute = createRoute({
  method: 'patch',
  path: '/v1/nodes/{nodeId}',
  operationId: 'updateNode',
  tags: ['Nodes'],
  summary: 'Update and conditionally probe a node',
  security: nodeReadSecurity,
  request: {
    ...nodeIdRequest,
    body: jsonRequest(UpdateNodeRequestSchema),
  },
  responses: {
    200: jsonResponse(NodeMetadataSchema, 'Updated safe node metadata'),
    400: errorResponse('Invalid node input'),
    401: errorResponse('Authentication is required'),
    403: errorResponse('Untrusted origin or insufficient scope'),
    404: errorResponse('Node does not exist'),
    409: errorResponse('Node name or endpoint already exists'),
    500: errorResponse('Unexpected server error'),
  },
});

export const testStoredNodeRoute = createRoute({
  method: 'post',
  path: '/v1/nodes/{nodeId}/test',
  operationId: 'testStoredNode',
  tags: ['Nodes'],
  summary: 'Retest a stored node',
  security: nodeReadSecurity,
  request: nodeIdRequest,
  responses: {
    200: jsonResponse(
      NodeMetadataSchema,
      'Node metadata with refreshed status',
    ),
    400: errorResponse('Invalid node identifier'),
    401: errorResponse('Authentication is required'),
    403: errorResponse('Untrusted origin or insufficient scope'),
    404: errorResponse('Node does not exist'),
    500: errorResponse('Unexpected server error'),
  },
});

export const deleteNodeRoute = createRoute({
  method: 'delete',
  path: '/v1/nodes/{nodeId}',
  operationId: 'deleteNode',
  tags: ['Nodes'],
  summary: 'Delete a node without upstream side effects',
  security: nodeReadSecurity,
  request: nodeIdRequest,
  responses: {
    204: {
      description: 'Node deleted',
      headers: RequestIdHeaderSchema,
    },
    400: errorResponse('Invalid node identifier'),
    401: errorResponse('Authentication is required'),
    403: errorResponse('Untrusted origin or insufficient scope'),
    404: errorResponse('Node does not exist'),
    409: errorResponse('Node has managed placements'),
    500: errorResponse('Unexpected server error'),
  },
});
