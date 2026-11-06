/**
 * FO-396. Does the EU participant register know this PIC?
 *
 * The no-history partner grant (FO-384) is a discount for a NEW organisation. Zero CORDIS rows
 * does not prove newness: a PIC typed in wrongly, or one never registered, also has zero rows.
 * The public funding-tenders profile endpoint answers "is this PIC registered, and under what name".
 *
 * Contract:
 *   • `checkPicRegistry` never throws. Anything other than a clear answer is `UNKNOWN`, which the
 *     scorer treats as "no grant" (the safe side).
 *   • The request is anonymous and bounded: a short timeout and a byte cap, no cookies, no session.
 *     It is a plain GET of a public profile, not a portal login.
 *   • The organisation name is returned to the caller only to decide the status. It is never
 *     logged here.
 */

export const PIC_REGISTRY_STATUSES = ['FOUND', 'NOT_FOUND', 'UNKNOWN'] as const;
export type PicRegistryStatus = (typeof PIC_REGISTRY_STATUSES)[number];

import { env } from '@/lib/env';

export const PIC_REGISTRY_DEFAULT_URL =
  'https://ec.europa.eu/info/funding-tenders/opportunities/api/orgProfile/data.json';

/** The only host a production call may reach (SSRF guard: a configured URL cannot point elsewhere). */
const PRODUCTION_HOSTS: ReadonlySet<string> = new Set(['ec.europa.eu']);
/** Reachable only when the test flag is on (a local stub in the test runs). */
const LOCAL_HOSTS: ReadonlySet<string> = new Set(['127.0.0.1', 'localhost']);

/**
 * True when the address may be called at all: the host is on the allow-list, no credentials are
 * embedded, and production hosts use https. Local hosts are allowed only with `allowLocal`.
 */
export function isAllowedRegistryUrl(raw: string, allowLocal: boolean): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.username !== '' || url.password !== '') return false;
  if (PRODUCTION_HOSTS.has(url.hostname)) return url.protocol === 'https:';
  if (allowLocal && LOCAL_HOSTS.has(url.hostname)) return url.protocol === 'http:' || url.protocol === 'https:';
  return false;
}

export interface PicRegistrySettings {
  url?: string;
  off?: boolean;
  allowLocal?: boolean;
  nodeEnv?: string;
}

function settingsFromEnv(): PicRegistrySettings {
  return {
    url: env.PIC_REGISTRY_URL,
    off: env.PIC_REGISTRY_OFF === 'true',
    allowLocal: env.PIC_REGISTRY_ALLOW_LOCAL === 'true' || env.NODE_ENV === 'test',
    nodeEnv: env.NODE_ENV,
  };
}

/**
 * The address to ask, or `null` when no call may be made. Off wins. Without a configured URL only
 * production uses the public address; anywhere else (dev, test, e2e) there is no call (fail-closed).
 */
export function resolvePicRegistryUrl(source: PicRegistrySettings = settingsFromEnv()): string | null {
  if (source.off) return null;
  const candidate = source.url ?? (source.nodeEnv === 'production' ? PIC_REGISTRY_DEFAULT_URL : null);
  if (candidate === null) return null;
  return isAllowedRegistryUrl(candidate, localAllowed(source)) ? candidate : null;
}

/**
 * The local-address test flag (FO-396 Ö2). Never honoured in production: a stray
 * PIC_REGISTRY_ALLOW_LOCAL=true on the live server would otherwise point the check at 127.0.0.1.
 */
function localAllowed(source: PicRegistrySettings): boolean {
  return source.allowLocal === true && source.nodeEnv !== 'production';
}

/** Five seconds: the save waits for this, so a slow register must not hold the form. */
export const PIC_REGISTRY_TIMEOUT_MS = 5_000;

/** The profile JSON is a few KB. Anything past this is not the answer we asked for. */
export const PIC_REGISTRY_MAX_BYTES = 256 * 1024;

