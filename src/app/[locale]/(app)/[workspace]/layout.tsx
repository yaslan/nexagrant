import React from 'react';
import { notFound } from 'next/navigation';
import { auth } from '@/lib/auth';
import { tenantScopeOf } from '@/lib/tenant';
import { WORKSPACE_ALIAS, normalizeWorkspaceSlug, resolveScopedWorkspace } from '@/lib/workspaces';

/**
 * The one check that the `[workspace]` URL segment names a workspace this session
 * may use (TASK-MUUS62C4SC7H5).
 *
 * It sits here and not in `(app)/layout.tsx` on purpose. A layout only receives the
 * params of its own segment and the ones above it: the shell layout is above
 * `[workspace]`, so `params.workspace` is always undefined there. A guard placed in
 * the shell read the `default` fallback on every request, resolved it to the
 * tenant's real slug and redirected every page — the user's own workspace included —
 * to `/<locale>/<slug>`, which has no page (measured: 307 → 404).
 *
 * - a segment outside the slug grammar → 404;
 * - `default` is the alias the app links to when it does not know the workspace
 *   (AuthCard landing, old card links); pages already resolve it, so it passes;
 * - any other slug must be a live workspace of the session's tenant that the
 *   membership covers (`workspaceIds` empty = all), or it is 404. Not a redirect:
 *   a layout does not know the rest of the path, and silently swapping the user into
 *   another workspace is the confusion this guard removes.
 *
 * The shell layout above has already sent a signed-out request to the login page.
 */
export default async function WorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string; workspace: string }>;
}) {
  const { workspace } = await params;
  const slug = normalizeWorkspaceSlug(workspace);
  if (!slug) notFound();

  if (slug !== WORKSPACE_ALIAS) {
    const scope = tenantScopeOf(await auth());
    if (!scope || !(await resolveScopedWorkspace(scope, slug))) notFound();
  }

  return <>{children}</>;
}
