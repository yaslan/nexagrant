import { NextResponse } from 'next/server';
import { generateDocxBuffer, generatePdfHtml, templateBodyText } from '@/lib/document-exporter';
import type { ExportLocale } from '@/lib/document-exporter';
import { DEFAULT_PART_B_SECTIONS } from '@/modules/m11/types';
import { withTenant } from '@/lib/db';
import { requireTenantApi } from '@/lib/tenant';
import type { PartBSectionItem, PartContent } from '@/modules/m11/types';
import type { Prisma } from '@prisma/client';

/**
 * Document export — DOCX / print-HTML of a tenant's own document.
 *
 * This route used to be wide open. There was no `auth()` and no tenant filter,
 * so an anonymous `curl` got 200, and `partId` went straight into
 * `prisma.applicationPart.findUnique({ where: { id: partId } })`: anyone who
 * knew or guessed another tenant's ApplicationPart id could download that
 * tenant's Part B as a Word file. CLAUDE.md §1 — every business query is
 * tenant-scoped, and there is no tenant without a session.
 *
 * It also printed an identity that belonged to nobody: a fixed applicant
 * organisation (`FonBridge Teknoloji A.Ş.`), a real-looking Horizon call id,
 * `signedAt: new Date()` so every download claimed to have been signed at the
 * moment it was fetched, and a Turkish contract body hard-coded in this file
 * (rule 8). Now the organisation and the call name come from stored rows, no
 * signing date is invented, and the boilerplate body comes from the message
 * catalogue in both languages.
 */
/** Part B sections as stored on the row, or none when the row carries none. */
function storedSections(content: Prisma.JsonValue | PartContent | null): PartBSectionItem[] {
  const c = content as unknown as PartContent | null;
  const sections = c?.sections;
  return Array.isArray(sections) ? sections : [];
}

export async function GET(req: Request) {
  const auth = await requireTenantApi();
  if (!auth.ok) return auth.response;
  const { tenantId } = auth.scope;

  const { searchParams } = new URL(req.url);
  const type = searchParams.get('type') || 'NDA';
  const format = searchParams.get('format') || 'docx';
  const title = searchParams.get('title') || `${type} Document`;
  const partId = searchParams.get('partId');
  const opportunityId = searchParams.get('opportunityId');
  const locale: ExportLocale = searchParams.get('locale') === 'en' ? 'en' : 'tr';

  // One transaction with `app.tenant_id` set: the explicit `tenantId` in each
  // where clause is the first line of defence, the RLS policy the second.
  const ctx = await withTenant(tenantId, async (tx) => {
    const tenant = await tx.tenant.findFirst({ where: { id: tenantId }, select: { name: true } });

    const part = partId
      ? await tx.applicationPart.findFirst({
          where: { id: partId, tenantId },
          select: { content: true, opportunityId: true },
        })
      : null;

    // The part decides the opportunity when there is one; otherwise the caller
    // may name it, and that id is checked against this tenant just the same.
    const oppId: string | null = part?.opportunityId ?? opportunityId;
    const opportunity = oppId
      ? await tx.opportunity.findFirst({ where: { id: oppId, tenantId }, select: { title: true } })
      : null;

    return {
      tenantName: tenant?.name ?? null,
      part: part ?? null,
      opportunityTitle: opportunity?.title ?? null,
    };
  });

  // A partId that resolves to nothing under this tenant is "not found" for this
  // caller — the same answer whether the row belongs to another tenant or does
  // not exist at all, so the response cannot be used to probe for ids.
  if (partId && !ctx.part) {
    return NextResponse.json(
      { error: 'Not Found', code: 'PART_NOT_FOUND' },
      { status: 404 }
    );
  }

  let sections: PartBSectionItem[] = [];
  if (type === 'PART_B') {
    sections = storedSections(ctx.part?.content ?? null);
    // No stored sections (or no part asked for at all) means "give me the empty
    // Part B frame" — structure only, no prose and no authorship.
    if (sections.length === 0) {
      sections = DEFAULT_PART_B_SECTIONS;
    }
  }

  const docData = {
    // The document's reference is the id of the row it is an export OF, so the same document
    // exported twice carries the same reference. This used to be `doc-export-${Date.now()}`:
    // a fresh registration-number-looking string per download, traceable to nothing. A
    // template export has no stored row, so it gets no reference and the header says so.
    documentRef: partId ?? undefined,
    kind: type,
    title,
    // Absent stays absent: the exporter labels an unknown call and an unknown
    // organisation as unspecified rather than filling in a plausible name.
    opportunityTitle: ctx.opportunityTitle ?? undefined,
    tenantName: ctx.tenantName ?? undefined,
    locale,
    // No `signedAt`: exporting a document is not signing it, and this route has
    // no signature record to read.
    sections: sections.length > 0 ? sections : undefined,
    contentText: templateBodyText(type, locale),
  };

  if (format === 'docx') {
    // A real Office Open XML package (a zip), not the bare `word/document.xml` this route used
    // to serve under the OOXML content type — Word and `unzip` both rejected that file.
    const buffer = await generateDocxBuffer(docData);
    // Named after the document, not the clock: two exports of one document produced two
    // differently-named files, which read like two different documents.
    const filename = `${type}${partId ? `_${partId}` : ''}.docx`;

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  }

  // PDF / HTML Print format
  const html = generatePdfHtml(docData);
  return new NextResponse(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
    },
  });
}
