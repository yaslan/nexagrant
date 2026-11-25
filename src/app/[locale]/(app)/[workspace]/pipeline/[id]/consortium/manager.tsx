'use client';

import React, { useState, useTransition } from 'react';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { addSeat, findCandidates, assignSeat, confirmSeat, getConflicts } from './actions';
import { useActionErrorText } from '@/lib/hooks/use-action-error-text';
import { seatBreakdownWriter, seatScoreDimensionScale } from '@/lib/scoring/seat-dimension-scale';
import { dimensionValueText, scoreNumberText } from '@/modules/m8/components/dimension-value';
import { formatMinorWhole } from '@/lib/money';
import type { BudgetShareView } from '@/lib/gates/readiness-records';
import type { G1ConsortiumSummary } from './g1-summary';
import { partnerOrgKey, seatStage, SEAT_STEP_COUNT, type SeatStage } from './seat-view';

// Local types matching prisma/schema.prisma — the generated client is not
// available here (see src/types/prisma-override.d.ts). NG-20 F4: the
// `notes`/`invitedAt`/`confirmedAt` fields this type used to carry are not
// columns of ConsortiumSeat and were always undefined.
export type ConsortiumSeat = { id: string; tenantId: string; opportunityId: string; role?: string | null; roleKey?: string; required?: boolean; organizationId: string | null; partnerOrgId?: string | null; status: string };

/**
 * A ranked candidate for a seat: the M8 matcher's row (SeatCandidate), on the 0–100 seat scale.
 * `breakdown` is the stored per-dimension record; its writer is read by seatBreakdownWriter.
 */
export type SeatCandidate = {
  id: string;
  seatId: string;
  organizationId: string;
  rank: number;
  score: number;
  breakdown?: Record<string, unknown>;
};

export interface OrgInfo {
  id: string;
  name: string;
  shortName: string | null;
  country: string | null;
  isSme: boolean;
}

/** The M8 matcher's dimensions, in the order the breakdown is rendered (K-579560=A). */
const MATCH_DIMENSIONS = ['topicExperience', 'geographicBalance', 'collabHistory', 'rivalRisk'] as const;

interface Props {
  opportunityId: string;
  seats: ConsortiumSeat[];
  candidates: SeatCandidate[];
  orgMap: Record<string, OrgInfo>;
  /** Organisations with an open partner-search request on this topic. Informational; not in the score. */
  liveDemandOrgIds?: string[];
  /** The viewer's role may confirm seats, decided on the server. The action checks it again. */
  canConfirm?: boolean;
  /**
   * NG-20: the latest G1 decision's consortium lists (src/lib/gates/evaluate.ts), read on the
   * server. `null` = no G1 decision on file. The screen never works the lists out itself.
   */
  g1?: G1ConsortiumSummary | null;
  /** NG-34 budget share ranges of this opportunity's seats; `null` = the read failed. */
  budgetShares?: BudgetShareView[] | null;
}

/** ISO-2 code chip; the full name is the tooltip. No flag emoji: Windows renders it as letters. */
function CountryChip({ code, testId }: { code: string | null; testId?: string }) {
  const t = useTranslations('Consortium');
  const locale = useLocale();
  if (!code) return <span className="text-muted text-xs">{t('noCountry')}</span>;
  let name: string | undefined;
  try {
    name = new Intl.DisplayNames([locale], { type: 'region' }).of(code.toUpperCase());
  } catch {
    name = undefined;
  }
  return (
    <span
      data-testid={testId}
      title={name}
      className="ml-2 inline-block font-mono text-[11px] leading-none px-1.5 py-1 rounded border border-border text-ink-2"
    >
      {code.toUpperCase()}
    </span>
  );
}

