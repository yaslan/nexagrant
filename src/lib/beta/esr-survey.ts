/**
 * Beta ESR calibration survey (E11.3) — assignment, mail rendering, response ingest.
 *
 * The question we put to the design partners is deliberately narrow: "we scored this opportunity
 * <n>/100 and answered <GO|NO_GO> at G0 — is that the answer you would have given?" A partner who
 * disagrees supplies their own verdict, and that verdict becomes the ground-truth label with
 * `labelSource=beta-survey`, replacing the provisional CORDIS-outcome label.
 *
 * Copy lives here, not in `messages/*.json`, for the same reason as `./invite-email.ts`: no React
 * tree renders it, so `next-intl` cannot.
 */

import { parse } from 'csv-parse/sync';

import { BETA_APP_URL, BETA_FEEDBACK_EMAIL, BETA_SUPPORT_EMAIL } from './constants';
import type { BetaPartner } from './roster';
import type { EsrSample } from './esr-samples';
import type { G0Decision } from '../scoring/g0-canonical';
import type { RenderedEmail } from './invite-email';

export type SurveyLocale = 'tr' | 'en';

export interface SurveyItem {
  sampleId: string;
  acronym: string;
  title: string;
  topicCode: string;
  /** What the scorer produced, 0–100. */
  score: number;
  /** What the gate answered. */
  decision: G0Decision;
  /** Why, when the answer was NO_GO. */
  reasons: string[];
}

export interface SurveyAssignment {
  partner: BetaPartner;
  items: SurveyItem[];
}

/**
 * Round-robin assignment.
 *
 * Every sample is reviewed by more than one partner on purpose: a single reviewer's verdict is an
 * opinion, and with n = 20 one confidently wrong opinion moves the headline accuracy by five points.
 * Starting each partner at a rotating offset keeps the coverage even without any randomness, so a
 * re-run produces exactly the same assignment and a partner never gets a different worksheet.
 */
export function assignSamplesToPartners(
  samples: EsrSample[],
  partners: BetaPartner[],
  itemsPerPartner: number,
): SurveyAssignment[] {
  if (samples.length === 0 || partners.length === 0) return [];
  return partners.map((partner, partnerIndex) => {
    const items: EsrSample[] = [];
    for (let i = 0; i < itemsPerPartner; i++) {
      const sample = samples[(partnerIndex * itemsPerPartner + i) % samples.length];
      if (sample) items.push(sample);
    }
    return { partner, items: items.map(toSurveyItemStub) };
  });
}

/** Placeholder until the caller fills in the scored fields — kept separate so scoring stays in the CLI. */
function toSurveyItemStub(sample: EsrSample): SurveyItem {
  return {
    sampleId: sample.sampleId,
    acronym: sample.acronym,
    title: sample.title,
    topicCode: sample.topicCode,
    score: 0,
    decision: 'NO_GO',
    reasons: [],
  };
}

/** How many independent verdicts each sample ends up with under a given assignment. */
export function coveragePerSample(assignments: SurveyAssignment[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const assignment of assignments) {
    for (const item of assignment.items) {
      counts.set(item.sampleId, (counts.get(item.sampleId) ?? 0) + 1);
    }
  }
  return counts;
}

