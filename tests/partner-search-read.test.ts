import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { EMAIL_MASK, PHONE_MASK } from '@/modules/m1/server/partner-search/mask';
import { toPublicSummary } from '@/modules/m1/server/partner-search/read';
import { callsMask, rawDescriptionLeaks, readsAnnouncements } from './helpers/partner-search-read-guard';
import { sourceFiles } from './helpers/where-guard-scan';

const REPO_ROOT = path.resolve(__dirname, '..');

describe('toPublicSummary (FO-137)', () => {
  it('masks an e-mail address and a phone number in one summary', () => {
    const out = toPublicSummary({
      description: 'Looking for a SME partner. Contact jane.doe@example-org.eu or +32 2 123 45 67.',
    });
    expect(out).toBe(`Looking for a SME partner. Contact ${EMAIL_MASK} or ${PHONE_MASK}.`);
    expect(out).not.toContain('@');
    expect(out).not.toMatch(/\d{3}/);
  });

  // The row an older ingestor wrote: contact details stored as the portal sent them.
  it('masks a legacy row that was stored unmasked', () => {
    const legacy = { description: 'Kontakt: m.mueller(at)tu-x.de, Tel. 030 / 1234567' };
    expect(toPublicSummary(legacy)).toBe(`Kontakt: ${EMAIL_MASK}, Tel. ${PHONE_MASK}`);
  });

  it('leaves an already masked row as it is', () => {
    const stored = { description: `Contact ${EMAIL_MASK}, tel ${PHONE_MASK}` };
    expect(toPublicSummary(stored)).toBe(stored.description);
  });

  it('keeps the parts of the text that are not contact details', () => {
    const text = 'deadline 2026-10-23 17:00 Brussels, budget 125 000 000 EUR, PIC 999999999';
    expect(toPublicSummary({ description: text })).toBe(text);
  });

  it('keeps null as null', () => {
    expect(toPublicSummary({ description: null })).toBeNull();
  });
});

/**
 * What this guard proves, and what it does not (FO-137, widened in FO-151).
 *
 * Every production file that reaches stored announcements must (1) CALL `maskContact`
 * or `toPublicSummary`, and (2) not let the raw `description` out beside that call.
 * "Reaches" means the Prisma delegate (`partnerSearchAnnouncement.find*`), the `Topic`
 * relation (`partnerAnnouncements`) or raw SQL (`"PartnerSearchAnnouncement"`). Comments
 * do not count: the scan reads code only. Two files are exempt because no row they read
 * is sent to a client:
 *  - ingestor.ts reads `description` only to compare it with the scan it is about to write;
 *  - retention.ts deletes rows and selects ids.
 * It is a per-file scan. It does not follow a value from one file into another, and it
 * does not make a reader return a masked type; a reader that wraps the raw text in a
 * helper with another name still needs a human. A new reader that fails here should call
 * `toPublicSummary` (read.ts), not extend the exempt list.
 */
describe('announcement readers mask on the server (FO-137)', () => {
  const NEVER_LEAVES_THE_SERVER = new Set([
    'src/modules/m1/server/partner-search/ingestor.ts',
    'src/modules/m1/server/partner-search/retention.ts',
  ]);

  const relOf = (f: string) => path.relative(REPO_ROOT, f).split(path.sep).join('/');
  const readers = sourceFiles(path.join(REPO_ROOT, 'src')).filter((file) =>
    readsAnnouncements(fs.readFileSync(file, 'utf8'), file)
  );

  it('finds the readers it is supposed to police', () => {
    expect(readers.map(relOf)).toContain('src/modules/m1/server/partner-search/ingestor.ts');
  });

  it.each(readers.map((f) => [relOf(f), f] as const))('%s', (rel, file) => {
    if (NEVER_LEAVES_THE_SERVER.has(rel)) return;
    const source = fs.readFileSync(file, 'utf8');
    expect(callsMask(source, file), `${rel} reads announcements but never calls maskContact / toPublicSummary`).toBe(true);
    expect(rawDescriptionLeaks(source, file), `${rel} lets the raw description out`).toEqual([]);
  });
});

