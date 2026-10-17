import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test, vi } from 'vitest';
import trMessages from '../messages/tr.json';
import { encodeVerifiedOutcome } from '@/lib/expert-prereg/server/verified-outcome';

/**
 * FO-29 (TASK-MVC328LPDUWMM) — the verified page says "verified" only for a
 * signed `?r=` from the verify route. A hand-typed `?n=1` (the screenshot a
 * fake Founding Expert would circulate) shows "invalid link".
 */

const SECRET = 'page-test-secret-'.padEnd(44, 'x');
vi.mock('@/lib/env', () => ({ authSecret: () => SECRET }));
vi.mock('@/components/PublicNavbar', () => ({ default: () => null }));
vi.mock('@/components/PublicFooter', () => ({ default: () => null }));
vi.mock('next-intl/server', () => ({
  // Answers from the real catalog, so a key the page asks for but tr.json lacks fails here.
  getTranslations: async ({ namespace }: { namespace: string }) => (key: string, vars?: Record<string, unknown>) => {
    const node = [...namespace.split('.'), ...key.split('.')].reduce<unknown>(
      (o, k) => (o as Record<string, unknown> | undefined)?.[k],
      trMessages,
    );
    if (typeof node !== 'string') throw new Error(`missing message ${namespace}.${key}`);
    return node.replace(/\{(\w+)\}/g, (_, k: string) => String(vars?.[k]));
  },
}));

const ExpertVerifiedPage = (await import('@/components/expert-prereg/ExpertVerifiedPage')).default;
const t = trMessages.ExpertPrereg.verified;

async function html(query: Record<string, string | string[]>) {
  return renderToStaticMarkup(
    await ExpertVerifiedPage({ params: Promise.resolve({ locale: 'tr' }), searchParams: Promise.resolve(query) }),
  );
}

describe('ExpertVerifiedPage', () => {
  test('a bare ?n=1 (or ?error=, or nothing) is an invalid link, never "verified"', async () => {
    const queries: Record<string, string>[] = [{ n: '1' }, { error: 'expired' }, {}, { n: '1', r: 'forged.value' }];
    for (const q of queries) {
      const out = await html(q);
      expect(out).toContain(t.heading_invalid);
      expect(out).not.toContain(t.heading_ok);
      expect(out).not.toContain('ep-founder-number');
    }
  });

  test('a signed r shows the founder number; a tampered one does not', async () => {
    const r = encodeVerifiedOutcome({ outcome: 'ok', founderNumber: 12 }, { secret: SECRET });
    const ok = await html({ r });
    expect(ok).toContain(t.heading_ok);
    expect(ok).toContain('Kurucu Uzman numaranız: #12');
    const bad = await html({ r: `${r.slice(0, -2)}${r.endsWith('AA') ? 'BB' : 'AA'}` });
    expect(bad).toContain(t.heading_invalid);
  });

  test('signed expired / no-seat outcomes pick their own copy', async () => {
    const sign = (o: Parameters<typeof encodeVerifiedOutcome>[0]) => encodeVerifiedOutcome(o, { secret: SECRET });
    expect(await html({ r: sign({ outcome: 'expired', founderNumber: null }) })).toContain(t.heading_expired);
    const full = await html({ r: sign({ outcome: 'ok', founderNumber: null }) });
    expect(full).toContain(t.heading_ok);
    expect(full).toContain(t.no_founder);
  });
});
