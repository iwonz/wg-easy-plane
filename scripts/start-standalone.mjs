import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const applications = {
  panel: 3000,
  subscription: 3001,
};
const application = process.argv[2];

if (!application || !(application in applications)) {
  throw new Error('Expected one application: panel or subscription');
}

const root = path.resolve(import.meta.dirname, '..');
const applicationRoot = path.join(root, 'apps', application);
const standaloneRoot = path.join(
  applicationRoot,
  '.next',
  'standalone',
  'apps',
  application,
);
const server = path.join(standaloneRoot, 'server.js');

if (!fs.existsSync(server)) {
  throw new Error(`Build ${application} before starting it`);
}

fs.cpSync(
  path.join(applicationRoot, '.next', 'static'),
  path.join(standaloneRoot, '.next', 'static'),
  { recursive: true, force: true },
);

const publicDirectory = path.join(applicationRoot, 'public');
if (fs.existsSync(publicDirectory)) {
  fs.cpSync(publicDirectory, path.join(standaloneRoot, 'public'), {
    recursive: true,
    force: true,
  });
}

process.env.HOSTNAME ??= '127.0.0.1';
process.env.PORT ??= process.argv[3] ?? String(applications[application]);

await import(pathToFileURL(server).href);
