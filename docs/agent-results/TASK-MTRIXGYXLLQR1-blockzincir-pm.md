# TASK-MTRIXGYXLLQR1 — Pro plana M6 (Evaluator Lens) gerçekten açıldı

## 1) Ne yapıldı

Patron kararı: Pro'ya Evaluator Lens (M6) modülü **gerçekten** verildi — public
fiyatlandırma sayfası aylardır bunu satıyordu, karttan çıkarmak müşteriden
özellik geri almak olurdu; maliyet zaten Pro'nun 500 YZ-kredi tavanıyla
sınırlı.

1. **`src/lib/billing/catalog.ts`** — `PLAN_GRANTS.pro.moduleIds`'e `'M6'`
   eklendi (`['M1','M2','M3','M4','M5','M6','M8']`). `Plan` tablosu
   (seed), her modül manifestosunun `planTiers`'ı (`plansGrantingModule('M6')`
   üzerinden) ve ayarlar sayfasındaki `canEnable()` kapısı tek bu listeden
   türediği için başka kod değişikliği gerekmedi.
2. **`messages/tr.json` + `messages/en.json`** —
   `billingPanels.settings.plans.pro.modules`: "Modüller: M1-M5, M8" →
   "Modüller: M1-M6, M8" (ve İngilizce eşdeğeri "Modules: M1-M6, M8").
   Not: `billingPanels.pricing.plans.pro` ve `billingPanels.admin.plans.pro`
   zaten "Evaluator Lens" diyordu (bkz. Açık sorular — üç ayrı yüzey var).
3. **`prisma/seed.ts`** — kod değişikliği yok; `Plan.modules` alanı
   `PLAN_GRANTS`'tan doğrudan türediği için `pnpm db:seed` çalıştırılıp DB'de
   doğrulandı (Kanıt §2.3).
4. **`docs/BILLING.md`** — §1 modül tablosunda `pro` satırı "M1-M5, M8" →
   "M1-M6, M8".
5. **Nöbetçi test** (`src/lib/billing/catalog.test.ts`):
   - Var olan `it('opens M6 and M7 on ultra only', ...)` testi, artık yanlış
     olduğu için `'opens M6 on pro and ultra, M7 on ultra only'` olarak
     güncellendi (`plansGrantingModule('M6')` artık `['pro','ultra']`
     bekliyor).
   - Yeni `describe('plan card copy matches grantsFor() exactly (tr + en)')`
     bloğu: `tr.json`/`en.json`'daki `billingPanels.settings.plans.<id>`
     kartlarını gerçekten parse edip (`M1-M6, M8` gibi aralıkları açarak)
     `grantsFor(planId)` ile **birebir** (iki yönlü set eşitliği)
     karşılaştırıyor; seats/credits sayılarını da karşılaştırıyor; "sınırsız/
     unlimited" kelimesinin bugün hiçbir kartta geçmemesi gerektiğini
     doğruluyor (hiçbir grant alanı gerçekten sınırsız değil). Bu, tam olarak
     bu görevin bulduğu hatayı (kartın kataloğun bir sürüm gerisinde kalması)
     bir daha sessizce geçmesin diye kalıcı bir nöbetçi.
6. **Gerçek tarayıcı doğrulaması** — demo-tenant zaten `pro` planındaydı ve
   M6 hiç etkinleştirilmemişti (temiz başlangıç durumu). Gerçek girişle
   (admin@yasinaslan.com.tr), Ayarlar → Modül Yönetimi sayfasında M6 kartı
   kilitsiz görüldü, "Etkinleştir" tıklanıp DB'ye yazıldığı doğrulandı, sonra
   `/tr/main/opportunities/demo-opp-1/evaluations` rotasına gidilip Evaluator
   Lens sayfasının gerçekten açıldığı görüldü. Test sonrası demo-tenant'ın
   M6 durumu (satır yok / OFF) orijinaline geri alındı — sadece plan
   (`pro`) zaten öyleydi, değiştirilmedi.

## 2) Kanıt

### 2.1 Nöbetçi test — ÖNCE KIRMIZI (mesajlar M1-M6 diyor, catalog.ts henüz M6 vermiyor)

