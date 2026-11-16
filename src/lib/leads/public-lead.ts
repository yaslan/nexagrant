import { createHmac } from 'node:crypto';
import { isIPv4, isIPv6 } from 'node:net';
import type { Prisma, PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { toReadinessCode } from '@/lib/readiness/account';
import { TR_PROVINCES } from '@/lib/readiness/provinces';
import { READINESS_ORG_TYPES, scoreReadiness } from '@/lib/readiness/score';
import { decodeReadinessCode } from '@/lib/readiness/share';
import { withSystemScope, withSystemScopeOn } from '@/lib/system-scope';
import {
  PUBLIC_LEAD_CONSENT,
  PUBLIC_LEAD_RETENTION_DAYS,
  PUBLIC_LEAD_SOURCES,
  PUBLIC_LEAD_TRANSFER_CONSENT,
  type PublicLeadField,
  type PublicLeadResult,
} from './public-lead-policy';
import { transferRecipientFor } from './transfer-org';
import { leadTransferConsentEnabled } from '@/lib/env';

export * from './public-lead-policy';

/**
 * FB KAMU (TASK-MULR765AR5G0C) — the contact request an anonymous visitor leaves
 * on the funding-readiness result screen, and everything that happens to it:
 * validation, the bot guards, the write, the admin read and the retention purge.
 *
 * Platform data: the visitor has no account, so the row has no tenant
 * (`PublicLead` is SYSTEM_WIDE in scripts/rls-models.ts). RLS is on with the one `system_scope`
 * policy (NG-175): every read and write below runs inside withSystemScope. docs/legal/processing-register.md §18d.
 *
 * Nothing in this file logs a name, an address, an organisation or an IP.
 */

/** At most this many requests per e-mail address in {@link EMAIL_WINDOW_MS}. */
export const PUBLIC_LEAD_EMAIL_LIMIT = 3;
const EMAIL_WINDOW_MS = 24 * 60 * 60 * 1000;
/** At most this many requests per client IP in {@link IP_WINDOW_MS}. */
export const PUBLIC_LEAD_IP_LIMIT = 10;
const IP_WINDOW_MS = 60 * 60 * 1000;

/** AuditEvent type of one nightly purge. The row carries a count, never a person. */
export const PUBLIC_LEAD_PURGED = 'public_lead.purged';

/** Serialises lead writes so two concurrent requests cannot both pass the limit check. */
const LEAD_LOCK_KEY = 7_302_026_093_001n;
const IP_KEY_LABEL = 'fabrika/public-lead-ip/v1';
const DAY_MS = 24 * 60 * 60 * 1000;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : null));

export const publicLeadInputSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().max(254).pipe(z.email()),
  organisation: z.string().trim().min(2).max(200),
  province: optionalText(40).refine((v) => v === null || (TR_PROVINCES as readonly string[]).includes(v)),
  district: optionalText(80),
  readinessCode: z.unknown().optional().transform((v) => toReadinessCode(v)),
  /** Must be literally true: an unticked box is a refusal, not a default. */
  consent: z.literal(true),
  /** The optional transfer box (NG-179). Anything but literal true counts as unticked. */
  transferConsent: z.unknown().optional().transform((v) => v === true),
  /**
   * NG-204: the organisation name the form showed under the transfer box. The consent is recorded only
   * when it is still the province's organisation at submit; a stale or missing name records none.
   * Never a refusal of the whole request (the contact request itself is still stored).
   */
  transferOrgName: z
    .unknown()
    .optional()
    .transform((v) => (typeof v === 'string' && v.trim() !== '' && v.length <= 300 ? v.trim() : null)),
  /** The version the form displayed; a stale form is refused rather than recorded against new text. */
  consentVersion: z.literal(PUBLIC_LEAD_CONSENT.version),
  source: z.enum(PUBLIC_LEAD_SOURCES),
  locale: z.enum(['tr', 'en']),
  /** Honeypot: hidden from people, filled by naive bots. */
  website: z.string().max(500).optional(),
});

const FIELD_NAMES: readonly PublicLeadField[] = ['name', 'email', 'organisation', 'province', 'district'];

/** Above this many proxies of ours the topology is not one we run; treated as unusable. */
export const MAX_TRUSTED_PROXY_HOPS = 5;
let warnedHops: string | undefined;

