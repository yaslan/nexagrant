'use server';

import { revalidatePath } from 'next/cache';
import { ZodError } from 'zod';
import { requireTenantAction } from '@/lib/tenant';
import { createProjectIdea, type ProjectIdeaInput, type ProjectIdeaView } from '@/lib/project-ideas/records';

const PROJECT_IDEA_PATH = '/[locale]/(app)/[workspace]/proje-fikri';

export type SaveProjectIdeaResult =
  | { ok: true; idea: ProjectIdeaView }
  | { ok: false; code: 'invalid' };

/**
 * Saves one project idea (NG-14 → NG-38 / BE-05). The write is `createProjectIdea`'s: it
 * validates the shape with the zod schema, runs inside `withTenant` and writes an audit row.
 * A shape the schema refuses answers `invalid` and nothing is written. A role without
 * `edit_proposal` is refused by `requireTenantAction` before the body runs.
 */
export async function saveProjectIdea(input: ProjectIdeaInput): Promise<SaveProjectIdeaResult> {
  const scope = await requireTenantAction({ can: 'edit_proposal' });
  try {
    const idea = await createProjectIdea({ tenantId: scope.tenantId, userId: scope.userId }, input);
    revalidatePath(PROJECT_IDEA_PATH, 'page');
    return { ok: true, idea };
  } catch (err) {
    if (err instanceof ZodError) return { ok: false, code: 'invalid' };
    throw err;
  }
}
