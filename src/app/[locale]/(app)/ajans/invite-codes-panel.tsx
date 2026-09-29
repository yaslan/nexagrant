'use client';

import { useId, useRef, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { MAX_USES_LIMIT, MIN_MAX_USES } from '@/lib/agency/code-limits';
import type { InviteCodeStatus, InviteCodeSummary } from '@/lib/agency/codes';
import { createInviteCode, listInviteCodes, revokeInviteCode, type InviteActionError } from './actions';

/**
 * B-1 (TASK-MUM17YBJVAHRR): the server sends each code's status, never its use count.
 * No "exhausted" either (TASK-MUM2RMN3YIBGC): a used-up code reads "active".
 */
export type InviteCodeRow = InviteCodeSummary;

const focusRing =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';
const primaryButton = `inline-flex min-h-11 items-center justify-center rounded-lg bg-accent-strong px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60 ${focusRing}`;
const secondaryButton = `inline-flex min-h-11 items-center justify-center rounded-lg border border-border bg-surface px-4 py-2 text-sm font-semibold text-ink transition hover:bg-surface-hover disabled:opacity-60 ${focusRing}`;
const input = `min-h-11 w-full rounded-lg border border-border bg-surface px-3 text-sm text-ink ${focusRing}`;

const STATUS_CLASS: Record<InviteCodeStatus, string> = {
  active: 'border-ok text-ok',
  revoked: 'border-bad text-bad',
  expired: 'border-border text-ink-2',
};

function isoDay(from: number, offsetDays: number): string {
  return new Date(from + offsetDays * 86_400_000).toISOString().slice(0, 10);
}

export default function InviteCodesPanel({
  locale,
  initialCodes,
  canManage,
  now,
}: {
  locale: string;
  initialCodes: InviteCodeRow[];
  canManage: boolean;
  /** Server render time (ms). Status and date bounds are computed from it, so render stays pure. */
  now: number;
}) {
  const t = useTranslations('agency.codes');
  const [codes, setCodes] = useState(initialCodes);
  const [maxUses, setMaxUses] = useState('25');
  const [expiresOn, setExpiresOn] = useState(isoDay(now, 90));
  const [label, setLabel] = useState('');
  const [error, setError] = useState<InviteActionError | null>(null);
  const [created, setCreated] = useState<{ code: string; link: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();
  const createdRef = useRef<HTMLDivElement>(null);
  const ids = { max: useId(), exp: useId(), label: useId(), err: useId() };
  const registerPath = locale === 'tr' ? `/${locale}/kayit` : `/${locale}/register`;
  const dateFmt = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' });

  async function refresh() {
    setCodes(await listInviteCodes());
  }

  function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setCopied(false);
    startTransition(async () => {
      const res = await createInviteCode({ maxUses: Number(maxUses), expiresOn, label });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setCreated({
        code: res.code,
        link: `${window.location.origin}${registerPath}?kod=${encodeURIComponent(res.code)}`,
      });
      setLabel('');
      await refresh();
      requestAnimationFrame(() => createdRef.current?.focus());
    });
  }

  function onRevoke(c: InviteCodeRow) {
    if (!window.confirm(t('revokeConfirm', { hint: c.hint }))) return;
    setError(null);
    startTransition(async () => {
      const res = await revokeInviteCode(c.id);
      if (!res.ok) setError(res.error);
      await refresh();
    });
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section aria-labelledby="agency-codes-title" className="space-y-4">
      <div>
        <h2 id="agency-codes-title" className="font-heading text-xl font-semibold text-ink">
          {t('title')}
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-ink-2">{t('description')}</p>
        <p className="mt-1 max-w-2xl text-sm text-ink-2">{t('countsNote')}</p>
      </div>

      {canManage ? (
        <form
          onSubmit={onCreate}
          className="grid grid-cols-1 gap-3 rounded-xl border border-border bg-surface p-4 sm:grid-cols-2 lg:grid-cols-[8rem_11rem_1fr_auto] lg:items-end"
          aria-describedby={error ? ids.err : undefined}
        >
          <div className="flex flex-col gap-1">
            <label htmlFor={ids.max} className="text-xs font-semibold text-ink-2">
              {t('maxUses')} <span className="font-normal text-muted">{t('maxUsesHint', { min: MIN_MAX_USES })}</span>
            </label>
            <input
              id={ids.max}
              type="number"
              inputMode="numeric"
              min={MIN_MAX_USES}
              max={MAX_USES_LIMIT}
              required
              value={maxUses}
              onChange={(e) => setMaxUses(e.target.value)}
              className={input}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor={ids.exp} className="text-xs font-semibold text-ink-2">
              {t('expiresOn')}
            </label>
            <input
              id={ids.exp}
              type="date"
              required
              min={isoDay(now, 1)}
              max={isoDay(now, 365)}
              value={expiresOn}
              onChange={(e) => setExpiresOn(e.target.value)}
              className={input}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor={ids.label} className="text-xs font-semibold text-ink-2">
              {t('label')} <span className="font-normal text-muted">{t('optional')}</span>
            </label>
            <input
              id={ids.label}
              type="text"
              maxLength={80}
              value={label}
              placeholder={t('labelPlaceholder')}
              onChange={(e) => setLabel(e.target.value)}
              className={input}
            />
          </div>
          <button type="submit" className={primaryButton} disabled={pending} data-testid="invite-create">
            {pending ? t('creating') : t('create')}
          </button>
        </form>
      ) : (
        <p className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink-2">{t('readOnly')}</p>
      )}

      <div role="alert" id={ids.err} className="empty:hidden">
        {error ? (
          <p className="rounded-lg border border-bad bg-surface px-3 py-2 text-sm font-medium text-bad">
            {t(`errors.${error}`)}
          </p>
        ) : null}
      </div>

      {created ? (
        <div
          ref={createdRef}
          tabIndex={-1}
          data-testid="invite-created"
          className="space-y-3 rounded-xl border-2 border-accent bg-surface p-4 outline-none"
        >
          <p className="text-sm font-semibold text-ink">{t('createdTitle')}</p>
          <p className="font-mono text-2xl tracking-wider text-ink" data-testid="invite-created-code">
            {created.code}
          </p>
          <p className="text-sm text-ink-2">{t('createdOnce')}</p>
          <p className="break-all font-mono text-xs text-ink-2">{created.link}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={secondaryButton} onClick={() => copy(created.code)}>
              {t('copyCode')}
            </button>
            <button type="button" className={secondaryButton} onClick={() => copy(created.link)}>
              {t('copyLink')}
            </button>
            <button type="button" className={secondaryButton} onClick={() => setCreated(null)}>
              {t('hideCode')}
            </button>
          </div>
          <p aria-live="polite" className="min-h-5 text-sm text-ok">
            {copied ? t('copied') : ''}
          </p>
        </div>
      ) : null}

      {codes.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border bg-surface p-6 text-center text-sm text-ink-2">
          {t('empty')}
        </p>
      ) : (
        <div className="relative overflow-x-auto rounded-xl border border-border bg-surface">
          <table className="w-full min-w-[40rem] text-left text-sm" data-testid="invite-codes-table">
            <caption className="sr-only">{t('tableCaption')}</caption>
            <thead className="border-b border-border text-xs font-semibold text-ink-2">
              <tr>
                <th scope="col" className="px-4 py-3">{t('colCode')}</th>
                <th scope="col" className="px-4 py-3">{t('colLabel')}</th>
                <th scope="col" className="px-4 py-3">{t('colLimit')}</th>
                <th scope="col" className="px-4 py-3">{t('colExpires')}</th>
                <th scope="col" className="px-4 py-3">{t('colStatus')}</th>
                <th scope="col" className="px-4 py-3">
                  <span className="sr-only">{t('colActions')}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {codes.map((c) => {
                const status = c.status;
                return (
                  <tr key={c.id} className="border-b border-border last:border-0" data-testid={`invite-row-${c.hint}`}>
                    <td className="px-4 py-3 font-mono text-ink">
                      <span aria-label={t('hintSr', { hint: c.hint })}>••••-••••-{c.hint}</span>
                    </td>
                    <td className="px-4 py-3 text-ink-2">{c.label ?? '—'}</td>
                    <td className="px-4 py-3 tabular-nums text-ink">{t('limit', { max: c.maxUses })}</td>
                    <td className="px-4 py-3 text-ink-2">{dateFmt.format(new Date(c.expiresAt))}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${STATUS_CLASS[status]}`}>
                        {t(`status.${status}`)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {canManage && status !== 'revoked' ? (
                        <button
                          type="button"
                          onClick={() => onRevoke(c)}
                          disabled={pending}
                          className={`${secondaryButton} text-bad`}
                          aria-label={t('revokeSr', { hint: c.hint })}
                        >
                          {t('revoke')}
                        </button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
