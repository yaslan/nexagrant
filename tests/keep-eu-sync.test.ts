import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { fakeEmbedding } from './helpers/fake-embedding';

type Row = Record<string, unknown>;
type TableName =
  | 'cordisProject'
  | 'cordisOrganization'
  | 'cordisParticipation'
  | 'cordisProjectTopic'
  | 'systemAlert'
  | 'rawFetch'
  | 'document'
  | 'chunk';

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

    cordisOrganization: {
      ...delegate('cordisOrganization', (w) => asString(w.organisationId)),
      findUnique: async (args: { where: Row }): Promise<Row | null> =>
        table('cordisOrganization').get(asString(args.where.organisationId)) ?? null,
      create: async (args: { data: Row }): Promise<Row> => {
        const key = asString(args.data.organisationId);
        table('cordisOrganization').set(key, { ...args.data });
        return args.data;
      },
      update: async (args: { where: Row; data: Row }): Promise<Row> => {
        const key = asString(args.where.organisationId);
        const row = { ...(table('cordisOrganization').get(key) ?? {}), ...args.data };
        table('cordisOrganization').set(key, row);
        return row;
      },
    },

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
      // Prisma reports an unset tenantId as null on read; the stub does the same.
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
            if ((row[k] ?? null) !== v) {
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
      findMany: async (args: {
        where: Row;
        take?: number;
        select?: { chunks?: { orderBy?: Row } };
      }): Promise<Row[]> => {
        const matches = [...table('document').values()].filter((row) =>
          Object.entries(args.where).every(([k, v]) => (row[k] ?? null) === v),
        );
        return matches.slice(0, args.take ?? matches.length).map((doc) => {
          const chunks = rows('chunk').filter((c) => c.documentId === doc.id);
          // Like Postgres: chunks come back in insertion order unless the query orders them.
          if (args.select?.chunks?.orderBy) {
            chunks.sort((a, b) => Number(a.ordinal) - Number(b.ordinal));
          }
          return { ...doc, chunks };
        });
      },
    },

    $queryRaw: async (query: TemplateStringsArray): Promise<unknown[]> => {
      const sql = query.join('');
      if (sql.includes('AS "count"')) {
        // Distinct organisations with at least one Interreg participation.
        const orgIds = new Set(
          rows('cordisParticipation')
            .filter((part) => rows('cordisProject').some((p) => p.id === part.projectId && p.framework === 'INTERREG'))
            .map((part) => asString(part.organisationId)),
        );
        return [{ count: BigInt(orgIds.size) }];
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

    // ingestDocument's chunk insert: ($1 documentId, $2 tenantId, $3 ordinal, $4 text, $5 embedding).
    $executeRawUnsafe: async (sql: string, ...params: unknown[]): Promise<number> => {
      if (sql.includes('INSERT INTO "Chunk"')) {
        const id = `chunk-${seq++}`;
        table('chunk').set(id, { id, documentId: params[0], ordinal: params[2], text: params[3] });
      }
      return 1;
    },
  };

  return {
    prisma,
    rows,
    clear: (name: TableName) => table(name).clear(),
    reset: () => {
      store.clear();
      seq = 0;
    },
    // Writes a stored document directly, as a legacy or tenant-owned copy would exist.
    seedDocument: (doc: { tenantId: string | null; kind: string; title: string; texts: string[] }): string => {
      const id = `doc-${seq++}`;
      table('document').set(id, { id, tenantId: doc.tenantId, kind: doc.kind, title: doc.title });
      doc.texts.forEach((text, ordinal) => {
        const cid = `chunk-${seq++}`;
        table('chunk').set(cid, { id: cid, documentId: id, ordinal, text });
      });
      return id;
    },
    // Same chunks and ordinals, but stored in reverse physical order.
    reverseChunks: (documentId: string): void => {
      const t = table('chunk');
      const mine = [...t.entries()].filter(([, r]) => r.documentId === documentId);
      for (const [key] of mine) t.delete(key);
      for (const [key, row] of mine.reverse()) t.set(key, row);
    },
    deleteRow: (name: TableName, id: string): void => {
      table(name).delete(id);
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

describe('syncKeepEuData RAG mirror', () => {
  test('re-running an unchanged project embeds nothing the second time', async () => {
    const proj = sampleKeepEuProject();
    const first = await syncKeepEuData({ records: [proj] });
    const embeddedFirst = embedTextMock.mock.calls.length;
    expect(embeddedFirst).toBeGreaterThan(0);
    expect(first.ragEmbeddedCount).toBe(1);
    expect(first.ragUnchangedCount).toBe(0);

    embedTextMock.mockClear();
    const second = await syncKeepEuData({ records: [proj] });

    expect(embedTextMock).not.toHaveBeenCalled();
    expect(second.ragEmbeddedCount).toBe(0);
    expect(second.ragUnchangedCount).toBe(1);
    expect(db.rows('document')).toHaveLength(1);
    expect(db.rows('chunk')).toHaveLength(embeddedFirst);
  });

  test('a changed project is re-embedded and an unchanged neighbour is not', async () => {
    const a = sampleKeepEuProject();
    const b = { ...sampleKeepEuProject(), projectId: 'OTHER-B', acronym: 'OTHER B', title: 'Second project' };
    await syncKeepEuData({ records: [a, b] });

    embedTextMock.mockClear();
    const changedA = { ...a, status: 'completed' };
    const res = await syncKeepEuData({ records: [changedA, b] });

    expect(res.ragEmbeddedCount).toBe(1);
    expect(res.ragUnchangedCount).toBe(1);
    const texts = embedTextMock.mock.calls.map((c) => String(c[0]));
    expect(texts.some((t) => t.includes('Status: completed'))).toBe(true);
    expect(texts.some((t) => t.includes('Second project'))).toBe(false);
    expect(db.rows('document')).toHaveLength(2);
  });

  test('a new project is embedded on its first run', async () => {
    const a = sampleKeepEuProject();
    await syncKeepEuData({ records: [a] });

    embedTextMock.mockClear();
    const fresh = { ...a, projectId: 'NEW-C', acronym: 'NEW C', title: 'Brand new project' };
    const res = await syncKeepEuData({ records: [a, fresh] });

    expect(res.ragEmbeddedCount).toBe(1);
    expect(res.ragUnchangedCount).toBe(1);
    expect(embedTextMock.mock.calls.some((c) => String(c[0]).includes('Brand new project'))).toBe(true);
  });

  // A body long enough to split into several chunks, so ordinal and tail checks mean something.
  function longProject(): ReturnType<typeof sampleKeepEuProject> {
    const description = Array.from(
      { length: 120 },
      (_, i) => `Activity ${i}: cross-border cooperation on heritage, tourism and infrastructure.`,
    ).join(' ');
    return { ...sampleKeepEuProject(), description };
  }

  function storedTexts(documentId: string): string[] {
    return db
      .rows('chunk')
      .filter((c) => c.documentId === documentId)
      .sort((a, b) => Number(a.ordinal) - Number(b.ordinal))
      .map((c) => String(c.text));
  }

  test('two shared documents with the same title are rebuilt into one, never kept as current', async () => {
    const proj = sampleKeepEuProject();
    await syncKeepEuData({ records: [proj] });
    const original = db.rows('document')[0]!;
    db.seedDocument({
      tenantId: null,
      kind: 'INTERREG_PROJECT',
      title: String(original.title),
      texts: storedTexts(String(original.id)),
    });
    expect(db.rows('document')).toHaveLength(2);

    embedTextMock.mockClear();
    const res = await syncKeepEuData({ records: [proj] });

    expect(res.ragEmbeddedCount).toBe(1);
    expect(res.ragUnchangedCount).toBe(0);
    expect(embedTextMock).toHaveBeenCalled();
    expect(db.rows('document')).toHaveLength(1);
  });

  test('a stored copy missing its last chunk is re-embedded, not kept as current', async () => {
    const proj = longProject();
    await syncKeepEuData({ records: [proj] });
    const doc = db.rows('document')[0]!;
    const chunks = db.rows('chunk').filter((c) => c.documentId === doc.id);
    expect(chunks.length).toBeGreaterThan(1);
    const wantedCount = chunks.length;
    const lastChunk = chunks.reduce((a, b) => (Number(a.ordinal) > Number(b.ordinal) ? a : b));
    db.deleteRow('chunk', String(lastChunk.id));

    embedTextMock.mockClear();
    const res = await syncKeepEuData({ records: [proj] });

    expect(res.ragEmbeddedCount).toBe(1);
    expect(res.ragUnchangedCount).toBe(0);
    expect(embedTextMock).toHaveBeenCalled();
    // The rebuilt document has a new id; the rebuilt copy must hold every chunk again.
    const rebuilt = db.rows('document');
    expect(rebuilt).toHaveLength(1);
    expect(storedTexts(String(rebuilt[0]!.id))).toHaveLength(wantedCount);
  });

  test('chunks stored in reverse physical order with correct ordinals still count as unchanged', async () => {
    const proj = longProject();
    await syncKeepEuData({ records: [proj] });
    const doc = db.rows('document')[0]!;
    db.reverseChunks(String(doc.id));
    const physical = db.rows('chunk').filter((c) => c.documentId === doc.id);
    expect(Number(physical[0]!.ordinal)).toBeGreaterThan(Number(physical[physical.length - 1]!.ordinal));

    embedTextMock.mockClear();
    const res = await syncKeepEuData({ records: [proj] });

    expect(embedTextMock).not.toHaveBeenCalled();
    expect(res.ragEmbeddedCount).toBe(0);
    expect(res.ragUnchangedCount).toBe(1);
  });

  test('a tenant-owned document with the same title is neither compared against nor deleted', async () => {
    const proj = sampleKeepEuProject();
    await syncKeepEuData({ records: [proj] });
    const shared = db.rows('document')[0]!;
    db.seedDocument({
      tenantId: 'tenant-1',
      kind: 'INTERREG_PROJECT',
      title: String(shared.title),
      texts: ['tenant-owned copy'],
    });

    // Shared copy is current: the tenant copy must not make it look like a duplicate.
    embedTextMock.mockClear();
    const unchanged = await syncKeepEuData({ records: [proj] });
    expect(unchanged.ragUnchangedCount).toBe(1);
    expect(embedTextMock).not.toHaveBeenCalled();

    // Shared copy changes: only the shared copy is replaced; the tenant copy survives.
    const changed = { ...proj, status: 'completed' };
    const rebuilt = await syncKeepEuData({ records: [changed] });
    expect(rebuilt.ragEmbeddedCount).toBe(1);
    const docs = db.rows('document');
    expect(docs.filter((d) => d.tenantId === 'tenant-1')).toHaveLength(1);
    expect(docs.filter((d) => d.tenantId == null)).toHaveLength(1);
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

  test('a failed keep.eu read reports the fixed code and no sync counts', async () => {
    // An explicit apiKey keeps the test independent of KEEP_EU_API_KEY in the environment.
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 403, statusText: 'Forbidden' })));
    const res = await syncKeepEuData({ programmeIds: [305], apiKey: 'test-key' });
    vi.unstubAllGlobals();

    expect(res.success).toBe(false);
    expect(res.upstreamOk).toBe(false);
    expect(res.upstreamError).toBe('forbidden');
    expect(res.syncedProjectsCount).toBe(0);
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

describe('RAG personal-name exclusion (FO-363, K-575447)', () => {
  const EXCLUDED = ['BGTR0300118', 'BGTR0300121', 'BGTR0300153', 'BGTR0300155', 'BGTR0300162'];

  function projectWithId(projectId: string, acronym = projectId) {
    return { ...sampleKeepEuProject(), projectId, acronym, title: `Title ${projectId}` };
  }

  test('an excluded project is persisted but never sent to the embedding step', async () => {
    const keep = projectWithId('BGTR0200037');
    const excluded = projectWithId('BGTR0300118');
    const res = await syncKeepEuData({ records: [keep, excluded] });

    expect(res.syncedProjectsCount).toBe(2);
    expect(db.rows('cordisProject')).toHaveLength(2);
    expect(res.ragExcludedCount).toBe(1);
    expect(res.ragEmbeddedCount).toBe(1);
    const texts = embedTextMock.mock.calls.map((c) => String(c[0]));
    expect(texts.some((t) => t.includes('Title BGTR0300118'))).toBe(false);
    expect(texts.some((t) => t.includes('Title BGTR0200037'))).toBe(true);
  });

  test('default excludes all five identified projects: 280 of 285 are embedded', async () => {
    const records = [
      ...EXCLUDED.map((id) => projectWithId(id)),
      ...Array.from({ length: 280 }, (_, i) => projectWithId(`BGTR09${String(i).padStart(5, '0')}`)),
    ];
    const res = await syncKeepEuData({ records, skipRag: false });

    expect(res.syncedProjectsCount).toBe(285);
    expect(res.ragExcludedCount).toBe(5);
    expect(res.ragEmbeddedCount).toBe(280);
    expect(db.rows('document')).toHaveLength(280);
  });

  test('an explicit empty list disables the exclusion (test-only escape hatch)', async () => {
    const res = await syncKeepEuData({ records: [projectWithId('BGTR0300118')], ragExcludeProjectIds: [] });

    expect(res.ragExcludedCount).toBe(0);
    expect(res.ragEmbeddedCount).toBe(1);
  });

  test('an excluded id missing from the upstream data raises an alert and does not fail the run', async () => {
    const res = await syncKeepEuData({ records: [projectWithId('BGTR0200037')] });

    expect(res.success).toBe(true);
    expect(res.ragExclusionMissingCount).toBe(5);
    const alerts = db.rows('systemAlert');
    expect(alerts.some((a) => String(a.message).includes('RAG exclusion'))).toBe(true);
  });

  test('an upstream outage does not raise the missing-id alert', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 403, statusText: 'Forbidden' })));
    const res = await syncKeepEuData({ programmeIds: [305], apiKey: 'test-key' });
    vi.unstubAllGlobals();

    expect(res.upstreamOk).toBe(false);
    expect(res.ragExclusionMissingCount).toBe(0);
    expect(db.rows('systemAlert').some((a) => String(a.message).includes('RAG exclusion'))).toBe(false);
  });

  test('a limited run does not warn about excluded ids that were cut by the limit', async () => {
    const res = await syncKeepEuData({
      records: [projectWithId('BGTR0300118'), projectWithId('BGTR0200037')],
      limit: 1,
    });

    expect(res.ragExclusionMissingCount).toBe(4);
    expect(db.rows('systemAlert').some((a) => String(a.message).includes('RAG exclusion'))).toBe(false);
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
    expect(res.error).toBe('missing_api_key');

    const alerts = db.rows('systemAlert');
    expect(
      alerts.some(
        (a) =>
          a.source === KEEP_EU_SYNC_ALERT_SOURCE &&
          String(a.message).includes('skipped') &&
          String(a.message).includes('KEEP_EU_API_KEY is not configured')
      )
    ).toBe(true);
  });
});