const COPY = {
  tr: {
    subject: 'Fabrika Beta — G0 skoru doğrulama anketi (5 dakika)',
    greeting: (name: string) => `Merhaba ${name},`,
    intro: (n: number) =>
      `Fabrika'nın G0 triyaj skorunu gerçek değerlendirme sonuçlarıyla kalibre ediyoruz. ` +
      `Aşağıda ${n} örnek fırsat var; her biri için Fabrika'nın verdiği skoru ve kararı görüyorsunuz.`,
    ask: 'Tek sorumuz şu: siz olsanız aynı kararı verir miydiniz?',
    howTitle: 'Nasıl yanıtlanır',
    how: [
      'Her satır için "Katılıyorum" ya da "Katılmıyorum" seçin.',
      'Katılmıyorsanız kendi kararınızı yazın: GO (peşinden gidilir) ya da NO_GO (geçilir).',
      'Bir cümlelik gerekçe bizim için en değerli kısım — "taban oran bu çağrıda yanıltıcı" gibi.',
    ],
    scoreLabel: 'Fabrika skoru',
    decisionLabel: 'Fabrika kararı',
    reasonsLabel: 'Gerekçe',
    noReasons: 'Tüm G0 kuralları geçildi',
    deadline: (label: string) => `Yanıtlarınızı ${label} tarihine kadar bekliyoruz.`,
    ctaOpen: 'Anketi aç',
    privacy:
      'Bu ankette yer alan örnekler kalibrasyon içindir; kendi tekliflerinizin değerlendirme raporlarını ' +
      'bizimle paylaşmak zorunda değilsiniz. Paylaşmak isterseniz ayrıca yazın, ayrı bir onayla ilerleriz.',
    disclaimer:
      'Fabrika skoru bir iç ön değerlendirmedir; Avrupa Komisyonu\'nun resmî puanı değildir.',
    signoff: 'Teşekkürler,\nFabrika ekibi',
    support: (email: string) => `Soru olursa ${email} adresine yazın.`,
  },
  en: {
    subject: 'Fabrika Beta — G0 score validation survey (5 minutes)',
    greeting: (name: string) => `Hello ${name},`,
    intro: (n: number) =>
      `We are calibrating Fabrika's G0 triage score against real evaluation outcomes. ` +
      `Below are ${n} sample opportunities, each with the score and the decision Fabrika produced.`,
    ask: 'Our only question: would you have made the same call?',
    howTitle: 'How to answer',
    how: [
      'For each row, pick "Agree" or "Disagree".',
      'If you disagree, give your own verdict: GO (worth pursuing) or NO_GO (skip it).',
      'A one-sentence reason is the most valuable part — e.g. "the base rate misleads on this call".',
    ],
    scoreLabel: 'Fabrika score',
    decisionLabel: 'Fabrika decision',
    reasonsLabel: 'Reasons',
    noReasons: 'All G0 rules passed',
    deadline: (label: string) => `We are collecting answers until ${label}.`,
    ctaOpen: 'Open the survey',
    privacy:
      'These samples exist for calibration; you are not asked to share your own evaluation summary ' +
      'reports. If you would like to, tell us separately and we will agree a basis first.',
    disclaimer:
      "Fabrika's score is an internal pre-assessment, not the European Commission's official score.",
    signoff: 'Thanks,\nThe Fabrika team',
    support: (email: string) => `Questions? Write to ${email}.`,
  },
} as const;

