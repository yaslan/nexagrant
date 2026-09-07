# TASK-MTQUY6BHOGO66 — G0 hesaplama ve Evaluator Lens: gerçek kullanım denemesi

**Ajan:** customer-support (CS-EN) · **Tip:** dogfood / QA · **Sprint:** S10 · **Tarih:** 2026-09-07
**Kapsam:** kod DEĞİŞTİRİLMEDİ. Bulgular kart adayı olarak listelendi.
**Ortam:** `pnpm dev` :3000, dev Postgres, seed verisi. Giriş: `alice@fabrika.test` (demo-tenant,
PIPELINE_MANAGER) ve çapraz-kiracı testi için `partner01@example.invalid` (beta-anadolu-teknoloji).
**Ekran görüntüleri:** `docs/agent-results/TASK-MTQUY6BHOGO66-screenshots/`

---

## 0. Tek cümlelik sonuç

**G0 hesaplaması doğru çalışıyor ve determinist; ama kullanıcının onu gördüğü hiçbir ekran onu doğru
göstermiyor.** Fırsat detay sayfası gerçek 18 puanın üstüne sabit **92/100** yazıyor, "Kapıyı
Değerlendir" düğmesi bir `alert()` tiyatrosu, ve üretim kapı fonksiyonu `evaluateGate()` uygulama
kodundan **hiç çağrılmıyor**. Önceki turun "üretimde çağrı kanıtlandı" iddiası bir script ile
doğrulanmış; kullanıcının erişebildiği bir yol değil.

---

## 1. Ne yapıldı

| # | Deneme | Yöntem |
|---|---|---|
| 1 | Determinizm | 25 fırsat × 3 koşu, `computeG0ForOpportunity` `withTenant` içinden |
| 2 | Eksik alan davranışı | kanıt tablolarının satır sayımı + kaynak izi okuması |
| 3 | Rozet yüzeyleri | gerçek tıklama, `tr` ve `en` locale |
| 4 | Ekrandaki sayı = SQL? | pano + panel KPI'ları Prisma sorgusuyla karşılaştırıldı |
| 5 | İsabet Oranı gerçek mi? | `getKpiMetrics` girdileri elle hesaplandı, ekranla karşılaştırıldı |
| 6 | Düşman kullanıcı | uydurma id, başka kiracının id'si, fırsat yaratma + yenileme |

---

## 2. Kanıt

### 2.1 Determinizm — TEMİZ ✅

25 fırsatın her biri için `computeG0ForOpportunity` üç kez, `withTenant` (RLS bağlamı) içinden:

```
=== DETERMINISM: computeG0ForOpportunity x3 per opportunity (through withTenant) ===
 demo-opp-1     18/0.18/NO_GO | 18/0.18/NO_GO | 18/0.18/NO_GO  DETERMINISTIC
 demo-opp-2     18/0.18/NO_GO | 18/0.18/NO_GO | 18/0.18/NO_GO  DETERMINISTIC
 demo-opp-3     18/0.18/NO_GO | 18/0.18/NO_GO | 18/0.18/NO_GO  DETERMINISTIC
 demo-opp-4     18/0.18/NO_GO | 18/0.18/NO_GO | 18/0.18/NO_GO  DETERMINISTIC
 demo-opp-5     18/0.18/NO_GO | 18/0.18/NO_GO | 18/0.18/NO_GO  DETERMINISTIC
 esr-cal-S01    null/0.00/-   | null/0.00/-   | null/0.00/-    DETERMINISTIC
 … (esr-cal-S02..S20 aynı: null, 3/3)
```

Format: `score/coverage/decision`. 25/25 tekrar-üretilebilir. **Bu madde geçti.**

### 2.2 Eksik alan davranışı — ölçüldü

Veritabanındaki kanıt tablolarının tamamı:

```
=== EVIDENCE TABLES (row counts) ===
 TopicStat              0
 TopicMatch             6      ← altısı da bu skorlayıcının kendi yazdığı placeholder satır
 CordisParticipation    0
 ConsortiumSeat         0
 Topic                  1288
 Proposal               23
 GateDecision           38
```

`TenantProfile` demo-tenant için `null`; 13 kiracının **13'ünde de** `Tenant.pic = null`.

Kaynak izi (yeni yaratılan gerçek bir fırsat, koordinatör rolü, `demo-topic-1`):

