import { NextRequest, NextResponse } from 'next/server';
import { runCordisImport } from '@/lib/k2-cordis/importer';
import { generatePartnerProfiles } from '@/lib/k2-cordis/partnerProfileJob';
import { logger } from '@/lib/logger';
import { requirePlatformAdminApi } from '@/lib/tenant';

export async function POST(req: NextRequest) {
  try {
    // Platform staff only: this import writes the cross-tenant CORDIS corpus
    // and partner profiles every tenant reads, and it is expensive to run. The
    // gate is first, so an unauthorized call cannot even start a fetch.
    const gate = await requirePlatformAdminApi();
    if (!gate.ok) return gate.response;

    const body = await req.json().catch(() => ({}));
    const dataset = body.dataset === 'H2020' ? 'H2020' : 'HORIZON';
    const limit = body.limit ? parseInt(String(body.limit), 10) : undefined;

    console.log(`[Admin API] Triggering CORDIS import for dataset=${dataset}, limit=${limit || 'all'}`);

    const importRes = await runCordisImport({
      dataset,
      limit,
    });

    if (!importRes.success) {
      return NextResponse.json(
        { success: false, error: importRes.error, runId: importRes.runId },
        { status: 500 }
      );
    }

    let profileRes = { updatedProfiles: 0, updatedCoParticipations: 0, durationMs: 0 };
    if (!importRes.skipped) {
      profileRes = await generatePartnerProfiles();
    }

    return NextResponse.json({
      success: true,
      data: {
        runId: importRes.runId,
        skipped: importRes.skipped || false,
        fileHash: importRes.fileHash,
        rowCounts: importRes.rowCounts,
        importDurationMs: importRes.durationMs,
        profilesUpdated: profileRes.updatedProfiles,
        profileJobDurationMs: profileRes.durationMs,
      },
    });
  } catch (error) {
    logger.error('[API /api/admin/cordis/import] import failed', error);
    return NextResponse.json({ success: false, error: 'internal_error' }, { status: 500 });
  }
}
