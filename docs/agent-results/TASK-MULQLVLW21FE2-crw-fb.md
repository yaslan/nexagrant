# TASK-MULQLVLW21FE2 — FB-GAP-1 öncelik 1 kartlarının bağımsız kod incelemesi (crw-fb)

Repo: `/Users/macbook/alan/FONBRIDGE`, dal `dev`. İnceleme anında HEAD `cc9ebbd3`, `origin/dev` `130a44d6`. `c8dcef26`'dan sonraki iki commit (`819aff09`, `cc9ebbd3`) incelenen dosyalara dokunmuyor. Bunu `git diff --stat c8dcef26 cc9ebbd3 -- <incelenen yollar>` ile kontrol ettim, çıktı boş.

Bu inceleme kod değiştirmedi. Düzeltme kartlarını leed-fb açacak.

## Karar özeti

| İş                                                   | Karar                                                                   | B   | Ö   | K   |
| ---------------------------------------------------- | ----------------------------------------------------------------------- | --- | --- | --- |
| (1) TASK-MULQK8IRX9GSN — marketplace sipariş (be-fb) | **ONAY.** Bloklayan yok, Ö-1..Ö-3 için takip kartı açılmalı.            | 0   | 3   | 5   |
| (2) TASK-MULQKFER4MF0Y — RLS bypass kapısı (se-fb)   | **ONAY**                                                                | 0   | 0   | 2   |
| (3) TASK-MULQJZNB7U3QN — repo güvence (devop-fb)     | **DÜZELTME GEREKLİ.** Raporun "gerçek sır bulunmadı" hükmü eksik (Ö-4). | 0   | 1   | 2   |

Bloklayan (B) bulgu yok.

## 1. Ne yapıldı

- Yedi commit'in diff'ini satır satır okudum: `e56810b7`, `e8a6b8e3`, `0b52298a`, `e40b5c72`, `c8dcef26`, `2e932ca0`, `3ef94e35`. Çağrılan yardımcıları da okudum: `src/lib/money.ts`, `src/lib/system-scope.ts`, `prisma/rls.sql`, `listings.ts`, `lifetime-licence.ts`, `subscription-sync.ts`.
- Komşunun commit'lenmemiş WIP'i (`.github/workflows/*`, `messages/*`, `src/lib/readiness/` …) sonuçları kirletmesin diye kapıları HEAD'in ayrık bir kopyasında koştum: `git worktree add --detach <scratch>/fb-head HEAD` ve symlink'li `node_modules`.
- `parseListingPrice` ve `applyPercentDiscount` fonksiyonlarını 23 kenar girdiyle doğrudan çalıştırdım.
- Canlı testlerin kullandığı rolü veritabanına sordum.
- Tüm git geçmişini (747 commit, `--all`) iki yöntemle taradım: (a) desen taraması, (b) yerel `.env` değerlerinin geçmişte geçip geçmediği. Değer basılmadı, çıktıda yalnız `commit:dosya:tür` var.

## 2. Kanıt (kendi koşularım, HEAD `cc9ebbd3` ayrık kopya)

```
typecheck exit=0
$ eslint
lint exit=0

pnpm rls:check
CHECK 4b — 14 tenant-scoped tables are created by migrations.
✅ SUCCESS: every one of them carries ENABLE + FORCE + tenant_isolation in its own migration.

pnpm rls:bypass-check
✅ SUCCESS: no new tenant bypass. 1 call site(s) allowed with a recorded reason, 24 on the sanctioned cross-tenant path, 0 still owed.

pnpm rls:verify
   ✓ yazma (pozitif): kendi kiracısına INSERT kabul edildi (geri alındı)
   ✓ yazma (çapraz): başka kiracıya INSERT reddedildi
✅ 47 kiracıya özel tabloda politika yerinde ve izolasyon fabrika_app rolüyle GERÇEKTEN ölçüldü: okuma ve yazma, kiracı sınırında reddedildi.

pnpm exec vitest run marketplace billing stripe-event system-scope module-plan-gate   (DATABASE_URL_RLS_TEST=set)
 Test Files  25 passed (25)
      Tests  353 passed (353)

pnpm exec vitest run tests/marketplace-order.live.test.ts tests/billing-k1-tenant-scope.live.test.ts tests/stripe-event-retention.live.test.ts --reporter=verbose
 Test Files  3 passed (3)
      Tests  17 passed (17)      ← 17'si de ✓, hiçbiri ↓ (skip) değil
```

