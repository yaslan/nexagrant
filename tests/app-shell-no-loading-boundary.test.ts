import fs from 'fs';
import path from 'path';
import { describe, it, expect } from 'vitest';

const REPO_ROOT = path.resolve(__dirname, '..');
const APP_SHELL = path.join(REPO_ROOT, 'src/app/[locale]/(app)');

/**
 * TASK-MTU4AYW5R9DGL — no `loading.tsx` anywhere under `(app)`.
 *
 * A route-level `loading.tsx` is a Suspense boundary, and the boundary makes
 * Next flush the shell before the page has decided what it is. Two defects came
 * out of that, and only the first was visible from a status code:
 *
 *   • `notFound()` under the shell answered 200, because the status line had
 *     already gone out with the shell (TASK-MTRNO3LBZB2Q7). Moving the skeleton
 *     down to the sections with no `[param]` child fixed that one.
 *   • The page then streams out of order: the server parks the whole rendered
 *     page in a `<div hidden id="S:0">` at the end of <body> while the client
 *     renders the same subtree in place. For a few hundred milliseconds the
 *     document holds two elements for every id — `#dashboard-panel-overview`
 *     twice, every empty-state heading twice — which is what made seven e2e
 *     specs fail on Playwright's strict mode. It reproduces on a production
 *     build as well as on `next dev`, and it outlives the `load` event.
 *
 * So the boundary is not relocated again, it is gone. This test is the thing
 * that notices if one comes back; `tests/e2e/notfound-status.spec.ts` is the
 * other half, measuring the status codes in a real browser.
 */
function loadingFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...loadingFiles(full));
    } else if (/^loading\.(tsx?|jsx?)$/.test(entry.name)) {
      found.push(path.relative(REPO_ROOT, full));
    }
  }
  return found;
}

describe('the workspace app shell', () => {
  it('carries no route-level Suspense boundary', () => {
    expect(
      loadingFiles(APP_SHELL),
      'a loading.tsx under (app) flushes the shell early: it turns notFound() into 200 and leaves a hidden duplicate of the whole page in the DOM',
    ).toEqual([]);
  });
});
