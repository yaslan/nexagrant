---
name: fabrika-prisma-namespace-type-not-importable
description: In this repo, `import { Prisma }` / `import type { Prisma }` from '@prisma/client' fails tsc with "has no exported member 'Prisma'" — use a hand-written local interface for WhereInput-shaped types instead
metadata:
  type: project
---

Neither `import { Prisma } from '@prisma/client'` nor `import type { Prisma } from '@prisma/client'`
compiles in this repo (`tsc --noEmit` → `TS2305: Module '"@prisma/client"' has no exported member
'Prisma'`), even though the generated `.prisma/client/index.d.ts` genuinely does contain
`export namespace Prisma { ... }` with e.g. `TopicWhereInput`, and the runtime import (`require`)
does expose `Prisma`. Reproduced in isolation with a throwaway file under `src/` and `tsc -p
tsconfig.json` — not a fluke of one call site.

Root cause not fully chased down, but `moduleResolution: "bundler"` + this project's `@prisma/client`
7.10.0 (peer-varies pnpm virtual-store duplication, at least two `@prisma+client@7.10.0_prisma@…`
variants) is the likely combination; `Parameters<typeof prisma.<model>.count>[0]` also resolves to
`{}` when extracted standalone, though calling the method directly with a literal argument still
type-checks fine structurally.

**How to apply:** don't fight this import. When a query needs a `Prisma.<Model>WhereInput`-shaped
type (e.g. building a `where` object across several `if` branches, which needs an explicit type or
TS narrows to the first assignment), hand-write a small local interface with just the fields you use
and pass the literal straight into the Prisma call — `prisma.topic.count({ where })` still validates
it structurally against the real generated type at the call site, so nothing is lost. See
`src/lib/inngest/jobs/alerts-daily.ts` (`TopicMatchWhere`) for the pattern. Before spending time on
this again, first check whether a newer `@prisma/client`/tsconfig has fixed it — this is an
environment quirk, not a permanent constraint.
