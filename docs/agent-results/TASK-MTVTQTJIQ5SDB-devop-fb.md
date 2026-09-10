# TASK-MTVTQTJIQ5SDB — MarketplaceListing: written tenant-owned, read by everyone

**Ajan:** devop-fb (DevOps / Altyapı) · **Tip:** bug (kiracı izolasyonu) · **Tarih:** 2026-09-10
**PLATFORM BEYANI:** macOS (darwin 25.6.0, Node v26.5.0, Postgres docker-compose) üzerinde doğrulandı.
Dokunulan kod yolu platforma bağlı **değil** — Prisma `where` cümlesi, `set_config` ve bir Next
server component. Süreç öldürme, dosya yolu, kabuk/ikili adı, ekran/DPI veya cihaz izni içermiyor;
Windows/Linux'ta aynı davranır. Windows ve Linux'ta **koşulmadı** — bu makinede o ortamlar yok.

---

## 1. Ne yapıldı

Kartın üç parçalı çelişkisi ölçüldü, sebebi bulundu, karardan bağımsız güvenli düzeltme yapıldı ve
iki ayrı seviyede (sorgu sınırı + gerçek tarayıcı) kanıtlandı. Ürün kararı **açık bırakıldı** ve §6'da
1-3-1 olarak patrona sunuldu.

**Çelişki gerçekti ve tek bir kök nedeni var.** `page.tsx:21`'deki okuma yalnızca sarmalayıcısız
değildi — `where` cümlesi **hiç yoktu** (ne kiracı ne `status` filtresi):

```ts
listings = await prisma.marketplaceListing.findMany({ orderBy: { createdAt: 'desc' } });
```

Asıl sebep hafızadaki bulgunun doğrulanmasıdır: **uygulamanın bağlandığı rol RLS'e tabi değil.**
`DATABASE_URL` rolü `fabrika`, `rolsuper=true, rolbypassrls=true` (§2.1). Yani `prisma/rls.sql:13`'teki
`tenant_isolation` politikası bu bağlantıda hiç değerlendirilmiyor ve çıplak okumayı hiçbir şey
durdurmuyor.

Bunun ikinci ve daha sinsi yüzü şu: aynı kusur iki rolde **zıt yönlerde** patlıyor.

| Rol | Politika uygulanır mı | Çıplak okumanın sonucu |
|---|---|---|
| `fabrika` (bugünkü `DATABASE_URL`) | Hayır (BYPASSRLS) | **Her kiracının ilanı** döner — sızıntı |
| `fabrika_app` (doğru yapılandırılmış kurulum) | Evet | `app.tenant_id` açılmadığı için `"tenantId" = NULL` → **0 satır** → sayfa kendi kiracısının ilanlarını göstermez, `page.tsx:38`'deki **uydurma demo ilanlara** düşer |

Bu yüzden düzeltmenin iki kolu da taşıyıcıdır ve ikisi de test edilmiştir (§2.4): tek başına
`withTenant` sızıntıyı kapatmaz, tek başına `where` cümlesi de sayfayı boş kalmaktan kurtarmaz.

**Yapılan değişiklik:** okuma tek bir yere, `src/modules/marketplace/server/listings.ts` →
`listTenantListings(tenantId)` fonksiyonuna toplandı; hem `withTenant` sarmalayıcısı hem
`where: { tenantId }` içeriyor. `page.tsx` onu çağırıyor. Yanıltıcı "cross-tenant catalogue by
design" yorumu düzeltildi.

---

## 2. Kanıt

### 2.1 Uygulamanın bağlandığı rol RLS'i baypas ediyor — `pnpm rls:verify`

