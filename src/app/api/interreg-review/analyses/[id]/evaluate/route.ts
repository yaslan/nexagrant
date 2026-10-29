import { NextResponse } from 'next/server';

import { promptLocale } from '@/lib/ai/prompts/locale';
import { internalError } from '@/lib/api-error';
import { isPresentId } from '@/lib/required-id';
import { runEvaluation } from '@/modules/m17/server/evaluate';
import { gateInterreg, refuse } from '@/modules/m17/server/gate';

/**
 * Runs the M17 pre-assessment of one of the caller's analyses (FO-188) — the
 * "check the project" button. Synchronous: the answer arrives with the result.
 *
 *   POST → 200 `{ result: InterregResultView }` (status DONE)
 *        | 404 not_found | 409 not_ready (a document is missing) | 409 analysis_busy
 *        | 402 insufficient_credits (refused before anything changed)
 *        | 502 evaluation_failed (status FAILED; documents kept, may be run again)
 *
 * Internal pre-assessment, never an official score: the result carries
 * `assessmentKind: 'internal_pre_assessment'`.
 */
type Params = { params: Promise<{ id: string }> };

// The run reads a whole application and waits for the model: minutes, not seconds.
export const maxDuration = 300;

export async function POST(_req: Request, { params }: Params) {
  const gate = await gateInterreg('write');
  if (!gate.ok) return gate.response;
  const { id } = await params;
  if (!isPresentId(id)) return refuse('not_found', 404);
  try {
    const run = await runEvaluation(gate.scope, id, { locale: await promptLocale() });
    if (run.ok) return NextResponse.json({ result: run.result });
    switch (run.error) {
      case 'not_found':
        return refuse('not_found', 404);
      case 'not_ready':
        return refuse('not_ready', 409);
      case 'analysis_busy':
        return refuse('analysis_busy', 409);
      case 'insufficient_credits':
        return refuse('insufficient_credits', 402);
      case 'evaluation_failed':
        return internalError({ error: 'evaluation_failed' }, { status: 502 });
    }
  } catch (error) {
    console.error('[interreg-review][POST evaluate]', error);
    return internalError();
  }
}
