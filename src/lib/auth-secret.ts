import { createHash } from 'crypto';

/**
 * The session-signing key check that runs once at server start
 * (src/instrumentation.ts).
 *
 * src/lib/auth.ts used to fall back to a literal when AUTH_SECRET was unset.
 * That literal is in the git history, so it is not a secret: anyone with the
 * repository could sign a session JWT for any user, platform admin included.
 * Auth.js itself only notices a missing secret on the first auth request; this
 * check makes the server refuse to start instead (TASK-MULRTOTG9IKIM).
 */

/**
 * SHA-256 of signing keys that have been committed and must never be used
 * again. Only the digest is kept here, never the value.
 */
const RETIRED_SECRET_SHA256: ReadonlySet<string> = new Set([
  '9804925c2dce837b4e7516f2ac5b227ad73772013fa4b34d1f72202f765b47bb',
]);

/**
 * What `openssl rand -base64 32` prints is 44 characters; anything under 32 is
 * guessable or a placeholder (`x`, `secret`, `change-me`) and is refused like an
 * unset key (TASK-MULU7GVFBTRXX K-3).
 */
export const MIN_AUTH_SECRET_LENGTH = 32;

export class AuthSecretNotConfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthSecretNotConfiguredError';
  }
}

/**
 * @param retired SHA-256 digests to refuse; a parameter only so the test can
 *   prove the refusal with a digest of its own instead of the real retired key.
 */
export function assertAuthSecretConfigured(
  source: Record<string, string | undefined> = process.env,
  retired: ReadonlySet<string> = RETIRED_SECRET_SHA256
): void {
  const secret = source.AUTH_SECRET || source.NEXTAUTH_SECRET;
  if (!secret || secret.trim() === '') {
    throw new AuthSecretNotConfiguredError(
      'AUTH_SECRET is not set. Generate one with `openssl rand -base64 32` and put it in the environment; the server will not start without a session-signing key.'
    );
  }
  if (secret.trim().length < MIN_AUTH_SECRET_LENGTH) {
    throw new AuthSecretNotConfiguredError(
      `AUTH_SECRET is too short (under ${MIN_AUTH_SECRET_LENGTH} characters). Generate one with \`openssl rand -base64 32\`; the server will not start with a guessable session-signing key.`
    );
  }
  const digest = createHash('sha256').update(secret).digest('hex');
  if (retired.has(digest)) {
    throw new AuthSecretNotConfiguredError(
      'AUTH_SECRET is a retired key that is published in the git history. Rotate it with `openssl rand -base64 32`.'
    );
  }
}
