'use server';

import { z } from 'zod';
import { requirePlatformAdmin } from '@/lib/tenant';
import {
  deactivateProvinceLeadRoute,
  listIntakeTenantOptions,
  listProvinceLeadRoutes,
  listUnmatchedLeads,
  setProvinceLeadRoute,
} from '@/lib/leads/province-route';
import type {
  IntakeTenantOption,
  ListUnmatchedLeadsInput,
  ProvinceLeadRouteRow,
  ProvinceRouteResult,
  UnmatchedLeadPage,
} from '@/core/contracts/lead-routing';

/**
 * NG-167 — platform-admin server actions for the lead routing map (contract:
 * src/core/contracts/lead-routing.ts, `LeadRoutingActions`). A server action is its own HTTP
 * entry point, so each one checks the platform-admin role itself; tenant roles (`can()` is a
 * tenant-role matrix) have no access to this map at all. Input is Zod-validated; a malformed
 * value answers like an unknown one, never with a thrown validation message.
 */

const setSchema = z.object({ province: z.string().min(1).max(40), tenantId: z.string().min(1).max(64) });
const deactivateSchema = z.object({ province: z.string().min(1).max(40) });
const noInputSchema = z.undefined();
const listSchema = z.object({ limit: z.number().int().optional(), offset: z.number().int().optional() }).optional();

export async function listProvinceLeadRoutesAction(): Promise<ProvinceLeadRouteRow[]> {
  await requirePlatformAdmin();
  return listProvinceLeadRoutes();
}

export async function setProvinceLeadRouteAction(input: { province: string; tenantId: string }): Promise<ProvinceRouteResult> {
  const { userId } = await requirePlatformAdmin();
  const parsed = setSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'invalid_province' };
  return setProvinceLeadRoute(parsed.data, userId);
}

export async function deactivateProvinceLeadRouteAction(input: { province: string }): Promise<ProvinceRouteResult> {
  const { userId } = await requirePlatformAdmin();
  const parsed = deactivateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'invalid_province' };
  return deactivateProvinceLeadRoute(parsed.data, userId);
}

export async function listUnmatchedLeadsAction(input?: ListUnmatchedLeadsInput): Promise<UnmatchedLeadPage> {
  await requirePlatformAdmin();
  const parsed = listSchema.safeParse(input);
  return listUnmatchedLeads(parsed.success ? parsed.data ?? {} : {});
}

export async function listIntakeTenantOptionsAction(input?: undefined): Promise<IntakeTenantOption[]> {
  await requirePlatformAdmin();
  // No input exists; anything passed is ignored the same way a malformed list input is.
  noInputSchema.safeParse(input);
  return listIntakeTenantOptions();
}
