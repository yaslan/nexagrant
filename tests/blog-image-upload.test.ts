import { afterEach, describe, expect, test, vi } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * TASK-MUU20NSV2TETW — `POST /api/admin/blog/image`, the blog cover upload.
 *
 * Contract (the admin blog form is written against it): 200 `{ url }` with an
 * absolute public URL · 400 `{ error: 'type' | 'size' }` (JPEG/PNG/WebP by
 * their bytes, ≤ 5 MB) · 401/403 `{ error: 'forbidden' }` (platform admins
 * only, the admin/documents gate) · 503 `{ error: 'object_store_unconfigured' }`.
 *
 * The S3 client is replaced (`send` records its commands); storage.ts and
 * env.ts are real and read the environment set before each import. The real
 * store is exercised by tests/e2e/admin-blog-image-upload.spec.ts on MinIO.
 */

const { authMock, sendMock } = vi.hoisted(() => ({ authMock: vi.fn(), sendMock: vi.fn() }));

vi.mock('@/lib/auth', () => ({ auth: authMock }));
vi.mock('@aws-sdk/client-s3', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@aws-sdk/client-s3')>();
  return {
    ...actual,
    S3Client: class {
      send = sendMock;
    },
  };
});

const ADMIN = { user: { id: 'u-admin' }, tenantId: 't-1', role: 'TENANT_OWNER', isPlatformAdmin: true };
const MEMBER = { user: { id: 'u-member' }, tenantId: 't-1', role: 'TENANT_OWNER', isPlatformAdmin: false };

const STORE_ENV = {
  R2_ACCOUNT_ID: 'unit-test',
  R2_ENDPOINT: 'http://localhost:9000',
  R2_ACCESS_KEY_ID: 'k',
  R2_SECRET_ACCESS_KEY: 's',
  R2_BUCKET: 'unit-evidence',
  R2_PUBLIC_BUCKET: 'unit-public',
  R2_PUBLIC_HOST: 'https://cdn.example.com/storage/v1/object/public/unit-public/',
};
const STORE_KEYS = Object.keys(STORE_ENV) as Array<keyof typeof STORE_ENV>;
const saved = Object.fromEntries(STORE_KEYS.map((k) => [k, process.env[k]]));

async function loadRoute(env: Partial<typeof STORE_ENV>) {
  for (const k of STORE_KEYS) {
    if (env[k] === undefined) delete process.env[k];
    else process.env[k] = env[k];
  }
  vi.resetModules();
  return import('@/app/api/admin/blog/image/route');
}

afterEach(() => {
  for (const k of STORE_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  authMock.mockReset();
  sendMock.mockReset();
});

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 1)]);
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 2)]);
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0x40, 0, 0, 0]), Buffer.from('WEBPVP8 '), Buffer.alloc(52, 3)]);

function upload(bytes: Buffer | null, name = 'cover.png', type = 'image/png'): NextRequest {
  const form = new FormData();
  if (bytes) form.set('file', new File([new Uint8Array(bytes)], name, { type }));
  return new NextRequest('http://localhost/api/admin/blog/image', { method: 'POST', body: form });
}

describe('POST /api/admin/blog/image — gate', () => {
  test('anonymous → 401 forbidden, nothing stored', async () => {
    const { POST } = await loadRoute(STORE_ENV);
    authMock.mockResolvedValue(null);
    const res = await POST(upload(PNG));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'forbidden' });
    expect(sendMock).not.toHaveBeenCalled();
  });

  test('a signed-in non-admin → 403 forbidden, nothing stored', async () => {
    const { POST } = await loadRoute(STORE_ENV);
    authMock.mockResolvedValue(MEMBER);
    const res = await POST(upload(PNG));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'forbidden' });
    expect(sendMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/admin/blog/image — file checks', () => {
  test('bytes that are not JPEG/PNG/WebP → 400 type, even named .png as image/png', async () => {
    const { POST } = await loadRoute(STORE_ENV);
    authMock.mockResolvedValue(ADMIN);
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    const res = await POST(upload(svg, 'cover.png', 'image/png'));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'type' });
    expect(sendMock).not.toHaveBeenCalled();
  });

  test('a GIF (a real image, not on the list) → 400 type', async () => {
    const { POST } = await loadRoute(STORE_ENV);
    authMock.mockResolvedValue(ADMIN);
    const res = await POST(upload(Buffer.from('GIF89a\x01\x00\x01\x00', 'latin1'), 'a.gif', 'image/gif'));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'type' });
  });

  test('no file field / an empty file → 400 type', async () => {
    const { POST } = await loadRoute(STORE_ENV);
    authMock.mockResolvedValue(ADMIN);
    expect(await (await POST(upload(null))).json()).toEqual({ error: 'type' });
    const empty = await POST(upload(Buffer.alloc(0)));
    expect(empty.status).toBe(400);
    expect(await empty.json()).toEqual({ error: 'type' });
    expect(sendMock).not.toHaveBeenCalled();
  });

  test('a PNG one byte over 5 MB → 400 size; exactly 5 MB is accepted', async () => {
    const { POST } = await loadRoute(STORE_ENV);
    authMock.mockResolvedValue(ADMIN);
    sendMock.mockResolvedValue({});
    const max = 5 * 1024 * 1024;
    const over = Buffer.concat([PNG, Buffer.alloc(max + 1 - PNG.length)]);
    const res = await POST(upload(over));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'size' });
    expect(sendMock).not.toHaveBeenCalled();

    const atLimit = Buffer.concat([PNG, Buffer.alloc(max - PNG.length)]);
    expect((await POST(upload(atLimit))).status).toBe(200);
  });
});

