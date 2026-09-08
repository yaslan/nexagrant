import { env } from '@/lib/env';

/**
 * The TCMB daily bulletin, read for the one figure a Turkish invoice needs.
 *
 * ADR-0002 (decided 2026-09-08, option (b)) issues an invoice in its own
 * currency and states the Turkish lira equivalent beside it. VUK 280 fixes
 * which rate that conversion may use: the **TCMB döviz alış (forex buying)
 * rate of the invoice's issue date**. Not the rate Stripe settled at, not
 * today's rate, not an average — that specific published figure.
 *
 * Nothing in this repo could fetch it before this module. The invoice writer
 * therefore had no honest way to fill the rate in, and `foreignCurrencyFilingBlock`
 * refused to file any foreign-currency document at all.
 *
 * ## What this module will not do
 *
 * It has no fallback rate, no "close enough" rate, and no memory of a rate
 * fetched for some other day. A rate on an invoice is a fiscal assertion; a
 * guessed one is a false entry in a legal document (ADR-0002, KARAR §4). When
 * the bulletin cannot be read, this returns a failure and the caller does not
 * issue the invoice — decided by the boss on 2026-09-08: **issuing stops and a
 * SystemAlert is raised; the last known rate is never substituted.**
 *
 * ## Weekend and holiday shift — and how it differs from a fallback
 *
 * TCMB publishes on working days only. An invoice issued on a Sunday is
 * converted at the most recently *published* bulletin, which is the accepted
 * reading of VUK 280 and is not an approximation: that bulletin is the rate in
 * force. So a missing bulletin (HTTP 404) walks one day back, up to
 * `MAX_LOOKBACK_DAYS`.
 *
 * A *failure to reach TCMB* does not walk back. That distinction is the whole
 * safety property of this file: walking back through an outage would quietly
 * hand the caller a stale rate under the same shape as a legitimate one, which
 * is exactly the fallback the decision forbids. Only a bulletin TCMB actually
 * served (404 = "there is no bulletin for that day") moves the cursor; a
 * timeout, a connection error or a 5xx fails immediately.
 *
 * Whichever day is used is returned in `rateDate` and stored on the invoice, so
 * the shift is visible on the record rather than implied.
 */

/** Currencies Fabrika can invoice in that are not already TRY. */
export type ConvertibleCurrency = 'USD' | 'EUR';

export interface TcmbRate {
  currency: ConvertibleCurrency;
  /** TRY per one unit of `currency`, forex buying, as published. */
  rate: number;
  /** The bulletin actually used, `YYYY-MM-DD`. May precede the requested date. */
  rateDate: string;
  /** Provenance, stored on the invoice row. Only ever this value. */
  source: 'TCMB';
}

export type TcmbFailureReason =
  /** TCMB could not be reached at all: DNS, connection, timeout, or a 5xx. */
  | 'unreachable'
  /** TCMB answered, but published no bulletin within the look-back window. */
  | 'no_bulletin_in_window'
  /** A bulletin was served but does not quote this currency. */
  | 'currency_not_quoted'
  /** A bulletin was served but is not the document this parser understands. */
  | 'malformed_bulletin';

export interface TcmbFailure {
  reason: TcmbFailureReason;
  /**
   * Operator-facing detail for the SystemAlert. Carries URLs, status codes and
   * dates only — never a customer, a tenant or an amount.
   */
  detail: string;
}

export type TcmbRateResult =
  | { ok: true; rate: TcmbRate }
  | { ok: false; failure: TcmbFailure };

/** TCMB's bulletin archive. Overridable so tests never touch the real host. */
const DEFAULT_BASE_URL = 'https://www.tcmb.gov.tr/kurlar';

/**
 * How many calendar days back a missing bulletin is chased.
 *
 * The longest run of consecutive Turkish non-working days is a nine-day
 * Kurban Bayramı bridge; ten covers it with a day to spare. Beyond that,
 * "TCMB has published nothing for a week and a half" is not a holiday, it is a
 * fault, and it should surface as one rather than reaching further back for an
 * ever-older rate.
 */
