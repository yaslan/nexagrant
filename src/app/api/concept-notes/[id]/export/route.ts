import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
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

  const note = await prisma.conceptNote.findFirst({
    where: { id, tenantId },
  });

  if (!note) {
    return new NextResponse('Not Found', { status: 404 });
  }

  // ConceptNote.opportunityId has no `opportunity` relation in the Prisma
  // schema — fetch it separately rather than `include: { opportunity: true }`,
  // which throws PrismaClientValidationError.
  const opportunity = await prisma.opportunity.findFirst({
    where: { id: note.opportunityId, tenantId },
    select: { title: true },
  });

  const template = await prisma.conceptTemplate.findUnique({
    where: { id: note.templateId },
  });

  if (!template) {
    return new NextResponse('Template Not Found', { status: 404 });
  }

  const schema = template.schema as { sections: { key: string; labelKey: string }[] };
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

  for (const section of schema.sections) {
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
