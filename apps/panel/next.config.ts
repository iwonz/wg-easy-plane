import path from 'node:path';
import type { NextConfig } from 'next';
import { browserSecurityHeaders } from '@wg-easy-plane/config/security-headers';

const nextConfig: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: path.join(import.meta.dirname, '../..'),
  poweredByHeader: false,
  serverExternalPackages: ['better-sqlite3'],
  transpilePackages: ['@wg-easy-plane/ui'],
  async headers() {
    return [
      {
        source: '/:path*',
        headers: browserSecurityHeaders({
          development: process.env.NODE_ENV === 'development',
        }),
      },
    ];
  },
};

export default nextConfig;