/**
 * How many reverse proxies we own sit in front of the app (`TRUSTED_PROXY_HOPS`,
 * default 1: the nginx/Caddy of docs/SMTP-SUNUCU.md §10.1). Each one APPENDS the
 * address it saw to X-Forwarded-For, so only the last `hops` entries were written
 * by us; everything to their left was sent by the client and can be anything.
 * 0 means no proxy of ours: every header is the client's, so no IP is trusted.
 * Only a plain decimal 0..{@link MAX_TRUSTED_PROXY_HOPS} is accepted; anything
 * else falls back to 1 and is logged once (İNCELEME-61 Ö-2) — too many hops would
 * read the client's forged entry again, so a typo must not pass silently.
 */
export function trustedProxyHops(raw: string | undefined = process.env.TRUSTED_PROXY_HOPS): number {
  if (raw === undefined || raw.trim() === '') return 1;
  const value = raw.trim();
  if (/^\d+$/.test(value) && Number(value) <= MAX_TRUSTED_PROXY_HOPS) return Number(value);
  if (warnedHops !== value) {
    warnedHops = value;
    logger.warn('TRUSTED_PROXY_HOPS is not a whole number 0..5; using 1', { value: value.slice(0, 20) });
  }
  return 1;
}

/**
 * The client address as our nearest trusted proxy saw it: the X-Forwarded-For
 * entry `hops` places from the right (İNCELEME-50 B-1 — the FIRST entry is
 * whatever the client wrote, so reading it let one machine rotate the per-IP
 * limit away). X-Real-IP is never read: Caddy passes a client-sent one through
 * untouched, so it is only as good as the proxy config nobody tests.
 * Null when no proxy of ours is in front, or the header is missing.
 */
export function clientIpFrom(
  headers: { get(name: string): string | null },
  hops: number = trustedProxyHops()
): string | null {
  if (hops < 1) return null;
  const chain = (headers.get('x-forwarded-for') ?? '')
    .split(',')
    .map((hop) => hop.trim())
    .filter(Boolean);
  if (chain.length === 0) return null;
  // Fewer entries than proxies: every entry was appended by one of ours, the leftmost is the client.
  return chain[Math.max(0, chain.length - hops)] ?? null;
}

/**
 * The unit the per-IP limit counts (İNCELEME-61 B-1). One IPv6 host is normally
 * handed a whole /64, so counting full addresses let one machine rotate through
 * its own prefix and never hit the limit; an IPv6 address counts by its first 64
 * bits. An IPv4-mapped address (`::ffff:a.b.c.d`) is the IPv4 address it carries.
 * IPv4 and anything that is not an address are returned unchanged.
 */
export function ipBucket(ip: string): string {
  const bare = ip.trim().replace(/^\[(.*)\]$/, '$1').replace(/%.*$/, '');
  if (!isIPv6(bare)) return ip;
  const groups = expandIPv6(bare.toLowerCase());
  if (groups.slice(0, 5).every((g) => g === 0) && groups[5] === 0xffff) {
    return [groups[6]! >> 8, groups[6]! & 0xff, groups[7]! >> 8, groups[7]! & 0xff].join('.');
  }
  return `${groups.slice(0, 4).map((g) => g.toString(16)).join(':')}::/64`;
}

