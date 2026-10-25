import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Not our source: nested git worktrees checked out by agents, and the
    // evidence scripts attached to task reports, and the untracked _workspace/
    // artefact folder. Mirrors the exclusions in vitest.config.mts.
    ".claude/worktrees/**",
    // A dev worktree nested at the repo root (the main checkout's .claude-fo49);
    // unignored it added 43 lint errors from someone else's tree.
    ".claude-fo49/**",
    "docs/agent-results/**",
    "_workspace/**",
    // Output of `pnpm test:e2e` (gitignored): bundled trace viewer JS and
    // screenshots. Lint must not read it; a local run with CI=true writes it.
    "playwright-report/**",
    "test-results/**",
    // Per-task scratch checkouts (FO-49 review copies); not part of the app.
    ".claude-fo49/**",
  ]),
  {
    files: ["**/*.ts", "**/*.tsx"],
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
  {
    // The cPanel startup file is CommonJS on purpose: Passenger loads `app.js`
    // with plain `require`, and its package.json declares no "type" (PR #28).
    files: ["deploy/cpanel/app.js"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  {
    // TASK-MUM033NPP7UFI — E2E runs against `next dev`, whose HMR websocket keeps
    // the page from ever going network-idle, so a `networkidle` wait is a race that
    // ends in a 60 s timeout on whichever spec loses it. Wait for what the test
    // needs instead: tests/e2e/fixtures/hydration.ts, a locator, or a response.
    files: ["tests/e2e/**/*.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "Literal[value='networkidle']",
          message:
            "Do not wait for 'networkidle' in E2E: next dev never goes idle (HMR websocket). Use expectHydrated() from tests/e2e/fixtures/hydration.ts, expect(locator), or page.waitForResponse() — docs/E2E_TESTING.md §3.4.",
        },
      ],
    },
  },
]);

export default eslintConfig;
