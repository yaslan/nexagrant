import { NextResponse } from 'next/server';
import { withTenant } from '@/lib/db';
import { findAccessibleTemplate, templateSections } from '@/modules/m2/server/templates';
import { auth } from '@/lib/auth';
import HTMLtoDOCX from 'html-to-docx';
import { escapeHtmlText, MAX_TOTAL_IMAGE_BYTES, sanitizeHtmlForDocx } from '@/lib/docx-safe-html';
import { attachmentContentDisposition } from '@/lib/content-disposition';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await auth();
  const tenantId = session?.tenantId;

  if (!tenantId) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  // Both tenant-scoped reads share one scope. The `conceptTemplate` lookup
  // below is outside it, but it is no longer unfiltered: that comment used to
  // say templates "carry no `tenantId` column and no RLS policy", and both
  // halves were wrong — `ConceptTemplate.tenantId` is `String?` and the table
  // carries `tenant_or_shared` (prisma/rls.sql:44). A NULL means "platform
  // template"; a non-NULL row belongs to one tenant. `findAccessibleTemplate`
  // applies that rule (TASK-MTVTU103F11XJ).
  const found = await withTenant(tenantId, async (tx) => {
    const note = await tx.conceptNote.findFirst({
      where: { id, tenantId },
    });

    if (!note) return null;

    // ConceptNote.opportunityId has no `opportunity` relation in the Prisma
    // schema — fetch it separately rather than `include: { opportunity: true }`,
    // which throws PrismaClientValidationError.
    const opportunity = await tx.opportunity.findFirst({
      where: { id: note.opportunityId, tenantId },
      select: { title: true },
    });

    return { note, opportunity };
  });

  if (!found) {
    return new NextResponse('Not Found', { status: 404 });
  }

  const { note, opportunity } = found;

  const template = await findAccessibleTemplate(note.templateId, tenantId);

  if (!template) {
    return new NextResponse('Template Not Found', { status: 404 });
  }

  const sections = templateSections(template.schema);
  const content = note.content as Record<string, string>;

  // Every interpolated value is tenant-written. html-to-docx downloads any
  // `<img src="http(s)://…">` from this server, so raw HTML here was a
  // server-side request forgery (TASK-MUN80RJ96EG0O): names/titles are
  // escaped as text and section bodies are rebuilt from an allowlist that
  // lets no URL through as an image source. One image budget per document.
  const templateName = escapeHtmlText(template.name);
  const buildHtml = (imageBudget: { remaining: number }) => {
    let htmlString = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <title>${templateName}</title>
    </head>
    <body>
        <h1>${templateName}</h1>
        <h2>Opportunity: ${escapeHtmlText(opportunity?.title || 'Untitled')}</h2>
        <hr />
  `;

    for (const section of sections) {
      htmlString += `<h3>${escapeHtmlText(section.labelKey)}</h3>`;
      const body = content[section.key];
      htmlString += `<div>${typeof body === 'string' && body ? sanitizeHtmlForDocx(body, imageBudget) : '<p>No content provided.</p>'}</div>`;
      htmlString += `<br />`;
    }

    return htmlString + `</body></html>`;
  };
  const toDocx = (html: string) =>
    HTMLtoDOCX(html, null, {
      table: { row: { cantSplit: true } },
      footer: true,
      pageNumber: true,
    });

  // `safeInlineImageSrc` only keeps images the bundled image-size can size
  // (TASK-MUNDTW8O2IV6V B-2). If one still makes html-to-docx throw, the note
  // is exported once more without images rather than failing with a 500.
  let fileBuffer: Awaited<ReturnType<typeof toDocx>>;
  try {
    fileBuffer = await toDocx(buildHtml({ remaining: MAX_TOTAL_IMAGE_BYTES }));
  } catch (error) {
    console.warn('[concept-note export] retrying without images:', error instanceof Error ? error.message : error);
    fileBuffer = await toDocx(buildHtml({ remaining: 0 }));
  }

  // Return the file
  return new NextResponse(fileBuffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      // The title is user text; a raw non-Latin-1 letter (ı, ş, ğ) made this a 500 (B-3).
      'Content-Disposition': attachmentContentDisposition(opportunity?.title ?? '', '.docx', 'ConceptNote'),
    },
  });
}
