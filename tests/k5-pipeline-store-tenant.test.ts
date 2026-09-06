import { describe, it, expect, beforeEach } from 'vitest';
import {
  addInMemoryOpportunity,
  getInMemoryOpportunities,
  updateInMemoryOpportunityStage,
  updateInMemoryOpportunityOwner,
  addInMemoryOpportunityNote,
  type OpportunityItem,
} from '../src/lib/k5-pipeline/pipelineStore';

/**
 * The pipeline store is a process-global resilience fallback shared by every
 * request the server handles, so "in-memory" is not the same as "private".
 * These tests pin the tenant boundary: reads see only their own tenant, and a
 * write against another tenant's id is refused rather than silently applied.
 */
const globalStore = globalThis as unknown as {
  inMemoryOpportunities: OpportunityItem[] | undefined;
};

const TENANT_A = 'tenant-a';
const TENANT_B = 'tenant-b';

function opp(id: string, tenantId: string): OpportunityItem {
  return {
    id,
    tenantId,
    workspaceId: 'default',
    title: `Opportunity ${id}`,
    stage: 'G0',
    status: 'ACTIVE',
    g0Score: 80,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe('pipeline store tenant scoping', () => {
  beforeEach(() => {
    // The store lives on globalThis; reset it so each test starts from a
    // known set of rows rather than from the demo seed.
    globalStore.inMemoryOpportunities = [];
    addInMemoryOpportunity(opp('opp-a', TENANT_A));
    addInMemoryOpportunity(opp('opp-b', TENANT_B));
  });

  it('returns only the rows of the tenant that asked', () => {
    expect(getInMemoryOpportunities(TENANT_A).map((o) => o.id)).toEqual(['opp-a']);
    expect(getInMemoryOpportunities(TENANT_B).map((o) => o.id)).toEqual(['opp-b']);
  });

  it('returns nothing for a tenant with no rows', () => {
    expect(getInMemoryOpportunities('tenant-with-nothing')).toEqual([]);
  });

  it('refuses a stage move against another tenant’s opportunity', () => {
    expect(updateInMemoryOpportunityStage(TENANT_A, 'opp-b', 'G3')).toBe(false);
    expect(getInMemoryOpportunities(TENANT_B)[0]?.stage).toBe('G0');

    expect(updateInMemoryOpportunityStage(TENANT_B, 'opp-b', 'G3')).toBe(true);
    expect(getInMemoryOpportunities(TENANT_B)[0]?.stage).toBe('G3');
  });

  it('refuses an owner change against another tenant’s opportunity', () => {
    expect(updateInMemoryOpportunityOwner(TENANT_A, 'opp-b', 'usr-9', 'Someone Else')).toBe(false);
    expect(getInMemoryOpportunities(TENANT_B)[0]?.ownerId).toBeUndefined();
  });

  it('refuses a note written onto another tenant’s opportunity', () => {
    const note = {
      id: 'note-1',
      text: 'leaked',
      authorName: 'A',
      authorAvatar: '👤',
      createdAt: '01.01.2026 00:00',
    };
    expect(addInMemoryOpportunityNote(TENANT_A, 'opp-b', note)).toBe(false);
    expect(getInMemoryOpportunities(TENANT_B)[0]?.notesList).toEqual([]);
  });
});
