---
name: fabrika-widen-a-narrow-gate-to-size-and-find
description: Dar kapsamlı bir kapıyı GEÇİCİ olarak repo geneline açıp koşmak, hem kartı ölçüyor hem panoda gizemli duran bir P0'ın kök nedenini veriyor — dağıtmadan önce yap
metadata:
  type: feedback
updatedAt: 2026-09-07
---

"Şu kapıyı repo geneline aç" tipi bir kartı olduğu gibi dağıtmak yerine, kapının kopyasını
alıp kapsamını geçici genişlet ve KENDİN koş. 2026-09-07'de `schema-contract.test.ts`in
alan-seviyesi taramasını `SCANNED = ['src']` yapıp koştuğumda:

- 20 bulgu çıktı, **19'u yanlış pozitifti** — hepsi aynı tek sebepten: Prisma **bileşik unique
  anahtarları**. `@@unique([tenantId, moduleId])` çağrıda `where: { tenantId_moduleId: {...} }`
  olur; naif ayrıştırıcı bunu "modelde böyle alan yok" diye raporlar. Yani kartın gerçek işi
  "kapsamı genişlet" değil, "ayrıştırıcıya `@@unique`/`@@id` bileşik adlarını öğret"ti.
- Kalan **1 bulgu gerçekti** ve panoda bağımsız bir gizem olarak duruyordu:
  `src/lib/inngest/jobs/alerts-daily.ts` → `include: { tenant: true }`, ama `model SavedSearch`
  yalnız `tenantId` skalerini taşıyor. "alerts-daily cron her sabah ölüyor" kartının
  (TASK-MTRKWBLXUYSHS) kök nedeni buydu — semptom kartıyla hiç ilişkilendirilmemişti.

Kazanç: worker'a "genişlet" yerine "19 yanlış pozitifin tek sebebi şu, onu düzelt" diyebildim
ve ayrı bir kartın kök nedenini ölçülmüş olarak teslim ettim. Maliyet ~2 dakika.

Yan kural: iki kart aynı bulguya bakıyorsa (kapıyı açan + bulguyu düzelten) paralel koşabilirler,
yeter ki kapı sahibine **küçülebilir bir defter** girdisi (`KNOWN_UNKNOWN_*`, yanında görev kodu)
bıraktırılsın. Sıraya sokmaya gerek yok.

İlgili: [[fabrika-verify-backlog-before-assigning-finds-worse]] · [[fabrika-verify-what-a-gate-measures]] ·
[[fabrika-partial-fix-check-all-surfaces-of-the-same-bug]]
