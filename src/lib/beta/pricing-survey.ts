/**
 * E11.4 — beta pricing-validation survey (TASK-MTQ3DZS6W6DFC).
 *
 * One definition, three renderings: the questionnaire the partners answer, the
 * Google Apps Script that builds that questionnaire as a Google Form, and the
 * response-CSV contract the analysis in `pricing-analysis.ts` reads back. Keeping
 * them in one file is the point — a question added to the form that the CSV does
 * not carry would silently drop out of the report.
 *
 * The copy lives here rather than in `messages/*.json` for the same reason as
 * `invite-email.ts`: nothing here is rendered by a React tree, so `next-intl`
 * cannot reach it. Both locales sit in one table so a change to one is visibly a
 * change to the other.
 *
 * Money: every amount is an Int in minor units (cents) plus a currency, per the
 * repo rule. The survey is priced in EUR; `currencyPref` records that a partner
 * would rather be billed in TRY, it does not convert anything.
 */

import { PRODUCT_NAME } from '../brand';

export type SurveyLocale = 'tr' | 'en';

export const PRICING_SURVEY_CURRENCY = 'EUR';

/** Gabor-Granger ladder for the Team plan, in EUR cents. List price is 24900. */
export const GG_LADDER_CENTS = [14900, 19900, 24900, 29900, 34900] as const;

export type QuestionKind =
  | 'scale' // 0-10
  | 'number' // integer
  | 'money' // EUR cents
  | 'single' // one option
  | 'multi' // zero or more options
  | 'yesno'
  | 'text';

export interface SurveyOption {
  value: string;
  tr: string;
  en: string;
}

export interface SurveyQuestion {
  /** Also the response-CSV column name. */
  id: string;
  kind: QuestionKind;
  section: SectionId;
  required: boolean;
  tr: string;
  en: string;
  /** Shown under the question. */
  helpTr?: string;
  helpEn?: string;
  options?: readonly SurveyOption[];
}

export type SectionId = 'profile' | 'value' | 'plan' | 'addons' | 'billing' | 'transition' | 'open';

export const SECTIONS: Record<SectionId, { tr: string; en: string; introTr: string; introEn: string }> = {
  profile: {
    tr: 'A · Kurumunuz',
    en: 'A · Your organisation',
    introTr: 'Yanıtlarınızı segment bazında okuyabilmek için birkaç bağlam sorusu.',
    introEn: 'A few context questions so we can read the answers by segment.',
  },
  value: {
    tr: 'B · Değer ve fiyat algısı',
    en: 'B · Value and price perception',
    introTr:
      'Bu bölümde size hiçbir fiyat göstermiyoruz — rakamları siz veriyorsunuz. Aylık, KDV hariç, ' +
      'kurumunuzun tamamı için (koltuk başına değil) düşünün.',
    introEn:
      'We deliberately show you no price in this section — the numbers are yours. Think monthly, ' +
      'excluding VAT, for your whole organisation (not per seat).',
  },
  plan: {
    tr: 'C · Plan uyumu',
    en: 'C · Plan fit',
    introTr: 'Şimdi mevcut plan tablosunu görüyorsunuz.',
    introEn: 'You now see the current plan table.',
  },
  addons: {
    tr: 'D · Eklentiler ve krediler',
    en: 'D · Add-ons and credits',
    introTr: 'Hangi eklenti ayrı bir bütçe kalemi olmayı hak ediyor?',
    introEn: 'Which add-on earns its own budget line?',
  },
  billing: {
    tr: 'E · Faturalama',
    en: 'E · Billing',
    introTr: 'Satın alma sürecinizin pratik kısıtları.',
    introEn: 'The practical constraints of your purchasing process.',
  },
  transition: {
    tr: 'F · Beta sonrası geçiş',
    en: 'F · Life after the beta',
    introTr: 'Beta 2026-10-29 tarihinde biter. Ücretli sürüme geçiş koşullarını birlikte kuruyoruz.',
    introEn: 'The beta ends on 2026-10-29. We are setting the terms of the paid transition together.',
  },
  open: { tr: 'G · Serbest', en: 'G · Open', introTr: '', introEn: '' },
};

const SEGMENT_OPTIONS = [
  { value: 'sme', tr: 'KOBİ / Ar-Ge merkezi', en: 'SME / R&D centre' },
  { value: 'university', tr: 'Üniversite / TTO', en: 'University / TTO' },
  { value: 'consultancy', tr: 'Danışmanlık', en: 'Consultancy' },
  { value: 'other', tr: 'Diğer (küme, belediye, araştırma merkezi)', en: 'Other (cluster, municipality, research centre)' },
] as const;

