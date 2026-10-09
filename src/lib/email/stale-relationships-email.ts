import { PRODUCT_NAME } from '@/lib/brand';
import { escapeHtml } from '@/lib/feedback/digest';
import type { MailMessage } from './mailer';
import trMessages from '../../../messages/tr.json';
import enMessages from '../../../messages/en.json';

/**
 * The daily "no contact for 60 days" digest (src/lib/relationships/stale-reminder.ts,
 * TASK-MULQL2NYKRGJX). One mail per focal point, one section per tenant.
 *
 * Text comes from the `staleRelationshipsEmail` namespace of messages/*.json,
 * in the recipient's own `User.locale`, so `pnpm i18n:check` holds both
 * languages to the same keys. Every value chosen by a tenant (its name, a
 * counterpart's name) is escaped before it reaches the HTML and stripped of
 * line breaks before it reaches the Subject.
 */

/** Rows listed per section; the rest are counted and reached through the link. */
export const STALE_DIGEST_MAX_ROWS = 25;

export interface StaleDigestSection {
  tenantName: string;
  link: string;
  rows: Array<{ name: string; lastContactAt: Date }>;
}

const CATALOGS = { tr: trMessages.staleRelationshipsEmail, en: enMessages.staleRelationshipsEmail };

function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in values ? String(values[k]) : m));
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function renderStaleRelationshipsEmail(params: {
  to: string;
  locale: string;
  now: Date;
  sections: StaleDigestSection[];
}): MailMessage {
  const C = CATALOGS[params.locale === 'en' ? 'en' : 'tr'];
  const total = params.sections.reduce((n, s) => n + s.rows.length, 0);
  const single = (v: string) => v.replace(/[\r\n]+/g, ' ').trim();

  const html: string[] = [`<h2>${escapeHtml(C.heading)}</h2>`, `<p>${escapeHtml(C.intro)}</p>`];
  const text: string[] = [C.heading, '', C.intro, ''];

  for (const s of params.sections) {
    const shown = s.rows.slice(0, STALE_DIGEST_MAX_ROWS);
    const rest = s.rows.length - shown.length;
    const org = single(s.tenantName) || PRODUCT_NAME;
    html.push(`<h3>${escapeHtml(org)}</h3>`, '<ul>');
    text.push(org);
    for (const r of shown) {
      const days = Math.floor((params.now.getTime() - r.lastContactAt.getTime()) / DAY_MS);
      const line = fill(C.lastContact, { date: r.lastContactAt.toISOString().slice(0, 10), days });
      html.push(`<li><strong>${escapeHtml(single(r.name))}</strong> — ${escapeHtml(line)}</li>`);
      text.push(`- ${single(r.name)} — ${line}`);
    }
    html.push('</ul>');
    if (rest > 0) {
      const more = fill(C.more, { count: rest });
      html.push(`<p>${escapeHtml(more)}</p>`);
      text.push(more);
    }
    html.push(`<p><a href="${escapeHtml(s.link)}">${escapeHtml(C.cta)}</a></p>`);
    text.push(`${C.cta}: ${s.link}`, '');
  }
  html.push(`<hr/><p>${escapeHtml(C.footer)}</p>`);
  text.push(C.footer);

  return {
    to: params.to,
    subject: fill(C.subject, { product: PRODUCT_NAME, count: total }),
    html: html.join('\n'),
    text: text.join('\n'),
  };
}
