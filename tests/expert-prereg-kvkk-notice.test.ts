import { access, readFile } from 'node:fs/promises';
import { describe, expect, test } from 'vitest';

import { loadKvkkNotice } from '@/components/expert-prereg/kvkk-text.server';
import { EXPERT_PREREG_CONSENT_VERSION } from '@/lib/expert-prereg/server/constants';

/**
 * FO-149 (TASK-MVO2W76G18OY1, K-572422) — the notice the form shows is the one
 * the stored consent version names. FO-144 took the announcement e-mail box off
 * the form, so kvkk-v3 drops that purpose; older texts stay as the record of
 * what earlier rows agreed to.
 */
describe('expert pre-registration KVKK notice', () => {
  test('consent version is kvkk-v3', () => {
    expect(EXPERT_PREREG_CONSENT_VERSION).toBe('kvkk-v3');
  });

  test.each(['tr', 'en'])('loader reads the text of the current version (%s)', async (locale) => {
    const blocks = await loadKvkkNotice(locale);
    const label = locale === 'en' ? 'Version' : 'Sürüm';
    expect(blocks).toContainEqual({ kind: 'paragraph', text: `${label}: ${EXPERT_PREREG_CONSENT_VERSION}` });
    // No purpose, legal basis or withdrawal sentence may name announcement e-mails.
    expect(JSON.stringify(blocks)).not.toMatch(/duyuru|announcement/i);
  });

  test('unknown locale falls back to the Turkish text', async () => {
    expect(await loadKvkkNotice('de')).toEqual(await loadKvkkNotice('tr'));
  });

  test('explicit consent covers only directory publication', async () => {
    const tr = await readFile('content/kvkk-uzman-v3.md', 'utf8');
    const en = await readFile('content/kvkk-uzman-v3.en.md', 'utf8');
    expect(tr).toContain('- Açık rıza (KVKK m.5/1): profilinizin rehberde yayımlanması.\n');
    expect(en).toContain('- Explicit consent (KVKK Art. 5/1): publishing your profile in the directory.\n');
  });

  test.each(['kvkk-uzman-v1', 'kvkk-uzman-v2', 'kvkk-uzman-v3'])('%s exists in both languages', async (name) => {
    await expect(access(`content/${name}.md`)).resolves.toBeUndefined();
    await expect(access(`content/${name}.en.md`)).resolves.toBeUndefined();
  });
});
