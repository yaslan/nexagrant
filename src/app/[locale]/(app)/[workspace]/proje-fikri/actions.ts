'use server';

import { revalidatePath } from 'next/cache';
import { ZodError } from 'zod';
import { requireTenantAction } from '@/lib/tenant';
import { createProjectIdea, type ProjectIdeaInput, type ProjectIdeaView } from '@/lib/project-ideas/records';
import { dedupeKeywords, validateProjectIdea } from '@/lib/project-ideas/validate';

// Route pattern as Next matches it: the `(app)` group is not part of the URL.
const PROJECT_IDEA_PATH = '/[locale]/[workspace]/proje-fikri';

export type SaveProjectIdeaResult =
  | { ok: true; idea: ProjectIdeaView }
  | { ok: false; code: 'invalid' };

/**
 * Saves one project idea (NG-14 → NG-38 / BE-05). The write is `createProjectIdea`'s: it
 * validates the shape with the zod schema, runs inside `withTenant` and writes an audit row.
 * The form's rules (validate.ts) run first, so a direct call cannot store what the form
 * refuses: a program outside the list, more keywords than the form allows, and so on.
 * Anything refused answers `invalid` and nothing is written. A role without
 * `edit_proposal` is refused by `requireTenantAction` before the body runs.
 */
export async function saveProjectIdea(input: ProjectIdeaInput): Promise<SaveProjectIdeaResult> {
  const scope = await requireTenantAction({ can: 'edit_proposal' });
  const keywords = dedupeKeywords(Array.isArray(input.keywords) ? input.keywords : []);
  const check = validateProjectIdea({
    title: typeof input.title === 'string' ? input.title : '',
    summary: typeof input.summary === 'string' ? input.summary : '',
    keywords,
    trl: typeof input.trl === 'number' ? input.trl : null,
    targetPrograms: Array.isArray(input.targetPrograms) ? input.targetPrograms : [],
  });
  if (!check.ok) return { ok: false, code: 'invalid' };
  try {
    const idea = await createProjectIdea(
      { tenantId: scope.tenantId, userId: scope.userId },
      { ...input, keywords },
    );
    revalidatePath(PROJECT_IDEA_PATH, 'page');
    return { ok: true, idea };
  } catch (err) {
    if (err instanceof ZodError) return { ok: false, code: 'invalid' };
    throw err;
  }
}
