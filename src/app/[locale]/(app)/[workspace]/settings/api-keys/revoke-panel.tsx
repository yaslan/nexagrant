'use client';

import React, { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Trash2 } from 'lucide-react';
import { revokeApiKey } from './actions';
import type { ApiKeyRecord } from './client';

type PendingRevoke = { kind: 'one'; id: string; name: string } | { kind: 'all' } | null;

interface RevokeApiKeysPanelProps {
  apiKeys: ApiKeyRecord[];
  /** `manage_users` (owner / admin). The server refuses the rest; this only hides the buttons. */
  canManage: boolean;
}

/**
 * Shown under the M1 lock screen (FO-81). It only withdraws keys: no key is minted
 * here and no secret is shown. Each revoke goes through `revokeApiKey`, the same
 * action the open page uses, so the rule and the audit row live in one place.
 */
export function RevokeApiKeysPanel({ apiKeys: initialKeys, canManage }: RevokeApiKeysPanelProps) {
  const t = useTranslations('ApiKeysSettings.revoke');
  const locale = useLocale();
  const [keys, setKeys] = useState<ApiKeyRecord[]>(initialKeys);
  const [pending, setPending] = useState<PendingRevoke>(null);
  const [busy, setBusy] = useState(false);
  const [errorKey, setErrorKey] = useState<'forbidden' | 'failed' | null>(null);

  const handleConfirm = async () => {
    if (!pending) return;
    const ids = pending.kind === 'all' ? keys.map((k) => k.id) : [pending.id];

    setBusy(true);
    setErrorKey(null);
    const revoked = new Set<string>();
    let failure: 'forbidden' | 'failed' | null = null;
    // Sequential, so a refusal stops the run and the list shows exactly what went.
    for (const id of ids) {
      try {
        const res = await revokeApiKey(id);
        if ('error' in res) {
          failure = res.error;
          break;
        }
        if (!res.success) {
          failure = 'failed';
          break;
        }
        revoked.add(id);
      } catch {
        failure = 'failed';
        break;
      }
    }

    setKeys((prev) => prev.filter((k) => !revoked.has(k.id)));
    setErrorKey(failure);
    setPending(null);
    setBusy(false);
  };

  return (
    <section
      aria-labelledby="revoke-api-keys-title"
      className="max-w-3xl mx-auto bg-surface border border-border rounded-2xl p-5 shadow-sm space-y-4"
    >
      <div className="space-y-1">
        <h2 id="revoke-api-keys-title" className="font-bold text-sm text-ink">
          {t('title')}
        </h2>
        <p className="text-xs text-ink-2">{t('description')}</p>
      </div>

      {errorKey && (
        <p role="alert" className="text-red-600 text-xs font-semibold">
          {t(`error.${errorKey}`)}
        </p>
      )}

      <ul className="divide-y divide-border border border-border rounded-xl">
        {keys.map((k) => (
          <li key={k.id} className="flex items-center justify-between gap-3 p-3.5 text-xs">
            <div className="min-w-0">
              <span className="font-bold text-ink block truncate">{k.name}</span>
              <span className="text-[11px] text-muted font-mono">
                {k.prefix}... · {t('createdAt')} {new Date(k.createdAt).toLocaleDateString(locale)} ·{' '}
                {k.lastUsedAt
                  ? `${t('lastUsed')} ${new Date(k.lastUsedAt).toLocaleDateString(locale)}`
                  : t('neverUsed')}
              </span>
            </div>
            {canManage && (
              <button
                type="button"
                disabled={busy}
                onClick={() => setPending({ kind: 'one', id: k.id, name: k.name })}
                aria-label={t('revokeOneLabel', { name: k.name })}
                className="shrink-0 text-red-600 hover:text-red-700 hover:bg-red-50 p-1.5 rounded-lg transition disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4" aria-hidden="true" />
              </button>
            )}
          </li>
        ))}
      </ul>

      {!canManage && <p className="text-xs text-muted">{t('error.forbidden')}</p>}

      {canManage && keys.length > 1 && (
        <button
          type="button"
          disabled={busy}
          onClick={() => setPending({ kind: 'all' })}
          className="w-full text-red-600 hover:bg-red-50 font-bold py-2.5 rounded-xl border border-red-200 text-xs transition disabled:opacity-50"
        >
          {t('revokeAll')}
        </button>
      )}

      {pending && (
        <div
          role="alertdialog"
          aria-labelledby="revoke-confirm-title"
          aria-describedby="revoke-confirm-body"
          onKeyDown={(e) => {
            if (e.key === 'Escape' && !busy) setPending(null);
          }}
          className="bg-ground border border-border rounded-xl p-4 space-y-3 text-xs"
        >
          <h3 id="revoke-confirm-title" className="font-bold text-ink">
            {pending.kind === 'all'
              ? t('confirmAllTitle')
              : t('confirmOneTitle', { name: pending.name })}
          </h3>
          <p id="revoke-confirm-body" className="text-ink-2">
            {t('confirmBody')}
          </p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              autoFocus
              disabled={busy}
              onClick={() => setPending(null)}
              className="px-3 py-2 rounded-lg border border-border text-ink-2 font-semibold"
            >
              {t('cancel')}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={handleConfirm}
              className="px-3 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white font-bold disabled:opacity-50"
            >
              {busy ? t('revoking') : t('confirm')}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
