# TASK-MUMABL78X5JLX — İlkadım ücretsiz pilot (be-fb)

**Özet:** Platform yöneticisi `/admin/billing/plans` sayfasından bir kiracıya 90 günlük ücretsiz Belediye Ekip pilotu atayabiliyor. Pilot mevcut `Subscription` satırına yazılıyor, şema değişmedi. Atama idempotent ve audit'li. Süre dolunca çalışma alanı salt-okunur oluyor. Pilotta ödeme ve yükseltme yolu kapalı. Stripe senkronu pilot satırına dokunmuyor. Gerçek tarayıcıda, canlı DB testleriyle ve 9/9 mutasyonla doğrulandı.

Commit'ler: `a6b22241` (özellik ve testler), rapor commit'i (fatura metrik kartı düzeltmesi, ekran görüntüleri, bu dosya).

## 0. Keşif bulguları (kart adım 1)

1. **`active-tier.ts` denemeyi hiç yorumlamıyor.** Bu dosya yalnız kampanya indirim kademesini seçiyor (`BILLING_ACTIVE_TIER`). TRIALING yalnız bir yorum satırında geçiyor: "SubStatus TRIALING'i ACTIVE ile birlikte sayar". Deneme mantığı burada değil.
2. **Denemeyi yorumlayan yer `src/lib/billing.ts:103` (`getEntitlements`).** `TRIALING` ve `ACTIVE` durumları, `trialEndsAt`'e hiç bakılmadan "canlı" sayılıyor. Yani bugün süresi dolmuş bir deneme sonsuza kadar planın yetkilerini alırdı. Kodda "süresi dolmuş deneme" davranışı hiç yok. `trialEndsAt` yalnız `plan-repository.ts` içinde sözleşme atamasında `null` olarak yazılıyor. Hiçbir yer onu okumuyor, Stripe senkronu da yazmıyor.
3. **`subscription-sync.ts` elle açılmış bir denemenin üzerine yazardı.** `syncStripeSubscription`, `metadata.tenantId` ile gelen her olayda `Subscription`'ı koşulsuz upsert ediyor (plan, status, provider=stripe). `handleSubscriptionCancellation` ise satırı `CANCELED` yapıyor. Bir pilot kiracının adını taşıyan Stripe olayı (sahte metadata ya da kapıyı aşan bir satış) pilotu ezerdi ya da iptal ederdi.
4. **Karne, radar ve davet kodu modül kapısına bağlı değil.** `/fon-hazirlik`, `/belediye-cagrilari`, ajans davet kodu (B1/B2) ve panodaki karne kartı `moduleGate` / `assertModuleAccess` çağırmıyor (grep: bu dizinlerde 0 eşleşme). Plan bu yüzeyleri ne açabilir ne kapatabilir. Plana bağlı tek kısıt üye davetindeki koltuk sınırı (`seat-limit.ts`), pilotta 6.

## 1. Ne yapıldı

**Tasarım kararı: yeni kolon yok.** Pilot, `provider = 'pilot'` olan bir `Subscription` satırı. Sözleşmeli paketin `provider = 'contract'` desenini izliyor, `provider` zaten serbest metin. Kartın önerdiği `Subscription.source` kolonu gerekmedi: Stripe denemesi `trialEndsAt` yazmıyor ve durumunu kendisi değiştiriyor, ayrım `provider`'dan okunuyor. Migration yok.