/** The eight 16-bit groups of a valid IPv6 address (validated by the caller). */
function expandIPv6(address: string): number[] {
  let text = address;
  const tail = text.slice(text.lastIndexOf(':') + 1);
  if (isIPv4(tail)) {
    const [a, b, c, d] = tail.split('.').map(Number) as [number, number, number, number];
    text = `${text.slice(0, text.lastIndexOf(':') + 1)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const [head, rest] = text.split('::') as [string, string | undefined];
  const left = head ? head.split(':') : [];
  const right = rest ? rest.split(':') : [];
  const zeros = rest === undefined ? [] : Array(8 - left.length - right.length).fill('0');
  return [...left, ...zeros, ...right].map((g) => parseInt(g, 16));
}

/**
 * Keyed hash of the IP's bucket ({@link ipBucket}), so the per-IP limit works
 * without storing the address. A plain SHA-256 of an IPv4 address is reversed by
 * trying all 2^32; the key makes that impossible without AUTH_SECRET. No secret
 * or no IP → null, and only the per-address limit applies.
 */
export function hashClientIp(ip: string | null, secret: string | null | undefined): string | null {
  if (!ip || !secret) return null;
  const key = createHmac('sha256', secret).update(IP_KEY_LABEL).digest();
  return createHmac('sha256', key).update(ipBucket(ip)).digest('hex');
}

function authSecret(): string | null {
  // Same source NextAuth signs sessions with (src/lib/agency/registration-invite-cookie.ts).
  return process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || null;
}

export interface SubmitPublicLeadOptions {
  ip?: string | null;
  now?: Date;
  /** Test seam: a client on the RLS-subject role. */
  db?: PrismaClient;
  secret?: string | null;
}

/**
 * Validates and stores one contact request. Every refusal is a code the form
 * turns into a message; nothing about the person is logged on any path.
 */
export async function submitPublicLead(raw: unknown, options: SubmitPublicLeadOptions = {}): Promise<PublicLeadResult> {
  const input = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};

  // Honeypot first: a bot gets the same answer as a person and nothing is stored,
  // so it has no signal to adapt to.
  if (typeof input.website === 'string' && input.website.trim() !== '') {
    logger.info('public lead dropped by honeypot', { source: String(input.source ?? '') });
    return { ok: true };
  }

  if (input.consent !== true) return { ok: false, error: 'consent_required' };
  if (input.consentVersion !== PUBLIC_LEAD_CONSENT.version) return { ok: false, error: 'consent_outdated' };

  const parsed = publicLeadInputSchema.safeParse(input);
  if (!parsed.success) {
    const fields = new Set<PublicLeadField>();
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (FIELD_NAMES.includes(key as PublicLeadField)) fields.add(key as PublicLeadField);
    }
    return { ok: false, error: 'invalid', fields: [...fields] };
  }
  const data = parsed.data;

  // Total and level are recomputed here from the answers, never taken from the
  // client, so the admin list shows what the scorecard's own rules say.
  const decoded = decodeReadinessCode(data.readinessCode, READINESS_ORG_TYPES);
  const scored = decoded ? scoreReadiness(decoded.answers, decoded.orgType) : null;

  const now = options.now ?? new Date();
  const ipHash = hashClientIp(options.ip ?? null, options.secret === undefined ? authSecret() : options.secret);
  const db = options.db ?? prisma;

  try {
    // The transfer consent is recorded only when the box is ticked AND the province has an
    // organisation now AND it is the one the form showed (NG-204, SEC NG-203 O-A1): the consent is
    // stored against that organisation's id and name, and forwardPublicLead sends the lead nowhere else.
    // A ticked box for an unmapped province, or under a name that is no longer the province's, writes
    // nothing (no recipient the visitor saw, no consent), and a failed lookup does not lose the lead:
    // it is stored without the transfer consent.
    // While the publication gate (LEAD_TRANSFER_CONSENT_ENABLED) is off, the flag is ignored outright.
    const recipient =
      data.transferConsent && leadTransferConsentEnabled()
        ? await transferRecipientFor(data.province, db).catch(() => null)
        : null;
    const transferTo = recipient && data.transferOrgName !== null && recipient.name === data.transferOrgName ? recipient : null;
    const transferOn = transferTo !== null;

    // NG-175 (SEC NG-170 O-1): PublicLead is RLS system_scope only. 'public-intake' opens it (and,
    // among the system_scope tables, only it and the expert form's) for the anonymous form.
    return await withSystemScopeOn(db, 'public-intake', 'public-lead.submit', async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${LEAD_LOCK_KEY})`;

      const byEmail = await tx.publicLead.count({
        where: { email: data.email, createdAt: { gte: new Date(now.getTime() - EMAIL_WINDOW_MS) } },
      });
      if (byEmail >= PUBLIC_LEAD_EMAIL_LIMIT) return { ok: false, error: 'rate_limited' } as const;
      if (ipHash) {
        const byIp = await tx.publicLead.count({
          where: { ipHash, createdAt: { gte: new Date(now.getTime() - IP_WINDOW_MS) } },
        });
        if (byIp >= PUBLIC_LEAD_IP_LIMIT) return { ok: false, error: 'rate_limited' } as const;
      }

      await tx.publicLead.create({
        data: {
          name: data.name,
          email: data.email,
          organisation: data.organisation,
          province: data.province,
          district: data.district,
          readinessCode: decoded?.code ?? null,
          readinessTotal: scored?.total0to100 ?? null,
          readinessLevel: scored?.level ?? null,
          consentVersion: PUBLIC_LEAD_CONSENT.version,
          consentAt: now,
          transferConsent: transferOn,
          transferConsentVersion: transferOn ? PUBLIC_LEAD_TRANSFER_CONSENT.version : null,
          transferConsentAt: transferOn ? now : null,
          transferConsentTenantId: transferTo?.tenantId ?? null,
          transferConsentOrgName: transferTo?.name ?? null,
          source: data.source,
          locale: data.locale,
          ipHash,
          createdAt: now,
        },
      });
      return { ok: true } as const;
    });
  } catch (error) {
    // The error's name only: a Prisma message can quote the values it failed on.
    logger.error('public lead write failed', { error: error instanceof Error ? error.name : 'unknown' });
    return { ok: false, error: 'server' };
  }
}

