'use server';

import { withTenant } from '@/lib/db';
import { requireTenantAction } from '@/lib/tenant';
import { assertModuleAccess } from '@/lib/modules/access';
import { generateText } from '@/lib/llm';
import { revalidatePath } from 'next/cache';
import { syncMeetingBriefToCalendar } from '@/lib/calendar/sync';
import { errorMessage } from '@/lib/errors';
import type { MeetingBriefRow } from '@/types/db-rows';
import { templateBrief } from '@/modules/m9/brief-template';

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
  // Module gate: refuse before any side effect — an LLM call writes AiUsageLog
  // and debits CreditLedger, so a closed module checked later still costs credits.
  await assertModuleAccess('M9');
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

  // `aiGenerated` decides two things below: whether an AI credit is debited, and
  // whether the brief is stored as a template draft. A brief the model never
  // wrote must not be charged for or presented as one.
  let aiGenerated = true;
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
  } catch (e) {
    console.warn('[M9 generateMeetingBrief] LLM call fallback:', errorMessage(e));
    aiGenerated = false;
    briefContent = templateBrief({ partnerName, callTopic });
  }

  try {
    const brief = await withTenant<MeetingBriefRow>(tenantId, async (tx) => {
      // One AI credit, and only when the model actually answered. A template
      // draft costs nothing: the header promises "1 AI credit / brief", and
      // charging it for a document the AI never wrote is charging for nothing.
      if (aiGenerated) {
        await tx.creditLedger.create({
          data: {
            tenantId,
            delta: -1,
            reason: `M9: Meeting Brief Generator for ${partnerName}`,
          },
        });
      }

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
    } catch (_e) {}

    // Sync brief to connected calendar providers
    try {
      await withTenant(tenantId, async (tx) => {
        await syncMeetingBriefToCalendar(tx, tenantId, userId, brief);
      });
    } catch (e) {
      console.warn('[M9 generateMeetingBrief] Calendar sync failed (non-critical):', errorMessage(e));
    }

    return { success: true, brief, aiGenerated };
  } catch (e) {
    console.warn('[M9 generateMeetingBrief] DB write failed:', errorMessage(e));
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
  // Module gate: refuse before any side effect — an LLM call writes AiUsageLog
  // and debits CreditLedger, so a closed module checked later still costs credits.
  await assertModuleAccess('M9');
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
  } catch (dbErr) {
    console.warn('[savePostMeetingNotes] DB update failed:', errorMessage(dbErr));
    return { success: false, formattedPostNotes: '' };
  }

  if (!appended) {
    return { success: false, formattedPostNotes: '' };
  }

  try {
    revalidatePath('/[locale]/(app)/[workspace]/opportunities/[id]/briefs', 'page');
  } catch (_e) {}

  return { success: true, formattedPostNotes };
}
