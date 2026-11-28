import { z } from 'zod';
import { withTenant, type TenantTx } from '@/lib/db';
import { isPresentId } from '@/lib/required-id';
import { separatedPrompt } from '@/lib/ai/prompts';
import { generateCompletion, type LlmCompletion, type LlmGenerateOptions } from '@/lib/llm';
import { attemptPurpose, withM18Reservation, type M18CreditDeps } from './ai-credits';

/**
 * M18-F5 (NG-136) — eligibility pre-report: one LeadOrganization × one Call.
 *
 * An INTERNAL pre-assessment ("iç ön değerlendirme"), never an official score: the prompt forbids
 * scores and every screen that shows it carries the label. The model is reached only through
 * `src/lib/llm.ts`. The text is stored as a DRAFT report; only an APPROVED one may leave M18
 * (`releasableReport`, the deal-brief contract).
 *
 * Credit (NG-136, K-582507 = A — the M17 pattern, ai-credits.ts): `createEligibilityReport` reserves the
 * price of M18:eligibility-pre-report under the tenant lock, the model call is the free
 * M18:eligibility-pre-report-attempt (AiUsageLog, 0 credits), and the reservation is given back when no
 * DRAFT is saved — an empty answer, a failed model call, or a failed write. The model call runs OUTSIDE
 * any tenant transaction; the caller loads the subject in one `withTenant` and passes it in.
 */

export const ELIGIBILITY_MODULE = 'M18';
export const ELIGIBILITY_PURPOSE = 'eligibility-pre-report';
export const REPORT_STATUSES = ['DRAFT', 'APPROVED'] as const;
const MAX_REPORT_CHARS = 20_000;

export const eligibilityRequestSchema = z.object({
  organizationId: z.string().min(1).max(64),
  callId: z.string().min(1).max(64),
});
export const reportIdSchema = z.object({ reportId: z.string().min(1).max(64) });

export type EligibilitySubject = {
  org: {
    id: string;
    name: string;
    legalName: string | null;
    orgType: string | null;
    provinceCode: string | null;
    district: string | null;
    nuts2: string | null;
    sizeBand: string | null;
    themes: string[];
    sectorCodes: string[];
  };
  call: {
    id: string;
    title: string;
    callIdentifier: string;
    programme: string;
    eligibleApplicantTypes: string[];
    eligibleRegions: string[];
    cofinancingRateBp: number | null;
    topics: { identifier: string; title: string; typeOfAction: string | null; eligibility: unknown; nextDeadlineAt: Date | null }[];
  };
};

export async function loadEligibilitySubject(
  tx: TenantTx,
  tenantId: string,
  organizationId: string,
  callId: string,
): Promise<EligibilitySubject | null> {
  const org = await tx.leadOrganization.findFirst({
    where: { id: organizationId, tenantId, deletedAt: null },
    select: {
      id: true,
      name: true,
      legalName: true,
      orgType: true,
      provinceCode: true,
      district: true,
      nuts2: true,
      sizeBand: true,
      themes: true,
      sectorCodes: true,
    },
  });
  if (!org) return null;
  const call = await tx.call.findUnique({
    where: { id: callId },
    select: {
      id: true,
      title: true,
      callIdentifier: true,
      eligibleApplicantTypes: true,
      eligibleRegions: true,
      cofinancingRateBp: true,
      programme: { select: { name: true } },
      topics: {
        orderBy: { identifier: 'asc' },
        take: 5,
        select: { identifier: true, title: true, typeOfAction: true, eligibility: true, nextDeadlineAt: true },
      },
    },
  });
  if (!call) return null;
  const { programme, ...rest } = call;
  return { org, call: { ...rest, programme: programme.name } };
}

