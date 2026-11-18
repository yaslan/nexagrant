/**
 * Runs once when the server starts (`next dev`, `next start` and the standalone
 * server alike), before any request is served. The Node-only checks live in
 * instrumentation-node.ts so the Edge compile of this file stays clean (NG-230).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { registerNode } = await import('./instrumentation-node');
  await registerNode();
}
