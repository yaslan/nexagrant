/**
 * The M17 Markdown report (FO-188 §6), generated from the checked answer and the
 * score computed from its marks — never written by the model. Four sections, in
 * the owner's order; an elimination risk is printed before the score.
 *
 * Pure: every word comes from `t` (messages/{tr,en}.json → InterregReview.report),
 * every number from the grid and the marks.
 */
import type { KnockoutFlag, RubricScore } from '../rubric';
import type { EvaluationOutput } from './evaluation-output';

/** next-intl's `t`, narrowed to what this file uses. */
export type ReportT = (key: string, values?: Record<string, string | number>) => string;

export interface ReportCriterion {
  criterionKey: string;
  officialRef: string;
  maxMark: number;
}

export interface ReportInput {
  t: ReportT;
  locale: string;
  criteria: readonly ReportCriterion[];
  programCheckKeys: readonly string[];
  score: RubricScore;
  flags: readonly KnockoutFlag[];
  output: EvaluationOutput;
  /** Characters of the call guide left out to fit the context window (0 = all of it was read). */
  callCharsOmitted: number;
  /** Characters of the project file left out to fit the context window (0 = all of it was read). */
  projectCharsOmitted: number;
}

export interface RedFlag {
  finding: string;
  why: string;
  fix: string;
  /** `knockout` / `total` / `programme_check` are computed here; `model` came from the answer. */
  source: 'knockout' | 'total' | 'programme_check' | 'model';
}

/** A table cell or one-line value: no pipe, no line break. */
function cell(s: string): string {
  return s.replace(/\r?\n+/g, ' ').replace(/\|/g, '\\|').trim();
}

function quote(s: string): string {
  return s
    .split(/\r?\n/)
    .map((l) => `> ${l}`)
    .join('\n');
}

function num(locale: string, n: number): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(n);
}

/**
 * Every red flag, computed ones first: knockout criteria below their floor, the
 * total below the pass mark, programme checks the answer found `missing`, then
 * the model's own findings. Stored as InterregAnalysisResult.redFlags.
 */
export function redFlagsOf(input: Pick<ReportInput, 't' | 'locale' | 'criteria' | 'score' | 'flags' | 'output'>): RedFlag[] {
  const { t, locale, criteria, score, flags, output } = input;
  const out: RedFlag[] = [];
  for (const f of flags) {
    if (f.kind === 'criterion') {
      const c = criteria.find((x) => x.criterionKey === f.criterionKey)!;
      const vars = { ref: c.officialRef, name: t(`criteria.${c.criterionKey}`), mark: num(locale, f.mark), floor: num(locale, f.floor) };
      out.push({ source: 'knockout', finding: t('report.flagCriterion.finding', vars), why: t('report.flagCriterion.why', vars), fix: t('report.flagCriterion.fix', vars) });
    } else {
      const vars = { raw: num(locale, f.raw), maxRaw: num(locale, score.maxRaw), passRaw: num(locale, f.passRaw) };
      out.push({ source: 'total', finding: t('report.flagTotal.finding', vars), why: t('report.flagTotal.why', vars), fix: t('report.flagTotal.fix', vars) });
    }
  }
  for (const c of output.programChecks) {
    if (c.status !== 'missing') continue;
    const vars = { check: t(`programChecks.${c.key}`), note: c.note };
    out.push({ source: 'programme_check', finding: t('report.flagCheck.finding', vars), why: t('report.flagCheck.why', vars), fix: t('report.flagCheck.fix', vars) });
  }
  for (const r of output.redFlags) out.push({ source: 'model', ...r });
  return out;
}

