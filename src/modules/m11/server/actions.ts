'use server';

import { withTenant } from '@/lib/db';
import { requireTenantAction } from '@/lib/tenant';
import { assertTenantWritable, PilotExpiredError } from '@/lib/billing/pilot';
import { revalidatePath } from 'next/cache';
import { hashSecretToken, secretTokenMatches } from '@/lib/secret-token';

import {
  ApplicationPartRow,
  PartBSectionItem,
  PartContent,
  SectionRevisionItem,
  SectionCommentItem,
  CollaboratorPresence,
  DEFAULT_PART_B_SECTIONS,
  readPartContent,
} from '../types';
import { errorMessage } from '@/lib/errors';
import { isPresentId } from '@/lib/required-id';

export type { 
  PartBSectionItem, 
  SectionRevisionItem, 
  SectionCommentItem, 
  CollaboratorPresence 
};


/**
 * M11 collaborative Part A/B editing.
 *
 * Every action here used to load its ApplicationPart with
 * `findUnique({ where: { id: partId } })` and write it back the same way — no
 * tenant anywhere — so a part id was enough to read another tenant's proposal
 * text, budget and comments, and to overwrite them. `createApplicationPart`
 * additionally took `tenantId` as an argument from the client.
 *
 * The tenant now comes from the session and both helpers below key on
 * `(id, tenantId)`. The consortium partner portal is the one session-less
 * caller; it has its own token-scoped entry point (`addBudgetLineByToken`),
 * where the magic token — not a session — is the credential.
 */

/**
 * Every column but `magicTokenHash` (ApplicationPartRow). Server actions return
 * the row they read, and that return value is serialised to the browser.
 */
const PART_ROW_SELECT = {
  id: true,
  tenantId: true,
  opportunityId: true,
  part: true,
  content: true,
  createdAt: true,
  updatedAt: true,
} as const;

/** Loads a part the session tenant owns, or null. */
async function loadPart(tenantId: string, partId: string): Promise<ApplicationPartRow | null> {
  // Client-supplied: with `partId` missing, `findFirst` would return the
  // tenant's first part (TASK-MUN2KUHP1BP18).
  if (!isPresentId(partId)) return null;
  return withTenant<ApplicationPartRow | null>(tenantId, (tx) =>
    tx.applicationPart.findFirst({ where: { id: partId, tenantId }, select: PART_ROW_SELECT })
  );
}

/** Writes a part's content back, refusing rows outside the tenant. */
async function savePartContent(tenantId: string, partId: string, content: PartContent): Promise<boolean> {
  // Prisma drops an `undefined` key from `where`: without this one part's
  // content would overwrite every part of the tenant (TASK-MUN2KUHP1BP18).
  if (!isPresentId(partId)) return false;
  const result = await withTenant<{ count: number }>(tenantId, (tx) =>
    tx.applicationPart.updateMany({ where: { id: partId, tenantId }, data: { content } })
  );
  return result.count > 0;
}

export async function createApplicationPart(opportunityId: string, part: string) {
  const { tenantId } = await requireTenantAction();

  const createdPart = await withTenant<ApplicationPartRow | null>(tenantId, async (tx) => {
    // The opportunity must belong to this tenant; its id is guessable.
    const opp = await tx.opportunity.findFirst({
      where: { id: opportunityId, tenantId },
      select: { id: true },
    });
    if (!opp) return null;

    return tx.applicationPart.create({
      data: {
        tenantId,
        opportunityId,
        part,
        // No partner portal token yet: only its hash is ever stored, so the
        // link is issued on demand and shown once (issuePartnerPortalLink,
        // TASK-MULQLL2T8ZJX4).
        content: {
          budget: [],
          workPackages: [],
          sections: part === 'PART_B' ? DEFAULT_PART_B_SECTIONS : [],
          revisions: [],
          comments: [],
          presence: [],
        }
      },
      select: PART_ROW_SELECT,
    });
  });

  if (!createdPart) {
    throw new Error(`Opportunity ${opportunityId} not found in this workspace.`);
  }

  try {
    revalidatePath('/[locale]/(app)/[workspace]/opportunities/[id]/application', 'page');
  } catch {}

  return createdPart;
}

