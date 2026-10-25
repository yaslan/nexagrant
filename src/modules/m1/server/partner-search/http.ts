/**
 * Partner Search route handlers (FO-61), shared by the session routes under
 * /api and their API-key twins under /api/v1. A route file authenticates
 * (session or `authenticateApiKey`), then hands its tenant and actor here, so
 * both doors answer with the same gate, the same quota and the same body.
 */
import { NextResponse } from 'next/server';

import type {
  PartnerSearchAnnouncementPage,
  PartnerSearchDenied,
  PartnerSearchQuotaExceeded,
  PartnerSignalResponse,
} from '@/core/contracts/partner-search';
import { API_KEY_VIEWER } from '@/lib/api-auth';
import { internalError } from '@/lib/api-error';
import { getEntitlements } from '@/lib/billing';
import { partnerSearchGrant, planNamesGrantingPartnerSearchExport } from '@/lib/billing/catalog';
import { withTenant, type TenantTx } from '@/lib/db';
import { errorMessage } from '@/lib/errors';
import { decideModuleAccess } from '@/lib/modules/tenant-access';
import type { ModuleViewer } from '@/lib/modules/state-machine';
import type { ModuleStatus } from '@/lib/modules/types';

import {
  consumePartnerSearchQuery,
  decidePartnerSearchAccess,
  parsePartnerSearchQuery,
  PARTNER_SEARCH_PAGE_SIZE,
  picSchema,
  quotaState,
  readAnnouncementPage,
  readAnnouncementsForExport,
  readPartnerSignal,
  toAnnouncementDto,
  toExportCsv,
  toExportJson,
  topicIdentifierSchema,
  type PartnerSearchAccess,
  type PartnerSearchActor,
} from './api';

const M1 = 'M1' as const;

export interface PartnerSearchCaller {
  tenantId: string;
  actor: PartnerSearchActor;
  viewer: ModuleViewer;
}

/**
 * The tenant's Partner Search terms, from one transaction: the M1 status row and
 * the entitlement (plan + add-ons), decided by the same `decideModuleAccess` the
 * module gate uses and the plan's grant from the billing catalogue.
 */
async function accessOf(tx: TenantTx, caller: PartnerSearchCaller): Promise<PartnerSearchAccess> {
  const [state, entitlements] = await Promise.all([
    tx.moduleState.findUnique({
      where: { tenantId_moduleId: { tenantId: caller.tenantId, moduleId: M1 } },
      select: { status: true },
    }),
    getEntitlements(caller.tenantId, tx),
  ]);
  const m1 = decideModuleAccess(M1, (state?.status ?? 'OFF') as ModuleStatus, entitlements.allowedModules, caller.viewer);
  const grant = partnerSearchGrant(entitlements.planId, entitlements.allowedModules.includes(M1));
  return decidePartnerSearchAccess(caller.actor, m1, grant);
}

function denied(access: Extract<PartnerSearchAccess, { allowed: false }>): NextResponse {
  const body: PartnerSearchDenied = {
    error: 'MODULE_ACCESS_DENIED',
    module: M1,
    reason: access.reason,
    ...(access.requiredPlans ? { requiredPlans: access.requiredPlans } : {}),
  };
  return NextResponse.json(body, { status: 403 });
}

function invalidQuery(): NextResponse {
  return NextResponse.json({ error: 'invalid_query' }, { status: 400 });
}

function failed(where: string, error: unknown): NextResponse {
  console.error(`[partner-search] ${where} failed: ${errorMessage(error)}`);
  return internalError({ error: 'internal_error' });
}

/** Thrown inside the transaction to answer 403/429 without committing a count. */
class Refusal {
  constructor(readonly response: NextResponse) {}
}

/**
 * A list read: gate, then (on a metered plan) one unit of the month's quota,
 * then the page — all in one transaction, so a read that fails returns the unit.
 */
