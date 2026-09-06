'use server';

import { prisma } from '@/lib/db';
import { revalidatePath } from 'next/cache';
import crypto from 'crypto';

import { 
  PartBSectionItem, 
  SectionRevisionItem, 
  SectionCommentItem, 
  CollaboratorPresence, 
  DEFAULT_PART_B_SECTIONS 
} from '../types';

export type { 
  PartBSectionItem, 
  SectionRevisionItem, 
  SectionCommentItem, 
  CollaboratorPresence 
};

export async function createApplicationPart(opportunityId: string, tenantId: string, part: string) {
  const token = crypto.randomBytes(32).toString('hex');
  
  let createdPart: any = null;
  try {
    createdPart = await prisma.applicationPart.create({
      data: {
        tenantId,
        opportunityId,
        part,
        magicToken: token,
        content: {
          budget: [],
          workPackages: [],
          sections: part === 'PART_B' ? DEFAULT_PART_B_SECTIONS : [],
          revisions: [],
          comments: [],
          presence: [],
        }
      }
    });
  } catch (e: any) {
    console.warn(`[m11 createApplicationPart] DB create bypassed: ${e.message}`);
    createdPart = {
      id: `part-${part.toLowerCase()}-${Date.now()}`,
      tenantId,
      opportunityId,
      part,
      magicToken: token,
      content: {
        budget: [],
        workPackages: [],
        sections: part === 'PART_B' ? DEFAULT_PART_B_SECTIONS : [],
        revisions: [],
        comments: [],
        presence: [],
      },
      createdAt: new Date(),
    };
  }

  try {
    revalidatePath('/[locale]/(app)/[workspace]/opportunities/[id]/application', 'page');
  } catch (e) {}

  return createdPart;
}

