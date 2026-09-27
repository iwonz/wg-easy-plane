import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const runDirectory = fs.mkdtempSync(
  path.join(os.tmpdir(), 'wg-easy-plane-e2e-'),
);
const cli = path.join(root, 'node_modules', '@playwright', 'test', 'cli.js');
let status = 1;

try {
  const result = spawnSync(process.execPath, [cli, 'test'], {
    cwd: root,
    env: { ...process.env, WGEP_E2E_DIRECTORY: runDirectory },
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
