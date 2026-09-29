import React from 'react';
import { beforeEach, describe, expect, test, vi } from 'vitest';

/**
 * Secret columns never leave the server (TASK-MUMT3KVHJTYX0, İNCELEME-23 Ö-2).
 *
 * Every prop a server component hands to a client component is serialised into
 * the RSC payload, and every value a server action returns is serialised into
 * its response. `settings/calendar/page.tsx` used to pass whole
 * `CalendarConnection` rows — `accessToken` and `refreshToken` included — to
 * <CalendarClient>; the API-key screen and `generateApiKey` sent `keyHash`;
 * `addBudgetLine` / `addWorkPackage` / `createApplicationPart` returned
 * `magicTokenHash`; the application page read its parts whole and kept the
 * hash out of <ApplicationClient> with a destructure nothing pinned
 * (İNCELEME-29 B-2, TASK-MUN2TQ1W6WP8E).
 *
 * The fake client below answers like Prisma does: the whole row, unless the
 * call carries a `select`, in which case only those fields. The rows carry
 * non-null secrets, so a read without `select` fails these tests.
 * tests/secret-model-select-guard.test.ts is the static half of this pin.
 */

const SECRET_COLUMNS = ['accessToken', 'refreshToken', 'keyHash', 'magicTokenHash', 'tokenHash', 'codeHash'];

type Row = Record<string, unknown>;
type Select = Record<string, unknown>;

/** Prisma's `select` semantics, far enough for these rows: absent (or undefined) → whole row. */
function project(row: Row, select?: Select): Row {
  if (!select) return { ...row };
  const out: Row = {};
  for (const [key, spec] of Object.entries(select)) {
    if (!spec) continue;
    const value = row[key];
    out[key] =
      typeof spec === 'object' && spec !== null && 'select' in spec && value && typeof value === 'object'
        ? project(value as Row, (spec as { select: Select }).select)
        : value;
  }
  return out;
}

const h = vi.hoisted(() => ({
  scope: { tenantId: 'tenant-1', userId: 'user-1', role: 'TENANT_OWNER' },
  CALENDAR_ROW: {
    id: 'cal-1',
    tenantId: 'tenant-1',
    userId: 'user-1',
    provider: 'google',
    externalId: 'primary',
    accessToken: 'SENTINEL-ACCESS-TOKEN',
    refreshToken: 'SENTINEL-REFRESH-TOKEN',
    tokenExpiresAt: null,
    isConnected: true,
    lastSyncAt: null,
    createdAt: new Date('2026-09-01T00:00:00Z'),
    updatedAt: new Date('2026-09-01T00:00:00Z'),
  },
  API_KEY_ROW: {
    id: 'key-1',
    tenantId: 'tenant-1',
    name: 'ERP',
    keyHash: 'SENTINEL-KEY-HASH',
    prefix: 'fp_live_abcd',
    lastUsedAt: null,
    createdAt: new Date('2026-09-01T00:00:00Z'),
  },
  OPPORTUNITY_ROW: { id: 'opp-1', tenantId: 'tenant-1', title: 'District renovation pilot' },
  PART_ROW: {
    id: 'part-1',
    tenantId: 'tenant-1',
    opportunityId: 'opp-1',
    part: 'PART_A',
    content: { budget: [], workPackages: [], sections: [], revisions: [], comments: [], presence: [] },
    magicTokenHash: 'SENTINEL-MAGIC-HASH',
    createdAt: new Date('2026-09-01T00:00:00Z'),
    updatedAt: new Date('2026-09-01T00:00:00Z'),
  },
}));

vi.mock('@/lib/tenant', () => ({
  requireTenantAction: vi.fn(async () => h.scope),
  requireTenantPage: vi.fn(async () => h.scope),
}));