| Parça | Dosya | Davranış |
|---|---|---|
| Pilot çekirdeği | `src/lib/billing/pilot.ts` | Satır: `TRIALING`, `public-team` + yayındaki sürüm `pv_public-team_1`, `provider 'pilot'`, PSP kimliği null, `trialEndsAt = currentPeriodEnd` = başlangıç günü 1. gün sayılarak 90. günden sonraki 00:00 (Europe/Istanbul). Ofset sabit yazılmadı, Intl ile okunuyor. |
| Atama | `grantPilot` | İdempotent: pilot sürerken ikinci atama `unchanged` döner, yazmaz, audit de yazmaz. `extend: true` süreyi mevcut bitişten itibaren 90 gün uzatır. Audit: `billing.pilot.granted` ya da `billing.pilot.extended` (aktör, kiracı, `endsAt`, `previousEndsAt`, önceki plan ve sağlayıcı). Canlı bir Stripe/iyzico aboneliği varsa `LIVE_PROVIDER_SUBSCRIPTION`, sözleşmeli paket varsa `PILOT_OVER_CONTRACT` ile reddedilir. |
| Yetki | `admin/billing/plans/actions.ts` `grantPilotAction` | `requirePlatformAdmin()`: oturumdaki bayrak, `auth.ts` tarafından DB'deki `User.isPlatformAdmin`'den çözülüyor. |
| Salt-okunur | `src/lib/tenant.ts` | `requireTenantAction()` (77 server action çağrısı) süresi dolmuş pilotta `PilotExpiredError` fırlatır. Yalnız okuyan 13 action `{ readOnly: true }` alır. Varsayılan kasten kapalı: işaretlenmemiş yeni bir action reddedilir. `requireTenantApi({ write: true })` 403 `PILOT_EXPIRED` döner; davet POST ile kayıtlı arama POST/PATCH/DELETE bu kapıdan geçer. `pipeline/actions.ts` kendi oturum yardımcısını kullandığı için 8 yazma action'ına ayrıca `assertTenantWritable` eklendi. |
| Veri | — | Silinen bir şey yok. `getEntitlements` değişmedi, süresi dolmuş pilot Ekip yetkilerini okuma için korur. |
| Stripe koruması | `subscription-sync.ts` | Sync: mevcut satır pilotsa upsert yok, `logger.error` yazılır, olay claim edilmez (pilot bittikten sonra yeniden oynatılabilir), dönüş `PILOT_PROTECTED`. İptal: kontrol yazma transaction'ının içinde, claim'den sonra yapılır; pilotsa rollback olur (claim de geri alınır). |
| Ödeme kapalı | `api/billing/checkout/route.ts` | Pilot kiracı (süren ya da biten) 403 `PILOT_CHECKOUT_CLOSED` alır. Portal zaten `providerCustomerId` istediği için pilotta açılamaz. |
| UI | `components/PilotBanner.tsx`, `(app)/layout.tsx`, `settings/billing/*` | Çalışma alanı üstünde bant: süren pilotta indigo "Ücretsiz pilot … tarihine kadar", biten pilotta amber "Pilot süresi doldu … yeni kayıt ve düzenleme kapalı". Fatura sayfasında plan ızgarası, ömür boyu teklif ve portal düğmesi yerine "Pilot süresince ödeme ve plan yükseltme kapalıdır" notu çıkar. Metrik kartında "PİLOT · Son gün … · yenilenmez" yazar. |
| Admin UI | `admin/billing/plans/pilot-panel.tsx` | Kiracı seçimi, "Süreyi 90 gün uzat" kutusu ve pilot listesi (son gün / süresi doldu). Liste `withSystemScope('platform-admin')` ile okunuyor, bypass-check yeşil. |
| i18n | `messages/{tr,en}.json` | `pilot.*`, `adminPlans.pilot.*`, `adminPlans.errors.PILOT_OVER_CONTRACT`, `billingPanels.settings.pilot*` / `metricPilot*` |

