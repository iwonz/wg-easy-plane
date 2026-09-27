import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { getOpenApiDocument } from '../apps/panel/server/api/app';

const outputPath = path.resolve('packages/api-client/openapi.json');

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(
  outputPath,
  `${JSON.stringify(getOpenApiDocument(), null, 2)}\n`,
  'utf8',
);
