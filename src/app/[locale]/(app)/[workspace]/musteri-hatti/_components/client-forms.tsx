'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { toMinorUnits } from '@/lib/money';
import { useLiveNotice } from './live-notice';
import {
  createDealAction,
  createLeadAction,
  createTaskAction,
  moveDealStageAction,
  setTaskDoneAction,
  type ActionResult,
} from '../actions';

/** Stage codes in board order; the labels come from `m18.stage.*`. */
export const STAGE_CODES = [
  'NEW', 'QUALIFIED', 'CONTACTED', 'DISCOVERY_MEETING', 'ELIGIBILITY_ANALYSIS', 'PROPOSAL',
  'CONTRACT', 'APPLICATION_PREP', 'SUBMITTED', 'WON', 'REJECTED', 'LOST',
] as const;

const SIZE_CODES = ['MICRO', 'SMALL', 'MEDIUM', 'LARGE'] as const;

type Notice = { kind: 'ok' | 'err'; text: string } | null;

const inputClass =
  'mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm focus:outline-2 focus:outline-offset-2 focus:outline-sky-600';
const buttonClass =
  'rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50';

function NoticeLine({ notice }: { notice: Notice }) {
  if (!notice) return null;
  return (
    <p
      role={notice.kind === 'err' ? 'alert' : 'status'}
      className={notice.kind === 'err' ? 'text-sm text-red-700' : 'text-sm text-emerald-700'}
    >
      {notice.text}
    </p>
  );
}

/** Pairs an action result with a translated line. The server sends a code; text is ours. */
function useFeedback() {
  const t = useTranslations('m18');
  const [notice, setNotice] = useState<Notice>(null);
  const report = (result: ActionResult<unknown>, okText: string, errText?: string) => {
    if (result.ok) setNotice({ kind: 'ok', text: okText });
    else setNotice({ kind: 'err', text: errText ?? t(`errors.${result.code}`) });
  };
  const fail = (text: string) => setNotice({ kind: 'err', text });
  return { notice, report, fail };
}

export function LeadCreateForm() {
  const t = useTranslations('m18.leads');
  const tSize = useTranslations('m18.size');
  const router = useRouter();
  const [pending, start] = useTransition();
  const { notice, report } = useFeedback();

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const input = {
      name: String(fd.get('name') ?? ''),
      legalName: String(fd.get('legalName') ?? ''),
      provinceCode: String(fd.get('provinceCode') ?? ''),
      website: String(fd.get('website') ?? ''),
      sizeBand: String(fd.get('sizeBand') ?? '') || null,
    };
    start(async () => {
      const result = await createLeadAction(input);
      if (result.ok) {
        form.reset();
        router.refresh();
      }
      report(result, t('created'), !result.ok && result.code === 'DUPLICATE' ? t('duplicateNotice') : undefined);
    });
  };

  return (
    <form onSubmit={onSubmit} aria-labelledby="new-lead-heading" className="grid gap-3 rounded border border-slate-200 p-4 sm:grid-cols-2">
      <h2 id="new-lead-heading" className="text-base font-semibold sm:col-span-2">{t('newLead')}</h2>
      <label className="text-sm font-medium">
        {t('nameLabel')}
        <input name="name" required className={inputClass} />
      </label>
      <label className="text-sm font-medium">
        {t('legalNameLabel')}
        <input name="legalName" className={inputClass} />
      </label>
      <label className="text-sm font-medium">
        {t('provinceLabel')}
        <input name="provinceCode" inputMode="numeric" pattern="\d{1,2}" className={inputClass} />
      </label>
      <label className="text-sm font-medium">
        {t('websiteLabel')}
        <input name="website" type="url" className={inputClass} />
      </label>
      <label className="text-sm font-medium">
        {t('sizeLabel')}
        <select name="sizeBand" defaultValue="" className={inputClass}>
          <option value="">—</option>
          {SIZE_CODES.map((code) => (
            <option key={code} value={code}>{tSize(code)}</option>
          ))}
        </select>
      </label>
      <div className="flex items-center gap-3 sm:col-span-2">
        <button type="submit" disabled={pending} className={buttonClass}>{t('submit')}</button>
        <NoticeLine notice={notice} />
      </div>
    </form>
  );
}

