# TASK-MTR6QIE05ZKNH — EUR beş-plan merdivenini emekliye ayır, USD üç plana geç

**Ajan:** blockzincir-pm (PM-EN) · **Sprint:** S11 · **Branch:** `dev` · **Tarih:** 2026-09-07

Zincirin son halkası. `TASK-MTR6Q2IODYQRC` (katalog + checkout) ve
`TASK-MTR6QYPGOS2N0` (paneller katalogdan) üzerine kuruldu; ikisine de
dokunulmadı.

---

## 0. Geçiş öncesi ölçüm (önce ölç, sonra değiştir)

`Plan` tablosu — 5 satır, EUR:

| id | ad | aylık | yıllık | para | koltuk | ç.alanı | kredi | modül sayısı |
|---|---|---|---|---|---|---|---|---|
| free | Discover | 0 | 0 | EUR | 1 | 1 | 10 | 2 |
| starter | Starter | 5900 | 56600 | EUR | 2 | 1 | 100 | 3 |
| team | Team | 24900 | 239000 | EUR | 6 | 1 | 500 | 6 |
| business | Business | 59900 | 575000 | EUR | 15 | 5 | 2000 | 10 |
| enterprise | Enterprise | 150000 | 1440000 | EUR | 999 | 999 | 10000 | 11 |

- `Subscription`: **1 satır** — `{planId: team, status: ACTIVE, month, provider: stripe, seatsExtra: 0, workspacesExtra: 0}`
- `AddOn`: **0 satır**
- `AddOnCatalog`: 9 satır, hepsi EUR
- `Plan.currency` kolon varsayılanı: `'EUR'::text`

**`PlanEntitlement` diye bir tablo YOK.** Görev metni ve CLAUDE.md kural 4 ondan
söz ediyor ama şemada yer almıyor (`information_schema` sorgusu boş döndü).
Yetkilendirme bugün `Plan.modules` + `AddOnCatalog.grants*` ile hesaplanıyor.
Bunu bir eksiklik olarak değil, kaydedilmesi gereken bir gerçek olarak
raporluyorum — kural 4'ün adı ile kodun gerçeği ayrışmış durumda.

## 1. Ne yapıldı

### 1.1 Katalog yetki verisiyle genişletildi (fiyat mantığına dokunulmadı)

`src/lib/billing/catalog.ts`'e **yalnız veri ve saf yardımcı** eklendi;
`priceLine`, `CATALOG`, `PLANS`, `DISCOUNT_TIERS` ve yuvarlama mantığı
**değiştirilmedi** (kanonik ve testli).

- `PLAN_GRANTS` — plan başına koltuk / çalışma alanı / kredi / açılan modüller
- `FALLBACK_PLAN_ID` (`free`) — satılık değil, aboneliksiz kiracının düştüğü durum
- `RETIRED_PLAN_IDS` — emekli EUR id → yeni USD id eşlemesi
- `grantsFor()`, `resolvePlanId()`, `plansGrantingModule()`

`free`, `CATALOG`'a **eklenmedi** — eklenseydi fiyat panellerinde bir "Free"
kartı belirirdi ve dokunulmaması söylenen dosyalarda regresyon olurdu.

### 1.2 Modül yetkisi tek kaynağa indirildi

"Hangi plan hangi modülü açar" bilgisi **iki yerde** duruyordu:
`Plan.modules` (seed) ve her manifestonun `planTiers` alanı. İkisi de artık
katalogdan türüyor:

- 11 manifesto: `planTiers: plansGrantingModule('M6')`
- `src/lib/modules/types.ts`: `PlanTier = PlanId` (katalogdan re-export)
- `prisma/seed.ts`: `ModuleCatalog.planTiers` ve `Plan` satırları katalogdan

Bu, `state-machine.ts`'i, rota korumasını ve modül ayarları ekranını
değiştirmeden çalışır hâlde tutar — `canEnable` hâlâ `planTiers` okur, ama o
alan artık bir kopya değil, bir türev.