describe('fetchKeepEuOpenData failure handling (B2, Y3)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test('403 is not retried and raises one keep_eu_forbidden alert', async () => {
    const fetchMock = vi.fn(async () => new Response('', { status: 403, statusText: 'Forbidden' }));
    vi.stubGlobal('fetch', fetchMock);

    const res = await fetchKeepEuOpenData({ apiKey: 'test-key', programmeIds: [305] });

    expect(res.ok).toBe(false);
    expect(res.error).toBe('forbidden');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const alerts = db.rows('systemAlert').filter((a) => String(a.message).includes('refused access'));
    expect(alerts).toHaveLength(1);
    expect(String(alerts[0]?.message)).toContain('Interact');
  });

  test('timeout is reported as a timeout alert, not a generic network error', async () => {
    const timeout = Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' });
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(timeout)));

    const res = await fetchKeepEuOpenData({ apiKey: 'test-key', programmeIds: [305] });

    expect(res.ok).toBe(false);
    expect(res.error).toBe('timeout');
    const alerts = db.rows('systemAlert').filter((a) => String(a.message).includes('did not answer within 30s'));
    expect(alerts).toHaveLength(1);
  });

  test('a non-403 HTTP error returns a fixed code and the numeric status, never the status text', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 500, statusText: 'Internal Server Error' })));

    const res = await fetchKeepEuOpenData({ apiKey: 'test-key', programmeIds: [305] });

    expect(res).toEqual({ ok: false, data: null, error: 'upstream_error', status: 500 });
    const alerts = db.rows('systemAlert').filter((a) => String(a.message).includes('HTTP 500'));
    expect(alerts).toHaveLength(1);
  });

  test('a network error returns a fixed code and never the thrown text', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new Error('getaddrinfo ENOTFOUND keep.eu.internal'))));

    const res = await fetchKeepEuOpenData({ apiKey: 'test-key', programmeIds: [305] });

    expect(res).toEqual({ ok: false, data: null, error: 'network_error' });
    const alerts = db.rows('systemAlert').filter((a) => String(a.message).includes('ENOTFOUND'));
    expect(alerts).toHaveLength(1);
  });

  test('dry run (persist: false) writes no alert on 403', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 403, statusText: 'Forbidden' })));

    const res = await fetchKeepEuOpenData({ apiKey: 'test-key', programmeIds: [305], persist: false });

    expect(res.ok).toBe(false);
    expect(db.rows('systemAlert')).toHaveLength(0);
  });
});

describe('aggregateKeepEuMetrics partner count (Y4)', () => {
  test('counts distinct partner organisations across more than 10 countries', async () => {
    const countries = ['BG', 'TR', 'RO', 'GR', 'IT', 'HU', 'AT', 'DE', 'FR', 'ES', 'PL', 'CY'];
    const base = sampleKeepEuProject();
    await persistKeepEuRecord({
      ...base,
      leadPartner: undefined,
      partners: countries.map((country, i) => ({
        partnerName: `Partner ${country}`,
        country,
        role: 'partner',
        pic: `9000000${String(i).padStart(2, '0')}`,
        town: 'Town',
        isTurkish: country === 'TR',
        totalBudgetEUR: 1000,
        euFundingEUR: 800,
      })),
    });

    const metrics = await aggregateKeepEuMetrics();

    // Previously this summed the top-10 country rows, which undercounts once
    // there are more than ten countries and double-counts orgs in several.
    expect(metrics.totalPartnersCount).toBe(countries.length);
  });
});
