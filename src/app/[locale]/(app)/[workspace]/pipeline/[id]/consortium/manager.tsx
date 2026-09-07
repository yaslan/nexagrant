'use client';

import React, { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { addSeat, findCandidates, assignSeat, getConflicts } from './actions';
import type { ScoringBreakdown } from '@/lib/scoring/consortium';

// Local types matching prisma/schema.prisma — the generated client is not
// available here (see src/types/prisma-override.d.ts).
export type ConsortiumSeat = { id: string; tenantId: string; opportunityId: string; role: string | null; roleKey?: string; required?: boolean; organizationId: string | null; status: string; notes: string | null; invitedAt: Date | null; confirmedAt: Date | null };

/**
 * A ranked candidate for a seat.
 *
 * `score` is the total on a persisted SeatCandidate row and the whole
 * breakdown on one the scorer just produced client-side, which is why the
 * display reads `.total` when it is not a number.
 */
export type SeatCandidate = {
  id: string;
  seatId: string;
  organizationId: string;
  rank: number;
  score: number | ScoringBreakdown;
  breakdown?: ScoringBreakdown;
};

export interface OrgInfo {
  id: string;
  name: string;
  shortName: string | null;
  country: string | null;
  isSme: boolean;
}

interface Props {
  opportunityId: string;
  seats: ConsortiumSeat[];
  candidates: SeatCandidate[];
  orgMap: Record<string, OrgInfo>;
}

const ROLE_OPTIONS = [
  { key: 'coordinator', label: 'Coordinator' },
  { key: 'research', label: 'Research Partner' },
  { key: 'industry', label: 'Industry Partner' },
  { key: 'end_user', label: 'End User' },
  { key: 'widening', label: 'Widening Country' },
  { key: 'dissemination', label: 'Dissemination' },
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

export default function ConsortiumManager({ opportunityId, seats: initSeats, candidates: initCandidates, orgMap }: Props) {
  const t = useTranslations('Consortium');
  const [seats, setSeats] = useState(initSeats);
  const [candidateMap, setCandidateMap] = useState<Record<string, SeatCandidate[]>>(() => {
    const map: Record<string, SeatCandidate[]> = {};
    for (const c of initCandidates) {
      if (!map[c.seatId]) map[c.seatId] = [];
      map[c.seatId].push(c);
    }
    return map;
  });
  const [conflicts, setConflicts] = useState<string[]>([]);
  const [isPending, startTransition] = useTransition();
  const [expandedSeat, setExpandedSeat] = useState<string | null>(null);

  const handleAddSeat = (roleKey: string) => {
    startTransition(async () => {
      const seat = await addSeat(opportunityId, roleKey);
      setSeats(prev => [...prev, seat]);
    });
  };

  const handleFindCandidates = async (seatId: string) => {
    setExpandedSeat(seatId);
    startTransition(async () => {
      const results = await findCandidates(seatId);
      setCandidateMap(prev => ({
        ...prev,
        [seatId]: results.map((r) => ({
          id: r.organizationId,
          seatId,
          organizationId: r.organizationId,
          score: r.score.total,
          breakdown: r.score,
          rank: r.rank,
          tenantId: '',
          partnerOrgId: null,
          computedAt: new Date(),
        })),
      }));

      const c = await getConflicts(opportunityId);
      setConflicts(c);
    });
  };

  const handleAssign = (seatId: string, orgId: string) => {
    startTransition(async () => {
      await assignSeat(seatId, orgId);
      setSeats(prev =>
        prev.map(s => (s.id === seatId ? { ...s, organizationId: orgId, status: 'INVITED' } : s))
      );
      const c = await getConflicts(opportunityId);
      setConflicts(c);
    });
  };

  return (
    <div>
      {/* Conflict Warnings */}
      {conflicts.length > 0 && (
        <div className="bg-bad/10 border border-bad/30 rounded-xl p-4 mb-6">
          <h3 className="font-bold text-bad mb-2">⚠ Conflicts Detected</h3>
          <ul className="list-disc list-inside text-xs text-bad">
            {conflicts.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Role Matrix / Seats */}
      <div className="space-y-4 mb-8">
        {seats.map((seat) => {
          const org = seat.organizationId ? orgMap[seat.organizationId] : null;
          const seatCandidates = candidateMap[seat.id] || [];
          const isExpanded = expandedSeat === seat.id;
          const rawRoleKey = (seat).roleKey || seat.role || '';
          const roleLabelKey = ROLE_LABEL_KEYS[rawRoleKey];
          const roleLabel = roleLabelKey ? t(roleLabelKey) : rawRoleKey ? rawRoleKey.replace(/_/g, ' ') : t('role.unknown');
          const statusLabel = statusColors[seat.status] ? t(`status.${seat.status}`) : t('status.unknown');
          const statusStyle = statusColors[seat.status] || UNKNOWN_STATUS_STYLE;

          return (
            <div key={seat.id} className="border border-border rounded-xl bg-surface overflow-hidden shadow-2xs">
              <div className="p-5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div className="flex items-center gap-3">
                  <div className="font-bold text-ink capitalize text-sm">{roleLabel}</div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${statusStyle}`}>
                    {statusLabel}
                  </span>
                  {seat.required && <span className="text-xs text-muted">{t('required')}</span>}
                </div>

                <div className="flex items-center gap-3">
                  {org ? (
                    <div className="text-xs text-ink-2">
                      <span className="font-semibold text-ink">{org.shortName || org.name}</span>
                      <span className="text-muted ml-2">{org.country}</span>
                      {org.isSme && <span className="ml-2 text-[10px] bg-accent/15 text-accent-ink px-1.5 py-0.5 rounded font-bold">SME</span>}
                    </div>
                  ) : (
                    <button
                      onClick={() => handleFindCandidates(seat.id)}
                      disabled={isPending}
                      className="text-xs bg-accent text-white px-3.5 py-1.5 rounded-lg hover:opacity-90 disabled:opacity-50 font-semibold shadow-2xs transition"
                    >
                      {isPending && isExpanded ? '⏳ Searching...' : '🔍 Find Candidates'}
                    </button>
                  )}
                </div>
              </div>

              {/* Candidate Results Drawer */}
              {isExpanded && seatCandidates.length > 0 && (
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
                          </div>
                          <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
                            <div className="text-xs text-muted space-x-2">
                              {bd && (
                                <>
                                  <span title="Topic Experience">🎯{bd.topicExperience?.toFixed(1)}</span>
                                  <span title="Network Centrality">🕸️{bd.networkCentrality?.toFixed(1)}</span>
                                  <span title="Country Diversity">🌍{bd.countryDiversity?.toFixed(1)}</span>
                                  <span title="Warmth Bonus">🤝{bd.warmthBonus?.toFixed(1)}</span>
                                </>
                              )}
                            </div>
                            <span className="font-bold text-ok text-xs font-mono">{(typeof c.score === 'number' ? c.score : c.score?.total || 0).toFixed(1)}</span>
                            <button
                              onClick={() => handleAssign(seat.id, c.organizationId)}
                              disabled={isPending}
                              className="text-xs bg-ok text-white font-semibold px-3 py-1 rounded-lg hover:opacity-90 disabled:opacity-50 transition shadow-2xs"
                            >
                              Invite
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
              + {r.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
