import { describe, expect, it } from 'vitest';
import {
  checkPicRegistry,
  classifyPicRegistryBody,
  isAllowedRegistryUrl,
  PIC_REGISTRY_DEFAULT_URL,
  PIC_REGISTRY_MAX_BYTES,
  PIC_REGISTRY_TIMEOUT_MS,
  resolvePicRegistryUrl,
} from '@/lib/pic-registry';

const STUB = 'http://127.0.0.1:9/orgProfile/data.json';

const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' }, ...init });

describe('FO-396 classifyPicRegistryBody', () => {
  it('FOUND when publicOrganizationData.legalName is a non-empty name', () => {
    expect(classifyPicRegistryBody({ publicOrganizationData: { legalName: 'ACME A.Ş.' } })).toEqual({ status: 'FOUND', reason: 'found' });
  });

  it('NOT_FOUND when the name is empty', () => {
    expect(classifyPicRegistryBody({ publicOrganizationData: { legalName: '  ' } }).status).toBe('NOT_FOUND');
    expect(classifyPicRegistryBody({ publicOrganizationData: { legalName: '' } }).status).toBe('NOT_FOUND');
  });

  it('UNKNOWN (schema_changed) when the object we read is missing, never a guess', () => {
    expect(classifyPicRegistryBody({})).toEqual({ status: 'UNKNOWN', reason: 'schema_changed' });
    expect(classifyPicRegistryBody({ publicOrganizationData: 'x' })).toEqual({ status: 'UNKNOWN', reason: 'schema_changed' });
    expect(classifyPicRegistryBody(null)).toEqual({ status: 'UNKNOWN', reason: 'schema_changed' });
    expect(classifyPicRegistryBody({ publicOrganizationData: { legalName: 42 } }).status).toBe('UNKNOWN');
  });

  it('a missing legalName field is a changed shape (UNKNOWN), not "not registered"', () => {
    expect(classifyPicRegistryBody({ publicOrganizationData: {} })).toEqual({ status: 'UNKNOWN', reason: 'schema_changed' });
    expect(classifyPicRegistryBody({ publicOrganizationData: { legal_name: 'ACME' } })).toEqual({
      status: 'UNKNOWN',
      reason: 'schema_changed',
    });
  });

  it('an explicit null legalName is the register saying "no such organisation" (NOT_FOUND)', () => {
    expect(classifyPicRegistryBody({ publicOrganizationData: { legalName: null } })).toEqual({
      status: 'NOT_FOUND',
      reason: 'not_registered',
    });
  });
});

describe('FO-396 checkPicRegistry (no network: injected fetch)', () => {
  it('asks the register for the PIC with an anonymous, non-redirecting GET', async () => {
    const seen: { url: string; init: RequestInit }[] = [];
    const fetchImpl = (async (url: string, init: RequestInit) => {
      seen.push({ url: String(url), init });
      return json({ publicOrganizationData: { legalName: 'ACME' } });
    }) as typeof fetch;
    const result = await checkPicRegistry('999999999', { baseUrl: STUB, allowLocal: true, fetch: fetchImpl });
    expect(result.status).toBe('FOUND');
    expect(seen[0]?.url).toBe(`${STUB}?pic=999999999`);
    expect(seen[0]?.init.method).toBe('GET');
    expect(seen[0]?.init.credentials).toBe('omit');
    expect(seen[0]?.init.redirect).toBe('error');
    expect(seen[0]?.init.signal).toBeInstanceOf(AbortSignal);
  });

  it('NOT_FOUND for a registered-looking answer with no name', async () => {
    const fetchImpl = (async () => json({ publicOrganizationData: { legalName: '' } })) as typeof fetch;
    expect((await checkPicRegistry('123456789', { baseUrl: STUB, allowLocal: true, fetch: fetchImpl })).status).toBe('NOT_FOUND');
  });

  it('UNKNOWN on HTTP error, network failure, timeout', async () => {
    const e500 = (async () => new Response('no', { status: 500 })) as typeof fetch;
    expect(await checkPicRegistry('123456789', { baseUrl: STUB, allowLocal: true, fetch: e500 })).toEqual({ status: 'UNKNOWN', reason: 'http_error' });

    const down = (async () => { throw new TypeError('fetch failed'); }) as typeof fetch;
    expect(await checkPicRegistry('123456789', { baseUrl: STUB, allowLocal: true, fetch: down })).toEqual({ status: 'UNKNOWN', reason: 'network' });

    const slow = (async () => { throw new DOMException('signal timed out', 'TimeoutError'); }) as typeof fetch;
    expect(await checkPicRegistry('123456789', { baseUrl: STUB, allowLocal: true, fetch: slow })).toEqual({ status: 'UNKNOWN', reason: 'timeout' });
  });

  it('gives up at the timeout: a hanging register is UNKNOWN in about timeoutMs, not later', async () => {
    // A fetch that only ever settles when its signal aborts, like a server that never answers.
    const hangs = ((_url: string, init: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(init.signal?.reason));
      })) as typeof fetch;
    const started = Date.now();
    const result = await checkPicRegistry('123456789', { baseUrl: STUB, allowLocal: true, fetch: hangs, timeoutMs: 50 });
    const elapsed = Date.now() - started;
    expect(result).toEqual({ status: 'UNKNOWN', reason: 'timeout' });
    expect(elapsed).toBeGreaterThanOrEqual(40);
    expect(elapsed).toBeLessThan(2_000);
  });

  it('the default timeout is five seconds', () => {
    expect(PIC_REGISTRY_TIMEOUT_MS).toBe(5_000);
  });

  it('UNKNOWN when the declared size is over the cap', async () => {
    const fetchImpl = (async () =>
      new Response('{}', { status: 200, headers: { 'content-length': String(PIC_REGISTRY_MAX_BYTES + 1) } })) as typeof fetch;
    expect((await checkPicRegistry('123456789', { baseUrl: STUB, allowLocal: true, fetch: fetchImpl })).reason).toBe('too_large');
  });

  it('UNKNOWN when the streamed body is over the cap, even without a length header', async () => {
    const big = new Uint8Array(1024).fill(32);
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (let i = 0; i < 4; i++) controller.enqueue(big);
        controller.close();
      },
    });
    const fetchImpl = (async () => new Response(stream, { status: 200 })) as typeof fetch;
    expect((await checkPicRegistry('123456789', { baseUrl: STUB, allowLocal: true, fetch: fetchImpl, maxBytes: 3000 })).reason).toBe('too_large');
  });

  it('UNKNOWN on a body that is not JSON', async () => {
    const fetchImpl = (async () => new Response('<html>', { status: 200 })) as typeof fetch;
    expect(await checkPicRegistry('123456789', { baseUrl: STUB, allowLocal: true, fetch: fetchImpl })).toEqual({ status: 'UNKNOWN', reason: 'bad_json' });
  });
});

