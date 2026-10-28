import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { internalError } from '@/lib/api-error';
import { createAnalysis, listAnalyses } from '@/modules/m17/server/analyses';
import { gateInterreg, refuse } from '@/modules/m17/server/gate';

/**
 * M17 Interreg pre-assessment (FO-186) — the caller's analyses.
 *
 *   GET  → 200 `{ analyses: InterregAnalysisView[] }` (newest first, at most 50; no text)
 *   POST → 201 `{ analysis: InterregAnalysisView }`   (status UPLOADING, no documents)
 *          body (optional JSON): `{ rubricId?: string }` — one of GET /api/interreg-review/rubrics;
 *          omitted = the default rubric (Interreg NEXT BSB 2nd call Regular).
 *          400 bad_form | bad_rubric · 409 rubric_unavailable (no rubric seeded)
 *
 * Refusals are `{ error: code }` (src/modules/m17/limits.ts INTERREG_API_ERRORS).
 * Every payload says `assessmentKind: 'internal_pre_assessment'`: what this
 * module produces is an internal pre-assessment, never an official score.
 */
const CreateSchema = z.object({ rubricId: z.string().trim().min(1).max(120).optional() }).strict();

export async function GET() {
  const gate = await gateInterreg('read');
  if (!gate.ok) return gate.response;
  try {
    const analyses = await listAnalyses(gate.scope);
    return NextResponse.json({ analyses });
  } catch (error) {
    console.error('[interreg-review][GET analyses]', error);
    return internalError();
  }
}

export async function POST(req: NextRequest) {
  const gate = await gateInterreg('write');
  if (!gate.ok) return gate.response;

  const raw = await req.text();
  let body: unknown = {};
  if (raw.trim() !== '') {
    try {
      body = JSON.parse(raw);
    } catch {
      return refuse('bad_form', 400);
    }
  }
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) return refuse('bad_form', 400);

  try {
    const created = await createAnalysis(gate.scope, parsed.data.rubricId);
    if (!created.ok) return refuse(created.error, created.error === 'bad_rubric' ? 400 : 409);
    return NextResponse.json({ analysis: created.analysis }, { status: 201 });
  } catch (error) {
    console.error('[interreg-review][POST analyses]', error);
    return internalError();
  }
}
