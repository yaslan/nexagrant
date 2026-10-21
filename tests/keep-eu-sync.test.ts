import crypto from 'crypto';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { fakeEmbedding } from './helpers/fake-embedding';

type Row = Record<string, unknown>;
type TableName =
  | 'cordisProject'
  | 'cordisOrganization'
  | 'cordisParticipation'
  | 'cordisProjectTopic'
  | 'systemAlert'
  | 'rawFetch'
  | 'document';

function createKeepEuStub() {
  const store = new Map<TableName, Map<string, Row>>();
  let seq = 0;

  const table = (name: TableName): Map<string, Row> => {
    let t = store.get(name);
    if (!t) {
      t = new Map();
      store.set(name, t);
    }
    return t;
  };

  const rows = (name: TableName): Row[] => [...table(name).values()];

  const upsertInto = (name: TableName, key: string, create: Row, update: Row): Row => {
    const t = table(name);
    const existing = t.get(key);
    const row = existing
      ? { ...existing, ...update }
      : { ...create, importedAt: new Date(Date.now() + seq++) };
    t.set(key, row);
    return row;
  };

  const asString = (val: unknown): string => String(val ?? '');

  const delegate = (name: TableName, keyOf: (where: Row) => string) => ({
    findUnique: async (args: { where: Row }): Promise<Row | null> => table(name).get(keyOf(args.where)) ?? null,
    create: async (args: { data: Row }): Promise<Row> => upsertInto(name, keyOf(args.data), args.data, {}),
    update: async (args: { where: Row; data: Row }): Promise<Row> => {
      const key = keyOf(args.where);
      const existing = table(name).get(key);
      if (!existing) throw new Error(`${name} row not found: ${key}`);
      const row = { ...existing, ...args.data };
      table(name).set(key, row);
      return row;
    },
    upsert: async (args: { where: Row; create?: Row; update?: Row }): Promise<Row> =>
      upsertInto(name, keyOf(args.where), args.create ?? {}, args.update ?? {}),
    count: async (args?: { where?: Row }): Promise<number> => {
      if (!args?.where) return rows(name).length;
      return rows(name).filter((r) => {
        for (const [k, v] of Object.entries(args.where!)) {
          if (r[k] !== v) return false;
        }
        return true;
      }).length;
    },
  });

  const prisma: Record<string, unknown> = {
    cordisProject: {
      ...delegate('cordisProject', (w) => asString(w.id)),
      count: async (args?: { where?: Row }): Promise<number> => {
        if (!args?.where) return rows('cordisProject').length;
        return rows('cordisProject').filter((r) => {
          for (const [k, v] of Object.entries(args.where!)) {
            if (r[k] !== v) return false;
          }
          return true;
        }).length;
      },
      aggregate: async (args?: { where?: Row }): Promise<{ _sum: { ecMaxContribution: bigint | null; totalCost: bigint | null } }> => {
        const filtered = rows('cordisProject').filter((r) => {
          if (!args?.where) return true;
          for (const [k, v] of Object.entries(args.where)) {
            if (r[k] !== v) return false;
          }
          return true;
        });

        const grants = filtered.map((r) => r.ecMaxContribution).filter((v): v is bigint => typeof v === 'bigint');
        const costs = filtered.map((r) => r.totalCost).filter((v): v is bigint => typeof v === 'bigint');

        return {
          _sum: {
            ecMaxContribution: grants.length ? grants.reduce((a, b) => a + b, 0n) : null,
            totalCost: costs.length ? costs.reduce((a, b) => a + b, 0n) : null,
          },
        };
      },
      findFirst: async (args?: { where?: Row }): Promise<Row | null> => {
        const filtered = rows('cordisProject').filter((r) => {
          if (!args?.where) return true;
          for (const [k, v] of Object.entries(args.where)) {
            if (r[k] !== v) return false;
          }
          return true;
        });
        return filtered[0] ?? null;
      },
      findMany: async (args?: { where?: Row; take?: number }): Promise<Row[]> => {
        const filtered = rows('cordisProject').filter((r) => {
          if (!args?.where) return true;
          for (const [k, v] of Object.entries(args.where)) {
            if (r[k] !== v) return false;
          }
          return true;
        });
        const limited = args?.take ? filtered.slice(0, args.take) : filtered;
        return limited.map((p) => ({
          ...p,
          topics: rows('cordisProjectTopic').filter((t) => t.projectId === p.id),
          participations: rows('cordisParticipation')
            .filter((part) => part.projectId === p.id)
            .map((part) => ({
              ...part,
              organization: table('cordisOrganization').get(asString(part.organisationId)) ?? {
                name: 'Unknown',
                country: null,
                isTurkish: false,
              },
            })),
        }));
      },
    },

    cordisOrganization: delegate('cordisOrganization', (w) => asString(w.organisationId)),

    cordisParticipation: {
      ...delegate('cordisParticipation', (w) => {
        const key = w.projectId_organisationId as Row | undefined;
        return `${asString(key?.projectId)}::${asString(key?.organisationId)}`;
      }),
      count: async (): Promise<number> => {
        return rows('cordisParticipation').filter((p) => {
          const org = table('cordisOrganization').get(asString(p.organisationId));
          return org?.isTurkish === true;
        }).length;
      },
    },

    cordisProjectTopic: delegate('cordisProjectTopic', (w) => {
      const key = w.projectId_topicCode as Row | undefined;
      return `${asString(key?.projectId)}::${asString(key?.topicCode)}`;
    }),

    systemAlert: {
      create: async (args: { data: Row }): Promise<{ id: string }> => {
        const id = `alert-${seq++}`;
        table('systemAlert').set(id, { id, ...args.data });
        return { id };
      },
      findFirst: async (): Promise<Row | null> => null,
      update: async (args: { where: Row; data: Row }): Promise<Row> => args.data,
    },

    rawFetch: {
      create: async (args: { data: Row }): Promise<{ id: string }> => {
        const id = `raw-${seq++}`;
        table('rawFetch').set(id, { id, ...args.data });
        return { id };
      },
      findFirst: async (): Promise<Row | null> => null,
    },

    document: {
      create: async (args: { data: Row }): Promise<{ id: string }> => {
        const id = `doc-${seq++}`;
        table('document').set(id, { id, ...args.data });
        return { id };
      },
      deleteMany: async (args?: { where?: Row }): Promise<{ count: number }> => {
        let count = 0;
        if (!args?.where) {
          count = table('document').size;
          table('document').clear();
          return { count };
        }
        for (const [id, row] of [...table('document').entries()]) {
          let match = true;
          for (const [k, v] of Object.entries(args.where)) {
            if (row[k] !== v) {
              match = false;
              break;
            }
          }
          if (match) {
            table('document').delete(id);
            count++;
          }
        }
        return { count };
      },
    },

    $queryRaw: async (query: TemplateStringsArray): Promise<unknown[]> => {
      const sql = query.join('');
      if (sql.includes('AS "count"')) {
        // Distinct partner organisations across all INTERREG projects
        const projectIds = new Set(rows('cordisProject').filter((r) => r.framework === 'INTERREG').map((r) => r.id));
        const orgs = new Set(
          rows('cordisParticipation')
            .filter((p) => projectIds.has(p.projectId))
            .map((p) => asString(p.organisationId))
        );
        return [{ count: BigInt(orgs.size) }];
      }
      if (sql.includes('masterCall')) {
        // Group by masterCall
        const map = new Map<string, { count: bigint; grant: bigint }>();
        for (const proj of rows('cordisProject')) {
          const call = (proj.masterCall as string) || 'Interreg General';
          const entry = map.get(call) ?? { count: 0n, grant: 0n };
          entry.count += 1n;
          if (typeof proj.ecMaxContribution === 'bigint') {
            entry.grant += proj.ecMaxContribution;
          }
          map.set(call, entry);
        }
        return [...map.entries()].map(([masterCall, d]) => ({
          masterCall,
          projectCount: d.count,
          totalGrantEUR: d.grant,
        }));
      }

      // Group by country
      const map = new Map<string, { count: bigint; grant: bigint }>();
      for (const part of rows('cordisParticipation')) {
        const org = table('cordisOrganization').get(asString(part.organisationId));
        const c = typeof org?.country === 'string' ? org.country : null;
        if (!c) continue;
        const entry = map.get(c) ?? { count: 0n, grant: 0n };
        entry.count += 1n;
        if (typeof part.ecContribution === 'bigint') {
          entry.grant += part.ecContribution;
        }
        map.set(c, entry);
      }
      return [...map.entries()].map(([country, d]) => ({
        country,
        partnerCount: d.count,
        totalGrantEUR: d.grant,
      }));
    },

    $executeRawUnsafe: async (): Promise<number> => 1,
  };

  return {
    prisma,
    rows,
    clear: (name: TableName) => table(name).clear(),
    reset: () => {
      store.clear();
      seq = 0;
    },
  };
}

