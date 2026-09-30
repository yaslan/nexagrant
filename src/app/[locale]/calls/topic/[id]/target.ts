import { getPublicRoute, getWorkspaceRoute, publicCallDetailHref } from '@/lib/routes';

/** Longer than any SEDIA topic identifier; anything past this is not one. */
export const MAX_TOPIC_ID_LENGTH = 200;

export type CallTopicVisitor =
  | { kind: 'signed-out' }
  | { kind: 'no-workspace' }
  | { kind: 'member'; workspaceSlug: string };

/**
 * Where `/[locale]/calls/topic/[id]` sends a visitor (TASK-MUO12A7NHANOT,
 * İNCELEME-76 Y-1). Pure, so every branch is unit tested; the route handler
 * only works out which visitor it has.
 *
 * - signed out → sign-in, returning to THIS route, not to a workspace URL: the
 *   workspace is not known until there is a session;
 * - signed in, no live workspace in the membership → /no-workspace;
 * - otherwise → the call detail in the workspace the server picked.
 */
export function callTopicTarget(locale: string, id: string, visitor: CallTopicVisitor): string {
  const encoded = encodeURIComponent(id);
  switch (visitor.kind) {
    case 'signed-out':
      return `${getPublicRoute('login', locale)}?callbackUrl=${encodeURIComponent(publicCallDetailHref(locale, id))}`;
    case 'no-workspace':
      return `/${locale}/no-workspace`;
    case 'member':
      return getWorkspaceRoute('callDetail', locale, visitor.workspaceSlug, encoded);
  }
}
