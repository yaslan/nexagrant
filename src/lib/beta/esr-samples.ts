/**
 * ESR calibration sample set — parsing and validation (E11.3).
 *
 * Mirrors `./roster.ts`: the data lives in a CSV under `docs/BETA_DATA/` so a programme manager can
 * paste in real ESR results without touching TypeScript, and parsing is separated from the CLI so
 * every validation rule is unit-testable.
 *
 * The guard that matters here is `assertNotFixture`: an accuracy figure computed on the shipped
 * fixture must never be reported as a measurement of the real model, so anything that publishes a
 * headline number has to say which of the two it is looking at.
 */

import { parse } from 'csv-parse/sync';

import {
  ABOVE_THRESHOLD_OUTCOMES,
  PROPOSAL_OUTCOMES,
  type ProposalOutcome,
} from '../proposal-outcome';
import {
  baseRateToScore,
  type G0Decision,
  type G0Features,
  type G0HardFacts,
} from '../scoring/g0-canonical';

/**
 * The outcome vocabulary is `Proposal.outcome`'s, not this file's — the calibration script
 * writes these very strings into that column, so a second copy here is how the two drift apart.
 */
export const ESR_OUTCOMES = PROPOSAL_OUTCOMES;
export type EsrOutcome = ProposalOutcome;

/** Outcomes that mean "pursuing this was the right call" — the same set the dashboard counts. */
const POSITIVE_OUTCOMES = new Set<EsrOutcome>(ABOVE_THRESHOLD_OUTCOMES);

export const LABEL_SOURCES = ['cordis-outcome', 'beta-survey', 'expert-review'] as const;
export type LabelSource = (typeof LABEL_SOURCES)[number];

/** Reserved id namespace for curated fixture rows — see the CSV header. */
export const FIXTURE_ID_PREFIX = 'SAMPLE-';

export interface EsrSample {
  sampleId: string;
  cordisProjectId: string;
  acronym: string;
  title: string;
  framework: string;
  topicCode: string;
  coordinatorCountry: string;
  orgType: string;
  countryEligible: boolean;
  features: G0Features;
  facts: G0HardFacts;
  esrTotal: number | null;
  esrThreshold: number | null;
  outcome: EsrOutcome;
  /** Ground truth: what the gate should have answered. */
  expertLabel: G0Decision;
  labelSource: LabelSource;
  notes: string;
}

const NUMERIC_FEATURE_COLUMNS = [
  'alignment',
  'coordinatorHistory',
  'researchAndEndUser',
  'networkCentrality',
  'budgetRoleEconomy',
  'lumpSumTwoStage',
] as const;

function num(row: Record<string, string>, key: string, line: number): number {
  const raw = row[key];
  if (raw === undefined || raw.trim() === '') throw new Error(`Sample row ${line}: "${key}" is required`);
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(`Sample row ${line}: "${key}" must be a number, got "${raw}"`);
  return value;
}

function optionalNum(row: Record<string, string>, key: string, line: number): number | null {
  const raw = row[key];
  if (raw === undefined || raw.trim() === '') return null;
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(`Sample row ${line}: "${key}" must be a number or empty, got "${raw}"`);
  return value;
}

function bool(row: Record<string, string>, key: string, line: number): boolean {
  const raw = (row[key] ?? '').trim().toLowerCase();
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  throw new Error(`Sample row ${line}: "${key}" must be true or false, got "${row[key]}"`);
}

/** Ground-truth label implied by the recorded outcome. */
export function labelForOutcome(outcome: EsrOutcome): G0Decision {
  return POSITIVE_OUTCOMES.has(outcome) ? 'GO' : 'NO_GO';
}