const db = createKeepEuStub();

vi.mock('../src/lib/db', () => ({
  prisma: db.prisma,
  withTenant: async (_tenantId: string, fn: (tx: typeof db.prisma) => Promise<unknown>) => fn(db.prisma),
}));

const embedTextMock = vi.hoisted(() => vi.fn());
vi.mock('../src/lib/llm', async () => {
  const actual = await vi.importActual<typeof import('../src/lib/llm')>('../src/lib/llm');
  return { ...actual, embedText: embedTextMock };
});

const {
  syncKeepEuData,
  persistKeepEuRecord,
  parseKeepEuResponse,
  normalizeKeepEuPartner,
  buildKeepEuRagBody,
  aggregateKeepEuMetrics,
  fetchKeepEuOpenData,
  KEEP_EU_SYNC_ALERT_SOURCE,
} = await import('../src/lib/keep-eu-sync');

beforeEach(() => {
  db.reset();
  embedTextMock.mockReset().mockImplementation(async (text: string) => fakeEmbedding(text));
});

function sampleKeepEuProject(): Parameters<typeof persistKeepEuRecord>[0] {
  return {
    projectId: 'BGTR0200037',
    acronym: 'ENPORT STRANDJA',
    title: 'Integrated approach to sustainable tourism in Strandja',
    description: 'Promoting local heritage, tourism infrastructure and cultural exchange.',
    programmeId: 305,
    programmeTitle: '2021 - 2027 Interreg VI-A IPA Bulgaria Türkiye',
    framework: 'INTERREG',
    status: 'ongoing',
    priority: 'PO5 Integrated territorial development',
    totalBudgetEUR: 928469.53,
    euFundingEUR: 789199.07,
    startDate: '2025-06-24',
    endDate: '2027-06-23',
    leadPartner: {
      partnerName: 'Kristta Ltd',
      country: 'BG',
      role: 'lead',
      pic: '999123456',
      town: 'Sredets',
      isTurkish: false,
      totalBudgetEUR: 5800.62,
    },
    partners: [
      {
        partnerName: 'Kristta Ltd',
        country: 'BG',
        role: 'lead',
        pic: '999123456',
        town: 'Sredets',
        isTurkish: false,
        totalBudgetEUR: 5800.62,
        euFundingEUR: 4930.52,
      },
      {
        partnerName: 'Trakya Üniversitesi',
        partnerTranslatedName: 'Trakya University, Edirne',
        country: 'TR',
        role: 'partner',
        pic: '999616914',
        beneficiaryId: '8150409605',
        town: 'Edirne',
        isTurkish: true,
        totalBudgetEUR: 391474.42,
        euFundingEUR: 332753.25,
      },
      {
        partnerName: 'Kaynarca Belediyesi',
        partnerTranslatedName: 'Municipality of Kaynarca',
        country: 'TR',
        role: 'partner',
        pic: null,
        beneficiaryId: 'TR5400046090',
        town: 'Kaynarca',
        isTurkish: true,
        totalBudgetEUR: 40996.02,
        euFundingEUR: 34846.61,
      },
    ],
  };
}