export const MAX_LOOKBACK_DAYS = 10;

/** Per-request ceiling. TCMB is a static file host; a slow answer is a fault. */
const REQUEST_TIMEOUT_MS = 8000;

/**
 * Bulletins already fetched, keyed by their own publication date.
 *
 * Keyed by the *bulletin's* date and populated only from a successful fetch, so
 * this is a cache and not a fallback: a published bulletin for a past day never
 * changes, and a day with no bulletin is never cached, which is what keeps
 * today's request re-checking whether today's bulletin has appeared yet (TCMB
 * publishes around 15:30 Europe/Istanbul).
 */
const bulletinCache = new Map<string, string>();

/** Test seam: drop cached bulletins so a case starts from a known state. */
export function clearTcmbCache(): void {
  bulletinCache.clear();
}

/** `YYYY-MM-DD` for a date, read in UTC like every other timestamp (rule 10). */
export function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * The bulletin URL for one day: `<base>/YYYYMM/DDMMYYYY.xml`.
 *
 * Exported because the shape of this URL is the one assumption in this module
 * that only TCMB can confirm, and a test that asserts it is cheaper than an
 * outage that discovers it.
 */
export function bulletinUrl(isoDate: string, baseUrl: string = resolveBaseUrl()): string {
  const [year, month, day] = isoDate.split('-');
  return `${baseUrl.replace(/\/+$/, '')}/${year}${month}/${day}${month}${year}.xml`;
}

function resolveBaseUrl(): string {
  return env.TCMB_BASE_URL ?? DEFAULT_BASE_URL;
}

/** The day before `isoDate`, in UTC. */
function previousIsoDate(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return toIsoDate(date);
}

/**
 * The forex buying rate for one currency out of one bulletin's XML.
 *
 * A deliberately narrow reader rather than a general XML parser: the bulletin
 * is a fixed, decades-old format, and the failure mode that matters here is not
 * an exotic document but a *plausible* one — an error page, a redirect body or
 * a truncated response answered with 200. Every unexpected shape returns null
 * so the caller reports `malformed_bulletin` instead of inventing a figure.
 *
 * `Unit` is honoured because TCMB quotes some currencies per 100 units (JPY).
 * USD and EUR are quoted per 1 today; reading the field rather than assuming it
 * means a future currency cannot silently arrive off by two orders of magnitude.
 */
export function parseForexBuying(xml: string, currency: ConvertibleCurrency): number | null {
  const block = new RegExp(
    `<Currency[^>]*\\bKod="${currency}"[\\s\\S]*?</Currency>`,
    'i'
  ).exec(xml);
  if (!block?.[0]) return null;

  const buying = /<ForexBuying>\s*([\d.]+)\s*<\/ForexBuying>/i.exec(block[0]);
  const unit = /<Unit>\s*(\d+)\s*<\/Unit>/i.exec(block[0]);
  if (!buying?.[1] || !unit?.[1]) return null;

  const quoted = Number(buying[1]);
  const perUnit = Number(unit[1]);
  if (!Number.isFinite(quoted) || quoted <= 0) return null;
  if (!Number.isInteger(perUnit) || perUnit <= 0) return null;

  const rate = quoted / perUnit;
  return Number.isFinite(rate) && rate > 0 ? rate : null;
}

/**
 * The date a bulletin says it is for, as `YYYY-MM-DD`, or null.
 *
 * Checked against the date requested. TCMB serving yesterday's file under
 * today's URL would otherwise put an undetectably wrong date on an invoice, and
 * a rate is only meaningful together with its day.
 */
export function parseBulletinDate(xml: string): string | null {
  const match = /<Tarih_Date[^>]*\bTarih="(\d{2})\.(\d{2})\.(\d{4})"/i.exec(xml);
  if (!match) return null;
  const [, day, month, year] = match;
  return `${year}-${month}-${day}`;
}

interface FetchOutcome {
  /** The bulletin body, when one was served. */
  xml?: string;
  /** TCMB answered, but has no bulletin for that day (weekend/holiday). */
  absent?: boolean;
  /** TCMB could not be reached, or answered with a server fault. */
  unreachable?: string;
}