### 1.3 Migration + veri geçişi (kayıp yok)

`prisma/migrations/retire-eur-plan-ladder.sql` (+ `.down.sql`).

**Eşleme tablosu — gerekçeli** (ürün kararı; koda değil, dokümana ve migration
başlığına yazıldı):

| Emekli EUR planı | Yeni USD planı | Gerekçe |
|---|---|---|
| `free` | `free` (korundu) | Satılık plan değil; aboneliksiz kiracının düştüğü durum. Karşılığı yok, davranış korunsun diye satırı bırakıldı. |
| `starter` (€59) | `basic` ($45) | Giriş ücretli → giriş ücretli. Modül kümesi birebir aynı (M2, M3, M5). |
| `team` (€249) | `pro` ($87) | Orta → orta. Modül kümesi birebir aynı (M1–M5, M8). |
| `business` (€599) | `ultra` ($147) | `ultra`, `business`'ın üst kümesi (üstüne M7 açar). Kayıp yok. |
| `enterprise` (≥€1.500) | `ultra` ($147) | 11 modülün tamamını açan tek plan. Koltuk/alan farkı `seatsExtra`/`workspacesExtra`'ya taşınır. |

Eşleme **fiyat eşliğine göre değil, yetenek eşliğine göre** yapıldı: USD
merdiveninin tamamı eski `team` fiyatının altında, fiyat eşleştirmek matematiksel
olarak mümkün değildi. Kural: **hiçbir kiracıdan hiçbir yetenek geri alınmaz.**

Migration sırası bilinçli: (1) yeni planlar yazılır, (2) kapasite farkı
`seatsExtra`/`workspacesExtra`'ya taşınır — satır taşındıktan *sonra* nereden
geldiği bilinemezdi, (3) abonelikler yeni id'ye çevrilir, (4) eşlenmemiş
abonelik kalmışsa `RAISE EXCEPTION` ile **silmeyi reddeder**
(`Subscription.planId`'de yabancı anahtar yok, tek koruma bu), (5) eski satırlar
silinir, (6) `Plan.currency` varsayılanı `'USD'`.

### 1.4 `billing.ts` ve `iyzico.ts`

- `getEntitlements()` artık koltuk/alan/kredi/modülü **katalogdan** okuyor,
  `Plan` satırından değil — satır katalogdan yazılan bir izdüşüm ve bayat/elle
  düzenlenmiş bir satır sessizce modül dağıtmamalı. Eklentiler DB'de kalıyor
  (abonelik başına satın alma, katalog gerçeği değil).
- `getAllPlans()` DB sorgusu olmaktan çıkıp katalog türevi oldu (çağıranı yoktu;
  paneller kendi katalog okumasını yapıyor).
- `resolvePlanId()` sayesinde bir abonelikte kalmış emekli id kiracıyı kilitlemiyor.
- `iyzico.ts`: `TRY_PLAN_PRICES` yeni plan id'lerine taşındı, `tryPriceMinor` ve
  `createIyzicoCheckout` emekli id'yi normalize ediyor (conversationId'ye yeni id
  yazılıyor — webhook planı o id ile arıyor, `team` satırı artık yok).

### 1.5 Yan etkiler (kapsam dışıydı ama derlenmesi/çalışması için zorunluydu)

