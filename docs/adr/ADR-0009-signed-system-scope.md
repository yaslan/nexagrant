# ADR-0009 — `system_scope` politikası imzalı: bayrağı yalnız `enter_system_scope` açar

- **Durum:** UYGULANDI, dalda (`be-fb/o1-system-scope`). Entegrasyonu devop-fb yapar.
- **Tarih:** 2026-09-30
- **Kart:** TASK-MUOGMQK3JAH4Y (FB-GAP-1). Bulgu: İNCELEME-115 Ö-1 (`docs/agent-results/TASK-MUOFKM666PDF8-be-fb.md`).
- **Hazırlayan:** BE-FB
- **İlgili:** `docs/agent-results/TASK-MTVTPVTEBCF5Z-de-fb.md` §6.1 (sert sınır için ikinci rol kararı, hâlâ açık).

## 1. Bağlam

`system_scope` RLS politikası `current_setting('app.system_scope', true) = 'on'` koşuluna bakıyordu. `app.system_scope` bir yer tutucu GUC'dur. Bu yüzden USERSET'tir ve PostgreSQL hiçbir rolün onu yazmasını engelleyemez. `fabrika_app` kiracı yalıtımını tek satırla açıyordu: `SET`, `SET LOCAL`, `set_config()`, `PGOPTIONS='-c app.system_scope=on'` ya da bağlantı dizesindeki `options=` (ölçüldü: 0 yerine 11/11 Membership satırı). `prisma/rls.sql`'deki "the only way to set it is enter_system_scope" ve "REVOKE EXECUTE closes the door" cümleleri bu yüzden yanlıştı.

Kısıtlar:
- **I-1 (TASK-MUOEGWSV8I7H0):** `scripts/apply-migrations.sh`, sahip rolüyle her dosyayı düz `SET app.system_scope = 'on'` oturumuyla koşuyor. FORCE RLS tablolarındaki backfill'ler buna dayanıyor.
- Migration'lardaki dört SECURITY DEFINER fonksiyon fonksiyon düzeyinde `SET app.system_scope = 'on'` taşıyor. Sahip rolüyle koşuyorlar.
  - **Değişti (TASK-MUOG51GJ3PUOG, 01.10.2026):** Supabase'de süper kullanıcı yok, sahip `SET ON PARAMETER` alamıyor. Fonksiyonlar artık bayrağı gövdede `set_config('app.system_scope','on',true)` ile açıyor ve her çıkışta çağıranın değerini geri yüklüyor; fonksiyon düzeyinde `SET` yok (`scripts/apply-migrations.sh` geri gelmesini reddeder).
- `withSystemScope` çağıranları (35 çağrı yeri) değişmemeli.
- `tenant_isolation` metni değişmemeli, çünkü migration kopyaları bayt bayt karşılaştırılıyor.

## 2. Seçenekler (1-3-1)

**Problem:** Kapsam bayrağını `fabrika_app` kendisi yazabiliyor. Politika bayrağın kimden geldiğini bilmiyor.

| | Seçenek | I-1 (sahip yolu) | Performans | `enter_system_scope` çağrıları |
|---|---|---|---|---|
| a | **Definer'ın yazdığı durum.** `enter_system_scope` yalnız sahibin yazabildiği bir tabloya (ya da oturum başına geçici tabloya) `(pid, xid)` satırı yazar. Politika bu satırı SECURITY DEFINER bir fonksiyonla arar. | Sahip için ayrıca bir istisna gerekir, yoksa düz `SET` artık açmaz. | Her kapsam girişi bir yazma demek: xid ayrılır, WAL üretir, satırlar birikir ve temizlik işi gerekir. Geçici tablo yolunda `fabrika_app` aynı adlı tabloyu önceden kurup sahiplik kontrolünü atlatmaya çalışabilir, ayrıca TEMP yetkisi ve havuzlanmış bağlantı sorunu çıkar. | Değişmez |
| b | **İmzalı bayrak (mühür).** `enter_system_scope`, `app.system_scope_token`'a SHA-256(sır ‖ pid ‖ transaction_timestamp ‖ sır) yazar. Sır, `fabrika_private` şemasında yalnız sahibin okuyabildiği bir tablodadır. Politika mührü yeniden hesaplar. Ayrıca tablonun sahibi rol düz `SET` ile geçer. | **Değişmez.** Sahip `ALTER TABLE … NO FORCE ROW LEVEL SECURITY` ile zaten her şeyi açabilir. Onun düz `SET`'ini kabul etmek ona yeni bir güç vermez. `apply-migrations.sh`'a dokunulmaz. | Durum yok, yazma yok. Yüklem `(SELECT …)` içinde bir InitPlan olur ve sorgu başına bir kez hesaplanır, satır başına değil (EXPLAIN ile ölçüldü). | Değişmez (gövdeye bir `set_config` eklenir) |
| c | **Ayrı DB rolü.** `system_scope` politikası `TO fabrika_system` gibi ayrı bir role bağlanır. Çapraz kiracı yolları ikinci bir bağlantı havuzundan gider. | Sahip rolü de politikaya eklenmeli. | İkinci havuz, bağlantı sayısı iki katı. | `withSystemScope` gövdesi değişir, çağıranlar değişmez. Yeni sır ve deploy işi gerekir. |

