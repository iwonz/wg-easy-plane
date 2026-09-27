import http, { type IncomingMessage, type ServerResponse } from 'node:http';

const expectedAuthorization = `Basic ${Buffer.from(
  'synthetic-admin:synthetic-node-password',
).toString('base64')}`;
const baseTime = '2026-09-27T10:00:00.000Z';

type RawClient = {
  id: number;
  userId: number;
  interfaceId: string;
  name: string;
  ipv4Address: string;
  ipv6Address: string;
  preUp: string;
  postUp: string;
  preDown: string;
  postDown: string;
  publicKey: string;
  expiresAt: string | null;
  allowedIps: string[] | null;
  serverAllowedIps: string[];
  firewallIps: string[] | null;
  persistentKeepalive: number;
  mtu: number;
  jC: number | null;
  jMin: number | null;
  jMax: number | null;
  i1: string | null;
  i2: string | null;
  i3: string | null;
  i4: string | null;
  i5: string | null;
  dns: string[] | null;
  serverEndpoint: string | null;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  oneTimeLink: null;
  latestHandshakeAt: string | null;
  endpoint: string | null;
  transferRx: number | null;
  transferTx: number | null;
};

function syntheticClient(id: number, suffix: number): RawClient {
  return {
    id,
    userId: 1,
    interfaceId: 'wg0',
    name: 'shared-synthetic-client',
    ipv4Address: `192.0.2.${suffix}`,
    ipv6Address: `2001:db8::${suffix}`,
    preUp: '',
    postUp: '',
    preDown: '',
    postDown: '',
    publicKey: `synthetic-public-key-${suffix}`,
    expiresAt: '2027-09-27T10:00:00.000Z',
    allowedIps: ['0.0.0.0/0', '::/0'],
    serverAllowedIps: [],
    firewallIps: ['192.0.2.0/24'],
    persistentKeepalive: 25,
    mtu: 1420,
    jC: 4,
    jMin: 40,
    jMax: 70,
    i1: 'synthetic-header-one',
    i2: 'synthetic-header-two',
    i3: 'synthetic-header-three',
    i4: 'synthetic-header-four',
    i5: null,
    dns: ['192.0.2.53'],
    serverEndpoint: 'vpn.example.test:51820',
    enabled: true,
    createdAt: baseTime,
    updatedAt: baseTime,
    oneTimeLink: null,
    latestHandshakeAt: null,
    endpoint: null,
    transferRx: 0,
    transferTx: 0,
  };
}

function json(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
  });
  response.end(JSON.stringify(body));
}

async function requestBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
}

function createServer(port: number, isAwg: boolean, seedId: number) {
  const clients = new Map<number, RawClient>([
    [seedId, syntheticClient(seedId, isAwg ? 11 : 10)],
  ]);
  let nextId = seedId + 100;

  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', `http://127.0.0.1:${port}`);
    if (url.pathname === '/__health') {
      json(response, 200, { status: 'ok' });
      return;
    }
    if (request.method === 'GET' && url.pathname === '/api/information') {
      json(response, 200, {
        currentRelease: 'v15.4.0',
        latestRelease: { version: 'v15.4.0', changelog: '' },
        updateAvailable: false,
        insecure: false,
        isAwg,
        firewallEnabled: true,
      });
      return;
    }
    if (request.headers.authorization !== expectedAuthorization) {
      json(response, 401, { error: 'synthetic unauthorized' });
      return;
    }
    if (request.method === 'GET' && url.pathname === '/api/client') {
      json(response, 200, [...clients.values()]);
      return;
    }
    if (request.method === 'POST' && url.pathname === '/api/client') {
      const body = (await requestBody(request)) as {
        name: string;
        expiresAt: string | null;
      };
      const id = nextId++;
      const created = syntheticClient(id, (id % 100) + 20);
      created.name = body.name;
      created.expiresAt = body.expiresAt;
      clients.set(id, created);
      json(response, 200, { success: true, clientId: id });
      return;
    }

    const match = url.pathname.match(/^\/api\/client\/(\d+)(.*)$/);
    if (!match?.[1]) {
      json(response, 404, { error: 'synthetic not found' });
      return;
    }
    const id = Number(match[1]);
    const suffix = match[2];
    const client = clients.get(id);
    if (!client) {
      json(response, 404, { error: 'synthetic not found' });
      return;
    }

    if (request.method === 'GET' && suffix === '/configuration') {
      response.writeHead(200, {
        'Content-Type': 'application/octet-stream',
        'Cache-Control': 'no-store',
      });
      response.end(
        `[Interface]\nPrivateKey = SYNTHETIC_E2E_ONLY\nAddress = ${client.ipv4Address}/32\n`,
      );
      return;
    }
    if (request.method === 'GET' && suffix === '/qrcode.svg') {
      response.writeHead(200, {
        'Content-Type': 'image/svg+xml',
        'Cache-Control': 'no-store',
      });
      response.end(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8"><rect width="8" height="8" fill="#fff"/><path d="M1 1h2v2H1zm4 0h2v2H5zM1 5h2v2H1zm4 0h2v2H5z"/></svg>',
      );
      return;
    }
    if (request.method === 'POST' && suffix === '') {
      const body = (await requestBody(request)) as Partial<RawClient>;
      clients.set(id, {
        ...client,
        ...body,
        id,
        userId: client.userId,
        interfaceId: client.interfaceId,
        publicKey: client.publicKey,
        createdAt: client.createdAt,
        updatedAt: new Date().toISOString(),
        oneTimeLink: null,
        latestHandshakeAt: client.latestHandshakeAt,
        endpoint: null,
        transferRx: client.transferRx,
        transferTx: client.transferTx,
      });
      json(response, 200, { success: true });
      return;
    }
    if (
      request.method === 'POST' &&
      (suffix === '/enable' || suffix === '/disable')
    ) {
      client.enabled = suffix === '/enable';
      client.updatedAt = new Date().toISOString();
      json(response, 200, { success: true });
      return;
    }
    if (request.method === 'DELETE' && suffix === '') {
      clients.delete(id);
      json(response, 200, { success: true });
      return;
    }
    json(response, 404, { error: 'synthetic not found' });
  });

  return new Promise<http.Server>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

const servers = await Promise.all([
  createServer(39_010, false, 7),
  createServer(39_011, true, 9),
]);

function close() {
  for (const server of servers) server.close();
}
process.once('SIGINT', close);
process.once('SIGTERM', close);
