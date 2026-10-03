/**
 * Honest identity display.
 *
 * The app frame used to invent an identity when the session carried no name:
 * `user.name || (email?.includes('ayse') ? 'Prof. Dr. Ayşe Kaya' : 'Dr. Mehmet Yılmaz')`.
 * A nameless account was therefore shown somebody ELSE's name and academic title, and a
 * screenshot of the app named the wrong person. Never guess who the user is: fall back
 * only onto data the session actually carries, and when it carries nothing, say so.
 */

/** Local part of an e-mail address ("ayse@fabrika.app" -> "ayse"), or null. */
export function emailLocalPart(email?: string | null): string | null {
  const at = email?.indexOf('@') ?? -1;
  if (at <= 0) return null;
  const local = email!.slice(0, at).trim();
  return local || null;
}

/**
 * What to show as the user's name.
 * Order: the real name -> the e-mail local part -> the caller's translated
 * "unnamed user" label. No invented names, no invented titles.
 */
export function displayUserName(
  name: string | null | undefined,
  email: string | null | undefined,
  unnamedLabel: string
): string {
  const trimmed = name?.trim();
  if (trimmed) return trimmed;
  return emailLocalPart(email) ?? unnamedLabel;
}

/**
 * What to show as the user's role.
 * If the session carries no role, show the caller's translated "unassigned"
 * label. Never invent a role (e.g., "TENANT_OWNER" as a fallback).
 */
export function displayRoleName(
  role: string | null | undefined,
  unassignedLabel: string
): string {
  const trimmed = role?.trim();
  return trimmed || unassignedLabel;
}
