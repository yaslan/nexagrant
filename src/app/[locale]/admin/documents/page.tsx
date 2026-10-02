import React from 'react';
import { getTranslations } from 'next-intl/server';
import { errorMessage } from '@/lib/errors';
import { PRODUCT_NAME } from '@/lib/brand';
import { listSharedDocuments } from '@/lib/rag';
import { RAG_UPLOAD_KINDS } from '@/lib/rag-upload';
import DocumentUploadClient, { type DocumentRow } from './client';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'adminDocuments' });
  return { title: `${t('title')} · ${PRODUCT_NAME} Admin` };
}

/**
 * K6 — shared RAG corpus: work programme / topic PDFs (TASK-MULQL8QB679LQ). Gated by the admin
 * layout; `POST /api/admin/documents/upload` re-checks the platform-admin role itself.
 *
 * Lists only the kinds this form uploads — the CORDIS ingest jobs write thousands of shared
 * documents of their own, which are not this page's to show.
 */
export default async function AdminDocumentsPage() {
  let documents: DocumentRow[] = [];
  let total = 0;
  let loadError = false;
  try {
    const result = await listSharedDocuments(RAG_UPLOAD_KINDS);
    documents = result.documents.map((d) => ({ ...d, createdAt: d.createdAt.toISOString() }));
    total = result.total;
  } catch (e) {
    console.error(`[AdminDocumentsPage] DB query failed: ${errorMessage(e)}`);
    loadError = true;
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <DocumentUploadClient documents={documents} total={total} loadError={loadError} />
    </div>
  );
}
