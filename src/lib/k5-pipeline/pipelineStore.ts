// Resilient In-Memory Store for K5 Pipeline & Opportunity Management

export interface NoteEntry {
  id: string;
  text: string;
  authorName: string;
  authorAvatar: string;
  createdAt: string;
}

export interface OpportunityItem {
  id: string;
  tenantId: string;
  workspaceId: string;
  title: string;
  topicId?: string | null;
  intendedRole?: string | null;
  ownerId?: string | null;
  ownerName?: string | null;
  stage: 'G0' | 'G1' | 'G2' | 'G3' | 'G4';
  status: 'ACTIVE' | 'WITHDRAWN' | 'SUBMITTED' | 'FUNDED' | 'REJECTED';
  g0Score: number;
  notes?: string | null;
  notesList?: NoteEntry[];
  createdAt: Date;
  updatedAt: Date;
}

export const WORKSPACE_MEMBERS = [
  { id: 'usr-1', name: 'Ahmet Yılmaz', role: 'Pipeline Manager', avatar: '👨‍💼' },
  { id: 'usr-2', name: 'Ayşe Kaya', role: 'Kıdemli Yazar', avatar: '👩‍💻' },
  { id: 'usr-3', name: 'Mehmet Demir', role: 'Proje Ofisi Yöneticisi', avatar: '👨‍🔬' },
  { id: 'usr-4', name: 'Zeynep Şahin', role: 'Ar-Ge Uzmanı', avatar: '👩‍🔬' },
  { id: 'usr-5', name: 'Can Öztürk', role: 'Konsorsiyum Danışmanı', avatar: '👨‍💼' },
];

/**
 * The store starts empty on purpose.
 *
 * It used to ship six fabricated opportunities pinned to `tenantId:
 * 'demo-tenant'` — a real seeded row. That put demo fixtures inside product
 * code: every server process handed the demo tenant a board of invented rows,
 * including invented G0 scores, which CLAUDE.md §7 forbids (a number shown to a
 * user must come from an Evidence/TopicStat record, not from a literal). Demo
 * data belongs to `prisma/seed-opportunities.ts`, which already seeds the same
 * tenant from the database.
 *
 * What is left here is only what the name says: a process-local buffer that
 * keeps a just-created opportunity visible when the database write fails.
 */

const globalStore = globalThis as unknown as {
  inMemoryOpportunities: OpportunityItem[] | undefined;
};

globalStore.inMemoryOpportunities ??= [];

/**
 * Every accessor is tenant-scoped on purpose.
 *
 * This store is a resilience fallback that survives a database outage, but it is
 * still tenant data: it is process-global and shared by every request the server
 * handles. Handing the whole array to a caller (the previous
 * `getInMemoryOpportunities()` with no arguments) leaked one tenant's pipeline
 * into another tenant's board, and the mutators keyed on `id` alone let a
 * guessed id move or annotate a row belonging to someone else. So reads filter
 * by `tenantId` and writes must match both `id` and `tenantId`.
 */
export function getInMemoryOpportunities(tenantId: string): OpportunityItem[] {
  return store().filter((o) => o.tenantId === tenantId);
}

function store(): OpportunityItem[] {
  globalStore.inMemoryOpportunities ??= [];
  return globalStore.inMemoryOpportunities;
}

/** Finds a row inside the caller's tenant, or undefined — never across tenants. */
function findScoped(tenantId: string, id: string): OpportunityItem | undefined {
  return store().find((o) => o.id === id && o.tenantId === tenantId);
}

/**
 * The tenant is a separate, required argument rather than a field on `opp`, so
 * a caller cannot file a row under a tenant it does not hold: the id written to
 * the store is always the one the caller proved, never one that travelled in
 * with the payload.
 */
export function addInMemoryOpportunity(
  tenantId: string,
  opp: Omit<OpportunityItem, 'tenantId'>
): OpportunityItem {
  if (!tenantId) throw new Error('addInMemoryOpportunity requires a tenantId');
  const row: OpportunityItem = { ...opp, tenantId, notesList: opp.notesList ?? [] };
  store().unshift(row);
  return row;
}

export function updateInMemoryOpportunityStage(
  tenantId: string,
  id: string,
  stage: 'G0' | 'G1' | 'G2' | 'G3' | 'G4'
): boolean {
  const found = findScoped(tenantId, id);
  if (!found) return false;
  found.stage = stage;
  found.updatedAt = new Date();
  return true;
}

export function updateInMemoryOpportunityOwner(
  tenantId: string,
  id: string,
  ownerId: string,
  ownerName: string
): boolean {
  const found = findScoped(tenantId, id);
  if (!found) return false;
  found.ownerId = ownerId;
  found.ownerName = ownerName;
  found.updatedAt = new Date();
  return true;
}

export function addInMemoryOpportunityNote(tenantId: string, id: string, note: NoteEntry): boolean {
  const found = findScoped(tenantId, id);
  if (!found) return false;
  if (!found.notesList) found.notesList = [];
  found.notesList.push(note);
  found.updatedAt = new Date();
  return true;
}