async function listed(
  caller: PartnerSearchCaller,
  where: string,
  url: URL,
  pic?: string
): Promise<NextResponse> {
  const parsed = parsePartnerSearchQuery(url.searchParams);
  if (!parsed.success) return invalidQuery();
  const { page, ...filter } = parsed.data;
  const now = new Date();

  try {
    const body = await withTenant(caller.tenantId, async (tx): Promise<PartnerSearchAnnouncementPage> => {
      const access = await accessOf(tx, caller);
      if (!access.allowed) throw new Refusal(denied(access));

      let quota: PartnerSearchAnnouncementPage['meta']['quota'];
      if (access.quota !== null) {
        const spent = await consumePartnerSearchQuery(tx, caller.tenantId, access.quota, now);
        quota = quotaState(access.quota, spent.used, now);
        if (!spent.ok) {
          const exceeded: PartnerSearchQuotaExceeded = { error: 'PARTNER_SEARCH_QUOTA_EXCEEDED', quota };
          throw new Refusal(
            NextResponse.json(exceeded, { status: 429, headers: { 'Retry-After': retryAfterSeconds(quota.resetsAt, now) } })
          );
        }
      }

      const { total, rows } = await readAnnouncementPage(tx, pic === undefined ? filter : { ...filter, pic }, page);
      return {
        success: true,
        meta: { page, pageSize: PARTNER_SEARCH_PAGE_SIZE, total, ...(quota ? { quota } : {}) },
        data: rows.map(toAnnouncementDto),
      };
    });
    return NextResponse.json(body);
  } catch (error) {
    if (error instanceof Refusal) return error.response;
    return failed(where, error);
  }
}

function retryAfterSeconds(resetsAt: string, now: Date): string {
  return String(Math.max(1, Math.ceil((Date.parse(resetsAt) - now.getTime()) / 1000)));
}

/** GET …/partner-search/announcements */
export function listAnnouncements(caller: PartnerSearchCaller, req: Request): Promise<NextResponse> {
  return listed(caller, 'announcements', new URL(req.url));
}

/** GET …/organizations/:pic/announcements */
export async function listOrganizationAnnouncements(
  caller: PartnerSearchCaller,
  req: Request,
  rawPic: string
): Promise<NextResponse> {
  const pic = picSchema.safeParse(rawPic);
  if (!pic.success) return invalidQuery();
  return listed(caller, 'organization announcements', new URL(req.url), pic.data);
}

/**
 * GET …/topics/:identifier/partner-signal. Counts only, no organisation, so it
 * is not metered: a metered plan sees the demand of a topic without spending a
 * list query on it.
 */
export async function topicPartnerSignal(caller: PartnerSearchCaller, rawIdentifier: string): Promise<NextResponse> {
  const identifier = topicIdentifierSchema.safeParse(rawIdentifier);
  if (!identifier.success) return invalidQuery();

  try {
    const body = await withTenant(caller.tenantId, async (tx): Promise<PartnerSignalResponse> => {
      const access = await accessOf(tx, caller);
      if (!access.allowed) throw new Refusal(denied(access));
      return { success: true, topicIdentifier: identifier.data, data: await readPartnerSignal(tx, identifier.data) };
    });
    return NextResponse.json(body);
  } catch (error) {
    if (error instanceof Refusal) return error.response;
    return failed('partner signal', error);
  }
}

/**
 * GET /api/partner-search/announcements/export?format=csv|json — the plan's
 * export grant (Ultra), the list filters, no page. Not metered: no metered plan
 * has the export.
 */
export async function exportAnnouncements(caller: PartnerSearchCaller, req: Request): Promise<NextResponse> {
  const url = new URL(req.url);
  const format = url.searchParams.get('format') ?? 'csv';
  if (format !== 'csv' && format !== 'json') return invalidQuery();
  const parsed = parsePartnerSearchQuery(url.searchParams);
  if (!parsed.success) return invalidQuery();
  // The page is ignored: an export is every matching row up to its cap.
  const filter = parsed.data;
  const now = new Date();

  try {
    const { rows, truncated } = await withTenant(caller.tenantId, async (tx) => {
      const access = await accessOf(tx, caller);
      if (!access.allowed) throw new Refusal(denied(access));
      if (!access.export) {
        throw new Refusal(
          denied({ allowed: false, reason: 'EXPORT_NOT_IN_PLAN', requiredPlans: planNamesGrantingPartnerSearchExport() })
        );
      }
      const found = await readAnnouncementsForExport(tx, filter);
      return { rows: found.rows.map(toAnnouncementDto), truncated: found.truncated };
    });

    const stamp = now.toISOString().slice(0, 10);
    if (format === 'json') {
      return NextResponse.json(toExportJson(rows, now, truncated), {
        headers: { 'Content-Disposition': `attachment; filename="partner-search-${stamp}.json"` },
      });
    }
    return new NextResponse(toExportCsv(rows, truncated), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="partner-search-${stamp}.csv"`,
      },
    });
  } catch (error) {
    if (error instanceof Refusal) return error.response;
    return failed('export', error);
  }
}

/** An authenticated API key as a Partner Search caller. M1 is already checked by `authenticateApiKey`. */
export function apiKeyCaller(tenantId: string): PartnerSearchCaller {
  return { tenantId, actor: { kind: 'apiKey' }, viewer: API_KEY_VIEWER };
}
