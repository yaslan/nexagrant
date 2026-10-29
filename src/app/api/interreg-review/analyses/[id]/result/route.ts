import { NextResponse } from 'next/server';

import { internalError } from '@/lib/api-error';
import { isPresentId } from '@/lib/required-id';
import { getResult } from '@/modules/m17/server/evaluate';
import { gateInterreg, refuse } from '@/modules/m17/server/gate';

/**
 * The stored pre-assessment of one of the caller's analyses (FO-188).
 *
 *   GET → 200 `{ result }` | 404 not_found (no such analysis, not the caller's, or not DONE)
 */
type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const gate = await gateInterreg('read');
  if (!gate.ok) return gate.response;
  const { id } = await params;
  if (!isPresentId(id)) return refuse('not_found', 404);
  try {
    const result = await getResult(gate.scope, id);
    if (!result) return refuse('not_found', 404);
    return NextResponse.json({ result });
  } catch (error) {
    console.error('[interreg-review][GET result]', error);
    return internalError();
  }
}
