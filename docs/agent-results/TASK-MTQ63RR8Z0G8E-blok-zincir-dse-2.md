# TASK-MTQ63RR8Z0G8E — G0 puanı artık gerçekten hesaplanıyor

**Ajan:** blok-zincir-dse · **Tip:** bug/P0 · **Sprint:** S9 · **Tarih:** 2026-09-07
**Önceki tur:** `docs/agent-results/TASK-MTQ63RR8Z0G8E-blok-zincir-dse.md` (keşif — "hiç hesaplanmıyor" teşhisi)

---

## 1. Ne yapıldı

Keşif turu şunu ölçmüştü: `scoreG0()` / `decideG0()` kanonik olarak **tanımlı** ama üretim kodunda
**hiç çağrılmıyor**. `Opportunity.g0Score` ya seed sabitinden (75, 82, 85, 88, 92) ya da pipeline
formundaki `Math.floor(Math.random() * 15 + 80)`'den geliyordu; `gates/evaluate.ts` bu uydurma
sayıyla kapı kararı veriyordu. Bu tur hesaplama döngüsü kapatıldı.

### Eksik olan katman yazıldı

Kanonik skorlayıcı "yedi özellik verilirse puan şudur" sorusunu cevaplıyordu; **"yedi özellik
nereden gelir"** sorusunu kimse cevaplamıyordu — çağrılmamasının sebebi buydu.

| Dosya | Rol | Saflık |
|---|---|---|
| `src/lib/scoring/g0-canonical.ts` | ağırlıklı puan + sert kurallar (mevcuttu) | saf |
| **`src/lib/scoring/g0-features.ts`** (YENİ) | kayıt anlık görüntüsü → 7 özellik + 2 sert olgu + **kaynak izi** | saf, DB yok |
| **`src/lib/scoring/g0-compute.ts`** (YENİ) | Prisma okuması, puanlama, kalıcılaştırma | tek I/O noktası |

Özellik → kanıt eşlemesi (her biri belgeli, hiçbiri tahmin):

