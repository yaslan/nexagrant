import { NextRequest, NextResponse } from 'next/server';
import { internalError } from '@/lib/api-error';
import { SediaAdapter } from '@/lib/adapters/sedia';
import { translateTopicsBatch } from '@/lib/translation';
import { requireTenantApi } from '@/lib/tenant';
import { logger } from '@/lib/logger';
import { UserWindowLimiter } from '@/lib/user-rate-limit';

/**
 * The largest page this route asks SEDIA for. Every title on the page is
 * translated, so an uncapped `limit` multiplied into thousands of outbound calls
 * per request (TASK-MUN66T2HM4A4E O-1).
 */
const CAGRILAR_MAX_PAGE_SIZE = 50;

/**
 * Searches one user may run per minute (İNCELEME-75 D-3). The calls page asks
 * once per filter change, so a person does not come near it; a loop does.
 */
export const CAGRILAR_PER_USER_PER_MINUTE = 30;
const limiter = new UserWindowLimiter(CAGRILAR_PER_USER_PER_MINUTE);

export async function GET(request: NextRequest) {
  // Signed-in members only: the one consumer is the (app) calls page, and an
  // anonymous caller could otherwise spend SEDIA and translation quota at will.
  const tenant = await requireTenantApi();
  if (!tenant.ok) return tenant.response;

  const retryAfter = limiter.take(tenant.scope.userId);
  if (retryAfter !== null) {
    return NextResponse.json(
      { success: false, error: 'rate_limited' },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } }
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const text = searchParams.get('q') || searchParams.get('text') || '***';
    const rawPageSize = Number.parseInt(searchParams.get('limit') || searchParams.get('pageSize') || '20', 10);
    if (!Number.isFinite(rawPageSize)) {
      return NextResponse.json({ success: false, error: 'invalid_limit' }, { status: 400 });
    }
    const pageSize = Math.min(CAGRILAR_MAX_PAGE_SIZE, Math.max(1, rawPageSize));
    // One SEDIA page per request, the one the calls page is showing. The route used
    // to walk five pages from page 1 whatever was asked: the page got 100 rows under a
    // 20-per-page pager, "next" brought the same 100 back, and translating all of
    // them held the list on its loading state for 12-30 s (TASK-MUPVLWSIPC5WU).
    const rawPage = Number.parseInt(searchParams.get('page') || searchParams.get('pageNumber') || '1', 10);
    if (!Number.isFinite(rawPage)) {
      return NextResponse.json({ success: false, error: 'invalid_page' }, { status: 400 });
    }
    const page = Math.max(1, rawPage);
    const lang = (searchParams.get('lang') || searchParams.get('locale') || 'tr').toLowerCase();
    
    // Status filter: 'OPEN', 'FORTHCOMING', 'CLOSED' or numeric codes ('31094501', '31094502', '31094503')
    const statusParam = searchParams.get('status');
    let statuses: string[] = ['31094501', '31094502']; // Default: Forthcoming and Open
    
    if (statusParam) {
      const parts = statusParam.split(',').map(s => s.trim().toUpperCase());
      const mapped: string[] = [];
      parts.forEach(p => {
        if (p === 'FORTHCOMING' || p === '31094501') mapped.push('31094501');
        if (p === 'OPEN' || p === '31094502') mapped.push('31094502');
        if (p === 'CLOSED' || p === '31094503') mapped.push('31094503');
      });
      if (mapped.length > 0) statuses = mapped;
    }

    // Framework Programme filter
    const frameworkParam = searchParams.get('framework');
    let frameworkProgrammes: string[] = [];
    if (frameworkParam && frameworkParam !== 'ALL') {
      frameworkProgrammes = frameworkParam.split(',').map(f => f.trim());
    }

    // Type: '1' (grants), '2' (tenders)
    const typeParam = searchParams.get('type') || '1';
    const types = typeParam.split(',').map(t => t.trim());

    const adapter = new SediaAdapter();
    const result = await adapter.searchSedia({
      text,
      pageSize,
      startPage: page,
      maxPages: 1,
      statuses,
      frameworkProgrammes,
      types,
      languages: [lang, 'en']
    });

    let processedTopics = result.topics;

    // If requested language is Turkish, translate titles & descriptions to Turkish
    if (lang === 'tr' && processedTopics.length > 0) {
      processedTopics = await translateTopicsBatch(processedTopics, 'tr');
    }

    // No database write here. This route used to upsert the first ten topics
    // into the shared Topic table on every request, so any anonymous caller
    // could make the platform write (TASK-MUN66T2HM4A4E O-1). Topic rows are the
    // nightly k1-daily-calls job's job (src/lib/jobs/tasks/k1-daily-calls.ts,
    // cron 02:00); a live search only reads SEDIA.

    return NextResponse.json({
      success: true,
      totalResults: result.totalResults,
      pageNumber: result.pageNumber,
      pageSize: result.pageSize,
      topics: processedTopics
    });
  } catch (error) {
    // The detail stays in the server log; the body is a fixed code (O-2).
    logger.error('[API /api/cagrilar] Internal error:', error);
    return internalError({ success: false, error: 'internal_error' });
  }
}

