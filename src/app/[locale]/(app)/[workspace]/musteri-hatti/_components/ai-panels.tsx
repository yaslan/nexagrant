'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import {
  applyEnrichmentAction,
  approveEligibilityReportAction,
  generateEligibilityReportAction,
  proposeEnrichmentAction,
  type AiActionCode,
  type EnrichmentProposalData,
} from '../ai-actions';

/**
 * M18-F5 (NG-136) panels on the lead detail screen: website enrichment (proposal → tick → write)
 * and the eligibility pre-report (generate a DRAFT → approve). The server sends a code; text is ours.
 */

const inputClass =
  'mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm focus:outline-2 focus:outline-offset-2 focus:outline-sky-600';
const buttonClass =
  'rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50';

const AI_CODES: readonly AiActionCode[] = ['NO_WEBSITE', 'SITE_UNAVAILABLE', 'BAD_ANSWER', 'NO_CREDITS'];

type Notice = { kind: 'ok' | 'err'; text: string } | null;

function NoticeLine({ notice }: { notice: Notice }) {
  if (!notice) return null;
  return (
    <p role={notice.kind === 'err' ? 'alert' : 'status'} className={notice.kind === 'err' ? 'text-sm text-red-700' : 'text-sm text-emerald-700'}>
      {notice.text}
    </p>
  );
}

function useErrorText() {
  const t = useTranslations('m18');
  return (code: AiActionCode) => (AI_CODES.includes(code) ? t(`ai.errors.${code}`) : t(`errors.${code}`));
}

/** The label every eligibility output carries (CLAUDE.md: never an official score). */
export function PreAssessmentLabel({ text }: { text: string }) {
  return (
    <span data-testid="pre-assessment-label" className="inline-block rounded border border-amber-400 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-900">
      {text}
    </span>
  );
}

type FieldKey = 'legalName' | 'district' | 'sizeBand' | 'themes' | 'sectorCodes';
const FIELD_KEYS: readonly FieldKey[] = ['legalName', 'district', 'sizeBand', 'themes', 'sectorCodes'];

export function EnrichmentPanel({ organizationId, hasWebsite, credits }: { organizationId: string; hasWebsite: boolean; credits: number }) {
  const t = useTranslations('m18.ai');
  const tSize = useTranslations('m18.size');
  const errorText = useErrorText();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [notice, setNotice] = useState<Notice>(null);
  const [data, setData] = useState<EnrichmentProposalData | null>(null);
  const [picked, setPicked] = useState<Set<FieldKey>>(new Set());

  if (!hasWebsite) return <p className="text-sm text-slate-600">{t('enrichNoWebsite')}</p>;

  const offered = data
    ? FIELD_KEYS.filter((k) => {
        const v = data.proposal[k];
        return Array.isArray(v) ? v.length > 0 : v !== null;
      })
    : [];

  const display = (k: FieldKey): string => {
    const v = data?.proposal[k];
    if (Array.isArray(v)) return v.join(', ');
    if (k === 'sizeBand' && v) return tSize(v);
    return v ?? '';
  };

  const run = () => {
    setNotice(null);
    start(async () => {
      const result = await proposeEnrichmentAction({ organizationId });
      if (!result.ok) {
        setData(null);
        setNotice({ kind: 'err', text: errorText(result.code) });
        return;
      }
      setData(result.data ?? null);
      setPicked(new Set());
      if (result.data && FIELD_KEYS.every((k) => { const v = result.data!.proposal[k]; return Array.isArray(v) ? v.length === 0 : v === null; })) {
        setNotice({ kind: 'ok', text: t('enrichEmpty') });
      }
    });
  };

  const apply = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!data || picked.size === 0) {
      setNotice({ kind: 'err', text: t('enrichNothingSelected') });
      return;
    }
    const input: Record<string, unknown> = { organizationId };
    for (const k of picked) input[k] = data.proposal[k];
    start(async () => {
      const result = await applyEnrichmentAction(input);
      if (result.ok) {
        setData(null);
        setNotice({ kind: 'ok', text: t('enrichApplied') });
        router.refresh();
      } else {
        setNotice({ kind: 'err', text: errorText(result.code) });
      }
    });
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">{t('enrichHint', { credits })}</p>
      <button type="button" onClick={run} disabled={pending} className={buttonClass}>
        {pending ? t('pending') : t('enrichRun')}
      </button>
      {data && offered.length > 0 ? (
        <form onSubmit={apply} className="space-y-2 rounded border border-slate-200 p-3">
          <ul className="space-y-1 text-sm">
            {offered.map((k) => (
              <li key={k}>
                <label className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={picked.has(k)}
                    onChange={(e) => {
                      const next = new Set(picked);
                      if (e.target.checked) next.add(k);
                      else next.delete(k);
                      setPicked(next);
                    }}
                  />
                  <span>
                    <span className="font-medium">{t(`field.${k}`)}:</span> {display(k)}
                  </span>
                </label>
              </li>
            ))}
          </ul>
          {data.proposal.sources.length > 0 ? (
            <p className="text-xs text-slate-600">
              {t('enrichSources')}: {data.proposal.sources.join(', ')}
            </p>
          ) : null}
          <button type="submit" disabled={pending} className={buttonClass}>{t('enrichApply')}</button>
        </form>
      ) : null}
      <NoticeLine notice={notice} />
    </div>
  );
}

export function EligibilityForm({
  organizationId,
  calls,
}: {
  organizationId: string;
  calls: { id: string; title: string; callIdentifier: string }[];
}) {
  const t = useTranslations('m18.ai');
  const errorText = useErrorText();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [notice, setNotice] = useState<Notice>(null);

  if (calls.length === 0) return <p className="text-sm text-slate-600">{t('eligibilityNoCalls')}</p>;

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const callId = String(new FormData(e.currentTarget).get('callId') ?? '');
    setNotice(null);
    start(async () => {
      const result = await generateEligibilityReportAction({ organizationId, callId });
      if (result.ok) {
        setNotice({ kind: 'ok', text: t('eligibilityCreated') });
        router.refresh();
      } else {
        setNotice({ kind: 'err', text: errorText(result.code) });
      }
    });
  };

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3">
      <label className="text-sm font-medium">
        {t('callLabel')}
        <select name="callId" required className={inputClass}>
          {calls.map((c) => (
            <option key={c.id} value={c.id}>{`${c.callIdentifier} — ${c.title}`}</option>
          ))}
        </select>
      </label>
      <button type="submit" disabled={pending} className={buttonClass}>
        {pending ? t('pending') : t('eligibilityRun')}
      </button>
      <NoticeLine notice={notice} />
    </form>
  );
}

export function ApproveReportButton({ reportId }: { reportId: string }) {
  const t = useTranslations('m18.ai');
  const errorText = useErrorText();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [notice, setNotice] = useState<Notice>(null);
  const onClick = () =>
    start(async () => {
      const result = await approveEligibilityReportAction({ reportId });
      if (result.ok) {
        setNotice({ kind: 'ok', text: t('approved') });
        router.refresh();
      } else {
        setNotice({ kind: 'err', text: errorText(result.code) });
      }
    });
  return (
    <span className="inline-flex items-center gap-2">
      <button type="button" onClick={onClick} disabled={pending} className={buttonClass}>{t('approve')}</button>
      <NoticeLine notice={notice} />
    </span>
  );
}
