import type { TenantTx } from '@/lib/db';

/**
 * The text the M6 AI reader scores (NG-98). The opportunity's Part B when any of it is
 * written; otherwise its newest concept note with text, because a plan can grant M6
 * and M2 without M11 (src/lib/billing/catalog.ts).
 *
 * `null` means there is nothing to read. Blank sections are left out: an empty heading
 * would be read as a section the applicant chose to leave thin.
 */
export type ProposalSource = 'full_application' | 'concept_note';

export interface ProposalText {
  source: ProposalSource;
  text: string;
}

/** Bounds the scan; a tenant's notes for one opportunity are drafts of the same thing. */
const CONCEPT_NOTES_SCANNED = 20;

function section(heading: string, body: unknown): string | null {
  if (typeof body !== 'string' || body.trim() === '') return null;
  return `## ${heading}\n${body.trim()}`;
}

function joinSections(sections: Array<string | null>): string | null {
  const written = sections.filter((s): s is string => s !== null);
  return written.length > 0 ? written.join('\n\n') : null;
}

/**
 * `ApplicationPart.content` is an untyped JSON column owned by M11, and the module
 * boundary (NG-1) keeps its types out of here, so only the two fields used are read.
 */
function partBText(content: unknown): string | null {
  if (content === null || typeof content !== 'object') return null;
  const { sections } = content as { sections?: unknown };
  if (!Array.isArray(sections)) return null;
  return joinSections(
    sections.map((item: unknown) => {
      if (item === null || typeof item !== 'object') return null;
      const { title, content: body } = item as { title?: unknown; content?: unknown };
      return section(typeof title === 'string' ? title : '', body);
    }),
  );
}

function conceptNoteText(content: unknown): string | null {
  if (content === null || typeof content !== 'object' || Array.isArray(content)) return null;
  return joinSections(Object.entries(content).map(([key, body]) => section(key, body)));
}

export async function readProposalText(
  tx: TenantTx,
  tenantId: string,
  opportunityId: string,
): Promise<ProposalText | null> {
  const partB = await tx.applicationPart.findFirst({
    where: { tenantId, opportunityId, part: 'PART_B' },
    orderBy: { updatedAt: 'desc' },
    select: { content: true },
  });
  const fullText = partBText(partB?.content);
  if (fullText) return { source: 'full_application', text: fullText };

  const notes = await tx.conceptNote.findMany({
    where: { tenantId, opportunityId },
    orderBy: { updatedAt: 'desc' },
    take: CONCEPT_NOTES_SCANNED,
    select: { content: true },
  });
  for (const note of notes) {
    const text = conceptNoteText(note.content);
    if (text) return { source: 'concept_note', text };
  }
  return null;
}
