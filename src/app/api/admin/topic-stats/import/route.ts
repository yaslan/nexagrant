import { NextRequest, NextResponse } from 'next/server';
import { requirePlatformAdminApi } from '@/lib/tenant';
import { logger } from '@/lib/logger';
import { XLSX_LIMITS, XlsxReadError } from '@/lib/k3-topic-stats/xlsx';
import { HorizonLayoutError } from '@/lib/k3-topic-stats/horizonDashboard';
import {
  applyTopicStatImport,
  isValidDataDate,
  planTopicStatImport,
  sanitiseFileName,
  sha256,
  type TopicStatImportPlan,
} from '@/lib/k3-topic-stats/importer';

/** The preview lists at most this many planned rows; the counts always cover all of them. */
const PREVIEW_ROWS = 200;
const LIST_CAP = 1000;

function planBody(plan: TopicStatImportPlan) {
  return {
    source: plan.source,
    sheet: plan.parse.sheetName,
    headerRow: plan.parse.headerRowNumber,
    mapping: plan.parse.mapping,
    rateScale: plan.parse.rateScale,
    counts: plan.counts,
    planned: plan.planned.slice(0, PREVIEW_ROWS),
    unmatched: plan.unmatched.slice(0, LIST_CAP),
    rejected: plan.parse.rejected.slice(0, LIST_CAP),
  };
}

/**
 * K3 — Horizon Dashboard xlsx → TopicStat (TASK-MULQKV3BJT6VM).
 *
 * multipart/form-data: `file` (.xlsx), `dataDate` (YYYY-MM-DD, the dashboard's data date),
 * `mode` = `preview` | `apply`, and on apply `expectedHash` = the sha256 the preview returned,
 * so the rows written are the rows the admin looked at.
 *
 * `TopicStat` is shared by every tenant (the G0 base-rate rule reads it), so this is platform
 * staff only, and the gate runs before the body is read.
 */
export async function POST(req: NextRequest) {
  const gate = await requirePlatformAdminApi();
  if (!gate.ok) return gate.response;

  const declared = Number(req.headers.get('content-length') ?? '0');
  if (declared > XLSX_LIMITS.maxFileBytes + 64 * 1024) {
    return NextResponse.json({ error: 'too_large', maxBytes: XLSX_LIMITS.maxFileBytes }, { status: 413 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: 'bad_form' }, { status: 400 });
  }
  const file = form.get('file');
  const mode = String(form.get('mode') ?? 'preview');
  const dataDate = String(form.get('dataDate') ?? '');
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: 'no_file' }, { status: 400 });
  }
  if (file.size > XLSX_LIMITS.maxFileBytes) {
    return NextResponse.json({ error: 'too_large', maxBytes: XLSX_LIMITS.maxFileBytes }, { status: 413 });
  }
  if (mode !== 'preview' && mode !== 'apply') {
    return NextResponse.json({ error: 'bad_mode' }, { status: 400 });
  }
  if (!isValidDataDate(dataDate)) {
    return NextResponse.json({ error: 'bad_date' }, { status: 400 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const hash = sha256(bytes);
  const fileName = sanitiseFileName(file.name);

  try {
    if (mode === 'preview') {
      const plan = await planTopicStatImport(bytes, fileName, dataDate);
      return NextResponse.json({ ok: true, mode, hash, fileName, ...planBody(plan) });
    }

    if (String(form.get('expectedHash') ?? '') !== hash) {
      return NextResponse.json({ error: 'hash_mismatch' }, { status: 409 });
    }
    const result = await applyTopicStatImport(bytes, fileName, dataDate);
    logger.info('K3 TopicStat import applied', {
      userId: gate.userId,
      fileName,
      hash,
      counts: result.plan.counts,
      written: result.written,
    });
    return NextResponse.json({
      ok: true,
      mode,
      hash,
      fileName,
      ...planBody(result.plan),
      written: result.written,
      prefixes: result.prefixes,
      rawFetch: result.rawFetch,
    });
  } catch (err) {
    if (err instanceof HorizonLayoutError) {
      return NextResponse.json(
        { error: 'layout_changed', message: err.message, headersSeen: err.headersSeen.slice(0, 60) },
        { status: 422 },
      );
    }
    if (err instanceof XlsxReadError) {
      return NextResponse.json(
        { error: err.code === 'TOO_LARGE' ? 'too_large' : 'not_xlsx', message: err.message },
        { status: err.code === 'TOO_LARGE' ? 413 : 400 },
      );
    }
    logger.error('K3 TopicStat import failed', err, { fileName, hash, mode });
    return NextResponse.json({ error: 'import_failed' }, { status: 500 });
  }
}