```
 · alignment            0    TopicMatch.fitScore — no topic match and no keywords to compare
 · baseRate             0    TopicStat.successRate — no imported success rate for this topic or its prefix
 · coordinatorHistory   0    CordisParticipation — tenant has no PIC, or CORDIS is not imported
 · researchAndEndUser   0    ConsortiumSeat.roleKey — no consortium seats defined yet
 · networkCentrality    0    CordisParticipation — tenant has no PIC, or CORDIS is not imported
 ✓ budgetRoleEconomy  100    coordinator (20% share): 3600000 of 18000000 per project
 ✓ lumpSumTwoStage    100    lump sum: true, two stage: true
 ✓ countryEligible   true    TR, no restriction on the call
```

`coverage = measuredWeight / totalWeight` (`g0-features.ts:395`). Ölçülebilen tek iki özellik
`budgetRoleEconomy` (ağırlık 10) ve `lumpSumTwoStage` (ağırlık 8). Bunlar **kiracı verisi
gerektirmeyen** iki özellik; ikisi de yalnız `Topic` satırından okunuyor.

**Sonuç — F7:** bugünkü veriyle bir fırsatın alabileceği **azami puan 10 + 8 = 18/100**. G0 kapısı
eşiği 70. Yani kapı, hiçbir kiracı için, hiçbir fırsat için **matematiksel olarak geçilemez**.
Ölçüm bunu doğruluyor: beş seed fırsatı da 18, benim yarattığım altıncı fırsat da 18.

Yan gözlem: `coverage` %18 ile `score` 18 sayısal olarak çakışıyor. Ekranda ikisi de görünmediği
için bugün zararsız; rozete kapsam eklendiğinde bu çakışma okuyucuyu yanıltır.

Rol farkı ölçüldü: koordinatör (%20 pay) ve ortak (%10 pay) **aynı 18'i** üretiyor —
`budgetRoleEconomy` iki rolde de tavana (100) oturuyor. Formda kullanıcıya sorulan "Hedeflenen Rol"
seçiminin puana bugün hiçbir etkisi yok.

### 2.3 Ekrandaki sayı = SQL ✅

`/tr/main/dashboard`, demo-tenant (ekran 01):

| Ekran | Değer | SQL | Uyum |
|---|---|---|---|
| Toplam Teklif | 5 | `count(Opportunity)` = 5 | ✅ |
| İsabet Oranı | %40,0 | `submitted(2) / g0Scored(5) × 100` = 40.00 | ✅ |
| Ortalama Puan | 0,0 /100 | tek `Evaluation`, (0+0+0)/3 = 0 | ✅ |
| Açık Modüller | 6 | `ModuleState status=ON` = M1,M2,M3,M4,M5,M8 | ✅ |

Pano kartlarındaki `⭐ 18` değerlerinin hepsi `Opportunity.g0Score` sütunuyla birebir aynı.

### 2.4 İsabet Oranı gerçek hesaptan geliyor ✅

`src/modules/m5/server/queries.ts:112` → `submittedProposals / g0ScoredOpportunities × 100`.
Seed ortalaması **değil**. Ekrandaki alt etiket de doğru: "G0 puanı alan fırsatlar içinde gönderilen
teklif oranı". `%40,0` elle hesapla birebir tuttu.

> Not (F17, düşük): payda `g0Score IS NOT NULL` sayıyor. Skorlayıcı `coverage = 0` olduğunda hiçbir
> şey yazmıyor — yani kanıtsız fırsatlar paydadan düşüyor ve isabet oranı şişiyor. Bugün ısırmıyor
> (beş fırsatın beşi de puanlı), ama tasarıma gömülü bir bağ.

