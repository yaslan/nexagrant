/**
 * M2 concept-note row shapes.
 *
 * `prisma generate` does not run in this repo (see
 * src/types/prisma-override.d.ts), so query results arrive untyped. These are
 * the shapes the concept-note screens and actions read, mirroring
 * prisma/schema.prisma.
 */

/**
 * One section of a ConceptTemplate. The template's `schema` Json column holds
 * either a bare `ConceptTemplateSection[]` or `{ sections: [...] }`; read it
 * through `templateSections` (src/modules/m2/server/templates.ts), which
 * accepts both and drops malformed elements.
 */
export interface ConceptTemplateSection {
  key: string;
  labelKey: string;
  maxWords: number;
  promptKey?: string;
}

/** `ConceptTemplate.schema`. */
export interface ConceptTemplateSchema {
  sections: ConceptTemplateSection[];
}

/** `ConceptNote.content`: the drafted markdown, keyed by section. */
export type ConceptNoteContent = Record<string, string>;

/** `model ConceptTemplate` — platform or tenant catalogue entry. */
export interface ConceptTemplateRow {
  id: string;
  key: string;
  name: string;
  version: string;
  schema?: ConceptTemplateSchema;
}

/** `model ConceptNote`. */
export interface ConceptNoteRow {
  id: string;
  opportunityId: string;
  templateId: string;
  content: ConceptNoteContent;
  status: string;
  version: number;
  updatedAt: Date | string;
}
