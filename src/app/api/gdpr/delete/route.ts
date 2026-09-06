import { NextResponse } from 'next/server';
import { requestAccountDeletion } from '@/actions/user/request-deletion';

/**
 * DELETE /api/gdpr/delete — legacy path kept for links published in the privacy
 * notice. It now starts the 30-day erasure grace period instead of destroying
 * the account immediately: the previous implementation ran an unauthenticated
 * hard delete, which was both unrecoverable and open to anyone who called it.
 * The irreversible purge happens in the `users-scheduled-deletion` job.
 */
export async function DELETE() {
  const result = await requestAccountDeletion();

  if (!result.success) {
    const status = result.error === 'Unauthorized' ? 401 : 500;
    return NextResponse.json({ error: result.error ?? 'Request failed' }, { status });
  }

  return NextResponse.json(
    {
      success: true,
      status: result.status,
      deletedAt: result.deletedAt,
      ...(result.soleOwnerOf ? { soleOwnerOf: result.soleOwnerOf } : {}),
    },
    { status: 200, headers: { 'Cache-Control': 'no-store' } }
  );
}
