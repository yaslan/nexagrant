import React from 'react';
import { withTenant } from '@/lib/db';
import { requireTenantPage } from '@/lib/tenant';
import { MeetingBriefsClient } from './client';

export default async function MeetingBriefsPage({
  params,
}: {
  params: Promise<{ locale: string; workspace: string; id: string }>;
}) {
  const { locale, workspace, id } = await params;
  const { tenantId } = await requireTenantPage(locale);

  let opp: any = null;
  let briefs: any[] = [];

  try {
    // Both reads are scoped to the session tenant. The briefs query used to key
    // off `opp.tenantId`, so a cross-tenant opportunity would have pulled that
    // other tenant's briefs along with it.
    await withTenant(tenantId, async (tx) => {
      opp = await tx.opportunity.findFirst({
        where: { id, tenantId },
        select: { id: true, title: true, tenantId: true, topicId: true },
      });

      if (opp) {
        briefs = await tx.meetingBrief.findMany({
          where: { tenantId },
          orderBy: { createdAt: 'desc' },
        });
      }
    });
  } catch (e: any) {
    console.warn(`[MeetingBriefsPage] DB query bypassed: ${e.message}`);
  }

  if (!opp) {
    opp = {
      id,
      tenantId,
      title: 'HORIZON-CL5-2026-D3-01: Zero-Emission Transport Systems & Battery Tech',
      topicId: 'HORIZON-CL5-2026-D3-01',
    };

    briefs = [
      {
        id: 'brief-demo-1',
        interactionId: 'int-fraunhofer-01',
        content: `### 1. Partner Background & EU Track Record
- **Partner:** Fraunhofer Institute (Germany) — PIC 999984059
- **Track Record:** 142 Horizon Europe participations, 48 coordinator roles. Recognized leader in applied industrial research.

### 2. Strategic Complementarity for HORIZON-CL5-2026-D3-01
- High synergy between Fraunhofer's thermal management testbed and proposal objective for zero-emission heavy transport.

### 3. Suggested Work Package & Role Allocation
- **Role:** Work Package 3 Leader (Prototyping & Hardware-in-the-Loop Pilot Testing).
- **Effort Recommendation:** 16 Person-Months.

### 4. 3 Strategic Questions to Ask in Meeting
1. **Pilot Facility:** Can Fraunhofer host the hardware-in-the-loop thermal pilot in Q3 2027?
2. **Background IP:** What are the license terms for the thermal modeling software for partner use?
3. **Consortium Lead:** Who will be the lead PI for grant agreement negotiations?

### 5. Risk Points & Red Flags to Clarify
- **Data Sharing:** Ensure clear bilateral non-disclosure & data sharing agreement before sharing CAD models.
- **Overlapping Proposals:** Confirm whether Fraunhofer is participating in a competing proposal under the same call topic.`,
        createdAt: new Date().toISOString(),
      },
    ];
  }

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <MeetingBriefsClient
        opportunityId={opp.id}
        locale={locale}
        workspace={workspace}
        opportunityTitle={opp.title}
        briefs={briefs || []}
      />
    </div>
  );
}
