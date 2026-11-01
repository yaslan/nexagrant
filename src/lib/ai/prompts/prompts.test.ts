import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, test, expect, vi } from 'vitest';

import {
  DEFAULT_PROMPT_LOCALE,
  PROMPT_IDS,
  PROMPT_LOCALES,
  PromptTemplateError,
  promptTemplate,
  promptVars,
  renderPrompt,
} from './index';

/**
 * TASK-MULQLQIE3ES6G — the prompt loader. Byte-identity with the pre-move
 * inline prompts is proven in tests/prompt-snapshots.test.ts; this file covers
 * the loader's own contract.
 */

const REPO = resolve(__dirname, '../../../..');

describe('registry', () => {
  test('holds the 17 prompts, each in its own file per locale it has', () => {
    // 14 moved out of the call sites + 3 M17 (FO-188), the only ones with a `tr` text.
    expect(PROMPT_IDS).toHaveLength(17);
    const dir = resolve(__dirname);
    const files = readdirSync(dir)
      .filter((d) => statSync(join(dir, d)).isDirectory())
      .flatMap((d) => readdirSync(join(dir, d)).map((f) => `${d}/${f}`));
    const expected = PROMPT_IDS.flatMap((id) => [`${id}.en.ts`, ...(id.startsWith('m17/') ? [`${id}.tr.ts`] : [])]);
    expect(files.sort()).toEqual(expected.sort());
  });

  test.each(PROMPT_IDS)('%s: placeholders and declared variables are the same set', (id) => {
    const placeholders = new Set([...promptTemplate(id).matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]));
    expect([...placeholders].sort()).toEqual([...promptVars(id)].sort());
  });

  test.each(PROMPT_IDS)('%s: every locale text has the same placeholders as en', (id) => {
    const set = (locale: string) => [...new Set([...promptTemplate(id, locale).matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]))].sort();
    for (const locale of PROMPT_LOCALES) expect(set(locale), `${id} ${locale}`).toEqual(set('en'));
  });

  test('the locale list matches the app routing', () => {
    const routing = readFileSync(resolve(REPO, 'src/i18n/routing.ts'), 'utf8');
    expect(routing).toMatch(new RegExp(`locales:\\s*\\[${PROMPT_LOCALES.map((l) => `'${l}'`).join(',\\s*')}\\]`));
    expect(routing).toContain(`defaultLocale: '${DEFAULT_PROMPT_LOCALE}'`);
  });
});

describe('renderPrompt', () => {
  test('a locale with no text of its own falls back to en', () => {
    expect(promptTemplate('m9/meeting-brief-system', 'tr')).toBe(promptTemplate('m9/meeting-brief-system', 'en'));
    expect(promptTemplate('m9/meeting-brief-system', 'xx')).toBe(promptTemplate('m9/meeting-brief-system'));
  });

  test('fills every occurrence of a placeholder', () => {
    const out = renderPrompt('m9/meeting-brief', { partnerName: 'P', callTopic: 'CL6' }, 'tr');
    expect(out.match(/CL6/g)).toHaveLength(2);
    expect(out).not.toContain('{{');
  });

  test('inserts values verbatim — no `$&` expansion, no second pass', () => {
    const out = renderPrompt('m6/esr-parse', { documentText: "cost $& and $' and {{documentText}}" });
    expect(out).toContain("cost $& and $' and {{documentText}}");
  });

  test('a missing variable throws instead of sending a half-filled prompt', () => {
    expect(() =>
      renderPrompt('m9/meeting-brief', { partnerName: 'P' } as unknown as { partnerName: string; callTopic: string })
    ).toThrow(PromptTemplateError);
  });
});

describe('promptLocale', () => {
  test('uses the next-intl request header, then the cookie, then the default', async () => {
    const state: { header: string | null; cookie: string | undefined; throws: boolean } = {
      header: null,
      cookie: undefined,
      throws: false,
    };
    vi.doMock('next/headers', () => ({
      headers: async () => {
        if (state.throws) throw new Error('outside a request scope');
        return { get: (n: string) => (n === 'X-NEXT-INTL-LOCALE' ? state.header : null) };
      },
      cookies: async () => ({ get: () => (state.cookie ? { value: state.cookie } : undefined) }),
    }));
    const { promptLocale } = await import('./locale');

    state.header = 'en';
    expect(await promptLocale()).toBe('en');
    state.header = null;
    state.cookie = 'en';
    expect(await promptLocale()).toBe('en');
    state.cookie = 'de';
    expect(await promptLocale()).toBe(DEFAULT_PROMPT_LOCALE);
    state.throws = true;
    expect(await promptLocale()).toBe(DEFAULT_PROMPT_LOCALE);
    vi.doUnmock('next/headers');
  });
});
