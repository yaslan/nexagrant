'use client';

import React, { useRef, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { removeTenantPicAction } from '../actions';

/**
 * Takes a disputed PIC off a tenant (FO-383, K-576942). The action is behind
 * `requirePlatformAdmin()` and removes only the value shown here, so a PIC the
 * tenant saved after this page loaded is not removed by accident.
 */
export function TenantPicPanel({
  tenantId,
  pic,
  cordisName,
}: {
  tenantId: string;
  pic: string | null;
  cordisName: string | null;
}) {
  const t = useTranslations('adminTenants');
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [note, setNote] = useState('');
  const [notice, setNotice] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const removeRef = useRef<HTMLButtonElement>(null);
  const noticeRef = useRef<HTMLParagraphElement>(null);

  const cancel = () => {
    setConfirming(false);
    setNote('');
    // After the panel is gone, focus goes back to the button that opened it.
    requestAnimationFrame(() => removeRef.current?.focus());
  };

  const submit = (e: React.FormEvent, stored: string) => {
    e.preventDefault();
    setNotice(null);
    startTransition(async () => {
      const res = await removeTenantPicAction({ tenantId, pic: stored, note });
      if (!res.ok) {
        setNotice({ kind: 'err', text: t(`errors.${res.code}`) });
        // PIC_CHANGED: the value on screen is out of date, so close the question and show the new one.
        if (res.code === 'PIC_CHANGED') {
          setConfirming(false);
          setNote('');
          router.refresh();
        }
        return;
      }
      setNotice({ kind: 'ok', text: t('pic.removed') });
      setConfirming(false);
      setNote('');
      router.refresh();
      // The button that opened the panel is gone with the PIC.
      requestAnimationFrame(() => noticeRef.current?.focus());
    });
  };

  return (
    <div className="space-y-3" data-testid="tenant-pic-panel">
      {pic ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs text-ink-2">{t('pic.current')}</p>
            <p className="font-mono text-sm font-semibold text-ink" data-testid="tenant-pic-value">
              {pic}
            </p>
            <p className="text-xs text-muted break-words">
              {cordisName ? t('pic.cordisName', { name: cordisName }) : t('pic.noCordis')}
            </p>
          </div>
          {!confirming && (
            <button
              ref={removeRef}
              type="button"
              data-testid="tenant-pic-remove"
              onClick={() => {
                setNotice(null);
                setConfirming(true);
              }}
              className="min-h-11 text-sm font-semibold text-red-700 border border-red-200 px-3.5 py-2 rounded-lg hover:bg-red-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              {t('pic.remove')}
            </button>
          )}
        </div>
      ) : (
        <p className="text-sm text-ink-2" data-testid="tenant-pic-none">
          {t('pic.none')}
        </p>
      )}

      {pic && confirming && (
        <form
          role="alertdialog"
          aria-labelledby="tenant-pic-confirm-title"
          aria-describedby="tenant-pic-confirm-body"
          data-testid="tenant-pic-remove-dialog"
          onSubmit={(e) => submit(e, pic)}
          onKeyDown={(e) => {
            if (e.key === 'Escape' && !pending) cancel();
          }}
          className="bg-ground border border-border rounded-xl p-4 space-y-3"
        >
          <h3 id="tenant-pic-confirm-title" className="text-sm font-bold text-ink">
            {t('pic.confirmTitle', { pic })}
          </h3>
          <p id="tenant-pic-confirm-body" className="text-xs text-ink-2">
            {t('pic.confirmBody')}
          </p>
          <label className="block text-xs text-ink-2 space-y-1">
            <span className="block">{t('pic.note')}</span>
            <input
              autoFocus
              required
              maxLength={500}
              data-testid="tenant-pic-remove-note"
              className="w-full border border-border rounded-lg px-2.5 py-2 text-sm bg-surface text-ink"
              placeholder={t('pic.notePlaceholder')}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              disabled={pending}
              data-testid="tenant-pic-remove-cancel"
              onClick={cancel}
              className="min-h-11 px-3.5 py-2 rounded-lg border border-border text-sm font-semibold text-ink-2 disabled:opacity-50"
            >
              {t('pic.cancel')}
            </button>
            <button
              type="submit"
              disabled={pending || !note.trim()}
              data-testid="tenant-pic-remove-confirm"
              className="min-h-11 px-3.5 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-sm font-bold text-white disabled:opacity-50"
            >
              {pending ? t('pic.removing') : t('pic.confirm')}
            </button>
          </div>
        </form>
      )}

      {notice && (
        <p
          ref={noticeRef}
          tabIndex={-1}
          role="status"
          data-testid="tenant-pic-notice"
          className={`text-sm focus:outline-none ${notice.kind === 'ok' ? 'text-emerald-700' : 'text-rose-700'}`}
        >
          {notice.text}
        </p>
      )}
    </div>
  );
}
