import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const listed = spawnSync(
  'git',
  ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
  { cwd: root, encoding: 'utf8' },
);
if (listed.status !== 0) {
  process.stderr.write('Privacy audit could not enumerate repository files.\n');
  process.exit(1);
}

const files = listed.stdout.split('\0').filter(Boolean);
const findings = [];

const forbiddenSegments = new Set([
  '.auth',
  '.playwright-cli',
  'playwright-report',
  'test-results',
]);
const forbiddenNames = new Set(['storageState.json']);
const forbiddenExtensions = new Set([
  '.awg',
  '.conf',
  '.db',
  '.har',
  '.key',
  '.log',
  '.mobileconfig',
  '.p12',
  '.pem',
  '.pfx',
  '.qrcode',
  '.sqlite',
  '.sqlite3',
  '.wg',
]);

function report(file, reason) {
  findings.push(`${file}: ${reason}`);
}

for (const file of files) {
  const normalized = file.split(path.sep).join('/');
  const segments = normalized.split('/');
  const basename = path.basename(file);
  const lower = basename.toLowerCase();
  const extension = path.extname(lower);

  if (basename.startsWith('.env') && basename !== '.env.example') {
    report(file, 'environment file must stay untracked');
  }
  if (segments.some((segment) => forbiddenSegments.has(segment))) {
    report(file, 'browser or authentication artifact path is forbidden');
  }
  if (forbiddenNames.has(basename)) {
    report(file, 'browser storage-state artifact is forbidden');
  }
  if (
    forbiddenExtensions.has(extension) ||
    /\.(?:db|sqlite|sqlite3)-(?:shm|wal)$/i.test(lower) ||
    /\.backup-/i.test(lower) ||
    /(?:screenshot|screen-recording).+\.(?:jpe?g|png|webm)$/i.test(lower) ||
    lower.endsWith('.trace.zip')
  ) {
    report(file, 'operational or test artifact filename is forbidden');
  }

  const absolute = path.join(root, file);
  let bytes;
  try {
    const stat = fs.statSync(absolute);
    if (!stat.isFile() || stat.size > 5 * 1024 * 1024) continue;
    bytes = fs.readFileSync(absolute);
  } catch {
    report(file, 'candidate file could not be inspected');
    continue;
  }
  if (bytes.includes(0)) continue;
  const content = bytes.toString('utf8');

  if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(content)) {
    report(file, 'private-key block is forbidden');
  }
  if (/wgep_(?:pat|sub)_[A-Za-z0-9_-]{43}/.test(content)) {
    report(file, 'literal production-format control-plane token is forbidden');
  }
  if (
    /\/(?:Users|home)\/(?!synthetic(?:\/|$)|node(?:\/|$))[^/\s"']+\//.test(
      content,
    )
  ) {
    report(file, 'absolute personal home path is forbidden');
  }
  if (/\b[A-Za-z]:\\Users\\[^\\\s"']+\\/i.test(content)) {
    report(file, 'absolute Windows user path is forbidden');
  }
}

if (findings.length > 0) {
  process.stderr.write('Privacy audit failed:\n');
  for (const finding of [...new Set(findings)].sort()) {
    process.stderr.write(`- ${finding}\n`);
  }
  process.exit(1);
}

process.stdout.write(
  `Privacy audit passed (${files.length} candidate files).\n`,
);