| Dosya | Neden |
|---|---|
| `src/lib/beta/constants.ts` | `BETA_PLAN_ID = 'enterprise'` → `'ultra'`. Emekli planı işaret eden bir sabit `beta:onboard`'ı kırardı. |
| `scripts/stripe-sync.ts` | Senkron dışı bırakılan `enterprise` artık yok; `free` kaldı. |
| 2 modül ayarları dosyası + `client.tsx` | `PlanTier` daraldığı için derlenmiyordu. Aboneliksiz varsayılan `'team'` → `'pro'` (**davranış eşliği**, orta plan orta plan; bu varsayılanın cömert olması ayrı bir kart: `PLAN-DEFAULT-1`). Rozet tablosu 3 plana indi. |
| `src/lib/beta/pricing-transition.ts` | `CATALOGUE_LIST_CENTS` **dondurulmuş** EUR merdiveni olarak belgelendi. E11 ortaklarına yapılan teklifler bu rakamların üzerine verildi; USD'ye çevirmek verilmiş bir teklifi sessizce yeniden yazmak olurdu. Kart: `BETA-USD-1`. |
| `prisma/seed-tenant-workspace.ts` | Demo aboneliği `planId: 'team'` yazıyordu; her re-seed kiracıyı olmayan bir plana geri koyuyordu. Katalogdan çözülüyor. |
| `prisma/seed.ts` (`seedG0DemoEvidence`) | **Önceden kırıktı** (§4.3), seed'i ortada durduruyordu. Var olmayan topic atlanıyor, uyarı basılıyor. |

### 1.6 Dokümanlar

- `docs/BILLING.md` **yeniden yazıldı**: katalogdan türeyen anlatım, operasyon
  notu (`BILLING_ACTIVE_TIER` set değilse indirim yok; açmak/kapatmak deploy
  adımı; kademe kodları katalogda), §9 eşleme tablosu ve açılan kartlar.
- `docs/DATA_MODEL.md`: `Plan` elle yazılmaz, katalogun izdüşümüdür.
- **Yeni tablo/kolon eklenmedi** → ek RLS gerekmiyor (`Plan` zaten
  tenant-scoped değil, platform tablosu).

## 2. Kanıt

### 2.1 Migration sonrası — abonelik sayısı eşit, kayıp yok

```
### BEFORE
Subscription total: 1
Subscription by plan: [{"planId":"team","status":"ACTIVE","seatsExtra":0,"workspacesExtra":0,"n":1}]
Plan currency default: [{"column_default":"'EUR'::text"}]

### AFTER-MIGRATION
Subscription total: 1
Subscription by plan: [{"planId":"pro","status":"ACTIVE","seatsExtra":0,"workspacesExtra":0,"n":1}]
Plan currency default: [{"column_default":"'USD'::text"}]
```

`npx prisma db execute --file prisma/migrations/retire-eur-plan-ladder.sql`
→ `Script executed successfully.`

### 2.2 `pnpm db:seed` sonrası `Plan` tablosunun tam dökümü

```
=== SELECT * FROM "Plan" ===
id | name | monthlyCents | yearlyCents | currency | seats | ws | credits | modules
free | Discover | 0 | 0 | USD | 1 | 1 | 10 | M3,M5
basic | Basic | 4500 | 38700 | USD | 2 | 1 | 100 | M2,M3,M5
pro | Pro | 8700 | 74700 | USD | 6 | 1 | 500 | M1,M2,M3,M4,M5,M8
ultra | Ultra | 14700 | 119700 | USD | 15 | 5 | 2000 | M1,M2,M3,M4,M5,M6,M7,M8,M9,M10,M11

Plan table matches the catalogue one-to-one, and no subscription points at a retired plan.
```