/** The organisation as the model reads it: the record, no contact data. */
export function describeOrganization(org: EligibilitySubject['org']): string {
  return [
    `name: ${org.name}`,
    `legalName: ${org.legalName ?? '-'}`,
    `orgType: ${org.orgType ?? '-'}`,
    `provinceCode: ${org.provinceCode ?? '-'}`,
    `district: ${org.district ?? '-'}`,
    `nuts2: ${org.nuts2 ?? '-'}`,
    `sizeBand: ${org.sizeBand ?? '-'}`,
    `themes: ${org.themes.join(', ') || '-'}`,
    `sectorCodes: ${org.sectorCodes.join(', ') || '-'}`,
  ].join('\n');
}

/** The call as the model reads it. An empty list is written "not recorded", not "no restriction". */
export function describeCall(call: EligibilitySubject['call']): string {
  const lines = [
    `callIdentifier: ${call.callIdentifier}`,
    `title: ${call.title}`,
    `programme: ${call.programme}`,
    `eligibleApplicantTypes: ${call.eligibleApplicantTypes.join(', ') || 'not recorded'}`,
    `eligibleRegions: ${call.eligibleRegions.join(', ') || 'not recorded'}`,
    `cofinancingRate: ${call.cofinancingRateBp === null ? 'not recorded' : `${call.cofinancingRateBp / 100}%`}`,
  ];
  for (const t of call.topics) {
    lines.push(
      `topic ${t.identifier}: ${t.title}; typeOfAction: ${t.typeOfAction ?? '-'}; nextDeadline (UTC): ${t.nextDeadlineAt?.toISOString() ?? '-'}; eligibility: ${JSON.stringify(t.eligibility ?? {})}`,
    );
  }
  return lines.join('\n');
}

export type EligibilityDeps = {
  generate?: (options: LlmGenerateOptions) => Promise<LlmCompletion>;
  credits?: M18CreditDeps;
  /** Writes the DRAFT; defaults to `saveEligibilityDraft` in its own tenant transaction. */
  save?: (input: SaveDraftInput) => Promise<{ id: string }>;
};

export type EligibilityDraft = { content: string; model: string };

type SaveDraftInput = { organizationId: string; callId: string; userId: string; locale: string; draft: EligibilityDraft };

/** The model's answer had no text: there is no report to save (NG-136 review — never an empty DRAFT). */
export class EmptyEligibilityAnswerError extends Error {
  constructor() {
    super('the model returned an empty eligibility pre-report');
    this.name = 'EmptyEligibilityAnswerError';
  }
}

/**
 * The model step alone, inside a reservation the caller holds. Throws what llm.ts throws (provider,
 * truncation), and {@link EmptyEligibilityAnswerError} when the answer has no text.
 */
async function draftEligibilityReport(
  input: { tenantId: string; userId: string; subject: EligibilitySubject; locale: string },
  generate: (options: LlmGenerateOptions) => Promise<LlmCompletion>,
  reservationRefId: string,
): Promise<EligibilityDraft> {
  const request = separatedPrompt(
    'm18/eligibility-pre-report',
    {},
    { organization: describeOrganization(input.subject.org), call: describeCall(input.subject.call) },
    input.locale,
  );
  const completion = await generate({
    tenantId: input.tenantId,
    userId: input.userId,
    module: ELIGIBILITY_MODULE,
    purpose: attemptPurpose(ELIGIBILITY_PURPOSE),
    // The price was reserved by createEligibilityReport; llm.ts logs this call at 0 credits.
    creditsReserved: true,
    // NG-387: marks the reservation delivered (AiUsageLog.refId) for the orphan sweep.
    reservationRefId,
    ...request,
  });
  const content = completion.text.trim().slice(0, MAX_REPORT_CHARS);
  if (!content) throw new EmptyEligibilityAnswerError();
  return { content, model: completion.model };
}

/**
 * Reserve → model → save the DRAFT. Throws {@link InsufficientAiCreditsError} (llm.ts's message) before
 * any provider is reached when the balance does not cover the price; every later throw refunds the
 * reservation first. Returns the saved report and the credits it cost.
 */