const PLAN_OPTIONS = [
  { value: 'free', tr: 'Keşif — €0', en: 'Discover — €0' },
  { value: 'starter', tr: 'Başlangıç — €59/ay', en: 'Starter — €59/mo' },
  { value: 'team', tr: 'Ekip — €249/ay', en: 'Team — €249/mo' },
  { value: 'business', tr: 'İşletme — €599/ay', en: 'Business — €599/mo' },
  { value: 'enterprise', tr: 'Kurumsal — sözleşmeli (≥€1.500/ay)', en: 'Enterprise — contract (≥€1,500/mo)' },
  { value: 'none', tr: 'Hiçbiri — bu fiyatlardan almam', en: 'None — I would not buy at these prices' },
] as const;

const ADDON_OPTIONS = [
  { value: 'addon_m6', tr: 'Evaluator Lens (M6) — €99/ay', en: 'Evaluator Lens (M6) — €99/mo' },
  { value: 'addon_m11', tr: 'Full Application (M11) — €149/ay', en: 'Full Application (M11) — €149/mo' },
  { value: 'addon_m7', tr: 'TTO Accelerator (M7) — €129/ay', en: 'TTO Accelerator (M7) — €129/mo' },
  { value: 'addon_m8_pro', tr: 'Consortium Matching Pro (M8) — €79/ay', en: 'Consortium Matching Pro (M8) — €79/mo' },
  { value: 'addon_workspace', tr: 'Ek çalışma alanı — €49/ay', en: 'Extra workspace — €49/mo' },
  { value: 'addon_credits_250', tr: '250 YZ kredisi — €49 tek seferlik', en: '250 AI credits — €49 one-off' },
  { value: 'none', tr: 'Hiçbiri', en: 'None' },
] as const;

/**
 * The questionnaire. `id` doubles as the response-CSV column, so renaming one is a
 * breaking change to `docs/BETA_DATA/pricing-survey-responses*.csv`.
 */