| Özellik (ağırlık) | Kaynak | Kanıt yoksa |
|---|---|---|
| alignment (30) | `TopicMatch.fitScore`; yoksa `TenantProfile.keywords ∩ Topic.keywords` | `missing`, 0 |
| baseRate (15) | `TopicStat.successRate` (önce kiracının ülkesine ait satır) | `missing`, 0 |
| coordinatorHistory (15) | `CordisParticipation.role=coordinator` (aynı çağrı ailesi tam puan, ailenin dışı en fazla yarım) | `missing`, 0 |
| researchAndEndUser (12) | `ConsortiumSeat.roleKey` (DECLINED koltuk sayılmaz) | `missing`, 0 |
| networkCentrality (10) | CORDIS ortak katılımcı sayısı (25'te tam puan) | `missing`, 0 |
| budgetRoleEconomy (10) | `Topic.budgetPerProjectCents` × role payı (koordinatör %20, ortak %10) | `missing`, 0 |
| lumpSumTwoStage (8) | `Topic.isLumpSum` / `isTwoStage` | yalnız topic yoksa `missing` |
| **countryEligible** (sert olgu) | `Tenant.country` vs `Topic.eligibility` (TR, `EU_EEA_CH_ONLY` çağrıda uygun DEĞİL) | ülke yoksa uygunsuz |

**Kritik kural:** eksik kaynak 0 yazar, **tahmin edilmez**; ve `coverage === 0` (hiç kanıt yok) ise
puan `null` döner, **hiçbir şey yazılmaz** — uydurulmuş bir 0, uydurulmuş bir 85 kadar sahtedir.

### Üretimde çağrı bağlandı (3 nokta)

1. **`src/lib/gates/evaluate.ts` G0** — artık sütuna güvenmiyor, fırsatı **kendisi puanlıyor**,
   sonucu geri yazıyor ve dökümü `GateDecision.inputs.g0Evidence`'a koyuyor.
   Geçme/kalma kuralı **değiştirilmedi** (composite ≥ 70) — PROJECT.md:75'in hangi okuması gerçek
   kapı olduğu hâlâ açık karar #8; `decideG0`'ın sert kural bulguları **danışma amaçlı** kaydediliyor.
2. **`pipeline/actions.ts::createOpportunity`** — `Math.random()` silindi. Fırsat `g0Score: null`
   ile yaratılıyor, hemen ardından `rescoreOpportunityG0()` kanıttan puanlıyor.
3. **`prisma/seed-opportunities.ts`** — 75/82/85/88/92 sabitleri silindi; seed de kanonik yoldan
   puanlıyor, konsola kanıt kapsamını basıyor.

### Kanıt kaydı (CLAUDE.md §7)

Her puan iki yere birden yazılıyor: `Opportunity.g0Score` (sayı) + `TopicMatch.g0Score` /
`TopicMatch.breakdown` (özellik başına katkı, kaynak izi, `scoringVersion`, `coverage`,
`assessment: "internal-pre-assessment"`). Şema zaten bu alanları ("weighted total",
"per-criterion") bu iş için ayırmış. Kapı çalıştığında aynı döküm `GateDecision.inputs`'a da girer.

### Yeni operasyon aracı

`pnpm jobs:g0-rescore [-- --apply --tenant <id> --verbose]` — mevcut satırların geriye dönük
puanlanması. `esr-calibration` kiracısı kasıtlı hariç (o satırların puanları zaten `decideG0`'dan
geliyor, ama DB satırlarından değil fixture dosyasından — buradan yeniden puanlamak kalibrasyon
setini silerdi).

### Silinen

`src/lib/scoring/g0.ts` — `calculateG0Score` (4 faktör, 0–10 ölçek) + `evaluateGate`. Hiçbir
import'u yoktu ve 70 eşiğiyle farklı ölçekteydi; tuzak olarak bırakmak yerine silindi.

---

## 2. Kanıt

### 2.1 Kapılar temiz

```
$ pnpm typecheck
$ tsc --noEmit
(çıktı yok — temiz)

$ pnpm test
 Test Files  53 passed | 2 skipped (55)
      Tests  504 passed | 8 skipped (512)

$ npx eslint src/lib/scoring src/lib/gates scripts/rescore-g0.ts tests/g0-*.test.ts tests/gates.test.ts prisma/seed-opportunities.ts src/lib/k5-pipeline
(çıktı yok — 0 error, 0 warning)
```

Yeni testler: `tests/g0-features.test.ts` (26), `tests/g0-compute.test.ts` (21),
`tests/gates.test.ts` yeniden yazıldı (7). Toplam 54 test; suite 502 → 504 net (eski gates testi 4 → 7).

### 2.2 GERÇEK VERİTABANI — seed sabitleri ölçüldü ve düştü

```
$ pnpm jobs:g0-rescore -- --tenant demo-tenant
DRY RUN — rescoring 5 opportunities

  demo-opp-1                 75.00 → 18.00            18% evidence   District renovation pilot — İzmir
  demo-opp-2                 82.00 → 18.00            18% evidence   Industrial waste-heat recovery consortium
  demo-opp-3                 85.00 → 18.00            18% evidence   Grid flexibility platform
  demo-opp-4                 88.00 → 18.00            18% evidence   Citizen engagement for climate-neutral Bursa
  demo-opp-5                 92.00 → 18.00            18% evidence   SME-led R&D innovation — Eurostars
```

**Demo kiracının 75–92 puanları tamamen kurguymuş.** Gerçek kanıtla ölçülen değer 18, kanıt kapsamı %18.
Neden — kaynak izi (`--verbose`):

```
      · alignment            0        TopicMatch.fitScore — no topic match and no keywords to compare
      · baseRate             0        TopicStat.successRate — no imported success rate for this topic or its prefix
      · baseRatePct          0        TopicStat.successRate — base rate unknown; the hard rule cannot be satisfied on evidence
      · coordinatorHistory   0        CordisParticipation — tenant has no PIC, or CORDIS is not imported
      · researchAndEndUser   0        ConsortiumSeat.roleKey — no consortium seats defined yet
      · networkCentrality    0        CordisParticipation — tenant has no PIC, or CORDIS is not imported
      ✓ budgetRoleEconomy    100      Topic.budgetPerProjectCents × role share — partner (10% share): 1800000 of 18000000 per project
      ✓ lumpSumTwoStage      100      Topic.isLumpSum / isTwoStage — lump sum: true, two stage: true
      ✓ countryEligible      true     Tenant.country vs Topic.eligibility — TR, no restriction on the call
```

### 2.3 Kanıt kaydı gerçekten yazıldı (Postgres'ten okundu)

```
--- Opportunity.g0Score after backfill ---
demo-opp-1..5 → 18

--- TopicMatch evidence rows ---
tenantId='demo-tenant'  topicId='demo-topic-1..6'  fitScore=0  g0Score=18

--- breakdown JSON ---
{
  "scoringVersion": "2.0",
  "score": 18, "decision": "NO_GO", "coverage": 0.18,
  "assessment": "internal-pre-assessment",
  "contributions": { "alignment":0, "baseRate":0, "coordinatorHistory":0,
                     "researchAndEndUser":0, "networkCentrality":0,
                     "budgetRoleEconomy":10, "lumpSumTwoStage":8 },
  "reasons": ["composite score 18.00 < 70", "alignment 0.00 < 70", "base rate 0% < 8%"],
  "sourceCount": 9,
  "firstSource": { "feature":"alignment", "source":"TopicMatch.fitScore",
                   "status":"missing", "value":0,
                   "note":"no topic match and no keywords to compare" }
}
```

### 2.4 Determinizm + kiracı izolasyonu + üretim kapı yolu (gerçek DB)

```
=== 1. rescoreOpportunityG0 through withTenant (RLS context) ===
run 1 score: 18 coverage: 0.18
run 2 score: 18 coverage: 0.18
DETERMINISTIC: true

=== 2. cross-tenant read is refused ===
other tenant result: null

=== 3. evaluateGate("demo-opp-1","G0") — the production gate path ===
{ "passed": false, "reasons": ["G0 score 18 is below minimum threshold 70"] }

GateDecision.inputs.calculatedG0Score: 18
GateDecision.inputs.g0Score (stored column, recorded not used): 18
GateDecision.inputs.g0Evidence.scoringVersion: 2.0
GateDecision.inputs.g0Evidence.assessment: internal-pre-assessment
GateDecision.inputs.g0Evidence source count: 9
```

Backfill üç kez üst üste koşuldu, kapsam **%18'de sabit kaldı** (aşağıdaki hata düzeltildikten sonra).

### 2.5 GERÇEK TIKLAMA — tarayıcıda pipeline panosu

Çalışan `pnpm dev` (:3000), `alice@fabrika.test` ile giriş, `/tr/main/pipeline`.

**Ekran 1** — `docs/agent-results/TASK-MTQ63RR8Z0G8E-screenshots/01-pipeline-board-computed-score-18.png`
Pano artık her kartta `⭐ 18` gösteriyor (eskiden 75/82/85/88/92 kurgu değerleri).

**Ekran 2** — `docs/agent-results/TASK-MTQ63RR8Z0G8E-screenshots/02-created-opportunity-derived-score.png`
"Yeni Fırsat Ekle" → başlık + `HORIZON-CL5-2026-D4-01` → "Fırsatı Oluştur & Ata".
Sonuç: `⭐ 0` — **rastgele 80–94 DEĞİL**. DB'den okunan satır:

```
id=cmtqupt0k00060ixk1srii7fy  topicId='HORIZON-CL5-2026-D4-01'  intendedRole='coordinator'  g0Score=0
```

Kaynak izi bu 0'ı açıklıyor (o topic'in DB'de bütçesi yok, lump-sum/iki aşama bayrakları false,
TopicMatch/TopicStat yok → yalnız `lumpSumTwoStage` ölçülebildi, o da 0):

