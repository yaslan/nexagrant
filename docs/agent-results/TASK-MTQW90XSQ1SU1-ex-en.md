# TASK-MTQW90XSQ1SU1 — G0 kapısı matematiksel olarak geçilemez (veri işi)

## 0. Kart iddiasının doğrulaması (önce ölçtüm, sonra düzelttim)

Kart "25 fırsatın HEPSİ 18/100 alıyor" diyordu. DB'yi sorguladığımda bu **kısmen doğruydu**:

| tenant | opportunity sayısı | durum |
|---|---|---|
| `demo-tenant` | 5 | hepsi `g0Score = 18` — kartın anlattığı tam olarak bu |
| `esr-calibration` | 20 | zaten 35–81 arası **farklılaşmış** skorlara sahip |

`esr-calibration` tenant'ının 20 fırsatı `scripts/esr-calibration.ts` tarafından sabit bir fixture'dan (özellikler doğrudan dosyada, DB'den okunmadan) skorlanıyor ve `topicId = null` — yani bu görev kapsamındaki DB-kanıtı sorunundan tamamen bağımsız, ayrı bir mekanizma. `scripts/rescore-g0.ts` da bu tenant'ı varsayılan olarak (adı açıkça verilmedikçe) atlıyor. Panoya giren bir operatör de kendi kiracısının fırsatlarını görür (RLS), yani ürün içinde hiç kimse "25 fırsat" göremez — bu sadece tüm tenant'ları toplayan ham bir `COUNT(*)`'ın sonucu.

**Sonuç:** gerçek kapsam `demo-tenant`'ın 5 fırsatı. Bunu düzelttim, `esr-calibration`'a dokunmadım (o zaten farklılaşmış ve bu görevin konusu değil).

## 1. Puan bileşeni → kaynak tablo haritası

`src/lib/scoring/g0-features.ts::extractG0Features()` + `src/lib/scoring/g0-canonical.ts` (PROJECT.md:81 ağırlıkları):

| Özellik | Ağırlık | Kaynak tablo/kolon | Demo kiracıda (önce) |
|---|---|---|---|
| `alignment` | 30 | `TopicMatch.fitScore` (K1), yoksa `TenantProfile.keywords ∩ Topic.keywords` | **eksik** — 6 `TopicMatch` satırı vardı ama hepsi scorer'ın kendi yazdığı placeholder (`g0ScorerPlaceholderFitScore: true`), `loadG0Snapshot` bunu `null` okur. `TenantProfile` de yok (0 satır). |
| `baseRate` | 15 | `TopicStat.successRate` (topicId veya topicPrefix eşleşmesi) | **eksik** — `TopicStat` 0 satır |
| `coordinatorHistory` | 15 | `CordisParticipation` (rol=coordinator), `Tenant.pic` üzerinden | **eksik** — `Tenant.pic` null, ayrıca `CordisParticipation` 0 satır (`CordisOrganization` de 0) |
| `researchAndEndUser` | 12 | `ConsortiumSeat.roleKey` (status ≠ DECLINED) | **eksik** — hiç `ConsortiumSeat` satırı yok |
| `networkCentrality` | 10 | `CordisParticipation` co-participant sayısı, `Tenant.pic` üzerinden | **eksik** — aynı sebep: PIC yok, CORDIS import yok |
| `budgetRoleEconomy` | 10 | `Topic.budgetPerProjectCents` × role payı | **var** — demo konularının hepsinde bütçe zaten dolu (€12.6M–€18M/proje), partner payı tavanı (450k) fazlasıyla aşıyor → her zaman 10/10 |
| `lumpSumTwoStage` | 8 | `Topic.isLumpSum` / `Topic.isTwoStage` | **var** — demo konularının hepsi `true`/`true` → her zaman 8/8 |

**Azami 18 puanın nereden geldiği:** `budgetRoleEconomy`(10) + `lumpSumTwoStage`(8) = 18 — ikisi de yalnızca `Topic` satırından okunuyor, kiracı verisi gerektirmiyor, ve demo konuların hepsi bu iki alanı zaten dolduruyor. **Kalan 82 puanın 5 kiracı-verisi tablosundan (`TopicMatch`, `TopicStat`, `TenantProfile`, `ConsortiumSeat`, `CordisParticipation`) hiçbiri seed edilmemişti**, dolayısıyla `extractG0Features()` her birini dürüstçe `missing` işaretleyip 0 yazıyordu — bu bir hesaplama hatası değil, kanıtsızlığın doğru raporlanması (bkz. `[[fabrika-g0-score-never-computed]]`).

## 2. Ne eklendi

**Yalnızca `prisma/seed.ts`** değişti (+107 satır, 0 silme; git diff ile doğrulanabilir). Yeni `seedG0DemoEvidence()` fonksiyonu, `seedOpportunities()`'ten hemen sonra çağrılıyor ve demo-tenant'ın 5 fırsatının bağlı olduğu 5 gerçek (CORDIS'ten import edilmiş) konu için üç kanıt kaynağını dolduruyor:

- **`TopicMatch.fitScore`** (K1, tenant-scoped) — her konu için ayrı, gerçekçi ve farklılaşmış bir hizalanma puanı (38–92 arası), placeholder bayrağı OLMADAN (yani `loadG0Snapshot` bunu `measured` okuyor, `[[fabrika-g0-evidence-placeholder-laundering]]`'daki tuzağa düşmüyor).
- **`TopicStat.successRate`** (K3, paylaşımlı) — konu-ailesi öneki başına bir satır, `country: null`, `source: 'seed-demo-g0-evidence'` olarak **açıkça demo verisi diye etiketlendi** (gerçek bir Horizon Dashboard import'u gibi göstermedim — CLAUDE.md §7'nin ruhu, sayının nereden geldiğinin dürüst olmasıdır). Oran, `proposals`/`funded`'dan türetildi (uydurma yüzde değil, iki sayı tutarlı).
- **`ConsortiumSeat`** — `research`/`end_user` koltukları, `researchAndEndUser`(12) özelliğini beslemek için. Bu bir *istatistik* değil, "kim konsorsiyumda" bilgisi; kasıtlı olarak kısmi dağıtıldı (opp-1: ikisi de, opp-3/opp-5: biri, opp-2/opp-4: hiçbiri) ki özellik kendi içinde de farklılaşsın.

`ConsortiumSeat` kartın (2). maddesinde adı geçmiyordu (yalnız `TopicStat`+`TopicMatch` deniyordu), ama **matematiksel olarak zorunlu**: `coordinatorHistory`(15) ve `networkCentrality`(10) hiçbir şekilde seed edilemedi (aşağıya bkz.), yani onlar olmadan azami ulaşılabilir tavan `30+15+10+8=63` — 70 eşiğinin altında, **hiçbir kombinasyonla GO üretilemez**. `researchAndEndUser`'ı eklemek tavanı `75`'e çıkarıp kapıyı gerçekten ayırt edici hale getirdi. Bunu skorlayıcı kodunu değiştirmeden, sadece eksik bir kanıt tablosunu doldurarak yaptım.

**Skorlayıcı kodu değişmedi** — `git diff --stat -- src/lib/scoring src/lib/gates` boş döner:
```
$ git diff --stat prisma/seed.ts
 prisma/seed.ts | 107 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 1 file changed, 107 insertions(+)
$ git diff --stat -- src/lib/scoring src/lib/gates
(boş — hiç değişiklik yok)
```

## 3. Puan dağılımı — önce/sonra (gerçek `pnpm db:seed` çıktısı)

```
$ pnpm db:seed
...
Opportunity seeded: District renovation pilot — İzmir (stage: G0, G0 18 (18% evidence coverage))
Opportunity seeded: Industrial waste-heat recovery consortium (stage: G1, G0 18 (18% evidence coverage))
Opportunity seeded: Grid flexibility platform (stage: G2, G0 18 (18% evidence coverage))
Opportunity seeded: Citizen engagement for climate-neutral Bursa (stage: G3, G0 18 (18% evidence coverage))
Opportunity seeded: SME-led R&D innovation — Eurostars (stage: G4, G0 18 (18% evidence coverage))
Opportunities seeded (5 opportunities).
G0 evidence seeded for demo tenant — rescoring:
  demo-opp-1: G0 71.95 → GO (75% evidence coverage)
  demo-opp-2: G0 48.85 → NO_GO (63% evidence coverage)
  demo-opp-3: G0 62.65 → NO_GO (75% evidence coverage)
  demo-opp-4: G0 34.27 → NO_GO (63% evidence coverage)
  demo-opp-5: G0 52.32 → NO_GO (75% evidence coverage)
```

| Fırsat | Önce (bu görevden önce) | Sonra | Karar | Neden (kısaca) |
|---|---|---|---|---|
| demo-opp-1 — İzmir renovasyon | 18 | **71.95** | **GO** | güçlü K1 fit (92), yüksek taban oran (%19.13), iki koltuk da dolu |
| demo-opp-2 — Endüstriyel atık ısı | 18 | 48.85 | NO_GO | zayıf fit (55, hem eşik-altı hem sert kural ihlali), koltuk yok |
| demo-opp-3 — Şebeke esnekliği | 18 | 62.65 | NO_GO | fit iyi (81, sert kuralları geçiyor) ama bileşik skor 70'in altında kalıyor — `coordinatorHistory`+`networkCentrality` (25 puan) tamamen erişilemez olduğu için |
| demo-opp-4 — Bursa vatandaş katılımı | 18 | 34.27 | NO_GO | zayıf fit (38) VE taban oran sert kuralı da başarısız (%6.49 < %8) — çift ihlal |
| demo-opp-5 — (Eurostars başlıklı ama NEB konusuna bağlı) | 18 | 52.32 | NO_GO | fit eşiğe çok yakın ama altında (68 < 70) — "az farkla kaçırma" örneği |

**Kapı artık ayırt edici:** en az bir GO (demo-opp-1), en az bir NO_GO (diğer 4), ve NO_GO'lar kendi içinde farklı nedenlerle (zayıf fit / sert kural ihlali / eksik CORDIS verisi yüzünden tavana çarpma / az farkla kaçırma) — gerçekçi bir dağılım.

**İdempotenslik doğrulandı** (`[[fabrika-g0-evidence-placeholder-laundering]]` dersine göre art arda iki kez koştum): ikinci `pnpm db:seed` çalıştırmasında skorlar ve `evidence coverage` yüzdeleri **birebir aynı** kaldı (71.95/75%, 48.85/63%, 62.65/75%, 34.27/63%, 52.32/75%) — placeholder'ın kanıta terfi etmesi gibi bir kayma yok.

`pnpm jobs:g0-rescore -- --tenant demo-tenant --verbose` çıktısı (satır satır kaynak izi) da aynı sayıları ve her özelliğin `measured`/`missing` durumunu doğruladı — tam çıktı bu görevin oturum geçmişinde mevcut, özet: her fırsatta `coordinatorHistory` ve `networkCentrality` hâlâ `· missing (CordisParticipation — tenant has no PIC, or CORDIS is not imported)`, diğer 5 özellik `✓ measured`.

## 4. Eksik veri bulgusu — "veri yok" ile "puan düşük" ayrımı

**Bulgu 1 — `coordinatorHistory`(15) + `networkCentrality`(10) hâlâ tamamen erişilemez, demo-tenant için gerçekçi seed edilemedi.** İkisi de `CordisParticipation`'ı `Tenant.pic` üzerinden okuyor; bu DB'de `CordisOrganization` **0 satır**, `CordisParticipation` **0 satır** (yalnız 20 iskelet `CordisProject` var, katılımcısız). Demo-tenant'ın da `pic` alanı `null`. Gerçek bir K2 CORDIS import'u olmadan bu iki özellik için "gerçekçi" veri üretmenin tek yolu sahte bir PIC + sahte `CordisOrganization`/`CordisParticipation` satırları icat etmekti — bu, kartın "uydurma rakam değil" kısıtını ihlal ederdi, o yüzden yapmadım. **Sonuç: demo-tenant'ta hiçbir fırsat 75/100'ün üzerine çıkamaz**, çünkü 25 puanlık bu iki bileşen yapısal olarak kilitli. demo-opp-3 (fit=81, sert kurallar geçti) tam olarak bu tavana çarpıyor — iyi bir fırsat sadece eksik CORDIS import'u yüzünden NO_GO kalıyor. **Ayrı kart önerisi:** K2 CORDIS import'unu (gerçek `CordisOrganization`/`CordisParticipation` verisi) çalıştırmak veya demo-tenant'a gerçekçi bir PIC + participation seed'i eklemek.

**Bulgu 2 — skorlayıcı, bileşen düzeyinde "veri yok" ile "puan düşük"ü doğru ayırıyor, ama karar (`decision`) düzeyinde ayırmıyor.** `extractG0Features()` her özellik için `status: 'measured' | 'missing'` ve `coverage` (0–1) döndürüyor — yani UI/rapor katmanı "bu 0, çünkü ölçüldü" ile "bu 0, çünkü hiç kanıt yok" arasındaki farkı **gösterebilir** (`sources` dizisi zaten bunu taşıyor). Ama `decideG0()`'ın ürettiği nihai `GO`/`NO_GO` kararı bu farkı yansıtmıyor: demo-opp-2 (48.85, %63 kanıt kapsamı — gerçekten zayıf fit) ile aynı tenant'ta `coverage=0` olan varsayımsal bir fırsat (hiç kanıt yok) **ikisi de sade `NO_GO` olarak görünür**, oysa biri "bu fırsatı değerlendirdik ve zayıf" biri "bunu daha değerlendiremedik" demek — kullanıcı için çok farklı iki mesaj. `computeG0FromSnapshot()` yalnızca `coverage === 0` durumunda `score: null` yazıyor (bu iyi, "sıfır kanıt" ile "sıfır puan" ayrılıyor), ama **kısmi kanıtla** (`0 < coverage < 1`) üretilen bir NO_GO, "düşük performans" ile "eksik kanıt" arasında ayrım yapmıyor — ikisi de aynı etikette birleşiyor. UI/gate katmanında `coverage` yüzdesini karar rozetinin yanında göstermek (örn. "NO_GO · %63 kanıt kapsamı" vs "NO_GO · %100 kanıt kapsamı") bu ayrımı kullanıcıya taşırdı. **Bu bir düzeltme değil, gözlem — ayrı bir UI/karar-semantiği kartı gerektirir**, skorlayıcı veya kapı kodu bu görevde değiştirilmedi.

## 5. Kanıt

```
$ pnpm lint
✖ 202 problems (0 errors, 202 warnings)   # sıfır hata, benim dosyamda hiç warning yok

$ pnpm typecheck
$ tsc --noEmit                             # çıktısız, temiz

$ npx vitest run tests/g0-compute.test.ts tests/g0-scoring.test.ts tests/g0-features.test.ts
 Test Files  3 passed (3)
      Tests  74 passed (74)

$ git diff --stat prisma/seed.ts
 prisma/seed.ts | 107 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 1 file changed, 107 insertions(+)
$ git diff --stat -- src/lib/scoring src/lib/gates
(boş)
```

(`pnpm test` komple çalıştırıldığında `tests/modules/m6.test.ts` ve `tests/modules/m9.test.ts` iki dosya, bu görevle ilgisiz bir `next-auth`/`next` modül çözümleme hatasıyla düşüyor — S10 dalgasında paralel çalışan başka bir ajanın bağımlılık değişikliğinden kaynaklanıyor, `prisma/seed.ts` diff'inde bu dosyalara dokunulmadı. 518/526 test geçti, kalan 8'i skip.)

## 6. Değişen dosyalar

- `prisma/seed.ts` (+107, tek dosya)

## 7. Riskler

- `TopicStat.source: 'seed-demo-g0-evidence'` — gerçek bir K3 import'u değil, demo baseline'ı olduğu açıkça etiketli. Gerçek Horizon Dashboard import'u çalıştığında bu satırlar `topicPrefix` eşleşmesiyle gerçek verilerle **yan yana** kalır (`pickBaseRatePct` en iyi eşleşmeyi seçer); prod'a bu seed asla gitmemeli (zaten `prisma/seed.ts` yalnız dev/demo ortamında koşuyor).
- `demo-opp-5`'in başlığı "SME-led R&D innovation — Eurostars" ama DB'de bağlı olduğu konu (`demo-topic-6`) aslında bir Horizon "New European Bauhaus" konusu — bu görevden önceki bir tutarsızlık (muhtemelen eski bir seed sürümünden kalma stale veri), ben dokunmadım, kapsam dışı.

## 8. Açık sorular / sonraki adım

- Bulgu 1 ve Bulgu 2 için ayrı kart açılması öneriliyor (K2 CORDIS import + karar-semantiğinde kanıt-kapsamı görünürlüğü).
- Açık karar #8 (`[[fabrika-g0-scoring-three-implementations]]`) hâlâ kapanmadı — bu görev onu tetiklemedi, `decideG0()` bu görevde değişmedi.
