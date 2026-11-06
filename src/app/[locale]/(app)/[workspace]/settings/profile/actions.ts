'use server';

/**
 * TASK-MULV3JXS1AW5X — the organisation's province, edited after registration.
 *
 * Tenant is a system-wide table (no RLS), so the only thing that picks the row
 * is the session: the id is `requireTenantAction().tenantId`, never a
 * parameter. Changing it needs `manage_users` (owner / admin), the same bar as
 * the other organisation-level settings. Refusals come back as values, as in
 * src/app/[locale]/(app)/ajans/actions.ts.
 */
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { withTenant, type TenantTx } from '@/lib/db';
import {
  PIC_LOOKUPS_PER_HOUR,
  PIC_LOOKUPS_PER_HOUR_UNSOLICITED,
  PIC_REFUSAL_ROWS_PER_TENANT_PER_DAY,
  TenantPicInputSchema,
} from '@/lib/pic';
import { budgetDay, spendUnsolicitedPicLookup } from '@/lib/pic-budget';
import { toTenantProvince, provinceAppliesTo } from '@/lib/province';
import { asRole, can } from '@/lib/rbac';
import { requireTenantAction } from '@/lib/tenant';
import { failureCode, type PilotExpiredCode } from '@/lib/pilot-expired';
import { recordAlert } from '@/lib/observability/system-alert';
import { refreshTenantPicRegistry } from '@/lib/pic-registry-refresh';
import { rescoreTenantG0AfterPicChange, type PicChangeTrigger } from '@/lib/scoring/g0-rescore-tenant';
import { UserWindowLimiter } from '@/lib/user-rate-limit';
import { DEFAULT_TRL_RANGE, parseKeywords } from './profile-fields';

const HOUR_MS = 3_600_000;
/**
 * FO-386. One process, so N instances allow N times this; see UserWindowLimiter. That multiplier is
 * only ever paid by tenants with something behind them; the accounts anyone can open are held by the
 * database total below (FO-389), which no process count changes.
 */
const picLookupLimiter = new UserWindowLimiter(PIC_LOOKUPS_PER_HOUR, HOUR_MS);
/** FO-389. The same question from an account with no invitation, pilot or paid plan. */
const picUnsolicitedLookupLimiter = new UserWindowLimiter(PIC_LOOKUPS_PER_HOUR_UNSOLICITED, HOUR_MS);
/** A loop against the limit is worth one audit row an hour, not one row per request. */
const picLimitRecordLimiter = new UserWindowLimiter(1, HOUR_MS);

export type ProvinceActionError = 'forbidden' | 'notApplicable' | 'invalid' | 'failed' | PilotExpiredCode;

/**
 * FO-387. A field is absent when the user did not change it, and an absent field is not written: a
 * form opened before a colleague's save would otherwise put the old value back.
 */
export interface UpdateProfileInput {
  capabilities?: string;
  keywords?: string;
  trlMin?: number;
  trlMax?: number;
  /** FO-383. Absent: the stored PIC is left alone. Empty: it is cleared. */
  pic?: string;
  /** The PIC the user confirmed after seeing the CORDIS organisation it belongs to. */
  confirmedPic?: string;
}

export type ProfileActionError = 'forbidden' | 'invalid' | 'picInvalid' | 'picTaken' | 'failed' | PilotExpiredCode;

/** The CORDIS organisation a PIC belongs to, shown to the user before it is claimed. */
export interface PicCordisMatch {
  name: string;
  city: string | null;
  country: string | null;
}

/** What a save did to the PIC. Absent when the PIC did not change. */
export type PicSaveOutcome =
  | { status: 'matched'; value: string; match: PicCordisMatch }
  | { status: 'unmatched'; value: string }
  | { status: 'cleared' };

type PicPlan =
  | { kind: 'keep' }
  | { kind: 'refuse'; pic: string }
  | { kind: 'limit'; pic: string; retryAfterSeconds: number }
  | { kind: 'confirm'; match: PicCordisMatch }
  | { kind: 'write'; from: string | null; to: string | null; match: PicCordisMatch | null };

const TrlSchema = z.number().int().min(1).max(9).optional();
const ProfileFieldsSchema = z.object({
  capabilities: z.string().trim().min(1).optional(),
  keywords: z.string().transform(parseKeywords).pipe(z.array(z.string()).min(1)).optional(),
  trlMin: TrlSchema,
  trlMax: TrlSchema,
});

