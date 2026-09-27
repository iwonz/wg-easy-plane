import net from 'node:net';
import { spawnSync } from 'node:child_process';

const project = `wgep-smoke-${process.pid}`;
const version = `smoke-${process.pid}`;
const panelImage = `ghcr.io/iwonz/wg-easy-plane-panel:${version}`;
const subscriptionImage = `ghcr.io/iwonz/wg-easy-plane-subscription:${version}`;
const syntheticKey = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : null;
      server.close((error) => {
        if (error) reject(error);
        else if (port) resolve(port);
        else reject(new Error('Unable to allocate a smoke-test port'));
      });
    });
  });
}

function docker(args, options = {}) {
  const result = spawnSync('docker', args, {
    encoding: 'utf8',
    env: options.env ?? process.env,
    stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  });
  if (result.status !== 0 && !options.allowFailure) {
    if (options.capture && result.stderr) process.stderr.write(result.stderr);
    throw new Error(`Docker command failed: docker ${args.join(' ')}`);
  }
  return result.stdout?.trim() ?? '';
}

async function waitFor(url, expectedStatus = 200) {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { redirect: 'error' });
      if (response.status === expectedStatus) return response;
    } catch {
      // Startup can legitimately refuse connections until health succeeds.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, received ${actual}`);
  }
}

const panelPort = await freePort();
const subscriptionPort = await freePort();
const environment = {
  ...process.env,
  APP_ENCRYPTION_KEY: syntheticKey,
  NODE_REQUEST_TIMEOUT_MS: '1000',
  PANEL_PORT: String(panelPort),
  PANEL_PUBLIC_URL: `http://127.0.0.1:${panelPort}`,
  SUBSCRIPTION_PORT: String(subscriptionPort),
  SUBSCRIPTION_PUBLIC_URL: `http://127.0.0.1:${subscriptionPort}`,
  SYNC_INTERVAL_SECONDS: '0',
  WGEP_VERSION: version,
};
const compose = ['compose', '--project-name', project];

try {
  docker([...compose, 'config', '--quiet'], { env: environment });
  docker([...compose, 'up', '-d', '--build', 'panel'], { env: environment });
  await waitFor(`http://127.0.0.1:${panelPort}/healthz`);

  const panelOnly = docker(
    [...compose, 'ps', '--services', '--filter', 'status=running'],
    { env: environment, capture: true },
  );
  assertEqual(panelOnly, 'panel', 'panel-only Compose services');
  assertEqual(
    docker([...compose, 'exec', '-T', 'panel', 'id', '-u'], {
      env: environment,
      capture: true,
    }),
    '1000',
    'panel UID',
  );

  const setup = await fetch(`http://127.0.0.1:${panelPort}/api/v1/auth/setup`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: `http://127.0.0.1:${panelPort}`,
    },
    body: JSON.stringify({
      username: 'container-smoke-admin',
      password: 'Synthetic-Container-Smoke-2026!',
    }),
  });
  assertEqual(setup.status, 201, 'fresh panel setup status');

  docker([...compose, 'restart', 'panel'], { env: environment });
  await waitFor(`http://127.0.0.1:${panelPort}/healthz`);
  const setupState = await fetch(
    `http://127.0.0.1:${panelPort}/api/v1/auth/setup/status`,
  );
  const setupBody = await setupState.json();
  assertEqual(setupBody.setupRequired, false, 'persistent setup state');
  assertEqual(
    docker(
      [
        ...compose,
        'exec',
        '-T',
        'panel',
        'node',
        '-e',
        "const fs=require('fs');console.log(fs.readdirSync('/data').filter(x=>x.includes('.backup-')).length)",
      ],
      { env: environment, capture: true },
    ),
    '0',
    'redundant migration backups',
  );

  docker([...compose, '--profile', 'subscription', 'up', '-d', '--build'], {
    env: environment,
  });
  await waitFor(`http://127.0.0.1:${panelPort}/healthz`);
  await waitFor(`http://127.0.0.1:${subscriptionPort}/healthz`);
  assertEqual(
    docker(
      [
        ...compose,
        '--profile',
        'subscription',
        'exec',
        '-T',
        'subscription',
        'id',
        '-u',
      ],
      { env: environment, capture: true },
    ),
    '1000',
    'subscription UID',
  );
  await waitFor(`http://127.0.0.1:${subscriptionPort}/api/subscription`, 401);
  process.stdout.write('Container smoke passed.\n');
} finally {
  docker(
    [
      ...compose,
      '--profile',
      'subscription',
      'down',
      '--volumes',
      '--remove-orphans',
    ],
    { env: environment, allowFailure: true },
  );
  docker(['image', 'rm', panelImage, subscriptionImage], {
    allowFailure: true,
  });
}
