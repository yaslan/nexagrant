---
name: fabrika-idempotency-proof-needs-per-table-counts
description: Bir çekicinin idempotan olduğunu kanıtlarken tabloları TEK TEK say — normalize tablolar sabit dururken audit tablosu (RawFetch) sızabilir
metadata:
  type: project
  updatedAt: 2026-09-07
---

`pnpm jobs:k1`'i iki kez koşturup "sayı değişmedi" demek YETMEZ: hangi sayı?
2026-09-07'de ölçtüm — `Call` 430→430 ve `Topic` 1288→1288 sabit kaldı, ama aynı iki koşuda
`RawFetch` 1270→1274 büyüdü. Tek bir toplam sayıya ya da yalnız iş tablolarına bakan bir kontrol
bunu göremezdi.

Kök neden şuydu ve tekrar çıkabilir: SEDIA 7 topic'i **tek koşuda iki kez** döndürüyor (biri arama
listesinden, biri `data/topicDetails`'ten), farklı gövdelerle ama aynı `identifier` ile. `Topic`
upsert'i son geleni yazdığı için orada iz bırakmıyor; ama "yalnız hash değiştiyse sakla" mantığı
iki gövde arasında gidip geliyor ve **her gece yeni bir RawFetch satırı** ekliyor. Üst-üste
yazan bir upsert kopyayı gizler, append-only bir tablo ise onu ifşa eder.

Kural: idempotency kanıtı = koşudan önce ve her koşudan sonra **etkilenen HER tablonun ayrı
sayısı**, üst üste iki koşu için. Audit/append-only tabloları (`RawFetch`, `SystemAlert`,
`*ImportRun`) listeye MUTLAKA dahil et — sızıntı önce orada görünür.

Bir bonus: `RawFetch` satırının `hash`'i gerçek baytların SHA-256'sıysa, `shasum -a 256 <dosya>`
ile bağımsız doğrulanabilir — "kaydettim" iddiasını kanıta çeviren ucuz bir adım.

Bkz. [[fabrika-blame-the-e2e-failure-with-a-stash]], [[fabrika-prisma-mock-makes-green-tests-for-crashing-calls]]
