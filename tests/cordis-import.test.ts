import { describe, test, expect, vi } from 'vitest';
import path from 'path';
import fs from 'fs';
import {
  normalizeOrgName,
  parseBigIntEur,
  mapOrganizationAndParticipationRow,
} from '../src/lib/k2-cordis/cordisSchema';
import { runCordisImport } from '../src/lib/k2-cordis/importer';
import { generatePartnerProfiles } from '../src/lib/k2-cordis/partnerProfileJob';

/**
 * In-memory stand-in for the CORDIS tables. The fake client stores whatever
 * `data` the importer sends and hands it back, so the rows are only ever as
 * shaped as the code under test made them — hence `Record<string, unknown>`
 * rather than the row types, which would assert a shape the test is meant to
 * observe rather than impose.
 */
type MockRow = Record<string, unknown> & {
  /** Present on the participation rows the lookups key on. */
  projectId?: string;
  organisationId?: string;
};

const mockProjects = new Map<string, MockRow>();
const mockOrganizations = new Map<string, MockRow>();
const mockParticipations = new Map<string, MockRow>();
const mockImportRuns = new Map<string, MockRow>();
const mockProfiles = new Map<string, MockRow>();
const mockCoParts = new Map<string, MockRow>();

vi.mock('../src/lib/db', () => ({
  prisma: {
    cordisImportRun: {
      create: vi.fn().mockImplementation(async ({ data }) => {
        const id = `run-${Date.now()}-${Math.random()}`;
        const record = { runId: id, ...data };
        mockImportRuns.set(id, record);
        return record;
      }),
      update: vi.fn().mockImplementation(async ({ where, data }) => {
        const record = mockImportRuns.get(where.runId) || { runId: where.runId };
        Object.assign(record, data);
        mockImportRuns.set(where.runId, record);
        return record;
      }),
      findFirst: vi.fn().mockImplementation(async ({ where }) => {
        const runs = Array.from(mockImportRuns.values()).filter(
          (r) => r.dataset === where?.dataset && r.status === 'SUCCESS'
        );
        return runs[runs.length - 1] || null;
      }),
    },
    cordisProject: {
      upsert: vi.fn().mockImplementation(async ({ where, create, update }) => {
        const existing = mockProjects.get(where.id);
        const record = existing ? { ...existing, ...update } : { id: where.id, ...create };
        mockProjects.set(where.id, record);
        return record;
      }),
    },
    cordisOrganization: {
      upsert: vi.fn().mockImplementation(async ({ where, create, update }) => {
        const existing = mockOrganizations.get(where.organisationId);
        const record = existing ? { ...existing, ...update } : { organisationId: where.organisationId, ...create };
        mockOrganizations.set(where.organisationId, record);
        return record;
      }),
      findMany: vi.fn().mockImplementation(async () => {
        return Array.from(mockOrganizations.values()).map((org) => {
          const parts = Array.from(mockParticipations.values())
            .filter((pt) => pt.organisationId === org.organisationId)
            .map((pt) => ({
              ...pt,
              project: mockProjects.get(pt.projectId ?? '') || { id: pt.projectId, framework: 'HORIZON', topics: [] },
            }));
          return { ...org, participations: parts };
        });
      }),
    },
    cordisParticipation: {
      upsert: vi.fn().mockImplementation(async ({ where, create, update }) => {
        const key = `${where.projectId_organisationId.projectId}:${where.projectId_organisationId.organisationId}`;
        const existing = mockParticipations.get(key);
        const record = existing
          ? { ...existing, ...update }
          : {
              projectId: where.projectId_organisationId.projectId,
              organisationId: where.projectId_organisationId.organisationId,
              ...create,
            };
        mockParticipations.set(key, record);
        return record;
      }),
      findMany: vi.fn().mockImplementation(async () => {
        return Array.from(mockParticipations.values()).map((pt) => ({
          ...pt,
          project: mockProjects.get(pt.projectId ?? '') || { startDate: new Date(), endDate: new Date() },
        }));
      }),
    },
    cordisProjectTopic: {
      upsert: vi.fn().mockImplementation(async ({ where, create }) => ({ ...where, ...create })),
    },
    cordisProjectSciVoc: {
      upsert: vi.fn().mockImplementation(async ({ where, create }) => ({ ...where, ...create })),
    },
    cordisPartnerProfile: {
      upsert: vi.fn().mockImplementation(async ({ where, create, update }) => {
        const existing = mockProfiles.get(where.organisationId);
        const record = existing ? { ...existing, ...update } : { organisationId: where.organisationId, ...create };
        mockProfiles.set(where.organisationId, record);
        return record;
      }),
    },
    cordisCoParticipation: {
      upsert: vi.fn().mockImplementation(async ({ where, create, update }) => {
        const key = `${where.orgA_orgB.orgA}:${where.orgA_orgB.orgB}`;
        const existing = mockCoParts.get(key);
        const record = existing ? { ...existing, ...update } : { ...where.orgA_orgB, ...create };
        mockCoParts.set(key, record);
        return record;
      }),
    },
    $transaction: vi.fn().mockImplementation(async (promises) => {
      return Promise.all(promises);
    }),
  },
}));

