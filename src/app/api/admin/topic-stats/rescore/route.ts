import { NextRequest, NextResponse } from 'next/server';
import { requirePlatformAdminApi } from '@/lib/tenant';
import { logger } from '@/lib/logger';
import { rescoreG0ForPrefixes } from '@/lib/k3-topic-stats/importer';

const MAX_PREFIXES = 2000;
const PREFIX_RE = /^[A-Z0-9][A-Z0-9-]{2,120}$/;

/**
 * K3 — re-derive G0 for the opportunities whose topic family an import just touched
 * (TASK-MULQKV3BJT6VM). Body: `{ "prefixes": ["HORIZON-CL5-2026-09-D4", ...] }`.
 *
 * A button, not an automatic step after the import: it writes into every tenant's
 * opportunities, so an operator starts it after reading the import result.
 */
export async function POST(req: NextRequest) {
  const gate = await requirePlatformAdminApi();
  if (!gate.ok) return gate.response;

  const body: unknown = await req.json().catch(() => null);
  const raw = body && typeof body === 'object' ? (body as { prefixes?: unknown }).prefixes : undefined;
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_PREFIXES) {
    return NextResponse.json({ error: 'bad_prefixes' }, { status: 400 });
  }
  const prefixes = raw.filter((p): p is string => typeof p === 'string' && PREFIX_RE.test(p));
  if (prefixes.length !== raw.length) {
    return NextResponse.json({ error: 'bad_prefixes' }, { status: 400 });
  }

  try {
    const summary = await rescoreG0ForPrefixes(prefixes);
    logger.info('K3 G0 rescore after TopicStat import', { userId: gate.userId, prefixes: prefixes.length, ...summary });
    return NextResponse.json({ ok: true, ...summary });
  } catch (err) {
    logger.error('K3 G0 rescore failed', err, { prefixes: prefixes.length });
    return NextResponse.json({ error: 'rescore_failed' }, { status: 500 });
  }
}
