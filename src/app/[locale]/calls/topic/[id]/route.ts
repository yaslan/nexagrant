import { NextResponse, type NextRequest } from 'next/server';

import { auth } from '@/lib/auth';
import { tenantScopeOf } from '@/lib/tenant';
import { resolveScopedWorkspace } from '@/lib/workspaces';
import { routing } from '@/i18n/routing';
import { callTopicTarget, MAX_TOPIC_ID_LENGTH, type CallTopicVisitor } from './target';

/**
 * The public /calls cards' "details" link (src/lib/routes.ts
 * `publicCallDetailHref`). TASK-MUO12A7NHANOT, İNCELEME-76 Y-1.
 *
 * The call detail lives inside a workspace, and a public page does not know
 * which one. The cards used to link `/[locale]/default/cagrilar/<id>` for
 * everyone, and "Add to pipeline" there wrote into whatever `default` resolved
 * to — outside the user's membership, or into a soft-deleted workspace. This
 * handler asks the session instead and redirects; it reads nothing else and
 * writes nothing.
 *
 * Owner decision (30.09): the cards go to the signed-in detail, so a signed-out
 * visitor is sent to sign in first, with this route as the way back.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  if (!(routing.locales as readonly string[]).includes(locale) || !id || id.length > MAX_TOPIC_ID_LENGTH) {
    return new NextResponse(null, { status: 404 });
  }

  const visitor = await visitorOf();
  const res = NextResponse.redirect(new URL(callTopicTarget(locale, id, visitor), req.url), 307);
  // The target depends on who is asking.
  res.headers.set('Cache-Control', 'private, no-store');
  return res;
}

async function visitorOf(): Promise<CallTopicVisitor> {
  const session = await auth();
  if (!session?.user) return { kind: 'signed-out' };
  const scope = tenantScopeOf(session);
  if (!scope) return { kind: 'no-workspace' };
  const workspace = await resolveScopedWorkspace(scope, null);
  return workspace ? { kind: 'member', workspaceSlug: workspace.slug } : { kind: 'no-workspace' };
}