export function parseEsrSamples(csv: string): EsrSample[] {
  const rows = parse(csv, { columns: true, skip_empty_lines: true, trim: true, comment: '#' }) as Record<
    string,
    string
  >[];

  const seen = new Set<string>();
  return rows.map((row, index) => {
    const line = index + 1;
    for (const key of ['sampleId', 'cordisProjectId', 'title', 'topicCode', 'outcome', 'expertLabel']) {
      if (!row[key]) throw new Error(`Sample row ${line}: "${key}" is required`);
    }

    const sampleId = row.sampleId!;
    if (seen.has(sampleId)) throw new Error(`Sample row ${line}: duplicate sampleId "${sampleId}"`);
    seen.add(sampleId);

    const outcome = row.outcome as EsrOutcome;
    if (!ESR_OUTCOMES.includes(outcome)) {
      throw new Error(`Sample row ${line}: outcome must be one of ${ESR_OUTCOMES.join('|')}, got "${outcome}"`);
    }

    const expertLabel = row.expertLabel as G0Decision;
    if (expertLabel !== 'GO' && expertLabel !== 'NO_GO') {
      throw new Error(`Sample row ${line}: expertLabel must be GO or NO_GO, got "${expertLabel}"`);
    }

    const labelSource = (row.labelSource || 'cordis-outcome') as LabelSource;
    if (!LABEL_SOURCES.includes(labelSource)) {
      throw new Error(`Sample row ${line}: labelSource must be one of ${LABEL_SOURCES.join('|')}`);
    }

    // A label that contradicts its own outcome is almost always a typo, and a silent typo here
    // moves the headline accuracy. `expert-review` is the documented escape hatch for a genuine
    // human override (S16 is ineligible and was never submitted, so it has no CORDIS outcome).
    if (labelSource === 'cordis-outcome' && expertLabel !== labelForOutcome(outcome)) {
      throw new Error(
        `Sample row ${line}: expertLabel "${expertLabel}" contradicts outcome "${outcome}". ` +
          `Set labelSource=expert-review if the override is deliberate.`,
      );
    }

    const baseRatePct = num(row, 'baseRatePct', line);
    const features: G0Features = {
      alignment: num(row, 'alignment', line),
      baseRate: baseRateToScore(baseRatePct),
      coordinatorHistory: num(row, 'coordinatorHistory', line),
      researchAndEndUser: num(row, 'researchAndEndUser', line),
      networkCentrality: num(row, 'networkCentrality', line),
      budgetRoleEconomy: num(row, 'budgetRoleEconomy', line),
      lumpSumTwoStage: num(row, 'lumpSumTwoStage', line),
    };

    for (const key of NUMERIC_FEATURE_COLUMNS) {
      const value = features[key];
      if (value < 0 || value > 100) {
        throw new Error(`Sample row ${line}: "${key}" must be 0–100, got ${value}`);
      }
    }
    if (baseRatePct < 0 || baseRatePct > 100) {
      throw new Error(`Sample row ${line}: "baseRatePct" must be 0–100, got ${baseRatePct}`);
    }

    return {
      sampleId,
      cordisProjectId: row.cordisProjectId!,
      acronym: row.acronym ?? '',
      title: row.title!,
      framework: row.framework || 'OTHER',
      topicCode: row.topicCode!,
      coordinatorCountry: row.coordinatorCountry ?? '',
      orgType: row.orgType ?? '',
      countryEligible: bool(row, 'countryEligible', line),
      features,
      facts: { baseRatePct, countryEligible: bool(row, 'countryEligible', line) },
      esrTotal: optionalNum(row, 'esrTotal', line),
      esrThreshold: optionalNum(row, 'esrThreshold', line),
      outcome,
      expertLabel,
      labelSource,
      notes: row.notes ?? '',
    };
  });
}

/** True when every row still carries a reserved fixture id — i.e. no real ESR has been loaded. */
export function isFixtureSampleSet(samples: EsrSample[]): boolean {
  return samples.length > 0 && samples.every((s) => s.cordisProjectId.startsWith(FIXTURE_ID_PREFIX));
}