```
  cmtqupt0k00060ixk1srii7fy    0.00 → 0.00             8% evidence
      · budgetRoleEconomy    0        Topic.budgetPerProjectCents — call publishes no per-project budget
      ✓ lumpSumTwoStage      0        Topic.isLumpSum / isTwoStage — lump sum: false, two stage: false
```

Ayrıca doğrulandı: form "HORIZON-…" **identifier**'ı yazıyor, seed ise `Topic.id` yazıyor —
yükleyici ikisini de çözüyor, aksi hâlde puan sessizce topic'ini kaybederdi.

Test fırsatı doğrulamadan sonra dev DB'den silindi.

### 2.6 Kendi kodumda bulunan ve düzeltilen hata (backfill ortaya çıkardı)

`persistG0`, dökümü tutmak için `TopicMatch` satırı yaratırken `fitScore`'a bir değer yazmak
zorunda (sütun non-null). İlk sürüm oraya kullandığı `alignment`'ı yazıyordu; **bir sonraki koşu bu
değeri K1 eşleşmesi sanıp "ölçüldü" olarak okuyordu** — yani yokluk, kanıta dönüşüyordu ve kapsam
%18 → %48'e şişiyordu. Tek gerçek yeni bilgi olmadan.

Düzeltme: satır bu skorlayıcı tarafından yaratıldıysa `breakdown`'a
`g0ScorerPlaceholderFitScore: true` bayrağı konuyor; yükleyici o satırın `fitScore`'unu yok sayıyor.
İkinci hata: `update` dalı bayrağı düşürüyordu → bayrak artık hizalamanın gerçekten K1'den gelip
gelmediğine göre her iki dalda da korunuyor. İki regresyon testi eklendi.