**DİKKAT — F12:** `src/app/[locale]/(app)/[workspace]/dashboard/client.tsx` panoyu render ETMİYOR
(hiçbir dosya import etmiyor; sayfa `m5/ui/Dashboard`'ı kullanıyor). Ama içinde
`hitRate === '0' ? '68.5'`, `thresholdRate === '0' ? '84.2'`, `personDaysPerOpp === '0' ? '14.2'`,
`totalOpps || 12`, `fundedOpps || 4` ve sabit `+24%` / `-18%` / `5x Daha Hızlı` rozetleri duruyor.
Ölü kod, ama bir sonraki okuyucu için tuzak: "pano veri yoksa 68.5 uyduruyor" sanır.

---

## 3. Bulgular

### P0 — F1 · Fırsat detay sayfası gerçek puanın üstüne sabit 92/100 yazıyor

`src/app/[locale]/(app)/[workspace]/pipeline/[id]/page.tsx:8-15` bir `// Mock data` bloğu:

```ts
const getOpportunity = (id: string) => ({
  id, title: 'Advanced AI solutions for climate modeling',
  topicId: 'HORIZON-CL5-2026-09-D4-01', stage: 'G0',
  g0Score: 92, status: 'ACTIVE', intendedRole: 'coordinator'
});
```

Gerçek tıklamayla üç kez üretildi:

- **Kendi yarattığım gerçek fırsat** `cmtqv7fp9000a0ixkhgiagykm` (gerçek başlık "DOGFOOD …",
  gerçek `g0Score = 18`) → ekran: "Advanced AI solutions for climate modeling", **G0 SCORE 92/100**
  (ekran 05).
- **Uydurma id** `/tr/main/pipeline/kedi-kopek-42` → 404 değil, aynı sayfa, aynı 92/100 (ekran 07).
- **Başka kiracı** (partner01) `/tr/main/pipeline/demo-opp-1` → aynı sayfa, aynı 92/100.

Kullanıcı akışı şu: panoda `⭐ 18` görüyor, "İncele"ye tıklıyor, **92/100** okuyor. Hangi sayıya
inanacağını söyleyen hiçbir şey yok, ve karar verdiği sayı bir literal.

Aynı sayfadaki "Evaluate Gate G0" düğmesi (satır 22-25):

```ts
const handleEvaluateGate = async () => {
  alert(`Evaluating Gate ${opp.stage}...`);
  await new Promise(resolve => setTimeout(resolve, 1000));
  alert('Evaluation passed! Moving to G1.');
};
```

Gerçek puan 18, gerçek karar `NO_GO`. Düğme her koşulda "Evaluation passed" diyor ve hiçbir şeyi
kaydetmiyor. (Düğmeye tıkladığımda tarayıcı aracı `alert()` modalı yüzünden kare üretemedi —
`Input.dispatchMouseEvent 3000ms içinde dönmedi`; bu da `alert()`'in gerçekten açıldığının kanıtı.)

Ayrıca `params` Next 16'da Promise iken `params.id` senkron okunuyor — dev overlay'deki "1 Issue"
her sayfada duruyor.

### P0 — F2 · Üretim kapı fonksiyonu uygulama kodundan hiç çağrılmıyor

```
$ grep -rn "evaluateGate|gates/evaluate" src tests scripts
src/lib/gates/evaluate.ts:10:export async function evaluateGate(
tests/gates.test.ts:168,174,182,183,197,210,220,226   ← yalnız testler
(uygulama kodunda çağıran YOK — yalnız yorum satırlarında geçiyor)
```

Veritabanı da bunu doğruluyor. Kanıt taşıyan tek `GateDecision` satırları:

```
 G0 opp=demo-opp-1 passed=false at=Mon Sep 07 2026 09:18:10  g0Evidence=YES
 G0 opp=demo-opp-1 passed=false at=Mon Sep 07 2026 09:17:02  g0Evidence=YES
 G0 opp=demo-opp-1 passed=false at=Mon Sep 07 2026 09:15:37  g0Evidence=YES
 G4 opp=demo-opp-5 passed=true  at=Mon Sep 07 2026 00:06:00  g0Evidence=no   ← seed
 G3 opp=demo-opp-4 passed=true  at=Sun Sep 06 2026 00:06:00  g0Evidence=no   ← seed
```

Üçü de bugün 09:15–09:18 arasında, hep aynı fırsat üzerinde, önceki ajanın doğrulama **script'i**
tarafından yazılmış. Kullanıcı yolundan gelen **sıfır** kayıt var.

TASK-MTQ63RR8Z0G8E raporundaki "üretimde çağrı kanıtlandı (§2.4 kapı yolu)" maddesi bu yüzden
yanıltıcı: script'ten çağırmak "üretimde çağrılıyor" demek değil. Skorlayıcı doğru yazılmış ama
ürüne bağlanmamış.

### P0 — F3 · Başka kiracının id'si 404 yerine uydurma fırsat gösteriyor

`partner01@example.invalid` (beta-anadolu-teknoloji, 0 fırsat) →
`/tr/main/pipeline/demo-opp-1/consortium` (ekran 06):

```
Consortium Builder
FLEX-GRID: Decarbonised Smart Grid Flexibility Solutions — Stage G0
```

Kaynak: `pipeline/[id]/consortium/page.tsx:133` → `opportunity = DEMO_OPPORTUNITIES[id] ?? null`.
Satır 19-53'teki sabit tablo dört fırsat ve `g0Score: 88 / 92 / 85 / 94` taşıyor. Gerçek satır
(demo-tenant'ın "District renovation pilot — İzmir", puan 18) sızmıyor — kiracı kapsamı çalışıyor —
ama 404 gereken yerde **uydurma bir fırsat** üretiliyor, "demo/örnek" etiketi de yok.

Bu, M9 brief'lerinde açılmış TASK-MTQUS5JH4DXJM ile **birebir aynı desen**, farklı modülde (M8).

Karşılaştırma — M6 aynı testte doğru davranıyor: partner01 için
`/tr/main/opportunities/demo-opp-3/evaluations` → **"404 Sayfa Bulunamadı"** ✅.

### P0 — F4 · Bir fırsat yaratmak panoda iki kart üretiyor; DB'den silinen kart kalıcı hayalet oluyor

Gerçek tıklama: "Yeni Fırsat Ekle" → başlık + topic → "Fırsatı Oluştur & Ata" → sayfayı yenile.
G0 sütunu 2'den **4'e** çıktı, aynı başlık **iki kez** listelendi (ekran 02):

```
G0  4
 👑 Koordinatör  ⭐ 18   DOGFOOD MTQUY6BHOGO66 — G0 kanit denemesi
 👑 Koordinatör  ⭐ 18   DOGFOOD MTQUY6BHOGO66 — G0 kanit denemesi     ← aynı fırsat, ikinci kart
 👑 Koordinatör  ⭐ 0    G0 scoring verification — TASK-MTQ63RR8Z0G8E  ← DB'de olmayan hayalet
 🤝 Ortak        ⭐ 18   District renovation pilot — İzmir
```

Aynı anda veritabanı:

```
 COUNT IN DB = 6   (pano yalnız G0 sütununda 4 kart çizdi; toplam 8 kart / 6 satır)
 demo-opp-1..5 + cmtqv7fp9000a0ixkhgiagykm
```

Kök neden: `pipeline/actions.ts:107` `addInMemoryOpportunity`'yi **koşulsuz** çağırıyor (DB yazımı
başarısız olduğunda değil, her seferinde) ve bellek satırına `opp-${Date.now()}` id'si veriyor;
ardından Prisma `create` bambaşka bir cuid üretiyor. `pipeline/page.tsx:31-38` iki listeyi **id'ye
göre** birleştiriyor — id'ler asla eşleşemeyeceği için her fırsat iki kez çiziliyor. Sunucu yeniden
başlayana kadar da kalıcı.

Aynı mekanizma ikinci belirtiyi açıklıyor: önceki ajanın raporu "test fırsatı dev DB'den silindi"
diyor — DB'den silinmiş, ama bellek kopyası silinmediği için kart **hâlâ panoda**. Bir kullanıcı
fırsatını sildiğinde ekranda durmaya devam eder.

### P1 — F5 · Evaluator Lens hakem paneli rotası sonsuz iskelet gösteriyor

`/tr/main/opportunities/<id>/evaluations/panel` — `loading.tsx` iskeleti hiç çözülmüyor: içerik yok,
hata yok, zaman aşımı yok (ekran 04). İki farklı fırsatla (`demo-opp-3` ve `demo-opp-1`), toplam
dört navigasyonda tekrarlandı. Sayfanın Prisma sorgusunu birebir kopyalayıp script'ten koştum:
**221 ms'de döndü**, veri doğru:

```
OK in 221 ms: {"id":"demo-proposal-3","evaluations":[{"id":"demo-evaluation-panel-1",
               "reviewers":[{"id":"demo-reviewer-alice"}]}]}
```

Yani veri katmanı sağlam; render/askıya alma tarafında bir şey takılıyor. Kök nedeni izole etmedim
(bu görevde kod değiştirmiyorum).

**Neden P1:** bu rota, `EvaluationDashboard` ve `EvaluatorForm`'u — yani yeni eklenen "iç ön
değerlendirme" rozetinin **dört yüzeyinden ikisini** — mount eden **tek** rota
(`panel/page.tsx:65`, `panel/client.tsx:26`). Rota açılmadığı için o iki rozet hiçbir kullanıcı
tarafından görülemiyor.

### P1 — F6 · M6 kapalıyken Evaluator Lens tamamen açık, 3 kredilik YZ düğmesi dahil

`ModuleState(demo-tenant, M6) = OFF`. Buna rağmen `/tr/main/opportunities/demo-opp-3/evaluations`
eksiksiz render ediliyor: puan kartları, ESR kalibrasyonu ve **"Yapay Zeka Değerlendirmesi Başlat ·
3 Kredi"** düğmesi (ekran 03).

```
$ grep -rn "requireModule" src
src/lib/modules/hooks.tsx:37:export function requireModule<P extends object>(
(başka kullanım YOK — hiçbir rota bunu çağırmıyor; src/middleware.ts de yok)
```

CLAUDE.md kural 3 rota korumasını `requireModule('M6')` ile şart koşuyor. Fonksiyon yazılmış, hiçbir
yerde kullanılmamış. Kapalı bir modül kredi harcatabiliyor.

### P1 — F8 · Pano rozeti puanı yanlış etiketliyor, kapsamı hiç söylemiyor

`pipeline/board.tsx:462-471`:

- `title="AI Gate Uyum Skoru"` — sabit Türkçe (i18n yok) ve **yanlış**: puan determinist bir kural
  motorundan geliyor, YZ'den değil. `src/lib/scoring` altında tek bir LLM çağrısı yok.
- "iç ön değerlendirme" etiketi yok.
- Kanıt kapsamı yok. `⭐ 0` ile `⭐ 18` arasındaki gerçek fark "kanıt %8" ile "kanıt %18"; kullanıcı
  ise "0 puan aldı" ve "18 puan aldı" diye okuyor. Yokluk, ölçüm gibi gösteriliyor.
- Renk eşiği 80 (`>= 80 yeşil, altı amber`), kapı eşiği 70. 70–79 arası **kapıyı geçen** bir fırsat
  uyarı renginde çiziliyor.

Önceki tur bunu risk #3 olarak yazıp ex-en'e devretmişti; bu turda hâlâ aynen duruyor.

### P1 — F9 · `en` locale'de Evaluator Lens sayfası rozet dışında tamamen Türkçe

`/en/main/opportunities/demo-opp-3/evaluations` (ekran 08). Yeni eklenen rozet iki dilde de doğru
çeviriliyor ✅ (`m6.internalPreAssessment*` anahtarları `tr.json` ve `en.json`'da mevcut). Sayfanın
geri kalanı sabit Türkçe:

```
MODÜL 6 — EVALUATOR LENS          Fırsat: Grid flexibility platform
Ortalama Tahmin Puanı             Değerlendirici Sayısı  1 (1 İnsan, 0 YZ)
G3 Kapısı Durumu                  Eksik Değerlendirme
IA Etki Çarpanı (1.5x)            Pasif (Standart)
Değerlendirmeler & Puan Kartları  REA Sık Hatalar Kontrolü
YZ Hakem Simülasyonu              Resmî Horizon Europe REA promptu
3 Kredi                           Yapay Zeka Değerlendirmesi Başlat
İnsan Uzman Değerlendirmesi Ekle  Mevcut Ön Değerlendirme Raporları
```

Yani "i18n tamam" iddiası bu ekranda **yalnız yeni eklenen iki satır** için doğru.

### P2 — F10 · Boş değerlendirme, ölçülmüş sıfır gibi gösteriliyor

Tek `Evaluation` satırı (`demo-evaluation-panel-1`) `excellence/impact/implementation = 0/0/0`.
Ekranlar bunu ölçüm gibi sunuyor:

- Evaluator Lens: "Ortalama Tahmin Puanı **0.0 / 15.0**", rapor kartında "Toplam: 0.0 / 15.0
  **(Eşik Altı)**"
- Pano: "Ortalama Puan **0,0 /100**"

"Eşik Altı" hükmü, doldurulmamış bir formdan çıkarılıyor. F8 ile aynı sınıf hata: **yokluk ≠ sıfır**.

### P2 — F11 · esr-calibration kiracısında tekrar-üretilemeyen puanlar

20 fırsatın `Opportunity.g0Score` sütununda 35.65–81.51 aralığında değerler duruyor, ama kanonik
skorlayıcı bu 20 satırın **hepsi için `null`** döndürüyor (kanıt kapsamı 0) — §2.1'de görülüyor.
`TopicMatch(esr-calibration) = 0`; sayıların arkasında hiçbir kanıt kaydı yok, `Topic` bağı da yok
(`topicId = null`). Değerler fixture dosyasından geliyor ve `jobs:g0-rescore` bu kiracıyı kasten
atlıyor. Bugün UI'da görünmüyorlar; göründükleri gün CLAUDE.md §7'yi ihlal edecekler.

### P2 — F13 · Yeni fırsat formu uydurma kişiler ve eskimiş çağrı kodları öneriyor

"Sorumlu Kullanıcı" listesi `pipelineStore.ts:32-38`'deki sabit beş isim: Ahmet Yılmaz, Ayşe Kaya,
Mehmet Demir, Zeynep Şahin, Can Öztürk. demo-tenant'ın gerçek kullanıcıları (alice, bob, charlie,
dave, eve, frank, grace, heidi) listede yok. Panoda "Atanan: Ahmet Yılmaz" yazan kartların hiçbiri
gerçek bir kullanıcıya işaret etmiyor.

"Önerilenler" çipleri: `HORIZON-CL5-2024-D3-01-01`, `HORIZON-CL4-2024-DIGITAL-01`,
`HORIZON-CL6-2024-CIRCBIO-01`, `EIC-ACCEL-2024-DEEPTECH` — hepsi **2024** çağrıları, bugün
2026-09-07. `Topic` tablosunda 1288 satır varken sabit liste öneriliyor.

### P2 — F14 · Silinen fırsatın kanıt satırı ortada kalıyor

```
 topic=cmtq0htm30004egxk826b7461  fitScore=0  g0Score=0  coverage=0.08  placeholder=true
```

Önceki turun silinen test fırsatından kalma `TopicMatch` satırı. `placeholder=true` bayrağı sayesinde
yanlış okunmuyor, ama fırsatı olmayan bir topic için kalıcı bir kanıt kaydı olarak duruyor.

### P2 — F15 · `en` metin `tr` locale'de bozuk büyük harfe dönüyor

Konsorsiyum sayfası başlığı: **"ADD ROLE TO CONSORTİUM"**. `text-transform: uppercase` + `lang="tr"`
İngilizce "consortium"un `i`'sini `İ` yapıyor. `tr` ve `en` locale'de aynı.

### P2 — F16 · Yeni kiracının boş panosu "başarısızlık" gibi okunuyor

partner01 (hiç fırsatı yok) panoyu açtığında "İsabet Oranı **0,0 %**", "Ortalama Puan **0,0 /100**"
görüyor. Sayılar doğru ama boş-durum metni yok; yeni kullanıcı bunu "başarı oranınız sıfır" diye
okur. F8/F10 ile aynı desen.

---

## 4. Doğrulanan ve SORUNSUZ bulunanlar

| Konu | Durum |
|---|---|
| G0 determinizmi (25 fırsat × 3 koşu) | ✅ |
| Kiracı izolasyonu — M6 değerlendirme sayfası çapraz-kiracıda 404 | ✅ |
| Pano kart puanları = `Opportunity.g0Score` sütunu | ✅ |
| İsabet Oranı gerçek hesaptan (%40,0 = SQL %40,00), seed ortalaması DEĞİL | ✅ |
| Pano KPI'larının dördü de SQL ile birebir | ✅ |
| "İç ön değerlendirme" rozeti `tr` + `en` doğru çeviriliyor | ✅ |
| Kanıtsız fırsata puan yazılmıyor (`coverage=0` → `null`) | ✅ |
| `Math.random()` / seed sabiti puan kaynağı kalmamış (skorlayıcı tarafında) | ✅ |

**Rozet yüzey sayımı:** dört yüzeye eklenmiş, **ikisi kullanıcıya ulaşıyor**
(pano "Ortalama Puan (iç ön değerlendirme)"; `/evaluations` sayfası — `tr` ve `en` doğrulandı).
Diğer ikisi (`EvaluationDashboard`, `EvaluatorForm`) yalnız F5'te askıda kalan `/panel` rotasında.
DoD'daki "3+ yüzey" bu yüzden **karşılanmadı**.

---

## 5. Değişen dosyalar

Kod değişmedi (görev kuralı). Eklenen:

- `docs/agent-results/TASK-MTQUY6BHOGO66-customer-support.md` (bu dosya)
- `docs/agent-results/TASK-MTQUY6BHOGO66-screenshots/01-dashboard-hit-rate-40.png`
- `…/02-pipeline-duplicate-card.png`
- `…/03-evaluator-lens-badge-m6-off.png`
- `…/04-panel-route-hangs-skeleton.png`
- `…/05-detail-page-fabricated-92.png`
- `…/06-crosstenant-consortium-fabricated.png`
- `…/07-fake-id-shows-92.png`
- `…/08-en-locale-turkish-labels.png`

Geçici probe script'leri (`scripts/_dogfood-*.ts`) koşuldu ve **silindi**. Test için yarattığım
fırsat `cmtqv7fp9000a0ixkhgiagykm` ve `GateDecision` satırları dev DB'den **silindi**
(`demo-tenant` yine 5 fırsat). Bellek içi hayalet kart sunucu yeniden başlatılınca temizlenir.

---

## 6. Riskler

1. **F1 + F2 birlikte, "G0 hesaplanıyor" iddiasını kullanıcı açısından geçersiz kılıyor.** Motor
   doğru; ürün onu ne gösteriyor ne çalıştırıyor. Bir sonraki tur "G0 bitti" diye devam ederse
   yanılgı büyür.
2. **F7 ürün açısından bir veri işi, kod işi değil.** Kanıt tabloları boş kaldıkça her fırsat 18
   alacak ve G0 kapısı geçilemeyecek. Skorlayıcıyı "düzeltmek" yanlış refleks olur — `TopicStat`,
   `TenantProfile.keywords`, `Tenant.pic`, CORDIS seed'i gerekiyor. (Önceki tur da aynı kartı
   önermişti; hâlâ açılmamış.)
3. **F4 sunucu yeniden başlatılınca kaybolur** — yani bu bulguyu yeniden üretmek için önce bir
   fırsat yaratmak gerekiyor. Düzeltilmeden kapatılırsa "tekrar üretilemedi" diye kapanabilir.
4. Bu dalgada paralel ajanlar çalışıyor. Yalnız kendi dosyalarımı stage'ledim; `git diff --cached`
   ile doğruladım (§ Kanıt, commit çıktısı).

---

## 7. Açık sorular

1. **F1/F3 tek kart mı, iki kart mı?** İkisi de "sahte veri gerçekmiş gibi" deseni ama farklı
   dosyalar ve farklı çözümler: detay sayfası tamamen yeniden yazılmalı (DB'ye bağlan + kapı
   düğmesini `evaluateGate`'e bağla), konsorsiyum sayfasında ise yalnız `DEMO_OPPORTUNITIES`
   fallback'i silinip `notFound()` bırakılmalı. Ayrı kart öneriyorum.
2. **Rozet kapsamı göstermeli mi?** Önceki tur "eşik değil, kapsamı rozetin yanında göster" önermiş.
   F8'e bakınca ben de aynı fikirdeyim, ama `⭐ 18` ile `%18 kapsam` sayısal olarak çakıştığı için
   kapsam **yüzde olarak değil**, sözle gösterilmeli ("kanıt: 2/7 ölçüt"). Ürün/tasarım kararı.
3. **F5'in kök nedeni ne?** Veri katmanı 221 ms'de dönüyor, sayfa hiç render olmuyor. İzole etmedim.
4. **Açık karar #8** (kapı eşiği: composite ≥ 70 mi, PROJECT.md:75'in sert kuralları mı) hâlâ açık —
   ama F7 nedeniyle bugün pratik bir farkı yok: iki okumada da hiçbir fırsat geçmiyor.

---

## 8. Sonraki adım — önerilen kartlar

| Öneri | Öncelik | Kapsam |
|---|---|---|
| K1 · Fırsat detay sayfasını gerçek veriye bağla; `alert()` kapı tiyatrosunu `evaluateGate`'e bağla | **P0** | `pipeline/[id]/page.tsx` (F1 + F2) |
| K2 · Konsorsiyum `DEMO_OPPORTUNITIES` fallback'ini sil → `notFound()` | **P0** | `pipeline/[id]/consortium/page.tsx` (F3) · TASK-MTQUS5JH4DXJM ile birleştirilebilir |
| K3 · Bellek içi mağazayı gerçek fallback yap (yalnız DB yazımı başarısızsa), id'yi DB satırıyla eşle | **P0** | `pipeline/actions.ts` + `pipelineStore.ts` + `pipeline/page.tsx` (F4) |
| K4 · `/evaluations/panel` rotasının askıda kalmasını kök-nedenle | **P1** | (F5) — rozetin iki yüzeyi buna bağlı |
| K5 · `requireModule` kapısını M6 (ve diğer modül) rotalarına uygula | **P1** | (F6) — CLAUDE.md kural 3 |
| K6 · **Veri kartı:** `TopicStat` + `TenantProfile.keywords` + `Tenant.pic` + CORDIS seed'i. Kabul: `pnpm jobs:g0-rescore -- --tenant demo-tenant` kapsam ≥ %70 | **P1** | (F7) — önceki tur da önermişti |
| K7 · Pano rozeti: "AI Gate Uyum Skoru" başlığını düzelt, i18n'e taşı, "iç ön değerlendirme" + kanıt kapsamı ekle, renk eşiğini kapı eşiğiyle hizala | **P1** | `board.tsx:462-471` (F8) — ex-en'de duran iş |
| K8 · Evaluator Lens sayfasının kalan sabit Türkçe metinlerini `m6` namespace'ine taşı | **P1** | (F9) |
| K9 · Boş/eksik durum metinleri: "değerlendirilmedi", "veri yok" — sıfır göstermek yerine | **P2** | (F10, F16) |
| K10 · `dashboard/client.tsx` ölü dosyasını sil (uydurma fallback'leriyle birlikte) | **P2** | (F12) |
| K11 · Fırsat formu: sabit beş kişi yerine gerçek kiracı üyeleri; 2024 çağrı önerileri yerine `Topic` tablosundan | **P2** | (F13) |
| K12 · Temizlik: esr-calibration puan sütunu (F11), yetim `TopicMatch` (F14), `CONSORTİUM` büyük harf hatası (F15) | **P2** | |

---

## Definition of Done

- [x] G0 gerçek kullanımla denendi (determinizm dahil) — §2.1, 25 fırsat × 3 koşu
- [x] Eksik alan davranışı ölçüldü — §2.2, kanıt tablosu sayımı + kaynak izi + azami puan 18/100
- [ ] **Rozet 3+ yüzeyde doğrulandı — KARŞILANMADI.** Dört yüzeye eklenmiş, ikisi ulaşılabilir;
      diğer ikisi F5 nedeniyle erişilemez rotada. Ölçüm §4'te.
- [x] Sayılar SQL ile karşılaştırıldı — §2.3, dört KPI + pano kartları birebir
- [x] Bulgular etiketli (P0×4, P1×5, P2×7) + 12 kart önerisi, rapor dev'e commit edildi

---

## 9. Açılan kartlar (2026-09-07)

| Kart | Öncelik | Kapsam | Kanıt eki |
|---|---|---|---|
| TASK-MTQW4FY5E9UBK | P0 | Detay sayfası sabit 92/100 + `alert()` kapı tiyatrosu (F1 + F2) | ekran 05, 07 |
| TASK-MTQW5BVFW6CMT | P0 | Konsorsiyum `DEMO_OPPORTUNITIES` fallback'i → 404 (F3, F15) | ekran 06 |
| TASK-MTQW6CI3N76EF | P0 | Çift kart + hayalet kart: bellek mağazası koşulsuz yazıyor (F4) | ekran 02 |
| TASK-MTQW76AKXW8OP | P1 | `/evaluations/panel` sonsuz iskelet; rozetin 2 yüzeyi erişilemez (F5) | ekran 04 |
| TASK-MTQW8188AWOAT | P1 | `requireModule` hiçbir rotada uygulanmıyor; M6 kapalıyken kredi harcanabiliyor (F6) | ekran 03 |
| TASK-MTQW90XSQ1SU1 | P1 | Kanıt tabloları boş → azami puan 18/100, kapı geçilemez; VERİ işi (F7) | §2.2 |
| TASK-MTQWA2OAQFHRN | P1 | Rozet etiketi/kapsamı + Evaluator Lens `en` locale sabit Türkçe (F8, F9) | ekran 08 |
| TASK-MTQWBAJ2T5XSV | P2 | Temizlik paketi: yokluk≠sıfır, ölü pano dosyası, uydurma atananlar, artık kayıtlar (F10–F16) | §3 |

Sekiz kartın sekizi de S10, proje `cekirdek`. F17 (isabet oranı paydasının `g0Score IS NOT NULL`
sayması) ayrı kart açılmadı — bugün ısırmıyor, TASK-MTQW90XSQ1SU1 kanıt seed'i indikten sonra
yeniden ölçülmeli.