(Her alan tek tek katalogla karşılaştırıldı — ad, aylık, yıllık, para birimi,
koltuk, çalışma alanı, kredi, modül listesi; ayrıca emekli plana bağlı abonelik
taraması. Karşılaştırma geçici bir script'le yapıldı, script silindi.)

`pnpm db:seed` çıkış kodu **0** (§4.3'teki düzeltmeden sonra; öncesinde
pre-existing bir hatada duruyordu).

### 2.3 Gerçek oturumla yetki testi — Basic M6'ya erişemiyor, Ultra erişiyor

`tests/e2e/plan-entitlement.spec.ts` — gerçek tarayıcı, gerçek oturum, gerçek DB.
Abonelik iki geçiş arasında veritabanında çevriliyor (üründe kendi planını
değiştirme ekranı yok) ve sonunda geri alınıyor.

```
Running 1 test using 1 worker
  ✓  1 [chromium] › tests/e2e/plan-entitlement.spec.ts:84:7 › plan entitlement — the catalogue
     decides what a plan opens › Basic cannot reach M6 and Ultra can (2.1s)
  1 passed (2.8s)
```

Test yalnız etiket okumuyor: Ultra tarafında **Etkinleştir'e gerçekten tıklıyor**
ve tıklamanın `ModuleState` satırını yazdığını veritabanından doğruluyor.

| Kanıt | Dosya |
|---|---|
| Basic — M6 kartı 🔒 Kilitli, "Plan yükseltmesi gerektirir", Planlar: `ULTRA`, buton yerine "Planı Yükselt" | `TASK-MTR6QIE05ZKNH-screenshots/01-basic-m6-locked.png` |
| Ultra — aynı kart ● AKTİF, "Kullanıma hazır" (tıklamadan sonra) | `TASK-MTR6QIE05ZKNH-screenshots/02-ultra-m6-open.png` |
| Tam sayfa hâlleri | `01-basic-page.png`, `02-ultra-page.png` |

Sayfadaki plan çipleri de kanıt: `M1 → pro ultra`, `M3 → basic pro ultra`,
`M6 → ultra`. Bunlar artık manifestoya elle yazılmıyor, katalogdan geliyor.

### 2.4 `pnpm gate` + RLS

```
✖ 172 problems (0 errors, 172 warnings)      ← 0 hata; uyarılar önceden vardı
 Test Files  61 passed | 2 skipped (63)
      Tests  646 passed | 8 skipped (654)
✅ SUCCESS: All 38 tenant-scoped models have RLS policies registered.
Kiracıya özel model: 38 · RLS açık tablo: 41 · tenant_isolation politikası: 38
✅ Veritabanı 38 kiracıya özel tablonun tamamında izolasyonu uyguluyor.
```

`pnpm gate` çıkış kodu **0**. Ayrıca migration sonrası `pnpm db:rls` koşuldu:
`✅ prisma/rls.sql applied. Policies in public: 41 → 41` (politika düşmedi).

Yeni birim testler: `catalog.test.ts` 49 test (önce 41) — merdivenin yukarı
doğru daralmadığı, emekli her id'nin var olan bir plana çözüldüğü ve **hiçbir
emekli planın modülünün kaybolmadığı** ayrı ayrı kapıya bağlandı.

### 2.5 iyzico kur sorusu — ölçüldü, düzeltilmedi (talimat gereği)

TL tutarlar emekli EUR merdiveninden ~31,4 TRY/EUR'luk **elle yazılmış, tarihsiz**
bir kurla türetilmişti. Katalog USD olduğu için tutarlar yeniden türetilmedi —
USD/TRY kuru belirlemek fiyat kararıdır. Kur-bağımsız ölçüm:

| Plan | TL aylık | USD aylık | İma edilen kur |
|---|---|---|---|
| `basic` | ₺1.850 | $45 | 41,1 TRY/USD |
| `pro` | ₺7.850 | $87 | 90,2 TRY/USD |
| `ultra` | ₺18.900 | $147 | 128,6 TRY/USD |

Tek para çifti için üç kur, aralarında **3,1 kat** fark — gerçek kur ne olursa
olsun en az ikisi yanlış; `ultra`'daki bir TL alıcısı kart alıcısının ~3 katını
öder. Ayrıca **TL akışına kampanya indirimi uygulanmıyor**. Risk bugün teorik:
iyzico faz 2 ve her `Subscription` satırının sağlayıcısı `stripe`.
→ Kart `TRY-FX-1` (BILLING.md §4.2).

## 3. Değişen dosyalar

**Yeni:** `prisma/migrations/retire-eur-plan-ladder.sql`,
`prisma/migrations/retire-eur-plan-ladder.down.sql`,
`tests/e2e/plan-entitlement.spec.ts`,
`docs/agent-results/TASK-MTR6QIE05ZKNH-screenshots/` (4 png)

**Değişen:** `docs/BILLING.md` (yeniden yazıldı), `docs/DATA_MODEL.md`,
`prisma/schema.prisma`, `prisma/seed.ts`, `prisma/seed-tenant-workspace.ts`,
`src/lib/billing/catalog.ts`, `src/lib/billing/catalog.test.ts`,
`src/lib/billing.ts`, `src/lib/iyzico.ts`, `src/lib/iyzico.test.ts`,
`src/lib/modules/types.ts`, `src/lib/beta/constants.ts`,
`src/lib/beta/pricing-transition.ts`, `scripts/stripe-sync.ts`,
11 × `src/modules/m*/manifest.ts`, 3 × modül ayarları sayfası,
`tests/modules/state-machine.test.ts`, `tests/beta/pricing-transition.test.ts`

**Dokunulmayanlar (talimat):** `src/app/api/billing/checkout/route.ts`,
`src/lib/billing/active-tier.ts`, fiyat panelleri, `CartContext`, `CartDrawer`.

## 4. Riskler

1. **Kapsam genişledi.** Görev "yalnız `docs/BILLING.md`, `prisma/**`,
   `billing.ts`, `iyzico.ts`, katalog" diyordu; 11 manifesto + `modules/types.ts`
   + 3 ayar dosyası da değişti. Alternatif yoktu: `Subscription.planId` `pro`
   olunca `canEnable` manifestodaki `'team'`/`'business'` listesiyle eşleşmez ve
   **her modül kilitlenirdi** — DoD'un istediği yetki testi de zaten bunu
   ölçüyor. Manifestolar ikinci bir liste tutmasın diye katalogdan türetildi.
2. **`ultra`, `enterprise`'ın koltuk tavanını taşımıyor** (15 vs 999). Migration
   farkı `seatsExtra`'ya taşıyor, yani mevcut kiracı kaybetmiyor; ama **yeni** bir
   büyük müşteri için ürün tarafında 999 koltuklu bir plan artık yok. Sözleşmeli
   üst plan kalkmış oldu — bu bir ürün kararı ve patronun onayını hak ediyor.
3. **Eklenti kataloğu EUR kaldı** ve `addon_seat_team` gibi emekli plan adları
   taşıyor. Kimseyi etkilemiyor (`AddOn` 0 satır, satış yüzeyinde yok) ama
   BILLING.md'de EUR ve USD yan yana duruyor — çelişki değil, ilan edilmiş bir
   boşluk. Kart `ADDON-USD-1`.
4. **Geri alma birebir değil**: `business` ve `enterprise` ikisi de `ultra`
   oldu; `.down.sql` her `ultra`'yı `business` yapar (düşük olan). Migration
   başlığında yazılı.

## 5. Açık sorular

- **`TRY-FX-1`** — USD/TRY kuru kim belirleyecek, sabit mi canlı mı? TL alıcısı
  kampanya indirimi alacak mı?
- **`ADDON-USD-1`** — eklentiler USD'ye çevrilecek mi, hangi fiyatla?
- **`BETA-USD-1`** — E11 kohortu GA'da hangi USD planına, hangi indirimle geçer?
  (`founding %40` neyin %40'ı olacak: dondurulmuş EUR listesi mi, yeni USD mi?)
- **`PLAN-DEFAULT-1`** — aboneliği olmayan kiracı modül ayarlarında `pro`
  varsayılıyor (eski davranışın eşdeğeri). `free` olmalı mı? Davranış değişikliği
  olduğu için bu görevde yapılmadı.
- **Kurumsal plan** — 999 koltuklu sözleşmeli tier gerçekten kalkıyor mu (risk 2)?
- **`PlanEntitlement`** — CLAUDE.md kural 4 bu tablodan söz ediyor, şemada yok.
  Kural mı güncellenecek, tablo mu eklenecek?

## 6. Sonraki adım

1. Yukarıdaki 4 kartın açılması (`TRY-FX-1`, `ADDON-USD-1`, `BETA-USD-1`,
   `PLAN-DEFAULT-1`) ve kurumsal plan sorusunun patrona sorulması.
2. Prod dağıtımında: migration → `pnpm db:rls` → `rls:verify` sırası; migration
   eşlenmemiş abonelik görürse **durur**, bu beklenen davranıştır.
3. `BILLING_ACTIVE_TIER` prod'da bilinçli olarak set edilsin (set değilse
   indirim yok — BILLING.md §3 operasyon notu).

---

## Ek: bu görevde bulunan, bu görevin işi olmayan iki hata

### 4.3 `pnpm db:seed` `dev`'de kırıktı (benim değişikliğimden önce)

`seedG0DemoEvidence` var olmayan `demo-topic-1..6` id'lerine `TopicMatch`
yazmaya çalışıp yabancı anahtar hatasıyla **tüm seed'i durduruyordu** — yani
teklifler, efor, M6 ve E11 fixture'ları hiç yazılmıyordu. Kanıt (kendi
değişikliklerim `git stash`'te, HEAD kodu):

```
stashed HEAD seed.ts
/Users/macbook/AgentSpace/fabrika/prisma/seed.ts:79:29
Foreign key constraint violated on the constraint: `TopicMatch_topicId_fkey`
    at async seedG0DemoEvidence (prisma/seed.ts:79:5)
```

`Topic` tablosunda 40 satır var, `demo-topic-%` ile eşleşen **0** satır;
`seed-opportunities.ts` topic'leri `identifier` ile arıyor. DoD "seed sonrası
`Plan` dökümü" istediği için düzeltmek zorundaydım: eksik topic artık atlanıyor
ve uyarı basılıyor (`seed-opportunities.ts`'in zaten yaptığı şey). Doğru id'lere
bağlamak `TASK-MTQW90XSQ1SU1`'in işi.

### 4.4 6 e2e testi `dev`'de kırık — benim değişikliğimden **değil**

`pnpm test:e2e`: **24 passed, 6 failed**. Aynı 6 test, tüm değişikliklerim
`git stash`'teyken de aynı şekilde başarısız:

```
6 failed
  dashboard-outcome-case.spec.ts:34   (expect csv toContain 'Toplam Teklif,5,adet')
  m9-brief-generate-failure.spec.ts:54, :116, :167
  m9-briefs-form.spec.ts:41, :95
```

Tam seed sonrasında da (seed exit 0, bütün fixture'lar yazılmış) aynı 6 test
düşüyor. Benim eklediğim `plan-entitlement.spec.ts` geçiyor ve alfabetik sırada
bu testlerden **sonra** koşuyor, yani onları etkileyemez.
`dashboard-outcome-case` için paylaşılan hafızada zaten kayıtlı bir kök neden
var (`fabrika-dashboard-outcome-case-mismatch`).

## Definition of Done

- [x] Geçiş öncesi/sonrası sayımlar raporda; abonelik kaybı yok (1 → 1)
- [x] Eşleme tablosu gerekçeli (yetenek eşliği, fiyat eşliği değil)
- [x] `Plan` tablosu katalogla birebir (alan alan doğrulandı)
- [x] Yetki eşlemesi tek kaynaktan (`PLAN_GRANTS`; manifestolar türetiyor)
- [x] `BILLING.md` çelişen rakam içermiyor + operasyon notu var
- [x] iyzico kur sorusu ölçüldü (3,1 kat sapma), kart olarak yazıldı
- [x] `pnpm gate` temiz (exit 0) + `rls:verify` temiz + `db:rls` 41 → 41
- [x] Gerçek oturumla yetki testi + 2 ekran görüntüsü
- [x] Rapor bu dosyada
