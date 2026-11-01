/**
 * Narrowing helpers for values caught in a `catch` block.
 *
 * TypeScript types a caught value as `unknown` under `strict`, so every
 * `catch (e) { … e.message … }` needs a narrowing step. Writing `catch (e: any)`
 * skips that step and silently opts the whole block out of type checking —
 * banned by CLAUDE.md. These helpers do the narrowing once so call sites stay
 * short.
 */

/**
 * The message of a caught value, or `fallback` when it carries none.
 *
 * Accepts both real `Error`s and the message-shaped objects some drivers throw
 * (`pg`, `undici`), so it reports the same string the old `e.message` did for
 * every value that actually had one. An empty message counts as absent, so
 * `errorMessage(e, 'Import failed')` behaves exactly like the `e.message ||
 * 'Import failed'` it replaces.
 */
export function errorMessage(error: unknown, fallback = 'Unknown error'): string {
  return rawMessage(error) || fallback;
}

/** The message carried by a caught value, or `''` when it carries none. */
function rawMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as { message: unknown }).message === 'string'
  ) {
    return (error as { message: string }).message;
  }
  return '';
}

/** The `code` a caught value carries (Prisma `P2002`, pg `23505`, Node `ENOENT`), if any. */
export function errorCode(error: unknown): string | undefined {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof (error as { code: unknown }).code === 'string'
  ) {
    return (error as { code: string }).code;
  }
  return undefined;
}

/** The numeric HTTP `status` a caught value carries (SDK errors), if any. */
export function errorStatus(error: unknown): number | undefined {
  if (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    typeof (error as { status: unknown }).status === 'number'
  ) {
    return (error as { status: number }).status;
  }
  return undefined;
}

/** Reads one arbitrary property off a caught value without widening it to `any`. */
export function errorProperty(error: unknown, key: string): unknown {
  if (typeof error === 'object' && error !== null && key in error) {
    return (error as Record<string, unknown>)[key];
  }
  return undefined;
}

/**
 * The `digest` Next.js stamps on the control-flow errors it throws from
 * `redirect()` and `notFound()`. Catch blocks read it to tell a real failure
 * apart from a redirect that must be rethrown.
 */
export function errorDigest(error: unknown): string | undefined {
  if (
    typeof error === 'object' &&
    error !== null &&
    'digest' in error &&
    typeof (error as { digest: unknown }).digest === 'string'
  ) {
    return (error as { digest: string }).digest;
  }
  return undefined;
}

/**
 * True when the caught value is the control-flow error `redirect()` throws.
 *
 * Next.js signals a redirect by throwing, so a `try/catch` around a server
 * action swallows it unless the block lets this one through. The marker lands
 * on `digest` in a Server Component and on `message` when the error crosses the
 * server-action boundary, so both are checked.
 */
export function isNextRedirectError(error: unknown): boolean {
  return (
    (errorDigest(error)?.includes('NEXT_REDIRECT') ?? false) ||
    (error instanceof Error && error.message.includes('NEXT_REDIRECT'))
  );
}
