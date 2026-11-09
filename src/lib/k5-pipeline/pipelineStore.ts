import { withTenant } from '@/lib/db';
import type { OppStatus } from '@prisma/client';

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
  status: OppStatus;
  /**
   * `null` until the canonical scorer has evidence to work from. Nullable on purpose: the previous
   * non-null type is what pushed callers into inventing a placeholder number to satisfy it.
   */
  g0Score: number | null;
  /**
   * Outcome of the latest G0 gate decision on file: `true` passed, `false` refused, `null` none.
   * The board colours the score badge from this, never from the number alone (NG-69).
   */
  g0Passed?: boolean | null;
  notes?: string | null;
  notesList?: NoteEntry[];
  createdAt: Date;
  updatedAt: Date;
}

export interface WorkspaceMember {
  id: string;
  name: string;
  role: string;
  avatar: string;
}

const ROLE_LABELS: Record<string, string> = {
  TENANT_OWNER: 'Kiracı Sahibi',
  TENANT_ADMIN: 'Kiracı Yöneticisi',
  PIPELINE_MANAGER: 'Pipeline Yöneticisi',
  WRITER: 'Yazar',
  MEMBER: 'Üye',
  GUEST_PARTNER: 'Misafir Ortak',
};

/** Exactly the `Membership` columns this module reads (see the `select` below). */
interface MembershipRow {
  userId: string;
  role: string;
  user: { name: string | null; email: string };
}

/**
 * The tenant's real, DB-backed members — the people a pipeline card can
 * actually be assigned to.
 *
 * This replaces a literal five-name array (`usr-1..5`, "Ahmet Yılmaz" etc.)
 * that was never wired to a real account: assigning a card to it wrote an id
 * no session, login or `Membership` row could ever match. `Membership` carries
 * row-level security (prisma/rls.sql), so the read goes through `withTenant`
 * rather than a bare `prisma.membership.findMany`.
 */
export async function getWorkspaceMembers(tenantId: string): Promise<WorkspaceMember[]> {
  if (!tenantId) throw new Error('getWorkspaceMembers requires a tenantId');

  // `withTenant<T>` is given its type argument explicitly: TypeScript cannot
  // infer T from the callback here (the same reason every other call site in
  // the repo annotates its destination, e.g. pipeline/page.tsx), and leaving it
  // to inference yields `unknown` — which is what the `implicit any` on the map
  // below came from. `select` keeps the row shape exactly `MembershipRow`.
  const memberships = await withTenant<MembershipRow[]>(tenantId, (tx) =>
    tx.membership.findMany({
      where: { tenantId, user: { deletedAt: null } },
      select: { userId: true, role: true, user: { select: { name: true, email: true } } },
      orderBy: { createdAt: 'asc' },
    })
  );

  return memberships.map((m) => {
    const name = m.user.name || m.user.email;
    return {
      id: m.userId,
      name,
      role: ROLE_LABELS[m.role] ?? m.role,
      avatar: name.charAt(0).toUpperCase(),
    };
  });
}

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

/**
 * Writes back the G0 score once `rescoreOpportunityG0` has derived it, so the buffered row shows
 * the same number as the database row rather than staying unscored until the next page load.
 */
export function updateInMemoryOpportunityScore(tenantId: string, id: string, g0Score: number | null): boolean {
  const found = findScoped(tenantId, id);
  if (!found) return false;
  found.g0Score = g0Score;
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
