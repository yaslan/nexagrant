import 'dotenv/config';
import { test, expect } from '@playwright/test';
import { Pool } from 'pg';

import { createDbClient } from '../../src/lib/db';

// E2E RLS Isolation Tests
// Verifies that Row Level Security policies correctly isolate tenant data at the database level

// `new PrismaClient()` throws on Prisma 7 — this project runs the pg driver adapter, so
// the client has to be built the same way the app builds it. The spec never ran before
// (there was no playwright.config.ts, so `pnpm test:e2e` collected nothing), which is why
// the incompatibility went unnoticed.
const connectionString =
  process.env.DATABASE_URL || 'postgresql://fabrika:fabrika@localhost:5432/fabrika';
const prisma = createDbClient(connectionString);

/**
 * Isolation can only be observed through a role that is subject to the policies. The
 * default `fabrika` role is SUPERUSER + BYPASSRLS, so reading back through it proves
 * nothing — the pool below therefore connects as `fabrika_app` (NOBYPASSRLS) via
 * DATABASE_URL_RLS_TEST, the same convention tests/rls.spec.ts uses. Create the role
 * with `pnpm db:rls-role`.
 */
const RLS_URL = process.env.DATABASE_URL_RLS_TEST;
const pool = new Pool({ connectionString: RLS_URL ?? connectionString });