---

## 3. Değişen dosyalar

**Yeni**
- `src/lib/scoring/g0-features.ts` — kayıt → özellik eşlemesi + kaynak izi (saf)
- `src/lib/scoring/g0-compute.ts` — Prisma okuması, puanlama, kanıt kalıcılığı (tek I/O)
- `scripts/rescore-g0.ts` — geriye dönük puanlama aracı
- `tests/g0-features.test.ts` (26 test), `tests/g0-compute.test.ts` (21 test)
- `docs/agent-results/TASK-MTQ63RR8Z0G8E-screenshots/*.png`

**Değişen**
- `src/lib/gates/evaluate.ts` — G0 artık kendisi puanlıyor + kanıtı kaydediyor
- `src/app/[locale]/(app)/[workspace]/pipeline/actions.ts` — `Math.random()` → kanonik puanlama
- `src/lib/k5-pipeline/pipelineStore.ts` — `g0Score: number | null` + `updateInMemoryOpportunityScore`
- `prisma/seed-opportunities.ts` — sabit puanlar silindi, kanonik yoldan puanlıyor
- `src/lib/scoring/g0-canonical.ts` — başlık yorumu güncellendi (g0.ts artık yok)
- `tests/gates.test.ts` — eski davranışı (sütuna güven) doğrulayan testler yeniden yazıldı
- `package.json` — `jobs:g0-rescore`

**Silinen**
- `src/lib/scoring/g0.ts`

---

## 4. Riskler

1. **Demo panosu artık 18 gösteriyor, 75–92 değil ve TÜM G0 kapıları düşüyor.** Bu doğru ölçüm ama
   ürün açısından sert: demo kiracıda `TopicStat`, `TopicMatch`, `TenantProfile.keywords`, `Tenant.pic`
   ve CORDIS verisinin hiçbiri seed edilmemiş. **Düzeltme kod değil veri işidir** — ayrı kart açılmalı
   (aşağıda "Sonraki adım").
2. **Kapı kararı semantiği kasıtlı değiştirilmedi.** Sert kural `baseRate ≥ %8` hiçbir yerde
   `TopicStat` olmadığı için bugün her fırsatı düşürürdü; bu yüzden yalnız danışma olarak kaydediliyor.
   Açık karar #8 kapanana kadar böyle kalmalı.