const LIVE_SUBSCRIPTION_STATUSES: readonly string[] = ['ACTIVE', 'TRIALING', 'PAST_DUE'];

/**
 * FO-389. A question that ended in "CORDIS knows this PIC, confirm it?" has been counted and answered.
 * The "yes" that follows is the same question, so it is not counted a second time: without this a
 * new account spends two of its three hourly questions on one confirmation. One entry per user, for
 * one PIC, taken once, and only a counted question can leave it, so it opens no way to ask for free.
 * In memory like the limiter: after a restart the "yes" is simply counted, the stricter side.
 */
const PIC_CONFIRM_WINDOW_MS = 10 * 60_000;
const picAwaitingConfirmation = new Map<string, { pic: string; until: number }>();

function rememberPicConfirmation(userId: string, pic: string, now = Date.now()) {
  if (picAwaitingConfirmation.size > 1000) {
    for (const [id, entry] of picAwaitingConfirmation) if (entry.until <= now) picAwaitingConfirmation.delete(id);
  }
  picAwaitingConfirmation.set(userId, { pic, until: now + PIC_CONFIRM_WINDOW_MS });
}

function takePicConfirmation(userId: string, pic: string, now = Date.now()): boolean {
  const entry = picAwaitingConfirmation.get(userId);
  if (!entry) return false;
  picAwaitingConfirmation.delete(userId);
  return entry.pic === pic && entry.until > now;
}

/**
 * FO-389. True when something other than the self-service form put this tenant here: it came in with
 * an agency's invitation code (`agencyId`), or it has a live subscription (a pilot, a plan someone
 * paid for or was granted), or it bought a lifetime licence. A tenant with none of these is one anyone
 * could have opened for free. A missing tenant row counts as unsolicited: the stricter side.
 */
function isSolicitedTenant(tenant: {
  agencyId: string | null;
  subscription: { status: string } | null;
  lifetimeLicences: { id: string }[];
}): boolean {
  if (tenant.agencyId !== null) return true;
  if (tenant.subscription && LIVE_SUBSCRIPTION_STATUSES.includes(tenant.subscription.status)) return true;
  return tenant.lifetimeLicences.length > 0;
}

/**
 * FO-383 — decides what a submitted PIC may do; writes nothing.
 *
 * A PIC earns the organisation the coordination and network points of whoever owns it, and the
 * portal offers no way to check ownership from here. So what this can do is make a false claim
 * deliberate and single: the user sees the CORDIS name and confirms it (enforced here, not only in
 * the form), and one PIC sits on one live tenant. No CORDIS row means nothing to confirm against;
 * it is saved and the form says no history will count.
 *
 * Tenant is system-wide (no RLS), so the duplicate check sees other tenants. Its answer is yes or
 * no: their identity never leaves this function. There is no unique index behind it, so the lock
 * is what keeps two tenants claiming one PIC at once from both passing. It is held to commit.
 *
 * FO-386: that yes or no, asked over the public CORDIS list, says who our customers are. So every
 * question counts against the user, whatever the answer turns out to be, and is counted before the
 * lock and the lookup: past the limit nothing is looked up, so the answer cannot depend on the PIC.
 *
 * FO-389: a per-user limit is beaten by opening accounts, and anyone can open one. A tenant counts
 * as solicited when something other than a form got it in: an agency invitation, a pilot or any live
 * subscription, or a lifetime licence. Every other tenant gets the lower hourly limit AND spends from
 * one daily budget shared by all of them (`spendUnsolicitedPicLookup`), so a hundred accounts do not
 * ask a hundred times as much. Past either limit the answer is the same `limit` plan and does not
 * depend on the PIC. Solicited tenants never touch the budget, so exhausting it locks out no customer.
 */