**Öneri ve karar: (b).** Açığı (bayrağın taklit edilmesi) kapatıyor. I-1'e, 35 çağrı yerine, `tenant_isolation` metnine ve migration zincirine dokunmuyor. Yazma yok, durum yok. (c) gerçek sert sınırdır ama de-fb §6.1'de insan kararına bağlı, ikinci sır ve havuz istiyor. (b), (c)'yi engellemez: (c) geldiğinde `system_scope_open` yüklemine rol koşulu eklenir.

## 3. Uygulama

- `prisma/rls.sql`: `fabrika_private.system_scope_key` (tek satır, ilk koşuda üretilir, sonraki koşularda korunur), `fabrika_private.system_scope_seal()` (yalnız sahip), `public.system_scope_sealed()` (SECURITY DEFINER, yalnız boolean döner), `public.system_scope_open(regclass)` (SECURITY INVOKER yüklem). Politika: `USING/WITH CHECK ((SELECT public.system_scope_open('"T"'::regclass)))`.
- `enter_system_scope` önce mührü, sonra bayrağı yazar. Liste ve imza aynı kaldı.
- `prisma/migrations/auditevent-null-system-only.sql` her zincir koşusunda AuditEvent'in `system_scope` politikasını yeniden kuruyordu, eski metinle. Artık fonksiyon varsa rls.sql'in metnini, yoksa yalnız sahibe açık bir metni kuruyor.
- `scripts/check-rls-live.ts` (`rls:verify`): üç sahte kapsam şekli (`set_config`, oturum `SET`, yeniden oynatılan mühür) ve bir pozitif kontrol eklendi.
- `tests/system-scope.live.test.ts`: taklit edilen kapsam için 9 yeni test (PGOPTIONS ve `options=` dahil).

## 4. Hâlâ açık olanlar

- `fabrika_app` `enter_system_scope`'u **çağırabilir**. Kendi ifadesini koşabilen bir SQL enjeksiyonu kapsama yine girer. Bu, (c)'nin konusu.
- Mühür `pid + transaction_timestamp()`'a bağlı. Aynı backend'de aynı mikrosaniyede başlayan iki işlem olamaz. Saatin geri alınması kuramsal bir çakışma yaratır. Onda da saldırganın o anki geçerli mührü önceden bilmesi gerekir.
- `drop-marketplace.down.sql` geri yüklediği iki tabloya eski metinli `system_scope` kuruyor. Down'dan sonra `pnpm db:rls` koşulmalı (zaten gerekli), o zaman düzelir.
- `rls.sql`'i koşan rol `CREATE SCHEMA` yetkisine sahip olmalı. DB sahibi olan migration rolünde bu yetki var.
- Sır yenileme: `TRUNCATE fabrika_private.system_scope_key; pnpm db:rls`. O sırada açık olan kapsam işlemleri, işlem bitene kadar 0 satır görür.

## 5. Ek: `public-intake` tabloya göre daraltıldı (FO-52, K-569554 = C, 18.10.2026)

