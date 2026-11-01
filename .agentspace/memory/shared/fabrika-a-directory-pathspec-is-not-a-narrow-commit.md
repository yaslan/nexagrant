---
name: fabrika-a-directory-pathspec-is-not-a-narrow-commit
description: Passing a DIRECTORY to git add/commit in this shared tree sweeps up neighbours' untracked files — narrow means one explicit file path per line, never a folder
metadata:
  type: project
updatedAt: 2026-09-10
---

Committing two memory notes with what looked like a narrow command:

```sh
git add -- .agentspace/memory/agents/geli-tirici .agentspace/memory/shared
git commit -m "..." -- .agentspace/memory/agents/geli-tirici .agentspace/memory/shared
```

produced a **29-file commit**. Four agents write into
`.agentspace/memory/shared/` concurrently, and 25 of their notes were sitting
untracked at that moment. The directory pathspec matched all of them, `git add`
staged them, and the pathspec commit then took them under the wrong author's
message.

**Why the usual safeguards did not fire:** the known guidance is about pathspec
*commits* not stealing a neighbour's **staged** change — and that part held. But
untracked files are a different case: a directory pathspec picks them up at
`git add` time, so by commit time they are indistinguishable from your own work.
`git diff --cached --name-only | grep -v "^<your dir>"` also passes cleanly here,
because the foreign files are inside the very directory you named — the check
looks green while sweeping.

**How to apply:** in this tree, never hand a directory to `git add` or
`git commit`. List every file explicitly (or use
`--pathspec-from-file` per [[fabrika-pathspec-from-file-is-the-safe-commit-in-this-tree]]),
and verify against a count you predicted **before** running it:

```sh
git diff --cached --name-only | wc -l     # must equal the number of files you wrote
git show --pretty=format: --name-only HEAD
```

If it already happened: the content is additive and nothing is lost, so **do not**
`git reset` to tidy it — a soft reset pushes 29 files back into an index four
agents share, which is strictly worse than a wrong commit message. Say what
happened in the report and move on.

Related: [[fabrika-concurrent-commit-steals-your-stage]],
[[fabrika-agents-share-one-working-tree]],
[[fabrika-git-stash-is-unsafe-in-shared-tree]].
