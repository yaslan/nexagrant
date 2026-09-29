'use client';

import { useId, useRef, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import CoBrandBadge from '@/components/CoBrandBadge';
import { saveCoBrand, type CoBrandActionError } from './cobrand-actions';

/** FB KAMU B4 (TASK-MULRRNIHVZM1Z): the agency sets the co-brand its organisations see. */

const focusRing =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';
const primaryButton = `inline-flex min-h-11 items-center justify-center rounded-lg bg-accent-strong px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60 ${focusRing}`;
const input = `min-h-11 w-full rounded-lg border border-border bg-surface px-3 text-sm text-ink ${focusRing}`;

export default function CoBrandPanel({
  canManage,
  initialName,
  fallbackName,
  initialLogoSrc,
  nameMax,
}: {
  canManage: boolean;
  /** COBRAND_NAME_MAX, passed down: src/lib/agency/cobrand.ts is server-only (node:zlib). */
  nameMax: number;
  initialName: string;
  /** The account name, printed when no short name is set. */
  fallbackName: string;
  initialLogoSrc: string | null;
}) {
  const t = useTranslations('agency.cobrand');
  const [name, setName] = useState(initialName);
  const [logoSrc, setLogoSrc] = useState(initialLogoSrc);
  const [removeLogo, setRemoveLogo] = useState(false);
  const [error, setError] = useState<CoBrandActionError | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const ids = { name: useId(), nameHint: useId(), logo: useId(), logoHint: useId(), remove: useId(), err: useId() };

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    const data = new FormData(e.currentTarget);
    if (removeLogo) data.set('removeLogo', '1');
    startTransition(async () => {
      const res = await saveCoBrand(data);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setName(res.name);
      setLogoSrc(res.hasLogo ? `/api/agency/cobrand-logo?v=${encodeURIComponent(res.updatedAt)}` : null);
      setRemoveLogo(false);
      formRef.current?.reset();
      setSaved(true);
    });
  }

  const preview = { name: name.trim() || fallbackName, logoSrc: removeLogo ? null : logoSrc };

  return (
    <section aria-labelledby="agency-cobrand-title" className="space-y-4" data-testid="cobrand-panel">
      <div>
        <h2 id="agency-cobrand-title" className="font-heading text-xl font-semibold text-ink">
          {t('title')}
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-ink-2">{t('description')}</p>
      </div>

      <div className="rounded-xl border border-border bg-surface p-4">
        <p className="mb-2 text-xs font-semibold text-ink-2">{t('preview')}</p>
        <div className="flex h-14 items-center rounded-lg border border-border bg-background px-4">
          <CoBrandBadge cobrand={preview} />
        </div>
      </div>

      {canManage ? (
        <form
          ref={formRef}
          onSubmit={onSubmit}
          className="grid grid-cols-1 gap-4 rounded-xl border border-border bg-surface p-4 md:grid-cols-2"
          aria-describedby={error ? ids.err : undefined}
        >
          <div className="flex flex-col gap-1">
            <label htmlFor={ids.name} className="text-xs font-semibold text-ink-2">
              {t('name')}
            </label>
            <input
              id={ids.name}
              name="name"
              type="text"
              maxLength={nameMax}
              value={name}
              placeholder={t('namePlaceholder')}
              onChange={(e) => setName(e.target.value)}
              aria-describedby={ids.nameHint}
              className={input}
              data-testid="cobrand-name"
            />
            <p id={ids.nameHint} className="text-xs text-ink-2">
              {t('nameHint')}
            </p>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor={ids.logo} className="text-xs font-semibold text-ink-2">
              {t('logo')}
            </label>
            <input
              id={ids.logo}
              name="logo"
              type="file"
              accept="image/png"
              aria-describedby={ids.logoHint}
              className={`${input} py-2 file:mr-3 file:rounded-md file:border-0 file:bg-surface-hover file:px-3 file:py-1 file:text-sm file:font-semibold file:text-ink`}
              data-testid="cobrand-logo-input"
            />
            <p id={ids.logoHint} className="text-xs text-ink-2">
              {t('logoHint')}
            </p>
            {logoSrc ? (
              <label htmlFor={ids.remove} className="mt-1 inline-flex min-h-11 items-center gap-2 text-sm text-ink">
                <input
                  id={ids.remove}
                  type="checkbox"
                  checked={removeLogo}
                  onChange={(e) => setRemoveLogo(e.target.checked)}
                  className={`h-5 w-5 ${focusRing}`}
                  data-testid="cobrand-remove"
                />
                {t('removeLogo')}
              </label>
            ) : (
              <p className="text-xs text-ink-2">{t('noLogo')}</p>
            )}
          </div>

          <div className="md:col-span-2">
            <button type="submit" className={primaryButton} disabled={pending} data-testid="cobrand-save">
              {pending ? t('saving') : t('save')}
            </button>
          </div>
        </form>
      ) : (
        <p className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink-2">{t('readOnly')}</p>
      )}

      <div role="alert" id={ids.err} className="empty:hidden">
        {error ? (
          <p className="rounded-lg border border-bad bg-surface px-3 py-2 text-sm font-medium text-bad" data-testid="cobrand-error">
            {t(`errors.${error}`)}
          </p>
        ) : null}
      </div>
      <p aria-live="polite" className="min-h-5 text-sm text-ok empty:hidden" data-testid="cobrand-saved">
        {saved ? t('saved') : ''}
      </p>
    </section>
  );
}
