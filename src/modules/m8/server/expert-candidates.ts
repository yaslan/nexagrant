import type { ExpertPoolEntry, ExpertSeatMatch } from '@/core/contracts/expert-pool';
import type { TenantTx } from '@/lib/db';
import { findOpportunityTopic } from './matching';
import {
  minimumPartnerState,
  passesMinimumPartnerFilter,
  readMinimumPartnerRule,
  type MinimumPartnerState,
} from './minimum-partners';

/**
 * NG-52 (TASK-MW2SU1H9BLCGV) — the free expert pre-registrations as M8 seat
 * candidates (specification §6 "Kaynaklar: ... Nexa Grant uzman havuzu"; G-3 in
 * NG-22). Until this file no M8 query read them: 0 matches.
 *
 * K-579696 = A: in S1 an expert only pre-registers, free of charge. These
 * candidates are shown, not persisted to SeatCandidate and not invitable: an
 * invitation, a fee, a payment or a commission is the S2 marketplace.
 *
 * The rows are handed in (ExpertPoolEntry, src/core/contracts/expert-pool.ts);
 * this module never reads the expert table itself.
 */

/**
 * Topic identifier prefix → the programme slug the expert form stores
 * (src/lib/expert-prereg/options.ts PROGRAMMES). A programme the form does not
 * list (Eurostars, EIC, ...) matches no expert.
 */
const PROGRAMME_BY_TOPIC_PREFIX: Readonly<Record<string, string>> = {
  HORIZON: 'horizon-europe-h2020',
  HE: 'horizon-europe-h2020',
  H2020: 'horizon-europe-h2020',
  ERASMUS: 'erasmus-plus',
  ERASMUSPLUS: 'erasmus-plus',
  LIFE: 'life',
  CERV: 'cerv',
  DIGITAL: 'digital-europe',
  EU4H: 'eu4health',
  CREA: 'creative-europe',
  INTERREG: 'interreg',
  IPA: 'ipa',
  TUBITAK: 'national-tubitak',
};

/**
 * Seat role → the expert roles that can fill it. Organisation-type seats
 * (industry, end_user, widening) need an organisation, so no expert is offered.
 * `custom` is whatever the coordinator made it: any role.
 */
const EXPERT_ROLES_BY_SEAT_ROLE: Readonly<Record<string, readonly string[] | 'any'>> = {
  coordinator: ['coordinator', 'project-manager'],
  research: ['researcher'],
  dissemination: ['dissemination'],
  custom: 'any',
};

/** Candidates shown per seat, the same as the CORDIS matcher's default. */
const DEFAULT_LIMIT = 5;

export function expertProgrammeForTopic(identifier: string | null | undefined): string | null {
  if (!identifier) return null;
  const head = identifier.split('-')[0]?.toUpperCase() ?? '';
  return PROGRAMME_BY_TOPIC_PREFIX[head] ?? null;
}

export interface ExpertSeatResult {
  matches: ExpertSeatMatch[];
  /** Experts that matched programme and role but cannot get the proposal to the call minimum. */
  excludedByMinimumPartners: number;
}

export function matchExpertsToSeat(
  experts: readonly ExpertPoolEntry[],
  params: {
    topicIdentifier: string | null | undefined;
    seatRoleKey: string;
    minimumPartners: MinimumPartnerState | null;
    limit?: number;
  }
): ExpertSeatResult {
  const programme = expertProgrammeForTopic(params.topicIdentifier);
  const wanted = EXPERT_ROLES_BY_SEAT_ROLE[params.seatRoleKey];
  if (!programme || !wanted) return { matches: [], excludedByMinimumPartners: 0 };

  let excludedByMinimumPartners = 0;
  const matches: ExpertSeatMatch[] = [];
  for (const expert of experts) {
    if (!expert.programmes.includes(programme)) continue;
    const matchedRoles = wanted === 'any' ? [...expert.roles] : expert.roles.filter((r) => wanted.includes(r));
    if (matchedRoles.length === 0) continue;
    if (params.minimumPartners && !passesMinimumPartnerFilter(expert.country, params.minimumPartners)) {
      excludedByMinimumPartners += 1;
      continue;
    }
    matches.push({ expert, matchedProgramme: programme, matchedRoles });
  }

  matches.sort(
    (a, b) =>
      b.matchedRoles.length - a.matchedRoles.length ||
      (a.expert.founderNumber ?? Number.MAX_SAFE_INTEGER) - (b.expert.founderNumber ?? Number.MAX_SAFE_INTEGER) ||
      a.expert.id.localeCompare(b.expert.id)
  );
  return { matches: matches.slice(0, params.limit ?? DEFAULT_LIMIT), excludedByMinimumPartners };
}

interface SeatRow {
  id: string;
  roleKey: string;
  status: string;
  organizationId: string | null;
}

/**
 * Expert candidates for every seat of one opportunity that is not CONFIRMED,
 * keyed by seat id. Reads only tenant-scoped rows and shared CORDIS data, inside
 * the caller's `withTenant` transaction; the experts come from the caller.
 */
export async function expertCandidatesForOpportunity(
  tx: Pick<TenantTx, 'opportunity' | 'topic' | 'cordisOrganization'>,
  params: { opportunityId: string; tenantId: string; experts: readonly ExpertPoolEntry[]; limit?: number }
): Promise<Map<string, ExpertSeatResult>> {
  const out = new Map<string, ExpertSeatResult>();
  const opp = await tx.opportunity.findFirst({
    where: { id: params.opportunityId, tenantId: params.tenantId },
    select: { id: true, topicId: true, seats: { select: { id: true, roleKey: true, status: true, organizationId: true } } },
  });
  if (!opp) return out;

  const seats = opp.seats as SeatRow[];
  const topic = await findOpportunityTopic(tx, opp.topicId);
  const confirmedOrgIds = seats
    .filter((s) => s.status === 'CONFIRMED' && s.organizationId)
    .map((s) => s.organizationId as string);
  const confirmedOrgs: { country: string | null }[] = confirmedOrgIds.length
    ? await tx.cordisOrganization.findMany({
        where: { organisationId: { in: confirmedOrgIds } },
        select: { organisationId: true, country: true },
      })
    : [];
  const takenCountries = new Set(confirmedOrgs.map((o) => o.country).filter((c): c is string => Boolean(c)));
  const state = minimumPartnerState(
    readMinimumPartnerRule(topic?.eligibility),
    seats.map((s) => s.status),
    takenCountries
  );

  for (const seat of seats) {
    if (seat.status === 'CONFIRMED') continue;
    out.set(
      seat.id,
      matchExpertsToSeat(params.experts, {
        topicIdentifier: topic?.identifier,
        seatRoleKey: seat.roleKey,
        minimumPartners: state,
        limit: params.limit,
      })
    );
  }
  return out;
}
