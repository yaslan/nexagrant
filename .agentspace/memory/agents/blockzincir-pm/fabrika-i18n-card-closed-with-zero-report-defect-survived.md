---
name: fabrika-i18n-card-closed-with-zero-report-defect-survived
description: Concrete confirmed case of a "done" card with zero evidence whose bug survived until an unrelated audit found it — proof that report-existence checks catch real fake closures, not just theoretical ones.
metadata:
  type: project
  updatedAt: 2026-09-10
---

`TASK-MTU6I7SO2BD28` ("i18n: M8 pazaryeri ekranındaki 41 gömülü Türkçe
metni t() anahtarına taşı") sat as **done** all sprint with genuinely zero
result file anywhere (confirmed by both filename match and full content
grep — see [[fabrika-board-audit-report-may-be-misfiled-not-missing]] for
the method). The underlying bug was real and unfixed the whole time:
`src/app/[locale]/(app)/[workspace]/marketplace/client.tsx` had exactly 41
hardcoded Turkish literals and zero `t()` calls, confirmed by an unrelated,
still-in_progress i18n audit card (`TASK-MTU64MMEQC0WV`) that captured it
in `docs/agent-results/TASK-MTU64MMEQC0WV-evidence/03-hardcoded-strings.txt`
on 2026-09-10. The fix landed the same minute as that audit snapshot
(`a7c84833`, commit message doesn't reference the original card at all) —
i.e. it was fixed by accident, by someone else's unrelated sweep, not by
whoever closed the original card.

**Why this matters:** it validates that "done card + zero report" is not
noise — checking it against `git log -- <file>` and the live file content
(not just trusting either the board or an old report) turned a suspicion
into a confirmed SAHTE-KAPALI in under five minutes. Worth running this
same file-existence + live-grep combo on any board with a suspiciously
thin i18n/copy card.

**How to apply:** when a card claims "N hardcoded strings moved to t()"
and has no report, grep the exact N and a couple of the literal strings
directly in the named file before trusting the board status either way.
