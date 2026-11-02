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
  test('consent version is kvkk-v4', () => {
    expect(EXPERT_PREREG_CONSENT_VERSION).toBe('kvkk-v4');
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
    const tr = await readFile('content/kvkk-uzman-v4.md', 'utf8');
    const en = await readFile('content/kvkk-uzman-v4.en.md', 'utf8');
    expect(tr).toContain('- Açık rıza (KVKK m.5/1): profilinizin rehberde yayımlanması.\n');
    expect(en).toContain('- Explicit consent (KVKK Art. 5/1): publishing your profile in the directory.\n');
  });

  // FO-332: the product is NexaGrant from kvkk-v4 on. The notice ties the name to the legal entity
  // (the data controller), and v1-v3 stay as they were (a stored row points at the text it agreed to).
  test.each(['content/kvkk-uzman-v4.md', 'content/kvkk-uzman-v4.en.md'])('%s names NexaGrant and its operator', async (file) => {
    const text = await readFile(file, 'utf8');
    expect(text).toContain('NexaGrant');
    expect(text).not.toMatch(/FonBridge/);
    expect(text).toContain('Fonbridge Eğitim, Proje ve Danışmanlık Ltd. Şti.');
    expect(text).toContain('fonbridge@hs01.kep.tr');
  });

  test.each(['kvkk-uzman-v1', 'kvkk-uzman-v2', 'kvkk-uzman-v3', 'kvkk-uzman-v4'])('%s exists in both languages', async (name) => {
    await expect(access(`content/${name}.md`)).resolves.toBeUndefined();
    await expect(access(`content/${name}.en.md`)).resolves.toBeUndefined();
  });
});
