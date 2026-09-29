import { PRODUCT_NAME } from '@/lib/brand';
import { escapeHtml } from '@/lib/feedback/digest';
import type { MailMessage } from './mailer';

/**
 * The mail a tenant invitation sends (POST /api/invitations,
 * TASK-MUMLF57HOYFSB). Turkish first, English below, because the invitee has
 * no account yet and so no locale on record.
 *
 * `tenantName` is chosen by the tenant, so it is escaped before it reaches the
 * HTML; the link and the date are built by the server.
 */
export function renderInvitationEmail(params: {
  to: string;
  tenantName: string | null;
  inviteLink: string;
  expires: Date;
}): MailMessage {
  // Newlines out as well: `org` also goes into the Subject header.
  const org = params.tenantName?.replace(/[\r\n]+/g, ' ').trim() || PRODUCT_NAME;
  const until = params.expires.toISOString().slice(0, 10);
  const link = escapeHtml(params.inviteLink);
  const orgHtml = escapeHtml(org);

  const text = [
    `${org} sizi ${PRODUCT_NAME} çalışma alanına davet etti.`,
    `Daveti kabul etmek için: ${params.inviteLink}`,
    `Bağlantı ${until} tarihine kadar geçerlidir.`,
    '',
    `${org} has invited you to its ${PRODUCT_NAME} workspace.`,
    `Accept the invitation: ${params.inviteLink}`,
    `The link is valid until ${until}.`,
  ].join('\n');

  const html = `
<p><strong>${orgHtml}</strong> sizi ${PRODUCT_NAME} çalışma alanına davet etti.</p>
<p><a href="${link}">Daveti kabul et</a> — bağlantı ${until} tarihine kadar geçerlidir.</p>
<hr/>
<p><strong>${orgHtml}</strong> has invited you to its ${PRODUCT_NAME} workspace.</p>
<p><a href="${link}">Accept the invitation</a> — the link is valid until ${until}.</p>
`;

  return {
    to: params.to,
    subject: `${org} — ${PRODUCT_NAME} daveti / invitation`,
    html,
    text,
  };
}
