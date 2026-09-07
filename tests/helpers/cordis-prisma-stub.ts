/**
 * An in-memory stand-in for the Prisma client, for the CORDIS ingestion tests.
 *
 * A plain `vi.fn()` mock cannot answer the question these tests exist to ask —
 * "does running the same record twice leave one row or two?" — because it has
 * no notion of a primary key. Worse, that is exactly how the bug this replaces
 * survived: the old tests mocked `prisma.organization.upsert`, a delegate that
 * does not exist on the real client, so they passed green against a call that
 * threw a TypeError in production.
 *
 * So this stub keys every table by its real primary key and implements `upsert`
 * with real upsert semantics. It deliberately exposes only the delegates
 * prisma/schema.prisma actually declares: `stub.prisma.organization` is
 * `undefined`, and a test asserts that.
 */

type Row = Record<string, unknown>;

/** Tables the CORDIS ingestion path touches, keyed by their real primary key. */
export type CordisTable =
  | 'cordisProject'
  | 'cordisOrganization'
  | 'cordisParticipation'
  | 'cordisProjectTopic'
  | 'cordisImportRun'
  | 'systemAlert'
  | 'document';

export interface CordisPrismaStub {
  /** Passed to `vi.mock('../src/lib/db', () => ({ prisma: stub.prisma }))`. */
  prisma: Record<string, unknown>;
  rows(table: CordisTable): Row[];
  clear(table: CordisTable): void;
  reset(): void;
}

export function createCordisPrismaStub(): CordisPrismaStub {
  const store = new Map<CordisTable, Map<string, Row>>();
  let sequence = 0;

  const table = (name: CordisTable): Map<string, Row> => {
    let t = store.get(name);
    if (!t) {
      t = new Map();
      store.set(name, t);
    }
    return t;
  };

  const rows = (name: CordisTable): Row[] => [...table(name).values()];

  /** Real upsert semantics: insert under `key`, or merge `update` into the existing row. */
  const upsertInto = (name: CordisTable, key: string, create: Row, update: Row): Row => {
    const t = table(name);
    const existing = t.get(key);
    const row = existing
      ? { ...existing, ...update }
      : { ...create, importedAt: new Date(Date.now() + sequence++) };
    t.set(key, row);
    return row;
  };

  const asString = (value: unknown): string => String(value ?? '');

  const delegate = (name: CordisTable, keyOf: (where: Row) => string) => ({
    upsert: async (args: { where: Row; create?: Row; update?: Row }): Promise<Row> =>
      upsertInto(name, keyOf(args.where), args.create ?? {}, args.update ?? {}),
    count: async (): Promise<number> => rows(name).length,
  });

  const prisma: Record<string, unknown> = {
    cordisProject: {
      ...delegate('cordisProject', (where) => asString(where.id)),

      aggregate: async (): Promise<{ _sum: { ecMaxContribution: bigint | null } }> => {
        const values = rows('cordisProject')
          .map((r) => r.ecMaxContribution)
          .filter((v): v is bigint => typeof v === 'bigint');
        return {
          _sum: {
            ecMaxContribution: values.length
              ? values.reduce((a, b) => a + b, 0n)
              : null,
          },
        };
      },

      findFirst: async (): Promise<Row | null> => {
        const sorted = [...rows('cordisProject')].sort(byImportedAtDesc);
        return sorted[0] ?? null;
      },

      findMany: async (args: { take?: number } = {}): Promise<Row[]> => {
        const projects = [...rows('cordisProject')].sort(byImportedAtDesc);
        const limited = args.take ? projects.slice(0, args.take) : projects;

        // Mirrors `include: { topics: take 1, participations: where coordinator, take 1, include organization }`.
        return limited.map((project) => ({
          ...project,
          topics: rows('cordisProjectTopic')
            .filter((t) => t.projectId === project.id)
            .slice(0, 1),
          participations: rows('cordisParticipation')
            .filter((p) => p.projectId === project.id && p.role === 'coordinator')
            .slice(0, 1)
            .map((p) => ({
              ...p,
              organization:
                table('cordisOrganization').get(asString(p.organisationId)) ?? null,
            })),
        }));
      },
    },

    cordisOrganization: delegate('cordisOrganization', (where) =>
      asString(where.organisationId)
    ),

    cordisParticipation: delegate('cordisParticipation', (where) => {
      const key = where.projectId_organisationId as Row | undefined;
      return `${asString(key?.projectId)}::${asString(key?.organisationId)}`;
    }),

    cordisProjectTopic: delegate('cordisProjectTopic', (where) => {
      const key = where.projectId_topicCode as Row | undefined;
      return `${asString(key?.projectId)}::${asString(key?.topicCode)}`;
    }),

    cordisImportRun: {
      findFirst: async (): Promise<Row | null> =>
        rows('cordisImportRun').find((r) => r.finishedAt != null) ?? null,
      findMany: async (args: { take?: number } = {}): Promise<Row[]> => {
        const runs = rows('cordisImportRun');
        return args.take ? runs.slice(0, args.take) : runs;
      },
      count: async (): Promise<number> => rows('cordisImportRun').length,
    },

    systemAlert: {
      create: async (args: { data: Row }): Promise<{ id: string }> => {
        const id = `alert-${sequence++}`;
        table('systemAlert').set(id, { id, ...args.data });
        return { id };
      },
    },

    document: {
      create: async (args: { data: Row }): Promise<{ id: string }> => {
        const id = `doc-${sequence++}`;
        table('document').set(id, { id, ...args.data });
        return { id };
      },
    },

    /**
     * The only raw query the CORDIS path issues is the country breakdown in
     * `aggregateCordisMetrics`. It is answered from the same in-memory rows, so
     * the assertion still tracks what was written rather than a canned reply.
     */
    $queryRaw: async (): Promise<Array<{ country: string; projectCount: bigint; totalGrantEUR: bigint }>> => {
      const byCountry = new Map<string, { projects: Set<string>; grant: bigint }>();

      for (const participation of rows('cordisParticipation')) {
        const org = table('cordisOrganization').get(asString(participation.organisationId));
        const country = typeof org?.country === 'string' ? org.country : null;
        if (!country) continue;

        const entry = byCountry.get(country) ?? { projects: new Set<string>(), grant: 0n };
        entry.projects.add(asString(participation.projectId));
        if (typeof participation.ecContribution === 'bigint') {
          entry.grant += participation.ecContribution;
        }
        byCountry.set(country, entry);
      }

      return [...byCountry.entries()]
        .map(([country, entry]) => ({
          country,
          projectCount: BigInt(entry.projects.size),
          totalGrantEUR: entry.grant,
        }))
        .sort((a, b) => Number(b.projectCount - a.projectCount))
        .slice(0, 10);
    },

    $executeRawUnsafe: async (): Promise<number> => 1,

    $queryRawUnsafe: async (): Promise<Array<Row>> => [
      { text: 'Mock CORDIS project chunk text', documentId: 'doc-rag-1', score: 0.92 },
    ],
  };

  return {
    prisma,
    rows,
    clear: (name) => table(name).clear(),
    reset: () => {
      store.clear();
      sequence = 0;
    },
  };
}

function byImportedAtDesc(a: Row, b: Row): number {
  const at = a.importedAt instanceof Date ? a.importedAt.getTime() : 0;
  const bt = b.importedAt instanceof Date ? b.importedAt.getTime() : 0;
  return bt - at;
}
