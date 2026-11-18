import { NextRequest, NextResponse } from 'next/server';
import { internalError } from '@/lib/api-error';
import { runCordisImport } from '@/lib/k2-cordis/importer';
import { runPartnerProfileStep } from '@/lib/k2-cordis/profileStep';
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
      // The raw failure (SQL, file paths) is on the run row, in the alert and
      // in the importer's own log line; the body carries the run id to look it
      // up (İNCELEME-70 Y-1, TASK-MUNVVMJDEO932).
      logger.error('[API /api/admin/cordis/import] import run failed', importRes.errorCode, { runId: importRes.runId });
      return internalError({ success: false, error: 'import_failed' }, { ids: { runId: importRes.runId } });
    }

    // Null when the dump is unchanged and no profile failure is owed (NG-237).
    // A failed build raises the profile-failure alert and throws to the outer catch (logged, 500).
    const profileRes = (await runPartnerProfileStep(importRes.skipped === true, { runId: importRes.runId, dataset })) ?? {
      updatedProfiles: 0,
      updatedCoParticipations: 0,
      durationMs: 0,
    };

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
    return internalError({ success: false, error: 'internal_error' });
  }
}