**Patron onayı bekleyen varsayılan:** Süre dolunca davranış salt-okunur. Veri silinmiyor ve okunabiliyor, yazma (server action ile yazma route'ları) reddediliyor, plan yetkileri okuma için korunuyor. Alternatif "Discover'a düş" seçildi değil, çünkü o durumda M2 konsept notları bile açılamaz. Karar patronda.

## 2. Kanıt

### 2.1 Testler (canlı DB, `fabrika`)
```
pnpm exec vitest run src/lib/billing/pilot.test.ts src/lib/billing/pilot-gates.test.ts
 Test Files  2 passed (2)   Tests  15 passed (15)
```
- `pilot.test.ts` (11 test):
  - İstanbul 90. gün sınırı. 1 Ekim 00:00 ile 23:59 İstanbul aynı gün bitiyor. 2 Ekim 00:00 (UTC'de hâlâ 1 Ekim) bir gün sonra bitiyor. Bitiş anının kendisi dolmuş sayılıyor, 1 ms öncesi dolmamış.
  - Stripe denemesi pilot sayılmıyor.
  - Atama: satır, `getEntitlements` 6 koltuk ve pro modülleri, audit.
  - İdempotentlik: 1 audit satırı. Uzatma: +90 gün, audit.
  - Stripe ve sözleşme üzerine atama reddediliyor.
  - Koltuk 6 (`readSeatUsage`).
  - Salt-okunur ve okuma korunuyor.
  - Stripe sync ve iptal pilot satırına dokunmuyor.
- `pilot-gates.test.ts` (4 test): üye oturumu → `PLATFORM_ADMIN_REQUIRED` ve satır yazılmıyor; admin → `granted`, sonra `unchanged`. Süresi dolmuş pilotta action reddediliyor, `readOnly` geçiyor, write route 403 `PILOT_EXPIRED`, read route 200. Süren pilot yazabiliyor. Checkout 403 `PILOT_CHECKOUT_CLOSED`.

### 2.2 Mutasyon kanıtı (9/9 öldürüldü, commit sonrası, her mutasyon `git checkout` ile geri alındı, ağaç temiz)
```
M1 boundary < -> <=            → 2 test kırmızı (sınır + salt-okunur)
M2 action gate removed         → pilot-gates "expired pilot refuses…" kırmızı
M3 idempotency removed         → "is idempotent" + admin testi kırmızı
M4 stripe sync guard removed   → "Stripe sync and cancellation leave a pilot row alone" kırmızı
M5 checkout guard removed      → "checkout answers 403" kırmızı
M6 UTC day instead of Istanbul → 3 test kırmızı (İstanbul sınırı, uzatma)
M7 admin check removed         → "only a platform admin can grant" kırmızı
M8 write route gate removed    → "expired pilot refuses … write routes" kırmızı
M9 cancellation guard removed  → Stripe koruma testi kırmızı
restored, src dirty: ''
```

### 2.3 Kapılar (son HEAD üzerinde)
| Kapı | Sonuç |
|---|---|
| `pnpm typecheck` | temiz (exit 0) |
| `pnpm lint` | **benim dosyalarımda temiz** (hedefli eslint exit 0). Tam koşuda 1 hata var: `scripts/.q-sefb.ts:5` `no-explicit-any`. Bu dosya se-fb'nin izlenmeyen geçici dosyası, bu kartla ilgisi yok. |
| `pnpm exec vitest run` | **204 dosya geçti, 2 atlandı · 2361 test geçti, 8 atlandı**, kırmızı yok |
| `pnpm i18n:check` | ✅ katalog paritesi, anahtarlar çözülüyor, yeni literal yok (325/325 taban) |
| `pnpm rls:check` | ✅ |
| `pnpm rls:bypass-check` | ✅ yeni bypass yok (32 onaylı system-scope çağrısı) |
| `pnpm rls:verify` | ✅ 47 tabloda izolasyon `fabrika_app` rolüyle ölçüldü |

Mevcut testlerde iki uyarlama var:
- `saved-searches` route testleri sahte bir tx kullanıyor, o tx'te `subscription` yok. Bu testlere pilot kapısı için `vi.mock('@/lib/billing/pilot')` eklendi. Kapının kendisi `pilot-gates.test.ts`'te canlı DB'de test ediliyor.
- `subscription-sync-tenant-scope.test.ts` değiştirilmedi. İptal koruması, mevcut "iki wrapper, ilk ifade claim" sözleşmesini bozmayacak şekilde transaction'ın içine yerleştirildi.

### 2.4 Gerçek tarayıcı (:3000, bu ağaçtan koşan `next dev`) — `docs/agent-results/TASK-MUMABL78X5JLX-screenshots/`
Kiracı gerçek kayıt callback'iyle açıldı (`POST /api/auth/callback/credentials`):
- Ajans davet kodu: `B1 Test Ajansı (OKA)` için `createInviteCodeIn` ile üretildi. Ajans paneli de aynı fonksiyonu kullanıyor.
- KVKK damgası: ajans eki dahil.
- `readiness=municipality.012012012012012` ve `province=Samsun`.

Sonuç: 302 → pano. Kiracı `cmumb155l002dndxkpviuw95z` oluştu, `agencyId` = ajans, `settings.readiness` içe alındı. Yani **B1 davet koduyla kayıt pilot kiracı için çalışıyor**.

| # | Dosya | Ne gösteriyor |
|---|---|---|
| 01 | `01-admin-pilot-atandi.png` | Platform yöneticisi (admin@…) "Pilot ata" → "Pilot atandı.", liste: son gün 27 Aralık 2026. 29.09 1. gün sayılınca 90. gün 27.12, doğru. |
| 02 | `02-admin-pilot-idempotent.png` | İkinci tıklama → "pilotu zaten sürüyor; süre değişmedi". DB'de tek `billing.pilot.granted` satırı var, `actorId=demo-user-superadmin`, `endsAt=2026-12-27T21:00:00Z`. |
| 03 | `03-kiraci-pano-pilot-bandi-karne.png` | Kiracı kullanıcısı: pilot bandı ve **karne** kartı (50/100 Gelişen). |
| 04 | `04-radar.png` | **Radar** `/tr/belediye-cagrilari`, 30 çağrı. |
| 05 | `05-fatura-pilot.png` | Fatura: "PUBLİC-TEAM · PİLOT · Son gün 27 Aralık 2026 · yenilenmez", koltuk 1/6. Plan ızgarası ve portal düğmesi yok, "Pilot süresince ödeme ve plan yükseltme kapalıdır" notu var (readPage metninde doğrulandı). |
| 06 | `06-davet-pilot-aktif.png` | Pilot sürerken üye daveti başarılı. |
| 07 | `07-sure-doldu-davet-reddedildi.png` | `trialEndsAt` geçmişe çekildi (28.09 21:00Z). Amber "Pilot süresi doldu" bandı var, davet **reddedildi**: "Ücretsiz pilot süresi doldu; çalışma alanı salt-okunur." |
| 08 | `08-sure-doldu-pano-okunuyor.png` | Süre dolmuşken pano ve karne okunmaya devam ediyor. |

Aynı kiracı oturumuyla canlı curl:
```
checkout:          {"code":"PILOT_CHECKOUT_CLOSED",…} [403]
saved-search POST: {"error":"Ücretsiz pilot süresi doldu; …","code":"PILOT_EXPIRED","endsAt":"2026-09-28T21:00:00.000Z"} [403]
saved-search GET:  [200]
Invitation satırı: 1 (yalnız pilot sürerken atılan) · SavedSearch satırı: 0
```
Test kiracısının `trialEndsAt` değeri sonra atanan bitişe (2026-12-27 21:00Z) geri alındı.

## 3. Değişen dosyalar
- Yeni:
  - `src/lib/billing/pilot.ts`
  - `src/lib/billing/pilot.test.ts`
  - `src/lib/billing/pilot-gates.test.ts`
  - `src/components/PilotBanner.tsx`
  - `src/app/[locale]/admin/billing/plans/pilot-panel.tsx`
- Değişen:
  - `src/lib/tenant.ts`
  - `src/lib/billing/subscription-sync.ts`
  - `src/app/api/billing/checkout/route.ts`
  - `src/app/api/invitations/route.ts`
  - `src/app/api/saved-searches/route.ts` ve `[id]/route.ts` (+ testlerinde pilot mock'u)
  - `src/app/[locale]/(app)/layout.tsx`
  - `settings/billing/page.tsx` ve `BillingClient.tsx`
  - `admin/billing/plans/{page,actions}.ts(x)`
  - `pipeline/actions.ts`
  - `readOnly` işaretleri: evidence, consortium, relationships, calendar, ajans/actions, lib/agency/actions, m2, m6, m8, m11 actions
  - `messages/tr.json`, `messages/en.json`
- Şema ya da migration: **yok**.

## 4. Riskler
- **Salt-okunur kapsamı:** Kapı tüm server action'ları (`requireTenantAction`), pipeline action'larını ve tenant yazma route'larını kapsıyor. Kapsam dışında kalanlar:
  - API anahtarıyla çalışan `/api/v1`
  - KVKK kullanıcı hakları (`src/actions/user/*`, dışarıda kalması doğru)
  - auth/giriş yazmaları
  - aylık kredi işi (`credits-monthly-grant`): süresi dolmuş pilota da 500 kredi yazar, ama AI action'ları kapalı olduğu için harcanamaz
- **Her server action'da +1 sorgu:** `Subscription` satırı PK ile okunuyor, tek `withTenant` transaction'ı. Ölçülmedi. Gerekirse oturuma önbellek eklenebilir.
- **Fail-closed tercihi:** `readOnly` işareti unutulmuş bir okuma action'ı, süresi dolmuş pilotta hata verir. Bu görünür bir hata, veri sızıntısı değil. 13 okuma action'ı işaretlendi (liste: commit diff'i).
- **Bir server action reddinde istemci genel bir hata görür.** Next, production'da hata mesajını maskeler. Bant ne olduğunu zaten açıklıyor. Route'lar anlamlı 403 döndürüyor.
- Pilot → ücretli geçiş: platform yöneticisi aynı ekranda `public-team` "Ata" dediğinde sözleşme pilotun üzerine yazılıyor (`providerSubId` null olduğu için izinli). ADR-0007'ye göre bu adım e-Fatura canlı olmadan atılmamalı. Kod bunu engellemiyor, süreç kuralı olarak kalıyor.

## 5. Açık sorular (patron)
1. **Süre dolunca varsayılan salt-okunur mu?** (uygulandı, onay bekliyor)
2. **Modül uyumsuzluğu:** `ILKADIM-PILOT.md` §2.2 Ekip modüllerini "M1, M2, M3, M4, M5, M8" sayıyor. Katalog ise `public-team` = `pro` tabanıyla **M6'yı da** veriyor (fatura ekranında M6 görünüyor). Bu fark B11'den geliyor, bu kartta değiştirilmedi. Hangisi doğru?
3. Dev DB'de test verisi kaldı: kiracı `cmumb155l002dndxkpviuw95z` ("Ilkadim-Pilot-Befb Kuruluşu", kullanıcı `ilkadim-pilot-befb@example.test`), 1 davet, ajans davet kodu `FBHZ-…` (1 kullanım). Silinsin mi?

## 6. Sonraki adım
- crw-fb incelemesi.
- Onay gelirse İlkadım kiracısına canlıda `/admin/billing/plans` → "Pilot ata" yapılacak.

**Platform beyanı:** Doğrulama **mac** üzerinde yapıldı (Darwin 27, `next dev` :3000, Docker Postgres). Değişen kod sunucu tarafı TS ve Prisma ile tarayıcı UI'dan ibaret. Süreç, dosya yolu ya da kabuk bağımlılığı yok. Tarih hesabı `Intl` ile `Europe/Istanbul` üzerinden yapılıyor ve ICU'lu her Node'da aynı sonucu veriyor, bu yüzden Windows ve Linux'ta davranış aynı olmalı. Bu iki platformda **koşulamadı**, çünkü bu makinede yalnız macOS var.
