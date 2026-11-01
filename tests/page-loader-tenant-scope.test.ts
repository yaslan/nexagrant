import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import type { PrismaClient } from '@prisma/client';

import { MissingTenantScopeError } from '../src/lib/db';
import { loadEvidenceItems } from '../src/app/[locale]/(app)/[workspace]/evidence/data';
import { loadConceptNotesIndex } from '../src/app/[locale]/(app)/[workspace]/concept-notes/data';
import { loadConceptNoteDetail } from '../src/app/[locale]/(app)/[workspace]/concept-notes/[id]/data';

/**
 * TASK-MTUGJTD5HZDW0 — the tenant filter that disappears when there is no tenant.
 *
 * Three screens built their `where` clause with a ternary on a value typed
 * `string | null | undefined`:
 *
 *     evidence/page.tsx          where: tenantId ? { tenantId } : {}
 *     concept-notes/page.tsx     where: tenantId ? { tenantId } : {}
 *     concept-notes/[id]/page    where: tenantId ? { id, tenantId } : { id }
 *
 * The false branch is not a narrower query, it is *no filter*: `{}` selects
 * every tenant's rows, and `{ id }` selects one known row out of whichever
 * tenant owns it. Prisma reaches the same place from `tenantId: undefined`,
 * which it treats as a field that was not written rather than as "matches
 * nothing" — the bug TASK-MTRKV9JGY7OQY documented on the M4 relationship
 * screen and fixed there.
 *
 * These tests need no database, because the claim under test is not "the query
 * returns the right rows" but "no query is ever issued without a tenant, and
 * every query that is issued carries the tenant". Both are observable from the
 * client the loader is handed. The DB-backed half of the argument — that an
 * undefined tenant really does return another tenant's row from Postgres — is
 * already recorded in tests/relationship-tenant-scope.test.ts.
 */

/** A client that fails the test if anything tries to query through it. */
function forbiddenClient(): PrismaClient & { touched: number } {
  const stub = {
    touched: 0,
    $transaction() {
      stub.touched += 1;
      throw new Error('the database must not be touched without a tenant');
    },
  };
  return stub as unknown as PrismaClient & { touched: number };
}

interface RecordedCall {
  model: string;
  method: string;
  where: unknown;
}

/**
 * A client that records what each loader asks Postgres for, so the assertions
 * are about the query actually issued rather than about the returned rows.
 */
function recordingClient(rows: Record<string, unknown[]> = {}) {
  const calls: RecordedCall[] = [];
  const tenantContext: string[] = [];

  const model = (name: string) => ({
    findMany: async (args: { where?: unknown }) => {
      calls.push({ model: name, method: 'findMany', where: args?.where });
      return rows[name] ?? [];
    },
    findFirst: async (args: { where?: unknown }) => {
      calls.push({ model: name, method: 'findFirst', where: args?.where });
      return (rows[name] ?? [])[0] ?? null;
    },
    findUnique: async (args: { where?: unknown }) => {
      calls.push({ model: name, method: 'findUnique', where: args?.where });
      return (rows[name] ?? [])[0] ?? null;
    },
  });

  const tx = {
    // `withTenantOn` sets app.tenant_id through this before anything else runs.
    $executeRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      tenantContext.push(String(values[0]));
      return 1;
    },
    evidence: model('evidence'),
    conceptNote: model('conceptNote'),
    conceptTemplate: model('conceptTemplate'),
    opportunity: model('opportunity'),
  };

  const client = {
    $transaction: async <T>(cb: (t: typeof tx) => Promise<T>) => cb(tx),
  };

  return { client: client as unknown as PrismaClient, calls, tenantContext };
}

const TENANT = 'tenant-a';

const LOADERS = [
  {
    name: 'loadEvidenceItems (M3 Evidence Pack)',
    run: (tenantId: unknown, client: PrismaClient) =>
      loadEvidenceItems(tenantId as string, 'TENANT_OWNER', client),
  },
  {
    name: 'loadConceptNotesIndex (M2 list)',
    run: (tenantId: unknown, client: PrismaClient) =>
      loadConceptNotesIndex(tenantId as string, client),
  },
  {
    name: 'loadConceptNoteDetail (M2 detail)',
    run: (tenantId: unknown, client: PrismaClient) =>
      loadConceptNoteDetail(tenantId as string, 'a-known-note-id', client),
  },
] as const;

const NO_TENANT = [
  ['undefined', undefined],
  ['null', null],
  ['empty string', ''],
  ['whitespace', '   '],
] as const;

describe('page loaders refuse to query without a tenant', () => {
  for (const loader of LOADERS) {
    for (const [label, value] of NO_TENANT) {
      test(`${loader.name}: a ${label} tenant never reaches the database`, async () => {
        const client = forbiddenClient();

        await expect(loader.run(value, client)).rejects.toBeInstanceOf(
          MissingTenantScopeError,
        );

        expect(client.touched, 'queries issued without a tenant').toBe(0);
      });
    }
  }
});

