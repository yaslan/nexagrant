import { NextResponse } from 'next/server';

import { internalError } from '@/lib/api-error';
import { isPresentId } from '@/lib/required-id';
import { deleteAnalysis, getAnalysis } from '@/modules/m17/server/analyses';
import { gateInterreg, refuse } from '@/modules/m17/server/gate';

/**
 * One of the caller's M17 analyses (FO-186).
 *
 *   GET    → 200 `{ analysis: InterregAnalysisView }` | 404 `{ error: 'not_found' }`
 *   DELETE → 200 `{ deleted: true }` | 404 — removes the extracted texts and any
 *            F2 output now (the 30-day expiry is the fallback, not the only way out).
 *
 * Another user's or another tenant's analysis is `not_found`, never `forbidden`:
 * the answer does not tell whether the id exists.
 */
type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const gate = await gateInterreg('read');
  if (!gate.ok) return gate.response;
  const { id } = await params;
  if (!isPresentId(id)) return refuse('not_found', 404);
  try {
    const analysis = await getAnalysis(gate.scope, id);
    if (!analysis) return refuse('not_found', 404);
    return NextResponse.json({ analysis });
  } catch (error) {
    console.error('[interreg-review][GET analysis]', error);
    return internalError();
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  const gate = await gateInterreg('write');
  if (!gate.ok) return gate.response;
  const { id } = await params;
  if (!isPresentId(id)) return refuse('not_found', 404);
  try {
    const deleted = await deleteAnalysis(gate.scope, id);
    if (!deleted) return refuse('not_found', 404);
    return NextResponse.json({ deleted: true });
  } catch (error) {
    console.error('[interreg-review][DELETE analysis]', error);
    return internalError();
  }
}