3. **`⭐ 0` (kanıt kapsamı %8) rozet olarak yanıltıcı.** Kullanıcı "değerlendirildi ve kötü" diye
   okur; gerçek "neredeyse hiçbir veri yok". Rozetin kapsam/nitelik etiketi taşıması gerekiyor —
   **ama pipeline skor rozeti ex-en'in kartında**, oraya dokunmadım.
4. **CORDIS sorguları sınırlı** (`take: 500` katılım, ilk 200 proje üzerinden ortak sayımı). Çok
   büyük bir kuruluşta merkezilik hafife alınabilir; zaten 25'te doygun olduğu için pratikte etkisiz.
5. Bu dalgada paralel ajanlar çalışıyor: `evaluate.ts`, `g0-features.ts`, `g0-compute.ts` ve
   `actions.ts` değişikliklerim başka bir ajanın `git add -A` commit'ine (`d1dd824`) karışmış hâlde
   girdi. İçerik doğrulandı (`git show HEAD:…` ile), kayıp yok.

---

## 5. Açık sorular

1. **Açık karar #8** hâlâ açık: G0 kapısı composite ≥ 70 mi, yoksa PROJECT.md:75'in üç sert kuralı mı?
   Kalibrasyon koşusu (`pnpm beta:esr-calibration`) bunu ölçebilir; bu tur karara girmedim.
2. Kanıt kapsamı için bir **alt eşik** olmalı mı? Bugün %8 kapsamla hesaplanan bir 0 saklanıyor.
   Keyfi bir eşik kendi başına bir uydurma olur; benim önerim eşik değil, kapsamı **rozetin yanında
   göstermek**. Karar ürün/tasarım tarafında.
3. `baseRateToScore` tam puanı %20'de veriyor (Horizon geneli ~%16). Kalibrasyonla doğrulanmalı.

---

## 6. Sonraki adım

1. **YENİ KART (P0, veri):** demo + beta kiracıları için gerçek kanıt seed'i — `TopicStat`
   (Horizon Dashboard başarı oranları), `TenantProfile.keywords`, `Tenant.pic`, örnek `TopicMatch`.
   Bu olmadan ürün "her şey 18" gösteriyor. Kabul: `pnpm jobs:g0-rescore -- --tenant demo-tenant`
   çıktısında kapsam ≥ %70.
2. **ex-en'e devir:** pipeline skor rozeti (`board.tsx:462-471`) kanıt kapsamını ve
   "iç ön değerlendirme" etiketini taşımalı; `⭐ 0` tek başına yanıltıcı.
3. **KAPSAM DIŞI KALDI (ayrı kart gerek):** `pipeline/[id]/page.tsx` (`g0Score: 92`) ve
   `pipeline/[id]/consortium/page.tsx` (88/92/85/94) hâlâ **statik mock sayfa** — DB'ye hiç sormuyorlar,
   uydurma puanı "92/100" diye gösteriyorlar. Bunları düzeltmek "detay sayfalarını gerçek veriye
   bağla" işidir, puanlama düzeltmesi değil.
4. Açık karar #8 için kalibrasyon koşusu.

---

## Definition of Done

- [x] g0Score kanonik fonksiyondan hesaplanıyor, **üretimde çağrı kanıtlandı** (§2.4 kapı yolu, §2.5 gerçek tıklama)
- [x] Sahte/random skor kaynağı kalmadı — `Math.random()` silindi, seed sabitleri silindi
      (kalan iki statik mock **sayfa** §6.3'te devredildi)
- [x] `src/lib/scoring/g0.ts` silindi
- [x] Skor kanıta bağlı — `TopicMatch.breakdown` + `GateDecision.inputs.g0Evidence` (§2.3)
- [x] Determinizm doğrulandı (§2.4, 20+20 tekrarlı birim testler, 3 kez backfill)
- [x] Birim testler yeşil — 504 passed, 0 regresyon; typecheck + lint temiz (§2.1)
- [x] dev'e commit + sonuç raporu