export async function getPartBData(partId: string) {
  const { tenantId } = await requireTenantAction({ readOnly: true });

  try {
    const part = await loadPart(tenantId, partId);
    if (part && part.content) {
      const content = readPartContent(part.content);
      if (!content.sections || content.sections.length === 0) {
        content.sections = DEFAULT_PART_B_SECTIONS;
      }
      return {
        id: part.id,
        sections: (content.sections || DEFAULT_PART_B_SECTIONS) as PartBSectionItem[],
        revisions: (content.revisions || []) as SectionRevisionItem[],
        comments: (content.comments || []) as SectionCommentItem[],
        presence: (content.presence || []) as CollaboratorPresence[],
        workPackages: content.workPackages || [],
      };
    }
  } catch (e) {
    console.warn(`[m11 getPartBData] Fallback to default: ${errorMessage(e)}`);
  }

  return {
    id: partId,
    sections: DEFAULT_PART_B_SECTIONS,
    revisions: [],
    comments: [],
    presence: [],
    workPackages: [],
  };
}

export async function acquireSectionLock(
  partId: string,
  sectionKey: string,
  userId: string,
  authorName: string,
  authorOrg: string
) {
  const { tenantId } = await requireTenantAction();
  if (!isPresentId(partId)) return { success: false };
  const now = new Date().toISOString();

  try {
    const part = await loadPart(tenantId, partId);
    if (part) {
      const content = readPartContent(part.content);
      const sections: PartBSectionItem[] = content.sections || [...DEFAULT_PART_B_SECTIONS];
      
      const targetSec = sections.find((s) => s.key === sectionKey);
      if (targetSec) {
        // If locked by someone else within last 60 seconds, check lock
        if (targetSec.lockedBy && targetSec.lockedBy !== userId && targetSec.lockedAt) {
          const lockAge = (Date.now() - new Date(targetSec.lockedAt).getTime()) / 1000;
          if (lockAge < 60) {
            return {
              success: false,
              message: `Bölüm şu anda ${targetSec.lockedByName || 'başka bir yazar'} tarafından kilitli.`,
              lockedBy: targetSec.lockedByName,
            };
          }
        }

        targetSec.lockedBy = userId;
        targetSec.lockedByName = authorName;
        targetSec.lockedByOrg = authorOrg;
        targetSec.lockedAt = now;
      }

      content.sections = sections;
      await savePartContent(tenantId, partId, content);
    }
  } catch (e) {
    console.warn(`[m11 acquireSectionLock] DB bypass: ${errorMessage(e)}`);
  }

  return { success: true, lockedAt: now };
}

export async function releaseSectionLock(partId: string, sectionKey: string, userId: string) {
  const { tenantId } = await requireTenantAction();
  if (!isPresentId(partId)) return { success: false };

  try {
    const part = await loadPart(tenantId, partId);
    if (part) {
      const content = readPartContent(part.content);
      const sections: PartBSectionItem[] = content.sections || [];
      const targetSec = sections.find((s) => s.key === sectionKey);
      if (targetSec && (targetSec.lockedBy === userId || !targetSec.lockedBy)) {
        targetSec.lockedBy = null;
        targetSec.lockedByName = null;
        targetSec.lockedByOrg = null;
        targetSec.lockedAt = null;
      }
      content.sections = sections;
      await savePartContent(tenantId, partId, content);
    }
  } catch (e) {
    console.warn(`[m11 releaseSectionLock] DB bypass: ${errorMessage(e)}`);
  }

  return { success: true };
}

