import { readdirSync } from "node:fs";
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// NexaGrant module boundary (NG-1). Every directory under src/modules is one
// module. A file inside module X may not import the internals of module Y,
// either through the `@/modules/Y/...` alias or through a relative path that
// climbs out of X into Y (`../Y/...`, `../../Y/...`, any depth). Same-module
// relative imports are not restricted. Module list is read from disk, so a new
// src/modules/<m> directory is covered without editing this file.
const moduleNames = readdirSync(new URL("./src/modules", import.meta.url), {
  withFileTypes: true,
})
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const moduleBoundaryMessage =
  "Modüller arası iç dosya importu yasak (NG-1 sınır kuralı). Başka modülün dosyasını doğrudan import etme (alias da göreli yol da); ortak kod src/lib altında olmalı ya da FONBRIDGE PR akışı (K-573059) ile karar verilmeli.";

const moduleBoundaryBlocks = moduleNames.map((own) => {
  const others = moduleNames.filter((other) => other !== own);
  const otherAlt = others.map(escapeRegex).join("|");
  // Relative path that climbs out of this module into another one:
  // `../m9/x`, `../../m9/x`, `./../m9/x`, `../../modules/m9/x` all match. The
  // depth is not fixed and the optional `modules/` segment is allowed. Same
  // module (`../<own>/x`, `./x`) and names such as `m90` do not match.
  const relativeIntoOther = `^(?:\\.{1,2}/)*\\.\\./(?:modules/)?(${otherAlt})(/|$)`;
  // Dynamic import() is an ImportExpression, which no-restricted-imports does
  // not see, so it is matched with no-restricted-syntax on the literal source.
  // The regex is the union of the two forms above. Slashes are escaped for the
  // esquery /regex/ literal.
  const dynamicSource = `^(?:@/modules/(?:${otherAlt})(?:/|$)|(?:\\.{1,2}/)*\\.\\./(?:modules/)?(?:${otherAlt})(?:/|$))`;
  const dynamicSelector = `ImportExpression > Literal[value=/${dynamicSource.replace(/\//g, "\\/")}/]`;
  return {
    files: [`src/modules/${own}/**/*.{ts,tsx}`],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              // Bare `@/modules/m9` (module entry) and `@/modules/m9/...`.
              group: others.flatMap((other) => [
                `@/modules/${other}`,
                `@/modules/${other}/**`,
              ]),
              message: moduleBoundaryMessage,
            },
            {
              regex: relativeIntoOther,
              message: moduleBoundaryMessage,
            },
          ],
        },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector: dynamicSelector,
          message: moduleBoundaryMessage,
        },
      ],
    },
  };
});

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
  ...moduleBoundaryBlocks,
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
