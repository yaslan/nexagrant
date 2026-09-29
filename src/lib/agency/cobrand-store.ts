/**
 * FB KAMU B4 (TASK-MULRRNIHVZM1Z) — reads and writes of the co-brand entry.
 * Rules and decoding are in ./cobrand.ts; this file only touches the database
 * and storage.
 *
 * Direction of data: the agency writes its own entry; a linked organisation's
 * shell reads its agency's entry. Nothing flows the other way — rendering the
 * logo for an organisation records nothing and tells the agency nothing.
 */
import { randomUUID } from 'node:crypto';
import { prisma } from '@/lib/db';
import { deleteObjectBytes, putObjectBytes } from '@/lib/storage';
import { COBRAND_KEY, readCoBrand, type CoBrandSettings } from './cobrand';

/** What the app shell needs: whose line to print, and whether there is a logo to fetch. */
export interface ShellCoBrand {
  name: string;
  /** Same-origin URL of the logo, cache-busted by the entry's timestamp; null = text only. */
  logoSrc: string | null;
}

export const COBRAND_LOGO_PATH = '/api/agency/cobrand-logo';

function settingsObject(settings: unknown): Record<string, unknown> {
  return settings && typeof settings === 'object' && !Array.isArray(settings)
    ? (settings as Record<string, unknown>)
    : {};
}

/** The agency's own entry, for its dashboard. Null for a tenant that is not a live agency. */
export async function getAgencyCoBrand(agencyId: string): Promise<{ entry: CoBrandSettings | null; tenantName: string } | null> {
  const t = await prisma.tenant.findUnique({
    where: { id: agencyId },
    select: { kind: true, deletedAt: true, name: true, settings: true },
  });
  if (!t || t.kind !== 'AGENCY' || t.deletedAt) return null;
  return { entry: readCoBrand(t.settings), tenantName: t.name };
}

/**
 * The co-brand entry that applies to `tenantId`'s shell: its agency's, when the
 * tenant was brought in by a live agency that has set one. Null otherwise —
 * an unlinked tenant, and the agency itself, see nothing added.
 */
export async function getLinkedAgencyCoBrand(tenantId: string): Promise<CoBrandSettings | null> {
  const t = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { agency: { select: { kind: true, deletedAt: true, name: true, settings: true } } },
  });
  const agency = t?.agency;
  if (!agency || agency.kind !== 'AGENCY' || agency.deletedAt) return null;
  const entry = readCoBrand(agency.settings);
  if (!entry) return null;
  // A logo with no short name still reads as "<agency> iş birliğiyle".
  return { ...entry, name: entry.name || agency.name };
}

export function toShellCoBrand(entry: CoBrandSettings | null): ShellCoBrand | null {
  if (!entry) return null;
  return {
    name: entry.name,
    logoSrc: entry.logoKey ? `${COBRAND_LOGO_PATH}?v=${encodeURIComponent(entry.updatedAt)}` : null,
  };
}

/**
 * The logo object a request from `tenantId` may read: the agency's own, or the
 * one of the agency that brought the tenant in. There is no id in the request,
 * so a session can never name some other agency's logo.
 */
export async function logoKeyVisibleTo(tenantId: string): Promise<string | null> {
  const t = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { kind: true, deletedAt: true, settings: true },
  });
  if (!t || t.deletedAt) return null;
  if (t.kind === 'AGENCY') return readCoBrand(t.settings)?.logoKey ?? null;
  return (await getLinkedAgencyCoBrand(tenantId))?.logoKey ?? null;
}

export class CoBrandStorageError extends Error {
  constructor() {
    super('The co-brand logo could not be stored');
    this.name = 'CoBrandStorageError';
  }
}

/**
 * Writes the agency's entry. `logo`: a sanitised PNG to store, `'keep'` the
 * current one, `'remove'` none. Read-then-merge, like src/lib/sso.ts: the
 * column also carries other settings that a wholesale write would delete.
 * The replaced logo object is deleted after the new entry is saved.
 */
export async function saveAgencyCoBrand(
  agencyId: string,
  input: { name: string; logo: Buffer | 'keep' | 'remove' },
  now: Date = new Date(),
): Promise<CoBrandSettings> {
  const current = await prisma.tenant.findUniqueOrThrow({ where: { id: agencyId }, select: { settings: true } });
  const settings = settingsObject(current.settings);
  const previous = readCoBrand(settings);

  let logoKey = previous?.logoKey ?? null;
  if (input.logo === 'remove') logoKey = null;
  if (Buffer.isBuffer(input.logo)) {
    const key = `${agencyId}/agency/cobrand/${randomUUID()}.png`;
    if (!(await putObjectBytes(key, input.logo, 'image/png'))) throw new CoBrandStorageError();
    logoKey = key;
  }

  const entry: CoBrandSettings = { logoKey, name: input.name, updatedAt: now.toISOString() };
  try {
    await prisma.tenant.update({
      where: { id: agencyId },
      data: { settings: { ...settings, [COBRAND_KEY]: { ...entry } } },
    });
  } catch (e) {
    // The new object is referenced by nothing; do not leave it behind.
    if (logoKey && logoKey !== previous?.logoKey) await deleteObjectBytes(logoKey);
    throw e;
  }
  if (previous?.logoKey && previous.logoKey !== logoKey) await deleteObjectBytes(previous.logoKey);
  return entry;
}
