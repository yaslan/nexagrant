'use client';

import type { NotificationType } from '@prisma/client';

/**
 * Render notification title and description from type and payload.
 * `searchName` and other payload values are rendered as plain text only,
 * never as HTML, to prevent XSS.
 *
 * ADR-0011 §3.1: Metin depoya yazılmaz. Başlık/açıklama `next-intl` ile
 * `type` + `payload`'dan üretilir.
 */

export interface NotificationText {
  title: string;
  description: string;
  icon: 'match' | 'credit' | 'warning' | 'info';
}

export function renderNotification(
  type: NotificationType,
  payload: Record<string, unknown>,
  t: (key: string) => string
): NotificationText | null {
  switch (type) {
    case 'SAVED_SEARCH_MATCH': {
      const searchId = payload.searchId;
      const searchName = payload.searchName;
      const matchCount = payload.matchCount;

      if (typeof searchName !== 'string' || typeof matchCount !== 'number') {
        return null;
      }

      const title = t('Notifications.savedSearchTitle');

      // Format plural: use matchCount directly in the description with plain text
      const countText = matchCount === 1 ? '1 call' : `${matchCount} calls`;
      const description = `${countText} matched "${searchName}"`;

      return {
        title,
        description,
        icon: 'match',
      };
    }

    case 'CREDIT_GRANTED': {
      const amount = payload.amount;
      const source = payload.source;

      if (typeof amount !== 'number' || typeof source !== 'string') {
        return null;
      }

      const title = t('Notifications.creditGrantedTitle');
      const sourceLabel =
        source === 'monthly'
          ? t('Notifications.sourceMonthly')
          : source === 'stripe'
            ? t('Notifications.sourceStripe')
            : source === 'iyzico'
              ? t('Notifications.sourceIyzico')
              : source;

      const description = `${amount} AI credits from ${sourceLabel}`;

      return {
        title,
        description,
        icon: 'credit',
      };
    }

    case 'CREDIT_EXHAUSTED': {
      const module = payload.module;

      if (typeof module !== 'string') {
        return null;
      }

      const title = t('Notifications.creditExhaustedTitle');
      const description = `No AI credits left for ${module}`;

      return {
        title,
        description,
        icon: 'warning',
      };
    }

    case 'EVIDENCE_EXPIRING': {
      const evidenceId = payload.evidenceId;
      const validUntil = payload.validUntil;

      if (typeof evidenceId !== 'string' || typeof validUntil !== 'string') {
        return null;
      }

      const title = t('Notifications.evidenceExpiringTitle');
      const description = `Valid until ${validUntil}`;

      return {
        title,
        description,
        icon: 'warning',
      };
    }

    default: {
      const _exhaustive: never = type;
      return _exhaustive;
    }
  }
}
