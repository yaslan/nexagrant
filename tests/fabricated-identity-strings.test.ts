import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, test, expect, vi, beforeEach } from 'vitest';

import { getBlogPosts, updateBlogPost, type BlogPost } from '@/lib/blog';
import { displayUserName } from '@/lib/user-display';
import { setScope, resetScope } from './helpers/tenant-scope-mock';

/**
 * `@/lib/workspaces` reaches the database through `withTenant` and the session
 * through `@/lib/tenant`; the latter pulls next-auth, which does not resolve
 * under the vitest node environment. Both are replaced with the shared stubs,
 * so the query this module actually issues is asserted rather than grepped.
 */
const findMany = vi.fn(async () => [
  { slug: 'ana-calisma-alani', name: 'Ana Çalışma Alanı' },
]);

vi.mock('@/lib/tenant', async () => {
  const m = await import('./helpers/tenant-scope-mock');
  return m.tenantModuleStub();
});

vi.mock('@/lib/db', async () => {
  const m = await import('./helpers/tenant-scope-mock');
  return m.dbModuleStub({ workspace: { findMany } });
});

const { workspaceIdFilter, listSessionWorkspaces } = await import('@/lib/workspaces');

/**
 * TASK-MTRNQHC3IV2BE — invented identity strings.
 *
 * Sibling of tests/fabricated-fallbacks.test.ts, for the identity half of the
 * same defect class: a name, an organisation or a byline written into code and
 * shown as if a record produced it. Five surfaces carried one — the session
 * name, the workspace switcher, the blog byline (public), the admin editor's
 * default author, and the login page's demo buttons.
 *
 * The same two kinds of test as the sibling file: source guards for units that
 * need a database or a browser, and real behavioural tests where the unit runs.
 */

const REPO = resolve(__dirname, '..');
const read = (rel: string) => readFileSync(resolve(REPO, rel), 'utf8');

/** Strips comments so the guards read code, not the prose that quotes it. */
function codeOf(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}
const readCode = (rel: string) => codeOf(read(rel));

/** The invented people, assembled so this file does not itself contain them. */
const MEHMET = ['Dr.', 'Mehmet', 'Yılmaz'].join(' ');
const AYSE = ['Prof.', 'Dr.', 'Ayşe', 'Kaya'].join(' ');
const CAN = ['Dr.', 'Can', 'Demir'].join(' ');

describe('auth.ts — the demo profile seeds an organisation, not a person', () => {
  const source = readCode('src/lib/auth.ts');

  test('no demo profile carries an invented display name', () => {
    for (const invented of [MEHMET, AYSE, CAN, 'Yasin Aslan (Süperadmin)']) {
      expect(source, `auth.ts still names "${invented}"`).not.toContain(invented);
    }
  });

  test('the jwt callback no longer overwrites the session name from the profile map', () => {
    // `token.name = demo.name` ran on every token refresh, so a User row's own
    // name lost to the hardcoded one on every page load.
    expect(source).not.toMatch(/token\.name\s*=\s*demo\.name/);
  });

  test('the display name is derived from the address the user signed in with', () => {
    expect(source).toContain('const computedName = email');
    expect(source).not.toMatch(/demoProfile\?\.name/);
  });

  test('the superadmin promotion sets the flag only, not the name', () => {
    expect(source).not.toMatch(/isPlatformAdmin:\s*true,\s*name:/);
  });
});

describe('user menu — the workspace switcher lists the session’s own workspaces', () => {
  const source = readCode('src/components/UserMenu.tsx');

  test('the two invented organisations are gone', () => {
    for (const invented of ['Demo SME Consultancy', 'Horizon Research Lab', "'horizon-lab'"]) {
      expect(source, `UserMenu still offers "${invented}"`).not.toContain(invented);
    }
  });

  test('it renders the workspaces prop, with a translated empty state', () => {
    expect(source).toContain('workspaces.map');
    expect(source).toContain('workspaces.length === 0');
    expect(source).toContain("tIdentity('noWorkspace')");
  });

  test('no workspace is ticked as active outside a workspace route', () => {
    // The fallback used to be `: 'demo-sme'`, which ticked a workspace the
    // session may not belong to on /admin and /pricing.
    expect(source).not.toContain("'demo-sme'");
  });

  test('both app shells feed it the resolved list', () => {
    for (const shell of ['src/app/[locale]/(app)/layout.tsx', 'src/app/[locale]/admin/layout.tsx']) {
      const layout = readCode(shell);
      expect(layout, `${shell} does not resolve workspaces`).toContain('listSessionWorkspaces');
      expect(layout).toContain('workspaces={workspaces}');
    }
  });
});

describe('workspaceIdFilter — membership scope, per prisma/schema.prisma', () => {
  test('an empty workspaceIds means every workspace of the tenant', () => {
    expect(workspaceIdFilter([])).toEqual({});
  });

  test('a non-empty workspaceIds narrows to exactly those ids', () => {
    expect(workspaceIdFilter(['ws-1', 'ws-2'])).toEqual({ id: { in: ['ws-1', 'ws-2'] } });
  });
});