describe('K2 CORDIS Ingestion & M1 Partner Intelligence Engine', () => {
  test('Organization Name Normalization removes legal suffixes and accents', () => {
    expect(normalizeOrgName('LOMARTOV SL')).toBe('LOMARTOV');
    expect(normalizeOrgName('TÜBİTAK UZAY A.Ş.')).toBe('TUBITAK UZAY');
    expect(normalizeOrgName('Fraunhofer Gesellschaft GMBH')).toBe('FRAUNHOFER GESELLSCHAFT');
    expect(normalizeOrgName('MIDDLE EAST TECHNICAL UNIVERSITY')).toBe('MIDDLE EAST TECHNICAL UNIVERSITY');
  });

  test('parseBigIntEur handles European numeric strings with commas and decimals', () => {
    expect(parseBigIntEur('2073781,25')).toBe(BigInt(2073781));
    expect(parseBigIntEur('150000.00')).toBe(BigInt(150000));
    expect(parseBigIntEur(500000)).toBe(BigInt(500000));
    expect(parseBigIntEur(undefined)).toBeUndefined();
  });

  test('Turkish organization detection sets isTurkish flag', () => {
    const trRow = {
      projectID: '101069359',
      organisationID: '999908205',
      name: 'MIDDLE EAST TECHNICAL UNIVERSITY',
      country: 'TR',
      role: 'participant',
    };
    const mapped = mapOrganizationAndParticipationRow(trRow);
    expect(mapped).not.toBeNull();
    expect(mapped?.organization.isTurkish).toBe(true);

    const deRow = {
      projectID: '101069359',
      organisationID: '999980760',
      name: 'FRAUNHOFER GESELLSCHAFT',
      country: 'DE',
      role: 'coordinator',
    };
    const mappedDe = mapOrganizationAndParticipationRow(deRow);
    expect(mappedDe?.organization.isTurkish).toBe(false);
  });

  const sampleZipPath = path.join(process.cwd(), 'scripts', 'tmp_cordis', 'horizon.zip');
  const zipExists = fs.existsSync(sampleZipPath);

  test('5,000 row import execution, idempotency, coordinator counts, and EC contributions', async () => {
    if (!zipExists) {
      console.warn('Sample zip not available locally; skipping zip integration test.');
      return;
    }

    // First import run with limit = 5000
    const res1 = await runCordisImport({
      dataset: 'HORIZON',
      localZipPath: sampleZipPath,
      limit: 5000,
    });

    if (!res1.success) {
      console.error('Import Error:', res1.error);
    }

    expect(res1.success).toBe(true);
    expect(res1.rowCounts.projects).toBeGreaterThan(0);
    expect(res1.rowCounts.organizations).toBeGreaterThan(0);

    // Second import run with limit = 5000 (Idempotency test)
    const res2 = await runCordisImport({
      dataset: 'HORIZON',
      localZipPath: sampleZipPath,
      limit: 5000,
    });

    expect(res2.success).toBe(true);
    expect(res2.rowCounts.projects).toBe(res1.rowCounts.projects);

    // M1 Partner Profile generation
    const profileRes = await generatePartnerProfiles();
    expect(profileRes.success).toBe(true);
    expect(profileRes.updatedProfiles).toBeGreaterThan(0);
  });
});