// ── Admin read ────────────────────────────────────────────────────────────────

export const PUBLIC_LEAD_ADMIN_PAGE_SIZE = 200;

export interface PublicLeadRow {
  id: string;
  name: string;
  email: string;
  organisation: string;
  province: string | null;
  district: string | null;
  readinessTotal: number | null;
  readinessLevel: string | null;
  consentVersion: string;
  consentAt: Date;
  source: string;
  locale: string;
  createdAt: Date;
}

/**
 * Newest first. The caller must already have checked requirePlatformAdmin().
 * NG-175: PublicLead is RLS system_scope only, so the read runs in the 'platform-admin' scope.
 */
export async function listPublicLeads(db: PrismaClient = prisma): Promise<{ rows: PublicLeadRow[]; total: number }> {
  const [rows, total] = await withSystemScopeOn(db, 'platform-admin', 'public-lead.admin-list', (tx) => Promise.all([
    tx.publicLead.findMany({
      orderBy: { createdAt: 'desc' },
      take: PUBLIC_LEAD_ADMIN_PAGE_SIZE,
      select: {
        id: true,
        name: true,
        email: true,
        organisation: true,
        province: true,
        district: true,
        readinessTotal: true,
        readinessLevel: true,
        consentVersion: true,
        consentAt: true,
        source: true,
        locale: true,
        createdAt: true,
      },
    }),
    tx.publicLead.count(),
  ]));
  return { rows, total };
}

/** When a row left at `createdAt` is deleted (for the admin screen). */
export function publicLeadDeletionDate(createdAt: Date, retentionDays: number = PUBLIC_LEAD_RETENTION_DAYS): Date {
  return new Date(createdAt.getTime() + retentionDays * DAY_MS);
}

// ── Retention ─────────────────────────────────────────────────────────────────

/** The moment before which a contact request is purged. */
export function publicLeadPurgeCutoff(now: Date, retentionDays: number = PUBLIC_LEAD_RETENTION_DAYS): Date {
  if (!Number.isInteger(retentionDays) || retentionDays < 1) {
    // Zero or a negative window would reach requests left today.
    throw new RangeError(`public lead retention must be a whole number of days >= 1, got ${retentionDays}`);
  }
  if (Number.isNaN(now.getTime())) throw new RangeError('public lead retention: `now` is not a valid date');
  return new Date(now.getTime() - retentionDays * DAY_MS);
}

/** The one filter the purge deletes by. A bad cutoff throws: never a filterless delete. */
export function purgeablePublicLeadWhere(cutoff: Date): Prisma.PublicLeadWhereInput {
  if (!(cutoff instanceof Date) || Number.isNaN(cutoff.getTime())) {
    throw new RangeError('public lead retention: cutoff is not a valid date; refusing a filterless delete');
  }
  return { createdAt: { lt: cutoff } };
}

export interface PublicLeadPurgeResult {
  deletedCount: number;
  cutoff: string;
  retentionDays: number;
}

/**
 * Deletes every contact request older than the retention window and, when any
 * went, writes one `public_lead.purged` AuditEvent with the count only.
 *
 * The AuditEvent has no tenant (the rows had none), and a NULL-tenant audit row
 * is writable only inside withSystemScope (auditevent-null-system-only.sql), so
 * delete and audit share that one transaction: a purge is never recorded
 * without happening, nor the other way round. Idempotent.
 */
export async function purgeOldPublicLeads(options: { now?: Date } = {}): Promise<PublicLeadPurgeResult> {
  const retentionDays = PUBLIC_LEAD_RETENTION_DAYS;
  const cutoff = publicLeadPurgeCutoff(options.now ?? new Date(), retentionDays);
  const due = purgeablePublicLeadWhere(cutoff);

  return withSystemScope('cross-tenant-job', 'public-lead-retention.purge', async (tx) => {
    const { count } = await tx.publicLead.deleteMany({ where: due });
    if (count > 0) {
      await tx.auditEvent.create({
        data: { tenantId: null, type: PUBLIC_LEAD_PURGED, data: { count, retentionDays, cutoff: cutoff.toISOString() } },
      });
    }
    return { deletedCount: count, cutoff: cutoff.toISOString(), retentionDays };
  });
}