/** Three bars, the step name in words, `aria-current` on the current one: colour alone says nothing. */
function StageSteps({ stage, candidateCount }: { stage: SeatStage; candidateCount: number }) {
  const t = useTranslations('Consortium');
  if (stage.kind === 'declined' || stage.kind === 'unknown') {
    return (
      <span className="inline-block text-xs font-semibold px-2 py-1 rounded-md bg-bad/10 text-bad-ink">
        {t(`stage.${stage.kind}`)}
      </span>
    );
  }
  const label = t(`stage.${stage.kind}`);
  const hint =
    stage.kind === 'candidate'
      ? t('stage.candidateHint', { count: candidateCount })
      : stage.kind === 'open'
        ? t('stage.openHint')
        : stage.kind === 'invited'
          ? t('stage.invitedHint')
          : null;
  return (
    <div>
      <ol className="flex gap-1" aria-label={t('stage.aria', { label, step: stage.step, total: SEAT_STEP_COUNT })}>
        {Array.from({ length: SEAT_STEP_COUNT }, (_, i) => {
          const n = i + 1;
          const done = n < stage.step || (stage.kind === 'confirmed' && n === stage.step);
          const current = n === stage.step && stage.kind !== 'confirmed';
          return (
            <li
              key={n}
              aria-current={current ? 'step' : undefined}
              className={`h-1.5 w-10 rounded-full ${done ? 'bg-ok' : current ? 'bg-accent' : 'bg-border'}`}
            />
          );
        })}
      </ol>
      <div className="mt-1.5 text-xs">
        <span className="font-semibold text-ink">{label}</span>
        {hint && <span className="text-muted"> · {hint}</span>}
      </div>
    </div>
  );
}

// Keys only — the labels used to be hardcoded English, so a Turkish page showed
// "+ Research Partner" directly under the heading "Araştırma Ortağı".
const ROLE_OPTIONS = [
  { key: 'coordinator' },
  { key: 'research' },
  { key: 'industry' },
  { key: 'end_user' },
  { key: 'widening' },
  { key: 'dissemination' },
];

const statusColors: Record<string, string> = {
  OPEN: 'bg-ground text-muted border border-border',
  CANDIDATE: 'bg-accent/15 text-accent-ink border border-accent/20',
  INVITED: 'bg-amber/15 text-amber border border-amber/20',
  CONFIRMED: 'bg-ok/15 text-ok border border-ok/20',
  DECLINED: 'bg-bad/15 text-bad border border-bad/20',
};

const UNKNOWN_STATUS_STYLE = 'bg-ground text-muted border border-border';

const ROLE_LABEL_KEYS: Record<string, string> = {
  coordinator: 'role.coordinator',
  research: 'role.research',
  industry: 'role.industry',
  end_user: 'role.end_user',
  widening: 'role.widening',
  dissemination: 'role.dissemination',
};

/** `id` of a seat row, the target of the role links in the G1 band. */
function seatAnchorId(roleKey: string): string {
  return `consortium-seat-${roleKey}`;
}

/** Role names from the G1 band, each a link that moves focus to that seat's row. */
function RoleLinks({ roleKeys, roleLabel }: { roleKeys: string[]; roleLabel: (key: string) => string }) {
  return (
    <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
      {roleKeys.map((key) => (
        <li key={key}>
          <a
            href={`#${seatAnchorId(key)}`}
            onClick={(e) => {
              const row = document.getElementById(seatAnchorId(key));
              if (!row) return;
              e.preventDefault();
              row.scrollIntoView({ block: 'center' });
              row.focus();
            }}
            className="underline underline-offset-2 font-semibold inline-flex items-center min-h-6 rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
          >
            {roleLabel(key)}
          </a>
        </li>
      ))}
    </ul>
  );
}

/**
 * NG-20: the G1 gate's consortium answer, shown as the gate gave it. No rule is applied here:
 * the two lists are `inputs.unfilledCriticalRoles` / `inputs.criticalRolesWithoutBackup` of the
 * latest G1 decision, and the decision date says how fresh they are.
 */