describe('normalizeKeepEuPartner', () => {
  test('correctly normalizes partner details, identifies Turkish partners and roles', () => {
    const raw = {
      partner_name: 'TC Kaynarca belediye Başkanlığı',
      partner_translated_names: { en: { name_translated: 'Municipality of Kaynarca' } },
      country: { name: 'Turkey', iso_code: 'TR' },
      pic: '932608053',
      beneficiary_id: 'TR5400046090',
      type: 'lead',
      town: 'Kaynarca',
      total_budget: '40996.02',
      partner_cofinancing: '34846.61',
    };

    const norm = normalizeKeepEuPartner(raw);
    expect(norm).not.toBeNull();
    expect(norm?.partnerName).toBe('TC Kaynarca belediye Başkanlığı');
    expect(norm?.partnerTranslatedName).toBe('Municipality of Kaynarca');
    expect(norm?.country).toBe('TR');
    expect(norm?.isTurkish).toBe(true);
    expect(norm?.role).toBe('lead');
    expect(norm?.pic).toBe('932608053');
    expect(norm?.beneficiaryId).toBe('TR5400046090');
    expect(norm?.totalBudgetEUR).toBeCloseTo(40996.02);
    expect(norm?.euFundingEUR).toBeCloseTo(34846.61);
  });
});