Canlı testlerin rolü (`DATABASE_URL_RLS_TEST` üzerinden `createDbClient`):

```
[ { u: 'fabrika_app', bypass: false, super: false } ]
```

Ortam notu: `.env` 57. satırda tırnaksız `EMAIL_FROM=Fabrika <…>` değeri var. Bu yüzden `set -a; source .env` hem bash'te hem zsh'ta sözdizimi hatası veriyor ve `DATABASE_URL_RLS_TEST` yüklenmiyor. Kartta önerilen komut (`source .env; pnpm test -- marketplace billing`) bu yüzden canlı testleri atlar. Ayrıca `pnpm test -- x` filtreyi uygulamıyor, tüm paketi koşuyor. Ben `.env`'i satır satır, `shlex.quote` ile tırnaklanmış geçici bir dosyaya çevirdim ve testleri `pnpm exec vitest run <filtre>` ile koştum.

Fiyat ayrıştırıcı denemesi (`parseListingPrice`, HEAD kodu):

```
"€1,500"                   {"amountMinor":150000,"currency":"EUR"}
"1,500"                    {"amountMinor":150000,"currency":"EUR"}
"1.500"                    null
"€ 1.500,00"               null
"1500 TL"                  {"amountMinor":150000,"currency":"TRY"}
"1500 Euro"                null
"$1500/hour"               null
"25000000"                 {"amountMinor":2500000000,"currency":"EUR"}     ← INT4 sınırı 2147483647'i aşıyor
"21474836.48"              {"amountMinor":2147483648,"currency":"EUR"}     ← INT4 sınırı + 1
"99999999999999999999"     "THROW Amount out of safe integer range: …"
"0.05"                     {"amountMinor":5,"currency":"EUR"}
total 5 payout 5 fee 0 · total 15 payout 14 fee 1 · total 25 payout 23 fee 2
```

Baseline girdilerinin commit'ler arasındaki izi:

```
e8a6b8e3 orders=0 retention=1
2e932ca0 orders=0 retention=1
c8dcef26 orders=1 retention=1
```

Geçmiş sır taraması (yalnız `commit:dosya:tür`, değer yok):

