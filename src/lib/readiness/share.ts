/**
 * Share link for a readiness result — the answers travel in the URL, nothing is
 * written to the server and no personal data is involved.
 *
 * Format: `?kurum=<orgType>&cevap=<15 digits 0-2 in READINESS_QUESTIONS order>[&il=<province>]`
 * e.g. `?kurum=municipality&cevap=012201...&il=Samsun`. The province is optional. Anything that does not match exactly
 * decodes to null, so a hand-edited link shows the empty test instead of a wrong score.
 */

import { TR_PROVINCES, type TrProvince } from './provinces';
import { ANSWER_VALUES, READINESS_QUESTIONS, type AnswerValue, type ReadinessAnswers } from './questions';

export const SHARE_PARAM_ORG = 'kurum';
export const SHARE_PARAM_ANSWERS = 'cevap';
export const SHARE_PARAM_PROVINCE = 'il';

const ANSWERS_PATTERN = new RegExp(`^[${ANSWER_VALUES.join('')}]{${READINESS_QUESTIONS.length}}$`);

export function encodeAnswers(answers: ReadinessAnswers): string | null {
  let out = '';
  for (const q of READINESS_QUESTIONS) {
    const v = answers[q.id];
    if (v === undefined) return null;
    out += String(v);
  }
  return out;
}

export function decodeAnswers(raw: string | null | undefined): ReadinessAnswers | null {
  if (!raw || !ANSWERS_PATTERN.test(raw)) return null;
  const answers: ReadinessAnswers = {};
  READINESS_QUESTIONS.forEach((q, i) => {
    answers[q.id] = Number(raw[i]) as AnswerValue;
  });
  return answers;
}

export function buildShareQuery(
  orgType: string,
  answers: ReadinessAnswers,
  province?: TrProvince | null,
): string | null {
  const encoded = encodeAnswers(answers);
  if (encoded === null) return null;
  const params = new URLSearchParams({
    [SHARE_PARAM_ORG]: orgType,
    [SHARE_PARAM_ANSWERS]: encoded,
  });
  if (province) params.set(SHARE_PARAM_PROVINCE, province);
  return params.toString();
}

export function parseProvince(raw: string | null | undefined): TrProvince | null {
  return TR_PROVINCES.find((p) => p === raw) ?? null;
}

/** Decodes a share link; `orgTypes` is the closed list the org type must belong to. */
export function parseShareQuery<T extends string>(
  params: { get(name: string): string | null },
  orgTypes: readonly T[],
): {
  orgType: T;
  answers: ReadinessAnswers;
  province: TrProvince | null;
} | null {
  const org = params.get(SHARE_PARAM_ORG);
  const orgType = orgTypes.find((o) => o === org);
  const answers = decodeAnswers(params.get(SHARE_PARAM_ANSWERS));
  if (!orgType || !answers) return null;
  // An unknown province is dropped, not fatal: the answers still score.
  return {
    orgType,
    answers,
    province: parseProvince(params.get(SHARE_PARAM_PROVINCE)),
  };
}

/** Localised path of the scorecard page: /tr/fon-hazirlik, /en/funding-readiness. */
export function readinessPath(locale: string): string {
  return locale === 'tr' ? `/${locale}/fon-hazirlik` : `/${locale}/funding-readiness`;
}

/** Localised path of se-fb's municipal call radar: /tr/belediye-cagrilari, /en/municipal-calls. */
export function municipalCallsPath(locale: string): string {
  return locale === 'tr' ? `/${locale}/belediye-cagrilari` : `/${locale}/municipal-calls`;
}

/**
 * Sign-up with the funnel source, so the account can be attributed to this page.
 * The province answered on the scorecard travels as `il` and pre-fills the
 * optional province of the new organisation (TASK-MULV3JXS1AW5X).
 */
export function readinessSignupPath(locale: string, province?: TrProvince | null): string {
  const base = locale === 'tr' ? `/${locale}/kayit` : `/${locale}/register`;
  const params = new URLSearchParams({ kaynak: 'fon-hazirlik' });
  if (province) params.set(SHARE_PARAM_PROVINCE, province);
  return `${base}?${params.toString()}`;
}
