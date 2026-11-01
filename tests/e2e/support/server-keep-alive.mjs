// Preloaded into the e2e web server only (playwright.config.ts, webServer NODE_OPTIONS --import).
//
// Why (FO-199): the specs' API calls (signInAs's GET /api/auth/session, page.request,
// the `request` fixture) all go through ONE keep-alive agent inside the Playwright
// worker, so a socket from one call is reused by the next, often in the next test.
// Node's HTTP server closes a keep-alive socket after it has been idle for
// keepAliveTimeout (5 s, plus Node's 1 s buffer). When the next call is sent on
// that socket at the moment the server closes it, the call dies with
// `read ECONNRESET` / `socket hang up` — a race the client cannot see coming.
// Measured: a GET sent ~6.0 s after the previous one on a `next dev` server
// fails; 5.99 s and 6.01 s do not (docs/agent-results/FO-199-fe-fb.md).
//
// `next dev` has no --keepAliveTimeout flag, so this sets it here: 0 = the
// server never closes an idle keep-alive connection; the client decides. That
// removes the server side of the race. Request handling is unchanged.
// Rollback: delete this file and its NODE_OPTIONS line in playwright.config.ts.
import diagnosticsChannel from 'node:diagnostics_channel';

diagnosticsChannel.subscribe('http.server.request.start', ({ server }) => {
  if (server.keepAliveTimeout !== 0) server.keepAliveTimeout = 0;
});
