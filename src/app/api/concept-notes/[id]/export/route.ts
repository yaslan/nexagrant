import { NextResponse } from 'next/server';
import { withTenant } from '@/lib/db';
import { findAccessibleTemplate, templateSections } from '@/modules/m2/server/templates';
import { auth } from '@/lib/auth';
import HTMLtoDOCX from 'html-to-docx';

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

  // Build the HTML document
  let htmlString = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <title>${template.name}</title>
    </head>
    <body>
        <h1>${template.name}</h1>
        <h2>Opportunity: ${opportunity?.title || 'Untitled'}</h2>
        <hr />
  `;

  for (const section of sections) {
    htmlString += `<h3>${section.labelKey}</h3>`;
    htmlString += `<div>${content[section.key] || '<p>No content provided.</p>'}</div>`;
    htmlString += `<br />`;
  }

  htmlString += `</body></html>`;

  // Convert HTML to DOCX buffer
  const fileBuffer = await HTMLtoDOCX(htmlString, null, {
    table: { row: { cantSplit: true } },
    footer: true,
    pageNumber: true,
  });

  // Return the file
  return new NextResponse(fileBuffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="${opportunity?.title || 'ConceptNote'}.docx"`,
    },
  });
}