export async function createEligibilityReport(
  input: { tenantId: string; userId: string; subject: EligibilitySubject; locale: string },
  deps: EligibilityDeps = {},
): Promise<{ id: string; credits: number }> {
  const { tenantId, userId, subject, locale } = input;
  const save =
    deps.save ?? ((data: SaveDraftInput) => withTenant(tenantId, (tx) => saveEligibilityDraft(tx, tenantId, data)));
  return withM18Reservation(
    tenantId,
    ELIGIBILITY_PURPOSE,
    async ({ refId, credits }) => {
      const draft = await draftEligibilityReport(input, deps.generate ?? generateCompletion, refId);
      const saved = await save({ organizationId: subject.org.id, callId: subject.call.id, userId, locale, draft });
      return { keep: true, value: { id: saved.id, credits } };
    },
    deps.credits,
  );
}

export const REPORT_SELECT = {
  id: true,
  callId: true,
  status: true,
  content: true,
  locale: true,
  createdAt: true,
  approvedAt: true,
  call: { select: { title: true, callIdentifier: true } },
} as const;

export async function saveEligibilityDraft(
  tx: TenantTx,
  tenantId: string,
  input: SaveDraftInput,
) {
  return tx.leadEligibilityReport.create({
    data: {
      tenantId,
      organizationId: input.organizationId,
      callId: input.callId,
      status: 'DRAFT',
      content: input.draft.content,
      locale: input.locale,
      model: input.draft.model,
      createdByUserId: input.userId,
    },
    select: { id: true },
  });
}

export async function listEligibilityReports(tx: TenantTx, tenantId: string, organizationId: string) {
  return tx.leadEligibilityReport.findMany({
    where: { tenantId, organizationId, deletedAt: null },
    orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    take: 20,
    select: REPORT_SELECT,
  });
}

/** DRAFT → APPROVED by a named user. False when there is no such DRAFT for this tenant. */
export async function approveEligibilityReport(tx: TenantTx, tenantId: string, reportId: string, userId: string): Promise<boolean> {
  if (!isPresentId(tenantId) || !isPresentId(reportId) || !isPresentId(userId)) return false;
  const res = await tx.leadEligibilityReport.updateMany({
    where: { id: reportId, tenantId, deletedAt: null, status: 'DRAFT' },
    data: { status: 'APPROVED', approvedByUserId: userId, approvedAt: new Date() },
  });
  return res.count === 1;
}

/**
 * The newest APPROVED report for an organisation AND one call: the only one that may leave M18.
 * No call, no report (NG-136 review): a deal without a call must not borrow the pre-assessment of
 * whichever other call the organisation happens to have one for.
 */
export async function releasableReport(tx: TenantTx, tenantId: string, organizationId: string, callId: string | null) {
  if (!isPresentId(tenantId) || !isPresentId(organizationId) || !callId || !isPresentId(callId)) return null;
  return tx.leadEligibilityReport.findFirst({
    where: { tenantId, organizationId, callId, deletedAt: null, status: 'APPROVED' },
    orderBy: [{ approvedAt: 'desc' }, { id: 'asc' }],
    select: { id: true, callId: true, content: true, approvedAt: true },
  });
}

/** Calls the lead is already linked to (matches, deals): the choices offered for a pre-report. */
export async function eligibilityCallChoices(tx: TenantTx, tenantId: string, organizationId: string) {
  const [matches, deals] = await Promise.all([
    tx.leadMatch.findMany({
      where: { tenantId, organizationId, deletedAt: null },
      take: 20,
      select: { call: { select: { id: true, title: true, callIdentifier: true } } },
    }),
    tx.deal.findMany({
      where: { tenantId, organizationId, deletedAt: null, callId: { not: null } },
      take: 20,
      select: { call: { select: { id: true, title: true, callIdentifier: true } } },
    }),
  ]);
  const byId = new Map<string, { id: string; title: string; callIdentifier: string }>();
  for (const row of [...matches, ...deals]) if (row.call) byId.set(row.call.id, row.call);
  return [...byId.values()].sort((a, b) => a.callIdentifier.localeCompare(b.callIdentifier));
}
