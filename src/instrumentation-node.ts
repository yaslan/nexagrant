/**
 * Node.js-only startup checks. Loaded from `register()` in src/instrumentation.ts
 * only when NEXT_RUNTIME is 'nodejs'. It lives in its own module so the Edge
 * compiler never sees `process.exit` (NG-230: "Node.js API used in Edge Runtime").
 */
export async function registerNode() {
  const { assertAuthSecretConfigured } = await import('./lib/auth-secret');
  try {
    assertAuthSecretConfigured();
    // Imported inside the try: loading it validates the environment (src/lib/env.ts),
    // and an invalid DEMO_LOGIN_ENABLED has to stop the server the same way.
    const { assertDemoLoginAllowed } = await import('./lib/demo-login');
    assertDemoLoginAllowed();
    // NG-209: the e2e fake LLM provider runs only on a development or test server (default-deny).
    const { assertFakeAiAllowed } = await import('./lib/llm');
    assertFakeAiAllowed();
  } catch (error) {
    // Throwing here only logs: Next keeps listening and answers every request
    // with a 500, which a port health check reads as a running server. Exit.
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
  // A warning, not an exit: a wrong NEXT_PUBLIC_APP_URL breaks links, not the app.
  const { reportAppUrlProblem } = await import('./lib/app-url-alert');
  await reportAppUrlProblem();
  // NG-104 Ö-2: a warning only. Opt-out links still work on the session key.
  const { optOutSecretFallbackWarning } = await import('./lib/email/opt-out-secret');
  const optOutWarning = optOutSecretFallbackWarning();
  if (optOutWarning) {
    const { logger } = await import('./lib/logger');
    logger.warn(optOutWarning);
  }
}