- Desen taramasında sağlayıcı anahtarı bulunmadı. Taranan desenler: Stripe live/test/whsec, AKIA, GOCSPX, AIza, PRIVATE KEY, sk-ant, OpenAI sk-, Resend, GitHub, Slack, Sentry DSN, Inngest signkey. Tek eşleşme `pg_url_remote` oldu: `c915bc43:docker-compose.yml` (geliştirme compose'u, konteyner içi `postgres-vector` host'u) ve `.venv` içindeki kütüphane kodu.
- Yerel `.env` değerleriyle karşılaştırmada gerçek sır niteliğinde iki eşleşme çıktı:
  - `AUTH_SECRET` (51 karakter): `c915bc43:src/lib/auth.ts`, `c915bc43:docker-compose.yml`, `ca73ced5:tmp-mint-cookie.mjs` ve 11 e2e spec dosyası (`tests/e2e/*.spec.ts`; ilk commit'ler 09c385b3, 3f3d7e76, 77579d02, c7dab147, 7a40d72e, 311c9022, 7b628a2d, f9831546, a2b18163, 9ca3ef5d, 2015fac5). Ayrıca `f681b96c:docs/agent-results/ADR-0002-evidence-2/probe-checkout-vat.mts`.
  - `CALENDAR_ENCRYPTION_KEY` (64 hex): `0ac06a01:src/lib/calendar/__tests__/encryption.test.ts`, `…/sync.test.ts`, `tests/calendar-token-db.live.test.ts`.
  - Diğer eşleşmeler (`EMBEDDING_MODEL`, `SEDIA_*_URL`, `CORDIS_*_ZIP_URL`) sır değil, açık yapılandırma değerleri.
- Dosya yolu taraması: `AB Project SaaS`, `client_secret`, `.env`, `.pem`, `.p12`, `service_account` ve `credentials.json` desenleri geçmişte **0** eşleşme verdi. OAuth JSON dosyası hiç commit'lenmemiş.
- Repo görünürlüğü: `gh repo view` → `{"isPrivate":true,"visibility":"PRIVATE"}`.

## 3. Bulgular

### (1) TASK-MULQK8IRX9GSN — marketplace sipariş güvenliği → ONAY

Kartın asıl hedefleri karşılanmış, kanıtını kendim ürettim:

- Fiyat istemciden gelmiyor. `orderMarketplaceService` artık yalnız `listingId` alıyor.
- İlan veritabanında doğrulanıyor. Yok, `unlisted` ya da `fulfilled` olan ilanlar tek bir `LISTING_NOT_FOUND` koduna düşüyor, varlık bilgisi sızmıyor. `OWN_LISTING` ve `PRICE_NOT_FIXED` yalnız ilan aktifse dönüyor. Aktif ilanlar zaten vitrinde, bu yüzden ek bilgi vermiyorlar.
- Keşif okuması yalnız `id, tenantId, status, price` alanlarını çekiyor (`orders.ts:105`). Yazma alıcının `withTenantOn` kapsamında yapılıyor.
- Tutarlar `Int` minor unit. `fee + payout == total` her durumda doğru.
- Migration idempotent. Kendi dosyasında ENABLE, FORCE ve `tenant_isolation` var. `rls.sql` döngüsüne de eklenmiş. `rls:check` 4b ve `rls:verify` bunu canlı olarak doğruluyor.

**Ö-1: Büyük fiyat, yakalanmayan bir hataya dönüşüyor.** Yer: `src/modules/marketplace/server/orders.ts:83-88` ve `:126`. Senaryo:

- Satıcı fiyatı `25000000` ya da `€21,474,836.48` yazıyor. `parseListingPrice` bunu kabul edip 2.500.000.000 minor unit döndürüyor (denemedeki satır).
- Kolon `INTEGER` (INT4, en fazla 2.147.483.647), bu yüzden `marketplaceOrder.create` hata fırlatıyor.
- 20 haneli bir fiyatta `toMinorUnits` daha ayrıştırma aşamasında hata fırlatıyor.
- İki durumda da server action throw ediyor. İstemci yalnız `console.error` yazıyor (`client.tsx`, `catch`), modal hiçbir şey söylemiyor ve sunucu 500 dönüyor.

Düzeltme: ayrıştırıcıda `amountMinor > 2_147_483_647` ise ve `toMinorUnits` hata fırlatırsa `null` dönsün, yani `PRICE_NOT_FIXED` olsun. Bunun için bir birim testi eklenmeli. Kalıcı çözüm, raporda da önerilen yapısal `priceAmountMinor` kolonu.

**Ö-2: Çift sipariş ve TOCTOU koruması yok.** Yer: `orders.ts:98-140`. Senaryo:

- Aynı `listingId` ile iki eşzamanlı POST gelirse (çift tıklama, ağ tekrarı ya da doğrudan action çağrısı) iki ayrı `CONFIRMED` satır yazılıyor. Ne idempotency anahtarı ne de benzersizlik kısıtı var. Buton `disabled={isOrdering}` ile kilitleniyor ama bu yalnız istemci tarafında bir önlem.
- İlan okuması ve sipariş yazımı iki ayrı transaction'da. Arada ilan `unlisted` olsa ya da fiyatı değişse bile sipariş eski değerlerle yazılıyor.

Bugün para tahsil edilmediği için etki kayıt kirliliğiyle sınırlı. Ödeme veya escrow bağlanmadan önce kapatılması şart. Düzeltme: action bir istemci `idempotencyKey` alsın ve `@@unique([tenantId, idempotencyKey])` kısıtı eklensin (ya da P2002 yakalanıp mevcut sipariş dönsün). Keşif okuması sipariş yazımıyla aynı işlemde yapılamıyor, çünkü ikisi farklı kapsamda. Bu yüzden yazımdan hemen önce tekrar kontrol edilsin ya da fiyat ve durum sipariş satırına anlık görüntü olarak kopyalansın (bugün zaten kopyalanıyor).

**Ö-3: Satıcı kendine gelen siparişi hiçbir kapsamda göremiyor ve şema yorumu tersini söylüyor.** Yer: `prisma/schema.prisma` (MarketplaceOrder dokümanı: "`sellerTenantId` … denormalized so a seller-side query never needs to join across the RLS boundary") ve `prisma/migrations/add-marketplace-order.sql:60-64`.

- Politika yalnız `"tenantId"` (alıcı) üzerinde kurulu. Canlı test bunu açıkça doğruluyor: "the order is readable by the buyer and by no other tenant", yani satıcının kapsamında sorgu `null` dönüyor.
- Senaryo: ileride "gelen siparişler" ekranı `withTenant(sellerTenantId)` ile `where: { sellerTenantId }` sorgusu yazarsa sonuç her zaman boş gelir. Geliştirici yoruma güvenip bu kez `withSystemScope` ile yeni bir bypass açar.
- Düzeltme: ya ikinci bir PERMISSIVE politika eklensin (`seller_read FOR SELECT USING ("sellerTenantId" = current_setting('app.tenant_id', true))`, rls.sql ve migration'a birlikte ve `rls:verify` kapsamına alınarak), ya da yorum "satıcı tarafı henüz okunamıyor, karar bekliyor" diye düzeltilsin. Satıcıya ödeme yapılan bir akışta ilk seçenek gerekli.

**K-1: Commit hijyeni, baseline girdileri yanlış commit'lerde.** Yer: `e8a6b8e3`. Bu commit'in mesajı "Recorded in tenant-bypass-baseline.json (CHECK D)" diyor ama o commit'te `orders.ts` girdisi yok (`orders=0`). Buna karşılık se-fb'nin billing prune'u ve `stripe-event-retention` girdisi bu commit'te (`retention=1`), yani kodu (`2e932ca0`) gelmeden önce. Senaryo: `e8a6b8e3` ve `2e932ca0` üzerinde `rls:bypass-check` kırmızı, bu da bisect'i ve kart izlenebilirliğini bozuyor. be-fb raporundaki "2e932ca0 girdimi düşürdü" açıklaması da tam doğru değil: girdi `e8a6b8e3`'e hiç girmemiş. HEAD'de sonuç doğru, bu yüzden yalnız kayıt olarak not ediyorum.

**K-2: TR/DE biçiminde `"1,500"` 1500 olarak okunuyor.** Yer: `orders.ts:81`. Rapor `2.500`'ü belirsiz sayıp reddediyor ama `1,500` (TR/DE yazımıyla 1,5) aynı belirsizlikte ve 1500 olarak kabul ediliyor. Pratikte kuruşta üç hane nadir olduğu için risk düşük. Yapısal fiyat kolonu bu sorunu da kapatır.

**K-3: Komisyon yuvarlaması platform aleyhine.** Yer: `applyPercentDiscount` (`money.ts:92`). Yuvarlama payout'u yukarı yuvarlıyor, bu yüzden 5 minor unit'lik bir siparişte fee 0, 25'lik bir siparişte fee 2 çıkıyor. Tutarlılık korunuyor. Bu bir ürün kararı; bilinçli olduğu bir yere yazılmalı.

**K-4: Tüm sipariş satırı istemciye dönüyor.** Yer: `actions.ts:57-75`. `MarketplaceOrderRow` içinde `tenantId`, `sellerTenantId` ve `listingId` var. İstemci yalnız `id`, `totalAmountMinor` ve `currency` alanlarını kullanıyor. Satıcının iç kiracı kimliği tarayıcıya gidiyor. Düşük etkili bir bulgu ama "yalnız gerekli alan" ilkesine aykırı. Düzeltme: action bir `select` projeksiyonu dönsün.

**K-5 (kapsam dışı, kayıt için): M8 modül ve rol kapısı yok.** `orderMarketplaceService` ve `createMarketplaceListing` modül (M8) veya plan kapısını ve üye rolünü denetlemiyor, yani her üye sipariş verebiliyor. Bu önceden de böyleydi, bu kartta regresyon değil. Ödeme bağlanırken ele alınmalı.

Not (bulgu değil, raporda zaten var): sayfa yalnız kiracının kendi ilanlarını listelediği için arayüzden yapılan her sipariş `OWN_LISTING` alıyor, dolayısıyla UI yolu bugün ölü. Vitrin kararı bekleniyor.

`0b52298a` (checkModuleAccess): `Tenant` ve `AddOnCatalog` RLS listesinde değil, `Subscription` ise listede. `withTenant` sarmalı Subscription include'unu `fabrika_app` altında görünür kılıyor. Doğru. Diğer `getEntitlements(tenantId)` çağıranlar hâlâ çıplak `prisma` kullanıyor; bu kartın kapsamı dışında.

`e40b5c72`: cron kaydı doğru. Job artık gerçekten servis ediliyor, bu yüzden (2)'deki system-scope sarmalı gerekli hale geldi. İkisi birlikte doğru.

### (2) TASK-MULQKFER4MF0Y — RLS bypass kapısı → ONAY

- `withSystemScope('cross-tenant-job')` gerekçesi doğru. Silme işlemi yalnız tarihe göre filtreliyor ve kiracı kümesi sorgunun çıktısı, bu da `system-scope.ts:108` tanımıyla birebir örtüşüyor. `system_scope` politikası `USING` ve `WITH CHECK` ile DELETE'i de kapsıyor (`rls.sql:192-194`). `StripeEventLog.tenantId` NOT NULL olduğundan NULL kiracı kenar durumu yok.
- `create-portal-session` ve `lifetimeLicence.create` sarmalları doğru. `tenantId` elde olduğu için `withTenant` en dar kapsam. `seq` yarışı mevcut `@unique` ve catch yoluyla karşılanıyor (`lifetime-licence.ts` ve `schema.prisma` `seq @unique`).
- Baseline prune doğru. HEAD'de `create-portal-session.ts` ve `stripe-event-retention.ts` içinde `prisma.` çağrısı kalmadı. `lifetime-licence.ts` içinde kalan `prisma.` çağrıları RLS'siz `Tenant` tablosu ve SECURITY DEFINER `lifetime_licence_count()`. `subscription-sync.ts`'teki kalan üç `|| ''` hemen ardından `if (!tenantId) throw` ile korunuyor. `rls:bypass-check`: "0 still owed".
- Canlı testler gerçekten `fabrika_app` rolüyle koşuyor: rol sorgusu yukarıda, 17/17 test ✓ ve hiçbiri skip değil.

**K-6: Billing ve retention canlı testleri rolü doğrulamıyor, eksik ortamda sessizce atlanıyor.** Yer: `tests/billing-k1-tenant-scope.live.test.ts:40-72` ve `tests/stripe-event-retention.live.test.ts:47-105`. `marketplace-order.live.test.ts:42` `rolbypassrls` değerini kontrol ediyor, bu iki dosya etmiyor. İki senaryo var:

- `DATABASE_URL_RLS_TEST` yanlışlıkla `fabrika` (BYPASSRLS) rolüne işaret ederse, sarmal kaldırılsa bile test yeşil kalır.
- Değişken yoksa `describe.skipIf` yalnız `console.warn` yazıp atlıyor. Yukarıdaki `.env` source sorunuyla bu tam olarak yaşanıyor.

Düzeltme: marketplace testindeki `rolbypassrls = false` ön koşulu bu iki dosyaya da eklensin. CI'da `DATABASE_URL_RLS_TEST` yoksa skip değil fail olsun.

**K-7:** (1)/K-1 ile aynı kök neden. Bu kartın baseline değişikliği be-fb'nin `e8a6b8e3` commit'ine girmiş, `2e932ca0` baseline'a hiç dokunmuyor (`git show --stat`). Commit mesajındaki "baseline pruned" ifadesi o commit için doğru değil.

### (3) TASK-MULQJZNB7U3QN — repo güvence → DÜZELTME GEREKLİ

Doğru olanlar:

- `.gitignore:97` `/AB Project SaaS/` kuralı çalışıyor (`git check-ignore -v` ile doğrulandı).
- OAuth JSON dosyası geçmişte hiç yer almamış (yol taramasında 0 eşleşme).
- Sağlayıcı anahtarı desenleri 0 eşleşme verdi.
- Remote private.
- `.venv` riski raporda dürüstçe belirtilmiş.

**Ö-4: Gömülü NextAuth imza anahtarı, raporun "gerçek sır bulunmadı" hükmünü geçersiz kılıyor.** Yer: `src/lib/auth.ts:170` (`secret: process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || "<sabit metin>"`) ve `docker-compose.yml:16`, ilk commit `c915bc43`. Aynı değer 11 e2e spec dosyasında, `tmp-mint-cookie.mjs`'te ve bir kanıt dosyasında da var (liste §2'de). **Yerel `.env`'deki `AUTH_SECRET` bu sabitle birebir aynı.** Senaryo:

- Oturumlar `strategy: "jwt"` ve `trustHost: true` ile çalışıyor.
- Herhangi bir ortamda `AUTH_SECRET` tanımlanmayı unutulursa uygulama hata vermeden bu bilinen anahtarla açılıyor. Sabit, NextAuth'un "MissingSecret" korumasını da devre dışı bırakıyor.
- Repoya erişimi olan herkes, bu ofisteki tüm ajanlar dahil, geçerli bir oturum JWT'si üretebilir. Bu, platform admin dahil herhangi bir kullanıcıya bürünmek demek.
- Repo private olduğu için bunu B değil Ö olarak derecelendiriyorum. Desen taraması bu uygulamaya özgü sabiti yapısı gereği bulamaz; kontrolün bir parçası yerel `.env` değerlerinin geçmişte aranması olmalı.

Düzeltme (ayrı kart, se-fb veya devop-fb):

- (a) `auth.ts` içindeki sabit kaldırılsın. `AUTH_SECRET` yoksa üretimde uygulama açılışta hata versin.
- (b) Yerel ve ortak ortamlarda `AUTH_SECRET` yeni, rastgele bir değere döndürülsün. Değer geçmişte kaldığı için "gizli" sayılamaz.
- (c) e2e spec'leri anahtarı sabit metinden değil `process.env.AUTH_SECRET`'tan okusun.
- (d) Aynı dosyadaki `"demo-google-id"` ve `"demo-google-secret"` fallback'leri de kaldırılsın. Bunlar sır değil ama yapılandırma hatasını gizliyorlar.

**K-8: `.gitignore` yalnız tek bir klasör adını kapsıyor.** Yer: `.gitignore:95-97`. Senaryo: Google Console'dan yeniden indirilen `client_secret_*.json` dosyası repo köküne ya da `Downloads`'tan kopyalanan başka bir klasöre konursa ignore edilmiyor. `*.pem` var ama `*.p12`, `*.key`, `service-account*.json` ve `client_secret*.json` yok. Düzeltme: bu genel desenler eklensin. Bu değişiklik `.env*` kuralının `.env.example`'ı da yuttuğunu görünür kılar; bir şablon izlenecekse `!.env.example` istisnası da eklensin.

**K-9: Yerel `CALENDAR_ENCRYPTION_KEY` commit'li test fixture'ıyla aynı** (`0ac06a01`, üç test dosyası). Yalnız yerel ortamı etkiliyor. Paylaşılan veya üretim ortamında bu anahtar kullanılmamalı. Bu, Ö-4'teki rotasyon kartına bir not olarak eklenebilir.

## 4. Değişen dosyalar

- `docs/agent-results/TASK-MULQLVLW21FE2-crw-fb.md` (yalnız bu rapor). Kod değiştirilmedi.
- Geçici dosyalar yalnız scratchpad'de (`fb-head` worktree'si ve env dosyası) ve iş sonunda silindi.