export const PRICING_SURVEY_QUESTIONS: readonly SurveyQuestion[] = [
  {
    id: 'segment',
    kind: 'single',
    section: 'profile',
    required: true,
    tr: 'Kurumunuzu hangisi tarif ediyor?',
    en: 'Which describes your organisation?',
    options: SEGMENT_OPTIONS,
  },
  {
    id: 'teamSize',
    kind: 'number',
    section: 'profile',
    required: true,
    tr: 'Fon/teklif işiyle ilgilenen kaç kişi var?',
    en: 'How many people work on funding and proposals?',
    helpTr: `${PRODUCT_NAME}'da koltuk açacağınız kişi sayısı.`,
    helpEn: `The number of people you would give a seat in ${PRODUCT_NAME}.`,
  },
  {
    id: 'proposalsPerYear',
    kind: 'number',
    section: 'profile',
    required: true,
    tr: 'Yılda kaç teklif gönderiyorsunuz?',
    en: 'How many proposals do you submit per year?',
  },
  {
    id: 'currentSpendEur',
    kind: 'money',
    section: 'profile',
    required: false,
    tr: 'Bugün bu işe aylık ne kadar dış harcama yapıyorsunuz? (danışman, veri tabanı, araçlar)',
    en: 'What do you spend externally on this work per month today? (consultants, databases, tools)',
    helpTr: 'Euro olarak yazın (ör. 800), aylık, KDV hariç. Bilmiyorsanız boş bırakın.',
    helpEn: 'Write it in euro (e.g. 800), monthly, excluding VAT. Leave empty if you do not know.',
  },
  {
    id: 'vwTooCheap',
    kind: 'money',
    section: 'value',
    required: true,
    tr: `Hangi aylık fiyatta ${PRODUCT_NAME}'yı **o kadar ucuz** bulursunuz ki kalitesinden şüphe edersiniz?`,
    en: `At what monthly price would ${PRODUCT_NAME} be **so cheap** that you would doubt its quality?`,
  },
  {
    id: 'vwCheap',
    kind: 'money',
    section: 'value',
    required: true,
    tr: 'Hangi aylık fiyatta **kelepir** dersiniz — parasının karşılığını fazlasıyla verir?',
    en: 'At what monthly price would you call it a **bargain** — great value for money?',
  },
  {
    id: 'vwExpensive',
    kind: 'money',
    section: 'value',
    required: true,
    tr: 'Hangi aylık fiyatta **pahalı** bulmaya başlarsınız ama yine de düşünürsünüz?',
    en: 'At what monthly price does it start to feel **expensive**, though you would still consider it?',
  },
  {
    id: 'vwTooExpensive',
    kind: 'money',
    section: 'value',
    required: true,
    tr: 'Hangi aylık fiyatta **çok pahalı** olur — hiç düşünmezsiniz?',
    en: 'At what monthly price is it **too expensive** — you would not consider it at all?',
  },
  ...GG_LADDER_CENTS.map(
    (cents): SurveyQuestion => ({
      id: `gg${cents / 100}`,
      kind: 'yesno',
      section: 'value',
      required: true,
      tr: `Ekip planı ayda €${cents / 100} olsaydı, önümüzdeki çeyrekte satın alır mıydınız?`,
      en: `If the Team plan were €${cents / 100} per month, would you buy it next quarter?`,
      helpTr: 'Her fiyatı bağımsız değerlendirin.',
      helpEn: 'Judge each price independently.',
    })
  ),
  {
    id: 'planChoice',
    kind: 'single',
    section: 'plan',
    required: true,
    tr: 'Bugün cüzdanınızı çıkarsanız hangi planı alırdınız?',
    en: 'If you opened your wallet today, which plan would you buy?',
    options: PLAN_OPTIONS,
  },
  {
    id: 'seatsNeeded',
    kind: 'number',
    section: 'plan',
    required: true,
    tr: 'Kaç koltuğa ihtiyacınız var?',
    en: 'How many seats do you need?',
  },
  {
    id: 'workspacesNeeded',
    kind: 'number',
    section: 'plan',
    required: true,
    tr: 'Kaç çalışma alanına ihtiyacınız var?',
    en: 'How many workspaces do you need?',
    helpTr: 'Danışmanlıklar için genelde müşteri başına bir tane.',
    helpEn: 'For consultancies this is usually one per client.',
  },
  {
    id: 'addons',
    kind: 'multi',
    section: 'addons',
    required: true,
    tr: 'Hangi eklentiler için ayrıca ödeme yapardınız?',
    en: 'Which add-ons would you pay extra for?',
    options: ADDON_OPTIONS,
  },
  {
    id: 'creditsEnough',
    kind: 'single',
    section: 'addons',
    required: true,
    tr: 'Ekip planındaki aylık 500 YZ kredisi size yeter mi?',
    en: 'Are the 500 monthly AI credits on the Team plan enough for you?',
    options: [
      { value: 'yes', tr: 'Yeter', en: 'Enough' },
      { value: 'no', tr: 'Yetmez', en: 'Not enough' },
      { value: 'unsure', tr: 'Bilmiyorum', en: 'I cannot tell yet' },
    ],
  },
  {
    id: 'billingCycle',
    kind: 'single',
    section: 'billing',
    required: true,
    tr: 'Hangi faturalama döngüsü satın alma sürecinize uyar?',
    en: 'Which billing cycle fits your purchasing process?',
    options: [
      { value: 'monthly', tr: 'Aylık', en: 'Monthly' },
      { value: 'annual', tr: 'Yıllık (%20 indirimli)', en: 'Annual (20% off)' },
      { value: 'annual_only', tr: 'Yalnız yıllık — aylık satın alma iznimiz yok', en: 'Annual only — we cannot buy monthly' },
    ],
  },
  {
    id: 'currencyPref',
    kind: 'single',
    section: 'billing',
    required: true,
    tr: 'Hangi para biriminde faturalanmak istersiniz?',
    en: 'In which currency would you like to be invoiced?',
    options: [
      { value: 'EUR', tr: 'Euro', en: 'Euro' },
      { value: 'TRY', tr: 'Türk lirası', en: 'Turkish lira' },
      { value: 'either', tr: 'Fark etmez', en: 'Either' },
    ],
  },
  {
    id: 'needsEInvoice',
    kind: 'yesno',
    section: 'billing',
    required: true,
    tr: 'Türkiye e-fatura/e-arşiv zorunluluğunuz var mı?',
    en: 'Do you need a Turkish e-invoice / e-archive document?',
  },
  {
    id: 'successFee',
    kind: 'single',
    section: 'billing',
    required: true,
    tr: 'Hibe kazanıldığında ödenen bir başarı primi (kademeli, tavanlı) sizin için kabul edilebilir mi?',
    en: 'Would a success fee on a won grant (tiered, capped) be acceptable to you?',
    helpTr:
      'Not: başarı primi AB hibesinden ödenemez, uygun maliyet değildir; kurumunuzun kendi bütçesinden ödenir.',
    helpEn:
      'Note: a success fee cannot be paid from the EU grant — it is not an eligible cost; it comes from your own budget.',
    options: [
      { value: 'accept', tr: 'Evet, sabit ücreti düşürüyorsa tercih ederim', en: 'Yes, I prefer it if it lowers the fixed fee' },
      { value: 'conditional', tr: 'Belki — tavan ve oran net olursa', en: 'Maybe — if the cap and the rate are explicit' },
      { value: 'reject', tr: 'Hayır, yalnız sabit ücret', en: 'No, fixed fee only' },
    ],
  },
  {
    id: 'convertDiscountPct',
    kind: 'number',
    section: 'transition',
    required: true,
    tr: 'Beta ortağı olarak devam etmeniz için liste fiyatından en az yüzde kaç indirim gerekir?',
    en: 'As a beta partner, what is the smallest discount off list price that would make you continue?',
    helpTr: '0–100 arası tam sayı. 0 = indirimsiz de devam ederim.',
    helpEn: 'A whole number from 0 to 100. 0 = I would continue at list price.',
  },
  {
    id: 'payLikelihood',
    kind: 'scale',
    section: 'transition',
    required: true,
    tr: 'Beta bittiğinde ücretli plana geçme olasılığınız? (0 = hiç, 10 = kesin)',
    en: 'How likely are you to move to a paid plan when the beta ends? (0 = not at all, 10 = certain)',
  },
  {
    id: 'comment',
    kind: 'text',
    section: 'open',
    required: false,
    tr: 'Fiyatlandırma hakkında bize söylemek istediğiniz başka bir şey?',
    en: 'Anything else you want to tell us about pricing?',
  },
];

