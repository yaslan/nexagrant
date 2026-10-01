/**
 * Beta invitation mail (E11.1), rendered per recipient locale.
 *
 * The copy lives here rather than in `messages/*.json` on purpose: these strings are
 * never rendered by a React tree, so they cannot go through `next-intl`. Both locales
 * are kept in one table so a change to one is visibly a change to the other.
 */

import {
  BETA_APP_URL,
  BETA_CHECKIN_TZ,
  BETA_CHECKIN_WEEKS,
  BETA_FEEDBACK_EMAIL,
  BETA_SUPPORT_EMAIL,
} from './constants';
import { PRODUCT_NAME } from '../brand';

export type BetaLocale = 'tr' | 'en';

export interface InviteEmailParams {
  locale: BetaLocale;
  contactName: string;
  orgName: string;
  /** Absolute link that accepts the invitation and signs the partner in. */
  inviteUrl: string;
  /** First check-in, already formatted for the recipient (e.g. "8 Eylül 2026, 15:00"). */
  firstCheckinLabel: string;
  guideUrl: string;
  feedbackFormUrl: string;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

const COPY = {
  tr: {
    subject: `${PRODUCT_NAME} Beta — Sizi davet ediyoruz`,
    greeting: (name: string) => `Merhaba ${name},`,
    intro: (org: string) =>
      `${org} adına ${PRODUCT_NAME}'in 8 haftalık kapalı betasına tasarım ortağı olarak davet ediyoruz. ` +
      `${PRODUCT_NAME}, Avrupa fonları için çağrı takibi, konsept not üretimi ve teklif hattı yönetimini tek yerde toplayan çok kiracılı bir platform.`,
    whatIsBeta: 'Beta nedir?',
    whatIsBetaBody: (weeks: number) =>
      `${weeks} hafta boyunca tüm modüller hesabınızda "pilot" durumunda açık olur. Ücret alınmaz. ` +
      'Karşılığında haftada bir kısa geri bildirim ve haftalık 45 dakikalık ortak toplantıya katılım bekliyoruz.',
    whatToTest: 'Neleri test edeceksiniz?',
    testItems: [
      'K1 — Çağrı takibi: size uygun açık çağrıları bulma ve son tarih takibi.',
      'M5 — Teklif hattı: G0–G4 kapıları, ekip ataması, ilerleme takibi.',
      'M2 — Konsept not: şablondan taslak üretme ve düzenleme.',
      'M3 — Kanıt paketi: iddialarınızın arkasındaki kaynakları toplama.',
    ],
    weeklyFeedback: 'Haftalık geri bildirim nedir?',
    weeklyFeedbackBody:
      'Her hafta 3 soruluk kısa bir form: neyi denediniz, ne bozuldu, ne eksikti. Doldurması 5 dakika sürer. ' +
      'Ayrıca haftalık toplantıda gördüklerinizi birlikte konuşuruz.',
    firstCheckin: (label: string, tz: string) => `İlk toplantı: ${label} (${tz} saatiyle). Takvim daveti ekte.`,
    ctaAccept: 'Beta hesabımı aç',
    linksTitle: 'Bağlantılar',
    linkGuide: 'Başlangıç kılavuzu',
    linkFeedback: 'Geri bildirim formu',
    support: (email: string) => `Takıldığınız her yerde ${email} adresine yazın; aynı gün dönüyoruz.`,
    signoff: `Teşekkürler,\n${PRODUCT_NAME} ekibi`,
    footer: (email: string) =>
      `Bu davet size özel gönderildi. Katılmak istemiyorsanız bu e-postayı yanıtlayın ya da ${email} adresine yazın.`,
  },
  en: {
    subject: `${PRODUCT_NAME} Beta — you are invited`,
    greeting: (name: string) => `Hello ${name},`,
    intro: (org: string) =>
      `We would like ${org} to join ${PRODUCT_NAME}'s 8-week closed beta as a design partner. ` +
      `${PRODUCT_NAME} is a multi-tenant platform that brings call monitoring, concept-note drafting and proposal pipeline management for European funding into one place.`,
    whatIsBeta: 'What is the beta?',
    whatIsBetaBody: (weeks: number) =>
      `For ${weeks} weeks every module is switched on in "pilot" state in your account, at no cost. ` +
      'In return we ask for one short feedback form per week and your attendance at a 45-minute weekly check-in.',
    whatToTest: 'What will you test?',
    testItems: [
      'K1 — Call monitoring: finding open calls that fit you, and tracking deadlines.',
      'M5 — Proposal pipeline: the G0–G4 gates, team assignment, progress tracking.',
      'M2 — Concept note: drafting from a template and editing it.',
      'M3 — Evidence pack: collecting the sources behind your claims.',
    ],
    weeklyFeedback: 'What is the weekly feedback?',
    weeklyFeedbackBody:
      'A three-question form each week: what you tried, what broke, what was missing. It takes five minutes. ' +
      'We also walk through what you saw during the weekly check-in.',
    firstCheckin: (label: string, tz: string) => `First check-in: ${label} (${tz} time). The calendar invite is attached.`,
    ctaAccept: 'Open my beta account',
    linksTitle: 'Links',
    linkGuide: 'Getting-started guide',
    linkFeedback: 'Feedback form',
    support: (email: string) => `Write to ${email} whenever you get stuck; we answer the same day.`,
    signoff: `Thank you,\nThe ${PRODUCT_NAME} team`,
    footer: (email: string) =>
      `This invitation was sent to you personally. If you would rather not take part, reply to this email or write to ${email}.`,
  },
} satisfies Record<BetaLocale, unknown>;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function renderBetaInviteEmail(params: InviteEmailParams): RenderedEmail {
  const c = COPY[params.locale];
  const name = params.contactName;
  const org = params.orgName;

  const text = [
    c.greeting(name),
    '',
    c.intro(org),
    '',
    `${c.whatIsBeta}`,
    c.whatIsBetaBody(BETA_CHECKIN_WEEKS),
    '',
    `${c.whatToTest}`,
    ...c.testItems.map((item) => `- ${item}`),
    '',
    `${c.weeklyFeedback}`,
    c.weeklyFeedbackBody,
    '',
    c.firstCheckin(params.firstCheckinLabel, BETA_CHECKIN_TZ),
    '',
    `${c.ctaAccept}: ${params.inviteUrl}`,
    `${c.linkGuide}: ${params.guideUrl}`,
    `${c.linkFeedback}: ${params.feedbackFormUrl}`,
    '',
    c.support(BETA_SUPPORT_EMAIL),
    '',
    c.signoff,
    '',
    '—',
    c.footer(BETA_FEEDBACK_EMAIL),
  ].join('\n');

  const html = `<!doctype html>
<html lang="${params.locale}">
<body style="margin:0;padding:24px;background:#f6f7f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1a1a1a;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px;">
    <tr><td>
      <p style="margin:0 0 16px;font-size:16px;">${escapeHtml(c.greeting(name))}</p>
      <p style="margin:0 0 24px;font-size:15px;line-height:1.6;">${escapeHtml(c.intro(org))}</p>

      <h2 style="margin:0 0 8px;font-size:16px;">${escapeHtml(c.whatIsBeta)}</h2>
      <p style="margin:0 0 24px;font-size:15px;line-height:1.6;">${escapeHtml(c.whatIsBetaBody(BETA_CHECKIN_WEEKS))}</p>

      <h2 style="margin:0 0 8px;font-size:16px;">${escapeHtml(c.whatToTest)}</h2>
      <ul style="margin:0 0 24px;padding-left:20px;font-size:15px;line-height:1.6;">
        ${c.testItems.map((item) => `<li>${escapeHtml(item)}</li>`).join('\n        ')}
      </ul>

      <h2 style="margin:0 0 8px;font-size:16px;">${escapeHtml(c.weeklyFeedback)}</h2>
      <p style="margin:0 0 24px;font-size:15px;line-height:1.6;">${escapeHtml(c.weeklyFeedbackBody)}</p>

      <p style="margin:0 0 24px;font-size:15px;line-height:1.6;"><strong>${escapeHtml(c.firstCheckin(params.firstCheckinLabel, BETA_CHECKIN_TZ))}</strong></p>

      <p style="margin:0 0 28px;">
        <a href="${escapeHtml(params.inviteUrl)}" style="display:inline-block;background:#1f6feb;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:8px;font-size:15px;font-weight:600;">${escapeHtml(c.ctaAccept)}</a>
      </p>

      <h2 style="margin:0 0 8px;font-size:16px;">${escapeHtml(c.linksTitle)}</h2>
      <ul style="margin:0 0 24px;padding-left:20px;font-size:15px;line-height:1.6;">
        <li><a href="${escapeHtml(params.guideUrl)}">${escapeHtml(c.linkGuide)}</a></li>
        <li><a href="${escapeHtml(params.feedbackFormUrl)}">${escapeHtml(c.linkFeedback)}</a></li>
      </ul>

      <p style="margin:0 0 24px;font-size:15px;line-height:1.6;">${escapeHtml(c.support(BETA_SUPPORT_EMAIL))}</p>
      <p style="margin:0 0 8px;font-size:15px;line-height:1.6;">${escapeHtml(c.signoff).replace(/\n/g, '<br />')}</p>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;" />
      <p style="margin:0;font-size:12px;color:#6b7280;line-height:1.6;">${escapeHtml(c.footer(BETA_FEEDBACK_EMAIL))}</p>
      <p style="margin:8px 0 0;font-size:12px;color:#6b7280;">${escapeHtml(BETA_APP_URL)}</p>
    </td></tr>
  </table>
</body>
</html>`;

  return { subject: c.subject, html, text };
}
