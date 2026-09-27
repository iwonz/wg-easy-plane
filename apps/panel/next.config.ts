import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  serverExternalPackages: ['better-sqlite3'],
  transpilePackages: ['@wg-easy-plane/ui'],
};

export default nextConfig;
