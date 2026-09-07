import { NextRequest, NextResponse } from 'next/server';
import { processPdfAndStore } from '@/lib/ai/rag';
import { errorMessage } from '@/lib/errors';

export async function POST(req: NextRequest) {
  try {
    // Basic auth check would go here for platform_admin
    const formData = await req.formData();
    const file = formData.get('file') as File;
    const kind = formData.get('kind') as string;
    const title = formData.get('title') as string;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Tenant ID is null for shared platform documents
    const doc = await processPdfAndStore(buffer, null, kind, title);

    return NextResponse.json({ success: true, docId: doc.id });
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
