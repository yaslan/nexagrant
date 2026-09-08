/**
 * `runK2MonthlyCordis` — CLAUDE.md rule 6 on the K2 side.
 *
 * The job used to swallow every failure: a worker that was down, or answered
 * 500, returned `success: false` and nothing else. No `SystemAlert`, no record
 * of what the worker actually said. Measured on 2026-09-07, `RawFetch` held
 * zero rows for any CORDIS source.
 *
 * What rule 6 asks for, and what each test here pins:
 *   - the raw answer is kept before it is interpreted;
 *   - schema drift alerts and lets the run stand — it never throws.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

interface StubRow {
  [key: string]: unknown;
}

const rawFetches: StubRow[] = [];
const alerts: StubRow[] = [];

vi.mock('@/lib/db', () => ({
  prisma: {
    rawFetch: {
      findFirst: vi.fn(async ({ where }: { where: { source: string; key: string } }) => {
        const matching = rawFetches.filter((r) => r.source === where.source && r.key === where.key);
        return matching[matching.length - 1] ?? null;
      }),
      create: vi.fn(async ({ data }: { data: StubRow }) => {
        const row = { id: `raw-${rawFetches.length + 1}`, ...data };
        rawFetches.push(row);
        return row;
      }),
    },
    systemAlert: {
      create: vi.fn(async ({ data }: { data: StubRow }) => {
        const row = { id: `alert-${alerts.length + 1}`, ...data };
        alerts.push(row);
        return row;
      }),
    },
  },
}));

const { runK2MonthlyCordis } = await import('../src/lib/inngest/jobs/k2-monthly-cordis');

const WORKER = 'http://worker.invalid:8000';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(() => {
  rawFetches.length = 0;
  alerts.length = 0;
  vi.restoreAllMocks();
});

describe('runK2MonthlyCordis', () => {
  it('passes the requested month to the worker and records the raw answer', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse({ message: 'CORDIS pipeline triggered' }));

    const result = await runK2MonthlyCordis({ month: '2026-09', workerUrl: WORKER });

    expect(result.success).toBe(true);
    expect(String(fetchMock.mock.calls[0]![0])).toContain('month=2026-09');
    expect(rawFetches).toHaveLength(1);
    expect(rawFetches[0]).toMatchObject({ source: 'cordis_worker', key: '2026-09' });
    expect((rawFetches[0]!.payload as { status: number }).status).toBe(200);
    expect(alerts).toHaveLength(0);
  });

  it('records no second RawFetch row when the answer is unchanged', async () => {
    // A fresh Response per call: a body can only be read once, so reusing one
    // object would make the second run *look* like a changed answer.
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      jsonResponse({ message: 'CORDIS pipeline triggered' })
    );

    await runK2MonthlyCordis({ month: '2026-09', workerUrl: WORKER });
    await runK2MonthlyCordis({ month: '2026-09', workerUrl: WORKER });

    expect(rawFetches).toHaveLength(1);
  });

  it('alerts but does not break when the worker drops a field the job reads', async () => {
    // The upstream contract changed: `message` is gone, the run still happened.
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ status: 'queued' }));

    const result = await runK2MonthlyCordis({ month: '2026-09', workerUrl: WORKER });

    expect(result.success).toBe(true);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]!.level).toBe('warn');
    expect((alerts[0]!.meta as { missingFields: string[] }).missingFields).toEqual(['message']);
    // The body that no longer matches is on record, not lost.
    expect((rawFetches[0]!.payload as { body: string }).body).toContain('queued');
  });

  it('alerts and reports failure on a non-2xx, keeping the body', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('<html>gateway timeout</html>', {
        status: 504,
        headers: { 'content-type': 'text/html' },
      })
    );

    const result = await runK2MonthlyCordis({ month: '2026-09', workerUrl: WORKER });

    expect(result.success).toBe(false);
    expect(result.statusCode).toBe(504);
    expect(alerts[0]!.message).toContain('504');
    expect((rawFetches[0]!.payload as { body: string }).body).toContain('gateway timeout');
  });

  it('alerts and reports failure when the worker cannot be reached, without throwing', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('fetch failed'));

    const result = await runK2MonthlyCordis({ month: '2026-09', workerUrl: WORKER });

    expect(result.success).toBe(false);
    expect(result.error).toBe('fetch failed');
    expect(alerts[0]!.level).toBe('error');
    expect(alerts[0]!.message).toContain('unreachable');
  });

  it('alerts when a 2xx body is not JSON, instead of throwing a parse error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('not json at all', { status: 200, headers: { 'content-type': 'text/plain' } })
    );

    const result = await runK2MonthlyCordis({ month: '2026-09', workerUrl: WORKER });

    expect(result.success).toBe(false);
    expect(alerts[0]!.message).toContain('not JSON');
  });

  it('records a failure when the worker reports the pipeline failed', async () => {
    // The worker runs the pipeline before it answers, so a 2xx body carries the
    // outcome. A failed run must not be filed as a green K2 run — that pairing
    // (success: true, zero rows written) is what this job used to produce.
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        success: false,
        message: 'CORDIS pipeline failed',
        error: 'relation "CordisProject" does not exist',
        rowCounts: { projects: 0, organizations: 0, participations: 0, topics: 0 },
      })
    );

    const result = await runK2MonthlyCordis({ month: '2026-09', workerUrl: WORKER });

    expect(result.success).toBe(false);
    expect(result.error).toContain('CordisProject');
    expect(alerts).toHaveLength(1);
    expect(alerts[0]!.level).toBe('error');
    expect(alerts[0]!.message).toContain('failed on the worker');
    // The body that reported the failure is on record either way.
    expect((rawFetches[0]!.payload as { body: string }).body).toContain('CordisProject');
  });

  it('carries the row counts a successful run reported', async () => {
    // "It answered 200" and "it wrote rows" are different claims; the second
    // one is only answerable if the counts survive into the job result.
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        success: true,
        message: 'CORDIS pipeline finished successfully',
        runId: 'wrk_abc',
        rowCounts: { projects: 2, organizations: 3, participations: 4, topics: 2 },
      })
    );

    const result = await runK2MonthlyCordis({ month: '2026-09', workerUrl: WORKER });

    expect(result.success).toBe(true);
    expect((result.workerResponse as { rowCounts: { projects: number } }).rowCounts.projects).toBe(2);
    expect(alerts).toHaveLength(0);
  });

  it('still treats a worker that reports no success field as delivered', async () => {
    // Backwards compatibility: an older worker that only echoes `message` keeps
    // the drift semantics it had, rather than being read as a failure.
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ message: 'CORDIS pipeline triggered' })
    );

    const result = await runK2MonthlyCordis({ month: '2026-09', workerUrl: WORKER });

    expect(result.success).toBe(true);
    expect(alerts).toHaveLength(0);
  });

  it('never puts the worker URL credentials into an alert', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('fetch failed'));

    await runK2MonthlyCordis({
      month: '2026-09',
      workerUrl: 'http://user:hunter2@worker.invalid:8000',
    });

    expect(JSON.stringify(alerts)).not.toContain('hunter2');
    expect((alerts[0]!.meta as { host: string }).host).toBe('worker.invalid:8000');
  });
});
