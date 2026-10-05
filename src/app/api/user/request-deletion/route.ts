import { NextResponse } from 'next/server';
import { internalError } from '@/lib/api-error';
import {
  requestAccountDeletion,
  cancelAccountDeletion,
  getDeletionStatus,
} from '@/actions/user/request-deletion';

/**
 * POST   /api/user/request-deletion — start the 30-day erasure grace period.
 * DELETE /api/user/request-deletion — cancel a pending request.
 * GET    /api/user/request-deletion — read the current erasure state.
 */

export async function POST() {
  const result = await requestAccountDeletion();

  if (!result.success) {
    if (result.error === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return internalError({ error: 'request_failed' });
  }

  return NextResponse.json(
    {
      status: result.status,
      deletedAt: result.deletedAt,
      ...(result.soleOwnerOf ? { soleOwnerOf: result.soleOwnerOf } : {}),
    },
    { status: 200, headers: { 'Cache-Control': 'no-store' } }
  );
}

export async function DELETE() {
  const result = await cancelAccountDeletion();

  if (!result.success) {
    if (result.error === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return internalError({ error: 'cancel_failed' });
  }

  return NextResponse.json({ status: 'active' }, { status: 200 });
}

export async function GET() {
  const status = await getDeletionStatus();
  return NextResponse.json(status, {
    status: 200,
    headers: { 'Cache-Control': 'no-store' },
  });
}
