export type BrowserSecurityHeader = {
  key: string;
  value: string;
};

export type BrowserSecurityHeaderOptions = {
  development?: boolean;
};

const commonHeaders = Object.freeze<BrowserSecurityHeader[]>([
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  },
  { key: 'Referrer-Policy', value: 'no-referrer' },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains',
  },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
]);

function contentSecurityPolicy(development: boolean): string {
  const scriptSource = ["'self'", "'unsafe-inline'"];
  if (development) scriptSource.push("'unsafe-eval'");

  return [
    "default-src 'self'",
    "base-uri 'none'",
    "connect-src 'self'",
    "font-src 'self' data:",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "img-src 'self' data: blob:",
    "object-src 'none'",
    `script-src ${scriptSource.join(' ')}`,
    "style-src 'self' 'unsafe-inline'",
    "worker-src 'self' blob:",
  ].join('; ');
}

export function browserSecurityHeaders(
  options: BrowserSecurityHeaderOptions = {},
): BrowserSecurityHeader[] {
  return [
    {
      key: 'Content-Security-Policy',
      value: contentSecurityPolicy(options.development === true),
    },
    ...commonHeaders.map((header) => ({ ...header })),
  ];
}