```
Kiracıya özel model: 46 · RLS açık tablo: 53 · tenant_isolation politikası: 46

⚠  DATABASE_URL rolü fabrika (rolsuper=true, rolbypassrls=true) — RLS bu bağlantıda hiç uygulanmıyor.
   Bu rolle yapılan bir izolasyon ölçümü GEÇERSİZDİR; RLS'e tabi bir rol aranıyor:

Ölçüm rolü: fabrika_app (rolsuper=false, rolbypassrls=false) — kaynak: DATABASE_URL_RLS_TEST
   ✓ okuma (negatif): app.tenant_id yokken 20 dolu tablonun hepsi 0 satır döndü
   ✓ okuma (pozitif): AiUsageLog kendi kiracısı bağlamında 9 satır döndü
   ✓ yazma (negatif): app.tenant_id yokken INSERT reddedildi
   ✓ yazma (pozitif): kendi kiracısına INSERT kabul edildi (geri alındı)
   ✓ yazma (çapraz): başka kiracıya INSERT reddedildi

✅ 46 kiracıya özel tabloda politika yerinde ve izolasyon fabrika_app rolüyle GERÇEKTEN ölçüldü.
```

Dikkat: bu betiğin yeşili `fabrika_app` üzerinden ölçülmüştür — uygulamanın kullandığı rol üzerinden
**değil**. Yeşil satır ile uygulamanın gerçek güvenliği aynı şey değildir; aradaki fark bu kartın konusu.
Bu `prisma/rls-app-role.sql:4`'te de yazılıdır: *"the local `fabrika` role is SUPERUSER + BYPASSRLS,
so the 36 tenant_isolation policies installed by prisma/rls.sql are never evaluated locally."*

### 2.2 Bugünkü veri: tablo boş, yani henüz sızan bir şey yok

```
APP CONNECTION ROLE: {"current_user":"fabrika","rolsuper":true,"rolbypassrls":true}
MarketplaceListing rows (owner role, RLS bypassed): 0
Tenants in DB: 23
```

ConceptTemplate'teki durumla aynı: kusur gerçek, ama **bugün** hiçbir kiracının ilanı yok. Sızıntı
tablonun boş olmasıyla engelleniyor, kodla değil.

### 2.3 Tablo boş olmasaydı ne olurdu — iki kiracıya satır yazan sonda (geri alındı)

```
probe tenants: A=demo-tenant  B=esr-calibration

[1] page.tsx:21 query on the APP role (fabrika, BYPASSRLS), acting as tenant A:
┌─────────┬───────────────────┬───────────────────┐
│ (index) │ tenantId          │ title             │
├─────────┼───────────────────┼───────────────────┤
│ 0       │ 'demo-tenant'     │ 'A-OWNED LISTING' │
│ 1       │ 'esr-calibration' │ 'B-OWNED LISTING' │
└─────────┴───────────────────┴───────────────────┘
    -> rows visible to tenant A that belong to OTHER tenants: 1

[2] naked read via fabrika_app (NOBYPASSRLS), NO app.tenant_id  -> 0 rows
[3] same query WITH app.tenant_id = A -> 1 row(s): A-OWNED LISTING

cleanup: MarketplaceListing rows remaining = 0
```

`[1]` sızıntı, `[2]` sessiz boşalma. Sonda satırları silindi; tablo 0'a döndü.

### 2.4 Birim/entegrasyon testi: iki rolde de kırmızı-önce

`tests/marketplace-listing-tenant-scope.live.test.ts` — 6 test, iki rolde ölçüyor.

**Orijinal kod (çıplak `findMany`) ile — 2 kol da kırmızı, zıt yönlerde:**

```
 × never returns another tenant's listing
   AssertionError: expected [ 'cmtvu7ork00030nxkkrhnqnv2', …(1) ] to not include 'cmtvu7ork00030nxkkrhnqnv2'
 × returns the calling tenant its own listing rather than zero rows
   AssertionError: expected [] to include 'cmtvu7org00010nxkjl9d6mh9'
      Tests  2 failed | 4 passed (6)
```

**Yarım düzeltme A — yalnız `withTenant`, `where` yok:**