```
$ npx vitest run src/lib/billing/catalog.test.ts

 FAIL  src/lib/billing/catalog.test.ts > plan entitlements > opens M6 on pro and ultra, M7 on ultra only
AssertionError: expected [ 'ultra' ] to deeply equal [ 'pro', 'ultra' ]
- Expected
+ Received
  [
-   "pro",
    "ultra",
  ]
 ❯ src/lib/billing/catalog.test.ts:262:39

 FAIL  src/lib/billing/catalog.test.ts > plan card copy matches grantsFor() exactly (tr + en) > tr/pro: modules line names exactly grantsFor('pro').moduleIds
AssertionError: tr/pro modules line "Modüller: M1-M6, M8" vs grant [M1, M2, M3, M4, M5, M8]: expected [ 'M1', 'M2', 'M3', 'M4', 'M5', …(2) ] to deeply equal [ 'M1', 'M2', 'M3', 'M4', 'M5', 'M8' ]
@@ -2,7 +2,8 @@
    "M1", "M2", "M3", "M4", "M5",
+   "M6",
    "M8", ]

 FAIL  src/lib/billing/catalog.test.ts > plan card copy matches grantsFor() exactly (tr + en) > en/pro: modules line names exactly grantsFor('pro').moduleIds
AssertionError: en/pro modules line "Modules: M1-M6, M8" vs grant [M1, M2, M3, M4, M5, M8]: expected [ 'M1', 'M2', 'M3', 'M4', 'M5', …(2) ] to deeply equal [ 'M1', 'M2', 'M3', 'M4', 'M5', 'M8' ]

 Test Files  1 failed (1)
      Tests  3 failed | 58 passed (61)
```

### 2.2 Nöbetçi test — SONRA YEŞİL (catalog.ts'e M6 eklendikten sonra)

```
$ npx vitest run src/lib/billing/catalog.test.ts

 RUN  v4.1.11 /Users/macbook/AgentSpace/fabrika

 Test Files  1 passed (1)
      Tests  61 passed (61)
```

### 2.3 seed.ts → Plan tablosu türetimi doğrulandı (kod değişikliği yok)

```
$ pnpm db:seed
Seeding Database...
...
Seeding completed with E10 data.

$ npx tsx -e "... prisma.plan.findUnique({where:{id:'pro'}}) ..."
["M1","M2","M3","M4","M5","M6","M8"]
```

### 2.4 `pnpm gate` (kapı temiz — kapsam-dışı tek dosyada önceden var olan hata hariç)

```
$ pnpm gate
$ eslint .
✖ 86 problems (0 errors, 86 warnings)          # tümü önceden var olan uyarılar, hata yok

$ tsc --noEmit
src/lib/billing/plan-repository.ts(17,15): error TS2305: Module '"@prisma/client"' has no exported member 'Prisma'.
... (aynı dosyada 5 hata daha)
[ELIFECYCLE] Command failed with exit code 2.
```

`plan-repository.ts` benim dokunmadığım, `git status`'ta `??` (izlenmeyen,
yeni) bir dosya — Dalga 2'de paralel çalışan başka bir ajanın bitmemiş işi.
Bu dosya hariç tutulunca:

```
$ npx tsc --noEmit 2>&1 | grep -v plan-repository.ts
(hiç çıktı yok — sıfır hata)

$ npx vitest run --exclude "src/lib/billing/plan-repository.test.ts"
 Test Files  76 passed | 2 skipped (78)
      Tests  825 passed | 8 skipped (833)

$ pnpm rls:verify
✅ Veritabanı 41 kiracıya özel tablonun tamamında izolasyonu uyguluyor.
```

`pnpm rls:check` de kapsam-dışı bir uyarı verdi: şemaya (başka bir ajanın
elindeki `prisma/schema.prisma`) yeni eklenmiş `PlanAssignment` modeli henüz
`prisma/rls.sql`'e eklenmemiş — bkz. Açık sorular. `rls:verify` (canlı ölçüm)
bunu zaten "migration bekliyor" diye doğru sınıflandırıp geçti.

Commit sırasında pre-commit hook da bunu bağımsız doğruladı:
```
⚠ Ağaçta senin OLMAYAN typecheck hataları var (başka bir ajan yazıyor olabilir): ...
  Bunlar commit'ini engellemiyor.
✓ Kapı temiz (staged kapsamı).
[dev 3c6b14e] fix(billing): grant M6 Evaluator Lens on the Pro plan
```

### 2.5 Gerçek tarayıcı — Pro kiracı, gerçek tıklama

- `docs/agent-results/TASK-MTRIXGYXLLQR1-screenshots/01-m6-enabled-toast.png`
  — Ayarlar → Modül Yönetimi, PRO planı, arama "M6" ile filtrelenmiş kart,
  "Etkinleştir" tıklandıktan sonra "✓ M6 modülü başarıyla aktifleştirildi!"
  toast'ı ve kart "AKTİF / Kullanıma hazır" durumunda.
- `docs/agent-results/TASK-MTRIXGYXLLQR1-screenshots/02-evaluator-lens-opened.png`
  — `/tr/main/opportunities/demo-opp-1/evaluations` rotası gerçekten açıldı:
  "MODÜL 6 — EVALUATOR LENS / İç Ön Değerlendirme & Hakem Simülasyonu"
  başlığı, "İç ön değerlendirme" uyarı rozeti, YZ Hakem Simülasyonu paneli.