- `system_scope_open` mühürlü dalda amaca bakar: amaç `public-intake` ise yalnız `ExpertPreRegistration`, `ExpertFounderCounter` ve `ExpertPreRegAttempt` (FO-26: IP başına gönderim sayacı, aynı kayıt işleminde yazılır) açılır. Kontrol `to_regclass` ile yapılır, çünkü bu veritabanında henüz olmayan bir tablo hata vermez, listede yokmuş gibi davranır. Bu listenin kopyaları: `prisma/rls.sql` `system_scope_open`, `scripts/check-rls-live.ts` `PUBLIC_INTAKE_TABLES`, `src/lib/system-scope.ts` (`public-intake` yorumu). Öteki 5 amaç değişmedi. Sahip dalı (`pg_has_role`) amaca bakmaz.
- Ölçüm (yerel, `fabrika_app` ile): önce 53 system_scope tablosunun 30'u açıktı (18.313 satır) ve AuditEvent INSERT kabul ediliyordu. Sonra yalnız bu 2 tablo açık (paylaşımlı satırlarla 105) ve INSERT reddediliyor. Öteki amaçlar yine 30 tabloyu açıyor. `pnpm rls:verify` bunu her koşuda ölçer.
- Sınır: amaç GUC'si de USERSET ve mühür ona bağlı değil. Yani bu daraltma yanlış tabloya uzanan bir public-intake çağrısına karşı koruyor. `enter_system_scope('<başka amaç>')` çağırabilen koda karşı korumuyor; o (c)'nin konusu. Formun ihtiyaç duyduğu yeni bir tablo listeye bilerek eklenir. Eklenmezse form o tabloya yazarken RLS hatası alır, okurken 0 satır görür; testler bu ikincisini yakalamalı.

## 6. Ek: ters yön — uzman verisi yalnız işleyen amaçlara açık (FO-92, FO-21 O4, 19.10.2026)

- `system_scope_open` mühürlü dalda ikinci bir koşul daha uygular: `ExpertPreRegistration` ve `ExpertPreRegAttempt` yalnız `public-intake` (form), `platform-admin` (liste ve CSV), `platform-aggregate` (koltuk sayısı) ve `cross-tenant-job` (saklama temizliği, FO-50) amaçlarında açılır. `tenant-discovery` ve `subject-scoped` bu tablolarda 0 satır görür, yazamaz. `ExpertFounderCounter` kişisel veri taşımadığı için listede yok. Sahip dalı yine amaca bakmaz.
- Ölçüm (yerel, `fabrika_app` ile): önce `tenant-discovery` 5/5 `ExpertPreRegistration` satırı görüyordu. Sonra 0/5. `pnpm rls:verify` her koşuda iki kapalı amacı ölçer ve INSERT reddini dener.
- Sınır §5 ile aynı: amaç GUC'si USERSET. Bu koşul yanlış tabloya uzanan bir çağrıya karşıdır, listedeki bir amacı adlandırabilen koda karşı değil. Uzmanı görmesi gereken yeni bir amaç `system_scope_open` listesine bilerek eklenir.

## 7. Ek: `PublicLead` ve `ProvinceLeadRoute` amaca göre daraltıldı (NG-175, SEC NG-170 O-1/D-1, 14.11.2026)

- `PublicLead` (karne iletişim talebi; ad, e-posta, kuruluş, `routedTenantId`) artık RLS açık + FORCE, tek politika `system_scope`. Önceden politikasızdı ve kiracı oturumu 6/6 satırı okuyordu (NG-170 S4).
- `public-intake` listesine `PublicLead` eklendi (form `submitPublicLead`). Ters yönde `PublicLead` yalnız `public-intake`, `platform-admin` (`/admin/leads`, eşleşmeyen listesi) ve `cross-tenant-job` (aktarım, gece silme) amaçlarında açılır.
- `ProvinceLeadRoute` yalnız `platform-admin` (eşleme yönetimi) ve `cross-tenant-job` (aktarımın hedef seçimi) amaçlarında açılır; NG-170 D-1'de `tenant-discovery`, `subject-scoped` ve `platform-aggregate` 3/3 satır görüyordu.
- Ölçüm (yerel izole DB, `fabrika_app` ile): kiracı oturumu `PublicLead`'de önce 4/4, sonra 0/4. `pnpm rls:verify` amaca kapalı tabloları `PURPOSE_NARROWED` haritasıyla ölçer ve INSERT reddini dener; daraltma değişirse harita da değişmelidir. Sınır §5–§6 ile aynı.

## 8. Ek: `system_scope` tablolarında politika kümesi ve gerçek satırla okuma ölçümü (NG-183, NG-175 incelemesi Düşük-1/Düşük-2, 14.11.2026)