async function fetchBulletin(isoDate: string, fetchImpl: typeof fetch): Promise<FetchOutcome> {
  const cached = bulletinCache.get(isoDate);
  if (cached !== undefined) return { xml: cached };

  const url = bulletinUrl(isoDate);
  let response: Response;
  try {
    response = await fetchImpl(url, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: { accept: 'application/xml,text/xml' },
    });
  } catch (error) {
    return { unreachable: `${url}: ${error instanceof Error ? error.message : String(error)}` };
  }

  // 404 is TCMB's answer for "no bulletin that day" — a fact, and the one case
  // that may move the cursor a day back. Anything else in the 4xx/5xx range is
  // a fault: it says nothing about whether a bulletin exists, so walking back
  // on it would be guessing.
  if (response.status === 404) return { absent: true };
  if (!response.ok) return { unreachable: `${url}: HTTP ${response.status}` };

  let xml: string;
  try {
    xml = await response.text();
  } catch (error) {
    return { unreachable: `${url}: ${error instanceof Error ? error.message : String(error)}` };
  }

  bulletinCache.set(isoDate, xml);
  return { xml };
}

export interface TcmbLookupOptions {
  /** Injected in tests, and to disable the client in the disproof probe. */
  fetchImpl?: typeof fetch;
  /** Overrides `MAX_LOOKBACK_DAYS`; only tests need this. */
  maxLookbackDays?: number;
}

/**
 * The TCMB forex buying rate that applies to an invoice issued on `issuedAt`.
 *
 * Never throws and never guesses: every outcome is either a rate TCMB actually
 * published, together with the day it published it, or a failure the caller
 * turns into a SystemAlert and a not-issued invoice.
 */
export async function fetchTcmbBuyingRate(
  currency: ConvertibleCurrency,
  issuedAt: Date,
  options: TcmbLookupOptions = {}
): Promise<TcmbRateResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const lookback = options.maxLookbackDays ?? MAX_LOOKBACK_DAYS;

  let isoDate = toIsoDate(issuedAt);
  const tried: string[] = [];

  for (let attempt = 0; attempt <= lookback; attempt += 1) {
    tried.push(isoDate);
    const outcome = await fetchBulletin(isoDate, fetchImpl);

    if (outcome.unreachable) {
      // Deliberately terminal. See the module comment: chasing earlier days
      // through an outage is how a stale rate reaches a fiscal document.
      return {
        ok: false,
        failure: { reason: 'unreachable', detail: outcome.unreachable },
      };
    }

    if (outcome.absent) {
      isoDate = previousIsoDate(isoDate);
      continue;
    }

    const xml = outcome.xml ?? '';
    const bulletinDate = parseBulletinDate(xml);
    if (!bulletinDate) {
      return {
        ok: false,
        failure: {
          reason: 'malformed_bulletin',
          detail: `${bulletinUrl(isoDate)}: no Tarih_Date header; served ${xml.length} bytes`,
        },
      };
    }
    if (bulletinDate !== isoDate) {
      return {
        ok: false,
        failure: {
          reason: 'malformed_bulletin',
          detail: `${bulletinUrl(isoDate)}: bulletin declares ${bulletinDate}, expected ${isoDate}`,
        },
      };
    }

    const rate = parseForexBuying(xml, currency);
    if (rate === null) {
      return {
        ok: false,
        failure: {
          reason: 'currency_not_quoted',
          detail: `${bulletinUrl(isoDate)}: no usable ForexBuying for ${currency}`,
        },
      };
    }

    return { ok: true, rate: { currency, rate, rateDate: isoDate, source: 'TCMB' } };
  }

  return {
    ok: false,
    failure: {
      reason: 'no_bulletin_in_window',
      detail: `no TCMB bulletin in the ${lookback + 1} days ending ${tried[0]} (tried ${tried.join(', ')})`,
    },
  };
}

/** True for a currency this module can quote; TRY needs no conversion. */
export function isConvertibleCurrency(currency: string): currency is ConvertibleCurrency {
  return currency === 'USD' || currency === 'EUR';
}
