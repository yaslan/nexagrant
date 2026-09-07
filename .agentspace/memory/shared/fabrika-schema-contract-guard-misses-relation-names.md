---
name: fabrika-schema-contract-guard-misses-relation-names
description: schema-contract.test.ts artık alan/ilişki adlarını da repo geneli (src/) kontrol ediyor — kalan kör noktaları create/update'in data: bloğu, import edilen sorgu nesnesi ve dinamik kurulan where
metadata:
  type: project
  updatedAt: 2026-09-07
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

1. **`create`/`update`'in `data:` bloğu taranmıyor.** `FIELD_BEARING` yalnız
   `where` / `select` / `include` / `orderBy`. `data: { hayaletKolon: … }` runtime'da
   patlar, kapı görmez.
2. **Sorgu nesnesi BAŞKA dosyadan import edilirse görünmez.** Tarayıcı, çağrı argümanı
   çıplak bir tanımlayıcıysa **aynı dosyadaki** `const <ad> = { ... }` bildirimini çözer
   (alerts-daily.ts'in `SAVED_SEARCH_ALERT_QUERY`'si böyle kapsandı) — ama import
   edileni izlemez. **Genel kural: bir sorguyu çağrı yerinden bir sabite çıkarmak,
   metin tabanlı statik kapıların kapsamını daraltır.** Refactor ederken bunu hesaba kat.
3. **Dinamik kurulan `where`** (spread, koşullu nesne) okunamaz. `topLevelEntries`
   okuyamadığını *atlar*, tahmin etmez — yani yanlış negatif üretir, yanlış pozitif değil.

**Nasıl uygula:** `include: { <isim>: true }` yazarken hâlâ `prisma/schema.prisma`'da
o modelin gerçek bir **relation field**'ı olduğunu doğrula; skaler `xId` kolonunun
varlığı yetmez. İlişki yoksa çözüm şemayı değiştirmek DEĞİL, `xId` üzerinden ayrı
sorgu yazmaktır. Yeni bir kapı ihlali bulursan `KNOWN_UNKNOWN_FIELD_REFS` /
`KNOWN_UNKNOWN_MODEL_CALLS` defterlerine EKLEME — ikisi de yalnız küçülebilir ve
bayatlık testi düzeltilmiş girdide patlar; sorguyu düzelt.

İlgili: [[fabrika-typecheck-is-blind-to-db-calls]] ·
[[fabrika-prisma-mock-makes-green-tests-for-crashing-calls]] ·
[[fabrika-partial-fix-check-all-surfaces-of-the-same-bug]]
