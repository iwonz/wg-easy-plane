import AxeBuilder from '@axe-core/playwright';
import {
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Page,
} from '@playwright/test';

type ApiResult<T> = { status: number; body: T | null };
type NodeResult = { id: string; name: string; status: string };
type ManagedResult = {
  id: string;
  name: string;
  placements: Array<{
    id: string;
    nodeName: string;
    status: string;
  }>;
};
type SubscriptionLink = { url: string | null };

async function api<T>(
  page: Page,
  method: string,
  path: string,
  body?: unknown,
): Promise<ApiResult<T>> {
  return page.evaluate(
    async ({ method, path, body }) => {
      const response = await fetch(path, {
        method,
        credentials: 'same-origin',
        headers:
          body === undefined
            ? undefined
            : { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const contentType = response.headers.get('content-type');
      return {
        status: response.status,
        body: contentType?.includes('application/json')
          ? ((await response.json()) as T)
          : null,
      };
    },
    { method, path, body },
  );
}

function expectSecurityHeaders(headers: Record<string, string>) {
  expect(headers['content-security-policy']).toContain("base-uri 'none'");
  expect(headers['content-security-policy']).toContain("object-src 'none'");
  expect(headers['content-security-policy']).toContain(
    "frame-ancestors 'none'",
  );
  expect(headers['cross-origin-opener-policy']).toBe('same-origin');
  expect(headers['cross-origin-resource-policy']).toBe('same-origin');
  expect(headers['referrer-policy']).toBe('no-referrer');
  expect(headers['x-content-type-options']).toBe('nosniff');
  expect(headers['x-frame-options']).toBe('DENY');
  expect(headers['strict-transport-security']).toContain('max-age=63072000');
}

async function expectNoSeriousAxeViolations(page: Page) {
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze();
  const violations = result.violations
    .filter((violation) =>
      ['critical', 'serious'].includes(violation.impact ?? ''),
    )
    .map(({ id, impact, nodes }) => ({
      id,
      impact,
      nodes: nodes.map((node) => ({
        target: node.target,
        failureSummary: node.failureSummary,
      })),
    }));
  expect(violations).toEqual([]);
}

test.describe.serial('release system journey', () => {
  let panelPage: Page;
  let panelContext: BrowserContext;
  let browser: Browser;
  let managed: ManagedResult;
  let subscriptionUrl: URL;

  test.beforeAll(async ({ browser: activeBrowser }) => {
    browser = activeBrowser;
    panelContext = await browser.newContext({ locale: 'en-US' });
    panelPage = await panelContext.newPage();
  });

  test.afterAll(async () => {
    await panelContext.close();
  });

  test('onboards one admin and keeps same-name clients distinct across nodes', async () => {
    const page = panelPage;
    const response = await page.goto('/');
    expect(response).not.toBeNull();
    expectSecurityHeaders(response!.headers());

    await expect(
      page.getByRole('heading', { name: 'Create the administrator' }),
    ).toBeVisible();
    await page.getByLabel('Username').fill('e2e-admin');
    await page
      .getByRole('textbox', { name: 'Password' })
      .fill('Synthetic-E2E-Password-2026!');
    await page.getByRole('button', { name: 'Create administrator' }).click();
    await expect(page.getByText('Signed in as e2e-admin')).toBeVisible();

    const repeatedSetup = await api(page, 'POST', '/api/v1/auth/setup', {
      username: 'other-admin',
      password: 'Synthetic-Other-Password-2026!',
    });
    expect(repeatedSetup.status).toBe(409);

    const first = await api<NodeResult>(page, 'POST', '/api/v1/nodes', {
      name: 'Synthetic WireGuard',
      protocol: 'http',
      host: '127.0.0.1',
      port: 39_010,
      username: 'synthetic-admin',
      password: 'synthetic-node-password',
      allowInsecureTls: false,
    });
    const second = await api<NodeResult>(page, 'POST', '/api/v1/nodes', {
      name: 'Synthetic AmneziaWG',
      protocol: 'http',
      host: '127.0.0.1',
      port: 39_011,
      username: 'synthetic-admin',
      password: 'synthetic-node-password',
      allowInsecureTls: false,
    });
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(first.body?.status).toBe('healthy');
    expect(second.body?.status).toBe('healthy');

    await page.reload();
    await expect(
      page.getByText('shared-synthetic-client', { exact: true }),
    ).toHaveCount(2);
    await expect(
      page.getByText('Synthetic WireGuard', { exact: true }).first(),
    ).toBeVisible();
    await expect(
      page.getByText('Synthetic AmneziaWG', { exact: true }).first(),
    ).toBeVisible();

    const created = await api<ManagedResult>(
      page,
      'POST',
      '/api/v1/clients/managed',
      {
        name: 'managed-e2e-client',
        expiresAt: '2027-09-27T10:00:00.000Z',
        nodeIds: [first.body!.id, second.body!.id],
      },
    );
    expect(created.status).toBe(201);
    expect(created.body?.placements).toHaveLength(2);
    expect(
      created.body?.placements.map((placement) => placement.status),
    ).toEqual(['active', 'active']);
    managed = created.body!;

    await page.reload();
    await page.getByRole('tab', { name: 'Managed' }).click();
    await expect(
      page.getByText('managed-e2e-client', { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Subscription' }),
    ).toBeVisible();

    await page.getByText('Dark', { exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute(
      'data-mantine-color-scheme',
      'dark',
    );
    await page.getByText('System', { exact: true }).click();
    await expectNoSeriousAxeViolations(page);
  });

  test('exchanges a fragment without URL/storage leakage and revokes immediately', async () => {
    const link = await api<SubscriptionLink>(
      panelPage,
      'POST',
      `/api/v1/clients/managed/${managed.id}/subscription`,
    );
    expect(link.status).toBe(200);
    expect(link.body?.url).not.toBeNull();
    subscriptionUrl = new URL(link.body!.url!);
    const token = subscriptionUrl.hash.slice(1);
    expect(token).toMatch(/^wgep_sub_[A-Za-z0-9_-]{43}$/);

    const context = await browser.newContext({ locale: 'ru-RU' });
    const page = await context.newPage();
    const requestUrls: string[] = [];
    page.on('request', (request) => requestUrls.push(request.url()));

    await page.goto('about:blank');
    await page.evaluate(
      ({ origin, credential }) => {
        // The fragment must be present before the subscription application mounts.
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.href = `${origin}/#${credential}`;
      },
      { origin: subscriptionUrl.origin, credential: token },
    );

    await expect(
      page.getByText('managed-e2e-client', { exact: true }),
    ).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
    await expect(page).toHaveURL(`${subscriptionUrl.origin}/`);
    await expect(
      page.getByText('Synthetic WireGuard', { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText('Synthetic AmneziaWG', { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Скачать конфиг' }),
    ).toHaveCount(2);
    await expect(page.getByRole('button', { name: 'Показать QR' })).toHaveCount(
      2,
    );

    expect(requestUrls.some((url) => url.includes(token))).toBe(false);
    const storageContainsToken = await page.evaluate((credential) => {
      const values = [
        ...Object.values(localStorage),
        ...Object.values(sessionStorage),
      ];
      return values.some((value) => value.includes(credential));
    }, token);
    expect(storageContainsToken).toBe(false);

    const artifacts = await page.evaluate(async (placementId) => {
      const configuration = await fetch(
        `/api/placements/${placementId}/configuration`,
        { cache: 'no-store' },
      );
      const qr = await fetch(`/api/placements/${placementId}/qrcode.svg`, {
        cache: 'no-store',
      });
      return {
        configurationStatus: configuration.status,
        configurationType: configuration.headers.get('content-type'),
        configurationCache: configuration.headers.get('cache-control'),
        configurationIsSynthetic: (await configuration.text()).includes(
          'SYNTHETIC_E2E_ONLY',
        ),
        qrStatus: qr.status,
        qrType: qr.headers.get('content-type')?.split(';', 1)[0],
        qrCache: qr.headers.get('cache-control'),
        qrIsSvg: (await qr.text()).trimStart().startsWith('<svg'),
      };
    }, managed.placements[0]!.id);
    expect(artifacts).toEqual({
      configurationStatus: 200,
      configurationType: 'application/octet-stream',
      configurationCache: 'private, no-store',
      configurationIsSynthetic: true,
      qrStatus: 200,
      qrType: 'image/svg+xml',
      qrCache: 'private, no-store',
      qrIsSvg: true,
    });

    const rootResponse = await page.request.get(subscriptionUrl.origin);
    expectSecurityHeaders(rootResponse.headers());
    await page.getByText('Тёмная', { exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute(
      'data-mantine-color-scheme',
      'dark',
    );
    await expectNoSeriousAxeViolations(page);

    const revoked = await api(
      panelPage,
      'DELETE',
      `/api/v1/clients/managed/${managed.id}/subscription`,
    );
    expect(revoked.status).toBe(204);
    const revokedSession = await page.request.get(
      new URL('/api/subscription', subscriptionUrl.origin).toString(),
    );
    expect(revokedSession.status()).toBe(401);
    await page.reload();
    await expect(
      page.getByRole('alert').getByText('Ссылка подписки недоступна'),
    ).toBeVisible();
    expect(requestUrls.some((url) => url.includes(token))).toBe(false);
    await context.close();
  });

  test('falls back to English without locale-prefixed routes', async () => {
    const context = await browser.newContext({ locale: 'fr-FR' });
    const page = await context.newPage();
    const response = await page.goto('http://localhost:3001/');
    expect(response).not.toBeNull();
    expectSecurityHeaders(response!.headers());
    await expect(
      page.getByRole('alert').getByText('Subscription link unavailable'),
    ).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    expect(new URL(page.url()).pathname).toBe('/');
    await expectNoSeriousAxeViolations(page);
    await context.close();
  });
});
