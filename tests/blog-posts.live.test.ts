import { describe, test, expect, beforeAll, afterAll, afterEach, beforeEach, vi } from 'vitest';

/**
 * Live blog persistence (AKTAR-MURBCJ0A-1) — real Postgres, real Prisma, the
 * `fabrika_app` role (NOBYPASSRLS), the real /admin/blog server actions. Only
 * the session (`@/lib/auth`) and `next/cache` are stubbed.
 *
 * Before this suite the posts lived in a module-level array in src/lib/blog.ts:
 * an admin's post vanished on restart and every server instance showed its own
 * blog. Every write here is therefore checked against a SECOND connection (the
 * owner role) — a row the action's own process merely remembers does not count.
 *
 * Rows are keyed by a per-run slug suffix and only those rows are deleted, so
 * the suite is safe on a shared database.
 */
const { rlsUrl: RLS_URL, ownerUrl: OWNER_URL } = await vi.hoisted(async () => {
  const { readFileSync, existsSync } = await import('node:fs');
  const { resolve } = await import('node:path');
  const path = resolve(process.cwd(), '.env');
  const read = (key: string): string | undefined => {
    if (!existsSync(path)) return undefined;
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      const t = line.trim();
      const i = t.indexOf('=');
      if (i > 0 && t.slice(0, i) === key) {
        const v = t.slice(i + 1).replace(/^["']|["']$/g, '');
        return v || undefined;
      }
    }
    return undefined;
  };
  const ownerUrl = process.env.DATABASE_URL ?? read('DATABASE_URL');
  const rlsUrl = process.env.DATABASE_URL_RLS_TEST ?? read('DATABASE_URL_RLS_TEST');
  if (rlsUrl) process.env.DATABASE_URL = rlsUrl;
  return { rlsUrl, ownerUrl };
});

const m = vi.hoisted(() => ({ auth: vi.fn(), revalidatePath: vi.fn() }));
vi.mock('@/lib/auth', () => ({ auth: m.auth }));
vi.mock('next/cache', () => ({ revalidatePath: m.revalidatePath }));

import { createDbClient, prisma } from '@/lib/db';
import { getBlogPostBySlug, getBlogPosts, getFeaturedBlogPosts } from '@/lib/blog';
import {
  createBlogPostAction,
  deleteBlogPostAction,
  toggleFeaturedBlogPostAction,
  updateBlogPostAction,
} from '@/app/[locale]/admin/blog/actions';
import { estimateReadMinutes } from '@/lib/blog-read-time';
import { assertRlsSubjectRole, requireRlsTestUrl, skipOrFailInCi } from './helpers/live-db-role';
import { sqlStatements } from './helpers/sql-statements';

const admin = createDbClient(OWNER_URL ?? 'postgresql://fabrika:fabrika@localhost:5432/fabrika');
const SUITE = 'blog posts test';

const REACHABLE =
  requireRlsTestUrl(RLS_URL, SUITE) !== undefined &&
  (await admin.$queryRaw`SELECT 1`.then(() => true).catch(() => false));
if (RLS_URL && !REACHABLE) skipOrFailInCi(SUITE, 'Postgres is unreachable (`docker compose up -d`)');

// The table arrives with prisma/migrations/add-blog-post.sql (or `db push`). A
// database that has neither is a setup gap, not a pass: CI fails, a laptop warns.
const HAS_TABLE = REACHABLE
  ? ((await admin.$queryRaw<Array<{ t: string | null }>>`SELECT to_regclass('public."BlogPost"')::text AS t`)[0]?.t ?? null) !== null
  : false;
if (REACHABLE && !HAS_TABLE) {
  skipOrFailInCi(SUITE, 'table "BlogPost" is missing — apply prisma/migrations/add-blog-post.sql (scripts/apply-migrations.sh)');
}
const HAS_DB = REACHABLE && HAS_TABLE;

if (HAS_DB) await assertRlsSubjectRole(prisma, SUITE);

const RUN = Math.random().toString(36).slice(2, 10);
const STARTED = new Date(Date.now() - 1000);
const slugOf = (label: string) => `live-${label}-${RUN}`;

const PLATFORM_ADMIN = {
  user: { id: `blog-admin-${RUN}`, email: 'admin@example.test', name: 'Blog Admin' },
  tenantId: 'tenant-A',
  role: 'TENANT_OWNER',
  workspaceIds: [],
  isPlatformAdmin: true,
};
const OTHER_TENANT_ADMIN = {
  user: { id: `blog-owner-${RUN}`, email: 'owner@tenant-b.test' },
  tenantId: 'tenant-B',
  role: 'TENANT_OWNER',
  workspaceIds: [],
  isPlatformAdmin: false,
};

const CONTENT =
  '# Başlık\n\nBu yazı canlı veritabanı testinin içeriğidir; en az yirmi karakterden uzundur.\n\n* madde bir\n* madde iki';

function form(label: string, overrides: Record<string, unknown> = {}) {
  return {
    title: `Canlı test yazısı ${label}`,
    slug: slugOf(label),
    excerpt: 'Canlı veritabanı testinde kullanılan kısa özet metni.',
    content: CONTENT,
    category: 'Test',
    readMinutes: 3,
    authorName: '',
    authorRole: '',
    image: 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=800&q=80',
    featured: false,
    ...overrides,
  };
}

async function rowsFor(label: string) {
  return admin.blogPost.findMany({ where: { slug: slugOf(label) } });
}

async function cleanRows(): Promise<void> {
  await admin.blogPost.deleteMany({ where: { slug: { endsWith: `-${RUN}` } } });
  await admin.auditEvent.deleteMany({
    where: { type: { startsWith: 'blog.post.' }, actorId: `blog-admin-${RUN}`, createdAt: { gte: STARTED } },
  });
}

beforeAll(async () => {
  if (!HAS_DB) return;
  await cleanRows();
});

beforeEach(() => {
  m.auth.mockReset();
  m.auth.mockResolvedValue(PLATFORM_ADMIN);
  m.revalidatePath.mockReset();
});

afterEach(async () => {
  if (!HAS_DB) return;
  await cleanRows();
});

afterAll(async () => {
  if (!HAS_DB) return;
  await admin.$disconnect();
});

describe.skipIf(!HAS_DB)('blog posts (live database, fabrika_app)', () => {
  test('create stores exactly one row, readable from another connection, and audits it', async () => {
    const res = await createBlogPostAction(form('create'));
    expect(res).toMatchObject({ ok: true });

    const rows = await rowsFor('create');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      slug: slugOf('create'),
      title: 'Canlı test yazısı create',
      category: 'Test',
      featured: false,
      authorName: null,
      authorRole: null,
      authorAvatar: null,
      createdById: PLATFORM_ADMIN.user.id,
    });
    expect(rows[0]!.publishedAt).toBeInstanceOf(Date);

    // The public read path sees it.
    const post = await getBlogPostBySlug(slugOf('create'));
    expect(post?.title).toBe('Canlı test yazısı create');
    expect(post?.author).toBeUndefined();
    expect((await getBlogPosts()).some((p) => p.slug === slugOf('create'))).toBe(true);

    const audits = await admin.auditEvent.findMany({
      where: { type: 'blog.post.created', target: slugOf('create'), createdAt: { gte: STARTED } },
    });
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ tenantId: null, actorId: PLATFORM_ADMIN.user.id });

    // Blog list, post page and the landing BlogSection are all refreshed.
    const paths = m.revalidatePath.mock.calls.map((c) => c[0]);
    expect(paths).toEqual(expect.arrayContaining(['/[locale]/blog', '/[locale]/blog/[slug]', '/[locale]']));
  });

  test('a slug that is already taken is refused with slug_taken and stores nothing new', async () => {
    expect(await createBlogPostAction(form('dup'))).toMatchObject({ ok: true });
    const second = await createBlogPostAction(form('dup', { title: 'Başka bir başlık ile ikinci deneme' }));
    expect(second).toEqual({ ok: false, error: 'slug_taken' });

    const rows = await rowsFor('dup');
    expect(rows).toHaveLength(1);
    expect(rows[0]!.title).toBe('Canlı test yazısı dup');
  });

  test('server-side validation refuses a malformed slug, an empty body and a foreign image host', async () => {
    expect(await createBlogPostAction(form('bad', { slug: 'Büyük Harf ve Boşluk' }))).toEqual({
      ok: false,
      error: 'invalid_slug',
    });
    expect(await createBlogPostAction(form('bad', { content: '  ' }))).toEqual({ ok: false, error: 'invalid_content' });
    expect(await createBlogPostAction(form('bad', { title: 'x'.repeat(201) }))).toEqual({
      ok: false,
      error: 'invalid_title',
    });
    expect(await createBlogPostAction(form('bad', { image: 'https://evil.example/x.png' }))).toEqual({
      ok: false,
      error: 'invalid_image',
    });
    expect(await createBlogPostAction(form('bad', { image: 'javascript:alert(1)' }))).toEqual({
      ok: false,
      error: 'invalid_image',
    });
    expect(await rowsFor('bad')).toHaveLength(0);
  });

  // TASK-MVDPHZQCTVJ2R — the body's links and images are checked by the save
  // itself (src/lib/blog-content-policy.ts), not only by the editor: raw
  // markdown posted to the action with a forbidden one stores nothing.
  test('a body link or image outside the content policy is refused on create and on update', async () => {
    const body = (extra: string) => `${CONTENT}\n\n${extra}`;
    const refused: [string, string][] = [
      ['[tıkla](javascript:alert(1))', 'invalid_content_link'],
      ['[tıkla](JaVaScRiPt:alert(1))', 'invalid_content_link'],
      ['[tıkla](//evil.example/x)', 'invalid_content_link'],
      ['[tıkla](data:text/html,x)', 'invalid_content_link'],
      ['![grafik](https://evil.example/blog/x.png)', 'invalid_content_image'],
      ['![](https://evil.example/blog/x.png)', 'invalid_content_image'],
    ];
    for (const [extra, error] of refused) {
      expect(await createBlogPostAction(form('policy', { content: body(extra) })), extra).toEqual({ ok: false, error });
    }
    expect(await rowsFor('policy')).toHaveLength(0);

    const allowed = body('Ayrıntı [rehberde](https://ec.europa.eu/info) ve [fiyatlarda](/tr/fiyatlar).');
    expect(await createBlogPostAction(form('policy', { content: allowed }))).toMatchObject({ ok: true });
    expect(
      await updateBlogPostAction(slugOf('policy'), { content: body('[tıkla](javascript:alert(1))') })
    ).toEqual({ ok: false, error: 'invalid_content_link' });
    const rows = await rowsFor('policy');
    expect(rows).toHaveLength(1);
    expect(rows[0]?.content).toBe(allowed);
  });

  test.each([
    ['anonymous', null],
    ['the admin of another tenant', OTHER_TENANT_ADMIN],
  ])('%s is refused by every action and the table does not change', async (_who, session) => {
    expect(await createBlogPostAction(form('guarded'))).toMatchObject({ ok: true });
    m.auth.mockResolvedValue(session);

    await expect(createBlogPostAction(form('intruder'))).rejects.toMatchObject({ code: 'PLATFORM_ADMIN_REQUIRED' });
    await expect(updateBlogPostAction(slugOf('guarded'), { title: 'Ele geçirildi başlığı' })).rejects.toMatchObject({
      code: 'PLATFORM_ADMIN_REQUIRED',
    });
    await expect(toggleFeaturedBlogPostAction(slugOf('guarded'))).rejects.toMatchObject({
      code: 'PLATFORM_ADMIN_REQUIRED',
    });
    await expect(deleteBlogPostAction(slugOf('guarded'))).rejects.toMatchObject({ code: 'PLATFORM_ADMIN_REQUIRED' });

    expect(await rowsFor('intruder')).toHaveLength(0);
    const rows = await rowsFor('guarded');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ title: 'Canlı test yazısı guarded', featured: false });
  });

  test('update persists, keeps the slug, and handles the byline exactly as given', async () => {
    expect(await createBlogPostAction(form('upd'))).toMatchObject({ ok: true });

    // No author in the patch: an authorless post stays authorless.
    expect(await updateBlogPostAction(slugOf('upd'), { title: 'Güncellenmiş başlık' })).toMatchObject({ ok: true });
    let row = (await rowsFor('upd'))[0]!;
    expect(row).toMatchObject({ title: 'Güncellenmiş başlık', authorName: null, authorRole: null });

    // An author in the patch is recorded as exactly that author.
    expect(
      await updateBlogPostAction(slugOf('upd'), { authorName: 'Zeynep Aydın', authorRole: 'Editör' })
    ).toMatchObject({ ok: true });
    row = (await rowsFor('upd'))[0]!;
    expect(row).toMatchObject({ authorName: 'Zeynep Aydın', authorRole: 'Editör', authorAvatar: null });
    expect((await getBlogPostBySlug(slugOf('upd')))?.author).toEqual({ name: 'Zeynep Aydın', role: 'Editör' });

    // A byline the editor cleared is cleared, not refilled.
    expect(await updateBlogPostAction(slugOf('upd'), { authorName: '', authorRole: '' })).toMatchObject({ ok: true });
    row = (await rowsFor('upd'))[0]!;
    expect(row).toMatchObject({ authorName: null, authorRole: null });

    // Invalid patch is refused and changes nothing.
    expect(await updateBlogPostAction(slugOf('upd'), { title: '' })).toEqual({ ok: false, error: 'invalid_title' });
    expect((await rowsFor('upd'))[0]!.title).toBe('Güncellenmiş başlık');

    expect(await updateBlogPostAction(slugOf('missing'), { title: 'Yok böyle bir yazı' })).toEqual({
      ok: false,
      error: 'not_found',
    });

    const audits = await admin.auditEvent.count({
      where: { type: 'blog.post.updated', target: slugOf('upd'), createdAt: { gte: STARTED } },
    });
    expect(audits).toBe(3);
  });

  test('toggle flips featured in the database and the featured read follows it', async () => {
    expect(await createBlogPostAction(form('feat', { featured: false }))).toMatchObject({ ok: true });

    expect(await toggleFeaturedBlogPostAction(slugOf('feat'))).toMatchObject({ ok: true });
    expect((await rowsFor('feat'))[0]!.featured).toBe(true);
    expect((await getFeaturedBlogPosts(1000)).some((p) => p.slug === slugOf('feat'))).toBe(true);

    expect(await toggleFeaturedBlogPostAction(slugOf('feat'))).toMatchObject({ ok: true });
    expect((await rowsFor('feat'))[0]!.featured).toBe(false);
    expect((await getFeaturedBlogPosts(1000)).some((p) => p.slug === slugOf('feat'))).toBe(false);

    expect(await toggleFeaturedBlogPostAction(slugOf('missing'))).toEqual({ ok: false, error: 'not_found' });
  });

  test('delete removes the row for every reader; a second delete reports not_found', async () => {
    expect(await createBlogPostAction(form('del'))).toMatchObject({ ok: true });
    expect(await deleteBlogPostAction(slugOf('del'))).toEqual({ ok: true });

    expect(await rowsFor('del')).toHaveLength(0);
    expect(await getBlogPostBySlug(slugOf('del'))).toBeNull();
    expect(await deleteBlogPostAction(slugOf('del'))).toEqual({ ok: false, error: 'not_found' });

    const audits = await admin.auditEvent.count({
      where: { type: 'blog.post.deleted', target: slugOf('del'), createdAt: { gte: STARTED } },
    });
    expect(audits).toBe(1);
  });

  test('a slug derived from a Turkish title is transliterated, not mangled', async () => {
    const res = await createBlogPostAction(
      form('derived', { slug: '', title: `Çağrı Şartları ve Öğrenciler İçin Güncel Hibe ${RUN}` })
    );
    expect(res).toMatchObject({ ok: true });
    const expected = `cagri-sartlari-ve-ogrenciler-icin-guncel-hibe-${RUN}`;
    expect(await admin.blogPost.count({ where: { slug: expected } })).toBe(1);
    await admin.blogPost.deleteMany({ where: { slug: expected } });
    await admin.auditEvent.deleteMany({ where: { type: 'blog.post.created', target: expected } });
  });

  test('blog-read-minutes.sql backfills the minutes from the old text, else from the content (TASK-MVDSY96TB1EPM)', async () => {
    const words = (n: number) => Array.from({ length: n }, (_, i) => `kelime${i}`).join(' ');
    // Links, images, tags and list numbers are not words — the SQL must count like estimateReadMinutes.
    const marked = `# Başlık\n\n1. [bağlantı metni](https://example.test/a) <b>kalın</b>\n2. ![görsel](https://x.test/i.png)\n\n${words(1100)}`;
    const cases: Array<[label: string, readTime: string, content: string, expected: number]> = [
      ['tr', '5 dk', CONTENT, 5],
      ['en', '5 min read', CONTENT, 5],
      ['old', '3 dk okuma', CONTENT, 3],
      ['minutes', '12 minutes', CONTENT, 12],
      ['bare', '7', CONTENT, 7],
      ['nonum', 'kısa', words(650), 3],
      ['zero', '0 dk', words(10), 1],
      ['over', '999 dk', marked, estimateReadMinutes(marked)],
      ['huge', '99999999999 dk', words(450), 2],
      ['empty', 'dk', '', 1],
    ];
    expect(estimateReadMinutes(marked)).toBe(6);
    for (const [label, readTime, content] of cases) {
      await admin.$executeRaw`
        INSERT INTO "BlogPost" ("id", "slug", "title", "excerpt", "content", "category", "readTime", "readMinutes", "publishedAt", "image", "updatedAt")
        VALUES (${`bf-${label}-${RUN}`}, ${slugOf(`bf-${label}`)}, 't', 'e', ${content}, 'c', ${readTime}, NULL, now(), 'https://images.unsplash.com/x', now())`;
    }
    // A row that already has minutes (written by the new code) is not touched.
    await admin.$executeRaw`
      INSERT INTO "BlogPost" ("id", "slug", "title", "excerpt", "content", "category", "readTime", "readMinutes", "publishedAt", "image", "updatedAt")
      VALUES (${`bf-kept-${RUN}`}, ${slugOf('bf-kept')}, 't', 'e', ${CONTENT}, 'c', '40 dk', 9, now(), 'https://images.unsplash.com/x', now())`;

    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const { default: pg } = await import('pg');
    const sql = readFileSync(resolve(process.cwd(), 'prisma/migrations/blog-read-minutes.sql'), 'utf8');
    const client = new pg.Client({ connectionString: OWNER_URL ?? 'postgresql://fabrika:fabrika@localhost:5432/fabrika' });
    await client.connect();
    try {
      for (const statement of sqlStatements(sql)) await client.query(statement);
      for (const statement of sqlStatements(sql)) await client.query(statement); // idempotent
    } finally {
      await client.end();
    }

    const minutesOf = async (label: string) =>
      (await admin.blogPost.findUnique({ where: { slug: slugOf(label) }, select: { readMinutes: true } }))?.readMinutes;
    for (const [label, , , expected] of cases) expect([label, await minutesOf(`bf-${label}`)]).toEqual([label, expected]);
    expect(await minutesOf('bf-kept')).toBe(9);

    // The CHECK holds the range for every writer, not only the admin form.
    await expect(
      admin.$executeRaw`UPDATE "BlogPost" SET "readMinutes" = 121 WHERE "slug" = ${slugOf('bf-kept')}`
    ).rejects.toThrow(/BlogPost_readMinutes_range/);
  });

  test('a saved post stores minutes only and reads back as a number (TASK-MVDSY96TB1EPM)', async () => {
    expect(await createBlogPostAction(form('mins', { readMinutes: 8 }))).toMatchObject({ ok: true });
    const [row] = await rowsFor('mins');
    expect(row).toMatchObject({ readMinutes: 8, readTime: null });
    expect((await getBlogPostBySlug(slugOf('mins')))?.readMinutes).toBe(8);
    expect(await createBlogPostAction(form('mins121', { readMinutes: 121 }))).toEqual({ ok: false, error: 'invalid_read_time' });
    expect(await rowsFor('mins121')).toHaveLength(0);
  });
});
