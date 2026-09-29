# TASK-MULYGTXCZNCOP — FB İNCELEME-7 (crw-fb)

Repo `/Users/macbook/alan/FONBRIDGE`, dal `dev`, HEAD `68fdec03`. Kod değiştirilmedi. Kapıları kendim koştum. Başkasının rakamı kanıt olarak kullanılmadı.

## Kararlar

| #   | Kart                                             | Commit                | Karar                                     |
| --- | ------------------------------------------------ | --------------------- | ----------------------------------------- |
| 1   | TASK-MULXF0AVMD8MN pano sızıntısı (PİLOT KAPISI) | `ef8627b0` `68fdec03` | **DÜZELTME GEREKLİ** (B-1)                |
| 2   | TASK-MULV3JXS1AW5X Tenant.province               | `49bf9138` `8b4b2654` | **ONAY** (il görünümü Kart 1 B-1'e bağlı) |
| 3   | TASK-MULUJ8O4JH1PF AuditEvent NULL satırlar      | `12aacc7d` `849d7708` | **ONAY**                                  |
| 4   | TASK-MULRSG6T55LO0 B11 kamu TL paketleri         | `2c35e535`            | **ONAY** (Ö-1 bloke etmiyor)              |
| 5   | TASK-MULXYY4DPRBCF M9 takvim e2e                 | `965c2c2f` `ed2d1ec6` | **ONAY** (e2e'yi ben koşamadım, aşağıda)  |

Bloke eden tek bulgu Kart 1 B-1. Pano, bu düzeltme gelmeden pilota açılmamalı.

## 1. Ne yapıldı

- Beş kartın diff'ini satır satır okudum.
- Kapıları `set -a; source .env; set +a` ile koştum: typecheck, lint, test, rls:check, rls:verify, rls:bypass-check, i18n:check, `apply-migrations.sh --list`.
- Üç yeni migration'ı ve down'larını geçici bir DB'de (`crw_fb_tmp`) iki geçişle denedim. DB, dev şemasının dökümünden kuruldu ve iş bitince silindi.
- Kart 1 için bağımsız bir saldırgan yazdım. `suppressedCells` çıktısını alıyor ve okuyucunun gördüğü her sayıyı doğrusal bir eşitlik olarak kuruyor. Adım ⊆ kayıt eşitsizliklerini ve ≥0 kısıtlarını ekliyor. Sonra her gizli küçük grup için LP ile (scipy HiGHS) alt/üst sınırı hesaplıyor.
- Tarayıcıda :3000'de `/tr/kayit?il=Samsun` ve `/tr/ajans?il=Samsun` sayfalarını açtım.

## 2. Kapı çıktıları (bu oturumda, HEAD 68fdec03)

| Kapı                         | Sonuç                                                                                                                                                                                                                               |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm typecheck`             | rc=0                                                                                                                                                                                                                                |
| `pnpm lint`                  | rc=0                                                                                                                                                                                                                                |
| `pnpm test`                  | rc=0 — `Test Files 185 passed \| 2 skipped (187)`, `Tests 2105 passed \| 8 skipped (2113)`                                                                                                                                          |
| Kartların testleri (verbose) | `agency-funnel.live`, `auditevent-null-system-only.live`, `funnel.test`, `province.test`, `public-sector*`, `calendar-token-db.live` → `Test Files 7 passed (7)`, `Tests 58 passed (58)`. Canlı testler atlanmadı, gerçekten koştu. |
| `pnpm rls:check`             | rc=0 — 47 model, CHECK 4b 15 tablo ENABLE+FORCE+tenant_isolation                                                                                                                                                                    |
| `pnpm rls:verify`            | rc=0 — "AuditEvent kiracı bağlamında 349 kiracısız satırın hiçbirini görmedi", "system scope'ta 349 kiracısız satırın hepsini gördü"                                                                                                |
| `pnpm rls:bypass-check`      | rc=0 — "no new tenant bypass … 31 on the sanctioned cross-tenant path, 0 still owed"                                                                                                                                                |
| `pnpm i18n:check`            | rc=0 — 325/325 literal, baseline içinde                                                                                                                                                                                             |
| `apply-migrations.sh --list` | son üç satır: `auditevent-null-system-only.sql`, `add-tenant-province.sql`, `add-agency-funnel-province.sql`                                                                                                                        |

**Migration denemesi (geçici DB, iki geçiş).** Durum sütunları sırayla şunlar: AuditEvent politikaları · `Tenant.province` var mı · `agency_funnel_counts_by_province` var mı.

```
== up pass 1 / 2          → 3 dosya rc=0   state: system_scope,tenant_isolation 1 1
== down pass 1 / 2        → 3 dosya rc=0   state: system_scope,tenant_or_shared 0 0
== up-after-down pass 1/2 → 3 dosya rc=0   state: system_scope,tenant_isolation 1 1
== CHECK probe: 'Samsunn' → DETAIL: Failing row contains (...) · 'Samsun' → INSERT 0 1
```

Sonuç: idempotent, down simetrik, CHECK doğru çalışıyor.

## 3. Bulgular

### Kart 1 — TASK-MULXF0AVMD8MN: DÜZELTME GEREKLİ

**B-1: Tamamlayıcı gizleme her çizgiyi tek başına kontrol ediyor. İki çizgi birleşince maskeli hücre TAM olarak geri hesaplanıyor.**

Yer: `src/lib/agency/funnel.ts:238-248` (`protectLine`) ve `:235`.

Kök neden: bir çizgide gizli toplam ≥5 ise çizgi "güvenli" sayılıyor. Ama 0 değerli gizli hücreler de bu toplama giriyor. Oysa okuyucu bu sıfırları başka bir çizgiden kanıtlayabiliyor: `registered` çizgisinde görünen türler toplamı tutuyorsa, geri kalan türler 0 kurumdur. Her adım ⊆ kayıt olduğu için o türlerin tüm adımları da 0'dır. Böylece "gizli kütle" tek bir hücreye iniyor ve o hücre çıkarmayla okunuyor.

Somut senaryo: saf `buildProvinceFunnel` ile ürettim, `poc.ts`. Veri: Samsun'da MUNICIPALITY kayıt 13 / konsept not 7, PUBLIC kayıt 9 / konsept not 8. Tokat'ta iki tür de 10/10. Diğer adımlar kayda eşit.

```
view Samsun
  ALL   registered=22 conceptNote=15
   MUNICIPALITY registered=13 conceptNote=7
   PUBLIC registered=9 conceptNote=small
   SME registered=small conceptNote=small
view ALL
  ALL   registered=42 conceptNote=35
   MUNICIPALITY registered=23 conceptNote=17
   PUBLIC registered=19 conceptNote=small
```

Okuyucunun hesabı:

1. 22 = 13 + 9, yani Samsun'da başka türden kurum yok. Diğer türlerin konsept notu da 0.
2. PUBLIC konsept not = 15 − 7 = 8.
3. 9 − 8 = **1**. Samsun'daki PUBLIC kurumlardan tam 1 tanesinin konsept notu yok.

"Tüm iller" görünümü de aynı sonucu veriyor: 35 − 17 = 18 ve 19 − 18 = 1. Bu, DoD'deki "toplam − diğerleri ve ardışık adım farkı yoluyla geri hesaplanamıyor" maddesini doğrudan bozuyor. Testlerin kaçırma nedeni şu: `funnel.test.ts:276` ve `:155`'teki property testleri her çizgide gizli hücreyi 0 kabul edip tek çizgi farkına bakıyor. Çizgileri birleştiren bir saldırganı modellemiyorlar.

Ölçek: rastgele küçük tablolar ürettim (1–4 il, 1–4 tür, kayıt 0–14). LP saldırganıyla "1 ≤ min ve max ≤ 4" olan her gizli küçük grubu açık saydım.

- tohum 1: 150 tablonun **35'inde** en az bir açık. 8402 küçük hedefte 53 açık.
- tohum 7: 150 tablonun **42'sinde** açık. 8579 hedefte 77 açık.

Açıkların çoğu adım farkı (`registered−pipeline` 19, `registered−savedSearch` 12, `registered−conceptNote` 10, `pipeline−conceptNote` 7). Ama hücrenin kendisi de açılıyor:

- `registered|LARGE|<il yok>` = 3, tam olarak.
- `savedSearch|MUNICIPALITY|<il yok>` = 1, tam olarak.

İl bildirmemiş kurumların "hiç yayımlanmaz" kütlesi de açığa çıkıyor.

Pilotta tür sayısı az olacak (belediye + KOBİ gibi). Bu da sıfır türlerin kanıtlanmasını kolaylaştırıyor, yani risk tipik durumda en yüksek.

Önerilen düzeltme yönü (doğrulanmadı, fe-fb tasarlamalı):

- (a) Bir çizgide görünür toplamı örten gizli kütle, **değeri >0 olan en az iki gizli parçadan** oluşmalı. Sıfırlar örtü sayılmamalı. Tek sıfırdan büyük gizli parça kalırsa en küçük sıfırdan büyük görünür parça da maskelenmeli.
- (b) Asıl kapı olarak bu saldırganın bir benzeri (tam sayılı Gauss eliminasyonu ya da LP sınırı) property testi olarak eklenmeli. Ben scipy kullandım; TS'de tam sayılı eliminasyon yeterli. Kırmızı→yeşil kanıtı yukarıdaki iki örnekle kurulabilir.

Yöntem yine yetmezse iki yedek var: sayıları 5'in katına yuvarlamak ya da tür kırılımını il görünümünde kapatmak. Bunlar HUKUK-5'e gider.

**Ö-1: Adım 6–7'nin birimi başvuru, kurum değil. Küçük hücre kuralı ise kurum sayısı için yazılmış.**

Yer: `src/lib/k5-pipeline/applicationOutcome.ts:80-84` (`tx.proposal.count`) ve `funnel.ts:370-377`.

Senaryo: Samsun'da 5 KOBİ var. Bunlardan biri 6 başvuru yapmış, 5'i kabul edilmiş. Pano "gönderildi 6, kabul 5" gösteriyor ama bu tek bir kurumun sonucu. Grup kuralı (kayıt ≥5) bunu engellemiyor.

HUKUK-5'e sorulmalı: başvuru sayıları kurum sayısına mı çevrilsin (`count(DISTINCT tenantId)`), yoksa baskınlık kuralı mı eklensin?

**K-1:** Zamansal fark (dün/bugün) ve "fark 0" grup ifşası açık kalıyor. fe-fb bunları raporda kendisi yazmış (`TASK-MULXF0AVMD8MN-fe-fb.md:138-139`) ve HUKUK-5'e taşımış. Bir ekleme: panelde kod başına `usedCount` görünüyor (`ajans/page.tsx:46-55`). Ajans tek kullanımlık bir kodla bir kurumun kayıt anını biliyor. Bu da zamansal farkı kurum düzeyine indiriyor.

**K-2:** `suppressedCells` `TR_PROVINCES` dışındaki il anahtarlarını sessizce yok sayıyor (`funnel.ts:185`). Bugün `getAgencyFunnel` bunları `NO_PROVINCE`'a çevirdiği için zararsız (`:335`). Fonksiyon dışarıya export edildiği için not düşüyorum.

Diğer DoD maddeleri tamam:

- 30/90 seçici kaldırıldı: `page.tsx:41-42`, `?gun=` okunmuyor.
- Tek kümülatif kohort var: SQL'e `NULL`, B7'de `since` yok.
- Benim önceki Ö-1/K-6 örneklerim kırmızı→yeşil test olarak duruyor (`funnel.test.ts:372`, `:395`).
- İl × adım matrisi aynı motordan geçiyor.
- HUKUK-5 notu var.

Tarayıcı: `/tr/ajans?il=Samsun` ajans üyesi olmayan oturumla açıldığında "403 Bu sayfaya erişiminiz yok" gösteriyor. Ajans oturumuyla görsel kontrol yapmadım: giriş için tıklama onayı gerekiyordu ve dev DB'de `province` dolu kiracı sayısı 0. B-1 sayfanın kullandığı saf fonksiyonda kanıtlandı.

### Kart 2 — TASK-MULV3JXS1AW5X: ONAY

- `schema.prisma` `province String?` var. İki migration idempotent, down'ları var ve apply-order'da sırayla duruyor (yukarıdaki deneme). CHECK'teki 81 ad `TR_PROVINCES` ile birebir aynı (`province.test.ts`).
- Kayıt: il isteğe bağlı. `toTenantProvince` listede olmayan değeri hata vermeden null'a çeviriyor (`auth.ts` credentials ve OAuth çerezi).
  - Kayıtla açılan her kiracı TR olduğu için alan her kayıtta gösteriliyor. `provinceAppliesTo` bunu tutarlı biçimde kapsıyor.
  - Tarayıcı: `/tr/kayit?il=Samsun` → "Kurumun ili (isteğe bağlı)" alanı **Samsun** seçili geliyor.
- Ayarlar: `settings/profile/actions.ts` yalnız `manage_users` yetkisiyle düzenliyor. Kiracı id'si oturumdan geliyor. TR dışında `notApplicable` dönüyor. Değişiklik `withTenant` içinde audit'e yazılıyor.
- OAuth çerezi her başlangıçta yazılıyor ya da siliniyor, httpOnly ve 15 dk ömürlü.
- DATA_MODEL §19 güncel.
- **Sözlük sorusu:** Karne (`parseProvince` → `TR_PROVINCES`), `Tenant.province` (aynı fonksiyon + DB CHECK) ve katalog aynı yazımı kullanıyor. Katalogdaki değerler `['Edirne','Kırklareli']` ve `['Amasya','Çorum','Samsun','Tokat']` (`catalog.ts:408`, `:489`).
- **K-3:** Katalog testi `turkeyRegions`'ı yalnız "boş olmayan dizi" diye doğruluyor (`catalog.test.ts:33`), `TR_PROVINCES`'a bağlamıyor. İleride "Istanbul" gibi bir yazım sessizce eşleşmez. Tek satırlık bir `z.enum(TR_PROVINCES)` bunu kapatır.
- Pano il filtresi: DoD'deki "<5 maskesiyle çalışıyor" maddesi Kart 1 B-1 nedeniyle henüz sağlanmıyor. PoC'deki Samsun görünümü bu yüzden sızıyor. Bu kartın kendi kodu doğru, düzeltme Kart 1'e ait.

### Kart 3 — TASK-MULUJ8O4JH1PF: ONAY

- `auditevent-null-system-only.sql` apply-order'da (`--list` 27. sıra). **Paylaşılan dev DB'ye uygulanmış.** Kanıt (`docker exec fabrika-postgres psql`, `pg_policies`): `system_scope`, `tenant_isolation` var, `tenant_or_shared` **yok**. 349 NULL satır duruyor, silinen satır yok.
- `rls:verify` kiracı bağlamında 0/349, system scope'ta 349/349 ölçtü. `tests/auditevent-null-system-only.live.test.ts` yeşil.
- NULL yazan çağrıların hepsi `withSystemScope` içinde: `export-data.ts`, `request-deletion.ts`, `users-scheduled-deletion.ts` ve `plan-repository` platform yazımları. Kiracılı yazımlar `withTenant` içinde.
  - `src/` içinde `prisma.auditEvent.*` çıplak çağrısı kalmadı (grep boş).
  - Kalan 28 `auditEvent.create` çağrısının hepsi `tenantId` veriyor.
- `/admin/audit` `withSystemScope('platform-admin', …)` ile okuyor. Kare kanıtı se-fb raporunda.
- **K-4 (:3000 davranışı):** :3000'deki `next-server` (pid 68081) bu repodan çalışıyor (cwd `/Users/macbook/alan/FONBRIDGE`). `.env`'deki `DATABASE_URL` rolü `fabrika` ve bu rol `rolsuper=t, rolbypassrls=t`. Yani :3000 büyük olasılıkla RLS'yi hiç uygulamıyor ve eski/yeni politika farkı orada görünmez.
  - Varsayım: sürecin ortamını okuyamadım, `.env` kullandığını cwd'den çıkarıyorum.
  - Politikanın gerçek ölçümü `fabrika_app` ile koşan `rls:verify` ve canlı testlerde.

### Kart 4 — TASK-MULRSG6T55LO0: ONAY

- Fiyatlar TRY kuruş: 9.000.000 / 24.000.000 / 48.000.000, yani 90.000 / 240.000 / 480.000 TL yıllık, KDV hariç. Koltuklar 2/6/15 (`catalog.ts:497-525`). Hizmet günleri `PlanFeature` text satırı olarak tutuluyor.
- Planlar `visibility: 'private'`. Atama yalnız `requirePlatformAdmin` ile yapılıyor (`admin/billing/plans/actions.ts:174,185`). Yazımlar `withTenant` içinde.
- Canlı bir Stripe/iyzico aboneliği varsa `LiveProviderSubscriptionError` fırlatılıyor. Ödeme sağlayıcısına çağrı yok, şema değişikliği yok.
- Koltuk sınırı: `POST /api/invitations` sınırı aşan daveti 403 `SEAT_LIMIT_REACHED` ile reddediyor.
- **Ö-1 (yarış, koddan; koşulmadı):** `seat-limit.ts:50-65` önce sayıyor, sonra `route.ts:87` upsert ediyor. İkisi aynı READ COMMITTED transaction'da ama kilit yok.
  - Senaryo: 2 koltuklu planda 1 üye var. İki farklı adrese eşzamanlı iki POST gidiyor. İkisi de "1+0 < 2" görüyor ve ikisi de yazıyor, sonuç 1+2 = 3.
  - Düzeltme: sayımdan önce `SELECT … FROM "Tenant" WHERE id=$1 FOR UPDATE` ya da `pg_advisory_xact_lock(hashtext(tenantId))`.
  - Etki küçük (bir fazla davet), bu yüzden bloke etmiyor.
- **K-5:** Sözleşme yılı hiçbir yerde bitmiyor. `assignPlanToTenant` `currentPeriodEnd` yazmıyor, `getEntitlements` da süre kontrol etmiyor (`billing.ts:102`). Yıl sonunda plan elle kaldırılmazsa sonsuza kadar açık kalır. Operasyon notu ya da kart gerekli.
- **K-6:** Sözleşme `upsert`'i `seatsExtra`/`workspacesExtra` alanlarını sıfırlamıyor (`plan-repository.ts` `terms`). Eski bir abonelikten kalan ek koltuklar kamu paketine taşınıyor.
- **K-7:** Koltuk sınırı tüm planlarda geçerli oldu: Discover'da 1 koltuk var, yani ajans koduyla gelen belediye de davet gönderemiyor. Ayrıca `/accept-invite` akışı yok. be-fb ikisini de raporda kendisi yazmış (`:113`). Pilot öncesi ürün kararı gerekiyor.

### Kart 5 — TASK-MULXYY4DPRBCF: ONAY

- Kök neden doğru. Playwright'ta `getByRole(name)` varsayılan olarak büyük/küçük harfe duyarsız alt dize eşlemesi yapar. "Bağla" da "**Bağla**ntısını Kes"in önekidir. Bu yüzden eski bekleme, az önce tıklanan düğmeyle anında geçiyordu.
- Değişiklik testi gevşetmiyor, sıkılaştırıyor: `exact: true` ekleniyor ve `icsCard 'Bağlı'` `toHaveCount(0)` ek bir assert.
- Ürün kodu doğru. `disconnectCalendar` (`src/modules/m9/server/calendar-actions.ts:28-65`) `withTenant` içinde `deleteMany({ id, tenantId, userId })` çalıştırıyor. `count === 0` ise hata fırlatıyor. Spec satırın DB'den gittiğini `findUnique → null` ile kontrol ediyor.
- **E2E'yi ben koşamadım.** `playwright test … m9-calendar-connect.spec.ts --repeat-each=3` komutunu AgentSpace kill-guard'ı `R8-canli-app-varken-acilis` ile reddetti. Guard'ı atlatmadım. Onay kodu okumasına dayanıyor; CI'da yeşil koşu görülmeli.

## 4. Değişen dosyalar

- `docs/agent-results/TASK-MULYGTXCZNCOP-crw-fb.md` (yalnız bu rapor). Kod değişmedi.
- Geçici DB `crw_fb_tmp` oluşturuldu ve silindi. Saldırı düzeneği scratchpad'de kaldı, repoya girmedi.

## 5. Riskler

- B-1 düzeltilmeden pano açılırsa ajans, il × tür × adım kırılımında 1–4 kurumluk grupları tam sayıyla okuyabilir. Bu, ekin §3.1 taahhüdüne aykırı.
- Kart 4 K-5: bir sözleşme sessizce süresiz kalabilir.

## 6. Açık sorular

- HUKUK-5: başvuru sayıları kurum mu, başvuru mu sayılsın (Kart 1 Ö-1)? Yuvarlama/anlık görüntü seçeneği B-1'in yedeği olarak da değerlendirilsin mi?
- Ürün: Discover'da 1 koltuk kuralı ajans koduyla gelen belediyeler için bilinçli mi (K-7)?

## 7. Sonraki adım

- fe-fb: B-1 için kırmızı test (yukarıdaki iki örnek) → düzeltme → birleşik çizgi saldırganı property testi. Sonra crw-fb yeniden inceler.
- be-fb: Ö-1 kilidi; K-5 için kart.
- CI'da m9 spec'inin yeşil koşusunun linki Kart 5'e eklensin.

## Platform beyanı

Doğrulama **mac** (Darwin 27.0, zsh; Postgres 5433 docker konteyneri) üzerinde yapıldı.

- İncelenen kod yolları (saf TS maskeleme, SQL migration'lar, Next server action'ları, Playwright seçicisi) platforma bağlı değil. Kabuk, süreç ya da dosya yolu farkı yok.
- Windows/Linux'ta koşulamadı: bu ofiste yalnız mac var. Koddan beklenen davranış aynı.
- E2E (Kart 5) hiçbir platformda koşulamadı (kill-guard).
