'use server';

import { withTenant } from '@/lib/db';
import { requireTenantAction } from '@/lib/tenant';
import { generateText } from '@/lib/ai/llm';
import { revalidatePath } from 'next/cache';
import { syncMeetingBriefToCalendar } from '@/lib/calendar/sync';

/**
 * M9 meeting briefs.
 *
 * `tenantId` and `userId` used to be *parameters*: the briefs client component
 * read them off the page and passed them back in. A server action is a public
 * POST endpoint, so those were attacker-controlled — any value could be sent
 * and the brief, the credit charge and the DB row all followed it. Both are
 * now read from the session inside the action and cannot be overridden.
 */

export async function generateMeetingBrief({
  interactionId,
  partnerName,
  callTopic,
  meetingScheduledAt,
  meetingScheduledTz = 'Europe/Brussels',
}: {
  interactionId: string;
  partnerName: string;
  callTopic: string;
  meetingScheduledAt?: Date;
  meetingScheduledTz?: string;
}) {
  const { tenantId, userId } = await requireTenantAction();
  const prompt = `Generate a 1-page pre-meeting briefing note for a Horizon Europe consortium discussion.
  Partner Name: ${partnerName}
  Call Topic: ${callTopic}

  Include the following structured sections in Markdown:
  ### 1. Partner Background & EU Track Record
  - Partner profile, PIC overview, EU framework programme experience.
  
  ### 2. Strategic Complementarity for ${callTopic}
  - Synergies between partner core capabilities and proposal requirements.
  
  ### 3. Suggested Work Package & Role Allocation
  - Recommended Work Package leadership (e.g. WP3 Pilot Demo or WP5 Dissemination) and estimated Person-Months effort.
  
  ### 4. 3 Strategic Questions to Ask in Meeting
  - 3 targeted, high-impact questions to clarify TRL readiness, pilot sites, and effort commitment.
  
  ### 5. Risk Points & Red Flags to Clarify
  - Background IP constraints, competitor overlaps, and budget expectations.`;

  let briefContent = '';
  try {
    briefContent = await generateText({
      tenantId,
      userId,
      module: 'M9',
      purpose: 'meeting_brief',
      prompt,
      system: 'You are an expert EU Horizon Europe coordinator preparing pre-meeting briefs for strategic partners.',
    });
  } catch (e: any) {
    console.warn('[M9 generateMeetingBrief] LLM call fallback:', e.message);
    briefContent = `### 1. Partner Background & EU Track Record
- **Partner:** ${partnerName}
- **Track Record:** Recognized participant in EU Framework Programmes with strong technical capacity.

### 2. Strategic Complementarity for ${callTopic}
- High synergy between partner core capabilities and topic requirements.

### 3. Suggested Work Package & Role Allocation
- **Role:** Work Package Leader (WP3 Prototyping or WP5 Dissemination).
- **Effort Recommendation:** 12 - 18 Person-Months.

### 4. 3 Strategic Questions to Ask in Meeting
1. **TRL Readiness:** What is your current validated TRL level for the key technology component?
2. **Infrastructure:** Do you have direct access to pilot sites or testing facilities for validation?
3. **Effort & Budget:** What is your team's target person-month commitment for Part B Section 3?

### 5. Risk Points & Red Flags to Clarify
- Clarify background IP ownership and licensing terms prior to Consortium Agreement drafting.
- Verify potential conflict of interest if partner is participating in competing proposals under the same call.`;
  }

  try {
    const brief = await withTenant<any>(tenantId, async (tx) => {
      // Deduct 1 AI credit for M9 Brief
      await tx.creditLedger.create({
        data: {
          tenantId,
          delta: -1,
          reason: `M9: Meeting Brief Generator for ${partnerName}`,
        },
      });

      // interactionId is globally unique, so an upsert keyed on it alone would
      // let one tenant overwrite another tenant's brief. Existing rows are
      // matched on (interactionId, tenantId) first.
      const existing = await tx.meetingBrief.findFirst({
        where: { interactionId, tenantId },
        select: { id: true },
      });

      if (existing) {
        return tx.meetingBrief.update({
          where: { id: existing.id },
          data: {
            content: briefContent,
            partnerName,
            meetingScheduledAt,
            meetingScheduledTz,
          },
        });
      }

      return tx.meetingBrief.create({
        data: {
          tenantId,
          interactionId,
          content: briefContent,
          partnerName,
          meetingScheduledAt,
          meetingScheduledTz,
        },
      });
    });

    try {
      revalidatePath('/[locale]/(app)/[workspace]/opportunities/[id]/briefs', 'page');
    } catch (e) {}

    // Sync brief to connected calendar providers
    try {
      await withTenant(tenantId, async (tx) => {
        await syncMeetingBriefToCalendar(tx, tenantId, userId, brief);
      });
    } catch (e: any) {
      console.warn('[M9 generateMeetingBrief] Calendar sync failed (non-critical):', e.message);
    }

    return { success: true, brief };
  } catch (e: any) {
    console.warn('[M9 generateMeetingBrief] DB write failed:', e.message);
    return { success: false, brief: null, error: 'BRIEF_NOT_PERSISTED' };
  }
}

export async function savePostMeetingNotes({
  briefId,
  partnerName,
  notes,
  decisions,
  actionItems,
  nextMeetingDate,
}: {
  briefId: string;
  partnerName: string;
  notes: string;
  decisions: string;
  actionItems: string[];
  nextMeetingDate?: string;
}) {
  const { tenantId } = await requireTenantAction();
  const formattedPostNotes = `\n\n---
### 📝 Toplantı Sonrası Notlar & Alınan Kararlar (${new Date().toLocaleDateString('tr-TR')})
- **Ortak:** ${partnerName}
- **Kararlar:** ${decisions || 'Ön anlaşma sağlandı.'}
- **Toplantı Notları:** ${notes}

#### 🎯 Alınan Aksiyon Maddeleri:
${actionItems.map((item, idx) => `${idx + 1}. ${item}`).join('\n')}

${nextMeetingDate ? `- **Sonraki Görüşme Tarihi:** ${nextMeetingDate}` : ''}`;

  let appended = false;
  try {
    appended = await withTenant<boolean>(tenantId, async (tx) => {
      // Scoped read: a brief id from another tenant must not be found here.
      const brief = await tx.meetingBrief.findFirst({ where: { id: briefId, tenantId } });
      if (!brief) return false;

      await tx.meetingBrief.update({
        where: { id: brief.id },
        data: { content: brief.content + formattedPostNotes },
      });
      return true;
    });
  } catch (dbErr: any) {
    console.warn('[savePostMeetingNotes] DB update failed:', dbErr.message);
    return { success: false, formattedPostNotes: '' };
  }

  if (!appended) {
    return { success: false, formattedPostNotes: '' };
  }

  try {
    revalidatePath('/[locale]/(app)/[workspace]/opportunities/[id]/briefs', 'page');
  } catch (e) {}

  return { success: true, formattedPostNotes };
}
