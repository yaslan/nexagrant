// @vitest-environment jsdom
import React from 'react';
import { describe, expect, test } from 'vitest';
import { renderHook } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';

import trMessages from '../messages/tr.json';
import enMessages from '../messages/en.json';
import { useActionErrorText } from '@/lib/hooks/use-action-error-text';
import { LLM_REFUSED_DIGEST, LLM_TRUNCATED_DIGEST } from '@/lib/llm-outcome';

/**
 * TASK-MUN4PSBP19RKK — a generation cut off at the length limit, or declined by
 * the model, reaches the browser as an error whose only surviving field in
 * production is `digest`. Every screen that already routes its action errors
 * through `useActionErrorText` (M10 documents, M7 TTO, …) must turn that into
 * a sentence that says what happened and that no credit was charged — not
 * nothing, and not the site's own "try again".
 */

/** What a rejected server action looks like in the browser, in production. */
function browserError(digest: string) {
  return Object.assign(new Error('An error occurred in the Server Components render.'), { digest });
}

function textFor(locale: 'tr' | 'en', error: unknown, fallback: string | null = null) {
  const messages = locale === 'tr' ? trMessages : enMessages;
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <NextIntlClientProvider locale={locale} messages={messages}>
      {children}
    </NextIntlClientProvider>
  );
  const { result } = renderHook(() => useActionErrorText(), { wrapper });
  return result.current(error, fallback);
}

describe('useActionErrorText — AI outcomes', () => {
  test('a cut-off answer says so, in Turkish', () => {
    const text = textFor('tr', browserError(LLM_TRUNCATED_DIGEST));
    expect(text).toBe(trMessages.Common.aiTruncated);
    expect(text).toMatch(/uzunluk sınırında kesildi/);
    expect(text).toMatch(/kredi düşülmedi/);
  });

  test('a cut-off answer says so, in English', () => {
    const text = textFor('en', browserError(LLM_TRUNCATED_DIGEST));
    expect(text).toBe(enMessages.Common.aiTruncated);
    expect(text).toMatch(/cut off at the length limit/);
    expect(text).toMatch(/no credit was charged/);
  });

  test('a refusal has its own sentence in both locales', () => {
    expect(textFor('tr', browserError(LLM_REFUSED_DIGEST))).toBe(trMessages.Common.aiRefused);
    expect(textFor('en', browserError(LLM_REFUSED_DIGEST))).toBe(enMessages.Common.aiRefused);
  });

  test('beats the site fallback, which would tell the user to retry blindly', () => {
    expect(textFor('en', browserError(LLM_TRUNCATED_DIGEST), 'Please try again.')).toBe(enMessages.Common.aiTruncated);
  });

  test('leaves every other error to the site, unchanged', () => {
    expect(textFor('en', browserError('1234567'), 'Please try again.')).toBe('Please try again.');
    expect(textFor('en', new Error('boom'), null)).toBeNull();
  });
});
