import { NextResponse } from 'next/server';

import { internalError } from '@/lib/api-error';
import { gateRecords, readJson, refuse } from '@/lib/gates/records-api';
import {
  getOwnReadiness,
  getSeatReadiness,
  ReadinessInputSchema,
  saveOwnReadiness,
  saveSeatReadiness,
} from '@/lib/gates/readiness-records';
import { isPresentId } from '@/lib/required-id';

/**
 * An organisation's G0/G1 readiness: PIC present or missing, EU Login, LEAR (NG-34).
 *
 *   GET            → 200 `{ readiness }`, the tenant's own
 *   GET ?seatId=   → 200 `{ readiness }`, the organisation in that seat | 404
 *   PUT, same URLs → body `{ euLoginReady?, learReady? }` (boolean, or null to clear)
 *
 * PIC is never written here and never returned as a number: the tenant's own is edited on the
 * profile form (FO-383), a partner's on its seat. Reading takes `view_proposal`; writing the
 * tenant's own takes `manage_users`, as its PIC does, a partner's `manage_workspaces`, as its
 * seat does. An open seat, or another tenant's, is `not_found`.
 */
const seatIdOf = (req: Request) => new URL(req.url).searchParams.get('seatId');

export async function GET(req: Request) {
  const gate = await gateRecords('view_proposal', 'read');
  if (!gate.ok) return gate.response;
  const seatId = seatIdOf(req);
  if (seatId !== null && !isPresentId(seatId)) return refuse('not_found', 404);
  try {
    const readiness = seatId === null ? await getOwnReadiness(gate.scope) : await getSeatReadiness(gate.scope, seatId);
    if (!readiness) return refuse('not_found', 404);
    return NextResponse.json({ readiness });
  } catch (error) {
    console.error('[org-readiness][GET]', error);
    return internalError();
  }
}

export async function PUT(req: Request) {
  const seatId = seatIdOf(req);
  const gate = await gateRecords(seatId === null ? 'manage_users' : 'manage_workspaces', 'write');
  if (!gate.ok) return gate.response;
  if (seatId !== null && !isPresentId(seatId)) return refuse('not_found', 404);
  const input = ReadinessInputSchema.safeParse(await readJson(req));
  if (!input.success) return refuse('invalid_body', 400);
  try {
    const readiness =
      seatId === null
        ? await saveOwnReadiness(gate.scope, input.data)
        : await saveSeatReadiness(gate.scope, seatId, input.data);
    if (!readiness) return refuse('not_found', 404);
    return NextResponse.json({ readiness });
  } catch (error) {
    console.error('[org-readiness][PUT]', error);
    return internalError();
  }
}