function G1Band({ g1, roleLabel }: { g1: G1ConsortiumSummary | null; roleLabel: (key: string) => string }) {
  const t = useTranslations('Consortium');
  const format = useFormatter();
  if (!g1 || !g1.checkedConsortium) {
    return (
      <p data-testid="consortium-g1-none" className="mb-6 rounded-xl border border-border bg-ground p-4 text-sm text-ink-2">
        {g1 ? t('g1.notChecked') : t('g1.none')}
      </p>
    );
  }
  const source = (
    <p data-testid="consortium-g1-source" className="mt-2 text-xs text-muted">
      {t('g1.source', {
        date: format.dateTime(new Date(g1.decidedAt), { day: '2-digit', month: '2-digit', year: 'numeric' }),
      })}
    </p>
  );
  if (g1.unfilledCriticalRoles.length === 0 && g1.criticalRolesWithoutBackup.length === 0) {
    return (
      <div data-testid="consortium-g1-clear" className="mb-6 rounded-xl border border-ok/30 bg-ok/10 p-4 text-sm text-ok-ink">
        <p className="font-semibold">{t('g1.clear')}</p>
        {source}
      </div>
    );
  }
  return (
    <section aria-labelledby="consortium-g1-heading" className="mb-6 space-y-3">
      <h2 id="consortium-g1-heading" className="sr-only">{t('g1.heading')}</h2>
      {g1.unfilledCriticalRoles.length > 0 && (
        <div data-testid="consortium-g1-unfilled" className="rounded-xl border border-bad/30 bg-bad/10 p-4 text-sm text-bad-ink">
          <p className="font-bold">
            <span aria-hidden="true">⚠ </span>
            {t('g1.unfilledTitle', { count: g1.unfilledCriticalRoles.length })}
          </p>
          <RoleLinks roleKeys={g1.unfilledCriticalRoles} roleLabel={roleLabel} />
          {source}
        </div>
      )}
      {g1.criticalRolesWithoutBackup.length > 0 && (
        <div data-testid="consortium-g1-no-backup" className="rounded-xl border border-amber/30 bg-amber/10 p-4 text-sm text-amber-ink">
          <p className="font-bold">{t('g1.noBackupTitle', { count: g1.criticalRolesWithoutBackup.length })}</p>
          <RoleLinks roleKeys={g1.criticalRolesWithoutBackup} roleLabel={roleLabel} />
          {g1.unfilledCriticalRoles.length === 0 && source}
        </div>
      )}
    </section>
  );
}

