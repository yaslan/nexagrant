import { NextResponse } from 'next/server';

import { internalError } from '@/lib/api-error';
import { gateInterreg } from '@/modules/m17/server/gate';
import { INTERREG_ASSESSMENT_KIND } from '@/modules/m17/server/analyses';
import { listRubrics } from '@/modules/m17/server/rubrics';

/**
 * M17 assessment grids (FO-186) — the profiles an analysis can be created against.
 *
 *   GET → 200 `{ assessmentKind: 'internal_pre_assessment', rubrics: InterregRubricView[] }`
 *
 * Each rubric is the programme's published grid as data (criteria, mark scale,
 * total and knockout thresholds); the module's output against it is an internal
 * pre-assessment, never an official score.
 */
export async function GET() {
  const gate = await gateInterreg('read');
  if (!gate.ok) return gate.response;
  try {
    const rubrics = await listRubrics(gate.scope.tenantId);
    return NextResponse.json({ assessmentKind: INTERREG_ASSESSMENT_KIND, rubrics });
  } catch (error) {
    console.error('[interreg-review][GET rubrics]', error);
    return internalError();
  }
}