describe('every query a page loader issues carries the tenant', () => {
  test('loadEvidenceItems filters Evidence by tenantId', async () => {
    const { client, calls, tenantContext } = recordingClient();

    await loadEvidenceItems(TENANT, 'TENANT_OWNER', client);

    expect(tenantContext).toEqual([TENANT]);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ model: 'evidence', method: 'findMany' });
    expect(calls[0]!.where).toEqual({ tenantId: TENANT });
  });

  // Y-1 (TASK-MUNTTZ94LJWBC): the role narrows the read further.
  test('loadEvidenceItems reads only the open levels below edit_proposal', async () => {
    const { client, calls } = recordingClient();

    await loadEvidenceItems(TENANT, 'MEMBER', client);

    expect(calls).toHaveLength(1);
    expect(calls[0]!.where).toEqual({
      tenantId: TENANT,
      confidentiality: { in: ['PUBLIC', 'CONSORTIUM', 'INTERNAL'] },
    });
  });

  for (const role of ['GUEST_PARTNER', 'NOT_A_ROLE', null]) {
    test(`loadEvidenceItems issues no query for role ${role}`, async () => {
      const client = forbiddenClient();

      await expect(loadEvidenceItems(TENANT, role, client)).resolves.toEqual([]);
      expect(client.touched).toBe(0);
    });
  }

  test('loadConceptNotesIndex filters ConceptNote by tenantId', async () => {
    const { client, calls, tenantContext } = recordingClient();

    await loadConceptNotesIndex(TENANT, client);

    expect(tenantContext).toEqual([TENANT]);
    const notes = calls.find((c) => c.model === 'conceptNote');
    expect(notes?.where).toEqual({ tenantId: TENANT });
  });

  test('loadConceptNotesIndex still offers platform templates, and only this tenant’s own', async () => {
    // The nullable-tenant branch is the shared-template path, not a leak:
    // `ConceptTemplate.tenantId` NULL means "platform template", and
    // prisma/rls.sql gives the table `tenant_or_shared` for exactly that. What
    // must not happen is the *tenant* half going missing.
    const { client, calls } = recordingClient();

    await loadConceptNotesIndex(TENANT, client);

    const templates = calls.find((c) => c.model === 'conceptTemplate');
    expect(templates?.where).toEqual({ OR: [{ tenantId: null }, { tenantId: TENANT }] });
  });

  test('loadConceptNoteDetail looks a note up by id *and* tenantId', async () => {
    const { client, calls, tenantContext } = recordingClient();

    await loadConceptNoteDetail(TENANT, 'note-1', client);

    expect(tenantContext).toEqual([TENANT]);
    const note = calls.find((c) => c.model === 'conceptNote');
    expect(note).toMatchObject({ method: 'findFirst' });
    expect(note!.where).toEqual({ id: 'note-1', tenantId: TENANT });
  });

  test('loadConceptNoteDetail answers null for a note this tenant does not own', async () => {
    // "no such id" and "somebody else's id" have to be the same answer, or the
    // screen becomes an id oracle. The recording client returns no row, which
    // is what Postgres returns once the tenant is on the clause.
    const { client, calls } = recordingClient({ conceptNote: [] });

    await expect(loadConceptNoteDetail(TENANT, 'someone-elses-note', client)).resolves.toBeNull();

    // And it stops there: no template or opportunity lookup off an unowned note.
    expect(calls.map((c) => c.model)).toEqual(['conceptNote']);
  });
});

/**
 * A source guard, weak on its own, that pins the specific shape rather than the
 * behaviour: this bug has now been introduced twice (TASK-MTRKV9JGY7OQY, then
 * these three pages), so the ternary itself is worth naming.
 */
describe('the leaking ternary is gone from the three pages', () => {
  const REPO = resolve(__dirname, '..');
  const PAGES = [
    'src/app/[locale]/(app)/[workspace]/evidence/page.tsx',
    'src/app/[locale]/(app)/[workspace]/concept-notes/page.tsx',
    'src/app/[locale]/(app)/[workspace]/concept-notes/[id]/page.tsx',
  ];

  /** Strips comments, so the fix's own explanation is not read as code. */
  const codeOf = (source: string) =>
    source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

  for (const page of PAGES) {
    test(`${page} builds no where clause from a maybe-tenant`, () => {
      const code = codeOf(readFileSync(resolve(REPO, page), 'utf8'));

      // `tenantId ? … : …` in any spacing.
      expect(code).not.toMatch(/tenantId\s*\?\s*\{/);
      // The value that produced the maybe-tenant in the first place.
      expect(code).not.toMatch(/session\??\.\s*tenantId/);
      // And the page no longer queries Prisma directly at all.
      expect(code).not.toMatch(/prisma\.\w+\.find/);
    });
  }
});
