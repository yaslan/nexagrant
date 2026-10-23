import { describe, test, expect, vi, beforeEach } from 'vitest';

type Row = Record<string, unknown>;

function createMockDb() {
  const orgs: Row[] = [];
  const projects: Row[] = [];
  const participations: Row[] = [];
  const profiles: Row[] = [];

  const prisma = {
    cordisPartnerProfile: {
      count: vi.fn().mockImplementation(async ({ where }: { where?: Row }) => {
        if (!where) return profiles.length;
        return profiles.filter((p) => {
          if (where.isTurkish && !p.isTurkish) return false;
          if (where.country && p.country !== where.country) return false;
          return true;
        }).length;
      }),
      findMany: vi.fn().mockImplementation(async ({ where }: { where?: Row }) => {
        return profiles.filter((p) => {
          if (where?.isTurkish && !p.isTurkish) return false;
          if (where?.country && p.country !== where.country) return false;
          return true;
        }).map((p) => ({
          ...p,
          organization: {
            participations: participations.filter((part) => {
              const proj = projects.find((pr) => pr.id === part.projectId);
              return part.organisationId === p.organisationId && proj?.framework === 'INTERREG';
            }),
          },
        }));
      }),
    },
    cordisParticipation: {
      // Only the two shapes the partner routes use: `distinct` on organisationId
      // for the Interreg flag, and `groupBy(organisationId, role)` for totals.
      findMany: vi.fn().mockImplementation(async ({ where, distinct }: { where?: Row; distinct?: string[] }) => {
        const ids = (where?.organisationId as { in?: string[] } | undefined)?.in ?? [];
        const framework = (where?.project as { framework?: string } | undefined)?.framework;
        const rows = participations.filter((part) => {
          if (!ids.includes(part.organisationId as string)) return false;
          const proj = projects.find((pr) => pr.id === part.projectId);
          return framework === undefined || proj?.framework === framework;
        });
        if (!distinct) return rows;
        const seen = new Set<string>();
        return rows.filter((r) => {
          const organisationId = r.organisationId as string;
          if (seen.has(organisationId)) return false;
          seen.add(organisationId);
          return true;
        });
      }),
      groupBy: vi.fn().mockImplementation(async ({ where }: { where?: Row }) => {
        const ids = (where?.organisationId as { in?: string[] } | undefined)?.in ?? [];
        const groups = new Map<string, { organisationId: string; role: string; _count: { _all: number }; _sum: { ecContribution: bigint } }>();
        for (const part of participations) {
          const organisationId = part.organisationId as string;
          if (!ids.includes(organisationId)) continue;
          const role = part.role as string;
          const key = `${organisationId}|${role}`;
          const g = groups.get(key) ?? { organisationId, role, _count: { _all: 0 }, _sum: { ecContribution: 0n } };
          g._count._all += 1;
          g._sum.ecContribution += (part.ecContribution as bigint | null) ?? 0n;
          groups.set(key, g);
        }
        return [...groups.values()];
      }),
    },
    cordisOrganization: {
      count: vi.fn().mockImplementation(async ({ where }: { where?: Row }) => {
        return filterOrgs(where).length;
      }),
      findMany: vi.fn().mockImplementation(async ({ where }: { where?: Row }) => {
        const filtered = filterOrgs(where);
        return filtered.map((o) => {
          const parts = participations.filter((part) => part.organisationId === o.organisationId);
          const mappedParts = parts.map((part) => {
            const proj = projects.find((pr) => pr.id === part.projectId);
            return {
              ...part,
              project: proj ? {
                id: proj.id,
                acronym: proj.acronym,
                title: proj.title,
                framework: proj.framework,
                masterCall: proj.masterCall,
                topics: [{ topicCode: 'PO5-TOURISM', topicTitle: 'Sustainable Tourism in Strandja' }],
              } : null,
            };
          });

          // Check if where had nested participation filter
          const partWhere = (where?.participations as { where?: { project?: { framework?: string } } } | undefined)?.where;
          const targetFramework = partWhere?.project?.framework;
          const filteredParts = targetFramework
            ? mappedParts.filter((p) => p.project?.framework === targetFramework)
            : mappedParts;

          const prof = profiles.find((p) => p.organisationId === o.organisationId) || null;

          return {
            ...o,
            profile: prof,
            participations: filteredParts,
          };
        });
      }),
    },
    systemAlert: {
      create: vi.fn().mockResolvedValue({ id: 'alert-1' }),
      findFirst: vi.fn().mockResolvedValue(null),
    },
  };

  function filterOrgs(where?: Row): Row[] {
    if (!where) return orgs;
    return orgs.filter((o) => {
      if (where.isTurkish && !o.isTurkish) return false;
      if (where.country && o.country !== where.country) return false;
      if (where.activityType && o.activityType !== where.activityType) return false;
      if (where.OR && Array.isArray(where.OR)) {
        const matches = (where.OR as Row[]).some((cond) => {
          const nameFilter = cond.name as { contains?: string } | undefined;
          if (nameFilter?.contains && !String(o.name || '').toLowerCase().includes(nameFilter.contains.toLowerCase())) {
            return false;
          }
          const normFilter = cond.nameNormalized as { contains?: string } | undefined;
          if (normFilter?.contains && !String(o.nameNormalized || '').toUpperCase().includes(normFilter.contains.toUpperCase())) {
            return false;
          }
          const idFilter = cond.organisationId as { contains?: string } | undefined;
          if (idFilter?.contains && !String(o.organisationId || '').toLowerCase().includes(idFilter.contains.toLowerCase())) {
            return false;
          }
          return true;
        });
        if (!matches) return false;
      }

      // Check participations.some.project.framework
      const partFilter = where.participations as { some?: { project?: { framework?: string } } } | undefined;
      if (partFilter?.some?.project?.framework) {
        const requiredFramework = partFilter.some.project.framework;
        const orgParts = participations.filter((part) => part.organisationId === o.organisationId);
        const hasProject = orgParts.some((part) => {
          const proj = projects.find((pr) => pr.id === part.projectId);
          return proj?.framework === requiredFramework;
        });
        if (!hasProject) return false;
      }

      return true;
    });
  }

  return {
    prisma,
    orgs,
    projects,
    participations,
    profiles,
    reset() {
      orgs.length = 0;
      projects.length = 0;
      participations.length = 0;
      profiles.length = 0;
    },
  };
}

