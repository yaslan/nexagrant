import { NextResponse } from 'next/server';

import { internalError } from '@/lib/api-error';
import { gateRecords, readJson, refuse } from '@/lib/gates/records-api';
import { BudgetShareInputSchema, listBudgetShares, saveBudgetShare } from '@/lib/gates/readiness-records';
import { isPresentId } from '@/lib/required-id';

/**
 * The budget share range of each seat of one opportunity (NG-34, spec §12 G1).
 *
 *   GET → 200 `{ shares }`
 *   PUT → body `{ seatId, minCents, maxCents, currency?, agreed }`, one seat
 *         200 `{ share }` | 400 `invalid_body` (also min above max) | 404 `not_found`
 *
 * Writing takes `manage_workspaces`, as a seat does; reading `view_proposal`. A seat of another
 * opportunity or tenant is `not_found`.
 */
type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const gate = await gateRecords('view_proposal', 'read');
  if (!gate.ok) return gate.response;
  const { id } = await params;
  if (!isPresentId(id)) return refuse('not_found', 404);
  try {
    return NextResponse.json({ shares: await listBudgetShares(gate.scope, id) });
  } catch (error) {
    console.error('[budget-shares][GET]', error);
    return internalError();
  }
}

export async function PUT(req: Request, { params }: Params) {
  const gate = await gateRecords('manage_workspaces', 'write');
  if (!gate.ok) return gate.response;
  const { id } = await params;
  if (!isPresentId(id)) return refuse('not_found', 404);
  const input = BudgetShareInputSchema.safeParse(await readJson(req));
  if (!input.success) return refuse('invalid_body', 400);
  const { seatId, ...share } = input.data;
  try {
    const saved = await saveBudgetShare(gate.scope, seatId, share, id);
    if (!saved) return refuse('not_found', 404);
    return NextResponse.json({ share: saved });
  } catch (error) {
    console.error('[budget-shares][PUT]', error);
    return internalError();
  }
}
