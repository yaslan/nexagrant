---
name: fabrika-seed-was-broken-mid-run
description: Fabrika'da pnpm db:seed ortada durup fixture'ların yarısını yazmayabiliyordu — e2e "benim yüzümden mi" sorusunda önce seed'in exit kodunu kontrol et
metadata:
  type: project
  updatedAt: 2026-09-07
---

2026-09-07: `pnpm db:seed`, `seedG0DemoEvidence` içinde var olmayan
`demo-topic-1..6` id'lerine `TopicMatch` yazmaya çalışıp `TopicMatch_topicId_fkey`
yabancı anahtar hatasıyla **tüm seed'i durduruyordu**. Sonuç: gate decisions,
proposals, efforts, M6 ve E11 fixture'ları hiç yazılmıyordu — ve bunlara dayanan
e2e testleri "senin değişikliğin bozdu" gibi görünüyordu.

`Topic` tablosunda 40 satır var, `demo-topic-%` ile eşleşen 0 satır;
`seed-opportunities.ts` topic'leri `identifier` ile arıyor, `seedG0DemoEvidence`
ise id'yi elle yazıyordu. TASK-MTR6QIE05ZKNH'de eksik topic atlanır ve uyarı
basılır hâle getirildi (seed exit 0); doğru id'lere bağlamak
TASK-MTQW90XSQ1SU1'in işi ve G0 alignment (ağırlık 30) hâlâ tohumlanmıyor.

Refleks: bir e2e hatasında **önce** `pnpm db:seed; echo $?` çalıştır. Seed
ortada durduysa hata veritabanı boşluğudur, kodun değil. Seed tam koştuktan
sonra hâlâ düşen test için [[fabrika-blame-the-e2e-failure-with-a-stash]].

Not: `pnpm test:e2e` 2026-09-07'de tam seed ile bile 24 passed / 6 failed
veriyor (`dashboard-outcome-case` × 1, `m9-*` × 5) — bunlar `dev`'de
pre-existing; bkz. [[fabrika-dashboard-outcome-case-mismatch]].