export type PicRegistryReason =
  | 'found'
  | 'not_registered'
  | 'timeout'
  | 'network'
  | 'http_error'
  | 'too_large'
  | 'bad_json'
  | 'schema_changed'
  /** No address is configured for this environment, or the check is switched off: nothing is sent. */
  | 'disabled'
  /** A configured address whose host is not on the allow-list: nothing is sent. */
  | 'host_not_allowed';

export interface PicRegistryResult {
  status: PicRegistryStatus;
  reason: PicRegistryReason;
}

export interface PicRegistryDeps {
  fetch?: typeof fetch;
  baseUrl?: string;
  timeoutMs?: number;
  maxBytes?: number;
  /** Test-only: allow 127.0.0.1 / localhost as the address (a local stub). Default: the env flag. */
  allowLocal?: boolean;
}

/**
 * Pure: the status for a parsed profile body. `publicOrganizationData` is an object whose
 * `legalName` is a non-empty string → FOUND; present with an empty name → NOT_FOUND. A body
 * without that object is a shape we do not recognise → UNKNOWN (`schema_changed`), never a guess.
 */
export function classifyPicRegistryBody(body: unknown): PicRegistryResult {
  if (typeof body !== 'object' || body === null) return { status: 'UNKNOWN', reason: 'schema_changed' };
  const data = (body as { publicOrganizationData?: unknown }).publicOrganizationData;
  if (typeof data !== 'object' || data === null) return { status: 'UNKNOWN', reason: 'schema_changed' };
  const legalName = (data as { legalName?: unknown }).legalName;
  if (typeof legalName === 'string' && legalName.trim() !== '') return { status: 'FOUND', reason: 'found' };
  // Explicit empty or null is the register saying "no such organisation". A missing field means the
  // shape changed: UNKNOWN with an alert, so a renamed field is not silently read as "not registered".
  if (legalName === null || typeof legalName === 'string') return { status: 'NOT_FOUND', reason: 'not_registered' };
  return { status: 'UNKNOWN', reason: 'schema_changed' };
}

async function readCapped(response: Response, maxBytes: number): Promise<string | null> {
  const declared = Number(response.headers.get('content-length') ?? '');
  if (Number.isFinite(declared) && declared > maxBytes) return null;
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

/** Asks the register about one PIC. Input is the bare nine digits (see `TenantPicSchema`). */
export async function checkPicRegistry(pic: string, deps: PicRegistryDeps = {}): Promise<PicRegistryResult> {
  const settings = settingsFromEnv();
  // FO-396 fail-closed: check the address BEFORE any fetch. No address, switched off, or a host off
  // the allow-list → UNKNOWN with no request sent.
  if (settings.off) return { status: 'UNKNOWN', reason: 'disabled' };
  const base = deps.baseUrl ?? resolvePicRegistryUrl(settings);
  if (base === null) return { status: 'UNKNOWN', reason: 'disabled' };
  if (!isAllowedRegistryUrl(base, localAllowed({ ...settings, allowLocal: deps.allowLocal ?? settings.allowLocal }))) {
    return { status: 'UNKNOWN', reason: 'host_not_allowed' };
  }

  const doFetch = deps.fetch ?? fetch;
  const timeoutMs = deps.timeoutMs ?? PIC_REGISTRY_TIMEOUT_MS;
  const maxBytes = deps.maxBytes ?? PIC_REGISTRY_MAX_BYTES;
  const url = `${base}?pic=${encodeURIComponent(pic)}`;

  let response: Response;
  try {
    response = await doFetch(url, {
      method: 'GET',
      headers: { accept: 'application/json' },
      credentials: 'omit',
      redirect: 'error',
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    const name = error instanceof Error ? error.name : '';
    return { status: 'UNKNOWN', reason: name === 'TimeoutError' || name === 'AbortError' ? 'timeout' : 'network' };
  }
  if (!response.ok) return { status: 'UNKNOWN', reason: 'http_error' };

  let text: string | null;
  try {
    text = await readCapped(response, maxBytes);
  } catch {
    return { status: 'UNKNOWN', reason: 'timeout' };
  }
  if (text === null) return { status: 'UNKNOWN', reason: 'too_large' };

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return { status: 'UNKNOWN', reason: 'bad_json' };
  }
  return classifyPicRegistryBody(body);
}