describe('parseKeepEuResponse', () => {
  test('parses programmes and projects structure from keep.eu open data', async () => {
    const payload = {
      programmes: [
        {
          id: 305,
          title: '2021 - 2027 Interreg VI-A IPA Bulgaria Türkiye',
          projects: [
            {
              project_id: 'BGTR0200037',
              acronym: 'ENPORT STRANDJA',
              translations: {
                en: {
                  name: 'ENPORT STRANDJA - Sustainable Tourism',
                  description: 'A cross-border tourism initiative.',
                },
              },
              start_date: '2025-06-24',
              end_date: '2027-06-23',
              total_budget: '928469.53',
              eu_funding: '789199.07',
              partnerships: [
                {
                  partner_name: 'Kristta Ltd',
                  country: { iso_code: 'BG' },
                  type: 'lead',
                  pic: '999123456',
                },
              ],
            },
          ],
        },
      ],
    };

    const parsed = await parseKeepEuResponse(payload);
    expect(parsed.programmesCount).toBe(1);
    expect(parsed.projects).toHaveLength(1);
    const p = parsed.projects[0];
    expect(p?.projectId).toBe('BGTR0200037');
    expect(p?.title).toBe('ENPORT STRANDJA - Sustainable Tourism');
    expect(p?.framework).toBe('INTERREG');
    expect(p?.leadPartner?.partnerName).toBe('Kristta Ltd');
  });

  test('detects schema drift on unknown upstream fields and emits SystemAlert (CLAUDE.md #6)', async () => {
    const payload = {
      programmes: [
        {
          id: 305,
          title: 'Interreg Programme',
          projects: [
            {
              project_id: 'DRIFT_TEST_01',
              title: 'Unknown Fields Project',
              unknown_extra_metric_field: 'Some new value',
            },
          ],
        },
      ],
    };

    await parseKeepEuResponse(payload);
    const alerts = db.rows('systemAlert');
    expect(alerts.some((a) => String(a.message).includes('does not map'))).toBe(true);
  });
});

describe('persistKeepEuRecord', () => {
  test('persists project, partners and participations idempotently', async () => {
    const proj = sampleKeepEuProject();
    const ok = await persistKeepEuRecord(proj);
    expect(ok).toBe(true);

    expect(db.rows('cordisProject')).toHaveLength(1);
    expect(db.rows('cordisOrganization')).toHaveLength(3); // 2 with PIC + 1 with KEU beneficiary id
    expect(db.rows('cordisParticipation')).toHaveLength(3);
    expect(db.rows('cordisProjectTopic')).toHaveLength(1);

    const savedProject = db.rows('cordisProject')[0];
    expect(savedProject?.framework).toBe('INTERREG');
    expect(savedProject?.title).toBe(proj.title);

    // Second run with updated title updates in place without duplicating rows
    await persistKeepEuRecord({ ...proj, title: 'Updated Title' });
    expect(db.rows('cordisProject')).toHaveLength(1);
    expect(db.rows('cordisOrganization')).toHaveLength(3);
    expect(db.rows('cordisProject')[0]?.title).toBe('Updated Title');
  });

  test('skips record without project id and creates SystemAlert', async () => {
    const invalidProj = { ...sampleKeepEuProject(), projectId: '   ' };
    const ok = await persistKeepEuRecord(invalidProj);
    expect(ok).toBe(false);
    expect(db.rows('cordisProject')).toHaveLength(0);

    const alerts = db.rows('systemAlert');
    expect(alerts.some((a) => String(a.message).includes('missing project id'))).toBe(true);
  });
});