export function buildReportMarkdown(input: ReportInput): string {
  const { t, locale, criteria, score, flags, output } = input;
  const n = (x: number) => num(locale, x);
  const name = (key: string) => t(`criteria.${key}`);
  const ref = (key: string) => criteria.find((c) => c.criterionKey === key)?.officialRef ?? key;
  const lines: string[] = [];
  const push = (...l: string[]) => lines.push(...l);

  push(`> ${t('assessmentNotice')}`, '');

  // 1 — summary and estimated score; an elimination risk comes first.
  push(`## ${t('report.sections.summary')}`, '');
  if (flags.length) {
    push(`**${t('report.eliminationRisk')}**`, '');
    for (const f of redFlagsOf(input).filter((r) => r.source === 'knockout' || r.source === 'total')) push(`- 🔴 ${f.finding}`);
    push('');
  }
  push(
    t('report.scoreLine', { score100: n(score.score100), raw: n(score.raw), maxRaw: n(score.maxRaw) }),
    '',
  );
  if (score.passRaw !== null && score.pass100 !== null) {
    push(t('report.threshold', { passRaw: n(score.passRaw), maxRaw: n(score.maxRaw), pass100: n(score.pass100) }), '');
  }
  push(`| ${t('report.table.ref')} | ${t('report.table.criterion')} | ${t('report.table.mark')} |`, '|---|---|---:|');
  for (const m of output.criterionMarks) {
    const c = criteria.find((x) => x.criterionKey === m.criterionKey)!;
    push(`| ${c.officialRef} | ${cell(name(c.criterionKey))} | ${n(m.mark)}/${n(c.maxMark)} |`);
  }
  push('', `**${t('report.checksHeading')}**`, '');
  for (const key of input.programCheckKeys) {
    const c = output.programChecks.find((x) => x.key === key)!;
    push(`- ${t(`report.checkStatus.${c.status}`)} — ${cell(t(`programChecks.${key}`))}: ${cell(c.note)}`);
  }
  if (output.callGridNote) push('', `_${t('report.callGridNote')}_ ${cell(output.callGridNote)}`);
  if (input.callCharsOmitted > 0) push('', `_${t('report.contextTrimmed', { chars: n(input.callCharsOmitted) })}_`);
  if (input.projectCharsOmitted > 0) push('', `_${t('report.projectTrimmed', { chars: n(input.projectCharsOmitted) })}_`);
  push('');

  // 2 — critical cross-border gaps.
  push(`## ${t('report.sections.critical')}`, '');
  const red = redFlagsOf(input);
  if (!red.length) push(t('report.noRedFlags'), '');
  for (const r of red) {
    push(`- **${t('report.finding')}:** ${cell(r.finding)}`, `  - **${t('report.why')}:** ${cell(r.why)}`, `  - **${t('report.fix')}:** ${cell(r.fix)}`);
  }
  push('');

  // 3 — areas that would raise a mark, criterion by criterion.
  push(`## ${t('report.sections.improve')}`, '');
  let any = false;
  for (const m of output.criterionMarks) {
    const tips = output.improvements.filter((i) => i.criterionKey === m.criterionKey);
    if (!m.weaknesses.length && !tips.length) continue;
    any = true;
    push(`### ${ref(m.criterionKey)} ${name(m.criterionKey)} — ${n(m.mark)}`);
    for (const w of m.weaknesses) push(`- ${t('report.weakness')}: ${cell(w)}`);
    for (const s of m.strengths) push(`- ${t('report.strength')}: ${cell(s)}`);
    for (const e of m.evidence) push(`- ${t('report.evidence')}: “${cell(e.quote)}” (${cell(e.location)})`);
    for (const i of tips) push(`- **${t('report.suggestion')}:** ${cell(i.suggestion)}`);
    push('');
  }
  if (!any) push(t('report.noImprovements'), '');

  // 4 — one weak paragraph rewritten in Interreg vocabulary (English).
  push(`## ${t('report.sections.rewrite')}`, '');
  push(`**${t('report.original')}** (${cell(output.rewrite.location)})`, '', quote(output.rewrite.originalExcerpt), '');
  push(`**${t('report.revised')}**`, '', quote(output.rewrite.revisedEn), '');

  return lines.join('\n');
}
