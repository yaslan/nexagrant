import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, test, expect } from 'vitest';

import { BLOG_SEED_POSTS } from '@/lib/blog-seed';

/**
 * TASK-MTS6MRKDP168Q — no figure on a public page without a record behind it.
 *
 * The landing page, the blog and the public pricing card carried numbers typed
 * as literals: "150.000+ CORDIS Kurumu", "€60B+ İncelenen AB Proje Bütçesi",
 * "kazanma şansını %40 artırıyor", "ortalama 4.8/5.0 puan", "teklif yazımını 10
 * kat hızlandırın", "50+ teklifi eşzamanlı sıfır çakışmayla".
 *
 * Measured on this branch before removal: `CordisOrganization` = 0 rows, and the
 * summed EU contribution over the 20 `CordisProject` rows = EUR 0. So the two
 * biggest figures were not merely unsourced, they were contradicted by the data
 * they claimed to describe. `TopicStat` holds 3 demo rows (source
 * "seed-demo-g0-evidence") of per-topic success rates — they back neither a 40%
 * uplift nor a 4.8/5.0 reviewer average — and `Evidence` is tenant-scoped behind
 * RLS, which a public page has no tenant to read.
 *
 * These are source guards, not behavioural tests: they pin the removed strings
 * so the literals cannot quietly return. A figure may come back on these
 * surfaces, but only together with the query that measures it (CLAUDE.md rule 7).
 */

const REPO = resolve(__dirname, '..');
const read = (rel: string) => readFileSync(resolve(REPO, rel), 'utf8');

/**
 * Each fixed file now carries a comment quoting the very strings it removed, so
 * a guard must read code and not prose. Strips block comments (JSX `{/* … *\/}`
 * included) and line comments, leaving `://` alone so a URL survives.
 */
function codeOf(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

const readCode = (rel: string) => codeOf(read(rel));

/** Every figure removed from a public surface, as it was actually written. */
const REMOVED_LITERALS = [
  '150.000+',
  "150.000'den",
  '150k+',
  '150K+',
  '150,000+',
  '€60B+',
  '60 milyar',
  '4.8/5.0',
  '10 kat',
  '50+ teklif',
] as const;

describe('landing page — the CORDIS scale and budget figures are gone', () => {
  const source = readCode('src/app/[locale]/page.tsx');

  test.each(REMOVED_LITERALS)('does not print %s', (literal) => {
    expect(source).not.toContain(literal);
  });

  test('no speed promise survives, including the ones written as words', () => {
    // "haftalardan günlere", "from months to days" — a ratio spelled out is
    // still a ratio, and no record times a proposal either way.
    expect(source).not.toMatch(/haftalardan|aylardan|from (months|weeks) to/i);
  });

  test('the %40-style uplift claim did not reappear in another form', () => {
    // Any "N% faster/more/higher" promise on the landing page needs a record.
    expect(source).not.toMatch(/%\s?\d+\s*(daha|artır|hızl|yüksel)/i);
    expect(source).not.toMatch(/\d+\s?%\s*(more|faster|higher|increase)/i);
  });

  test('still describes what M1 does, so the section was trimmed and not gutted', () => {
    expect(source).toContain('eigenvector');
  });
});

describe('landing page — the M1 mock quotes no real institution and no uplift', () => {
  const source = readCode('src/app/[locale]/page.tsx');

  test.each([
    'Fraunhofer',
    '999984059',
    '0.9412',
    '342 Proje',
    '1.840 Proje',
    '€940M+',
    '+1.8 puan',
  ])('the mock panel no longer states %s', (literal) => {
    expect(source).not.toContain(literal);
  });

  test('the panel is labelled as a sample rather than a live reading', () => {
    expect(source).toMatch(/Örnek Görünüm/);
    expect(source).toMatch(/Sample View/);
  });
});

// AKTAR-MURBCJ0A-1: the posts live in the BlogPost table now; BLOG_SEED_POSTS is
// exactly what `pnpm db:seed-blog` inserts, so pinning it pins the launch content.
describe('blog posts — the sourced-sounding statistics are gone', () => {
  const bodies = BLOG_SEED_POSTS.map((p) => `${p.title}\n${p.excerpt}\n${p.content}`).join('\n');

  test.each(REMOVED_LITERALS)('no post text contains %s', (literal) => {
    expect(bodies).not.toContain(literal);
  });

  test('no uplift or average-score promise survives in any post', () => {
    expect(bodies).not.toMatch(/%\s?\d+\s*(artır|daha|yüksel)/i);
    expect(bodies).not.toMatch(/ortalama\s+\d+[.,]\d+\s*\/\s*\d+/i);
  });

  test('the removal did not empty the posts out', () => {
    expect(BLOG_SEED_POSTS.length).toBeGreaterThan(0);
    for (const post of BLOG_SEED_POSTS) {
      expect(post.excerpt.trim().length).toBeGreaterThan(40);
      expect(post.content.trim().length).toBeGreaterThan(200);
    }
  });
});

describe('public footer — the win-rate promise carries no record, digits or not', () => {
  // TASK-MTS6MRKDP168Q follow-up: "kazanma oranınızı katlayın" / "Accelerate
  // your win rates" is the same unsourced-uplift claim already removed from
  // the landing page's %40 figure, spelled without a digit. PublicFooter.tsx
  // renders on every public page (including both blog surfaces), so a digit
  // sweep of blog.ts alone would never have caught it.
  const source = readCode('src/components/PublicFooter.tsx');

  test('no multiply/accelerate win-rate claim survives, in either locale', () => {
    expect(source).not.toMatch(/katla/i);
    expect(source).not.toMatch(/kazanma oran/i);
    expect(source).not.toMatch(/win rate/i);
  });
});

describe('public pricing card — the plan feature quotes no dataset size', () => {
  test.each(['tr', 'en'] as const)('%s ultra plan f3 carries no count', (locale) => {
    const messages = JSON.parse(read(`messages/${locale}.json`)) as {
      billingPanels: { pricing: { plans: Record<string, Record<string, string>> } };
    };
    const f3 = messages.billingPanels.pricing.plans.ultra?.f3;
    expect(f3).toBeTruthy();
    expect(f3).toMatch(/CORDIS/);
    expect(f3).not.toMatch(/\d/);
  });
});