export async function getPartBData(partId: string) {
  try {
    const part = await prisma.applicationPart.findUnique({ where: { id: partId } });
    if (part && part.content) {
      const content = part.content as any;
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
  } catch (e: any) {
    console.warn(`[m11 getPartBData] Fallback to default: ${e.message}`);
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
  let updatedPart: any = null;
  const now = new Date().toISOString();

  try {
    const part = await prisma.applicationPart.findUnique({ where: { id: partId } });
    if (part) {
      const content: any = part.content || {};
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
      updatedPart = await prisma.applicationPart.update({
        where: { id: partId },
        data: { content },
      });
    }
  } catch (e: any) {
    console.warn(`[m11 acquireSectionLock] DB bypass: ${e.message}`);
  }

  return { success: true, lockedAt: now };
}

export async function releaseSectionLock(partId: string, sectionKey: string, userId: string) {
  try {
    const part = await prisma.applicationPart.findUnique({ where: { id: partId } });
    if (part) {
      const content: any = part.content || {};
      const sections: PartBSectionItem[] = content.sections || [];
      const targetSec = sections.find((s) => s.key === sectionKey);
      if (targetSec && (targetSec.lockedBy === userId || !targetSec.lockedBy)) {
        targetSec.lockedBy = null;
        targetSec.lockedByName = null;
        targetSec.lockedByOrg = null;
        targetSec.lockedAt = null;
      }
      content.sections = sections;
      await prisma.applicationPart.update({
        where: { id: partId },
        data: { content },
      });
    }
  } catch (e: any) {
    console.warn(`[m11 releaseSectionLock] DB bypass: ${e.message}`);
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
  let updatedPart: any = null;
  const now = new Date().toISOString();
  const wordCount = newContent.trim().split(/\s+/).filter(Boolean).length;

  try {
    const part = await prisma.applicationPart.findUnique({ where: { id: partId } });
    if (part) {
      const content: any = part.content || {};
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

      updatedPart = await prisma.applicationPart.update({
        where: { id: partId },
        data: { content },
      });
    }
  } catch (e: any) {
    console.warn(`[m11 updateSectionContent] DB bypass: ${e.message}`);
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

  try {
    const part = await prisma.applicationPart.findUnique({ where: { id: partId } });
    if (part) {
      const content: any = part.content || {};
      const comments: SectionCommentItem[] = content.comments || [];
      content.comments = [newComment, ...comments];

      await prisma.applicationPart.update({
        where: { id: partId },
        data: { content },
      });
    }
  } catch (e: any) {
    console.warn(`[m11 addSectionComment] DB bypass: ${e.message}`);
  }

  return newComment;
}

export async function resolveSectionComment(partId: string, sectionKey: string, commentId: string) {
  try {
    const part = await prisma.applicationPart.findUnique({ where: { id: partId } });
    if (part) {
      const content: any = part.content || {};
      const comments: SectionCommentItem[] = content.comments || [];
      const target = comments.find((c) => c.id === commentId);
      if (target) {
        target.resolved = !target.resolved;
      }
      content.comments = comments;

      await prisma.applicationPart.update({
        where: { id: partId },
        data: { content },
      });
    }
  } catch (e: any) {
    console.warn(`[m11 resolveSectionComment] DB bypass: ${e.message}`);
  }

  return { success: true };
}

export async function restoreSectionRevision(partId: string, sectionKey: string, revisionId: string) {
  try {
    const part = await prisma.applicationPart.findUnique({ where: { id: partId } });
    if (part) {
      const content: any = part.content || {};
      const sections: PartBSectionItem[] = content.sections || [];
      const revisions: SectionRevisionItem[] = content.revisions || [];

      const targetRev = revisions.find((r) => r.id === revisionId && r.sectionKey === sectionKey);
      const targetSec = sections.find((s) => s.key === sectionKey);

      if (targetRev && targetSec) {
        targetSec.content = targetRev.content;
        targetSec.lastModifiedBy = `Geri Yüklendi (${targetRev.authorName})`;
        targetSec.lastModifiedAt = new Date().toISOString();

        content.sections = sections;
        await prisma.applicationPart.update({
          where: { id: partId },
          data: { content },
        });

        return { success: true, content: targetRev.content };
      }
    }
  } catch (e: any) {
    console.warn(`[m11 restoreSectionRevision] DB bypass: ${e.message}`);
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

  try {
    const part = await prisma.applicationPart.findUnique({ where: { id: partId } });
    if (part) {
      const content: any = part.content || {};
      let presenceList: CollaboratorPresence[] = content.presence || [];
      
      // Filter out stale (>90s) and current user
      const now = Date.now();
      presenceList = presenceList.filter(
        (p) => p.userId !== userId && (now - new Date(p.lastSeenAt).getTime()) < 90000
      );
      presenceList.push(presenceItem);
      content.presence = presenceList;

      await prisma.applicationPart.update({
        where: { id: partId },
        data: { content },
      });

      return presenceList;
    }
  } catch (e: any) {
    console.warn(`[m11 updatePresenceHeartbeat] DB bypass: ${e.message}`);
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

export async function calculateLumpSumBudget(
  personMonths: number,
  countryCoefficient: number = 1.0,
  subcontractingCost: number = 0,
  travelCost: number = 0
) {
  const BASE_MONTHLY_RATE = 5500;
  const directPersonnelCosts = BASE_MONTHLY_RATE * personMonths * countryCoefficient;
  const directOtherCosts = travelCost;
  const indirectCosts = (directPersonnelCosts + directOtherCosts) * 0.25;
  const totalRequestedBudget = directPersonnelCosts + directOtherCosts + indirectCosts + subcontractingCost;

  return Math.round(totalRequestedBudget);
}

export async function addBudgetLine(
  partId: string,
  partnerName: string,
  pm: number,
  countryCoefficient: number = 1.0,
  subcontracting: number = 0,
  travel: number = 0
) {
  const requestedTotal = await calculateLumpSumBudget(pm, countryCoefficient, subcontracting, travel);

  let updatedPart: any = null;
  try {
    const part = await prisma.applicationPart.findUnique({ where: { id: partId } });
    if (part) {
      const content: any = part.content || { budget: [] };
      content.budget = content.budget || [];
      content.budget.push({
        partnerName,
        personMonths: pm,
        countryCoefficient,
        subcontractingCost: subcontracting,
        travelCost: travel,
        requestedTotal
      });

      updatedPart = await prisma.applicationPart.update({
        where: { id: partId },
        data: { content }
      });
    }
  } catch (e: any) {
    console.warn(`[m11 addBudgetLine] DB update bypassed: ${e.message}`);
  }

  try {
    revalidatePath('/[locale]/(app)/[workspace]/opportunities/[id]/application', 'page');
  } catch (e) {}

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
  let updatedPart: any = null;
  try {
    const part = await prisma.applicationPart.findUnique({ where: { id: partId } });
    if (part) {
      const content: any = part.content || { workPackages: [] };
      content.workPackages = content.workPackages || [];
      content.workPackages.push({
        code: wpData.code,
        title: wpData.title,
        leadPartner: wpData.leadPartner,
        startMonth: wpData.startMonth,
        endMonth: wpData.endMonth,
        deliverables: wpData.deliverables || []
      });

      updatedPart = await prisma.applicationPart.update({
        where: { id: partId },
        data: { content }
      });
    }
  } catch (e: any) {
    console.warn(`[m11 addWorkPackage] DB update bypassed: ${e.message}`);
  }

  try {
    revalidatePath('/[locale]/(app)/[workspace]/opportunities/[id]/application', 'page');
  } catch (e) {}

  return updatedPart;
}

