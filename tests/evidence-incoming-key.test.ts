import { describe, expect, test } from 'vitest';
import { finalKeyOfIncoming, generateR2ObjectKey } from '@/lib/storage';

/**
 * TASK-MUO122UPRPJQH (İNCELEME-77 D-1) — confirm and the dev upload route take
 * only the staging key shape the presign hands out. `<t>/incoming/incoming/x.pdf`
 * used to pass and map to `<t>/incoming/x.pdf`, itself a staging key: the dev
 * route then took a PUT to the recorded key, and a second confirm moved the
 * recorded file away.
 */

const T = 'tenant-k';
const stagingOf = (finalKey: string) => finalKey.replace(/^([^/]+)\//, '$1/incoming/');

describe('finalKeyOfIncoming takes only the presign’s shape', () => {
  test('positive control: every key the presign builds maps to its final key', () => {
    for (const name of ['Kalite Belgesi.pdf', 'a.PDF', 'rapor.v2.xlsx', 'ğüş çö.docx', '.pdf', 'x'.repeat(300) + '.png']) {
      const final = generateR2ObjectKey(T, 'org-default', 'Certificate', name);
      expect(finalKeyOfIncoming(T, stagingOf(final)), name).toBe(final);
    }
  });

  test.each([
    ['nested incoming (crw-fb’s case)', `${T}/incoming/incoming/x.pdf`],
    ['nested incoming, full shape below it', `${T}/incoming/incoming/certificate/2026/deadbeef_n.pdf`],
    ['incoming as the organisation', `${T}/incoming/incoming/certificate/2026/deadbeef_n_pdf.pdf`],
    // T-1 (TASK-MUO64MVW8TLMX, İNCELEME-82 N7): a whole staging key below a
    // second `incoming`. Only the `^` of the shape refuses these; unanchored,
    // the first maps to `${T}/incoming/org-default/…`, another staging key.
    ['a full staging key nested under incoming', `${T}/incoming/incoming/org-default/certificate/2026/deadbeef_n_pdf.pdf`],
    ['a full staging key below incoming/<segment>', `${T}/incoming/zzz/incoming/org-default/certificate/2026/deadbeef_n_pdf.pdf`],
    ['a final key', `${T}/org-default/certificate/2026/deadbeef_n.pdf`],
    ['too few segments', `${T}/incoming/x.pdf`],
    ['no year', `${T}/incoming/org-default/certificate/deadbeef_n.pdf`],
    ['an extra segment', `${T}/incoming/org-default/certificate/2026/extra/deadbeef_n.pdf`],
    ['no hash prefix', `${T}/incoming/org-default/certificate/2026/n.pdf`],
    ['upper case the presign never writes', `${T}/incoming/org-default/Certificate/2026/deadbeef_n.pdf`],
    ['no extension', `${T}/incoming/org-default/certificate/2026/deadbeef_n`],
    ['another tenant', `other/incoming/org-default/certificate/2026/deadbeef_n.pdf`],
    ['traversal', `${T}/incoming/org-default/../2026/deadbeef_n.pdf`],
  ])('refuses %s', (_label, key) => {
    expect(finalKeyOfIncoming(T, key)).toBeNull();
  });
});