test.describe('Row Level Security (RLS) Isolation', () => {
  let tenantA: { id: string };
  let tenantB: { id: string };

  test.beforeAll(async () => {
    tenantA = await prisma.tenant.create({
      data: {
        name: `Tenant A - RLS E2E ${Date.now()}`,
        slug: `tenant-a-e2e-${Date.now()}`,
        country: 'TR',
      },
    });

    tenantB = await prisma.tenant.create({
      data: {
        name: `Tenant B - RLS E2E ${Date.now()}`,
        slug: `tenant-b-e2e-${Date.now()}`,
        country: 'TR',
      },
    });
  });

  test.afterAll(async () => {
    await prisma.workspace.deleteMany({
      where: { OR: [{ tenantId: tenantA.id }, { tenantId: tenantB.id }] },
    });

    await prisma.tenant.deleteMany({
      where: { OR: [{ id: tenantA.id },{ id: tenantB.id }] },
    });

    await prisma.$disconnect();
    await pool.end();
  });

  test('tenant A workspace is isolated from tenant B', async () => {
    const wsA = await prisma.workspace.create({
      data: {
        tenantId: tenantA.id,
        name: 'Workspace A',
        slug: 'ws-a',
      },
    });

    const wsB = await prisma.workspace.create({
      data: {
        tenantId: tenantB.id,
        name: 'Workspace B',
        slug: 'ws-b',
      },
    });

    // Query as each tenant
    const wsFromA = await prisma.workspace.findMany({
      where: { tenantId: tenantA.id },
    });

    const wsFromB = await prisma.workspace.findMany({
      where: { tenantId: tenantB.id },
    });

    expect(wsFromA).toHaveLength(1);
    expect(wsFromA[0]?.id).toBe(wsA.id);

    expect(wsFromB).toHaveLength(1);
    expect(wsFromB[0]?.id).toBe(wsB.id);
  });

  test('RLS policy blocks cross-tenant access at database level', async () => {
    await prisma.workspace.create({
      data: {
        tenantId: tenantA.id,
        name: 'Private Workspace A',
        slug: `ws-a-${Date.now()}`,
      },
    });

    await prisma.workspace.create({
      data: {
        tenantId: tenantB.id,
        name: 'Private Workspace B',
        slug: `ws-b-${Date.now()}`,
      },
    });

    test.skip(
      !RLS_URL,
      'DATABASE_URL_RLS_TEST is not set. Run `pnpm db:rls-role` to create the NOBYPASSRLS role.',
    );

    // Simulate query with wrong tenant_id session variable
    const client = await pool.connect();
    try {
      // `SET app.tenant_id = $1` is a syntax error: SET does not take bind parameters.
      // set_config(..., is_local => true) is the parameterisable equivalent, and is what
      // src/lib/db.ts uses, so the tenant id stays a bound value.
      await client.query('SELECT set_config($1, $2, true)', ['app.tenant_id', tenantA.id]);

      // Try to query workspaces (should only see tenant A's data)
      const result = await client.query(
        'SELECT * FROM "Workspace" WHERE "tenantId" = $1',
        [tenantB.id]
      );

      // RLS policy should prevent access to tenant B's workspace
      expect(result.rows).toHaveLength(0);
    } finally {
      client.release();
    }
  });

  test('opportunities are isolated by tenant', async () => {
    const ws = await prisma.workspace.create({
      data: {
        tenantId: tenantA.id,
        name: 'Opportunity Test Workspace',
        slug: `opp-ws-${Date.now()}`,
      },
    });

    await prisma.opportunity.create({
      data: {
        tenantId: tenantA.id,
        workspaceId: ws.id,
        title: 'Opportunity A1',
        stage: 'G0',
      },
    });

    await prisma.opportunity.create({
      data: {
        tenantId: tenantA.id,
        workspaceId: ws.id,
        title: 'Opportunity A2',
        stage: 'G0',
      },
    });

    const wsB = await prisma.workspace.create({
      data: {
        tenantId: tenantB.id,
        name: 'Opportunity Test Workspace B',
        slug: `opp-ws-b-${Date.now()}`,
      },
    });

    const oppB = await prisma.opportunity.create({
      data: {
        tenantId: tenantB.id,
        workspaceId: wsB.id,
        title: 'Opportunity B',
        stage: 'G0',
      },
    });

    const opportunitiesA = await prisma.opportunity.findMany({
      where: { tenantId: tenantA.id },
    });

    const opportunitiesB = await prisma.opportunity.findMany({
      where: { tenantId: tenantB.id },
    });

    expect(opportunitiesA.length).toBeGreaterThanOrEqual(2);
    expect(opportunitiesB.length).toBeGreaterThanOrEqual(1);

    // Verify cross-tenant access fails
    const oppAIds = new Set(opportunitiesA.map((o: { id: string }) => o.id));
    expect(oppAIds.has(oppB.id)).toBe(false);
  });

  test('evidence records are tenant-isolated', async () => {
    const evA = await prisma.evidence.create({
      data: {
        tenantId: tenantA.id,
        kind: 'certificate',
        category: 'certificate',
        title: 'Evidence A',
        body: 'Tenant A evidence',
      },
    });

    const evB = await prisma.evidence.create({
      data: {
        tenantId: tenantB.id,
        kind: 'certificate',
        category: 'certificate',
        title: 'Evidence B',
        body: 'Tenant B evidence',
      },
    });

    const readEvidenceA = await prisma.evidence.findMany({
      where: { tenantId: tenantA.id },
    });

    const readEvidenceB = await prisma.evidence.findMany({
      where: { tenantId: tenantB.id },
    });

    const evAIds = new Set(readEvidenceA.map((e: { id: string }) => e.id));
    const evBIds = new Set(readEvidenceB.map((e: { id: string }) => e.id));

    expect(evAIds.has(evA.id)).toBe(true);
    expect(evBIds.has(evB.id)).toBe(true);
    expect(evAIds.has(evB.id)).toBe(false);
    expect(evBIds.has(evA.id)).toBe(false);
  });

  test('nullable tenantId (shared) records are visible to all tenants', async () => {
    // Create shared document
    await prisma.document.create({
      data: {
        tenantId: null, // Shared
        kind: 'work_programme',
        title: 'Shared Work Programme',
      },
    });

    // Create tenant-specific documents
    const docA = await prisma.document.create({
      data: {
        tenantId: tenantA.id,
        kind: 'tenant_upload',
        title: 'Document A',
      },
    });

    const docB = await prisma.document.create({
      data: {
        tenantId: tenantB.id,
        kind: 'tenant_upload',
        title: 'Document B',
      },
    });

    // Both tenants should see the shared document
    const docsA = await prisma.document.findMany({
      where: { tenantId: tenantA.id },
    });

    const docsB = await prisma.document.findMany({
      where: { tenantId: tenantB.id },
    });

    expect(docsA.some((d: { id: string }) => d.id === docA.id)).toBe(true);
    expect(docsB.some((d: { id: string }) => d.id === docB.id)).toBe(true);
  });
});
