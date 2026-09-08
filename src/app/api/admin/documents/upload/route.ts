import { NextRequest, NextResponse } from 'next/server';
import { processPdfAndStore } from '@/lib/ai/rag';
import { errorMessage } from '@/lib/errors';
import { requirePlatformAdminApi } from '@/lib/tenant';

export async function POST(req: NextRequest) {
  try {
    // This route stores the document with `tenantId: null` — the shared corpus
    // that `retrieveChunks`/`semanticSearch` mix into *every* tenant's RAG
    // context, embedded at the platform's expense. So it is platform staff
    // only, and the gate runs before the body is read: a rejected request must
    // not parse a PDF or spend an embedding call.
    const gate = await requirePlatformAdminApi();
    if (!gate.ok) return gate.response;

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
    // The actor is the admin the gate just identified — never absent now.
    const doc = await processPdfAndStore(buffer, null, kind, title, undefined, {
      userId: gate.userId,
    });

    return NextResponse.json({ success: true, docId: doc.id });
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
