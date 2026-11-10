import { NextResponse } from 'next/server';

import { internalError } from '@/lib/api-error';
import { gateRecords, readJson, refuse } from '@/lib/gates/records-api';
import { getInternalApproval, InternalApprovalInputSchema, saveInternalApproval } from '@/lib/gates/readiness-records';
import { isPresentId } from '@/lib/required-id';

/**
 * The internal approval of one opportunity (NG-34, spec §17.1).
 *
 *   GET → 200 `{ approval }`, null when none is recorded yet
 *   PUT → body `{ approved, cofinancingCents, currency?, decisionRef, decisionAt }`
 *         200 `{ approval }` | 400 `invalid_body` | 404 `not_found`
 *
 * Writing takes `approve_dual_approval`, the owner's and the admin's; reading `view_proposal`.
 * Another tenant's opportunity is `not_found` on a write, and reads as no record.
 */
type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const gate = await gateRecords('view_proposal', 'read');
  if (!gate.ok) return gate.response;
  const { id } = await params;
  if (!isPresentId(id)) return refuse('not_found', 404);
  try {
    return NextResponse.json({ approval: await getInternalApproval(gate.scope, id) });
  } catch (error) {
    console.error('[internal-approval][GET]', error);
    return internalError();
  }
}

export async function PUT(req: Request, { params }: Params) {
  const gate = await gateRecords('approve_dual_approval', 'write');
  if (!gate.ok) return gate.response;
  const { id } = await params;
  if (!isPresentId(id)) return refuse('not_found', 404);
  const input = InternalApprovalInputSchema.safeParse(await readJson(req));
  if (!input.success) return refuse('invalid_body', 400);
  try {
    const approval = await saveInternalApproval(gate.scope, id, input.data);
    if (!approval) return refuse('not_found', 404);
    return NextResponse.json({ approval });
  } catch (error) {
    console.error('[internal-approval][PUT]', error);
    return internalError();
  }
}
