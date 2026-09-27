import path from 'node:path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: path.join(import.meta.dirname, '../..'),
  poweredByHeader: false,
  serverExternalPackages: ['better-sqlite3'],
  transpilePackages: ['@wg-easy-plane/ui'],
};

export default nextConfig;
