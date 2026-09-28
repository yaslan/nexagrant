/**
 * Runs once when the server starts (`next dev`, `next start` and the standalone
 * server alike), before any request is served.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { assertAuthSecretConfigured } = await import('./lib/auth-secret');
  assertAuthSecretConfigured();
}