describe('POST /api/admin/blog/image — no store', () => {
  test.each([
    ['no object store at all', {}],
    ['a store but no public bucket', { ...STORE_ENV, R2_PUBLIC_BUCKET: undefined }],
    ['a store but no public host', { ...STORE_ENV, R2_PUBLIC_HOST: undefined }],
    ['the public bucket is the private evidence bucket', { ...STORE_ENV, R2_PUBLIC_BUCKET: STORE_ENV.R2_BUCKET }],
  ])('%s → 503 object_store_unconfigured, never a silent success', async (_label, env) => {
    const { POST } = await loadRoute(env);
    authMock.mockResolvedValue(ADMIN);
    const res = await POST(upload(PNG));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'object_store_unconfigured' });
    expect(sendMock).not.toHaveBeenCalled();
  });

  test('the gate still runs first: a non-admin gets 403, not the 503', async () => {
    const { POST } = await loadRoute({});
    authMock.mockResolvedValue(MEMBER);
    expect((await POST(upload(PNG))).status).toBe(403);
  });
});

describe('POST /api/admin/blog/image — success', () => {
  test.each([
    ['png', PNG, 'image/png'],
    ['jpg', JPEG, 'image/jpeg'],
    ['webp', WEBP, 'image/webp'],
  ] as const)('a %s is stored in the public bucket and its public URL returned', async (ext, bytes, contentType) => {
    const { POST } = await loadRoute(STORE_ENV);
    authMock.mockResolvedValue(ADMIN);
    sendMock.mockResolvedValue({});
    // The declared name and type are ignored: the bytes decide the extension.
    const res = await POST(upload(bytes, 'whatever.bin', 'application/octet-stream'));
    expect(res.status).toBe(200);
    const { url } = (await res.json()) as { url: string };

    expect(sendMock).toHaveBeenCalledTimes(1);
    const input = sendMock.mock.calls[0]![0].input as Record<string, unknown>;
    expect(input.Bucket).toBe('unit-public');
    expect(input.ContentType).toBe(contentType);
    expect(String(input.CacheControl)).toContain('max-age=31536000');
    expect(Buffer.from(input.Body as Buffer).equals(bytes)).toBe(true);
    const year = new Date().getUTCFullYear();
    expect(input.Key).toMatch(new RegExp(`^blog/${year}/c[0-9a-z]{24}\\.${ext}$`));

    expect(url).toBe(`https://cdn.example.com/storage/v1/object/public/unit-public/${input.Key as string}`);
  });

  test('two uploads of the same bytes get different keys', async () => {
    const { POST } = await loadRoute(STORE_ENV);
    authMock.mockResolvedValue(ADMIN);
    sendMock.mockResolvedValue({});
    const a = (await (await POST(upload(PNG))).json()) as { url: string };
    const b = (await (await POST(upload(PNG))).json()) as { url: string };
    expect(a.url).not.toBe(b.url);
  });

  test('the store refusing the write → 500 upload_failed, no URL', async () => {
    const { POST } = await loadRoute(STORE_ENV);
    authMock.mockResolvedValue(ADMIN);
    sendMock.mockRejectedValue(Object.assign(new Error('AccessDenied'), { $metadata: { httpStatusCode: 403 } }));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await POST(upload(PNG));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'upload_failed' });
  });
});

describe('the public host reaches next/image and the CSP', () => {
  type Pattern = { protocol: string; hostname: string; port?: string; pathname?: string };

  async function remotePatterns(host: string | undefined): Promise<Pattern[]> {
    const before = process.env.R2_PUBLIC_HOST;
    if (host === undefined) delete process.env.R2_PUBLIC_HOST;
    else process.env.R2_PUBLIC_HOST = host;
    try {
      vi.resetModules();
      const config = (await import('../next.config')).default as unknown as (phase: string) => {
        images: { remotePatterns: Pattern[] };
      };
      return config('phase-test').images.remotePatterns;
    } finally {
      if (before === undefined) delete process.env.R2_PUBLIC_HOST;
      else process.env.R2_PUBLIC_HOST = before;
    }
  }

  test('R2_PUBLIC_HOST adds its host, port and `blog/` path — nothing wider', async () => {
    const patterns = await remotePatterns('https://abc.supabase.co/storage/v1/object/public/blog-public/');
    expect(patterns).toContainEqual({
      protocol: 'https',
      hostname: 'abc.supabase.co',
      port: '',
      pathname: '/storage/v1/object/public/blog-public/blog/**',
    });
    const minio = await remotePatterns('http://localhost:9000/test-public');
    expect(minio).toContainEqual({ protocol: 'http', hostname: 'localhost', port: '9000', pathname: '/test-public/blog/**' });
  });

  test('unset or not http(s): no extra pattern, the fixed ones stay', async () => {
    const base = await remotePatterns(undefined);
    expect(base.map((p) => p.hostname)).toEqual(['images.unsplash.com', 'lh3.googleusercontent.com']);
    expect(await remotePatterns('ftp://files.example.com/x')).toEqual(base);
  });

  test('CSP img-src carries the origin of a path-bearing R2_PUBLIC_HOST', async () => {
    const { buildContentSecurityPolicy, cspOptionsFromEnv } = await import('@/lib/security-headers');
    const csp = buildContentSecurityPolicy(
      cspOptionsFromEnv('n', { NODE_ENV: 'production', R2_PUBLIC_HOST: 'https://abc.supabase.co/storage/v1/object/public/b' })
    );
    const img = csp.split('; ').find((d) => d.startsWith('img-src '));
    expect(img?.split(' ')).toContain('https://abc.supabase.co');
  });
});
