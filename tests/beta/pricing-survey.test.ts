import { describe, it, expect } from 'vitest';
import {
  GG_LADDER_CENTS,
  PRICING_SURVEY_QUESTIONS,
  RESPONSE_META_COLUMNS,
  renderGoogleFormsScript,
  renderSurveyMarkdown,
  responseCsvHeader,
} from '@/lib/beta/pricing-survey';
import { ANALYSED_QUESTION_IDS } from '@/lib/beta/pricing-analysis';

describe('pricing survey definition', () => {
  it('has a unique id per question', () => {
    const ids = PRICING_SURVEY_QUESTIONS.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('carries both locales on every question and option', () => {
    for (const q of PRICING_SURVEY_QUESTIONS) {
      expect(q.tr, `${q.id}.tr`).toBeTruthy();
      expect(q.en, `${q.id}.en`).toBeTruthy();
      for (const opt of q.options ?? []) {
        expect(opt.tr, `${q.id}/${opt.value}.tr`).toBeTruthy();
        expect(opt.en, `${q.id}/${opt.value}.en`).toBeTruthy();
      }
    }
  });

  it('gives every choice question its options', () => {
    for (const q of PRICING_SURVEY_QUESTIONS) {
      if (q.kind === 'single' || q.kind === 'multi') expect(q.options?.length ?? 0).toBeGreaterThan(1);
    }
  });

  it('asks one Gabor-Granger question per ladder rung', () => {
    for (const cents of GG_LADDER_CENTS) {
      expect(PRICING_SURVEY_QUESTIONS.some((q) => q.id === `gg${cents / 100}`)).toBe(true);
    }
  });

  it('keeps the response CSV header in step with the questionnaire', () => {
    const header = responseCsvHeader().split(',');
    expect(header.slice(0, RESPONSE_META_COLUMNS.length)).toEqual([...RESPONSE_META_COLUMNS]);
    expect(header.slice(RESPONSE_META_COLUMNS.length)).toEqual([...ANALYSED_QUESTION_IDS]);
  });

  it('renders a Markdown questionnaire in both locales', () => {
    for (const locale of ['tr', 'en'] as const) {
      const md = renderSurveyMarkdown(locale);
      for (const q of PRICING_SURVEY_QUESTIONS) expect(md, `${locale}/${q.id}`).toContain(`\`${q.id}\``);
      expect(md).toContain(locale === 'tr' ? 'Fiyat Doğrulama Anketi' : 'Pricing Validation Survey');
    }
  });

  it('shows no price before the Van Westendorp questions', () => {
    // The whole point of Van Westendorp is that the respondent is not anchored.
    const md = renderSurveyMarkdown('en');
    const beforeVw = md.slice(0, md.indexOf('`vwTooCheap`'));
    expect(beforeVw).not.toMatch(/€\s?\d/);
  });

  it('never nests bold inside bold in the Markdown', () => {
    for (const locale of ['tr', 'en'] as const) {
      for (const line of renderSurveyMarkdown(locale).split('\n')) {
        const markers = (line.match(/\*\*/g) ?? []).length;
        expect(markers % 2, `odd emphasis markers: ${line}`).toBe(0);
        // Sequential bold is fine; a whole line wrapped in bold that also contains
        // bold is what renders as literal asterisks.
        const wrapped = line.startsWith('**') && line.trimEnd().endsWith('**') && markers > 2;
        expect(wrapped, `bold nested inside bold: ${line}`).toBe(false);
      }
    }
  });

  it('strips Markdown emphasis out of the Google Form, which renders none', () => {
    for (const locale of ['tr', 'en'] as const) {
      for (const line of renderGoogleFormsScript(locale).split('\n')) {
        if (line.includes('setTitle(') || line.includes('setHelpText(')) {
          expect(line, `raw asterisks reach the form: ${line}`).not.toContain('**');
        }
      }
    }
  });

  it('tells the respondent to answer money questions in euro, not cents', () => {
    for (const locale of ['tr', 'en'] as const) {
      const md = renderSurveyMarkdown(locale);
      expect(md).toMatch(locale === 'tr' ? /kuruş değil/ : /not cents/);
    }
  });

  it('escapes quotes in the generated Google Apps Script', () => {
    for (const locale of ['tr', 'en'] as const) {
      const gs = renderGoogleFormsScript(locale);
      expect(gs).toContain('function createForm()');
      // Every question reaches the form, tagged with the CSV column it feeds.
      for (const q of PRICING_SURVEY_QUESTIONS) expect(gs, `${locale}/${q.id}`).toContain(`[${q.id}]`);
      // A stray unescaped apostrophe would break the script at paste time. Count the
      // string delimiters: each setter line must have an even number of quotes.
      for (const line of gs.split('\n')) {
        const quotes = (line.match(/(?<!\\)'/g) ?? []).length;
        expect(quotes % 2, `unbalanced quotes: ${line}`).toBe(0);
      }
    }
  });
});
