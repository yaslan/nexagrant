import { NextRequest, NextResponse } from 'next/server';
import { processPdfAndStore } from '@/lib/ai/rag';
import { errorMessage } from '@/lib/errors';
import { auth } from '@/lib/auth';

/** The session shape this route needs: just who to attribute the upload to. */
interface SessionUser {
  user?: { id?: string | null } | null;
}

export async function POST(req: NextRequest) {
  try {
    // KNOWN GAP, not fixed here: this route still has no platform_admin check,
    // so anyone who can reach it can ingest a document. Reported under
    // TASK-MTSWVADF7RQ1B rather than fixed, because adding an authorization
    // gate is a separate change from closing the usage-logging hole.
    //
    // The session is read regardless so the embedding calls this triggers carry
    // a `userId` in AiUsageLog when one is available. It does not gate the
    // request, and an anonymous upload is still recorded — with no user, which
    // is the truth about it.
    //
    // Best-effort on purpose: attribution is an addition to this route, and a
    // session lookup that fails must not turn a working upload into a 500. A
    // call whose actor cannot be established is logged with no actor.
    let userId: string | undefined;
    try {
      const session = (await auth()) as SessionUser | null;
      userId = session?.user?.id ?? undefined;
    } catch (e) {
      console.warn('[upload] session unavailable, logging the upload without a user', e);
    }

    const formData = await req.formData();
    const file = formData.get('file') as File;
    const kind = formData.get('kind') as string;
    const title = formData.get('title') as string;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Tenant ID is null for shared platform documents. The embedding calls are
    // logged against PLATFORM_SCOPE_TENANT_ID; see `embedText` in src/lib/llm.ts.
    const doc = await processPdfAndStore(buffer, null, kind, title, undefined, { userId });

    return NextResponse.json({ success: true, docId: doc.id });
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
