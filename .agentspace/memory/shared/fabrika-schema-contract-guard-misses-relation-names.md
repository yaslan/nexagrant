---
name: fabrika-schema-contract-guard-misses-relation-names
description: schema-contract.test.ts alan/ilişki adlarını repo geneli (src/) hem okuma argümanlarında hem yazma gövdesinde kontrol ediyor — kalan kör noktaları kısa-yazım (shorthand) alanlar, `db.` takma adı, import edilen sorgu nesnesi ve dinamik kurulan where
metadata:
  type: project
  updatedAt: 2026-09-08
---

`src/modules/m8/server/schema-contract.test.ts` (adı M8 diyor, kapsamı repo geneli).
**2026-09-07 / TASK-MTRKVWOGQFSO3 öncesi** iki katmanı vardı ve ikisi aynı güçte
değildi: model-seviyesi sweep repo geneliydi, **alan/ilişki** kontrolü ise yalnız
elle yazılmış M8 yüzeylerine bakıyordu. M2'nin `include: { topic: true }` /
`include: { opportunity: true }` hataları (TASK-MTRKV25PNBHPX) tam bu boşluktan geçti.

**O boşluk KAPANDI.** Artık `SCANNED = ['src']`: alan, ilişki ve kolon adları repo
genelinde doğrulanıyor. Kapsamı genişletmeyi mümkün kılan tek şey **bileşik anahtar
desteği**ydi — `@@unique([tenantId, moduleId])` çağrıda
`where: { tenantId_moduleId: {...} }` olur; ayrıştırıcı bunu bilmeden koşulduğunda
20 bulgunun **19'u yanlış pozitifti**. Ayrıştırıcı şimdi `@@unique`/`@@id`
bloklarından anahtar adını türetiyor ve anahtarın İÇİNDEKİ alanları da doğruluyor.
Sentetik anahtar gerçek bir kolonu gölgelemiyor.

**Kalan kör noktalar — bunlara güvenme, elle doğrula:**

1. ~~`create`/`update`'in `data:` bloğu taranmıyor.~~ **KAPANDI — 2026-09-08,
   TASK-MTS8002I6YD3L.** Kapı artık yazma gövdesini de yürüyor: `create`/`createMany`/
   `update`/`updateMany`'nin `data`'sı, `upsert`'ün `create`+`update`'i, ve ilişki
   altındaki iç içe yazımlar. Gramer taklit ediliyor, `data` sıradan bir alan nesnesi
   gibi okunmuyor: bir ilişkinin `create`/`update`/`upsert`/`createMany` değeri
   **hedef modelin** yazma gövdesi, `connect`/`disconnect`/`set`/`delete` değeri o model
   üzerinde bir `where`, skalerin `{ increment: 1 }`'i ise operatör (yürünmez).
   `data: [satır, satır]` toplu biçimi de listedir. `src/`'de bu yolla doğrulanan
   **548 yazma referansı** var, hiçbiri bozuk değildi — delik kapandı, canlı bug yoktu.
   Fikstür kanıtı: eski tarayıcı 6 bozuk yazma biçiminin **6'sını da kaçırıyordu**.
2. **Sorgu nesnesi BAŞKA dosyadan import edilirse görünmez.** Tarayıcı, çağrı argümanı
   çıplak bir tanımlayıcıysa **aynı dosyadaki** `const <ad> = { ... }` bildirimini çözer
   (alerts-daily.ts'in `SAVED_SEARCH_ALERT_QUERY`'si böyle kapsandı) — ama import
   edileni izlemez. **Genel kural: bir sorguyu çağrı yerinden bir sabite çıkarmak,
   metin tabanlı statik kapıların kapsamını daraltır.** Refactor ederken bunu hesaba kat.
3. **Dinamik kurulan `where`** (spread, koşullu nesne) okunamaz. `topLevelEntries`
   okuyamadığını *atlar*, tahmin etmez — yani yanlış negatif üretir, yanlış pozitif değil.
4. **Kısa yazım (shorthand) alanlar görünmez.** `data: { tenantId, title }` içinde
   `key:` jetonu yok, ayrıştırıcı da `key:` arıyor. ÖLÇÜM (2026-09-08): `src/`'deki
   760 yazma referansının **212'si** böyle. Kapatmak tek satırlık değil — `where:
   { OR: [temelFiltre, ek] }` gibi dizi içindeki çıplak tanımlayıcıları da alan sanar,
   yani yanlış pozitif üretir. Ayrı bir kart olarak yapılmalı.
5. **`db.` takma adıyla yapılan çağrılar HİÇ taranmıyor.** Tarayıcının deseni
   `\b(?:prisma|tx)\.` — istemciyi `db` diye içe aktaran dosyalar iki muhafızın da
   dışında. ÖLÇÜM (2026-09-08): test dışı **16 çağrı yeri / 3 dosya** —
   `src/modules/m6/server/scoring.ts` (6), `src/modules/m6/server/comparison.ts` (5),
   `src/lib/observability/system-alert.ts` (5). Desene `db` eklenince tarama
   **0 bulgu** veriyor (113 dosya), yani kapatmak bugün risksiz; TASK-MTS8002I6YD3L
   kapsam dışı olduğu için yapılmadı.
6. **`data: <değişken>`** (sorgu gövdesi bir üst satırda kurulup değişkenle veriliyor)
   çözülmez. Tarayıcı yalnız `findMany(SABIT)` biçiminde, argümanın TAMAMI çıplak bir
   tanımlayıcıysa aynı dosyadaki bildirimi çözer. Test dışı 2 yer:
   `src/lib/inngest/jobs/k1-daily-calls.ts:262` (`data: topicData`, ~20 alan) ve
   `src/lib/observability/system-alert.ts:280` (`data: row`).

**Nasıl uygula:** `include: { <isim>: true }` yazarken hâlâ `prisma/schema.prisma`'da
o modelin gerçek bir **relation field**'ı olduğunu doğrula; skaler `xId` kolonunun
varlığı yetmez. İlişki yoksa çözüm şemayı değiştirmek DEĞİL, `xId` üzerinden ayrı
sorgu yazmaktır. Yeni bir kapı ihlali bulursan `KNOWN_UNKNOWN_FIELD_REFS` /
`KNOWN_UNKNOWN_MODEL_CALLS` defterlerine EKLEME — ikisi de yalnız küçülebilir ve
bayatlık testi düzeltilmiş girdide patlar; sorguyu düzelt.

İlgili: [[fabrika-typecheck-is-blind-to-db-calls]] ·
[[fabrika-prisma-mock-makes-green-tests-for-crashing-calls]] ·
[[fabrika-partial-fix-check-all-surfaces-of-the-same-bug]]