export function DealCreateForm({ organizationId }: { organizationId: string }) {
  const t = useTranslations('m18.deal');
  const tFeedback = useTranslations('m18');
  const router = useRouter();
  const [pending, start] = useTransition();
  const { notice, report, fail } = useFeedback();

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const currency = String(fd.get('currency') ?? 'EUR').trim().toUpperCase();
    const feeRaw = String(fd.get('fee') ?? '').trim();
    let estimatedFeeCents: number | null = null;
    try {
      estimatedFeeCents = feeRaw ? toMinorUnits(feeRaw.replace(',', '.'), currency) : null;
    } catch {
      fail(tFeedback('errors.INVALID'));
      return;
    }
    start(async () => {
      const result = await createDealAction({
        organizationId,
        title: String(fd.get('title') ?? ''),
        estimatedFeeCents,
        currency,
      });
      if (result.ok) {
        form.reset();
        router.refresh();
      }
      report(result, t('created'));
    });
  };

  return (
    <form onSubmit={onSubmit} aria-labelledby="new-deal-heading" className="grid gap-3 rounded border border-slate-200 p-4 sm:grid-cols-2">
      <h2 id="new-deal-heading" className="text-base font-semibold sm:col-span-2">{t('heading')}</h2>
      <label className="text-sm font-medium sm:col-span-2">
        {t('titleLabel')}
        <input name="title" required className={inputClass} />
      </label>
      <label className="text-sm font-medium">
        {t('feeLabel')}
        <input name="fee" inputMode="decimal" aria-describedby="fee-help" className={inputClass} />
        <span id="fee-help" className="block text-xs text-slate-600">{t('feeHelp')}</span>
      </label>
      <label className="text-sm font-medium">
        {t('currencyLabel')}
        <input name="currency" defaultValue="EUR" maxLength={3} className={inputClass} />
      </label>
      <div className="flex items-center gap-3 sm:col-span-2">
        <button type="submit" disabled={pending} className={buttonClass}>{t('submit')}</button>
        <NoticeLine notice={notice} />
      </div>
    </form>
  );
}

/**
 * Stage select for one deal. Moving to LOST shows an inline reason field first: the rule table
 * refuses LOST without a reason, so asking for it up front avoids a round trip that fails.
 */
export function StageSelect({ dealId, stage }: { dealId: string; stage: string }) {
  const t = useTranslations('m18');
  const tErr = useTranslations('m18.errors');
  const router = useRouter();
  const [pending, start] = useTransition();
  const { announce } = useLiveNotice();
  const [lostOpen, setLostOpen] = useState(false);
  const [lostReason, setLostReason] = useState('');

  const send = (to: string, reason?: string) =>
    start(async () => {
      const result = await moveDealStageAction({ dealId, to, lostReason: reason });
      if (result.ok) router.refresh();
      announce(result.ok ? { kind: 'ok', text: t('pipeline.moved') } : { kind: 'err', text: tErr(result.code) });
    });

  const onChange = (to: string) => {
    if (to === stage) return;
    if (to === 'LOST') {
      setLostOpen(true);
      return;
    }
    setLostOpen(false);
    send(to);
  };

  return (
    <div className="space-y-1">
      <select
        value={stage}
        disabled={pending}
        onChange={(e) => onChange(e.target.value)}
        aria-label={t('pipeline.moveLabel')}
        className="rounded border border-slate-300 px-1 py-1 text-xs"
      >
        {STAGE_CODES.map((code) => (
          <option key={code} value={code}>{t(`stage.${code}`)}</option>
        ))}
      </select>
      {lostOpen ? (
        <div className="flex items-center gap-2">
          <input
            aria-label={t('pipeline.lostReasonLabel')}
            value={lostReason}
            onChange={(e) => setLostReason(e.target.value)}
            className="rounded border border-slate-300 px-1 py-1 text-xs"
          />
          <button
            type="button"
            disabled={pending || !lostReason.trim()}
            onClick={() => {
              setLostOpen(false);
              send('LOST', lostReason.trim());
            }}
            className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100 disabled:opacity-50"
          >
            {t('pipeline.lostReasonLabel')}
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function TaskToggle({ taskId, done }: { taskId: string; done: boolean }) {
  const t = useTranslations('m18.tasks');
  const tErr = useTranslations('m18.errors');
  const router = useRouter();
  const [pending, start] = useTransition();
  const { announce } = useLiveNotice();
  return (
    <div className="space-y-1">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const result = await setTaskDoneAction({ taskId, done: !done });
            if (result.ok) router.refresh();
            announce(result.ok ? { kind: 'ok', text: t('toggled') } : { kind: 'err', text: tErr(result.code) });
          })
        }
        className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100 disabled:opacity-50"
      >
        {done ? t('markOpen') : t('markDone')}
      </button>
    </div>
  );
}

export function TaskCreateForm({ deals }: { deals: { id: string; title: string }[] }) {
  const t = useTranslations('m18.tasks');
  const router = useRouter();
  const [pending, start] = useTransition();
  const { notice, report } = useFeedback();

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const dueRaw = String(fd.get('dueAt') ?? '');
    start(async () => {
      const result = await createTaskAction({
        dealId: String(fd.get('dealId') ?? ''),
        title: String(fd.get('title') ?? ''),
        dueAt: dueRaw ? new Date(dueRaw) : null,
      });
      if (result.ok) {
        form.reset();
        router.refresh();
      }
      report(result, t('created'));
    });
  };

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3">
      <label className="text-sm font-medium">
        {t('dealLabel')}
        <select name="dealId" required className={inputClass} defaultValue={deals[0]?.id ?? ''}>
          {deals.map((deal) => (
            <option key={deal.id} value={deal.id}>{deal.title}</option>
          ))}
        </select>
      </label>
      <label className="text-sm font-medium">
        {t('titleLabel')}
        <input name="title" required className={inputClass} />
      </label>
      <label className="text-sm font-medium">
        {t('dueLabel')}
        <input name="dueAt" type="date" className={inputClass} />
      </label>
      <button type="submit" disabled={pending} className={buttonClass}>{t('submit')}</button>
      <NoticeLine notice={notice} />
    </form>
  );
}