export interface EsrSurveyEmailParams {
  locale: SurveyLocale;
  contactName: string;
  items: SurveyItem[];
  surveyUrl: string;
  /** Already formatted for the recipient, e.g. "20 Eylül 2026". */
  deadlineLabel: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function renderEsrSurveyEmail(params: EsrSurveyEmailParams): RenderedEmail {
  const c = COPY[params.locale];
  const { items } = params;

  const rowsText = items
    .map((item, i) => {
      const reasons = item.reasons.length ? item.reasons.join('; ') : c.noReasons;
      return [
        `${i + 1}. [${item.sampleId}] ${item.acronym} — ${item.title}`,
        `   ${item.topicCode}`,
        `   ${c.scoreLabel}: ${item.score.toFixed(2)}/100 · ${c.decisionLabel}: ${item.decision}`,
        `   ${c.reasonsLabel}: ${reasons}`,
      ].join('\n');
    })
    .join('\n\n');

  const text = [
    c.greeting(params.contactName),
    '',
    c.intro(items.length),
    c.ask,
    '',
    `${c.howTitle}:`,
    ...c.how.map((line) => `  • ${line}`),
    '',
    rowsText,
    '',
    c.deadline(params.deadlineLabel),
    `${c.ctaOpen}: ${params.surveyUrl}`,
    '',
    c.privacy,
    c.disclaimer,
    '',
    c.support(BETA_FEEDBACK_EMAIL),
    '',
    c.signoff,
  ].join('\n');

  const rowsHtml = items
    .map(
      (item, i) => `
      <tr>
        <td style="padding:10px 8px;border-bottom:1px solid #e5e7eb;vertical-align:top;">${i + 1}</td>
        <td style="padding:10px 8px;border-bottom:1px solid #e5e7eb;vertical-align:top;">
          <strong>${escapeHtml(item.acronym)}</strong> — ${escapeHtml(item.title)}<br>
          <span style="color:#6b7280;font-size:12px;">${escapeHtml(item.sampleId)} · ${escapeHtml(item.topicCode)}</span>
        </td>
        <td style="padding:10px 8px;border-bottom:1px solid #e5e7eb;vertical-align:top;text-align:right;white-space:nowrap;">
          <strong>${item.score.toFixed(2)}</strong>/100
        </td>
        <td style="padding:10px 8px;border-bottom:1px solid #e5e7eb;vertical-align:top;white-space:nowrap;">
          ${item.decision}
        </td>
        <td style="padding:10px 8px;border-bottom:1px solid #e5e7eb;vertical-align:top;color:#6b7280;font-size:12px;">
          ${escapeHtml(item.reasons.length ? item.reasons.join('; ') : c.noReasons)}
        </td>
      </tr>`,
    )
    .join('');

  const html = `<!doctype html>
<html lang="${params.locale}">
<body style="margin:0;padding:24px;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#111827;">
  <div style="max-width:720px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;padding:28px;">
    <p>${escapeHtml(c.greeting(params.contactName))}</p>
    <p>${escapeHtml(c.intro(items.length))}</p>
    <p><strong>${escapeHtml(c.ask)}</strong></p>
    <h3 style="font-size:15px;margin:20px 0 8px;">${escapeHtml(c.howTitle)}</h3>
    <ul style="padding-left:20px;margin:0 0 20px;">
      ${c.how.map((line) => `<li style="margin-bottom:4px;">${escapeHtml(line)}</li>`).join('')}
    </ul>
    <table style="width:100%;border-collapse:collapse;font-size:13px;">
      <thead>
        <tr style="text-align:left;color:#374151;">
          <th style="padding:8px;border-bottom:2px solid #d1d5db;">#</th>
          <th style="padding:8px;border-bottom:2px solid #d1d5db;">${escapeHtml(c.decisionLabel)}</th>
          <th style="padding:8px;border-bottom:2px solid #d1d5db;text-align:right;">${escapeHtml(c.scoreLabel)}</th>
          <th style="padding:8px;border-bottom:2px solid #d1d5db;">G0</th>
          <th style="padding:8px;border-bottom:2px solid #d1d5db;">${escapeHtml(c.reasonsLabel)}</th>
        </tr>
      </thead>
      <tbody>${rowsHtml}</tbody>
    </table>
    <p style="margin-top:24px;">
      <a href="${escapeHtml(params.surveyUrl)}"
         style="display:inline-block;background:#0369A1;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600;">
        ${escapeHtml(c.ctaOpen)}
      </a>
    </p>
    <p style="color:#374151;">${escapeHtml(c.deadline(params.deadlineLabel))}</p>
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">
    <p style="color:#6b7280;font-size:12px;">${escapeHtml(c.privacy)}</p>
    <p style="color:#6b7280;font-size:12px;"><em>${escapeHtml(c.disclaimer)}</em></p>
    <p style="color:#6b7280;font-size:12px;">${escapeHtml(c.support(BETA_FEEDBACK_EMAIL))}</p>
    <p style="color:#6b7280;font-size:12px;white-space:pre-line;">${escapeHtml(c.signoff)}</p>
  </div>
</body>
</html>`;

  return { subject: c.subject, html, text };
}

export function surveyUrlFor(partnerSlug: string): string {
  return `${BETA_APP_URL}/beta/esr-calibration?partner=${encodeURIComponent(partnerSlug)}`;
}

export const SURVEY_RESPONSE_COLUMNS = ['partnerSlug', 'sampleId', 'agrees', 'verdict', 'comment'] as const;

export interface SurveyResponse {
  partnerSlug: string;
  sampleId: string;
  agrees: boolean;
  /** The partner's own verdict. Required when they disagree; ignored otherwise. */
  verdict: G0Decision | null;
  comment: string;
}

/** A blank worksheet the partner (or whoever transcribes the form) fills in. */
export function buildResponseTemplateCsv(assignment: SurveyAssignment): string {
  const header = SURVEY_RESPONSE_COLUMNS.join(',');
  const rows = assignment.items.map((item) =>
    [assignment.partner.slug, item.sampleId, '', '', ''].join(','),
  );
  return [
    '# Fabrika ESR calibration survey — one row per sample.',
    '# agrees: true|false   verdict: GO|NO_GO (required only when agrees=false)   comment: free text',
    header,
    ...rows,
    '',
  ].join('\n');
}

export function parseSurveyResponses(csv: string): SurveyResponse[] {
  const rows = parse(csv, { columns: true, skip_empty_lines: true, trim: true, comment: '#' }) as Record<
    string,
    string
  >[];

  return rows
    .filter((row) => (row.agrees ?? '').trim() !== '')
    .map((row, index) => {
      const line = index + 1;
      for (const key of ['partnerSlug', 'sampleId']) {
        if (!row[key]) throw new Error(`Response row ${line}: "${key}" is required`);
      }
      const agreesRaw = (row.agrees ?? '').trim().toLowerCase();
      if (agreesRaw !== 'true' && agreesRaw !== 'false') {
        throw new Error(`Response row ${line}: "agrees" must be true or false, got "${row.agrees}"`);
      }
      const agrees = agreesRaw === 'true';
      const verdictRaw = (row.verdict ?? '').trim().toUpperCase();
      if (!agrees && verdictRaw !== 'GO' && verdictRaw !== 'NO_GO') {
        throw new Error(`Response row ${line}: a disagreement must carry a verdict of GO or NO_GO`);
      }
      return {
        partnerSlug: row.partnerSlug!,
        sampleId: row.sampleId!,
        agrees,
        verdict: verdictRaw === 'GO' || verdictRaw === 'NO_GO' ? (verdictRaw as G0Decision) : null,
        comment: row.comment ?? '',
      };
    });
}

/**
 * What a response file that cannot be folded in looks like.
 *
 * Ingest used to be the quiet step: `applyResponses` looked each verdict up in the sample set with
 * `.find`, and anything that did not match — a transcribed `S1` where the sheet says `S01`, a row
 * from someone who was never on the roster — simply never became a label. The run still printed
 * "5 verdicts" and the readiness gate still turned `responses` green, so a criterion could close on
 * ground truth that was silently thinner than the count suggested. A verdict is either understood
 * or it is a problem the operator has to fix; it is never quietly dropped.
 */
export interface ResponseReconciliation {
  /** Rows naming a known sample and a known partner, with identical repeats collapsed. */
  accepted: SurveyResponse[];
  /** Why the file cannot be folded in. Empty means it can. */
  problems: string[];
  /** Identical repeats that were collapsed — unambiguous, so a note rather than a problem. */
  collapsed: number;
}

/**
 * Check a response file against the sample set and the roster before any label moves.
 *
 * `partnerSlugs` empty means the roster was not available; partner identity then goes unchecked
 * rather than rejecting every row.
 */
export function reconcileResponses(
  responses: SurveyResponse[],
  known: { sampleIds: Iterable<string>; partnerSlugs: Iterable<string> },
): ResponseReconciliation {
  const sampleIds = new Set(known.sampleIds);
  const partnerSlugs = new Set(known.partnerSlugs);
  const problems: string[] = [];

  const unknownSamples = [...new Set(responses.filter((r) => !sampleIds.has(r.sampleId)).map((r) => r.sampleId))];
  if (unknownSamples.length > 0) {
    problems.push(
      `${unknownSamples.length} verdict(s) name a sampleId that is not in the sample set: ${unknownSamples.join(', ')} — ` +
        'fix the transcription; a verdict that matches nothing is lost ground truth, not a blank row',
    );
  }
  if (partnerSlugs.size > 0) {
    const strangers = [...new Set(responses.filter((r) => !partnerSlugs.has(r.partnerSlug)).map((r) => r.partnerSlug))];
    if (strangers.length > 0) {
      problems.push(
        `${strangers.length} verdict(s) come from a partnerSlug that is not on the roster: ${strangers.join(', ')} — ` +
          'either the slug is mistyped or the answers are not from a design partner',
      );
    }
  }

  // One partner, one sample, one verdict. The same answer twice is a re-sent sheet and collapses;
  // two different answers cannot be resolved here — which one supersedes the other is the
  // operator's knowledge, and guessing "the last row wins" would move a majority on a coin flip.
  const seen = new Map<string, SurveyResponse>();
  const accepted: SurveyResponse[] = [];
  let collapsed = 0;
  for (const response of responses) {
    const key = `${response.partnerSlug}\u0000${response.sampleId}`;
    const prior = seen.get(key);
    if (!prior) {
      seen.set(key, response);
      accepted.push(response);
      continue;
    }
    if (prior.agrees === response.agrees && prior.verdict === response.verdict) {
      collapsed++;
      continue;
    }
    problems.push(
      `${response.partnerSlug} answered ${response.sampleId} twice with different verdicts ` +
        `(${describeVerdict(prior)} then ${describeVerdict(response)}) — remove the superseded row`,
    );
  }

  return { accepted: problems.length > 0 ? [] : accepted, problems, collapsed };
}

function describeVerdict(response: SurveyResponse): string {
  return response.agrees ? 'agrees' : `disagrees/${response.verdict}`;
}

export interface VerdictRollup {
  sampleId: string;
  /** Verdicts that name a decision, i.e. the partner's own call. */
  go: number;
  noGo: number;
  responses: number;
  /** Majority verdict, or `null` on a tie — a tie must not silently pick a side. */
  majority: G0Decision | null;
}

/**
 * Fold partner responses into one verdict per sample.
 *
 * "Agree" is not a vote for a fixed side: it means the partner endorses whatever the scorer said for
 * that sample, so the caller supplies `predicted` and agreement counts toward that decision.
 */
export function rollUpVerdicts(
  responses: SurveyResponse[],
  predicted: Map<string, G0Decision>,
): VerdictRollup[] {
  const bySample = new Map<string, VerdictRollup>();
  for (const response of responses) {
    const current =
      bySample.get(response.sampleId) ??
      { sampleId: response.sampleId, go: 0, noGo: 0, responses: 0, majority: null };
    const decision = response.agrees ? predicted.get(response.sampleId) ?? null : response.verdict;
    if (decision === 'GO') current.go++;
    else if (decision === 'NO_GO') current.noGo++;
    current.responses++;
    bySample.set(response.sampleId, current);
  }
  for (const rollup of bySample.values()) {
    rollup.majority = rollup.go === rollup.noGo ? null : rollup.go > rollup.noGo ? 'GO' : 'NO_GO';
  }
  return [...bySample.values()].sort((a, b) => a.sampleId.localeCompare(b.sampleId));
}

export { BETA_SUPPORT_EMAIL };
