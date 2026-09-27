import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const runDirectory = fs.mkdtempSync(
  path.join(os.tmpdir(), 'wg-easy-plane-e2e-'),
);
const cli = path.join(root, 'node_modules', '@playwright', 'test', 'cli.js');
let status = 1;

function reserveLoopbackPort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        reject(new Error('Could not reserve an E2E loopback port'));
        return;
      }
      resolve({ port: address.port, server });
    });
  });
}

function closeReservation(reservation) {
  return new Promise((resolve, reject) => {
    reservation.server.close((error) => (error ? reject(error) : resolve()));
  });
}

const [panelReservation, subscriptionReservation] = await Promise.all([
  reserveLoopbackPort(),
  reserveLoopbackPort(),
]);
await Promise.all([
  closeReservation(panelReservation),
  closeReservation(subscriptionReservation),
]);

try {
  const result = spawnSync(process.execPath, [cli, 'test'], {
    cwd: root,
    env: {
      ...process.env,
      WGEP_E2E_DIRECTORY: runDirectory,
      WGEP_E2E_PANEL_PORT: String(panelReservation.port),
      WGEP_E2E_SUBSCRIPTION_PORT: String(subscriptionReservation.port),
    },
    stdio: 'inherit',
  });
  status = result.status ?? 1;
} finally {
  const resolved = path.resolve(runDirectory);
  const allowedPrefix = `${path.resolve(os.tmpdir())}${path.sep}wg-easy-plane-e2e-`;
  if (!resolved.startsWith(allowedPrefix)) {
    throw new Error('Refusing to remove an unexpected E2E directory');
  }
  fs.rmSync(resolved, { recursive: true, force: true });
}

process.exitCode = status;
