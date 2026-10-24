import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  PARTNER_SEARCH_USER_AGENT,
  PartnerSearchBlockedError,
  PartnerSearchClient,
  PartnerSearchUnavailableError,
} from '@/lib/adapters/partner-search';

const fixture = JSON.parse(
  readFileSync(path.join(process.cwd(), 'tests/fixtures/partner-search/topicOrganisations.sample.json'), 'utf8')
);

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

/** A client with a fake clock and a recorded sleep, so pacing and backoff are assertable. */
function clientWith(responses: Array<Response | Error>, opts: { circuitThreshold?: number } = {}) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const sleeps: number[] = [];
  let clock = 0;
  const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url: String(url), init });
    const next = responses.shift();
    if (!next) throw new Error('no more fake responses');
    if (next instanceof Error) throw next;
    return next;
  }) as unknown as typeof fetch;
  const client = new PartnerSearchClient({
    fetchImpl,
    sleep: async (ms) => {
      sleeps.push(ms);
      clock += ms;
    },
    now: () => clock,
    circuitThreshold: opts.circuitThreshold,
  });
  return { client, calls, sleeps };
}

describe('PartnerSearchClient.fetchTopic', () => {
  it('posts to topicOrganisations with ccm2Id in the query string, with the identifying User-Agent', async () => {
    const { client, calls } = clientWith([jsonResponse(fixture)]);
    await client.fetchTopic('HORIZON-CL4-2027-01-MAT-PROD-22', '50127991');
    expect(calls[0]?.url).toBe(
      'https://ec.europa.eu/info/funding-tenders/opportunities/api/partnerSearch/topicOrganisations.json?ccm2Id=50127991'
    );
    expect(calls[0]?.init.method).toBe('POST');
    expect(new Headers(calls[0]?.init.headers).get('User-Agent')).toBe(PARTNER_SEARCH_USER_AGENT);
    expect(PARTNER_SEARCH_USER_AGENT).toContain('info@fonbridge.com');
    // HTTP header values are ByteStrings: the User-Agent must stay within code points ≤ 255.
    expect([...PARTNER_SEARCH_USER_AGENT].every((c) => c.charCodeAt(0) <= 255)).toBe(true);
  });

  it('keeps organisation rows, counts the person row, and never stores ecasId', async () => {
    const { client } = clientWith([jsonResponse(fixture)]);
    const result = await client.fetchTopic('HORIZON-CL4-2027-01-MAT-PROD-22', '50127991');
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.rows).toHaveLength(3);
    expect(result.personCount).toBe(1);
    expect(result.withdrawnCount).toBe(7);
    expect(JSON.stringify(result)).not.toContain('ECAS-TEST-0000');
    expect(JSON.stringify(result)).not.toContain('ecasId');
    for (const row of result.rows) {
      expect(Object.keys(row).sort()).toEqual(
        [
          'expertise',
          'id',
          'interestStatus',
          'organisationName',
          'organisationType',
          'pic',
          'country',
          'requestDate',
          'summary',
          'topicIdentifier',
        ].sort()
      );
    }
  });

  it('a broken row shape is drift: no rows returned, the topic is not written', async () => {
    const broken = structuredClone(fixture);
    broken.topicOrganizations[0].expertise = 'Expertise_something_else';
    const { client } = clientWith([jsonResponse(broken)]);
    const result = await client.fetchTopic('HORIZON-CL4-2027-01-MAT-PROD-22', '50127991');
    expect(result.status).toBe('drift');
    expect(result.schemaDrift[0]).toMatch(/topicOrganizations\[0\]/);
  });

  // FO-60 review 1 (gizlilik): only an explicit ORGANISATION is stored. Anything else is either
  // counted (PERSON) or dropped as drift; a row that is not typed is never taken for an organisation.
  it('a row without a type is drift, not an organisation', async () => {
    const untyped = structuredClone(fixture);
    delete untyped.topicOrganizations[0].type;
    const { client } = clientWith([jsonResponse(untyped)]);
    const result = await client.fetchTopic('HORIZON-CL4-2027-01-MAT-PROD-22', '50127991');
    expect(result.status).toBe('drift');
    expect(result.schemaDrift[0]).toMatch(/topicOrganizations\[0\]: unknown type/);
  });

  it.each(['Person', ''])('a row typed %j is drift, not an organisation', async (type) => {
    const odd = structuredClone(fixture);
    odd.topicOrganizations[0].type = type;
    const { client } = clientWith([jsonResponse(odd)]);
    const result = await client.fetchTopic('HORIZON-CL4-2027-01-MAT-PROD-22', '50127991');
    expect(result.status).toBe('drift');
    expect(result.schemaDrift[0]).toMatch(/topicOrganizations\[0\]: unknown type/);
  });

  it('a row typed PERSON is counted and dropped, not reported as drift', async () => {
    const { client } = clientWith([jsonResponse(fixture)]);
    const result = await client.fetchTopic('HORIZON-CL4-2027-01-MAT-PROD-22', '50127991');
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.personCount).toBe(1);
    expect(result.rows.map((r) => r.organisationName)).not.toContain('<masked-person>');
  });

  // FO-60 review 2 (alarm): an unparseable requestDate must raise drift, not fail later at the DB write.
  it('a requestDate that is not a date is drift, not a silent write failure', async () => {
    const bad = structuredClone(fixture);
    bad.topicOrganizations[0].requestDate = '19/10/2026';
    const { client } = clientWith([jsonResponse(bad)]);
    const result = await client.fetchTopic('HORIZON-CL4-2027-01-MAT-PROD-22', '50127991');
    expect(result.status).toBe('drift');
    expect(result.schemaDrift[0]).toMatch(/topicOrganizations\[0\]: requestDate/);
  });

  it('a broken envelope is drift', async () => {
    const { client } = clientWith([jsonResponse({ somethingElse: [] })]);
    const result = await client.fetchTopic('HORIZON-CL4-2027-01-MAT-PROD-22', '50127991');
    expect(result.status).toBe('drift');
  });

  it('403 stops at once: no retry, PartnerSearchBlockedError', async () => {
    const { client, calls } = clientWith([new Response('no', { status: 403 })]);
    await expect(client.fetchTopic('T', '1')).rejects.toBeInstanceOf(PartnerSearchBlockedError);
    expect(calls).toHaveLength(1);
  });

  it('429 stops at once with the status on the error', async () => {
    const { client, calls } = clientWith([new Response('slow down', { status: 429 })]);
    const err = await client.fetchTopic('T', '1').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PartnerSearchBlockedError);
    expect((err as PartnerSearchBlockedError).status).toBe(429);
    expect(calls).toHaveLength(1);
  });

  it('a 5xx is retried with exponential backoff, then succeeds', async () => {
    const { client, calls, sleeps } = clientWith([
      new Response('busy', { status: 503 }),
      new Response('busy', { status: 503 }),
      jsonResponse(fixture),
    ]);
    const result = await client.fetchTopic('T', '1');
    expect(result.status).toBe('ok');
    expect(calls).toHaveLength(3);
    // Backoff before retries 1 and 2 (1 s, 2 s), plus the pacing gap before each request.
    expect(sleeps).toContain(1_000);
    expect(sleeps).toContain(2_000);
  });

  it('paces requests at least one second apart', async () => {
    const { client, sleeps } = clientWith([jsonResponse(fixture), jsonResponse(fixture)]);
    await client.fetchTopic('A', '1');
    await client.fetchTopic('B', '2');
    // The second request waits out the rest of the one-second gap.
    expect(sleeps.some((ms) => ms > 0 && ms <= 1_000)).toBe(true);
  });

  it('a non-403/429 4xx fails without retry and counts toward the circuit', async () => {
    const { client, calls } = clientWith([new Response('bad', { status: 400 })]);
    await expect(client.fetchTopic('T', '1')).rejects.toBeInstanceOf(PartnerSearchUnavailableError);
    expect(calls).toHaveLength(1);
  });

  it('the circuit opens after consecutive transport failures and refuses further requests', async () => {
    const failing = () => new Error('socket hang up');
    const { client, calls } = clientWith(
      [failing(), failing(), failing(), failing(), failing(), failing(), failing(), failing(), failing(), failing(), failing(), failing()],
      { circuitThreshold: 1 }
    );
    await expect(client.fetchTopic('T', '1')).rejects.toBeInstanceOf(PartnerSearchUnavailableError);
    expect(client.circuitOpen).toBe(true);
    const callsBefore = calls.length;
    await expect(client.fetchTopic('T', '2')).rejects.toThrow(/circuit open/);
    expect(calls.length).toBe(callsBefore);
  });
});

describe('PartnerSearchClient.fetchCcm2Map', () => {
  it('maps identifier to ccm2Id from the SEDIA listing and stops at a short page', async () => {
    const page = {
      totalResults: 2,
      results: [
        { metadata: { identifier: ['HORIZON-A'], ccm2Id: ['111'] } },
        { metadata: { identifier: ['HORIZON-B'], ccm2Id: ['222'] } },
      ],
    };
    const { client, calls } = clientWith([jsonResponse(page)]);
    const map = await client.fetchCcm2Map({ pageSize: 100 });
    expect(map.get('HORIZON-A')).toBe('111');
    expect(map.get('HORIZON-B')).toBe('222');
    expect(calls).toHaveLength(1);
  });
});
