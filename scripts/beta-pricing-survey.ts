#!/usr/bin/env tsx
/**
 * E11.4 — beta pricing-validation survey (TASK-MTQ3DZS6W6DFC).
 *
 * Two modes, one definition:
 *
 *   render   (default) Emit the questionnaire (tr/en Markdown), the Google Apps
 *            Script that builds it as a Google Form, the response-CSV template and
 *            one invitation mail per roster partner. Nothing is sent.
 *   analyze  Read a filled response CSV and regenerate docs/E11-PRICING-FEEDBACK.md.
 *
 * Safety model, same as scripts/beta-onboarding.ts:
 *   • Nothing is sent without an explicit `--send`.
 *   • `--send` refuses while any roster address sits on a reserved, undeliverable
 *     domain, and refuses while the form URL is still the placeholder — a survey
 *     mail with a dead link is worse than no mail.
 *   • No database writes at all: this script only reads the roster and writes files.
 *
 * Usage
 *   pnpm beta:pricing                                        # render everything, send nothing
 *   pnpm beta:pricing --send --form-tr=<url> --form-en=<url> # …and deliver via Resend
 *   pnpm beta:pricing --analyze --responses=<csv>            # regenerate the report
 *
 * Flags
 *   --roster=<path>     default docs/BETA_DATA/beta-partners.csv
 *   --out=<dir>         default docs/BETA_DATA/generated/pricing-survey
 *   --responses=<path>  response CSV for --analyze
 *   --report=<path>     default docs/E11-PRICING-FEEDBACK.md
 *   --workshop=<date>   week-7 pricing workshop, yyyy-mm-dd (default 2026-10-22)
 *   --form-tr=<url>     published Google Form, Turkish
 *   --form-en=<url>     published Google Form, English
 *   --anchor=<planId>   plan the price questions are anchored on (default team)
 */

import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

import { parseBetaRoster, isPlaceholderEmail, type BetaPartner } from '../src/lib/beta/roster';
import {
  PRICING_SURVEY_QUESTIONS,
  renderGoogleFormsScript,
  renderSurveyMarkdown,
  responseCsvHeader,
  type SurveyLocale,
} from '../src/lib/beta/pricing-survey';
import { renderPricingSurveyEmail } from '../src/lib/beta/pricing-survey-email';
import { buildReportData, parsePricingResponses } from '../src/lib/beta/pricing-analysis';
import { renderPricingReport } from '../src/lib/beta/pricing-report';
import { BETA_SUPPORT_EMAIL } from '../src/lib/beta/constants';

const REPO_ROOT = path.resolve(__dirname, '..');
const PLACEHOLDER_FORM = 'https://forms.gle/REPLACE-ME';

interface Options {
  roster: string;
  out: string;
  responses: string | null;
  report: string;
  workshop: string;
  formUrls: Record<SurveyLocale, string>;
  anchor: string;
  send: boolean;
  analyze: boolean;
}

function parseArgs(argv: string[]): Options {
  const opts: Options = {
    roster: path.join(REPO_ROOT, 'docs/BETA_DATA/beta-partners.csv'),
    out: path.join(REPO_ROOT, 'docs/BETA_DATA/generated/pricing-survey'),
    responses: null,
    report: path.join(REPO_ROOT, 'docs/E11-PRICING-FEEDBACK.md'),
    workshop: '2026-10-22',
    formUrls: { tr: PLACEHOLDER_FORM, en: PLACEHOLDER_FORM },
    anchor: 'team',
    send: false,
    analyze: false,
  };

  for (const arg of argv) {
    if (arg === '--send') opts.send = true;
    else if (arg === '--analyze' || arg === '--analyse') opts.analyze = true;
    else if (arg === '--render') opts.analyze = false;
    else if (arg.startsWith('--roster=')) opts.roster = path.resolve(arg.slice('--roster='.length));
    else if (arg.startsWith('--out=')) opts.out = path.resolve(arg.slice('--out='.length));
    else if (arg.startsWith('--responses=')) opts.responses = path.resolve(arg.slice('--responses='.length));
    else if (arg.startsWith('--report=')) opts.report = path.resolve(arg.slice('--report='.length));
    else if (arg.startsWith('--workshop=')) {
      const value = arg.slice('--workshop='.length);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('--workshop must be yyyy-mm-dd');
      opts.workshop = value;
    } else if (arg.startsWith('--form-tr=')) opts.formUrls.tr = arg.slice('--form-tr='.length);
    else if (arg.startsWith('--form-en=')) opts.formUrls.en = arg.slice('--form-en='.length);
    else if (arg.startsWith('--anchor=')) opts.anchor = arg.slice('--anchor='.length);
    else throw new Error(`Unknown flag "${arg}". Run with no flags to render without sending.`);
  }
  return opts;
}

