---
name: fabrika-a-red-gate-may-belong-to-a-nested-worktree
description: Fabrika'da `pnpm gate` lint aşamasında ~1960 hatayla düşüyorsa suç muhtemelen senin değil — eslint depo içindeki .claude/worktrees/ kopyasını da tarıyor; suçu paylaşılan ağaçta stash ATMADAN, hataları üst dizine göre kovalayarak ölç
metadata:
  type: project
updatedAt: 2026-09-10
---

`pnpm gate` = `db:generate && lint && typecheck && test && i18n:check && rls:check &&
rls:verify && test:e2e`. Lint aşaması ~23.7k problem / 1960 hata ile düşüyordu. Ölçüm:
hataların **1960'ının tamamı** `.claude/worktrees/zztest-validation/` altındaydı — deponun
içine açılmış, eslint ignore listesinde olmayan ikinci bir tam kopyası. `src/` altında SIFIR.

**Ölçme yöntemi (paylaşılan ağaçta güvenli):** `git stash` ATMA — bu ağaçta başka ajanların
commit'siz işi duruyor, stash onların işini altlarından çeker. Bunun yerine hataları yola göre
kovala:
`pnpm lint 2>&1 | grep -E "^/Users" | sed -E 's|<repo>/||' | awk -F/ '{print $1}' | sort | uniq -c | sort -rn`
ve ayrıca `pnpm lint 2>&1 | grep "<kendi dosyan>"` (boşsa senin değil).

Aynı mantık `pnpm test` için: kırmızı testin senin değişikliğinle ilgisiz olduğunu iki ucuz
ölçümle kanıtla — (1) o test dosyası senin dokunduğun modülü import ediyor mu (`grep`),
(2) `git status <test yolu>` boş mu (yani commit'li HEAD içeriğinde, çalışma ağacında
değiştirilmemiş). İkisi de olumsuzsa kırmızı ÖNCEDEN vardı; düzeltme, ADIYLA bildir.

Kapı kırmızıyken teslim ediyorsan raporda HANGİ AŞAMANIN ve KİMİN yüzünden kırmızı olduğunu,
koşabildiğin aşamaları tek tek, koşamadığını "koşulmadı + neden" diye yaz.

İlgili: [[fabrika-stage-only-your-hunks-from-shared-json]],
[[fabrika-dead-pane-work-measure-before-discarding]].
