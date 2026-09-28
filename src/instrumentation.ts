/**
 * Runs once when the server starts (`next dev`, `next start` and the standalone
 * server alike), before any request is served.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { assertAuthSecretConfigured } = await import('./lib/auth-secret');
  try {
    assertAuthSecretConfigured();
  } catch (error) {
    // Throwing here only logs: Next keeps listening and answers every request
    // with a 500, which a port health check reads as a running server. Exit.
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
