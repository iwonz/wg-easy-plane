import path from 'node:path';
import type { NextConfig } from 'next';
import { browserSecurityHeaders } from '@wg-easy-plane/config/security-headers';

const nextConfig: NextConfig = {
  allowedDevOrigins: ['localhost', '127.0.0.1'],
  output: 'standalone',
  outputFileTracingRoot: path.join(import.meta.dirname, '../..'),
  poweredByHeader: false,
  transpilePackages: ['@wg-easy-plane/ui'],
  async headers() {
    return [
      {
        source: '/:path*',
        headers: browserSecurityHeaders({
          development: process.env.NODE_ENV === 'development',
        }),
      },
      {
        source: '/',
        headers: [
          { key: 'Cache-Control', value: 'private, no-store' },
          { key: 'Pragma', value: 'no-cache' },
          { key: 'Expires', value: '0' },
        ],
      },
    ];
  },
};

export default nextConfig;
