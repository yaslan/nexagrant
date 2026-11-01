---
name: fabrika-nonnull-assertion-cannot-target-compound-assignment
description: Under noUncheckedIndexedAccess, `arr[i]! ^= x` (or += , |= , etc.) does not compile — non-null assertion cannot be the direct target of a compound assignment; rewrite as `arr[i] = arr[i]! ^ x`
metadata:
  type: feedback
---

`arr[i]! op= x` (compound assignment — `^=`, `+=`, `\|=`, `&=`, ...) is a TypeScript syntax
error: "Invalid left-hand side of assignment expression." The `!` non-null assertion produces an
expression, not an assignable reference, so it cannot itself be a compound-assignment target —
even though `obj.prop!.field = x` (assertion on an intermediate object, final target a plain
property access) compiles fine.

**Fix:** expand the compound assignment into a plain one, applying `!` only on the read side:
`arr[i] = arr[i]! ^ x`. This is a pure syntax workaround — same runtime behavior, and a plain
`arr[i] = ...` write is never flagged by `noUncheckedIndexedAccess` in the first place (only
reads are checked), so no assertion is needed on the left side at all.

**Why this matters:** this shape is common in exactly the kind of code that trips
`noUncheckedIndexedAccess` hardest — fixed-size-array algorithms with tight index arithmetic
(hash/crypto permutation rounds, bit-manipulation loops, running accumulators) where every index
is provably in bounds by a size constant, so `!` is the correct (not lazy) fix. Hit this in
TASK-MTVPOBU1CQATT (`scripts/verify-deployed-bytecode.ts`'s Keccak-256 permutation — `state[i] ^=
...`, `S[i] ^= D[i % 5]`, etc., ~10 occurrences in one function).

**How to apply:** when narrowing a `noUncheckedIndexedAccess` slice and you meet `arr[idx] op=
expr` where `idx` is provably safe, don't reach for `arr[idx]! op= expr` (it won't compile) —
write `arr[idx] = arr[idx]! op expr` instead, with the usual one-line comment explaining why the
index is safe. See [[fabrika-measure-a-global-compiler-flag-with-a-sibling-config]] for how to
measure such a slice without touching the shared `tsconfig.json`.
