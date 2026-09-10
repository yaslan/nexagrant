/**
 * E11.4 — the mail that carries the pricing survey to a beta partner.
 *
 * Same shape and constraints as `invite-email.ts`: not rendered by React, so the
 * copy sits next to the code with both locales in one table.
 */

import { PRODUCT_NAME } from '../brand';
import { BETA_FEEDBACK_EMAIL } from './constants';
import type { SurveyLocale } from './pricing-survey';

export interface SurveyEmailParams {
  locale: SurveyLocale;
  contactName: string;
  orgName: string;
  /** Published Google Form URL for the recipient's locale. */
  formUrl: string;
  /** Workshop date already formatted for the recipient. */
  workshopLabel: string;
  /** Answer-by date already formatted for the recipient. */
  dueLabel: string;
}

export interface RenderedSurveyEmail {
  subject: string;
  html: string;
  text: string;
}

const COPY = {
  tr: {
    subject: `${PRODUCT_NAME} Beta — fiyat doğrulama anketi (8 dakika)`,
    greeting: (name: string) => `Merhaba ${name},`,
    intro: (org: string) =>
      `Beta’nın 7. haftasındayız ve sıra en açık sorumuzda: ${PRODUCT_NAME} ${org} için ne kadar eder? ` +
      'Fiyatı sizinle birlikte belirlemek istiyoruz, size sunmadan önce.',
    whyTitle: 'Neden soruyoruz?',
    whyBody:
      'Liste fiyatı bugün bir varsayım. Anketin ilk bölümünde size bilerek hiçbir rakam göstermiyoruz — ' +
      'önce sizin rakamlarınızı alıyoruz, sonra mevcut planları gösterip uyumunu soruyoruz.',
    howTitle: 'Nasıl kullanacağız?',
    howBody:
      'Yanıtlar toplu ve anonim raporlanır; tek tek kim ne yazdı paylaşılmaz. Sonuçları 8. hafta ' +
      'kapanışında sizinle paylaşacağız — beta ortağı geçiş koşullarıyla birlikte.',
    workshop: (label: string) => `Atölye: ${label}. Anketi atölyeden önce doldurmanız sonuçları birlikte konuşmamızı sağlar.`,
    due: (label: string) => `Son yanıt tarihi: ${label}.`,
    cta: 'Anketi doldur (8 dk)',
    signoff: `Teşekkürler,\n${PRODUCT_NAME} ekibi`,
    footer: (email: string) => `Soru ya da itirazınız olursa ${email} adresine yazın; anket dışı da konuşuruz.`,
  },
  en: {
    subject: `${PRODUCT_NAME} Beta — pricing validation survey (8 minutes)`,
    greeting: (name: string) => `Hello ${name},`,
    intro: (org: string) =>
      `We are in week 7 of the beta, and it is time for our most direct question: what is ${PRODUCT_NAME} worth ` +
      `to ${org}? We would rather set the price with you than present it to you.`,
    whyTitle: 'Why we are asking',
    whyBody:
      'Today the list price is an assumption. The first part of the survey deliberately shows you no ' +
      'number — we take yours first, and only then show the current plans and ask how well they fit.',
    howTitle: 'What we do with it',
    howBody:
      'Answers are reported in aggregate and anonymised; nobody sees who said what. We will share the ' +
      'results at the week-8 close, together with the transition terms for beta partners.',
    workshop: (label: string) => `Workshop: ${label}. Answering before it lets us discuss the results together.`,
    due: (label: string) => `Please answer by ${label}.`,
    cta: 'Take the survey (8 min)',
    signoff: `Thank you,\nThe ${PRODUCT_NAME} team`,
    footer: (email: string) => `Write to ${email} with any question or objection — we are happy to talk outside the form.`,
  },
} satisfies Record<SurveyLocale, unknown>;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function renderPricingSurveyEmail(params: SurveyEmailParams): RenderedSurveyEmail {
  const c = COPY[params.locale];
  const text = [
    c.greeting(params.contactName),
    '',
    c.intro(params.orgName),
    '',
    c.whyTitle,
    c.whyBody,
    '',
    c.howTitle,
    c.howBody,
    '',
    c.workshop(params.workshopLabel),
    c.due(params.dueLabel),
    '',
    `${c.cta}: ${params.formUrl}`,
    '',
    c.signoff,
    '',
    c.footer(BETA_FEEDBACK_EMAIL),
  ].join('\n');

  const html = [
    `<div lang="${params.locale}" style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;font-size:15px;line-height:1.6;color:#18181b;max-width:600px">`,
    `<p>${escapeHtml(c.greeting(params.contactName))}</p>`,
    `<p>${escapeHtml(c.intro(params.orgName))}</p>`,
    `<h2 style="font-size:16px;margin:24px 0 4px">${escapeHtml(c.whyTitle)}</h2>`,
    `<p style="margin-top:0">${escapeHtml(c.whyBody)}</p>`,
    `<h2 style="font-size:16px;margin:24px 0 4px">${escapeHtml(c.howTitle)}</h2>`,
    `<p style="margin-top:0">${escapeHtml(c.howBody)}</p>`,
    `<p>${escapeHtml(c.workshop(params.workshopLabel))}<br>${escapeHtml(c.due(params.dueLabel))}</p>`,
    `<p><a href="${escapeHtml(params.formUrl)}" style="display:inline-block;background:#1d4ed8;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600">${escapeHtml(c.cta)}</a></p>`,
    `<p style="white-space:pre-line">${escapeHtml(c.signoff)}</p>`,
    `<hr style="border:none;border-top:1px solid #e4e4e7;margin:24px 0">`,
    `<p style="font-size:13px;color:#52525b">${escapeHtml(c.footer(BETA_FEEDBACK_EMAIL))}</p>`,
    '</div>',
  ].join('\n');

  return { subject: c.subject, html, text };
}