/** Response-CSV columns: the identity block the operator fills, then one per question. */
export const RESPONSE_META_COLUMNS = ['respondentId', 'slug', 'country', 'orgType', 'locale', 'submittedAt'] as const;

export function responseCsvHeader(): string {
  return [...RESPONSE_META_COLUMNS, ...PRICING_SURVEY_QUESTIONS.map((q) => q.id)].join(',');
}

function label(q: SurveyQuestion, locale: SurveyLocale): string {
  return locale === 'tr' ? q.tr : q.en;
}

function help(q: SurveyQuestion, locale: SurveyLocale): string | undefined {
  return locale === 'tr' ? q.helpTr : q.helpEn;
}

const KIND_HINT: Record<QuestionKind, { tr: string; en: string }> = {
  scale: { tr: '0–10 arası bir sayı', en: 'a number from 0 to 10' },
  number: { tr: 'tam sayı', en: 'a whole number' },
  money: { tr: 'euro / ay, KDV hariç — kuruş değil, tam euro yazın', en: 'euro per month, excluding VAT — write euro, not cents' },
  single: { tr: 'tek seçim', en: 'pick one' },
  multi: { tr: 'birden çok seçim', en: 'pick any number' },
  yesno: { tr: 'evet / hayır', en: 'yes / no' },
  text: { tr: 'serbest metin', en: 'free text' },
};

/** The questionnaire as Markdown — the workshop handout and the review artefact. */
export function renderSurveyMarkdown(locale: SurveyLocale): string {
  const tr = locale === 'tr';
  const out: string[] = [];
  out.push(
    tr
      ? `# ${PRODUCT_NAME} Beta — Fiyat Doğrulama Anketi`
      : `# ${PRODUCT_NAME} Beta — Pricing Validation Survey`
  );
  out.push('');
  out.push(
    tr
      ? '> 7. hafta atölyesi (2026-10-22) · doldurma süresi ~8 dakika · yanıtlar yalnız fiyatlandırma ' +
          'kararı için kullanılır ve toplu (anonim) raporlanır.'
      : '> Week 7 workshop (2026-10-22) · about 8 minutes · answers are used only for the pricing ' +
          'decision and are reported in aggregate (anonymised).'
  );
  out.push('');

  let current: SectionId | null = null;
  let n = 0;
  for (const q of PRICING_SURVEY_QUESTIONS) {
    if (q.section !== current) {
      current = q.section;
      const s = SECTIONS[current];
      out.push(`## ${tr ? s.tr : s.en}`);
      const intro = tr ? s.introTr : s.introEn;
      if (intro) {
        out.push('');
        out.push(intro);
      }
      out.push('');
    }
    n += 1;
    const hint = tr ? KIND_HINT[q.kind].tr : KIND_HINT[q.kind].en;
    const req = q.required ? '' : tr ? ' *(isteğe bağlı)*' : ' *(optional)*';
    out.push(`**${n}.** ${label(q, locale)}${req}  `);
    out.push(`\`${q.id}\` · _${hint}_`);
    const h = help(q, locale);
    if (h) out.push(`> ${h}`);
    if (q.options) {
      out.push('');
      for (const opt of q.options) out.push(`- [ ] ${tr ? opt.tr : opt.en}`);
    }
    out.push('');
  }
  return out.join('\n');
}