export default function ConsortiumManager({ opportunityId, seats: initSeats, candidates: initCandidates, orgMap, canConfirm = false, liveDemandOrgIds = [], g1 = null, budgetShares = [] }: Props) {
  const liveDemand = new Set(liveDemandOrgIds);
  const t = useTranslations('Consortium');
  const format = useFormatter();
  const locale = useLocale();
  const roleLabelOf = (key: string) => {
    const k = ROLE_LABEL_KEYS[key];
    return k ? t(k) : key ? key.replace(/_/g, ' ') : t('role.unknown');
  };
  const unfilled = new Set(g1?.unfilledCriticalRoles ?? []);
  const noBackup = new Set(g1?.criticalRolesWithoutBackup ?? []);
  const shareBySeat = new Map((budgetShares ?? []).map((s) => [s.seatId, s]));
  const [seats, setSeats] = useState(initSeats);
  const [candidateMap, setCandidateMap] = useState<Record<string, SeatCandidate[]>>(() => {
    const map: Record<string, SeatCandidate[]> = {};
    for (const c of initCandidates) {
      // Same reason as the admin module map: the bucket is held in a local
      // because writing it back through the index does not narrow the read.
      const seatCandidates = map[c.seatId] ?? [];
      seatCandidates.push(c);
      map[c.seatId] = seatCandidates;
    }
    return map;
  });
  const [conflicts, setConflicts] = useState<string[]>([]);
  const [isPending, startTransition] = useTransition();
  const [expandedSeat, setExpandedSeat] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const errorText = useActionErrorText();

  /** A pilot refusal is said on the page; any other error goes on to the error boundary, as before. */
  const refuse = (err: unknown) => {
    const text = errorText(err, null);
    if (text === null) throw err;
    setActionError(text);
  };

  const handleAddSeat = (roleKey: string) => {
    setActionError(null);
    startTransition(async () => {
      let seat: Awaited<ReturnType<typeof addSeat>>;
      try {
        seat = await addSeat(opportunityId, roleKey);
      } catch (err) {
        refuse(err);
        return;
      }
      if (seat) {
        setSeats(prev => [...prev, seat as unknown as ConsortiumSeat]);
      }
    });
  };

  const handleFindCandidates = async (seatId: string) => {
    setExpandedSeat(seatId);
    setActionError(null);
    startTransition(async () => {
      let results: Awaited<ReturnType<typeof findCandidates>>;
      try {
        results = await findCandidates(seatId);
      } catch (err) {
        refuse(err);
        return;
      }
      setCandidateMap(prev => ({
        ...prev,
        [seatId]: results.map((r) => ({
          id: r.id,
          seatId,
          organizationId: r.organizationId,
          score: r.score,
          breakdown: r.breakdown,
          rank: r.rank,
        })),
      }));

      const c = await getConflicts(opportunityId);
      setConflicts(c);
    });
  };

  const handleAssign = (seatId: string, orgId: string) => {
    setActionError(null);
    startTransition(async () => {
      try {
        // `success: false` is a refused invite (not a candidate of this seat,
        // or the seat is confirmed): the row must not turn INVITED on screen.
        const { success } = await assignSeat(seatId, orgId);
        if (!success) return;
      } catch (err) {
        refuse(err);
        return;
      }
      setSeats(prev =>
        prev.map(s => (s.id === seatId ? { ...s, organizationId: orgId, status: 'INVITED' } : s))
      );
      const c = await getConflicts(opportunityId);
      setConflicts(c);
    });
  };

  const handleConfirm = (seatId: string, orgId: string) => {
    setActionError(null);
    startTransition(async () => {
      let answer: Awaited<ReturnType<typeof confirmSeat>>;
      try {
        answer = await confirmSeat(seatId, opportunityId, orgId);
      } catch (err) {
        refuse(err);
        return;
      }
      // Only the server's ok turns the seat CONFIRMED on screen.
      if (!answer.ok) {
        setActionError(t(answer.code));
        return;
      }
      setSeats(prev => prev.map(s => (s.id === seatId ? { ...s, status: 'CONFIRMED' } : s)));
      const c = await getConflicts(opportunityId);
      setConflicts(c);
    });
  };

  return (
    <div>
      {actionError && (
        <p role="alert" className="bg-bad/10 border border-bad/30 rounded-xl p-4 mb-6 text-sm font-semibold text-bad">
          {actionError}
        </p>
      )}
      {/* Conflict Warnings */}
      {conflicts.length > 0 && (
        <div className="bg-bad/10 border border-bad/30 rounded-xl p-4 mb-6">
          <h3 className="font-bold text-bad mb-2">
            <span aria-hidden="true">⚠ </span>
            {t('conflict')}
          </h3>
          <ul className="list-disc list-inside text-xs text-bad">
            {conflicts.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        </div>
      )}

      <G1Band g1={g1} roleLabel={roleLabelOf} />

      {/* Role Matrix / Seats */}
      <div className="space-y-4 mb-8">
        {seats.map((seat) => {
          const org = seat.organizationId
            ? orgMap[seat.organizationId]
            : seat.partnerOrgId
              ? orgMap[partnerOrgKey(seat.partnerOrgId)]
              : null;
          const seatCandidates = candidateMap[seat.id] || [];
          const isExpanded = expandedSeat === seat.id;
          const rawRoleKey = (seat).roleKey || seat.role || '';
          const roleLabel = roleLabelOf(rawRoleKey);
          const statusLabel = statusColors[seat.status] ? t(`status.${seat.status}`) : t('status.unknown');
          const statusStyle = statusColors[seat.status] || UNKNOWN_STATUS_STYLE;
          const critical = seat.required !== false;
          const isGap = unfilled.has(rawRoleKey);
          const stage = seatStage(seat.status, seatCandidates.length);
          // Display filter only: the first listed candidate that is not the seat's holder.
          // Whether the seat *has* a backup is the gate's answer (noBackup), not this.
          // A seat with no holder yet has candidates, not a backup: the list below shows them.
          const backup = seat.organizationId
            ? seatCandidates.find((c) => c.organizationId && c.organizationId !== seat.organizationId)
            : undefined;
          const backupOrg = backup ? orgMap[backup.organizationId] : undefined;
          const share = shareBySeat.get(seat.id);

          return (
            <div
              key={seat.id}
              id={rawRoleKey ? seatAnchorId(rawRoleKey) : undefined}
              tabIndex={-1}
              data-testid={`m8-builder-seat-${rawRoleKey}`}
              className={`border border-border rounded-xl bg-surface overflow-hidden shadow-2xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${isGap ? 'border-l-4 border-l-bad' : ''}`}
            >
              <div className="p-5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="font-bold text-ink capitalize text-sm">{roleLabel}</div>
                  <span
                    className={`text-[10px] font-bold tracking-wide px-2 py-0.5 rounded-md border ${critical ? 'border-bad/30 text-bad-ink' : 'border-border text-muted'}`}
                  >
                    {critical ? t('tag.critical') : t('tag.optional')}
                  </span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${statusStyle}`}>
                    {statusLabel}
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  {seat.organizationId && !org ? (
                    // Invited on this render: the map arrives with the next page load.
                    <div className="text-xs font-semibold text-ink">{seat.organizationId}</div>
                  ) : org ? (
                    <div className="text-xs text-ink-2">
                      <span className="font-semibold text-ink">{org.shortName || org.name}</span>
                      <CountryChip code={org.country} testId="seat-country" />
                      {org.isSme && <span className="ml-2 text-[10px] bg-accent/15 text-accent-ink px-1.5 py-0.5 rounded font-bold">SME</span>}
                    </div>
                  ) : (
                    <button
                      onClick={() => handleFindCandidates(seat.id)}
                      disabled={isPending}
                      className="text-xs bg-accent text-white px-3.5 py-1.5 rounded-lg hover:opacity-90 disabled:opacity-50 font-semibold shadow-2xs transition"
                    >
                      {isPending && isExpanded ? `⏳ ${t('computing')}` : `🔍 ${t('findCandidates')}`}
                    </button>
                  )}
                  {canConfirm && seat.status === 'INVITED' && seat.organizationId && (
                    <button
                      data-testid="m8-builder-seat-confirm"
                      onClick={() => handleConfirm(seat.id, seat.organizationId as string)}
                      disabled={isPending}
                      className="text-xs bg-ok text-white font-semibold px-3 py-1.5 rounded-lg hover:opacity-90 disabled:opacity-50 transition shadow-2xs"
                    >
                      {t('confirmParticipation')}
                    </button>
                  )}
                </div>
              </div>

              {/* NG-20: stage, backup and budget share. Three cells, stacked on a phone. */}
              <dl className="px-5 pb-4 grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                <div>
                  <dt className="text-muted font-semibold mb-1.5">{t('stage.label')}</dt>
                  <dd><StageSteps stage={stage} candidateCount={seatCandidates.length} /></dd>
                </div>
                <div>
                  <dt className="text-muted font-semibold mb-1.5">{t('backup.label')}</dt>
                  <dd data-testid="seat-backup" className="text-ink-2">
                    {critical && noBackup.has(rawRoleKey) ? (
                      <span className="inline-block font-semibold px-2 py-1 rounded-md bg-bad/10 text-bad-ink">
                        {t('backup.none')}
                      </span>
                    ) : backup ? (
                      <>
                        <span className="font-semibold text-ink">
                          {backupOrg?.shortName || backupOrg?.name || backup.organizationId}
                        </span>
                        <CountryChip code={backupOrg?.country ?? null} />
                      </>
                    ) : (
                      <span className="text-muted">
                        {seat.organizationId ? t('backup.notListed') : t('backup.noHolder')}
                      </span>
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted font-semibold mb-1.5">{t('budget.label')}</dt>
                  <dd data-testid="seat-budget" className="text-ink-2">
                    {budgetShares === null ? (
                      <span className="text-muted">{t('budget.readFailed')}</span>
                    ) : share ? (
                      <>
                        <span className="font-semibold text-ink tabular-nums">
                          {formatMinorWhole(share.minCents, share.currency, locale)}
                          {' – '}
                          {formatMinorWhole(share.maxCents, share.currency, locale)}
                        </span>
                        <span
                          className={`ml-2 inline-block font-semibold px-1.5 py-0.5 rounded ${share.agreedAt ? 'bg-ok/10 text-ok-ink' : 'bg-amber/10 text-amber-ink'}`}
                        >
                          {share.agreedAt ? t('budget.agreed') : t('budget.proposed')}
                        </span>
                      </>
                    ) : (
                      <span className="text-muted">{t('budget.missing')}</span>
                    )}
                  </dd>
                </div>
              </dl>

              {/* Candidate Results Drawer. NG-100 (qa Bulgu 1): a seat that already holds
                  candidates shows them on load, so a reload does not look like the list was
                  lost; the rows are the ones the last "Aday Bul" wrote. */}
              {(isExpanded || seatCandidates.length > 0) && seatCandidates.length > 0 && (
                <div className="border-t border-border bg-ground/50 p-4">
                  <h4 className="text-xs font-bold text-muted tracking-wider mb-3">{t('topCandidates')}</h4>
                  <div className="space-y-2">
                    {seatCandidates.map((c) => {
                      const cOrg = orgMap[c.organizationId];
                      const bd = c.breakdown;
                      return (
                        <div key={c.organizationId || c.id} className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-3 bg-surface rounded-lg border border-border gap-3">
                          <div>
                            <span className="font-bold text-accent text-xs">#{c.rank} </span>
                            <span className="font-semibold text-ink text-xs">{cOrg?.shortName || cOrg?.name || c.organizationId}</span>
                            <span className="text-muted text-xs ml-2">{cOrg?.country}</span>
                            {cOrg?.isSme && <span className="ml-2 text-[10px] bg-accent/15 text-accent-ink px-1.5 py-0.5 rounded font-bold">SME</span>}
                            {liveDemand.has(c.organizationId) && (
                              // Informational badge, not part of the score (K-579560=A).
                              <p className="mt-1 text-xs text-muted" data-testid="live-demand-badge">{t('liveDemandBadge')}</p>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
                            {bd && (
                              // Was four emoji with English `title`s: invisible to keyboard and
                              // touch users, and read as points out of the /100 total (FO-155).
                              <details className="text-xs text-muted basis-full sm:basis-auto">
                                <summary className="cursor-pointer min-h-11 flex items-center">{t('breakdown')}</summary>
                                <dl className="mt-1 space-y-0.5">
                                  {MATCH_DIMENSIONS.map((key) => (
                                    <div key={key} className="flex gap-2 justify-between">
                                      <dt>{t(`dimension.${key}`)}</dt>
                                      <dd className="tabular-nums whitespace-nowrap" data-testid={`m8-builder-dimension-${key}`}>
                                        {dimensionValueText(
                                          t,
                                          format.number,
                                          // A breakdown no scorer wrote has no known range: bare numbers.
                                          (() => {
                                            const writer = seatBreakdownWriter(bd);
                                            return writer ? seatScoreDimensionScale(writer, key) : null;
                                          })(),
                                          typeof bd[key] === 'number' ? (bd[key] as number) : 0
                                        )}
                                      </dd>
                                    </div>
                                  ))}
                                </dl>
                                <p className="mt-1">{t('breakdownNote')}</p>
                                {seatBreakdownWriter(bd) === 'match-legacy' && <p className="mt-1">{t('legacyScoringNote')}</p>}
                              </details>
                            )}
                            <span className="font-bold text-ok text-xs font-mono">{t('scoreOutOf', { score: scoreNumberText(format.number, c.score) })}</span>
                            <button
                              onClick={() => handleAssign(seat.id, c.organizationId)}
                              disabled={isPending}
                              className="text-xs bg-ok text-white font-semibold px-3 py-1 rounded-lg hover:opacity-90 disabled:opacity-50 transition shadow-2xs"
                            >
                              {t('invite')}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Add Seat */}
      <div className="border-2 border-dashed border-border rounded-xl p-4 bg-surface/40">
        <h3 className="text-xs font-semibold text-muted tracking-wider mb-3">{t('addRoleToConsortium')}</h3>
        <div className="flex flex-wrap gap-2">
          {ROLE_OPTIONS.map((r) => (
            <button
              key={r.key}
              onClick={() => handleAddSeat(r.key)}
              disabled={isPending}
              className="text-xs border border-border px-3 py-1.5 rounded-lg text-ink-2 hover:bg-surface-hover hover:text-ink disabled:opacity-50 transition font-medium"
            >
              + {t(ROLE_LABEL_KEYS[r.key] ?? 'role.unknown')}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