DB doğrulaması (tıklamanın gerçekten veritabanına yazdığı):
```
$ npx tsx -e "... ModuleState.findUnique(demo-tenant, M6) ..."
current state before revert: {"status":"ON", "changedBy":"demo-user-superadmin", ...}
```
Test sonrası bu satır silinerek demo-tenant orijinal durumuna (M6 satırı yok)
geri alındı; plan zaten önceden `pro` olduğu için değiştirilmedi.

## 3) Değişen dosyalar

- `src/lib/billing/catalog.ts` — `PLAN_GRANTS.pro.moduleIds`'e `'M6'` eklendi
- `src/lib/billing/catalog.test.ts` — mevcut bir test güncellendi + yeni
  nöbetçi `describe` bloğu eklendi
- `messages/tr.json`, `messages/en.json` —
  `billingPanels.settings.plans.pro.modules` metni güncellendi
- `docs/BILLING.md` — §1 modül tablosu güncellendi

Commit: `3c6b14e fix(billing): grant M6 Evaluator Lens on the Pro plan` (dev)

## 4) Riskler

- Pro planındaki bir kiracı artık Evaluator Lens'i YZ kredisi harcayarak
  kullanabilir (M6 değerlendirme başına 3 kredi, `docs/BILLING.md` §1.1).
  Pro'nun aylık 500 kredi tavanı zaten var; ek bir kota/limit eklenmedi —
  patronun kararı zaten "maliyet 500 kredi tavanıyla kapalı" diyordu.
- `addon_m6` eklentisi (`docs/BILLING.md` §1.1, €99/ay, `grantsModule: M6`)
  artık Pro kiracıları için anlamsız hale geldi (zaten planda var) ama
  `AddOnCatalog` tablosunda 0 satır olduğu ve hiçbir satış yüzeyinde
  görünmediği belgelenmiş (`ADDON-USD-1` açık kararı) — dokunmadım.

## 5) Açık sorular

1. **`prisma/seed.ts:26`** — `ModuleCatalog` seed verisindeki M6 satırı
   `requires: ['M2', 'M11']` yazıyor, ama gerçek modül manifestosu
   (`src/modules/m6/manifest.ts:10`) `requires: []` diyor ve gate mantığı
   (`canEnable`, `src/lib/modules/state-machine.ts`) DAİMA manifestoyu okuyor
   — bu satır kullanılmıyor ama yanıltıcı. Eğer manifesto gerçekten
   `['M2','M11']` deseydi, M11 Pro'nun grant listesinde olmadığı için M6 hiç
   etkinleştirilemezdi; bunu tarayıcıda test edip manifestonun boş
   `requires` verdiğini doğruladım (Kanıt §2.5), yoksa görev burada tıkanırdı.
   `prisma/seed.ts` dosyasına dokunmam istenmediği için düzeltmedim.
2. **`docs/BILLING.md:260`** — §9'daki EUR→USD göç tablosu "`team` (€249) →
   `pro` ($87) ... Modül kümesi birebir aynı (M1–M5, M8)" diyor. Bu, göçün
   yapıldığı tarihteki (TASK-MTR6QIE05ZKNH) doğru bir tarihsel not; ama artık
   `pro`'nun güncel modül kümesini yanlış yansıtıyor (şimdi M6 de var). Bu
   satır bir tarihsel gerekçe kaydı olduğu için dokunmadım, ama okuyan biri
   yanlışlıkla "pro hâlâ M1-M5,M8" sanabilir.
3. **`src/lib/billing/plan-repository.ts` ve `plan-repository.test.ts`**
   (izlenmeyen/yeni dosyalar, `git status` `??`) — `tsc --noEmit` 6 hata
   veriyor (`Prisma` adlandırılmış export'u yok, birkaç implicit `any`,
   `PublishedPlanVersion` tipinde olmayan alanlar). Benim kapsamımda değil,
   dokunmadım; muhtemelen Dalga 2'de paralel çalışan başka bir ajanın bitmemiş
   işi.
4. **`prisma/schema.prisma` / `prisma/rls.sql`** — `pnpm rls:check` yeni bir
   `PlanAssignment` tenant-scoped modelinin `prisma/rls.sql`'e henüz
   eklenmediğini bildiriyor ("Add these to the FOREACH array"). `rls:verify`
   (canlı DB ölçümü) bunu "migration bekliyor" diyerek doğru sınıflandırıp
   geçti, engel olmadı. `prisma/schema.prisma`'ya dokunmam istenmediği için
   (denet-i'nin kapsamı) müdahale etmedim.

## 6) Sonraki adım

Bekleyen aksiyon yok — görev DoD'una göre tamamlandı. Yukarıdaki 4 madde
sahiplerine (madde 1 ve 2 muhtemelen bu görevi açan patron/PM kararına,
madde 3-4 ilgili ajanlara) bilgi amaçlı aktarılabilir.
