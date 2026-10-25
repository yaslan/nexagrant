/**
 * The words on a plan card: one summary line and the bullets under the price.
 *
 * A plan comes from one of two places, and so does its copy. A catalogue plan
 * (`basic`, `pro`, `ultra` in catalog.ts) has its copy in messages/*.json under
 * `plans.<planId>.*`. A plan made in the admin plan studio (`padm-…`) has no
 * such keys — its copy is the published version's own `PlanFeature` rows, in
 * Turkish and English. Building `plans.${planId}.f1` for the second kind is
 * what filled /tr/fiyatlandirma with MISSING_MESSAGE errors (CE-698), so the
 * pricing page, settings/billing and admin/billing all ask this one function
 * and none of them builds a message key on its own.
 *
 * No key that does not exist ever reaches `t()`: a catalogue key is checked
 * with `t.has` first, so a screen that asks for a bullet one plan lacks gets
 * a shorter list instead of an error.
 */
import { findEntry } from '@/lib/billing/catalog';

/** The `PlanFeature` fields a card reads. */
export interface PlanCardFeature {
  kind: string;
  moduleId: string | null;
  textTr: string | null;
  textEn: string | null;
}

export interface PlanCopySource {
  planId: string;
  features?: readonly PlanCardFeature[];
}

/** The two methods of a next-intl translator this needs, already namespaced. */
export interface PlanCopyTranslator {
  (key: string): string;
  has(key: string): boolean;
}

export interface PlanCardBullet {
  /** The catalogue key (`f1`, `seats`) or `feature-<n>` for a studio row. */
  key: string;
  text: string;
}

export interface PlanCardCopy {
  /** `null` when the plan has no summary line; the card leaves it out. */
  summary: string | null;
  bullets: PlanCardBullet[];
}

/** A studio row's text in the reader's language, else the other one. */
export function featureText(feature: PlanCardFeature, locale: string): string | null {
  const own = locale === 'tr' ? feature.textTr : feature.textEn;
  const other = locale === 'tr' ? feature.textEn : feature.textTr;
  const text = own?.trim() || other?.trim();
  if (text) return text;
  // A module row is a module picker in the studio, with no text box of its
  // own; the module id is what the admin chose and what the card can show.
  return feature.kind === 'module' && feature.moduleId ? feature.moduleId : null;
}

export function planCardCopy(
  plan: PlanCopySource,
  t: PlanCopyTranslator,
  locale: string,
  keys: { summary: string; bullets: readonly string[] }
): PlanCardCopy {
  if (findEntry(plan.planId)?.kind === 'plan') {
    const message = (key: string) => {
      const id = `plans.${plan.planId}.${key}`;
      return t.has(id) ? t(id) : null;
    };
    return {
      summary: message(keys.summary),
      bullets: keys.bullets.flatMap((key) => {
        const text = message(key);
        return text === null ? [] : [{ key, text }];
      }),
    };
  }
  return {
    summary: null,
    bullets: (plan.features ?? []).flatMap((feature, i) => {
      const text = featureText(feature, locale);
      return text === null ? [] : [{ key: `feature-${i}`, text }];
    }),
  };
}