async function planPicChange(
  tx: TenantTx,
  tenantId: string,
  userId: string,
  next: string,
  confirmedPic: string | undefined
): Promise<PicPlan> {
  const tenant = await tx.tenant.findUnique({
    where: { id: tenantId },
    select: {
      pic: true,
      agencyId: true,
      subscription: { select: { status: true } },
      lifetimeLicences: { select: { id: true }, take: 1 },
    },
  });
  const current = tenant?.pic ?? null;
  const to = next === '' ? null : next;
  if (current === to) return { kind: 'keep' };
  if (to === null) return { kind: 'write', from: current, to: null, match: null };

  const solicited = tenant !== null && isSolicitedTenant(tenant);
  // The "yes" to a confirmation this user was just shown is the same question: not counted again.
  const alreadyCounted = confirmedPic === to && takePicConfirmation(userId, to);
  let giveBack: (() => void) | null = null;
  if (!alreadyCounted) {
    const limiter = solicited ? picLookupLimiter : picUnsolicitedLookupLimiter;
    const takenAt = Date.now();
    const retryAfterSeconds = limiter.take(userId, takenAt);
    if (retryAfterSeconds !== null) return { kind: 'limit', pic: to, retryAfterSeconds };
    giveBack = () => limiter.refund(userId, takenAt);
  }

  // From here a throw is our failure (the budget cannot be reached, the database does not answer), not an
  // answer to the asker: the hourly allowance taken above goes back and the error goes on. The ceiling is
  // never skipped to avoid it.
  try {
    if (!alreadyCounted && !solicited) {
      const budgetRetry = await spendUnsolicitedPicLookup();
      if (budgetRetry !== null) return { kind: 'limit', pic: to, retryAfterSeconds: budgetRetry };
    }

    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`tenant-pic:${to}`}, 0))`;
    const holder = await tx.tenant.findFirst({
      where: { pic: to, id: { not: tenantId }, deletedAt: null },
      select: { id: true },
    });
    if (holder) return { kind: 'refuse', pic: to };

    const match = await tx.cordisOrganization.findUnique({
      where: { organisationId: to },
      select: { name: true, city: true, country: true },
    });
    if (match && confirmedPic !== to) {
      rememberPicConfirmation(userId, to);
      return { kind: 'confirm', match };
    }
    return { kind: 'write', from: current, to, match };
  } catch (error) {
    giveBack?.();
    throw error;
  }
}

/**
 * FO-386 — who asked for which PIC, on the tenant that asked. Only what the asker typed: the holder
 * is not named here and the holder's own log gets no row, so staff read this without it telling
 * anyone else who holds what.
 */
async function recordPicRefusal(
  tx: TenantTx,
  scope: { tenantId: string; userId: string },
  pic: string,
  reason: 'picTaken' | 'rateLimited'
) {
  // FO-389: the rows grow with the number of accounts, so each tenant's share of a day is capped.
  // Asks past the cap are still refused, they just stop leaving a row. Read and write are not locked
  // together, so concurrent asks can overshoot by a few: the cap bounds growth, it is not a quota.
  const startOfDay = new Date(`${budgetDay(new Date())}T00:00:00.000Z`);
  // Counted per reason, so a day of `picTaken` rows never hides the row that says the limit was hit.
  const today = await tx.auditEvent.count({
    where: {
      tenantId: scope.tenantId,
      type: 'tenant.pic.refused',
      createdAt: { gte: startOfDay },
      data: { path: ['reason'], equals: reason },
    },
  });
  if (today < PIC_REFUSAL_ROWS_PER_TENANT_PER_DAY) {
    await tx.auditEvent.create({
      data: { tenantId: scope.tenantId, actorId: scope.userId, type: 'tenant.pic.refused', data: { pic, reason } },
    });
    return;
  }
  // The cap was reached today. One summary row per tenant, reason and day says so, so the silence after
  // it is not mistaken for no activity. Not the PICs asked, not who asked: that detail is what the cap
  // gives up. Its own type, so the count above (and the staff list of refusals) still reads the cap.
  const summarised = await tx.auditEvent.count({
    where: {
      tenantId: scope.tenantId,
      type: 'tenant.pic.refusal.capped',
      createdAt: { gte: startOfDay },
      data: { path: ['reason'], equals: reason },
    },
  });
  if (summarised > 0) return;
  await tx.auditEvent.create({
    data: {
      tenantId: scope.tenantId,
      actorId: scope.userId,
      type: 'tenant.pic.refusal.capped',
      data: { reason, cap: PIC_REFUSAL_ROWS_PER_TENANT_PER_DAY },
    },
  });
}

export async function updateTenantProfile(
  input: UpdateProfileInput
): Promise<
  | { ok: true; pic?: PicSaveOutcome }
  | { ok: false; error: ProfileActionError }
  | { ok: false; error: 'picConfirmationRequired'; match: PicCordisMatch }
  | { ok: false; error: 'trlRangeConflict'; trlRange: [number, number] }
  | { ok: false; error: 'picRateLimited'; retryAfterSeconds: number }
> {
  try {
    const scope = await requireTenantAction();

    // Girdi doğrulaması (yetki kontrolleri öncesi, çünkü keşif süreci)
    const parsedFields = ProfileFieldsSchema.safeParse(input);
    if (!parsedFields.success) return { ok: false, error: 'invalid' };
    const fields = parsedFields.data;
    const picInput = input.pic === undefined ? null : TenantPicInputSchema.safeParse(input.pic);
    if (picInput && !picInput.success) return { ok: false, error: 'picInvalid' };

    // Kurumsal profili güncelleme izni: kurum sahibi veya yönetici (YETKİ KONTROL ÖNCEKİ TÜM GİRDİLER GEÇ)
    if (!can(asRole(scope.role), 'manage_users')) return { ok: false, error: 'forbidden' };

    const confirmedPic = input.confirmedPic === undefined ? undefined : TenantPicInputSchema.safeParse(input.confirmedPic).data;

    const profileChanged = Object.values(fields).some((value) => value !== undefined);

    // FO-384: set by the PIC write below; the rescore runs after that transaction has committed.
    let picChange: { trigger: PicChangeTrigger; auditEventId: string } | null = null;
    // FO-396: the new PIC to ask the EU register about, set only when the PIC really changed to a value.
    let picToCheck: { pic: string; auditEventId: string } | null = null;

    const outcome = await withTenant(scope.tenantId, async (tx) => {
      const existing = await tx.tenantProfile.findUnique({
        where: { tenantId: scope.tenantId },
        select: { capabilities: true, keywords: true, trlRange: true },
      });

      // What the row will hold: the fields sent, over what is stored. A first row needs both texts.
      // A PIC-only save on a tenant with no profile stays that way: no row, nothing invented.
      const capabilities = fields.capabilities ?? existing?.capabilities;
      const keywords = fields.keywords ?? existing?.keywords;
      const trlRange = [
        fields.trlMin ?? existing?.trlRange[0] ?? DEFAULT_TRL_RANGE.min,
        fields.trlMax ?? existing?.trlRange[1] ?? DEFAULT_TRL_RANGE.max,
      ] as const;
      if (profileChanged) {
        if (capabilities === undefined || keywords === undefined) return { ok: false as const, error: 'invalid' as const };
        if (trlRange[0] > trlRange[1]) {
          // One end sent, and only the stored other end makes it wrong. The form may be showing an old
          // range, so the answer says what the row holds: the user can go on without a reload.
          const oneEndSent = (fields.trlMin === undefined) !== (fields.trlMax === undefined);
          if (!existing || !oneEndSent) return { ok: false as const, error: 'invalid' as const };
          return {
            ok: false as const,
            error: 'trlRangeConflict' as const,
            trlRange: [
              existing.trlRange[0] ?? DEFAULT_TRL_RANGE.min,
              existing.trlRange[1] ?? DEFAULT_TRL_RANGE.max,
            ] as [number, number],
          };
        }
      }

      // Refusals come before any write: a refused PIC saves nothing, the profile text included.
      const picPlan: PicPlan = picInput?.success
        ? await planPicChange(tx, scope.tenantId, scope.userId, picInput.data, confirmedPic)
        : { kind: 'keep' };
      if (picPlan.kind === 'limit') {
        if (picLimitRecordLimiter.take(scope.userId) === null) await recordPicRefusal(tx, scope, picPlan.pic, 'rateLimited');
        return { ok: false as const, error: 'picRateLimited' as const, retryAfterSeconds: picPlan.retryAfterSeconds };
      }
      if (picPlan.kind === 'refuse') {
        await recordPicRefusal(tx, scope, picPlan.pic, 'picTaken');
        return { ok: false as const, error: 'picTaken' as const };
      }
      if (picPlan.kind === 'confirm') {
        return { ok: false as const, error: 'picConfirmationRequired' as const, match: picPlan.match };
      }

      if (profileChanged && capabilities !== undefined && keywords !== undefined) {
        const trlChanged = fields.trlMin !== undefined || fields.trlMax !== undefined;
        if (existing) {
          await tx.tenantProfile.update({
            where: { tenantId: scope.tenantId },
            data: {
              capabilities: fields.capabilities,
              keywords: fields.keywords,
              trlRange: trlChanged ? [...trlRange] : undefined,
            },
          });
        } else {
          await tx.tenantProfile.create({
            data: {
              tenantId: scope.tenantId,
              capabilities,
              keywords,
              trlRange: [...trlRange],
              naceCodes: [],
              preferredRoles: [],
            },
          });
        }

        // Denetim olayı
        await tx.auditEvent.create({
          data: {
            tenantId: scope.tenantId,
            actorId: scope.userId,
            type: 'tenant.profile.updated',
            data: { capabilities, keywords, trlRange: [...trlRange] },
          },
        });
      }

      if (picPlan.kind === 'write') {
        // FO-396 (B3): the stored register answer belongs to the PIC it was asked about. A new PIC starts
        // unverified, so the previous FOUND never carries over to the new number.
        await tx.tenant.update({
          where: { id: scope.tenantId },
          data: { pic: picPlan.to, picRegistryStatus: null, picRegistryCheckedAt: null },
        });
        const audit = await tx.auditEvent.create({
          data: {
            tenantId: scope.tenantId,
            actorId: scope.userId,
            type: 'tenant.pic.updated',
            data: { from: picPlan.from, to: picPlan.to, cordisName: picPlan.match?.name ?? null },
          },
        });
        picChange = { trigger: picPlan.to === null ? 'tenant_cleared' : 'tenant_saved', auditEventId: String(audit.id) };
        if (picPlan.to !== null) picToCheck = { pic: picPlan.to, auditEventId: String(audit.id) };
      }

      revalidatePath('/[locale]/(app)/[workspace]/settings/profile', 'layout');
      if (picPlan.kind !== 'write') return { ok: true as const };
      const pic: PicSaveOutcome =
        picPlan.to === null
          ? { status: 'cleared' }
          : picPlan.match
            ? { status: 'matched', value: picPlan.to, match: picPlan.match }
            : { status: 'unmatched', value: picPlan.to };
      return { ok: true as const, pic };
    });

    // FO-384: the stored G0 scores follow the PIC. Never rejects; a failure is an alert, not a
    // refused save, because the PIC is already committed.
    // FO-396 (B1): ask the register once the new PIC is committed, before the rescore reads it. Only when the
    // PIC changed (the write plan); a failure leaves the PIC saved and the status null (no grant).
    // The cast: the flag is set inside the transaction callback, which TypeScript does not follow.
    const registryCheck = picToCheck as { pic: string; auditEventId: string } | null;
    if (registryCheck !== null) {
      try {
        await refreshTenantPicRegistry(scope.tenantId, registryCheck.pic, {}, { auditEventId: registryCheck.auditEventId, attempt: 0 });
      } catch {
        // The PIC is already committed; the stored status stays null, which the scorer reads as no grant.
        // FO-396 (Ö-C): the failure is recorded, not swallowed. recordAlert never throws, and the alert carries no PIC.
        await recordAlert({
          level: 'warn',
          source: 'pic-registry',
          message: 'PIC saved, but the EU register answer could not be stored; PIC stays unverified (no grant)',
          meta: { tenantId: scope.tenantId, reason: 'refresh_failed' },
        });
      }
    }
    if (picChange) await rescoreTenantG0AfterPicChange(scope.tenantId, picChange);
    return outcome;
  } catch (error) {
    return { ok: false, error: failureCode(error, 'failed') };
  }
}

export async function updateTenantProvince(
  raw: string
): Promise<{ ok: true; province: string | null } | { ok: false; error: ProvinceActionError }> {
  try {
    const scope = await requireTenantAction();
    if (!can(asRole(scope.role), 'manage_users')) return { ok: false, error: 'forbidden' };

    return await withTenant(scope.tenantId, async (tx) => {
      const tenant = await tx.tenant.findUnique({
        where: { id: scope.tenantId },
        select: { country: true, province: true },
      });
      if (!tenant) return { ok: false as const, error: 'failed' as const };
      if (!provinceAppliesTo(tenant.country)) return { ok: false as const, error: 'notApplicable' as const };
      // '' clears it; any other value must be one of TR_PROVINCES.
      const province = raw === '' ? null : toTenantProvince(raw, tenant.country);
      if (raw !== '' && !province) return { ok: false as const, error: 'invalid' as const };

      if (tenant.province !== province) {
        await tx.tenant.update({ where: { id: scope.tenantId }, data: { province } });
        await tx.auditEvent.create({
          data: {
            tenantId: scope.tenantId,
            actorId: scope.userId,
            type: 'tenant.province.updated',
            data: { from: tenant.province, to: province },
          },
        });
      }
      revalidatePath('/[locale]/(app)/[workspace]/settings/profile', 'layout');
      return { ok: true as const, province };
    });
  } catch (error) {
    return { ok: false, error: failureCode(error, 'failed') };
  }
}
