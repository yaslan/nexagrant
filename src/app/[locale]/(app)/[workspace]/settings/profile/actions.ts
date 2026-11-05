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
import { withTenant, type TenantTx } from '@/lib/db';
import { PIC_LOOKUPS_PER_HOUR, TenantPicInputSchema } from '@/lib/pic';
import { toTenantProvince, provinceAppliesTo } from '@/lib/province';
import { asRole, can } from '@/lib/rbac';
import { requireTenantAction } from '@/lib/tenant';
import { failureCode, type PilotExpiredCode } from '@/lib/pilot-expired';
import { UserWindowLimiter } from '@/lib/user-rate-limit';

const HOUR_MS = 3_600_000;
/** FO-386. One process, so N instances allow N times this; see UserWindowLimiter. */
const picLookupLimiter = new UserWindowLimiter(PIC_LOOKUPS_PER_HOUR, HOUR_MS);
/** A loop against the limit is worth one audit row an hour, not one row per request. */
const picLimitRecordLimiter = new UserWindowLimiter(1, HOUR_MS);

export type ProvinceActionError = 'forbidden' | 'notApplicable' | 'invalid' | 'failed' | PilotExpiredCode;

export interface UpdateProfileInput {
  capabilities: string;
  keywords: string;
  trlMin: number;
  trlMax: number;
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
 */
async function planPicChange(
  tx: TenantTx,
  tenantId: string,
  userId: string,
  next: string,
  confirmedPic: string | undefined
): Promise<PicPlan> {
  const tenant = await tx.tenant.findUnique({ where: { id: tenantId }, select: { pic: true } });
  const current = tenant?.pic ?? null;
  const to = next === '' ? null : next;
  if (current === to) return { kind: 'keep' };
  if (to === null) return { kind: 'write', from: current, to: null, match: null };

  const retryAfterSeconds = picLookupLimiter.take(userId);
  if (retryAfterSeconds !== null) return { kind: 'limit', pic: to, retryAfterSeconds };

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
  if (match && confirmedPic !== to) return { kind: 'confirm', match };
  return { kind: 'write', from: current, to, match };
}

/**
 * FO-386 — who asked for which PIC, on the tenant that asked. Only what the asker typed: the holder
 * is not named here and the holder's own log gets no row, so staff read this without it telling
 * anyone else who holds what.
 */
function recordPicRefusal(
  tx: TenantTx,
  scope: { tenantId: string; userId: string },
  pic: string,
  reason: 'picTaken' | 'rateLimited'
) {
  return tx.auditEvent.create({
    data: { tenantId: scope.tenantId, actorId: scope.userId, type: 'tenant.pic.refused', data: { pic, reason } },
  });
}

export async function updateTenantProfile(
  input: UpdateProfileInput
): Promise<
  | { ok: true; pic?: PicSaveOutcome }
  | { ok: false; error: ProfileActionError }
  | { ok: false; error: 'picConfirmationRequired'; match: PicCordisMatch }
  | { ok: false; error: 'picRateLimited'; retryAfterSeconds: number }
> {
  try {
    const scope = await requireTenantAction();

    // Girdi doğrulaması (yetki kontrolleri öncesi, çünkü keşif süreci)
    if (!input.capabilities?.trim()) return { ok: false, error: 'invalid' };
    if (!input.keywords?.trim()) return { ok: false, error: 'invalid' };
    if (input.trlMin < 1 || input.trlMin > 9) return { ok: false, error: 'invalid' };
    if (input.trlMax < 1 || input.trlMax > 9) return { ok: false, error: 'invalid' };
    if (input.trlMin > input.trlMax) return { ok: false, error: 'invalid' };
    const picInput = input.pic === undefined ? null : TenantPicInputSchema.safeParse(input.pic);
    if (picInput && !picInput.success) return { ok: false, error: 'picInvalid' };

    // Kurumsal profili güncelleme izni: kurum sahibi veya yönetici (YETKİ KONTROL ÖNCEKİ TÜM GİRDİLER GEÇ)
    if (!can(asRole(scope.role), 'manage_users')) return { ok: false, error: 'forbidden' };

    // Keywords ve TRL range'i ön işleme (withTenant'dan önce)
    const keywords = input.keywords
      .split(',')
      .map((k) => k.trim())
      .filter((k) => k);

    if (!keywords.length) return { ok: false, error: 'invalid' };

    const trlRange = [input.trlMin, input.trlMax];

    const confirmedPic = input.confirmedPic === undefined ? undefined : TenantPicInputSchema.safeParse(input.confirmedPic).data;

    return await withTenant(scope.tenantId, async (tx) => {
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

      // Mevcut profili bul veya yeni oluştur
      const existing = await tx.tenantProfile.findUnique({
        where: { tenantId: scope.tenantId },
      });

      if (existing) {
        await tx.tenantProfile.update({
          where: { tenantId: scope.tenantId },
          data: {
            capabilities: input.capabilities.trim(),
            keywords,
            trlRange,
          },
        });
      } else {
        await tx.tenantProfile.create({
          data: {
            tenantId: scope.tenantId,
            capabilities: input.capabilities.trim(),
            keywords,
            trlRange,
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
          data: {
            capabilities: input.capabilities.trim(),
            keywords,
            trlRange,
          },
        },
      });

      if (picPlan.kind === 'write') {
        await tx.tenant.update({ where: { id: scope.tenantId }, data: { pic: picPlan.to } });
        await tx.auditEvent.create({
          data: {
            tenantId: scope.tenantId,
            actorId: scope.userId,
            type: 'tenant.pic.updated',
            data: { from: picPlan.from, to: picPlan.to, cordisName: picPlan.match?.name ?? null },
          },
        });
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
