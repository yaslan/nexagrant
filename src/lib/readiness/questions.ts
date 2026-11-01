/**
 * Funding-readiness self-check ("Fon Hazırlık Karnesi") — the question set.
 *
 * 15 questions, 5 dimensions × 3, each answered on a 0–2 scale. This file holds the
 * STRUCTURE only (ids, order, dimension, official links). Every user-facing sentence
 * lives in messages/{tr,en}.json under `readiness.questions.<id>` and
 * `readiness.gaps.<id>` (CLAUDE.md rule 8), so the two languages cannot drift from
 * the ids used here: `pnpm i18n:check` resolves the dynamic keys against both catalogs.
 *
 * The order of READINESS_QUESTIONS is part of the share-link format (see share.ts):
 * append new questions at the end of their dimension only together with a format bump.
 */

export const READINESS_DIMENSIONS = ['registration', 'capacity', 'finance', 'partnership', 'idea'] as const;

export type ReadinessDimension = (typeof READINESS_DIMENSIONS)[number];

/** 0 = not in place, 1 = partly / in progress, 2 = in place. */
export type AnswerValue = 0 | 1 | 2;

export const ANSWER_VALUES: readonly AnswerValue[] = [0, 1, 2];

export interface ReadinessQuestion {
  id: string;
  dimension: ReadinessDimension;
  /**
   * Official page that explains how to close this gap, or null when the step is
   * internal to the organisation (e.g. a council budget decision) and no neutral
   * public guide exists.
   */
  guideUrl: string | null;
}

/** EU Funding & Tenders Portal — Participant Register (PIC, LEAR, legal validation). */
const FT_PARTICIPANT_REGISTER =
  'https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/how-to-participate/participant-register';
/** Turkish National Agency (Erasmus+ / European Solidarity Corps). */
const TR_NATIONAL_AGENCY = 'https://www.ua.gov.tr';
/** Covenant of Mayors — Europe (SECAP methodology and signatory network). */
const COVENANT_OF_MAYORS = 'https://eu-mayors.ec.europa.eu';

export const READINESS_QUESTIONS: readonly ReadinessQuestion[] = [
  // Kurumsal kayıt
  { id: 'pic', dimension: 'registration', guideUrl: FT_PARTICIPANT_REGISTER },
  { id: 'lear', dimension: 'registration', guideUrl: FT_PARTICIPANT_REGISTER },
  {
    id: 'signatory',
    dimension: 'registration',
    guideUrl: FT_PARTICIPANT_REGISTER,
  },
  // Kapasite
  { id: 'projectUnit', dimension: 'capacity', guideUrl: TR_NATIONAL_AGENCY },
  { id: 'englishWriting', dimension: 'capacity', guideUrl: null },
  { id: 'pastProjects', dimension: 'capacity', guideUrl: TR_NATIONAL_AGENCY },
  // Finansman
  { id: 'cofinancing', dimension: 'finance', guideUrl: null },
  { id: 'cashflow', dimension: 'finance', guideUrl: null },
  { id: 'budgetApproval', dimension: 'finance', guideUrl: null },
  // Ortaklık
  { id: 'twinCity', dimension: 'partnership', guideUrl: null },
  { id: 'network', dimension: 'partnership', guideUrl: COVENANT_OF_MAYORS },
  { id: 'localStakeholders', dimension: 'partnership', guideUrl: null },
  // Fikir
  { id: 'strategicPlan', dimension: 'idea', guideUrl: COVENANT_OF_MAYORS },
  { id: 'concreteNeed', dimension: 'idea', guideUrl: null },
  { id: 'data', dimension: 'idea', guideUrl: null },
];

export type ReadinessQuestionId = (typeof READINESS_QUESTIONS)[number]['id'];

/** Answers keyed by question id; a missing key means "not answered yet". */
export type ReadinessAnswers = Partial<Record<string, AnswerValue>>;

export function questionsOf(dimension: ReadinessDimension): ReadinessQuestion[] {
  return READINESS_QUESTIONS.filter((q) => q.dimension === dimension);
}

/** Highest reachable score for one dimension / for the whole test. */
export const MAX_POINTS_PER_QUESTION = 2;
