import { NextRequest, NextResponse } from 'next/server';
import { internalError } from '@/lib/api-error';
import { SediaAdapter } from '@/lib/adapters/sedia';
import { translateTopicsBatch } from '@/lib/translation';
import { requireTenantApi } from '@/lib/tenant';
import { logger } from '@/lib/logger';
import { UserWindowLimiter } from '@/lib/user-rate-limit';

/**
 * The largest page this route asks SEDIA for. The route fetches up to
 * {@link MAX_PAGES} pages and translates every title, so an uncapped `limit`
 * multiplied into thousands of outbound calls per request (TASK-MUN66T2HM4A4E O-1).
 */
const CAGRILAR_MAX_PAGE_SIZE = 50;
const MAX_PAGES = 5;

/**
 * Total time one search may take, SEDIA and translation together
 * (TASK-MUS7OVUMOJZP3). SEDIA had no timeout and translation queues behind a
 * process-wide limit, so the calls page could stay on "loading" for good. What
 * is left of the budget after SEDIA goes to translation; once it runs out the
 * topics go back in English with `translated: false`.
 */
export const CAGRILAR_BUDGET_MS = 20_000;

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

  // The budget and the client's own disconnect both cancel the outbound work.
  const budget = new AbortController();
  const budgetTimer = setTimeout(
    () => budget.abort(new DOMException('cagrilar budget exhausted', 'TimeoutError')),
    CAGRILAR_BUDGET_MS
  );
  const signal = AbortSignal.any([budget.signal, request.signal]);

  try {
    const { searchParams } = new URL(request.url);
    const text = searchParams.get('q') || searchParams.get('text') || '***';
    // NOTE: ?page/?pageNumber is not honoured. `SediaAdapter.searchSedia` paginates
    // internally from page 1 up to maxPages and reports pageNumber 1, so there is no
    // page argument to forward. Parsing one here only implied otherwise.
    const rawPageSize = Number.parseInt(searchParams.get('limit') || searchParams.get('pageSize') || '20', 10);
    if (!Number.isFinite(rawPageSize)) {
      return NextResponse.json({ success: false, error: 'invalid_limit' }, { status: 400 });
    }
    const pageSize = Math.min(CAGRILAR_MAX_PAGE_SIZE, Math.max(1, rawPageSize));
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
      maxPages: MAX_PAGES, // Limit API calls for web endpoint
      statuses,
      frameworkProgrammes,
      types,
      languages: [lang, 'en'],
      signal,
    });

    // Not one page came back: SEDIA is down or slower than the budget. A 200
    // with no topics would read as "no calls match", which is not what happened.
    if (result.topics.length === 0 && result.errors.length > 0) {
      logger.warn('[API /api/cagrilar] SEDIA returned no page', { firstError: result.errors[0] });
      return internalError(
        {
          success: false,
          error: 'sedia_unavailable',
          message: 'The EU funding portal (SEDIA) did not answer in time. Please try again shortly.',
        },
        { status: 503, headers: { 'Retry-After': '30' } }
      );
    }

    let processedTopics = result.topics;
    let translated = false;

    // If requested language is Turkish, translate titles & descriptions to Turkish,
    // within what is left of the budget. A partial translation is thrown away so
    // the list is never half Turkish, half English.
    if (lang === 'tr' && processedTopics.length > 0 && !signal.aborted) {
      const turkish = await translateTopicsBatch(processedTopics, 'tr', signal);
      if (!signal.aborted) {
        processedTopics = turkish;
        translated = true;
      }
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
      topics: processedTopics,
      translated,
    });
  } catch (error) {
    // If the client aborted the request (closed page, cancelled, etc), the signal fires and
    // any pending work (e.g., SEDIA fetch or translation) throws AbortError. This is expected,
    // not a server error — return gracefully instead of logging as "internal error".
    if (error instanceof DOMException && error.name === 'AbortError') {
      // The client is already gone; 503 won't reach them, but do not leave unhandled exceptions.
      return internalError(
        { success: false, error: 'client_aborted' },
        { status: 503 }
      );
    }
    // Other errors are unexpected.
    logger.error('[API /api/cagrilar] Internal error:', error);
    return internalError({ success: false, error: 'internal_error' });
  } finally {
    clearTimeout(budgetTimer);
  }
}

