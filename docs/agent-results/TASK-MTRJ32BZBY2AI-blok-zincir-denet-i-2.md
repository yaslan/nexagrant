# TASK-MTRJ32BZBY2AI — Faz 1 ADIM 2: admin paket ekranı

**Ajan:** blok-zincir-denet-i (QA-EN) · **Tarih:** 2026-09-07 · **Dalga:** 3
**Kapsam:** `src/app/[locale]/admin/billing/plans/**`, `src/lib/billing/plan-repository.ts`, testler, `messages/*.json` (yalnız yeni `adminPlans` anahtarları)

---

## 1. Ne yapıldı

### 1.0 ÖNCE: ADIM 1 gerçekte inmemişti (bu dalganın tam olarak konusu)

ADIM 1 raporu "pnpm db:migrate reset ve seed başarılı / Typecheck geçiş" diyordu. Ölçtüm, **öyle değildi**:

- `PlanVersion`, `PlanFeature`, `PlanAssignment` tabloları veritabanında **yoktu**; `Plan.visibility` ve `Subscription.planVersionId` kolonları **yoktu**. `prisma/schema.prisma` düzenlenmiş ama hiçbir migration yazılmamış/uygulanmamıştı.
- `pnpm typecheck` yine de tertemizdi — çünkü `src/types/prisma-override.d.ts` model delegate'lerini `any` geçiyor. Bu, dalganın kapatmak istediği sınıfın ta kendisi.
- `pnpm rls:check` **KIRMIZIYDI**: `PlanAssignment` kiracıya özel bir model olarak taranıyor ama `prisma/rls.sql`'deki kanonik listede yoktu.
- `prisma/rls.sql`'deki platform politikası geçersiz SQL'di: `CREATE POLICY ... FOR INSERT, UPDATE, DELETE USING (false)`. Postgres'te bir politika tek komut adlandırır ve INSERT politikası `USING` değil `WITH CHECK` alır — dosya bu satırda komple patlıyordu.

