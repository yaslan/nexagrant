## FO-96 · TASK-MVF543TDDDMX1 — FO-18b: override rows for the older lines

PR #117 (FO-18) bounded every security override to its own major. Older lines that dev's open selectors used to move were left with no row at all. This PR adds those rows back, one per line, classified from the GitHub advisory data (`gh api /advisories?ecosystem=npm&affects=<pkg>`):

| Line | Row | Kind | GHSA |
|---|---|---|---|
| undici 6.x | `'undici@>=6.0.0 <6.28.1': '6.28.1'` | same line | rfgv-xxqx-mfg5, 3wwx-pv8p-q78v, r53p-7pc4-xj5r |
| undici ≤5.x | `'undici@<6.0.0': '6.28.1'` | cross-major | vxpw-j846-p89q (high, <6.27.0), vrm6-8vpv-qv8q (high, <6.24.0) |
| hono 0.x–2.x | `'hono@<3.0.0': '4.13.7'` | cross-major | m732-5p4w-x69g, 88fw-hqm2-52qc |
| @hono/node-server 2.x | `'@hono/node-server@>=2.0.0 <2.0.10': '2.0.10'` | same line | 9mqv-5hh9-4cgg, frvp-7c67-39w9 |
| @hono/node-server 0.x | `'@hono/node-server@<1.0.0': '1.19.15'` | cross-major | wc8c-qw6v-h7f6, frvp-7c67-39w9 |
| @modelcontextprotocol/sdk 0.x | `'@modelcontextprotocol/sdk@<1.0.0': '1.31.0'` | cross-major | w48q-cv73-mx4w |
| mysql2 1.x/2.x | `'mysql2@<3.0.0': '3.23.1'` | cross-major | 3f6p-5ww8-9rcr, 4rch-2fh8-94vw (critical) |
| sharp ≤0.33 | `'sharp@<0.34.0': '0.35.5'` | cross-line | f88m-g3jw-g9cj |
| fast-uri 0.x/1.x | `'fast-uri@<2.0.0': '2.4.7'` | cross-major | hrr3-gc8f-f4qj, qw65-cvwx-89v3 |
| ip-address ≤9.x | `'ip-address@<10.0.0': '10.7.1'` | cross-major | h3mg-xc3c-68pw, j6r3-76f7-8jcv |
| postcss-selector-parser ≤6.x | `'postcss-selector-parser@<7.0.0': '7.1.6'` | cross-major | rj75-hqrm-r3gf |
| brace-expansion 2.x / 3.x | `>=2.0.0 <2.1.7` → 2.1.7, `>=3.0.0 <3.0.9` → 3.0.9 | same line | q2hr-2g5m-vwhr, qhr7-859c-m2p7, 6j4f-fj2g-mc7p |

**Differences from the card**
- **undici 5.x is cross-major, not `5.29.0`.** Several advisories (vxpw: high, <6.27.0; vrm6/v9p9: high, <6.24.0) have no 5.x patch, so 5.29.0 is still vulnerable. Following the yaml's own rule, a line with no patch of its own gets a bounded cross-major row. The `undici <5` row folds into the same row.
- **brace-expansion 1.x is a reasoned exception (no row).** The lock holds `brace-expansion@1.1.18`, which is dev only (eslint → minimatch@3) and outside the prod audit. A `<1.1.21` row would change the lockfile packages, and the card forbids that ("no version bump, packages byte-identical"). A follow-up decision is in the report.

**Lockfile:** only the `overrides:` block changes. The `importers:` and `packages:` sections are byte-identical to dev (md5 `711d8d73…` / `e952e8af…` on both sides).

**Test:** the new cross-major keys are added to `CROSS_MAJOR`. A new `upperAbovePin` check rejects any row whose `<` bound is missing or above its pin, cross-major rows included. Mutant M2 changes `<6.28.1`→`<6.30.0`, `undici@<6.0.0`→`<7.0.0` and `mysql2@<3.0.0`→`>=1.0.0`; all three are caught.

**Selector experiment** (a local `file:` dep pulling postcss-selector-parser 6.1.2, undici 6.20.0, ip-address 9.0.5, mysql2 2.3.3, brace-expansion 2.0.1):
```
pre-#117 (9166a99d): psp 7.1.6, undici 7.29.1 (silent 6→7 jump), ip 10.7.1, mysql2 3.23.1, brace 2.0.1
dev (80271979):      psp 6.1.2, undici 6.20.0, ip 9.0.5, mysql2 2.3.3, brace 2.0.1   (all unpatched)
this PR:             psp 7.1.6, undici 6.28.1 (own line), ip 10.7.1, mysql2 3.23.1, brace 2.1.7
```

**Checks**
- [x] `CI=true pnpm install --frozen-lockfile`: exit 0
- [x] `pnpm audit --prod` before and after are identical (1 high: braces, GHSA-vfj7-8cjw-p6xm)
- [x] `pnpm lint`: 0 errors (4 pre-existing warnings in files this PR does not touch); `pnpm typecheck`: exit 0; `pnpm build`: exit 0
- [x] `tests/pnpm-overrides-same-major.test.ts`: 6/6
- [x] Pre-push `pnpm gate` (see the report for the result)
- Platform: verified on macOS. The overrides block and the resolution are platform independent (pnpm resolves overrides before fetching; the lock has no per-OS entries for these packages).

Not merged; base `dev`.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
