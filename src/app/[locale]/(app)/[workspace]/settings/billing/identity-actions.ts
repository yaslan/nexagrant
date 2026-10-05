'use server';

import { revalidatePath } from 'next/cache';
import { Role } from '@prisma/client';

import { withTenant } from '@/lib/db';
import { requireTenantAction } from '@/lib/tenant';
import { can } from '@/lib/rbac';
import { errorMessage } from '@/lib/errors';
import { logger } from '@/lib/logger';
import {
  countryIsInvoiceable,
  parseBillingIdentity,
  type BillingIdentityIssue,
} from '@/lib/billing/billing-identity';

/**
 * The writer for `TenantBillingIdentity`.
 *
 * The table had readers and no writer: `invoice-writer.ts` refuses to issue an
 * invoice without it, `vat-rate.ts` reads the country off it, and no screen in
 * `src/app/` ever wrote a row. 82 of the 106 open operator alerts were that
 * one gap — 77.4%, the largest single source in the table (measured 2026-09-10,
 * docs/agent-results/TASK-MTTUUGKNDGBXK-evidence/01-alert-pile-before.txt).
 *
 * ## Who may write it
 *
 * `manage_billing`, which `src/lib/rbac.ts` grants to `TENANT_OWNER` alone —
 * not to `TENANT_ADMIN`, and this action is the permission's first caller.
 * Two reasons it sits that high rather than with the other settings screens:
 *
 *  1. The row decides who the tenant's tax documents are made out to and, via
 *     `buyerCountry`, at what rate they are taxed. A member able to edit it is
 *     a member able to redirect the organisation's invoices.
 *  2. `buyerVknTckn` holds a TCKN for a sole trader — personal data the
 *     processing register (§5) marks as requiring special measures. Fewer
 *     readers is the measure.
 *
 * The check runs here and not only on the page: a server action is its own HTTP
 * entry point, so a page-level guard protects the screen and not the write.
 *
 * ## Why saving does not resolve the open alerts (decision, TASK-MTSY71BUMBLWM)
 *
 * A saved identity deliberately leaves every open `invoice_buyer_identity_missing`
 * alert open. Three reasons, in order of weight:
 *
 *  1. The alert is not "this tenant lacks an identity" — it is "a payment was
 *     taken and no invoice was issued for it". Filling the form in today does
 *     not issue yesterday's invoice. Closing the alert would erase the only
 *     record that money came in against no fiscal document, and that record is
 *     an obligation, not a nag.
 *  2. It would not empty the console anyway. Measured twice on 2026-09-10, at
 *     226 and then 234 open rows from this source: every row carries a
 *     `meta.tenantId`, and in both readings exactly **one** names a tenant that
 *     still exists. The rest belong to throwaway e2e tenants that were deleted —
 *     orphans this action can never reach. The absolute count climbs with every
 *     e2e run; the ratio does not. The pile is a retention problem and belongs
 *     to the alert console card (TASK-MTTUUGKNDGBXK), not here.
 *  3. `SystemAlert` has no RLS policy and no `tenantId` column (the id lives in
 *     `meta`). A tenant-scoped action writing to an unscoped platform table
 *     would cross a privilege boundary to reach rows it cannot see. And
 *     `recordAlert` already treats resolution as an operator's gesture:
 *     resolving closes the dedupe window so a recurring fault reopens visibly.
 *
 * What the tenant gets instead is the truth at the point of action — the panel
 * says an identity is missing, and says so before the next payment, which is
 * the only payment this screen can still save.
 */

export type BillingIdentitySaveResult =
  | {
      ok: true;
      /** True when this country can actually be invoiced today (regime `standard`). */
      invoiceable: boolean;
      /** The country code stored, so the panel can name it without re-parsing. */
      country: string;
    }
  | { ok: false; error: 'forbidden' | 'validation_failed' | 'write_failed'; issues?: BillingIdentityIssue[] };

export async function saveBillingIdentity(input: unknown): Promise<BillingIdentitySaveResult> {
  const { tenantId, role } = await requireTenantAction();

  if (!can(role as Role, 'manage_billing')) {
    return { ok: false, error: 'forbidden' };
  }

  const parsed = parseBillingIdentity(input);
  if (!parsed.ok) {
    // The issues carry a field and a rule code and never a submitted value, so
    // this response can be rendered, logged or screenshotted without copying a
    // tax identity out of the form.
    return { ok: false, error: 'validation_failed', issues: parsed.issues };
  }

  const { values } = parsed;

  try {
    await withTenant(tenantId, (tx) =>
      tx.tenantBillingIdentity.upsert({
        where: { tenantId },
        // `tenantId` is the primary key, so an upsert is the whole update story:
        // one identity per tenant, and re-submitting the form corrects it rather
        // than accumulating rows. The RLS policy on the table (prisma/rls.sql)
        // is the second lock behind the `tenantId` written here.
        create: { tenantId, ...values },
        update: values,
      })
    );
  } catch (error) {
    // Names the tenant and the failure, never a field value.
    logger.error('billing identity write failed', errorMessage(error), { tenantId });
    return { ok: false, error: 'write_failed' };
  }

  revalidatePath('/[locale]/(app)/[workspace]/settings/billing', 'page');

  return {
    ok: true,
    country: values.buyerCountry,
    invoiceable: countryIsInvoiceable(values.buyerCountry),
  };
}
