import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { internalError } from '@/lib/api-error';
import { SediaAdapter, type SediaSearchOptions } from '@/lib/adapters/sedia';
import { translateTopicsBatch } from '@/lib/translation';
import { requireTenantApi } from '@/lib/tenant';
import { ngGateResponse } from '@/lib/billing/nexagrant/route-gate';
import { logger } from '@/lib/logger';
import { UserWindowLimiter } from '@/lib/user-rate-limit';
import { SEDIA_RESULT_WINDOW, clampSearchText } from '@/lib/calls-paging';
import { cagrilarCache, searchCacheKey, shareInFlight } from '@/lib/cagrilar-cache';

/**
 * The largest page this route asks SEDIA for. Every title on the page is
 * translated, so an uncapped `limit` multiplied into thousands of outbound
 * calls per request (TASK-MUN66T2HM4A4E O-1).
 */
const CAGRILAR_MAX_PAGE_SIZE = 50;

/**
 * The highest page number a caller may ask for (FO-42). One request reads one
 * SEDIA page, so this only bounds how deep a loop can walk, not how much work
 * a single request does.
 */
const CAGRILAR_MAX_PAGE_NUMBER = 1000;

/**
 * Plain digits only, no leading zero. `z.coerce.number()` would also take
 * " 2 ", "2.0", "1e1" and "0x2", so the same page could be asked for under
 * several spellings.
 */
const PageParamSchema = z
  .string()
  .regex(/^[1-9]\d{0,3}$/)
  .transform(Number)
  .pipe(z.number().max(CAGRILAR_MAX_PAGE_NUMBER));

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

/**
 * One SEDIA call, remembered when it came back whole. A page cut short by the
 * budget or carrying a SEDIA error is not stored: the next visitor would be
 * served the gap for ten minutes.
 *
 * The shared call is bound to the budget only, never to the first caller's
 * request signal: a visitor who closes the page must not turn the call into a
 * 503 for the others waiting on it (FO-204 A-1).
 */
async function searchSediaAndRemember(cacheKey: string, options: SediaSearchOptions) {
  const result = await new SediaAdapter().searchSedia(options);
  const aborted = options.signal?.aborted ?? false;
  if (!aborted && result.errors.length === 0) cagrilarCache.set(cacheKey, result);
  return result;
}

export async function GET(request: NextRequest) {
  // Signed-in members only: the one consumer is the (app) calls page, and an
  // anonymous caller could otherwise spend SEDIA and translation quota at will.
  const tenant = await requireTenantApi();
  if (!tenant.ok) return tenant.response;

  // NG-250: the NexaGrant plan gate, before SEDIA or translation is spent.
  const ngRefused = await ngGateResponse(tenant.scope, 'search_calls', 'call_search');
  if (ngRefused) return ngRefused;

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
    const text = clampSearchText(searchParams.get('q') || searchParams.get('text') || '***');
    const rawPage = searchParams.get('page');
    const pageParsed = rawPage === null ? { success: true as const, data: 1 } : PageParamSchema.safeParse(rawPage);
    if (!pageParsed.success) {
      return NextResponse.json({ success: false, error: 'invalid_page' }, { status: 400 });
    }
    const page = pageParsed.data;

    const rawPageSize = Number.parseInt(searchParams.get('limit') || searchParams.get('pageSize') || '20', 10);
    if (!Number.isFinite(rawPageSize)) {
      return NextResponse.json({ success: false, error: 'invalid_limit' }, { status: 400 });
    }
    const pageSize = Math.min(CAGRILAR_MAX_PAGE_SIZE, Math.max(1, rawPageSize));
    // A page past SEDIA's window is a 400, not a 200 the calls page would show as "0 results".
    if (page * pageSize > SEDIA_RESULT_WINDOW) {
      return NextResponse.json({ success: false, error: 'page_out_of_window' }, { status: 400 });
    }
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

    // The English SEDIA page is what gets remembered; translation runs on every
    // request below, so a quota outage never leaves the list stuck in English.
    const cacheKey = searchCacheKey({ text, page, pageSize, lang, statuses, frameworkProgrammes, types });
    const result =
      cagrilarCache.get(cacheKey) ??
      (await shareInFlight(cacheKey, () =>
        searchSediaAndRemember(cacheKey, {
          text,
          pageSize,
          startPage: page,
          maxPages: 1, // One SEDIA call per request: the page the caller asked for
          statuses,
          frameworkProgrammes,
          types,
          languages: [lang, 'en'],
          signal: budget.signal,
        })
      ));

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
    // the list is never half Turkish, half English; the list then stays English
    // with `translated: false` (MyMemory quota, timeout or error). Texts that were
    // translated before come from translation.ts's cache, so only new ones are sent.
    if (lang === 'tr' && processedTopics.length > 0 && !signal.aborted) {
      const batch = await translateTopicsBatch(processedTopics, 'tr', signal);
      if (!signal.aborted && batch.untranslated === 0) {
        processedTopics = batch.items;
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