## 5. Riskler

- İnceleme HEAD `cc9ebbd3` üzerinde yapıldı. devop-fb CI kartı için dev'e yeni commit atabilir, ama incelenen yollara dokunmadığı sürece sonuç geçerli.
- Ö-4 için anahtarın herhangi bir paylaşılan veya üretim ortamında kullanılıp kullanılmadığını bilmiyorum. Bu makinede yalnız yerel `.env`'e bakabildim. Deploy ortamının `AUTH_SECRET`'ı patron veya devop tarafından kontrol edilmeli.
- Tüm test paketini koşmadım, yalnız ilgili 25 dosyayı (353 test) ve 3 canlı dosyayı. Tüm paketin sonucu be-fb raporunda var, ama başkasının rakamı kanıt sayılmaz.

## 6. Açık sorular

- Satıcı tarafı sipariş görünürlüğü (Ö-3) politika ile mi çözülecek, yoksa vitrin kararıyla birlikte mi ele alınacak?
- `AUTH_SECRET` herhangi bir deploy ortamında tanımsız mı, yani fallback üretimde fiilen kullanıldı mı?

## 7. Sonraki adım (leed-fb için önerilen kartlar)

1. **Ö-4 + K-9 (se-fb):** auth fallback'ini kaldır, `AUTH_SECRET` ve yerel `CALENDAR_ENCRYPTION_KEY`'i döndür, e2e spec'leri env'den okut.
2. **Ö-1 + Ö-2 (be-fb):** fiyat üst sınırı veya hata fırlatınca `PRICE_NOT_FIXED` dönsün, idempotency anahtarı eklensin, ilgili testler yazılsın.
3. **Ö-3 (be-fb, vitrin kararına bağlı):** `seller_read` politikası eklensin ya da yorum düzeltilsin.
4. **K-6 (se-fb):** canlı testlere `rolbypassrls` ön koşulu eklensin, CI'da eksik env skip değil fail olsun.
5. **K-8 (devop-fb):** `.gitignore`'a genel sır desenleri eklensin. Mevcut `.venv` kartıyla birleştirilebilir.
6. **Ortam (devop-fb, TASK-MULQKN4K7SRN0 kapsamına uyuyor):** `.env` 57. satırdaki `EMAIL_FROM` değeri tırnağa alınsın ki `source .env` çalışsın.

## Platform beyanı

Doğrulama **macOS** (Darwin 27.0.0) üzerinde yapıldı; Postgres Docker'daki `fabrika-postgres` konteynerinde (`fabrika_app` rolü) koştu. İncelenen kod platformdan bağımsız: Prisma/Postgres sorguları, React ve `.gitignore` kuralları. Süreç öldürme, dosya yolu ayrımı ya da kabuk veya ikili adı içermiyor. `.gitignore:97` kuralı (boşluklu klasör adı) git tarafından her platformda aynı eşleşir. Windows ve Linux'ta **koşulmadı**, çünkü bu makinede yalnız mac var. CI (Linux runner) şu an devop-fb kartında kırmızı olduğu için oradan da kanıt alınamadı.
