import { describe, expect, it } from 'vitest';
import { checkPicRegistry, classifyPicRegistryBody, PIC_REGISTRY_MAX_BYTES } from '@/lib/pic-registry';

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
});

describe('FO-396 checkPicRegistry (no network: injected fetch)', () => {
  it('asks the register for the PIC with an anonymous, non-redirecting GET', async () => {
    const seen: { url: string; init: RequestInit }[] = [];
    const fetchImpl = (async (url: string, init: RequestInit) => {
      seen.push({ url: String(url), init });
      return json({ publicOrganizationData: { legalName: 'ACME' } });
    }) as typeof fetch;
    const result = await checkPicRegistry('999999999', { fetch: fetchImpl, baseUrl: 'https://register.test/data.json' });
    expect(result.status).toBe('FOUND');
    expect(seen[0]?.url).toBe('https://register.test/data.json?pic=999999999');
    expect(seen[0]?.init.method).toBe('GET');
    expect(seen[0]?.init.credentials).toBe('omit');
    expect(seen[0]?.init.redirect).toBe('error');
    expect(seen[0]?.init.signal).toBeInstanceOf(AbortSignal);
  });

  it('NOT_FOUND for a registered-looking answer with no name', async () => {
    const fetchImpl = (async () => json({ publicOrganizationData: { legalName: '' } })) as typeof fetch;
    expect((await checkPicRegistry('123456789', { fetch: fetchImpl })).status).toBe('NOT_FOUND');
  });

  it('UNKNOWN on HTTP error, network failure, timeout', async () => {
    const e500 = (async () => new Response('no', { status: 500 })) as typeof fetch;
    expect(await checkPicRegistry('123456789', { fetch: e500 })).toEqual({ status: 'UNKNOWN', reason: 'http_error' });

    const down = (async () => { throw new TypeError('fetch failed'); }) as typeof fetch;
    expect(await checkPicRegistry('123456789', { fetch: down })).toEqual({ status: 'UNKNOWN', reason: 'network' });

    const slow = (async () => { throw new DOMException('signal timed out', 'TimeoutError'); }) as typeof fetch;
    expect(await checkPicRegistry('123456789', { fetch: slow })).toEqual({ status: 'UNKNOWN', reason: 'timeout' });
  });

  it('UNKNOWN when the declared size is over the cap', async () => {
    const fetchImpl = (async () =>
      new Response('{}', { status: 200, headers: { 'content-length': String(PIC_REGISTRY_MAX_BYTES + 1) } })) as typeof fetch;
    expect((await checkPicRegistry('123456789', { fetch: fetchImpl })).reason).toBe('too_large');
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
    expect((await checkPicRegistry('123456789', { fetch: fetchImpl, maxBytes: 3000 })).reason).toBe('too_large');
  });

  it('UNKNOWN on a body that is not JSON', async () => {
    const fetchImpl = (async () => new Response('<html>', { status: 200 })) as typeof fetch;
    expect(await checkPicRegistry('123456789', { fetch: fetchImpl })).toEqual({ status: 'UNKNOWN', reason: 'bad_json' });
  });
});
