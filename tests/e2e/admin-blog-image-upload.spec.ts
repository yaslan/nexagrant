import { test, expect, request as playwrightRequest, type Page } from '@playwright/test';
import { encode } from 'next-auth/jwt';
import { DeleteObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { e2eAuthSecret } from './fixtures/auth-secret';

/**
 * TASK-MUU20NSV2TETW — `POST /api/admin/blog/image` against a real
 * S3-compatible store (the CI job's MinIO), not a mock of one: the running
 * server stores the bytes in the public bucket, and the URL it returns is read
 * back with no session at all — 200, the same bytes, the sniffed type.
 *
 * Needs R2_* plus R2_PUBLIC_BUCKET / R2_PUBLIC_HOST in the environment of the
 * e2e run (.github/workflows/ci.yml "E2E Test" creates `test-public` with an
 * anonymous-read policy). Outside CI without them the file skips; in CI a
 * missing store fails it, so a green run always means a real upload happened.
 */

const COOKIE_NAME = 'authjs.session-token';
const PUBLIC_BUCKET = process.env.R2_PUBLIC_BUCKET;
const PUBLIC_HOST = process.env.R2_PUBLIC_HOST;
const configured = Boolean(process.env.R2_ACCOUNT_ID && PUBLIC_BUCKET && PUBLIC_HOST);

// A real 1×1 PNG (red pixel), so any image tool would also accept it.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==',
  'base64'
);

async function signIn(page: Page, baseURL: string, admin: boolean): Promise<void> {
  const value = await encode({
    token: admin
      ? {
          sub: 'demo-user-superadmin',
          id: 'demo-user-superadmin',
          name: 'Platform Admin',
          email: 'admin@yasinaslan.com.tr',
          tenantId: 'demo-tenant',
          role: 'SUPER_ADMIN',
          isPlatformAdmin: true,
        }
      : {
          sub: 'e2e-member',
          id: 'e2e-member',
          name: 'Tenant Owner',
          email: 'member@example.com',
          tenantId: 'demo-tenant',
          role: 'TENANT_OWNER',
          isPlatformAdmin: false,
        },
    secret: e2eAuthSecret(),
    salt: COOKIE_NAME,
    maxAge: 60 * 60,
  });
  await page.context().addCookies([{ name: COOKIE_NAME, value, url: baseURL }]);
}

test.describe('admin blog image upload — real object store', () => {
  test.skip(!configured && !process.env.CI, 'no public object store in this environment (R2_PUBLIC_BUCKET / R2_PUBLIC_HOST unset)');

  const stored: string[] = [];

  test.afterAll(async () => {
    if (!configured || stored.length === 0) return;
    const s3 = new S3Client({
      region: 'auto',
      endpoint: process.env.R2_ENDPOINT,
      forcePathStyle: true,
      credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID ?? '', secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? '' },
    });
    for (const key of stored) await s3.send(new DeleteObjectCommand({ Bucket: PUBLIC_BUCKET, Key: key }));
  });

  test('the store is configured for this run (CI must not pass by skipping)', () => {
    expect(configured, 'R2_ACCOUNT_ID, R2_PUBLIC_BUCKET and R2_PUBLIC_HOST must be set').toBe(true);
  });

  test('a non-admin gets 403 forbidden and nothing is stored', async ({ page, baseURL }) => {
    await signIn(page, baseURL as string, false);
    const res = await page.request.post('/api/admin/blog/image', {
      multipart: { file: { name: 'cover.png', mimeType: 'image/png', buffer: PNG } },
    });
    expect(res.status()).toBe(403);
    expect(await res.json()).toEqual({ error: 'forbidden' });
  });

  test('bytes that are not an image are refused with 400 type', async ({ page, baseURL }) => {
    await signIn(page, baseURL as string, true);
    const res = await page.request.post('/api/admin/blog/image', {
      multipart: { file: { name: 'cover.png', mimeType: 'image/png', buffer: Buffer.from('<svg><script>1</script></svg>') } },
    });
    expect(res.status()).toBe(400);
    expect(await res.json()).toEqual({ error: 'type' });
  });

  test('an admin uploads a PNG; the returned URL is public and serves the same bytes', async ({ page, baseURL }) => {
    await signIn(page, baseURL as string, true);
    const res = await page.request.post('/api/admin/blog/image', {
      multipart: { file: { name: 'kapak.png', mimeType: 'image/png', buffer: PNG } },
    });
    expect(res.status()).toBe(200);
    const { url } = (await res.json()) as { url: string };

    const base = (PUBLIC_HOST as string).replace(/\/+$/, '');
    expect(url.startsWith(`${base}/blog/`)).toBe(true);
    expect(url).toMatch(/\/blog\/\d{4}\/c[0-9a-z]{24}\.png$/);
    stored.push(url.slice(base.length + 1));
    console.log(`[blog-image e2e] uploaded → ${url}`);

    // No cookie, no signature: a fresh context, as a visitor's browser would be.
    const anon = await playwrightRequest.newContext();
    try {
      const got = await anon.get(url);
      console.log(`[blog-image e2e] anonymous GET → ${got.status()} ${got.headers()['content-type']}`);
      expect(got.status()).toBe(200);
      expect(got.headers()['content-type']).toBe('image/png');
      expect(got.headers()['cache-control']).toContain('max-age=31536000');
      expect(Buffer.from(await got.body()).equals(PNG)).toBe(true);
    } finally {
      await anon.dispose();
    }
  });
});