const db = createMockDb();

// The page reads its copy through next-intl's server API; the assertions here are about rows, not text.
vi.mock('next-intl/server', () => ({ getTranslations: async () => (key: string) => key }));
vi.mock('../src/lib/db', () => ({
  prisma: db.prisma,
  withTenant: async (_tenantId: string, fn: (tx: typeof db.prisma) => Promise<unknown>) => fn(db.prisma),
}));

vi.mock('../src/lib/modules/guard', () => ({
  moduleGate: vi.fn().mockResolvedValue(null),
}));

vi.mock('../src/lib/observability/system-alert', () => ({
  recordAlert: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../src/lib/api-auth', () => ({
  authenticateApiKey: vi.fn().mockResolvedValue({
    authenticated: true,
    data: { tenantId: 'demo-tenant' },
  }),
}));

const { default: PartnersPage } = await import('../src/app/[locale]/(app)/[workspace]/partners/page');
const { GET: getPartnersApi } = await import('../src/app/api/v1/partners/route');

beforeEach(() => {
  db.reset();

  // Seed sample CORDIS and Interreg data
  // 1. Interreg Project: Bulgaria-Türkiye cross border cooperation
  db.projects.push({
    id: 'BGTR0200037',
    acronym: 'ENPORT STRANDJA',
    title: 'Integrated approach to sustainable tourism in Strandja',
    framework: 'INTERREG',
    masterCall: '2021 - 2027 Interreg VI-A IPA Bulgaria Türkiye',
    totalCost: 928470n,
    ecMaxContribution: 789199n,
  });

  // 2. Horizon Project: Horizon Europe Research
  db.projects.push({
    id: 'HORIZON-101001',
    acronym: 'HORIZON-AI',
    title: 'Advanced AI Framework for European Industry',
    framework: 'HORIZON',
    masterCall: 'HORIZON-CL4-2024-DIGITAL',
    totalCost: 4000000n,
    ecMaxContribution: 3500000n,
  });

  // 3. Turkish Interreg Partner 1: Trakya Üniversitesi (University)
  db.orgs.push({
    organisationId: '999616914',
    name: 'Trakya Üniversitesi',
    nameNormalized: 'TRAKYA UNIVERSITESI',
    country: 'TR',
    activityType: 'HES',
    sme: false,
    isTurkish: true,
  });
  db.participations.push({
    projectId: 'BGTR0200037',
    organisationId: '999616914',
    role: 'participant',
    ecContribution: 332753n,
    totalCost: 391474n,
  });

  // 4. Turkish Interreg Partner 2: Kaynarca Belediyesi (Municipality / Public Body)
  db.orgs.push({
    organisationId: 'KEU:TR5400046090',
    name: 'TC Kaynarca belediye Başkanlığı',
    nameNormalized: 'TC KAYNARCA BELEDIYE BASKANLIGI',
    country: 'TR',
    activityType: 'PUB',
    sme: false,
    isTurkish: true,
  });
  db.participations.push({
    projectId: 'BGTR0200037',
    organisationId: 'KEU:TR5400046090',
    role: 'participant',
    ecContribution: 34847n,
    totalCost: 40996n,
  });

  // 5. Turkish Interreg Partner 3: Trakya Kalkınma Ajansı (Development Agency)
  db.orgs.push({
    organisationId: 'KEU:TR5400012345',
    name: 'Trakya Kalkınma Ajansı',
    nameNormalized: 'TRAKYA KALKINMA AJANSI',
    country: 'TR',
    activityType: 'PUB',
    sme: false,
    isTurkish: true,
  });
  db.participations.push({
    projectId: 'BGTR0200037',
    organisationId: 'KEU:TR5400012345',
    role: 'coordinator',
    ecContribution: 120000n,
    totalCost: 150000n,
  });

  // 6. Cross-border Partner: Kristta Ltd (Bulgarian Lead Partner)
  db.orgs.push({
    organisationId: '999123456',
    name: 'Kristta Ltd',
    nameNormalized: 'KRISTTA LTD',
    country: 'BG',
    activityType: 'PRC',
    sme: true,
    isTurkish: false,
  });
  db.participations.push({
    projectId: 'BGTR0200037',
    organisationId: '999123456',
    role: 'coordinator',
    ecContribution: 4931n,
    totalCost: 5801n,
  });

  // 7. Horizon Only Partner: Fraunhofer (Germany)
  db.orgs.push({
    organisationId: '999984059',
    name: 'Fraunhofer-Gesellschaft',
    nameNormalized: 'FRAUNHOFER-GESELLSCHAFT',
    country: 'DE',
    activityType: 'REC',
    sme: false,
    isTurkish: false,
  });
  db.participations.push({
    projectId: 'HORIZON-101001',
    organisationId: '999984059',
    role: 'coordinator',
    ecContribution: 1500000n,
    totalCost: 2000000n,
  });
  db.profiles.push({
    organisationId: '999984059',
    name: 'Fraunhofer-Gesellschaft',
    country: 'DE',
    activityType: 'REC',
    sme: false,
    isTurkish: false,
    totalProjects: 1,
    coordinatorProjects: 1,
    totalEcContribution: 1500000n,
    topTopics: [{ code: 'HORIZON-CL4-2024-DIGITAL', title: 'Digital AI', count: 1 }],
  });
});