```
 × never returns another tenant's listing
   AssertionError: expected [ 'cmtvu7u2v00032oxkbujj6wmo', …(1) ] to not include 'cmtvu7u2v00032oxkbujj6wmo'
      Tests  1 failed | 5 passed (6)
```

**Yarım düzeltme B — yalnız `where`, `withTenant` yok:**

```
 × returns the calling tenant its own listing rather than zero rows
   AssertionError: expected [] to include 'cmtvu803w000147xktn310u4z'
      Tests  1 failed | 5 passed (6)
```

**İki kol birlikte:**

```
 Test Files  1 passed (1)
      Tests  6 passed (6)
```

Her yarım düzeltme tam olarak bir kolu düşürüyor; test gevşetilerek geçirilmedi, iki kol da gerekli
olduğu için duruyor.

### 2.5 Gerçek tarayıcı e2e — sızıntı ekranda görüldü, sonra kapandı

`tests/e2e/marketplace-tenant-isolation.spec.ts` (gerçek giriş, gerçek tıklama, `body.innerText`
üzerinde denetim — ham HTML'de değil, çünkü next-intl tüm mesaj paketini her sayfaya gömüyor).

**Orijinal kod ile (KIRMIZI) — B'nin ilanı A'nın ekranında:**

```
Error: expect(received).not.toContain(expected) // indexOf
Expected substring: not "Tenant B ilani — ASLA gorunmemeli"
Received string:        "ÇALIŞMA ALANI
Panel
Çağrılar
...
Tenant B ilani — ASLA gorunmemeli
```

**Düzeltme ile (YEŞİL):**

```
Running 1 test using 1 worker
[seed-gate-e2e] ready — tenantA=gate-e2e-tenant-a ... tenantB=gate-e2e-tenant-b
[seed-gate-e2e] rolled back
  ✓  1 [chromium] › tests/e2e/marketplace-tenant-isolation.spec.ts:71:7 › Marketplace — tenant isolation ›
       shows tenant A its own listing and never tenant B's (1.8s)

  1 passed (5.3s)
```

### 2.6 Derleme ve kapılar (nihai ölçüm)

`pnpm build` — **uçtan uca geçti**:

```
✓ Compiled successfully in 558ms
  Running TypeScript ...
├ ƒ /[locale]/[workspace]/marketplace
build exit code: 0
```

Marketplace rotası derlenmiş rota listesinde. `pnpm typecheck`: **0 hata**.

`pnpm lint`: **0 error, 0 warning**.

`pnpm test`:

```
 Test Files  161 passed | 2 skipped (163)
      Tests  1906 passed | 8 skipped (1914)
```

**Dürüstlük notu — ara ölçümler kırmızıydı ve neden.** Bu iş boyunca depoda paralel ajanlar
çalışıyordu. Ölçümü ilk aldığımda `pnpm typecheck` 2 hata
(`tests/e2e/document-export-tenant-isolation.spec.ts`, TASK-MTVTN2KSTA0TW (e) maddesinin borcu),
`pnpm test` 6 hata (hepsi ConceptTemplate/m2 kartının uçuştaki `src/modules/m2/server/templates.ts`
işi: `No "assertTenantScope" export is defined on the "@/lib/db" mock`) ve `pnpm lint` 1 uyarı
veriyordu — **hiçbiri benim dosyalarımdan değildi**. O kartların sahipleri işlerini bitirip commit
ettikçe (`da69273`, ve m2 tarafı) üçü de kendiliğinden yeşile döndü. Yukarıdaki rakamlar nihai
durumdur; benim değişikliğim hiçbir aşamada tek bir hata eklemedi.

`pnpm rls:check`: `✅ All 46 tenant-scoped models have RLS policies registered.`

`pnpm rls:bypass-check` (düzeltmeden sonra):

```
⚠ 1 baseline entry is ahead of the tree:
  src/app/[locale]/(app)/[workspace]/marketplace/page.tsx — marketplaceListing.findMany: recorded 1, found 0  ✔ fixed
```

`--prune` ile kapatıldı, sonra:

```
⚠ Outstanding tenant-bypass debt: 4 call site(s), measured.
  [TASK-MTVTMZXYT84RZ] src/lib/billing/create-portal-session.ts — subscription.findUnique (x1)
  [TASK-MTVTMZXYT84RZ] src/lib/billing/lifetime-licence.ts — lifetimeLicence.create (x1)
  [TASK-MTVTRNORO1ES8] src/lib/billing/storefront.ts — tenantId-fallback (x1)
  [TASK-MTVSBEO7VX6Y4] src/lib/billing/subscription-sync.ts — tenantId-fallback (fixed — prune me)
  [TASK-MTVTRNORO1ES8] src/modules/m6/server/esr-parser.ts — tenantId-fallback (x1)

✅ SUCCESS: no new tenant bypass. 35 call site(s) allowed with a recorded reason, 4 still owed.
```

marketplace satırı listeden düştü. `subscription-sync` satırındaki "fixed — prune me" **başka bir
ajanın** işi ve **bilerek dokunulmadı** — o dosya TASK-MTVSBEO7VX6Y4'ün ve `src/lib/billing/*`
bu kartta yasak bölge.

---

## 3. Değişen dosyalar

| Dosya | Durum | Ne |
|---|---|---|
| `src/modules/marketplace/server/listings.ts` | **yeni** | `listTenantListings(tenantId)` — kural tek yerde: `withTenant` + `where: { tenantId }` |
| `src/app/[locale]/(app)/[workspace]/marketplace/page.tsx` | değişti | Çıplak `findMany` yerine `listTenantListings(tenantId)`; yanlış "cross-tenant catalogue" yorumu düzeltildi |
| `tests/marketplace-listing-tenant-scope.live.test.ts` | **yeni** | İki rolde kırmızı-önce test, 6 assertion |
| `tests/e2e/marketplace-tenant-isolation.spec.ts` | **yeni** | Gerçek tarayıcı, gerçek giriş; `body.innerText` üzerinde çapraz-kiracı denetimi |
| `scripts/tenant-bypass-baseline.json` | değişti | Kapanan girdi `--prune` ile düştü; başlıktaki kart satırı CLOSED olarak güncellendi |

`src/lib/billing/*` dosyalarına **dokunulmadı**. `prisma/schema.prisma` ve `prisma/rls.sql`
**değiştirilmedi** — şema kararı §6'daki ürün kararına bağlı, tahminle şema değiştirmedim.

**Geri alma:** `git revert <commit>` yeterli. Şema/migration/veri taşıması yok, geri alınabilirlik
tam; geri alındığında yalnızca çıplak okuma geri gelir (yani bugünkü sızıntı da geri gelir).

---

## 4. Riskler

1. **Bu düzeltme uygulamanın RLS baypasını çözmez.** `DATABASE_URL` hâlâ SUPERUSER + BYPASSRLS bir
   role bağlanıyor. Marketplace okumasını elle kapattım; **aynı sınıftaki başka her çıplak okuma
   hâlâ korumasız** ve onları tutan tek şey `rls:bypass-check` taban çizgisi. Asıl kalıcı çözüm
   `DATABASE_URL`'i `fabrika_app`'e taşımaktır (`prisma/rls-app-role.sql` bunu "separate, later task"
   diye kendisi de yazıyor). Bu kartın kapsamı dışında — §7'ye kart önerisi olarak yazdım.
2. **Demo fallback artık daha yanıltıcı.** `page.tsx:38`'deki uydurma 3 ilan hâlâ orada. Düzeltmeden
   önce "boş liste" = "hiçbir yerde ilan yok" demekti; şimdi "senin ilanın yok" demek ve sayfa
   uydurma ilan gösteriyor. Ayrıca `catch` bloğu tüm hataları yutup aynı fallback'e düşürdüğü için
   **düzeltmenin kendisi patlarsa da sayfa normal görünür**. `tests/fabricated-fallbacks.*` bu sayfayı
   kapsamıyor (kontrol edildi: marketplace referansı yok).
3. **Paralel ajan yarışı yaşandı ve atlatıldı.** `scripts/tenant-bypass-baseline.json`'ı başka bir
   ajan benimle aynı dakikada yazdı. Ara bir `git diff` anlık görüntüsünde onların girdisi silinmiş
   göründü; tekrar okuyunca girdi yerindeydi ve benim değişikliğim de duruyordu (`entries: 36`,
   marketplace yok, subscription-sync var, benim CLOSED satırım var). Commit öncesi `git diff --cached`
   ile tekrar doğrulanacak.
4. E2E, `scripts/seed-gate-e2e.ts` fikstürünü ödünç alıyor. O seed'in şekli değişirse bu spec de
   etkilenir; karşılığında ikinci bir fikstür kopyası çıkarmamış oluyorum.

---

## 5. Açık sorular

1. **Ürün kararı (§6).** Pazaryeri özel liste mi, kiracılar arası vitrin mi? Kod bugün ikisini birden
   iddia ediyordu; ben güvenli olanı uyguladım, kalıcı cevap patronun.
2. `status` filtresi: sayfa `unlisted`/`fulfilled` ilanları da gösteriyor. "Kendi ilanlarım" okuması
   için bu doğru (kendi taslağını görmen gerekir); vitrin kararı çıkarsa vitrin sorgusunda
   `status: 'active'` şart olur.
3. `orderMarketplaceService` (`actions.ts:51`) hiçbir şeyi veritabanına yazmıyor — `listingId`'yi
   doğrulamadan uydurma bir sipariş nesnesi döndürüyor. Bu kartın kapsamı değil ama vitrin kararı
   çıkarsa "başka kiracının ilanını sipariş etmek" yolunun ilk durağı burası olur.

---

## 6. KARAR GEREKİYOR — 1-3-1

### Sorun

`MarketplaceListing` bugün birbiriyle çelişen iki şey iddia ediyor: şema `tenantId`'yi NOT NULL
yapıp `prisma/rls.sql` ona `tenant_isolation` politikası verdiği için veritabanı "her satırın bir
sahibi var ve kimse başkasınınkini göremez" diyor; buna karşılık sayfa kodu okumayı filtresiz
yapıp yorumunda "cross-tenant catalogue by design" diyordu. İkisi aynı anda doğru olamaz. Ürün
tarafında da soru gerçek: "hizmet / patent lisansı / danışmanlık" ilanı doğası gereği **başkalarına
gösterilmek için** yazılır — ama bugünkü kod bunu vitrin *gibi* okurken şema ve RLS onu özel veri
gibi koruyor. Ben okumayı bugün güvenli tarafa (kendi kiracısı) çektim; bu **sızıntıyı kapatır ama
soruyu cevaplamaz**.

### Üç seçenek

**Seçenek 1 — Özel liste ("kendi ilanlarım"). Bugün uygulanmış olan hâli kalıcı yap.**
- **Değişen dosyalar:** yok, bugünkü hâl zaten bu. İleride sadece UI metni ("Pazar Yeri" → "İlanlarım").
- **Veri:** taşınmaz, kaybolmaz.
- **RLS:** `tenant_isolation` aynen kalır; şema aynen kalır. Beyan ile davranış ilk kez örtüşür.
- **Geri dönüş:** tam. Hiçbir yıkıcı adım yok.
- **Bedeli:** "pazaryeri" adı yalan olur — kimse kimsenin ilanını göremediği için alıcı yok. Modülün
  ticari amacı (10% komisyon, `actions.ts:62`) çalışmaz.

**Seçenek 2 — Kasıtlı vitrin: ayrı, açıkça yayınlanmış bir katalog görünümü.**
- **Değişen dosyalar:** `prisma/rls.sql` (MarketplaceListing için `tenant_isolation` yerine yayın
  durumuna bakan bir politika ya da `plan_lifetime_owner_count` gibi denetimli bir SECURITY DEFINER
  fonksiyon); `listings.ts`'e ikinci bir fonksiyon (`listPublicListings`) — mevcut `where` cümlesi
  **genişletilmez**; `page.tsx` iki sekme (benim ilanlarım / vitrin); `orderMarketplaceService`
  gerçek bir `MarketplaceOrder` tablosu ister (§5.3).
- **Veri:** taşınmaz ama `status`'ün anlamı sözleşmeye dönüşür: `active` = "herkese açık".
  Bugünkü 0 satır bunu bedelsiz yapılacak an hâline getiriyor.
- **RLS:** en riskli parça. Kiracılar arası okumaya izin veren her politika, yanlış yazıldığında
  `tenant_isolation`'ı tümüyle etkisizleştirir; `pnpm rls:verify` bu tabloyu ölçen bir kola muhtaç olur.
- **Geri dönüş:** politika geri alınabilir, ama **bir kez kiracılar birbirinin ilanını gördükten
  sonra görülmüş olan geri alınamaz**.
- **Bedeli:** en çok iş, en çok risk; ürün değeri en yüksek.

**Seçenek 3 — Modülü şimdilik kapat / `dev`'e al, kararı sonraya bırak.**
- **Değişen dosyalar:** `ModuleState` (tenant × modül) satırları; rota `requireModule` arkasına alınır
  (bugün marketplace rotasının **hiç modül koruması yok** — kontrol edildi).
- **Veri:** taşınmaz. Tablo zaten boş.
- **RLS:** değişmez.
- **Geri dönüş:** tam ve anında.
- **Bedeli:** karar ertelenir; ama beta kullanıcısına yarım bir özellik gösterilmemiş olur.

### Önerim: **Seçenek 1**, ve Seçenek 2'yi ayrı bir kart olarak sıraya al.

Gerekçe: (a) bugün **uygulanmış ve uçtan uca kanıtlanmış** olan hâl bu — ekstra risk taşımıyor;
(b) tablo boş, yani hiçbir müşteri bugün bir şey kaybetmiyor, "pazaryeri boş göründü" şikâyeti
gelmiyor; (c) Seçenek 2'nin doğru yapılması bir RLS politikası tasarımı + gerçek sipariş tablosu +
`rls:verify` kolu demek, yani kendi kartını hak eden bir iş — onu bu kartın içine sıkıştırmak tam da
bu kusuru üreten aceleyi tekrarlamak olur; (d) Seçenek 3'ün tek üstünlüğü kararı ertelemek, ama
Seçenek 1 zaten güvenli olduğu için ertelemenin bedeli yok. Seçenek 2 seçilirse Seçenek 1'in üstüne
**eklenir**, hiçbir şeyi geri almaz — bugünkü `listTenantListings` o zaman "benim ilanlarım" sekmesi
olur.

---

## 7. KAPANMADI

Dokunmadığım / devrettiğim her şey. "Başka kartın kapsamı" demek düzeldiği anlamına gelmez:

1. **Uygulamanın DB bağlantısı hâlâ RLS'i baypas ediyor.** Bu kartın *kök nedeni* ve düzeltilmedi —
   yalnız bu tek çağrı yeri elle kapatıldı. `DATABASE_URL` = `fabrika` (SUPERUSER + BYPASSRLS).
   Bu, deponun en geniş açık güvenlik borcudur: 46 tablodaki 46 politika üretim dışı her ortamda ölü.
   → **Yeni kart önerisi: `TASK-RLS-APP-ROLE-CUTOVER`** — `DATABASE_URL`'i `fabrika_app`'e taşı;
   `prisma/rls-app-role.sql:12` bunu zaten "separate, later task" diye adlandırıyor. Kartın ilk işi
   `rls:bypass-check`'teki 35 "allowed" girdinin gerçekten `fabrika_app`-hazır olup olmadığını ölçmek
   olmalı — taban çizgisi dosyası bunların **hazır olmadığını** açıkça söylüyor
   ("The 35 `allowed` entries are NOT fabrika_app-ready ... Slice 6, TASK-MTVTPVTEBCF5Z").
2. **Uydurma demo ilanlar (`page.tsx:38-62`) duruyor.** Kendi kiracısının ilanı olmayan kullanıcı,
   uydurma 3 ilan görüyor; `catch` bloğu hataları da aynı yere düşürdüğü için gerçek bir arıza
   sessizce "normal sayfa" gibi görünür. `tests/fabricated-fallbacks.*` bu sayfayı kapsamıyor.
   Kaldırmak ekranı değiştirir (ürün kararı), bu yüzden bu kartta **yapılmadı**.
   → **Yeni kart önerisi: `TASK-MARKETPLACE-EMPTY-STATE`** — demo ilanları gerçek bir boş-durum
   ekranıyla değiştir, `catch`'i hatayı gösterecek şekilde ayır, sayfayı fabricated-fallbacks kapısına ekle.
3. **Ürün kararı (§6) verilmedi.** Şema (`tenantId` NOT NULL) ve `prisma/rls.sql`'deki
   `tenant_isolation` girdisi **kasten değiştirilmedi**. Karar Seçenek 2 çıkarsa ikisi de yeniden
   ele alınmalı.
4. **`orderMarketplaceService` hiçbir şey kaydetmiyor** ve `listingId`'yi doğrulamıyor
   (`actions.ts:51-82`) — uydurma bir sipariş nesnesi döndürüyor. Bu kartın kapsamı değildi,
   dokunulmadı. Vitrin kararı çıkarsa çapraz-kiracı sipariş yolunun ilk durağı burasıdır.
   → **Yeni kart önerisi: `TASK-MARKETPLACE-ORDER-PERSISTENCE`**.
5. **`subscription-sync.ts` taban çizgisi girdisi "fixed — prune me" durumunda** — başka ajanın
   (TASK-MTVSBEO7VX6Y4) işi, `src/lib/billing/*` yasak bölge olduğu için **bilerek prune edilmedi**.
   O kartın sahibi kapatmalı.
6. **`pnpm gate`'in tamamı koşulmadı.** Parçaları ayrı ayrı yeşil: `lint`, `typecheck`, `test`,
   `build`, `rls:check`, `rls:bypass-check`, `rls:verify`. Koşulmayanlar: `i18n:check` (build içinde
   geçti, ayrıca koşulmadı), `alerts:check` ve `test:e2e`'nin tamamı (§7.7).
7. **`pnpm test:e2e`'nin tamamı koşulmadı** — yalnız kendi spec'im koşuldu. Sebep: depo dizininde
   başka bir ajanın `next dev` sunucusu vardı, `next dev` aynı dizinde ikinciye izin vermiyor ve
   kardeş süreci öldürmek yasak. Kendi spec'im ayrı portta (3113/3114/3115) kendi sunucusuyla koştu.
8. **Windows/Linux'ta koşulmadı** (bu makinede yok). Değişiklik platformdan bağımsız — §başlıktaki
   platform beyanına bakınız.

---

## 8. Sonraki adım

1. **Patron:** §6'daki karar. Seçenek 1'i onaylarsan bu kart kapanır; Seçenek 2 dersen yeni kart açarım.
2. §7.1 (`TASK-RLS-APP-ROLE-CUTOVER`) bence bu panodaki en yüksek öncelikli güvenlik kartıdır —
   marketplace onun tek bir belirtisiydi.
3. §7.2 ve §7.4 kartları açılsın.
