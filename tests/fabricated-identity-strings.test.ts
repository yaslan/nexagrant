import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, test, expect, vi, beforeEach } from 'vitest';

import { mergeBlogPatch, type BlogPostInput } from '@/lib/blog-shared';
import { BLOG_SEED_POSTS } from '@/lib/blog-seed';
import { displayUserName } from '@/lib/user-display';
import { DEFAULT_PART_B_SECTIONS } from '@/modules/m11/types';
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
    // Matched as a pattern, not as an exact line: the point is that the name is
    // computed from `email` and from nothing else. The expression around it has
    // changed once already (a `?? email` fallback for the local part), and an
    // exact-string assertion turned that into a failure about formatting rather
    // than about invented identities.
    expect(source).toMatch(/const computedName\s*=\s*\(?\s*email\b/);
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
  // AKTAR-MURBCJ0A-1: posts live in the BlogPost table. The launch posts are
  // BLOG_SEED_POSTS (src/lib/blog-seed.ts), inserted as-is by `pnpm db:seed-blog`;
  // the byline rule on writes is mergeBlogPatch + validateBlogInput, measured
  // end to end against the database in tests/blog-posts.live.test.ts.
  test('no seeded post ships with an author', () => {
    expect(BLOG_SEED_POSTS.length).toBeGreaterThan(0);
    for (const post of BLOG_SEED_POSTS) {
      const fields = post as unknown as Record<string, unknown>;
      for (const key of ['author', 'authorName', 'authorRole', 'authorAvatar']) {
        expect(fields[key], `"${post.slug}" still carries a byline (${key})`).toBeUndefined();
      }
    }
  });

  test('none of the invented bylines survives in the source', () => {
    for (const file of ['src/lib/blog.ts', 'src/lib/blog-shared.ts', 'src/lib/blog-seed.ts']) {
      const source = readCode(file);
      for (const invented of [MEHMET, 'Av. Ayşe Kaya', 'Dr. Sofia Rossi', 'Can Aksoy']) {
        expect(source, `${file} still names "${invented}"`).not.toContain(invented);
      }
    }
  });

  const STORED: BlogPostInput = {
    title: 'Eski başlık',
    excerpt: 'Özet',
    content: 'İçerik',
    category: 'Test',
    readMinutes: 1,
    authorName: '',
    authorRole: '',
    authorAvatar: '',
    image: 'https://images.unsplash.com/x',
    featured: false,
  };

  test('an update that carries no author leaves an authorless post authorless', () => {
    const updated = mergeBlogPatch(STORED, { title: 'Yeni başlık' });
    expect(updated.title).toBe('Yeni başlık');
    expect(updated.authorName).toBe('');
    expect(updated.authorRole).toBe('');
  });

  test('an update that carries an author records exactly that author', () => {
    const updated = mergeBlogPatch(STORED, { authorName: 'Zeynep Aydın', authorRole: 'Editör' });
    expect(updated).toMatchObject({ authorName: 'Zeynep Aydın', authorRole: 'Editör', authorAvatar: '' });
  });

  test('an update that clears the name clears the whole byline, never keeps the old one', () => {
    const authored = { ...STORED, authorName: 'Zeynep Aydın', authorRole: 'Editör', authorAvatar: 'https://images.unsplash.com/a' };
    expect(mergeBlogPatch(authored, { authorName: '' })).toMatchObject({ authorName: '', authorRole: '', authorAvatar: '' });
    // …and a patch without a name keeps the recorded byline as it is.
    expect(mergeBlogPatch(authored, { title: 'Başka' })).toMatchObject({ authorName: 'Zeynep Aydın', authorRole: 'Editör' });
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

  // TASK-MVDPA19QP3M9A: the byline is seeded from User.name, so a role written
  // into the admin's name ("Yasin Aslan (Süperadmin)") was published with every
  // post. The role is `isPlatformAdmin`, not part of the name.
  test.each(['prisma/seed-tenant-workspace.ts', 'scripts/create-superadmin.ts'])(
    '%s names the platform admin without a role label',
    (file) => {
      const source = readCode(file);
      expect(source).not.toContain('(Süperadmin)');
      expect(source).toContain("'Yasin Aslan'");
      expect(source).toContain('isPlatformAdmin: true');
    }
  );

  test('a new post starts with no stock cover and no fixed read time', () => {
    const client = readCode('src/app/[locale]/admin/blog/client.tsx');
    expect(client).not.toMatch(/images\.unsplash\.com/);
    expect(client).not.toContain('5 min read');
  });
});

describe('login page — the demo buttons name a role, not a person', () => {
  test.each(['src/app/[locale]/(public)/login/AuthCard.tsx'])(
    '%s headlines the seat and the address',
    (file) => {
      const source = readCode(file);
      for (const invented of [MEHMET, AYSE, 'Yasin Aslan (Süperadmin)']) {
        expect(source, `${file} still names "${invented}"`).not.toContain(invented);
      }
      expect(source).toContain("tDemo('roleSme')");
      expect(source).toContain("tDemo('roleTto')");
    }
  );

  // `LoginForm.tsx` was a second, unreachable copy of the login card: nothing imported it, so
  // its demo buttons never reached a user and the two copies could drift apart unnoticed. It
  // was deleted (TASK-MTS6LZOD715WM); this keeps a copy from coming back.
  test('the unreachable duplicate login form stays deleted', () => {
    expect(existsSync(resolve(REPO, 'src/app/[locale]/(public)/login/LoginForm.tsx'))).toBe(false);
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

/**
 * A Part B template can know the official Horizon Europe section frame. It cannot know who
 * writes a section or what the project is — so it now states neither.
 */
describe('Part B template — structure only, no author and no prose', () => {
  const SELIN = ['Doç.', 'Dr.', 'Selin', 'Kaya'].join(' ');
  const KLAUS = ['Prof.', 'Klaus', 'Müller'].join(' ');
  const SOFIA = ['Dr.', 'Sofia', 'Rossi'].join(' ');
  const MARCUS = ['Marcus', 'Schmidt'].join(' ');
  const INVENTED_ORGS = [
    'Demo SME Consultancy',
    'Fraunhofer',
    'METU TTO',
    'Politecnico di Milano',
    'Siemens AG',
  ];

  test('every default section ships unowned and unwritten', () => {
    expect(DEFAULT_PART_B_SECTIONS).toHaveLength(8);
    for (const section of DEFAULT_PART_B_SECTIONS) {
      expect(section.leadAuthor, `${section.key} carries a lead author`).toBeUndefined();
      expect(section.leadAuthorOrg, `${section.key} carries an organisation`).toBeUndefined();
      expect(section.lastModifiedBy, `${section.key} carries an editor`).toBeUndefined();
      expect(section.content, `${section.key} ships prose`).toBe('');
      // The official frame — the part a template legitimately knows — survives.
      expect(section.title.length).toBeGreaterThan(0);
      expect(section.targetPages).toBeGreaterThan(0);
      expect(section.maxWords).toBeGreaterThan(0);
    }
  });

  test('the module source names none of the invented consortium members', () => {
    const source = readCode('src/modules/m11/types.ts');
    for (const invented of [MEHMET, SELIN, KLAUS, SOFIA, MARCUS, ...INVENTED_ORGS]) {
      expect(source, `m11/types.ts still names "${invented}"`).not.toContain(invented);
    }
  });

  test('the editor names none of them either, and states an unowned section plainly', () => {
    const source = readCode('src/modules/m11/ui/PartBCollaborativeEditor.tsx');
    for (const invented of [MEHMET, SELIN, KLAUS, SOFIA, MARCUS, ...INVENTED_ORGS]) {
      expect(source, `PartBCollaborativeEditor still names "${invented}"`).not.toContain(invented);
    }
    expect(source).toContain("tEditor('leadUnassigned')");
  });

  test('the exporter prints the recorded organisation or none — never a stand-in', () => {
    const source = readCode('src/lib/document-exporter.ts');
    expect(source).not.toContain("|| 'Konsorsiyum'");
    expect(source).toContain('leadAuthorText');
    for (const locale of ['tr', 'en']) {
      const messages = JSON.parse(read(`messages/${locale}.json`)) as Record<
        string,
        Record<string, string>
      >;
      expect(
        messages.DocumentExport?.leadAuthorUnassigned,
        `messages/${locale}.json DocumentExport.leadAuthorUnassigned`
      ).toBeTruthy();
      for (const key of ['leadShort', 'leadAuthorLabel', 'leadUnassigned']) {
        expect(
          messages.PartBEditor?.[key],
          `messages/${locale}.json PartBEditor.${key}`
        ).toBeTruthy();
      }
    }
  });
});