vi.mock('@/lib/db', () => {
  const tx = {
    calendarConnection: {
      findMany: vi.fn(async (args: { select?: Select }) => [project(h.CALENDAR_ROW, args.select)]),
    },
    apiKey: {
      findMany: vi.fn(async (args: { select?: Select }) => [project(h.API_KEY_ROW, args.select)]),
      create: vi.fn(async (args: { data: Row; select?: Select }) =>
        project({ ...h.API_KEY_ROW, ...args.data }, args.select)
      ),
    },
    opportunity: {
      // A relation included as `true` comes back whole, as `{ select }` projected.
      findFirst: vi.fn(async (args: { include?: { applicationParts?: true | { select?: Select } } }) => {
        const rel = args.include?.applicationParts;
        if (!rel) return { id: 'opp-1' };
        const select = rel === true ? undefined : rel.select;
        return { ...h.OPPORTUNITY_ROW, applicationParts: [project(h.PART_ROW, select)] };
      }),
    },
    applicationPart: {
      findMany: vi.fn(async (args: { select?: Select }) => [project(h.PART_ROW, args.select)]),
      findFirst: vi.fn(async (args: { select?: Select }) => project(h.PART_ROW, args.select)),
      create: vi.fn(async (args: { data: Row; select?: Select }) =>
        project({ ...h.PART_ROW, ...args.data }, args.select)
      ),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
  };
  return {
    prisma: {},
    withTenant: vi.fn(async (_tenantId: string, cb: (t: typeof tx) => unknown) => cb(tx)),
  };
});

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

vi.mock('@/lib/modules/guard', () => ({ moduleGate: vi.fn(async () => null) }));

// The client components are replaced by named stubs: the test reads the props
// the page gives them, which is exactly what the RSC payload would carry.
vi.mock('@/app/[locale]/(app)/[workspace]/settings/calendar/client', () => ({
  CalendarClient: function CalendarClient() {
    return null;
  },
}));
vi.mock('@/app/[locale]/(app)/[workspace]/settings/api-keys/client', () => ({
  ApiKeysClient: function ApiKeysClient() {
    return null;
  },
}));

vi.mock('@/app/[locale]/(app)/[workspace]/opportunities/[id]/application/client', () => ({
  ApplicationClient: function ApplicationClient() {
    return null;
  },
}));

import CalendarSettingsPage from '@/app/[locale]/(app)/[workspace]/settings/calendar/page';
import ApiKeysSettingsPage from '@/app/[locale]/(app)/[workspace]/settings/api-keys/page';
import ApplicationPage from '@/app/[locale]/(app)/[workspace]/opportunities/[id]/application/page';
import { ApplicationClient } from '@/app/[locale]/(app)/[workspace]/opportunities/[id]/application/client';
import { CalendarClient } from '@/app/[locale]/(app)/[workspace]/settings/calendar/client';
import { ApiKeysClient } from '@/app/[locale]/(app)/[workspace]/settings/api-keys/client';
import { generateApiKey } from '@/app/[locale]/(app)/[workspace]/settings/api-keys/actions';
import { addBudgetLine, addWorkPackage, createApplicationPart } from '@/modules/m11/server/actions';

/** Depth-first search of a rendered element tree for an element of `type`. */
function findElement(node: unknown, type: unknown): React.ReactElement<Record<string, unknown>> | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const hit = findElement(child, type);
      if (hit) return hit;
    }
    return null;
  }
  if (!React.isValidElement(node)) return null;
  const el = node as React.ReactElement<Record<string, unknown>>;
  if (el.type === type) return el;
  return findElement(el.props.children, type);
}

/** Fails with the offending path if any secret column name or sentinel value is present. */
function expectNoSecrets(value: unknown): void {
  const json = JSON.stringify(value);
  for (const column of SECRET_COLUMNS) expect(json).not.toContain(`"${column}"`);
  expect(json).not.toContain('SENTINEL-');
}

const PAGE_PARAMS = { params: Promise.resolve({ locale: 'en', workspace: 'ws' }) };

describe('secret columns stay on the server', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('calendar settings page: <CalendarClient> props carry no OAuth token', async () => {
    const tree = await CalendarSettingsPage(PAGE_PARAMS);
    const client = findElement(tree, CalendarClient);
    expect(client).not.toBeNull();

    const connections = client!.props.connections as Row[];
    expect(connections).toHaveLength(1);
    // Still the fields the client renders — the fix must not blank the screen.
    expect(connections[0]).toEqual({ id: 'cal-1', provider: 'google', isConnected: true, lastSyncAt: null });
    expectNoSecrets(client!.props);
  });

  test('API keys page: <ApiKeysClient> props carry no key hash', async () => {
    const tree = await ApiKeysSettingsPage(PAGE_PARAMS);
    const client = findElement(tree, ApiKeysClient);
    expect(client).not.toBeNull();
    expect((client!.props.apiKeys as Row[])[0]).toMatchObject({ id: 'key-1', prefix: 'fp_live_abcd' });
    expectNoSecrets(client!.props);
  });

  test('generateApiKey returns the raw key once, but never its hash', async () => {
    const res = await generateApiKey({ name: 'ERP' });
    if ('error' in res) throw new Error(`unexpected refusal: ${res.error}`);
    expect(res.rawKey).toMatch(/^fp_live_/);
    expectNoSecrets(res.apiKeyRecord);
    expect(res.apiKeyRecord).not.toHaveProperty('tenantId');
  });

  test('application page: <ApplicationClient> learns a portal link exists, never its hash', async () => {
    const tree = await ApplicationPage({ params: Promise.resolve({ locale: 'en', workspace: 'ws', id: 'opp-1' }) });
    const client = findElement(tree, ApplicationClient);
    expect(client).not.toBeNull();
    // Still what the client renders — the part and its link flag.
    expect(client!.props.partA).toMatchObject({ id: 'part-1', part: 'PART_A', hasPortalLink: true });
    expect(client!.props.partA).toHaveProperty('content');
    expectNoSecrets(client!.props);
  });

  test('M11 part actions return no portal-token hash', async () => {
    const results = [
      await addBudgetLine('part-1', 'Partner GmbH', 12),
      await addWorkPackage('part-1', { code: 'WP1', title: 'Mgmt', leadPartner: 'P1', startMonth: 1, endMonth: 12 }),
      await createApplicationPart('opp-1', 'PART_A'),
    ];
    for (const result of results) {
      expect(result).not.toBeNull();
      expect(result).toHaveProperty('content');
      expectNoSecrets(result);
    }
  });
});