- **Sorun:** Politikalar permissive'dir ve OR'lanır. Bu yüzden `system_scope` tablosuna eklenen her ikinci politika, `system_scope`'un kapattığını açar; yalnız SELECT'i açan bir `USING (true)` da buna dahildir. Boş `PublicLead`'de yabancı `FOR SELECT USING (true)` politikası varken `pnpm rls:verify --require-db` exit 0 dönüyordu, çünkü okuma probu boş tabloda `0/0` ölçüyordu. `pnpm db:rls` de yalnız `system_scope`'u yeniden kurup yabancı politikayı bırakıyordu.
- **`system_scope` tablosu:** Kiracı politikası (`tenant_isolation`, `tenant_or_shared`) olmayan ve `system_scope` politikası taşıyan tablo. Bugün `ExpertPreRegistration`, `ExpertPreRegAttempt`, `ExpertFounderCounter`, `ProvinceLeadRoute` ve `PublicLead`. Liste `scripts/check-rls-live.ts` `SYSTEM_SCOPE_TABLES`'tır. Katalogda bu sınıfta olup listede olmayan tablo `rls:verify`'ı kırmızı yapar, çünkü o tablonun probu olmaz.
- **Politika kümesi (Düşük-1):** `rls:verify` her `system_scope` tablosunda `pg_policies` adlarının tam `{system_scope}` olmasını ister. Fazla ya da eksik politika exit 1 verir; mesajda tablo, politika adı ve komut yer alır. Bulgu davranış problarından sonra raporlanır; böylece aynı koşu sızan okumayı da gösterir.
- **Okuma probu (Düşük-2):** Ölçüm rolü, okumayı saymadan önce kendi transaction'ında tablo başına bir prob satırı yazar (`platform-admin` kapsamında). Ardından kapsamı kapatır (`app.system_scope = 'off'`) ve sayar; satır sayısı `0/N`, N ≥ 1 olmalıdır. Transaction sonda geri alınır. Satır COMMIT edilmediği için başka hiçbir oturum onu görmez (örneğin `PublicLead` aktarıcısı) ve çöken bir koşu da kalıntı bırakmaz. Kart "sahip bağlantısıyla ekle ve sil" diyordu. Bu yöntemi canlıda kalıcı satır riskini sıfırlamak için seçtim. Amaç ölçümündeki `amaca kapalı` satırları da aynı prob satırıyla `0/N` ölçülür.
- **`db:rls` temizliği:** `prisma/rls.sql`'in NG-183 bloğu `system_scope` tablolarındaki `system_scope` dışı her politikayı düşürür. Tablo kümesi `rls:verify` ile aynı katalog tanımından gelir. Kiracı tablolarına dokunulmaz.
- **Ölçüm (yerel izole DB, `fabrika_app` ile):**
  - Düzeltmeden önce, boş `PublicLead` + `FOR SELECT USING (true)` → exit 0.
  - Düzeltmeden sonra aynı durum → exit 1: politika kümesi ve `1/1` okuma sızıntısı.
  - `USING (true) WITH CHECK (true)` → exit 1.
  - `db:rls` sonrasında küme `{system_scope}`.
  - Temiz DB → exit 0.
  - Prob satırı kalıntısı 0.
  - Test: `tests/rls-verify-system-scope-policy-set.live.test.ts`.
- **Sınır:** Kiracı tablolarında yabancı politika bu kontrolün kapsamı dışında kalır; `tenant_isolation` ve `tenant_or_shared` tablolarının politika kümesi ayrıca doğrulanmaz.

## 9. Ek: `expert-directory` — doğrulanmış uzmanlar M8'e, yalnız okuma (NG-52, K-579696 = A, 14.11.2026)

- Yedinci amaç `expert-directory`. M8 eşleştirme sayfası doğrulanmış uzman ön kayıtlarını koltuk adayı olarak gösterir; havuz hiçbir kiracıya ait değil, bu yüzden kiracı bağlamı onu açamaz.
- `system_scope_open` bu amaçta **false** döner: genel `system_scope` politikası hiçbir tabloyu açmaz. Açan tek şey `ExpertPreRegistration` üzerindeki `expert_directory` politikasıdır: `FOR SELECT`, mühürlü kapsam + amaç = `expert-directory` + `status = 'verified'` + `"visibilityConsentAt" IS NOT NULL`. Yani bekleyen/devre dışı satır, yazma ve başka tablo kapalı. Ölçüm `tests/system-scope.live.test.ts` ("expert-directory reads verified expert rows and nothing else"): doğrulanmış 1, bekleyen 0, Membership 0, UPDATE 0 satır, INSERT RLS hatası.
- Kolon sınırı RLS'de değil kodda: `directory.ts` ad/e-posta/kurum/iletişim kolonlarını seçmez. Sınır §5 ile aynı: amaç GUC'si USERSET; bu politika yanlış amaca karşı değil, yanlış tablo ve yanlış satıra karşıdır.