export async function updateSectionContent(
  partId: string,
  sectionKey: string,
  newContent: string,
  userId: string,
  authorName: string,
  authorOrg: string,
  changeSummary?: string
) {
  const { tenantId } = await requireTenantAction();
  if (!isPresentId(partId)) return { success: false };
  const now = new Date().toISOString();
  const wordCount = newContent.trim().split(/\s+/).filter(Boolean).length;

  try {
    const part = await loadPart(tenantId, partId);
    if (part) {
      const content = readPartContent(part.content);
      const sections: PartBSectionItem[] = content.sections || [...DEFAULT_PART_B_SECTIONS];
      const revisions: SectionRevisionItem[] = content.revisions || [];

      const targetSec = sections.find((s) => s.key === sectionKey);
      if (targetSec) {
        targetSec.content = newContent;
        targetSec.lastModifiedBy = authorName;
        targetSec.lastModifiedAt = now;
        targetSec.lockedBy = userId;
        targetSec.lockedByName = authorName;
        targetSec.lockedByOrg = authorOrg;
        targetSec.lockedAt = now;
      }

      // Add revision record
      const revisionItem: SectionRevisionItem = {
        id: `rev-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        sectionKey,
        authorName,
        authorOrg,
        timestamp: now,
        wordCount,
        summary: changeSummary || `${authorName} tarafından güncellendi (${wordCount} kelime)`,
        content: newContent,
      };

      // Keep last 30 revisions
      content.sections = sections;
      content.revisions = [revisionItem, ...revisions].slice(0, 30);

      await savePartContent(tenantId, partId, content);
    }
  } catch (e) {
    console.warn(`[m11 updateSectionContent] DB bypass: ${errorMessage(e)}`);
  }

  return { success: true, timestamp: now, wordCount };
}

export async function addSectionComment(
  partId: string,
  sectionKey: string,
  authorName: string,
  authorOrg: string,
  text: string
) {
  const newComment: SectionCommentItem = {
    id: `cmt-${Date.now()}`,
    sectionKey,
    authorName,
    authorOrg,
    timestamp: new Date().toISOString(),
    text,
    resolved: false,
  };

  const { tenantId } = await requireTenantAction();

  try {
    const part = await loadPart(tenantId, partId);
    if (part) {
      const content = readPartContent(part.content);
      const comments: SectionCommentItem[] = content.comments || [];
      content.comments = [newComment, ...comments];

      await savePartContent(tenantId, partId, content);
    }
  } catch (e) {
    console.warn(`[m11 addSectionComment] DB bypass: ${errorMessage(e)}`);
  }

  return newComment;
}

export async function resolveSectionComment(partId: string, sectionKey: string, commentId: string) {
  const { tenantId } = await requireTenantAction();
  if (!isPresentId(partId)) return { success: false };

  try {
    const part = await loadPart(tenantId, partId);
    if (part) {
      const content = readPartContent(part.content);
      const comments: SectionCommentItem[] = content.comments || [];
      const target = comments.find((c) => c.id === commentId);
      if (target) {
        target.resolved = !target.resolved;
      }
      content.comments = comments;

      await savePartContent(tenantId, partId, content);
    }
  } catch (e) {
    console.warn(`[m11 resolveSectionComment] DB bypass: ${errorMessage(e)}`);
  }

  return { success: true };
}

export async function restoreSectionRevision(partId: string, sectionKey: string, revisionId: string) {
  const { tenantId } = await requireTenantAction();
  if (!isPresentId(partId)) return { success: false };

  try {
    const part = await loadPart(tenantId, partId);
    if (part) {
      const content = readPartContent(part.content);
      const sections: PartBSectionItem[] = content.sections || [];
      const revisions: SectionRevisionItem[] = content.revisions || [];

      const targetRev = revisions.find((r) => r.id === revisionId && r.sectionKey === sectionKey);
      const targetSec = sections.find((s) => s.key === sectionKey);

      if (targetRev && targetSec) {
        targetSec.content = targetRev.content;
        targetSec.lastModifiedBy = `Geri Yüklendi (${targetRev.authorName})`;
        targetSec.lastModifiedAt = new Date().toISOString();

        content.sections = sections;
        await savePartContent(tenantId, partId, content);

        return { success: true, content: targetRev.content };
      }
    }
  } catch (e) {
    console.warn(`[m11 restoreSectionRevision] DB bypass: ${errorMessage(e)}`);
  }

  return { success: false };
}

export async function updatePresenceHeartbeat(
  partId: string,
  userId: string,
  authorName: string,
  authorOrg: string,
  activeSection: string
) {
  const colors = ['#3B82F6', '#10B981', '#8B5CF6', '#F59E0B', '#EC4899', '#06B6D4'];
  const hash = Math.abs(authorName.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0));
  const userColor = colors[hash % colors.length] || '#3B82F6';

  const presenceItem: CollaboratorPresence = {
    userId,
    name: authorName,
    org: authorOrg,
    color: userColor,
    activeSection,
    lastSeenAt: new Date().toISOString(),
  };

  const { tenantId } = await requireTenantAction({ readOnly: true });

  try {
    const part = await loadPart(tenantId, partId);
    if (part) {
      const content = readPartContent(part.content);
      let presenceList: CollaboratorPresence[] = content.presence || [];
      
      // Filter out stale (>90s) and current user
      const now = Date.now();
      presenceList = presenceList.filter(
        (p) => p.userId !== userId && (now - new Date(p.lastSeenAt).getTime()) < 90000
      );
      presenceList.push(presenceItem);
      content.presence = presenceList;

      await savePartContent(tenantId, partId, content);

      return presenceList;
    }
  } catch (e) {
    console.warn(`[m11 updatePresenceHeartbeat] DB bypass: ${errorMessage(e)}`);
  }

  return [presenceItem];
}

export async function generateSectionDraftAi(
  partId: string,
  sectionKey: string,
  sectionTitle: string,
  topicTitle: string,
  focusNotes: string = ''
) {
  // No data and no cost today (a fixed template), but it is an unauthenticated
  // endpoint the moment a real model call lands here (TASK-MUMJ2ERCFP964).
  await requireTenantAction({ readOnly: true });
  // Horizon Europe Section Prompt Generator logic
  const generatedDraft = `### ${sectionTitle}

#### 1. Strategic Relevance & Technical Concept
Under the scope of **${topicTitle}**, the proposed research addresses critical technological bottlenecks through an interdisciplinary approach.

${focusNotes ? `*Key Co-Author Focus Notes:* ${focusNotes}\n` : ''}
1. **Ambition Beyond State-of-the-Art:** Integrating proprietary breakthrough architectures to solve the fundamental trade-off between energy efficiency and operational reliability.
2. **Scientific Methodology:** Rigorous multiscale experimental protocols coupled with high-fidelity validation loops.
3. **Consortium Synergy:** Direct leveraging of complementary partner infrastructure across laboratories, pilot lines, and industrial deployment testbeds.

#### 2. Key Performance Indicators & Target Outcomes
- **KPI-1:** 35% enhancement in thermal throughput compared to standard benchmarks.
- **KPI-2:** Verification across minimum 3 validated industrial operational pilot envelopes.
- **KPI-3:** 100% compliance with open science and FAIR data governance mandates.`;

  return generatedDraft;
}

/**
 * The lump-sum arithmetic, kept out of the exported action so the partner
 * portal (`addBudgetLineByToken`, no session) can price a line without the
 * session check the public action needs.
 */
function lumpSumTotal(
  personMonths: number,
  countryCoefficient: number,
  subcontractingCost: number,
  travelCost: number
): number {
  const BASE_MONTHLY_RATE = 5500;
  const directPersonnelCosts = BASE_MONTHLY_RATE * personMonths * countryCoefficient;
  const directOtherCosts = travelCost;
  const indirectCosts = (directPersonnelCosts + directOtherCosts) * 0.25;
  const totalRequestedBudget = directPersonnelCosts + directOtherCosts + indirectCosts + subcontractingCost;

  return Math.round(totalRequestedBudget);
}

export async function calculateLumpSumBudget(
  personMonths: number,
  countryCoefficient: number = 1.0,
  subcontractingCost: number = 0,
  travelCost: number = 0
) {
  // Arithmetic only, but a server action is a public HTTP entry point; the
  // session check keeps it in line with every other M11 action (TASK-MUMJ2ERCFP964).
  await requireTenantAction({ readOnly: true });
  return lumpSumTotal(personMonths, countryCoefficient, subcontractingCost, travelCost);
}

export async function addBudgetLine(
  partId: string,
  partnerName: string,
  pm: number,
  countryCoefficient: number = 1.0,
  subcontracting: number = 0,
  travel: number = 0
) {
  const { tenantId } = await requireTenantAction();
  const requestedTotal = lumpSumTotal(pm, countryCoefficient, subcontracting, travel);

  let updatedPart: ApplicationPartRow | null = null;
  try {
    const part = await loadPart(tenantId, partId);
    if (part) {
      const content = readPartContent(part.content);
      content.budget = content.budget || [];
      content.budget.push({
        partnerName,
        personMonths: pm,
        countryCoefficient,
        subcontractingCost: subcontracting,
        travelCost: travel,
        requestedTotal
      });

      await savePartContent(tenantId, partId, content);
      updatedPart = { ...part, content };
    }
  } catch (e) {
    console.warn(`[m11 addBudgetLine] DB update bypassed: ${errorMessage(e)}`);
  }

  try {
    revalidatePath('/[locale]/(app)/[workspace]/opportunities/[id]/application', 'page');
  } catch {}

  return updatedPart;
}

export async function addWorkPackage(
  partId: string,
  wpData: {
    code: string;
    title: string;
    leadPartner: string;
    startMonth: number;
    endMonth: number;
    deliverables?: string[];
  }
) {
  const { tenantId } = await requireTenantAction();

  let updatedPart: ApplicationPartRow | null = null;
  try {
    const part = await loadPart(tenantId, partId);
    if (part) {
      const content = readPartContent(part.content);
      content.workPackages = content.workPackages || [];
      content.workPackages.push({
        code: wpData.code,
        title: wpData.title,
        leadPartner: wpData.leadPartner,
        startMonth: wpData.startMonth,
        endMonth: wpData.endMonth,
        deliverables: wpData.deliverables || []
      });

      await savePartContent(tenantId, partId, content);
      updatedPart = { ...part, content };
    }
  } catch (e) {
    console.warn(`[m11 addWorkPackage] DB update bypassed: ${errorMessage(e)}`);
  }

  try {
    revalidatePath('/[locale]/(app)/[workspace]/opportunities/[id]/application', 'page');
  } catch {}

  return updatedPart;
}

/**
 * Consortium partner portal entry point.
 *
 * The partner has no FonBridge session: the 32-byte magic token in the URL *is*
 * the credential, and the tenant is whatever the matching row says. This is the
 * only place an ApplicationPart is resolved without a session, and it is
 * deliberately narrow — token only, Part A only, budget lines only.
 */
export async function addBudgetLineByToken(
  magicToken: string,
  partnerName: string,
  pm: number,
  countryCoefficient: number = 1.0,
  subcontracting: number = 0,
  travel: number = 0
) {
  if (!magicToken || !partnerName || !Number.isFinite(pm)) {
    return { success: false };
  }

  const requestedTotal = lumpSumTotal(pm, countryCoefficient, subcontracting, travel);

  const { withSystemScope } = await import('@/lib/system-scope');

  // Resolved by token, then re-scoped to that row's own tenant for the write.
  // The token is the only credential a partner has — there is no session and no
  // tenant to scope to until this row comes back — so the read runs on the
  // sanctioned cross-tenant path. Under `fabrika_app` an unscoped read returns
  // nothing and every partner link 404s.
  const part = await withSystemScope('tenant-discovery', 'm11.partByMagicToken', (tx) =>
    tx.applicationPart.findUnique({
      where: { magicTokenHash: hashSecretToken(magicToken) },
      select: { id: true, tenantId: true, part: true, content: true, magicTokenHash: true },
    })
  );

  // Only SHA-256(token) is stored (TASK-MULQLL2T8ZJX4); the row found by that
  // hash is re-checked in constant time before anything is written.
  if (!part || part.part !== 'PART_A' || !secretTokenMatches(magicToken, part.magicTokenHash)) {
    return { success: false };
  }

  // No session here, so `requireTenantAction` — which makes an expired free
  // pilot read-only for every other action — never runs. The token's tenant
  // gets the same gate (TASK-MUMABL78X5JLX, review B-1): a partner link handed
  // out during the pilot must not keep writing into the workspace after it.
  try {
    await assertTenantWritable(part.tenantId);
  } catch (e) {
    if (e instanceof PilotExpiredError) return { success: false };
    throw e;
  }

  const content = readPartContent(part.content);
  content.budget = content.budget || [];
  content.budget.push({
    partnerName,
    personMonths: pm,
    countryCoefficient,
    subcontractingCost: subcontracting,
    travelCost: travel,
    requestedTotal,
  });

  const saved = await savePartContent(part.tenantId, part.id, content);

  try {
    revalidatePath('/portal/partner/[token]', 'page');
  } catch {}

  return { success: saved, requestedTotal };
}