// The scanner against the shapes crw-fb used to get past the old name check (M2–M6).
describe('the guard recognises the leaks it polices (FO-151)', () => {
  const MASKED = `import { maskContact } from './mask';
    export const a = (p) => p.partnerSearchAnnouncement.findMany({ select: { description: true } })
      .then((rows) => rows.map((r) => ({ id: r.id, summary: maskContact(r.description) })));`;

  it('lets a reader that masks pass', () => {
    expect(readsAnnouncements(MASKED)).toBe(true);
    expect(callsMask(MASKED)).toBe(true);
    expect(rawDescriptionLeaks(MASKED)).toEqual([]);
  });

  it('a mask call in an alias-free `description: maskContact(...)` key is fine', () => {
    const src = `rows.map((r) => ({ ...r, description: toPublicSummary(r) })); const q = { where: { description: { contains: s } } };`;
    expect(rawDescriptionLeaks(src)).toEqual([]);
  });

  it('M2: a reader with no mask call fails', () => {
    const src = `export const a = (p) => p.partnerSearchAnnouncement.findMany({ select: { description: true } });`;
    expect(readsAnnouncements(src)).toBe(true);
    expect(callsMask(src)).toBe(false);
  });

  it('M3: the function name in a comment is not a call', () => {
    const src = `// TODO: toPublicSummary\n/* maskContact( */\n/** toPublicSummary(x) */\n${'export const a = (p) => p.partnerSearchAnnouncement.findMany({});'}`;
    expect(readsAnnouncements(src)).toBe(true);
    expect(callsMask(src)).toBe(false);
  });

  it('M3b: the function name only imported is not a call', () => {
    const src = `import { toPublicSummary } from './read';\nexport const a = (p) => p.partnerSearchAnnouncement.findMany({});`;
    expect(callsMask(src)).toBe(false);
  });

  it('M4: reaching the rows through the Topic relation counts as a reader', () => {
    expect(readsAnnouncements(`p.topic.findMany({ include: { partnerAnnouncements: true } })`)).toBe(true);
    expect(readsAnnouncements(`p.topic.findMany({ select: { partnerAnnouncements: { select: { description: true } } } })`)).toBe(true);
  });

  it('M5: raw SQL against the table counts as a reader', () => {
    expect(readsAnnouncements('p.$queryRaw`SELECT description FROM "PartnerSearchAnnouncement"`')).toBe(true);
    expect(readsAnnouncements(`p.$queryRawUnsafe('SELECT description FROM \\"PartnerSearchAnnouncement\\"')`)).toBe(true);
  });

  it('a comment that merely names the model or the relation is not a reader', () => {
    expect(readsAnnouncements(`// partnerSearchAnnouncement.findMany, partnerAnnouncements, "PartnerSearchAnnouncement"\nexport const x = 1;`)).toBe(false);
    expect(readsAnnouncements(`/** The column of \`PartnerSearchAnnouncement\` */ export const x = 1;`)).toBe(false);
  });

  it('M6: calling the mask while also shipping the raw row fails', () => {
    const spread = `import { toPublicSummary } from './read';\nrows.map((x) => ({ ...x, summary: toPublicSummary(x) }));`;
    expect(callsMask(spread)).toBe(true);
    expect(rawDescriptionLeaks(spread)).toHaveLength(1);
    const key = `rows.map((x) => ({ id: x.id, description: x.description, summary: toPublicSummary(x) }));`;
    expect(rawDescriptionLeaks(key).length).toBeGreaterThan(0);
    expect(rawDescriptionLeaks(`const { description } = row; return maskContact(description);`)).toHaveLength(1);
    expect(rawDescriptionLeaks(`return { description };`)).toHaveLength(1);
    expect(rawDescriptionLeaks(`return row['description'];`)).toHaveLength(1);
  });

  it('reading description off a DTO the mapper already produced is fine; off a raw row it is not', () => {
    const dto = `export function toCsv(rows: readonly AnnouncementDto[]) { for (const r of rows) out.push(r.description); }
      export const one = (r: AnnouncementDto) => r.description;`;
    expect(rawDescriptionLeaks(dto)).toEqual([]);
    expect(rawDescriptionLeaks(`export function f(rows: readonly Row[]) { for (const r of rows) out.push(r.description); }`)).toHaveLength(1);
    expect(rawDescriptionLeaks(`const f = (r: Row) => r.description;`)).toHaveLength(1);
  });

  it('spreading something that cannot be a row is fine', () => {
    expect(rawDescriptionLeaks(`const a = { ...(m ? { plans: m.plans } : {}), ...{ x: 1 }, ...(ok && { y: 2 }) };`)).toEqual([]);
    expect(rawDescriptionLeaks(`const a = { ...(m ? row : {}) };`)).toHaveLength(1);
  });

  it('a spread is fine when description is overwritten by a mask call after it', () => {
    expect(rawDescriptionLeaks(`rows.map((x) => ({ ...x, description: maskContact(x.description) }));`)).toEqual([]);
    expect(rawDescriptionLeaks(`rows.map((x) => ({ description: maskContact(x.description), ...x }));`)).toHaveLength(1);
  });
});