const log = (step: string, message: string) => console.log(`[beta-pricing] ${step.padEnd(12)} ${message}`);

function mkdirp(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function formatDate(iso: string, locale: SurveyLocale, timezone: string): string {
  return new Intl.DateTimeFormat(locale === 'tr' ? 'tr-TR' : 'en-GB', {
    timeZone: timezone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(`${iso}T12:00:00Z`));
}

/** The CSV an operator fills in from the Google Sheets export. */
function responseTemplate(partners: readonly BetaPartner[], workshop: string): string {
  const lines = [
    '# Fabrika E11.4 — pricing survey responses (TASK-MTQ3DZS6W6DFC).',
    '#',
    '# STATUS: FIXTURE  <-- change to REAL once these are actual partner answers.',
    '# The analyser reads this line and banners the report accordingly, so a pipeline',
    '# test run can never be mistaken for the week-7 result.',
    '#',
    '# One row per respondent. Money columns are whole EUR, exactly as the respondent typed',
    '# them in the form (249, not 24900); the analyser converts to minor units on parse.',
    '# addons is a semicolon-separated list of add-on skus, or `none`.',
    `# Workshop: ${workshop}. Fill from the Google Forms response sheet; the form question`,
    '# titles carry their [column] id in brackets so the mapping is mechanical.',
    '#',
    `# columns: ${responseCsvHeader()}`,
    responseCsvHeader(),
  ];
  for (const partner of partners) {
    const blanks = PRICING_SURVEY_QUESTIONS.map(() => '').join(',');
    lines.push(
      [`R-${partner.slug}`, partner.slug, partner.country, partner.orgType, partner.locale, ''].join(',') +
        ',' +
        blanks
    );
  }
  return lines.join('\n') + '\n';
}

async function render(opts: Options): Promise<void> {
  const partners = parseBetaRoster(fs.readFileSync(opts.roster, 'utf8'));
  log('roster', `${partners.length} partners from ${path.relative(REPO_ROOT, opts.roster)}`);

  mkdirp(opts.out);
  mkdirp(path.join(opts.out, 'mail'));

  for (const locale of ['tr', 'en'] as const) {
    fs.writeFileSync(path.join(opts.out, `survey-${locale}.md`), renderSurveyMarkdown(locale), 'utf8');
    fs.writeFileSync(path.join(opts.out, `google-form-${locale}.gs`), renderGoogleFormsScript(locale), 'utf8');
  }
  log('survey', `questionnaire + Google Apps Script written for tr, en (${PRICING_SURVEY_QUESTIONS.length} questions)`);

  const templatePath = path.join(opts.out, 'responses-template.csv');
  fs.writeFileSync(templatePath, responseTemplate(partners, opts.workshop), 'utf8');
  log('template', `${path.relative(REPO_ROOT, templatePath)}`);

  if (opts.send) {
    const placeholderMail = partners.filter((p) => isPlaceholderEmail(p.contactEmail));
    if (placeholderMail.length > 0) {
      throw new Error(
        `--send refuses: ${placeholderMail.length} roster address(es) are on a reserved, undeliverable ` +
          `domain (${placeholderMail[0]?.contactEmail}). Point --roster at the real list first.`
      );
    }
    for (const locale of ['tr', 'en'] as const) {
      if (opts.formUrls[locale] === PLACEHOLDER_FORM) {
        throw new Error(`--send refuses: --form-${locale} is still the placeholder. Publish the form first.`);
      }
    }
  }

  const due = addDays(opts.workshop, -1);
  const summary: Record<string, unknown>[] = [];

  for (const partner of partners) {
    const email = renderPricingSurveyEmail({
      locale: partner.locale,
      contactName: partner.contactName,
      orgName: partner.orgName,
      formUrl: opts.formUrls[partner.locale],
      workshopLabel: formatDate(opts.workshop, partner.locale, partner.timezone || 'Europe/Brussels'),
      dueLabel: formatDate(due, partner.locale, partner.timezone || 'Europe/Brussels'),
    });

    fs.writeFileSync(path.join(opts.out, 'mail', `${partner.slug}.html`), email.html, 'utf8');
    fs.writeFileSync(
      path.join(opts.out, 'mail', `${partner.slug}.txt`),
      `Subject: ${email.subject}\nTo: ${partner.contactEmail}\n\n${email.text}\n`,
      'utf8'
    );

    let delivery = 'rendered-only';
    if (opts.send) {
      const apiKey = process.env.RESEND_API_KEY;
      if (!apiKey) throw new Error('--send requires RESEND_API_KEY in the environment');
      const { Resend } = await import('resend');
      const resend = new Resend(apiKey);
      const { error } = await resend.emails.send({
        from: process.env.EMAIL_FROM ?? `Fabrika Beta <${BETA_SUPPORT_EMAIL}>`,
        to: partner.contactEmail,
        subject: email.subject,
        html: email.html,
        text: email.text,
      });
      if (error) throw new Error(`Resend rejected ${partner.contactEmail}: ${error.message}`);
      delivery = 'sent';
    }
    log('mail', `${partner.slug}: ${delivery} (${partner.locale})`);
    summary.push({ slug: partner.slug, email: partner.contactEmail, locale: partner.locale, delivery });
  }

  fs.writeFileSync(
    path.join(opts.out, 'survey-summary.json'),
    JSON.stringify(
      {
        task: 'TASK-MTQ3DZS6W6DFC',
        cohort: 'E11',
        generatedAt: new Date().toISOString(),
        workshop: opts.workshop,
        dueBy: due,
        questions: PRICING_SURVEY_QUESTIONS.length,
        emailMode: opts.send ? 'send' : 'render-only',
        formUrls: opts.formUrls,
        partners: summary,
      },
      null,
      2
    ) + '\n',
    'utf8'
  );
  log('done', opts.send ? 'survey delivered' : 'rendered — pass --send with real addresses and form URLs to deliver');
}

function analyze(opts: Options): void {
  if (!opts.responses) throw new Error('--analyze requires --responses=<path to the response CSV>');
  const csv = fs.readFileSync(opts.responses, 'utf8');
  const parsed = parsePricingResponses(csv);
  const data = buildReportData(parsed);
  const partners = parseBetaRoster(fs.readFileSync(opts.roster, 'utf8'));

  log('parse', `${data.n} valid response(s), ${data.rejected.length} rejected, status ${data.status}`);
  for (const r of data.rejected) log('rejected', `row ${r.row} (${r.respondentId}): ${r.reason}`);

  const markdown = renderPricingReport(data, {
    generatedAt: new Date().toISOString().slice(0, 19).replace('T', ' ') + 'Z',
    sourcePath: path.relative(REPO_ROOT, opts.responses),
    invited: partners.length,
    anchorPlanId: opts.anchor,
  });
  mkdirp(path.dirname(opts.report));
  fs.writeFileSync(opts.report, markdown, 'utf8');
  log('report', path.relative(REPO_ROOT, opts.report));

  if (data.status !== 'REAL') {
    log('warning', 'dataset is not declared REAL — the report carries a banner saying so');
  }
  if (data.n < 8) {
    log('warning', `acceptance criterion is ≥8 responses; this run has ${data.n}`);
  }
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.analyze) analyze(opts);
  else await render(opts);
}

main().catch((error: unknown) => {
  console.error('[beta-pricing] FAILED:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
