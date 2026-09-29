import { NextResponse, type NextRequest } from "next/server";

import { takeRegistrationInviteRefusal } from "@/lib/agency/registration-invite-cookie";
import { OAUTH_SIGNIN_ERROR, oauthRefusalPath } from "@/lib/oauth-registration";

/**
 * Auth.js `pages.error` (İNCELEME-14 K-1, TASK-MUMAC8JELIZ5H). Auth.js sends
 * errors of kind "error" here as `?error=<type>`; they used to render its own
 * English page, a "server configuration" message for a registration that only
 * lost a race.
 *
 * - The adapter left a refusal note: the invite code died between the signIn
 *   probe and the adapter. Same message as a code the probe refused.
 * - Anything else: the login card, which shows the generic message for every
 *   code it does not know. Only a plain word is passed on.
 *
 * A static segment, so Next.js routes it here before the Auth.js catch-all.
 */
export async function GET(req: NextRequest) {
  const refusedLocale = await takeRegistrationInviteRefusal();
  if (refusedLocale) {
    const to = oauthRefusalPath(
      refusedLocale,
      "kayit",
      OAUTH_SIGNIN_ERROR.inviteInvalid,
    );
    return NextResponse.redirect(new URL(to, req.url), 302);
  }
  const raw = req.nextUrl.searchParams.get("error") ?? "";
  const code = /^[A-Za-z]{1,64}$/.test(raw) ? raw : "Configuration";
  return NextResponse.redirect(
    new URL(`/tr/giris?error=${code}`, req.url),
    302,
  );
}
