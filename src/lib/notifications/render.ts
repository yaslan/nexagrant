import type { NotificationType } from '@prisma/client';

/**
 * Title and description of a stored notification, in the viewer's locale.
 *
 * ADR-0011 §3.1: the store keeps no text, only `type` + `payload`; the text is
 * produced here with the `Notifications` messages (TR and EN).
 *
 * Security (se-fb, PR #51 review): `payload` is `Record<string, unknown>` and
 * `searchName` is user input stored unescaped. Every field is type-checked
 * before use and passed to `t()` as an ICU value, so the result is a plain
 * string that React renders as text. A field of the wrong type gives the
 * generic text, never the raw value. Callers must render the result as JSX
 * text only — no `dangerouslySetInnerHTML`, no `t.rich`/`t.markup`.
 */

export interface NotificationText {
  title: string;
  description: string;
  icon: 'match' | 'credit' | 'warning' | 'info';
}

/** `useTranslations('Notifications')` or `createTranslator({ namespace: 'Notifications' })`. */
export type NotificationTranslator = (key: string, values?: Record<string, string | number>) => string;

const ISO_DATE = /^(\d{4}-\d{2}-\d{2})(T|$)/;

function generic(t: NotificationTranslator): NotificationText {
  return { title: t('genericTitle'), description: t('genericDesc'), icon: 'info' };
}

export function renderNotification(
  type: NotificationType | string,
  payload: unknown,
  t: NotificationTranslator
): NotificationText {
  const p = payload && typeof payload === 'object' && !Array.isArray(payload)
    ? (payload as Record<string, unknown>)
    : {};

  switch (type) {
    case 'SAVED_SEARCH_MATCH': {
      const { searchName, matchCount } = p;
      if (typeof searchName !== 'string' || typeof matchCount !== 'number' || !Number.isFinite(matchCount)) {
        return generic(t);
      }
      return {
        title: t('savedSearchTitle'),
        description: t('savedSearchDesc', { matchCount, searchName }),
        icon: 'match',
      };
    }

    case 'CREDIT_GRANTED': {
      const { amount, source } = p;
      if (typeof amount !== 'number' || !Number.isFinite(amount)) return generic(t);
      const sourceLabel =
        source === 'monthly' ? t('sourceMonthly')
          : source === 'stripe' ? t('sourceStripe')
            : source === 'iyzico' ? t('sourceIyzico')
              : t('sourceOther');
      return {
        title: t('creditGrantedTitle'),
        description: t('creditGrantedDesc', { amount, source: sourceLabel }),
        icon: 'credit',
      };
    }

    case 'CREDIT_EXHAUSTED': {
      const { module } = p;
      if (typeof module !== 'string') return generic(t);
      return {
        title: t('creditExhaustedTitle'),
        description: t('creditExhaustedDesc', { module }),
        icon: 'warning',
      };
    }

    case 'EVIDENCE_EXPIRING': {
      const date = typeof p.validUntil === 'string' ? ISO_DATE.exec(p.validUntil)?.[1] : undefined;
      if (!date) return generic(t);
      return {
        title: t('evidenceExpiringTitle'),
        description: t('evidenceExpiringDesc', { validUntil: date }),
        icon: 'warning',
      };
    }

    default:
      return generic(t);
  }
}

/** Short relative time ("5m ago" / "5 dk önce"); older than a week, the date. */
export function formatNotificationTime(iso: string, locale: string, now: number = Date.now()): string {
  const date = new Date(iso);
  const minutes = Math.floor((now - date.getTime()) / 60000);
  const isTr = locale === 'tr';
  if (!Number.isFinite(minutes)) return '';
  if (minutes < 1) return isTr ? 'Şimdi' : 'Just now';
  if (minutes < 60) return isTr ? `${minutes} dk önce` : `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return isTr ? `${hours} sa önce` : `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return isTr ? `${days} g önce` : `${days}d ago`;
  return date.toLocaleDateString(isTr ? 'tr-TR' : 'en-US');
}