describe('syncKeepEuData', () => {
  test('syncs input records and mirrors into RAG', async () => {
    const proj = sampleKeepEuProject();
    const res = await syncKeepEuData({ records: [proj] });

    expect(res.success).toBe(true);
    expect(res.syncedProjectsCount).toBe(1);
    expect(res.syncedPartnersCount).toBe(3);
    expect(res.totalBudgetEUR).toBeCloseTo(928469.53);
    expect(res.totalEuFundingEUR).toBeCloseTo(789199.07);

    // Check RAG ingestion
    expect(db.rows('document')).toHaveLength(1);
    const doc = db.rows('document')[0];
    expect(doc?.kind).toBe('INTERREG_PROJECT');
    expect(doc?.title).toContain('ENPORT STRANDJA');
  });

  test('mirrors existing database records when sourceFromDatabaseOnly is true', async () => {
    await persistKeepEuRecord(sampleKeepEuProject());
    db.clear('document');

    const res = await syncKeepEuData({ sourceFromDatabaseOnly: true });
    expect(res.source).toBe('database');
    expect(res.syncedProjectsCount).toBe(1);
    expect(db.rows('document')).toHaveLength(1);
  });

  test('respects limit and skipRag options with onProgress callbacks', async () => {
    const p1 = sampleKeepEuProject();
    const p2 = { ...sampleKeepEuProject(), projectId: 'BGTR9999999', acronym: 'P2' };
    const progressLog: number[] = [];

    const res = await syncKeepEuData({
      records: [p1, p2],
      limit: 1,
      skipRag: true,
      onProgress: ({ current }) => progressLog.push(current),
    });

    expect(res.syncedProjectsCount).toBe(1);
    expect(progressLog).toEqual([1]);
    expect(db.rows('document')).toHaveLength(0); // RAG skipped
    expect(db.rows('cordisProject')).toHaveLength(1);
  });
});

describe('aggregateKeepEuMetrics', () => {
  test('empty database returns zeros rather than hard-coded literals (CLAUDE.md #7)', async () => {
    const metrics = await aggregateKeepEuMetrics();
    expect(metrics.totalProjectsCount).toBe(0);
    expect(metrics.totalPartnersCount).toBe(0);
    expect(metrics.totalEuFundingEUR).toBe(0);
    expect(metrics.totalBudgetEUR).toBe(0);
    expect(metrics.topCountriesBreakdown).toEqual([]);
    expect(metrics.topProgrammesBreakdown).toEqual([]);
  });

  test('reports real measured aggregates from database', async () => {
    await syncKeepEuData({ records: [sampleKeepEuProject()] });
    const metrics = await aggregateKeepEuMetrics();

    expect(metrics.totalProjectsCount).toBe(1);
    expect(metrics.totalEuFundingEUR).toBe(789199);
    expect(metrics.totalBudgetEUR).toBe(928470);
    expect(metrics.topCountriesBreakdown.length).toBeGreaterThan(0);
    expect(metrics.topProgrammesBreakdown.length).toBe(1);
    expect(metrics.topProgrammesBreakdown[0]?.programmeTitle).toContain('Bulgaria Türkiye');
  });
});

describe('buildKeepEuRagBody', () => {
  test('formats Turkish beneficiaries, budget, deliverables and summaries', () => {
    const body = buildKeepEuRagBody(sampleKeepEuProject());
    expect(body).toContain('ENPORT STRANDJA');
    expect(body).toContain('Turkish Beneficiaries: Trakya Üniversitesi (Edirne); Kaynarca Belediyesi (Kaynarca)');
    expect(body).toContain('Total Budget: EUR 928,469.53');
    expect(body).toContain('Lead Partner: Kristta Ltd (BG)');
  });
});

