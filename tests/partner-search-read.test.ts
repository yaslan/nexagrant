import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { EMAIL_MASK, PHONE_MASK } from '@/modules/m1/server/partner-search/mask';
import { toPublicSummary } from '@/modules/m1/server/partner-search/read';
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
 * Nothing may select the text of a stored announcement and ship it unmasked. Every
 * production file that reads `partnerSearchAnnouncement` must reference `maskContact`
 * or `toPublicSummary`, except the two that never send a row to a client:
 *  - ingestor.ts reads `description` only to compare it with the scan it is about to write;
 *  - retention.ts deletes rows and selects ids.
 * A new reader that fails here should call `toPublicSummary` (read.ts), not extend this list.
 */
describe('announcement readers mask on the server (FO-137)', () => {
  const NEVER_LEAVES_THE_SERVER = new Set([
    'src/modules/m1/server/partner-search/ingestor.ts',
    'src/modules/m1/server/partner-search/retention.ts',
  ]);

  const readers = sourceFiles(path.join(REPO_ROOT, 'src')).filter((file) =>
    /\bpartnerSearchAnnouncement\s*\.\s*(findMany|findFirst|findUnique|findFirstOrThrow|findUniqueOrThrow)\b/.test(
      fs.readFileSync(file, 'utf8')
    )
  );

  it('finds the readers it is supposed to police', () => {
    const rel = readers.map((f) => path.relative(REPO_ROOT, f).split(path.sep).join('/'));
    expect(rel).toContain('src/modules/m1/server/partner-search/ingestor.ts');
  });

  it.each(readers.map((f) => [path.relative(REPO_ROOT, f).split(path.sep).join('/'), f] as const))(
    '%s',
    (rel, file) => {
      if (NEVER_LEAVES_THE_SERVER.has(rel)) return;
      const source = fs.readFileSync(file, 'utf8');
      expect(source, `${rel} reads partnerSearchAnnouncement but never calls maskContact / toPublicSummary`).toMatch(
        /\b(maskContact|toPublicSummary)\b/
      );
    }
  );
});
