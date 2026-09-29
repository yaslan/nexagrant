/**
 * Runs once when the server starts (`next dev`, `next start` and the standalone
 * server alike), before any request is served.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { assertAuthSecretConfigured } = await import('./lib/auth-secret');
  try {
    assertAuthSecretConfigured();
    // Imported inside the try: loading it validates the environment (src/lib/env.ts),
    // and an invalid DEMO_LOGIN_ENABLED has to stop the server the same way.
    const { assertDemoLoginAllowed } = await import('./lib/demo-login');
    assertDemoLoginAllowed();
  } catch (error) {
    // Throwing here only logs: Next keeps listening and answers every request
    // with a 500, which a port health check reads as a running server. Exit.
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