describe('FO-396 fail-closed: no address, no call (fetch spy must see zero calls)', () => {
  const spy = () => {
    const calls: string[] = [];
    const fetchImpl = (async (url: string) => {
      calls.push(String(url));
      return json({ publicOrganizationData: { legalName: 'ACME' } });
    }) as typeof fetch;
    return { calls, fetchImpl };
  };

  it('test environment with no configured address: UNKNOWN disabled, zero fetches', async () => {
    const { calls, fetchImpl } = spy();
    expect(await checkPicRegistry('123456789', { fetch: fetchImpl })).toEqual({ status: 'UNKNOWN', reason: 'disabled' });
    expect(calls).toEqual([]);
  });

  it('a host off the allow-list is never called: UNKNOWN host_not_allowed, zero fetches', async () => {
    const { calls, fetchImpl } = spy();
    for (const baseUrl of ['https://evil.example/data.json', 'https://user:pw@ec.europa.eu/x', 'http://ec.europa.eu/x']) {
      expect(await checkPicRegistry('123456789', { fetch: fetchImpl, baseUrl })).toEqual({
        status: 'UNKNOWN',
        reason: 'host_not_allowed',
      });
    }
    expect(calls).toEqual([]);
  });

  it('the production address is on the allow-list; local hosts are allowed only with the test flag', () => {
    expect(isAllowedRegistryUrl(PIC_REGISTRY_DEFAULT_URL, false)).toBe(true);
    expect(isAllowedRegistryUrl(STUB, true)).toBe(true);
    expect(isAllowedRegistryUrl(STUB, false)).toBe(false);
    expect(isAllowedRegistryUrl('not a url', true)).toBe(false);
  });

  it('resolve: off wins; production without a URL uses the public address; other envs without a URL get null', () => {
    expect(resolvePicRegistryUrl({ url: STUB, off: true, allowLocal: true, nodeEnv: 'test' })).toBeNull();
    expect(resolvePicRegistryUrl({ nodeEnv: 'production' })).toBe(PIC_REGISTRY_DEFAULT_URL);
    expect(resolvePicRegistryUrl({ nodeEnv: 'development' })).toBeNull();
    expect(resolvePicRegistryUrl({ nodeEnv: 'test' })).toBeNull();
    expect(resolvePicRegistryUrl({ url: 'https://evil.example/x', nodeEnv: 'production' })).toBeNull();
  });

  it('the four answers the register can give, each from a stub (FOUND, NOT_FOUND, UNKNOWN, and the unchecked null)', async () => {
    const found = (async () => json({ publicOrganizationData: { legalName: 'ACME' } })) as typeof fetch;
    const notFound = (async () => json({ publicOrganizationData: { legalName: null } })) as typeof fetch;
    const unknown = (async () => new Response('x', { status: 503 })) as typeof fetch;
    expect((await checkPicRegistry('123456789', { baseUrl: STUB, allowLocal: true, fetch: found })).status).toBe('FOUND');
    expect((await checkPicRegistry('123456789', { baseUrl: STUB, allowLocal: true, fetch: notFound })).status).toBe('NOT_FOUND');
    expect((await checkPicRegistry('123456789', { baseUrl: STUB, allowLocal: true, fetch: unknown })).status).toBe('UNKNOWN');
    // null is not produced by the client: it is the stored value of a tenant never checked (see the loader test).
  });
});