describe('fetchKeepEuOpenData', () => {
  test('returns error and records alert when API key is missing', async () => {
    const res = await fetchKeepEuOpenData({ apiKey: '' });
    expect(res.ok).toBe(false);
    expect(res.error).toContain('KEEP_EU_API_KEY is not configured');

    const alerts = db.rows('systemAlert');
    expect(
      alerts.some((a) => a.source === KEEP_EU_SYNC_ALERT_SOURCE && String(a.message).includes('skipped'))
    ).toBe(true);
  });
});


describe('persistKeepEuRecord — data protection (FO-112)', () => {
  type Seedable = { create(args: { data: Record<string, unknown> }): Promise<unknown> };
  const seed = (name: 'cordisOrganization' | 'cordisProject', data: Record<string, unknown>) =>
    (db.prisma[name] as unknown as Seedable).create({ data });

  test('never overwrites an existing CORDIS organisation; only fills empty fields', async () => {
    await seed('cordisOrganization', {
      organisationId: '999616914',
      name: 'TRAKYA UNIVERSITESI',
      nameNormalized: 'TRAKYA UNIVERSITESI',
      country: 'TR',
      city: null,
      isTurkish: true,
    });

    const proj = sampleKeepEuProject();
    proj.partners = [
      {
        partnerName: 'Trakya University, Edirne',
        country: 'TR',
        role: 'partner',
        pic: '999616914',
        town: 'Edirne',
        isTurkish: true,
      },
    ];
    await persistKeepEuRecord(proj);

    const org = db.rows('cordisOrganization').find((o) => o.organisationId === '999616914');
    expect(org?.name).toBe('TRAKYA UNIVERSITESI');
    expect(org?.nameNormalized).toBe('TRAKYA UNIVERSITESI');
    expect(org?.city).toBe('Edirne');
  });

  test('a blank beneficiary id does not create a shared KEU: organisation', async () => {
    const proj = sampleKeepEuProject();
    proj.partners = [
      {
        partnerName: 'Unkeyed Partner',
        country: 'BG',
        role: 'partner',
        pic: null,
        beneficiaryId: '|abc',
        isTurkish: false,
      },
    ];
    await persistKeepEuRecord(proj);

    expect(db.rows('cordisOrganization').some((o) => o.organisationId === 'KEU:')).toBe(false);
    expect(db.rows('cordisOrganization')).toHaveLength(0);
  });

  test('refuses to overwrite a non-Interreg project that shares the id', async () => {
    await seed('cordisProject', {
      id: 'BGTR0200037',
      title: 'Horizon project title',
      framework: 'HORIZON',
    });

    const ok = await persistKeepEuRecord(sampleKeepEuProject());
    expect(ok).toBe(false);
    expect(db.rows('cordisProject').find((p) => p.id === 'BGTR0200037')?.title).toBe('Horizon project title');
    expect(
      db.rows('systemAlert').some((a) => String(a.message).includes('non-Interreg'))
    ).toBe(true);
  });
});

describe('syncKeepEuData — upstream failure (FO-112)', () => {
  test('a run that could not reach keep.eu is not reported as successful', async () => {
    // fetch is stubbed so the test never reaches the network, whether or not a key is configured
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('unreachable');
    }));
    try {
      const result = await syncKeepEuData({ programmeIds: '305' });
      expect(result.source).toBe('database');
      expect(result.upstreamOk).toBe(false);
      expect(result.success).toBe(false);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  test('a database-only run is not an upstream failure', async () => {
    const result = await syncKeepEuData({ sourceFromDatabaseOnly: true });
    expect(result.upstreamOk).toBe(true);
    expect(result.success).toBe(true);
  });
});

describe('fetchKeepEuOpenData — raw answer (FO-112)', () => {
  test('records the response body in RawFetch and hashes the body bytes', async () => {
    const body = JSON.stringify({ 'exported date': '2026-10-01', programmes: [] });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(body, { status: 200 })));
    try {
      const res = await fetchKeepEuOpenData({ apiKey: 'test-key', programmeIds: '305' });
      expect(res.ok).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }

    const raw = db.rows('rawFetch')[0];
    expect(raw?.source).toBe('keep_eu_open_data');
    expect(raw?.hash).toBe(crypto.createHash('sha256').update(body).digest('hex'));
    expect((raw?.payload as { body?: unknown }).body).toEqual({ 'exported date': '2026-10-01', programmes: [] });
  });
});