describe('listSessionWorkspaces — the switcher answers from Workspace rows', () => {
  beforeEach(() => {
    resetScope();
    findMany.mockClear();
  });

  test('a session with a tenant gets that tenant’s workspaces, tenant-scoped', async () => {
    setScope({
      tenantId: 'tenant-1',
      userId: 'user-1',
      role: 'TENANT_OWNER',
      workspaceIds: [],
      isPlatformAdmin: false,
    });

    const result = await listSessionWorkspaces({ tenantId: 'tenant-1' });

    expect(result).toEqual([{ slug: 'ana-calisma-alani', name: 'Ana Çalışma Alanı' }]);
    expect(findMany).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-1', deletedAt: null },
      select: { slug: true, name: true },
      orderBy: { name: 'asc' },
    });
  });

  test('a membership scoped to two workspaces asks for exactly those', async () => {
    setScope({
      tenantId: 'tenant-1',
      userId: 'user-1',
      role: 'MEMBER',
      workspaceIds: ['ws-a', 'ws-b'],
      isPlatformAdmin: false,
    });

    await listSessionWorkspaces({ tenantId: 'tenant-1' });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: { in: ['ws-a', 'ws-b'] } }),
      })
    );
  });

  test('a session with no tenant gets nothing, and the database is not touched', async () => {
    const result = await listSessionWorkspaces(null);
    expect(result).toEqual([]);
    expect(findMany).not.toHaveBeenCalled();
  });

  test('a failed lookup yields an empty switcher, not an invented workspace', async () => {
    setScope({
      tenantId: 'tenant-1',
      userId: 'user-1',
      role: 'TENANT_OWNER',
      workspaceIds: [],
      isPlatformAdmin: false,
    });
    findMany.mockRejectedValueOnce(new Error('connection refused'));

    await expect(listSessionWorkspaces({ tenantId: 'tenant-1' })).resolves.toEqual([]);
  });
});

describe('blog — a byline names a real author or there is none', () => {
  test('no seeded post ships with an author', () => {
    const posts = getBlogPosts();
    expect(posts.length).toBeGreaterThan(0);
    for (const post of posts) {
      expect(post.author, `"${post.slug}" still carries a byline`).toBeUndefined();
    }
  });

  test('none of the invented bylines survives in the source', () => {
    const source = readCode('src/lib/blog.ts');
    for (const invented of [MEHMET, 'Av. Ayşe Kaya', 'Dr. Sofia Rossi', 'Can Aksoy']) {
      expect(source, `blog.ts still names "${invented}"`).not.toContain(invented);
    }
  });

  test('an update that carries no author leaves an authorless post authorless', () => {
    const slug = getBlogPosts()[0]!.slug;
    const updated = updateBlogPost(slug, { title: 'Yeni başlık' }) as BlogPost;
    expect(updated.title).toBe('Yeni başlık');
    expect(updated.author).toBeUndefined();
  });

  test('an update that carries an author records exactly that author', () => {
    const slug = getBlogPosts()[1]!.slug;
    const updated = updateBlogPost(slug, {
      author: { name: 'Zeynep Aydın', role: 'Editör' },
    }) as BlogPost;
    expect(updated.author).toEqual({ name: 'Zeynep Aydın', role: 'Editör' });
  });

  test('the publish action invents no default author, role or portrait', () => {
    const source = readCode('src/app/[locale]/admin/blog/actions.ts');
    expect(source).not.toContain('FonBridge Editörü');
    expect(source).not.toContain("|| 'AB Uzmanı'");
    expect(source).not.toMatch(/avatar:\s*data\.authorAvatar\s*\|\|\s*'https/);
  });

  test('the admin editor seeds the byline from the signed-in admin', () => {
    const client = readCode('src/app/[locale]/admin/blog/client.tsx');
    expect(client).not.toContain(MEHMET);
    expect(client).not.toContain('AB Proje Başdanışmanı');
    expect(client).toContain('authorName: sessionUserName');

    const page = readCode('src/app/[locale]/admin/blog/page.tsx');
    expect(page).toContain('displayUserName');
    // Same rule the app frame uses: real name -> e-mail local part -> label.
    expect(displayUserName(null, 'editor@fabrika.app', 'İsimsiz kullanıcı')).toBe('editor');
  });
});

describe('login page — the demo buttons name a role, not a person', () => {
  test.each([
    'src/app/[locale]/login/AuthCard.tsx',
    'src/app/[locale]/login/LoginForm.tsx',
  ])('%s headlines the seat and the address', (file) => {
    const source = readCode(file);
    for (const invented of [MEHMET, AYSE, 'Yasin Aslan (Süperadmin)']) {
      expect(source, `${file} still names "${invented}"`).not.toContain(invented);
    }
    expect(source).toContain("tDemo('roleSme')");
    expect(source).toContain("tDemo('roleTto')");
  });

  test('the role labels exist in both locales', () => {
    const keys = ['roleSme', 'roleTto', 'rolePlatformAdmin'];
    for (const locale of ['tr', 'en']) {
      const messages = JSON.parse(read(`messages/${locale}.json`)) as Record<
        string,
        Record<string, string>
      >;
      for (const key of keys) {
        expect(messages.DemoSignIn?.[key], `messages/${locale}.json DemoSignIn.${key}`).toBeTruthy();
      }
      expect(messages.UserIdentity?.noWorkspace, `messages/${locale}.json noWorkspace`).toBeTruthy();
    }
  });
});