Bunları düzelttim (ADIM 2'nin doğrulanabilmesi için ön koşuldu), sonra asıl işi yaptım.

### 1.1 Yönetim yüzeyi — `/admin/billing/plans`

- **(a)** Paket listesi + sürüm geçmişi tablosu + "Taslak oluştur / düzenle / yayınla" akışı.
- **(b) Yayınlanmış sürüm DEĞİŞMEZ.** `updateDraftVersion` / `publishVersion` / `discardDraftVersion` draft olmayan her sürümde `PublishedVersionImmutableError` fırlatır; düzenleme `createDraftVersion` ile bir sonraki sürüm numarasını alan yeni bir taslak yaratır ve taslağı canlı sürümden kopyalar. Yayın, önceki yayınlanmış sürümü `archived` yapar — abonelikler işaret ettiği şartları okumaya devam eder.
- **(c) Yayın öncesi zorunlu uyarı.** `computePublishImpact` kaç aktif kiracının limitinin düştüğünü ölçer. UI'da "Etkiyi hesapla"ya basılmadan **Yayınla düğmesi DOM'da yoktur**; ayrıca `publishVersion(versionId, actor, acknowledged)` sunucuda yeniden ölçer ve sayı tutmuyorsa `ImpactNotAcknowledgedError` ile reddeder. Yani kapı devre dışı bırakılmış bir düğme değil, sunucu tarafı bir kural.
- **(d) Kart maddeleri `ModuleCatalog`'tan.** Modül maddesi yalnızca o sürümün verdiği modüllerden seçilebilir; grant dışı ya da katalogda olmayan modül `ModuleNotGrantedError` ile reddedilir — hem kaydederken hem **yayınlarken** (kayıt kapısını atlayıp doğrudan tabloya yazılmış satır da yakalanır). UI'da picker zaten yalnız verilen modülleri listeler ve bir modül geri alınınca onu vaat eden madde de silinir.
- **(e) Aktif aboneliği olan paket SİLİNEMEZ.** `deletePlan` canlı abonelik varsa `PlanInUseError` verir; ekranda Sil düğmesi disabled + gerekçe metni, Arşivle açık.
- **(f) Her yayın denetim kaydı yazar.** `AuditEvent{ type: 'plan.version.published', actorId, createdAt, data: { impact, before, after } }`. Arşivleme, görünürlük değişimi, atama ve atama kaldırma da denetim kaydı yazar.
- **(g) Özel paket.** `visibility=private` + kiracı atama paneli (yalnız private pakette görünür); atanan kiracı listede görünür, kaldırılabilir.
- Tüm metinler i18n; `adminPlans` namespace'i **tr.json ve en.json'a aynı 110 satır** olarak eklendi. `billingPanels.settings.*` / `billingPanels.pricing.*` anahtarlarına **dokunulmadı** (her iki dosyada da 0 silme).
- Yazma yolları `requirePlatformAdmin()` arkasında; sayfa ayrıca `isPlatformAdminSession` ile kendini korur (layout'un korumasına güvenmez).

### 1.2 Çalışırken bulunan ve düzeltilen 4 gerçek hata

| # | Hata | Kök neden | Kanıt |
|---|------|-----------|-------|
| 1 | `listPublicPlans` her satırda `visibility: undefined` döndürüyordu | `select`'te `visibility` yoktu; filtre zaten 'public' kanıtlamıştı ama alan okunuyordu | ADIM 1'in kendi testi kırmızıydı → kodu düzelttim, testi değil |
| 2 | Taslak oluşturunca editör formu **sıfırlarda** kalıyor, "kaydet" paketi $0,00 / 1 koltuk / 0 krediye düşürüyordu | `createDraftAction` yalnız `versionId` döndürüyordu; form ilk state'inde kalıyordu | Ekran görüntüsü 04 (ilk çekim) — v2 satırı `$0,00 · 1/1/0` |
| 3 | Etki paneli "hiçbir kiracının limitini düşürmüyor" derken hemen altında "Düşen alanlar: koltuk, YZ kredisi / Kaldırılan modüller: M2, M3, M5" yazıyordu | Başlık `loweredTenantCount`'a bakıyordu; kiracı yoksa 0 ama sürüm yine de küçülüyor | Aynı ekran görüntüsü; artık `impact.loweredNoTenants` ayrı cümlesi var |
| 4 | ADIM 1'in test dosyası her koşuda kiracı+paket bırakıyordu — admin ekranında 4 gerçek paketin yanında **60 sahte "Test Plan"** | `beforeEach` var, `afterEach` yok | Ölçüm: `junk plans: 60 / junk tenants: 60`; temizlik eklendi + DB temizlendi |

2 ve 3 numaralı hatalar için **regresyon testi yazıldı ve kırmızı olduğu kanıtlandı** (aşağıda).

---

## 2. Kanıt

### 2.1 ADIM 1'in DB'ye inmediğinin ölçümü (düzeltmeden önce)

```
TABLES: AuditEvent, ModuleCatalog, Plan, Subscription
Plan.visibility: NO
Subscription.planVersionId: NO
delegate planVersion: object          ← typecheck'in gördüğü şey
ERR  The table `public.PlanVersion` does not exist in the current database.
```

`pnpm rls:check` (düzeltmeden önce):
```
❌ ERROR: The following tenant-scoped models are missing from prisma/rls.sql:
PlanAssignment
```

### 2.2 Migration uygulandıktan sonra

```
applied prisma/migrations/add-plan-versioning.sql
TABLES: AuditEvent, ModuleCatalog, Plan, PlanAssignment, PlanFeature, PlanVersion, Subscription
Plan.visibility: YES
Subscription.planVersionId: YES
PlanVersion rows: 4          ← backfill: her paketin v1'i, published
✅ prisma/rls.sql applied. Policies in public: 43 → 56
```

### 2.3 Birim testleri — `src/lib/billing/plan-admin.test.ts` (gerçek DB'ye karşı, mock değil)

```
 Test Files  1 passed (1)
      Tests  23 passed (23)
```

Kapsanan kurallar: yayınlanmış sürüm düzenlenemez / yayınlanamaz / silinemez · düzenleme yeni sürüm yaratır · ikinci taslak yığılmaz · yayın öncekini arşivler ve okunur bırakır · etki sayımı (koltuk, alan, kredi, kaldırılan modül) · sayı tutmayan yayın reddi + reddedilince taslak yerinde kalır · grant dışı madde reddi (kayıtta **ve** yayında) · katalogda olmayan modül reddi · canlı abonelikli paket silinemez / arşivlenir / abonelik sağ kalır · iptal edilmiş abonelik engellemez · denetim kaydı öncesi/sonrası · Plan projeksiyonunun aynalanması · private atama + idempotanlık + kaldırma.

ADIM 1 testi (kök neden düzeltildikten sonra): `Tests 10 passed (10)`.

### 2.4 Gerçek interaktif e2e — `tests/e2e/admin-plan-editor.spec.ts`

Gerçek tarayıcı, gerçek tıklama/yazma, gerçek oturum çerezi:

```
  ✓   1 lists plans with their versions and a live-tenant count (506ms)
  ✓   2 a published version is marked immutable and offers no edit control (445ms)
  ✓   3 editing a published plan creates a NEW draft version, leaving the live one alone (944ms)
  ✓   4 the publish button does not exist until the impact has been computed (1.2s)
  ✓   5 a card bullet cannot be set to a module the draft does not grant (1.0s)
  ✓   6 a plan with live subscriptions cannot be deleted, only archived (646ms)
  ✓   7 a private plan shows the tenant assignment panel; a public one does not (1.4s)
  ✓   8 the screen is refused to a session that is not a platform admin (340ms)
  ✓   9 publishing through the screen flips the version and writes an audit record (1.3s)
  ✓  10 creating a draft seeds the editor with the live version, not zeros (852ms)
  ✓  11 the impact headline never contradicts the fields it lists as lowered (1.0s)
  ✓  12 the English locale renders English labels, not Turkish (528ms)
  12 passed (10.7s)
```

9 numaralı test uçtan uca **gerçekten yayınlıyor**: taslak aç → alan doldur → kaydet → etkiyi hesapla → Yayınla → v2 "Yayında", v1 "Arşiv" → `AuditEvent.actorId = demo-user-admin`, `data.before.seats = 5`, `data.after.seats = 9`.

Süit iki kez arka arkaya koşuldu, ardından DB ölçüldü — **sızıntı yok**:
```
plans: basic:public:2:4500, pro:public:6:8700, ultra:public:15:14700, free:public:1:0
drafts left: 0 · tenants: 3
```

### 2.5 Regresyon testlerinin gerçekten kırmızı olduğu kanıtı (test gevşetilmedi)

Düzeltmeyi geri alıp aynı testleri koştum:

```
  ✘  1 creating a draft seeds the editor with the live version, not zeros
     Expected: "2"   Received: "1"
       locator resolved to <input value="1" data-testid="field-seats">
  ✘  2 the impact headline never contradicts the fields it lists as lowered
     Expected substring: not "hiçbir"
     Received string:  "Bu değişiklik hiçbir kiracının limitini düşürmüyor (0 aktif kiracı)."
  2 failed
```
Düzeltme geri konunca: `12 passed`.

### 2.6 `pnpm gate` — TAM ÇIKTI (yeşil)

```
$ eslint
✖ 84 problems (0 errors, 84 warnings)

$ tsc --noEmit
(çıktı yok — temiz)

$ vitest run --passWithNoTests
 Test Files  82 passed | 2 skipped (84)
      Tests  904 passed | 8 skipped (912)

$ tsx scripts/check-rls.ts
Found 41 tenant-scoped models requiring RLS policies:
... PlanAssignment ...
✅ SUCCESS: All 41 tenant-scoped models have RLS policies registered.

$ tsx scripts/check-rls-live.ts
Kiracıya özel model: 41 · RLS açık tablo: 47 · tenant_isolation politikası: 41
✅ Veritabanı 41 kiracıya özel tablonun tamamında izolasyonu uyguluyor.
```

### 2.7 Ekran görüntüleri

`docs/agent-results/TASK-MTRJ32BZBY2AI-screenshots/`
`01-plan-list` · `02-new-draft` · `03-publish-locked` · `04-impact-shown` · `05-grant-enforced` · `06-delete-blocked` · `07-private-assignment` · `08-english` · `09-published` · `10-draft-seeded` · `11-impact-honest`

---

## 3. Değişen dosyalar

**Yeni**
- `prisma/migrations/add-plan-versioning.sql` + `.down.sql`
- `src/app/[locale]/admin/billing/plans/page.tsx` · `client.tsx` · `actions.ts`
- `src/lib/billing/plan-admin.test.ts` (23 test)
- `tests/e2e/admin-plan-editor.spec.ts` (12 test)
- `docs/agent-results/TASK-MTRJ32BZBY2AI-screenshots/*.png` (11 kare)

**Değişen**
- `src/lib/billing/plan-repository.ts` — yazma katmanı; `listPublicPlans` visibility hatası
- `src/lib/billing/plan-repository.test.ts` — `afterEach` temizliği
- `prisma/rls.sql` — `PlanAssignment` kanonik listeye; geçersiz platform politikası düzeltildi
- `prisma/schema.prisma` — (ADIM 1'den bekleyen plan modelleri, bu commit'le iniyor)
- `messages/tr.json`, `messages/en.json` — yalnız `adminPlans` (110 satır ekleme, **0 silme**)

**Dokunulmayanlar (kural gereği):** `src/lib/billing/catalog.ts`, `billingPanels.settings.*` / `billingPanels.pricing.*`, `src/app/api/v1/**`, `src/lib/cordis-*.ts`.

---

## 4. Riskler

1. **`prisma generate` hâlâ kurulumun/kapının parçası değil.** Migration'ı elle yazıp uyguladım; tekrar-üretilebilir ve idempotent, ama `pnpm db:migrate` akışına bağlı değil. Başka bir makinede bu SQL koşulmadan ekran boş liste + hata durumu gösterir (uydurma satır göstermez).
2. **Etki ölçümü aktif abonelik sayısına dayanır**, kiracı başına gerçek kullanıma değil. "3 kiracının limiti düşüyor" der; "bu 3 kiracıdan 2'si zaten limitin üstünde" demez. ADIM 3'te gerçek kullanım karşılaştırması eklenebilir.
3. `Plan` projeksiyonu yayında güncelleniyor (mevcut `Plan` okuyucuları bozulmasın diye). Bu bilinçli çift-yazım; ADIM 3 üç yüzeyi `PlanVersion`'dan render edince tek kaynağa inmeli.
4. Paralel ajan yarışı: bu iş sırasında `tests/api/v1-partners.test.ts` ve `src/app/[locale]/calls/turkey/local-deadline.tsx` başka ajanlar tarafından değiştirildi; kapı ölçümüm o değişikliklerle **birlikte** yeşil. Kendi dosyalarımı tek tek stage'ledim (`git add -A` kullanılmadı).

---

## 5. Açık sorular (kapsam dışı — DÜZELTİLMEDİ, bildiriliyor)

### 5.1 ⚠️ EN ÖNEMLİSİ — `prisma generate` koşmak tip güvenliğini GERİ GETİRMİYOR

Dalganın varsayımı "`prisma generate` kapının parçası olmadığı için delegate'ler `any`" idi. Ölçtüm: **`prisma generate` koştuktan sonra bile proje `any` görüyor.**

`src/types/prisma-override.d.ts` bir ambient `declare module '@prisma/client'` ve projenin `include` kümesinde olduğu için node_modules çözümlemesini **yeniyor**. Kanıt — proje tsconfig'i içine konan sonda dosyası:

```ts
// src/lib/billing/__probe.ts
import { prisma } from '@/lib/db';
export const probe = () => prisma.plan.findMany({ where: { totallyBogusColumn: 1 } });
```
`prisma generate` koşulmuş, `.prisma/client` üretilmiş haldeyken `tsc --noEmit` (soğuk `tsconfig.tsbuildinfo`) → **hiçbir hata yok**.

Aynı satır proje dışında, doğrudan gerçek istemciye karşı derlenince:
```
error TS2353: Object literal may only specify known properties,
  and 'totallyBogusColumn' does not exist in type 'PlanWhereInput'.
error TS2339: Property 'thisTableDoesNotExist' does not exist on type 'PrismaClient<...>'.
```

**Sonuç:** M8'deki `prisma.organization` sınıfını kapatmak için `prisma generate`'i kapıya eklemek **yetmez**; `src/types/prisma-override.d.ts` daraltılmalı ya da kaldırılmalıdır. Aksi halde şemada olmayan tabloya çağrı yine görünmez. Bu kararı almadım — kapsamım değil.

İkincil gözlem: oturum sırasında bir ara `tsc` `src/app/api/v1/partners/[pic]/route.ts` ve `src/lib/cordis-sync.ts` / `cordis-delta.ts` içinde 20 adet `TS7006 implicit any` hatası verdi; soğuk cache ile tekrar üretemedim, bu yüzden **kesin bulgu olarak sunmuyorum** — ama override kaldırılırsa bu dosyaların ilk kırılacaklar olması muhtemel.

### 5.2 `pnpm dev` açılış sayfası 500 veriyor — tüm e2e kapısını bloke ediyor

`GET /tr` ve `GET /en` → **500**:
```
⨯ Error: Invalid src prop (https://images.unsplash.com/photo-1522071820081-009f0129c71c?...)
  on `next/image`, hostname "images.unsplash.com" is not configured under images in your `next.config.js`
```
Kaynak: blog verisindeki unsplash URL'leri (`src/app/[locale]/admin/blog/actions.ts` varsayılanları bu host'u yazıyor) + `next.config` içinde `images.remotePatterns` tanımı yok.

**Etkisi kozmetik değil:** `playwright.config.ts` webServer hazır-olma sondası `/`'ı çağırır, 500 alır, sunucuyu hazır saymaz ve **`pnpm test:e2e` hiç başlamaz**. Bu görevin e2e'sini koşabilmek için sondayı `/logo.png`'ye çeviren geçici bir yerel config kullandım (commit edilmedi). Bu bir P1: e2e kapısı şu anda repo genelinde kapalı.

### 5.3 `tests/api/v1-partners.test.ts:186` kendi fixture'ıyla çelişiyordu

`topic.findMany` `[]` döndürecek şekilde mock'lanmışken test `body.data.length > 0` bekliyordu — geçmesi imkânsızdı. Ben bakarken **başka bir ajan bunu düzeltti** (artık `toEqual([])` bekliyor) ve kapı yeşile döndü. Bilgi olarak bırakıyorum.

### 5.4 `src/app/[locale]/calls/turkey/local-deadline.tsx:31` lint hatası

`Calling setState synchronously within an effect can trigger cascading renders` — iş sırasında kapıyı kırmızı tutuyordu, sonra başka bir ajan tarafından giderildi. Kapsamım dışıydı, dokunmadım.

### 5.5 `next dev` aynı dizinde ikinci sunucuya izin vermiyor

Paralel ajanlar aynı repo dizininde çalışırken ikinci bir `next dev` "Another next dev server is already running" ile ölüyor; Playwright'ın `webServer`'ı da bu yüzden düşüyor. Dalga boyunca ajanların **tek bir paylaşılan dev sunucusunu** kullanması (ya da `distDir`'ı ayrıştıran bir e2e profili) gerekiyor.

---

## 6. Sonraki adım (ADIM 3, bu kartta yok)

- Üç yüzeyin (pricing sayfası, settings faturalama paneli, checkout) `PlanVersion`'dan render'ı — `plansVisibleToTenant` ve `getPublishedVersion` hazır bekliyor.
- Checkout'ta `Subscription.planVersionId` yazılması: kiracı hangi şartlarla satın aldıysa o sürüme çivilensin (`price-lock.ts` ile aynı ilke).
- ADIM 3 bittiğinde `Plan` projeksiyonuna çift-yazım kaldırılabilir.

---

## 7. Definition of Done

- [x] `/admin/billing/plans`: paket listesi + sürüm geçmişi + taslak oluştur/düzenle/yayınla
- [x] Yayınlanmış sürüm değişmez; düzenleme yeni sürüm yaratır — **testi var** (birim + e2e)
- [x] Yayın öncesi zorunlu uyarı; N gösterilmeden yayın düğmesi yok **ve** sunucu sayıyı doğrulamadan yayınlamıyor
- [x] Kart maddeleri `ModuleCatalog`'tan; grant dışı modül satırı yazılamaz (kayıtta ve yayında)
- [x] Aktif aboneliği olan paket silinemez → arşivlenir
- [x] Her yayın denetim kaydı yazar (kim, ne zaman, öncesi/sonrası)
- [x] `visibility=private` + kiracıya atama; atanan kiracı listede görünür
- [x] Tüm metin i18n, iki dil (110/110 satır, 0 silme)
- [x] Yazma yolları `requirePlatformAdmin()` arkasında; sayfa ayrıca kendini koruyor
- [x] Gerçek interaktif test koşuldu ve kanıtlandı (12 e2e, gerçek tıklama, 11 ekran görüntüsü)
- [x] Bulunan her hata tekrar-üretilebilir; regresyon testleri kırmızı→yeşil kanıtlandı
- [x] Test gevşetilerek geçilmedi (ADIM 1 testi kırmızıydı → **kod** düzeltildi)
- [x] `pnpm gate` yeşil, tam çıktı raporda
- [x] Kapsam dışına çıkılmadı; bulunan kapsam dışı hatalar dosya+satır ile bildirildi