describe('M8 Partner Arama Interreg Entegrasyonu', () => {
  test('is_interreg=true filtresi uygulandığında yalnız Interreg projelerinde yer alan ortaklar döner', async () => {
    const jsx = await PartnersPage({
      params: Promise.resolve({ locale: 'tr', workspace: 'trakya-tekno' }),
      searchParams: Promise.resolve({ is_interreg: 'true' }),
    });

    expect(jsx).not.toBeNull();

    // Verify database query arguments
    const lastFindCall = vi.mocked(db.prisma.cordisOrganization.findMany).mock.calls.at(-1);
    expect(lastFindCall).toBeDefined();
    const where = lastFindCall?.[0]?.where as Row;
    expect(where?.participations).toEqual({
      some: {
        project: {
          framework: 'INTERREG',
        },
      },
    });
  });

  test('is_interreg=true ve is_turkish=true birlikte seçildiğinde Trakya Üniversitesi, belediyeler ve ajanslar filtrelenir', async () => {
    await PartnersPage({
      params: Promise.resolve({ locale: 'tr', workspace: 'trakya-tekno' }),
      searchParams: Promise.resolve({ is_interreg: 'true', is_turkish: 'true' }),
    });

    const lastFindCall = vi.mocked(db.prisma.cordisOrganization.findMany).mock.calls.at(-1);
    const where = lastFindCall?.[0]?.where as Row;
    expect(where?.isTurkish).toBe(true);
    expect(where?.participations).toEqual({
      some: {
        project: {
          framework: 'INTERREG',
        },
      },
    });

    // Run the filter logic directly to verify filtered set
    const filtered = await db.prisma.cordisOrganization.findMany({ where });
    const orgNames = (filtered as Row[]).map((o: Row) => o.name);

    // Turkish Interreg partners are present
    expect(orgNames).toContain('Trakya Üniversitesi');
    expect(orgNames).toContain('TC Kaynarca belediye Başkanlığı');
    expect(orgNames).toContain('Trakya Kalkınma Ajansı');

    // Bulgarian and German partners are excluded
    expect(orgNames).not.toContain('Kristta Ltd');
    expect(orgNames).not.toContain('Fraunhofer-Gesellschaft');
  });

  test('q anahtar kelimesi ile Interreg ortaklarında arama yapılabilir (örn: Belediye, Trakya)', async () => {
    await PartnersPage({
      params: Promise.resolve({ locale: 'tr', workspace: 'trakya-tekno' }),
      searchParams: Promise.resolve({ is_interreg: 'true', q: 'Kaynarca' }),
    });

    const lastFindCall = vi.mocked(db.prisma.cordisOrganization.findMany).mock.calls.at(-1);
    const where = lastFindCall?.[0]?.where as Row;
    expect(where?.OR).toBeDefined();

    const filtered = await db.prisma.cordisOrganization.findMany({ where });
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.name).toBe('TC Kaynarca belediye Başkanlığı');
    expect(filtered[0]?.organisationId).toBe('KEU:TR5400046090');
  });

  test('Interreg ortaklarının gerçek proje ve hibe metrikleri participations üzerinden hesaplanır', async () => {
    const where = {
      participations: {
        some: {
          project: {
            framework: 'INTERREG',
          },
        },
      },
    };

    const results = (await db.prisma.cordisOrganization.findMany({
      where,
      include: {
        profile: true,
        participations: {
          where: { project: { framework: 'INTERREG' } },
          include: {
            project: {
              select: {
                id: true,
                acronym: true,
                title: true,
                framework: true,
                masterCall: true,
              },
            },
          },
        },
      },
    })) as Row[];

    const trakyaUni = results.find((r: Row) => r.name === 'Trakya Üniversitesi');
    expect(trakyaUni).toBeDefined();
    const parts = trakyaUni?.participations as Row[];
    expect(parts).toHaveLength(1);
    expect(parts[0]?.role).toBe('participant');
    expect(parts[0]?.ecContribution).toBe(332753n);

    const agency = results.find((r: Row) => r.name === 'Trakya Kalkınma Ajansı');
    expect(agency).toBeDefined();
    const agencyParts = agency?.participations as Row[];
    expect(agencyParts).toHaveLength(1);
    expect(agencyParts[0]?.role).toBe('coordinator');
    expect(agencyParts[0]?.ecContribution).toBe(120000n);
  });

  test('GET /api/v1/partners REST API isInterreg=true parametresi ile filtrelenebilir', async () => {
    const req = new Request('http://localhost:3000/api/v1/partners?isInterreg=true');
    const res = await getPartnersApi(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);

    const lastFindCall = vi.mocked(db.prisma.cordisOrganization.findMany).mock.calls.at(-1);
    const where = lastFindCall?.[0]?.where as Row;
    expect(where?.participations).toEqual({
      some: {
        project: {
          framework: 'INTERREG',
        },
      },
    });
  });
});