/** Google Forms renders no Markdown, so `**bold**` would show up as literal asterisks. */
function plain(value: string): string {
  return value.replace(/\*\*/g, '');
}

function gsString(value: string): string {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')}'`;
}

/**
 * Google Apps Script that builds the survey as a Google Form.
 *
 * Why a script and not a hand-built form: the form has to exist twice (tr, en) and
 * has to stay identical to the CSV the analysis reads. Regenerating it from the same
 * definition is the only way that survives an edit. Run it from
 * script.google.com → new project → paste → Run.
 */
export function renderGoogleFormsScript(locale: SurveyLocale): string {
  const tr = locale === 'tr';
  const lines: string[] = [];
  lines.push('/**');
  lines.push(' * Generated by scripts/beta-pricing-survey.ts — do not edit by hand.');
  lines.push(
    ` * ${PRODUCT_NAME} E11.4 pricing survey (${locale}). Paste into script.google.com and Run createForm().`
  );
  lines.push(' * The short answer of every question is prefixed with its CSV column id in [brackets]');
  lines.push(' * so the exported response sheet maps 1:1 onto docs/BETA_DATA/pricing-survey-responses.csv.');
  lines.push(' */');
  lines.push('function createForm() {');
  lines.push(
    `  var form = FormApp.create(${gsString(
      tr ? `${PRODUCT_NAME} Beta — Fiyat Doğrulama Anketi` : `${PRODUCT_NAME} Beta — Pricing Validation Survey`
    )});`
  );
  lines.push(
    `  form.setDescription(${gsString(
      tr
        ? '7. hafta atölyesi (2026-10-22). ~8 dakika. Yanıtlar toplu ve anonim raporlanır.'
        : 'Week 7 workshop (2026-10-22). About 8 minutes. Answers are reported in aggregate and anonymised.'
    )});`
  );
  lines.push('  form.setCollectEmail(true);');
  lines.push('  form.setProgressBar(true);');

  let current: SectionId | null = null;
  for (const q of PRICING_SURVEY_QUESTIONS) {
    if (q.section !== current) {
      current = q.section;
      const s = SECTIONS[current];
      lines.push('');
      lines.push(`  form.addSectionHeaderItem().setTitle(${gsString(tr ? s.tr : s.en)})`);
      lines.push(`    .setHelpText(${gsString(tr ? s.introTr : s.introEn)});`);
    }
    const title = gsString(plain(`[${q.id}] ${label(q, locale)}`));
    const helpText = gsString(
      plain([help(q, locale), tr ? KIND_HINT[q.kind].tr : KIND_HINT[q.kind].en].filter(Boolean).join(' — '))
    );
    if (q.kind === 'single' || q.kind === 'yesno') {
      const opts = q.options
        ? q.options.map((o) => gsString(`${o.value} · ${tr ? o.tr : o.en}`))
        : [gsString(tr ? 'yes · Evet' : 'yes · Yes'), gsString(tr ? 'no · Hayır' : 'no · No')];
      lines.push(`  form.addMultipleChoiceItem().setTitle(${title}).setHelpText(${helpText})`);
      lines.push(`    .setChoiceValues([${opts.join(', ')}]).setRequired(${q.required});`);
    } else if (q.kind === 'multi') {
      const opts = (q.options ?? []).map((o) => gsString(`${o.value} · ${tr ? o.tr : o.en}`));
      lines.push(`  form.addCheckboxItem().setTitle(${title}).setHelpText(${helpText})`);
      lines.push(`    .setChoiceValues([${opts.join(', ')}]).setRequired(${q.required});`);
    } else if (q.kind === 'scale') {
      lines.push(`  form.addScaleItem().setTitle(${title}).setHelpText(${helpText})`);
      lines.push('    .setBounds(0, 10).setRequired(true);');
    } else if (q.kind === 'text') {
      lines.push(`  form.addParagraphTextItem().setTitle(${title}).setHelpText(${helpText}).setRequired(${q.required});`);
    } else {
      // number / money — short answer with a numeric validation
      lines.push(`  form.addTextItem().setTitle(${title}).setHelpText(${helpText}).setRequired(${q.required})`);
      lines.push('    .setValidation(FormApp.createTextValidation().requireNumber().build());');
    }
  }

  lines.push('');
  lines.push('  Logger.log(form.getPublishedUrl());');
  lines.push('  Logger.log(form.getEditUrl());');
  lines.push('}');
  lines.push('');
  return lines.join('\n');
}
