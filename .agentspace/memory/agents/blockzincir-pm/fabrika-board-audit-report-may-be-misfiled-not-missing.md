---
name: fabrika-board-audit-report-may-be-misfiled-not-missing
description: Before calling a done card "KANIT YOK", content-grep the task ID across ALL agent-results files, not just filename-match — verification/DOĞRULAMA cards and some closing reports are filed under a DIFFERENT ID (the original card they verify, an ADR name, or a pre-convention name).
metadata:
  type: project
  updatedAt: 2026-09-10
---

While auditing every SPRINT-S12 board card's closure accuracy
(TASK-MTU64P5DPWC4A), filename-matching `docs/agent-results/TASK-<ID>-*.md`
alone produced false "KANIT YOK" for ~9 done cards. Content-grepping the
task ID across the whole `docs/agent-results/` tree found the real evidence
every time, filed under a different name:

- 7 "DOĞRULAMA · <agent> → TASK-XXXX" cards had zero file under their OWN
  ID, but the actual verification lives in `TASK-XXXX-<agent>-dogrulama.md`
  — filed under the ORIGINAL card's ID, not the verification card's ID.
- Two older cards (`TASK-MTU6HUB8FUHMG`, `TASK-MTT13PK0Z4ZLB`) were filed
  as `B-1-blok-zincir-dev.md` and `ADR-0002-geli-tirici.md` — pre-dating
  or ignoring the `TASK-<ID>-<agent>.md` convention entirely.

**How to apply:** in any future board/report audit, before writing "KANIT
YOK" for a done/review card, run `grep -rl "$TASK_ID" docs/agent-results/`
(content, not filename) as a second pass. A true zero-hit on BOTH passes is
a much stronger signal than a filename-only miss — see
[[fabrika-i18n-card-closed-with-zero-report-defect-survived]] for a case
where that double-miss was real and the card was genuinely fake-closed.

Related: [[fabrika-board-cards-go-stale]] (the general staleness warning),
[[fabrika-verify-the-card-recheck-not-just-the-old-report]] (don't trust an
old report blindly either — this note is about the opposite failure, an
absent-looking report that actually exists elsewhere).
