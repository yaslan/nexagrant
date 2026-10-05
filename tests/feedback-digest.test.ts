import { describe, it, expect } from 'vitest';
import {
  summariseFeedback,
  isOverdue,
  escapeHtml,
  renderDigestHtml,
  renderDigestSubject,
  type DigestRow,
} from '@/lib/feedback/digest';

const NOW = new Date('2026-09-06T12:00:00.000Z');
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3600_000);

function row(over: Partial<DigestRow> = {}): DigestRow {
  return {
    id: 'fb1',
    title: 'Bir hata',
    category: 'BUG',
    priority: 'P2',
    status: 'NEW',
    tenantName: 'Demo Kurum',
    createdAt: hoursAgo(0.5),
    ...over,
  };
}

describe('isOverdue', () => {
  it('flags an open P0 older than its 2-hour budget', () => {
    expect(isOverdue(row({ priority: 'P0', createdAt: hoursAgo(3) }), NOW)).toBe(true);
  });

  it('leaves a P0 inside its budget alone', () => {
    expect(isOverdue(row({ priority: 'P0', createdAt: hoursAgo(1) }), NOW)).toBe(false);
  });

  it('never flags a closed report, however old', () => {
    expect(
      isOverdue(row({ priority: 'P0', status: 'RESOLVED', createdAt: hoursAgo(500) }), NOW)
    ).toBe(false);
    expect(
      isOverdue(row({ priority: 'P0', status: 'WONT_FIX', createdAt: hoursAgo(500) }), NOW)
    ).toBe(false);
  });

  it('gives P3 a one-week budget — it is picked up at the weekly sync', () => {
    expect(isOverdue(row({ priority: 'P3', createdAt: hoursAgo(160) }), NOW)).toBe(false);
    expect(isOverdue(row({ priority: 'P3', createdAt: hoursAgo(200) }), NOW)).toBe(true);
  });
});

describe('summariseFeedback', () => {
  const windowRows = [
    row({ id: 'a', priority: 'P0', createdAt: hoursAgo(2) }),
    row({ id: 'b', priority: 'P0', createdAt: hoursAgo(30) }),
    row({ id: 'c', priority: 'P1', createdAt: hoursAgo(10) }),
    row({ id: 'd', priority: 'P2', createdAt: hoursAgo(20) }),
    row({ id: 'e', priority: 'P3', createdAt: hoursAgo(40), status: 'RESOLVED' }),
  ];
  const allOpen = [
    ...windowRows.filter((r) => r.status === 'NEW'),
    // Still open from before the window — a weekly digest must still surface it.
    row({ id: 'old', priority: 'P0', createdAt: hoursAgo(600) }),
  ];

  const summary = summariseFeedback(windowRows, allOpen, hoursAgo(168), NOW);

  it('counts what came in during the window, by priority', () => {
    expect(summary.newCount).toBe(5);
    expect(summary.byPriority).toEqual({ P0: 2, P1: 1, P2: 1, P3: 1 });
  });

  it('counts open reports separately from the window', () => {
    expect(summary.openCount).toBe(5);
  });

  it('surfaces an overdue report older than the window', () => {
    expect(summary.overdue.map((r) => r.id)).toContain('old');
  });

  it('sorts overdue reports most urgent first', () => {
    const priorities = summary.overdue.map((r) => r.priority);
    expect(priorities).toEqual([...priorities].sort());
  });

  it('excludes a report still inside its SLA from the overdue list', () => {
    expect(summary.overdue.map((r) => r.id)).not.toContain('a');
  });
});

describe('digest rendering', () => {
  it('escapes HTML in report titles — they are attacker-controlled text', () => {
    expect(escapeHtml('<img src=x onerror="alert(1)">')).toBe(
      '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;'
    );
  });

  it('does not leak raw markup from a title into the email body', () => {
    const summary = summariseFeedback(
      [row({ title: '<script>steal()</script>' })],
      [row({ title: '<script>steal()</script>' })],
      hoursAgo(168),
      NOW
    );
    const html = renderDigestHtml(summary, 'https://app.example.org');
    expect(html).not.toContain('<script>steal()');
    expect(html).toContain('&lt;script&gt;steal()&lt;/script&gt;');
  });

  it('links to the triage board without a doubled slash', () => {
    const summary = summariseFeedback([], [], hoursAgo(168), NOW);
    expect(renderDigestHtml(summary, 'https://app.example.org/')).toContain(
      'https://app.example.org/tr/admin/feedback'
    );
  });

  it('puts the urgent count in the subject only when there is one', () => {
    const quiet = summariseFeedback([row({ priority: 'P3' })], [], hoursAgo(168), NOW);
    expect(renderDigestSubject(quiet)).not.toContain('urgent');

    const loud = summariseFeedback(
      [row({ priority: 'P0' }), row({ priority: 'P1' })],
      [],
      hoursAgo(168),
      NOW
    );
    expect(renderDigestSubject(loud)).toContain('2 urgent');
  });

  it('says so plainly when nothing is overdue', () => {
    const summary = summariseFeedback([], [], hoursAgo(168), NOW);
    expect(renderDigestHtml(summary, 'https://app.example.org')).toContain(
      'Nothing is past its response-time budget.'
    );
  });
});
