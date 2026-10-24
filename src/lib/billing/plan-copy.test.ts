import { describe, expect, it } from 'vitest';
import { createTranslator } from 'next-intl';
import tr from '../../../messages/tr.json';
import en from '../../../messages/en.json';
import { planCardCopy, type PlanCopySource } from './plan-copy';

// CE-698: a plan made in the admin plan studio has an id like this one and no
// `plans.<id>.*` keys. The pricing page asked for them anyway and the console
// filled with MISSING_MESSAGE.
const STUDIO_ID = 'padm-1792237856437-fs9t1g';

/** The three screens and the copy each one asks for. */
const SCREENS = [
  { namespace: 'billingPanels.pricing', keys: { summary: 'subtitle', bullets: ['f1', 'f2', 'f3', 'f4', 'f5', 'f6'] } },
  { namespace: 'billingPanels.settings', keys: { summary: 'desc', bullets: ['seats', 'credits', 'modules'] } },
  { namespace: 'billingPanels.admin', keys: { summary: 'desc', bullets: ['f1', 'f2', 'f3', 'f4'] } },
] as const;

function translator(locale: 'tr' | 'en', namespace: string) {
  const errors: string[] = [];
  const t = createTranslator({
    locale,
    messages: locale === 'tr' ? tr : en,
    namespace: namespace as never,
    onError: (error) => errors.push(error.message),
  }) as unknown as Parameters<typeof planCardCopy>[1];
  return { t, errors };
}

const studioPlan: PlanCopySource = {
  planId: STUDIO_ID,
  features: [
    { kind: 'text', moduleId: null, textTr: 'Öncelikli destek', textEn: 'Priority support' },
    { kind: 'text', moduleId: null, textTr: 'Yalnız Türkçe', textEn: null },
    { kind: 'module', moduleId: 'M8', textTr: null, textEn: null },
    { kind: 'limit', moduleId: null, textTr: null, textEn: '  ' },
  ],
};

describe('planCardCopy', () => {
  it('reads a catalogue plan from its message keys', () => {
    const { t, errors } = translator('tr', 'billingPanels.pricing');
    const copy = planCardCopy({ planId: 'pro', features: [] }, t, 'tr', SCREENS[0].keys);

    expect(copy.summary).toBe(tr.billingPanels.pricing.plans.pro.subtitle);
    expect(copy.bullets.map((b) => b.key)).toEqual(['f1', 'f2', 'f3', 'f4', 'f5', 'f6']);
    expect(copy.bullets[0]?.text).toBe(tr.billingPanels.pricing.plans.pro.f1);
    expect(errors).toEqual([]);
  });

  it('reads a studio plan from its own feature rows, in the reader language with fallback', () => {
    const { t: tTr, errors: trErrors } = translator('tr', 'billingPanels.pricing');
    const { t: tEn, errors: enErrors } = translator('en', 'billingPanels.pricing');

    const inTr = planCardCopy(studioPlan, tTr, 'tr', SCREENS[0].keys);
    const inEn = planCardCopy(studioPlan, tEn, 'en', SCREENS[0].keys);

    expect(inTr.summary).toBeNull();
    expect(inTr.bullets.map((b) => b.text)).toEqual(['Öncelikli destek', 'Yalnız Türkçe', 'M8']);
    expect(inEn.bullets.map((b) => b.text)).toEqual(['Priority support', 'Yalnız Türkçe', 'M8']);
    expect([...trErrors, ...enErrors]).toEqual([]);
  });

  it('draws a studio plan with no copy at all without asking for a key', () => {
    for (const locale of ['tr', 'en'] as const) {
      for (const screen of SCREENS) {
        const { t, errors } = translator(locale, screen.namespace);
        expect(planCardCopy({ planId: STUDIO_ID }, t, locale, screen.keys)).toEqual({ summary: null, bullets: [] });
        expect(planCardCopy({ planId: STUDIO_ID, features: [] }, t, locale, screen.keys)).toEqual({
          summary: null,
          bullets: [],
        });
        expect(errors).toEqual([]);
      }
    }
  });

  it('never asks t() for a missing key on any screen, for catalogue or studio plans', () => {
    for (const locale of ['tr', 'en'] as const) {
      for (const screen of SCREENS) {
        const { t, errors } = translator(locale, screen.namespace);
        for (const planId of ['basic', 'pro', 'ultra', STUDIO_ID]) {
          planCardCopy({ ...studioPlan, planId }, t, locale, screen.keys);
        }
        expect(errors, `${locale} ${screen.namespace}`).toEqual([]);
      }
    }
  });
});
