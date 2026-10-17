import { PRODUCT_NAME } from '@/lib/brand';
import type { MailMessage } from '@/lib/email/mailer';
import { escapeHtml } from '@/lib/feedback/digest';
import enMessages from '../../../../messages/en.json';
import trMessages from '../../../../messages/tr.json';

/**
 * The verification mail of the expert pre-registration (FO-19,
 * TASK-MVBIXPP33UK1B). One button, one link, in the language the form was shown
 * in. Text comes from the `ExpertPreregEmail` namespace of messages/*.json.
 *
 * The name is typed by the expert, so it is escaped before the HTML and stripped
 * of line breaks before the Subject. The link is built by the server.
 */

const CATALOGS = { tr: trMessages.ExpertPreregEmail, en: enMessages.ExpertPreregEmail };

function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => (key in values ? values[key]! : match));
}

export function renderExpertVerificationEmail(params: {
  to: string;
  fullName: string;
  link: string;
  locale: string;
  expires: Date;
}): MailMessage {
  const catalog = params.locale === 'en' ? CATALOGS.en : CATALOGS.tr;
  const name = params.fullName.replace(/[\r\n]+/g, ' ').trim();
  const until = params.expires.toISOString().slice(0, 10);
  const values = { product: PRODUCT_NAME, name, date: until, link: params.link };

  const subject = fill(catalog.subject, values);
  const greeting = fill(catalog.greeting, values);
  const intro = fill(catalog.intro, values);
  const cta = fill(catalog.cta, values);
  const expires = fill(catalog.expires, values);
  const ignore = fill(catalog.ignore, values);

  const text = [greeting, '', intro, '', `${cta}: ${params.link}`, '', expires, ignore].join('\n');
  const html = `
<p>${escapeHtml(greeting)}</p>
<p>${escapeHtml(intro)}</p>
<p><a href="${escapeHtml(params.link)}">${escapeHtml(cta)}</a></p>
<p>${escapeHtml(expires)}</p>
<p>${escapeHtml(ignore)}</p>
`;

  return { to: params.to, subject, html, text };
}
