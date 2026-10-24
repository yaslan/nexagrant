---
sözleşme: 3
görev: TASK-MVE06JYFQ41OL
kod: TASK-MVE06JYFQ41OL
ajan: crw2-fb
motor: claude
tip: karar
okur: ekip
hüküm: Bitti: PR #124 bloke edilmez; 4 mutantın 4ü kırmızı, tek açık nokta boş ExpertPreRegAttempt tablosunda kapalı amaçlar için yazma probu eksikliği (B1, bloke etmeyen test boşluğu).
platform: mac (darwin): izole pgvector/pg16 konteyneri (127.0.0.1:55492, paylaşımlı fabrika'nın pg_dump kopyası, iş bitince silindi). Değişiklik saf SQL ve TS, platforma bağlı kod yolu yok; Windows/Linux'ta da davranış aynı. Windows/Linux koşulmadı, çünkü bu makinede yalnız mac var.
sürüm: 1
tarih: 2026-10-19T21:20:12.037Z
---

# FO-92 · PR #124 incelemesi — uzman verisi ters yön kilidi

## Ne yapıldı
- Kart `get_task` ile baştan sona okundu. be-gnd raporu ve PR #124'ün diff'i (5 dosya, `origin/dev...efbfd745`) satır satır incelendi. PR dalı dev'in güncel ucunda (`merge-base --is-ancestor` → UP2DATE).
- **Kod taraması:** dalda uzman tablolarına dokunan bütün çağrıların amaçları çıkarıldı. `register.ts` ve `verify.ts` → `public-intake`, `admin.ts` → `platform-admin`, `seats.ts` → `platform-aggregate`, #92 `retention.ts` → `cross-tenant-job`. `tenant-discovery` ya da `subject-scoped` ile uzman tablosuna dokunan kod yok, yani kilit hiçbir çalışan yolu kırmıyor. `subject-scoped` çağrıları (GDPR export, silme talebi, silme süpürmesi) userId anahtarlı; anonim uzman kaydı User değil.
- **İzole DB:** ayrı bir `pgvector/pgvector:pg16` konteyneri açıldı (`crw2fb-fo92-pg`, 127.0.0.1:55492). Roller `pg_dumpall --roles-only`, veri `pg_dump fabrika` ile kopyalandı. `fabrika_app`'e yalnız bu kümede yerel bir parola verildi. `.env` okunmadı, URL'ler process.env ile verildi. Paylaşımlı `fabrika` DB'sine `db:rls`/DDL uygulanmadı. Konteyner ve worktree iş bitince silindi.
- PR hali, 4 mutant, boş tabloda M3 ve #122 ile birleşik hal koşuldu. Kod değiştirilmedi, approve verilmedi.

## Kanıt (ham çıktı)
**PR hali**, izole DB, `pnpm db:rls` → `pnpm rls:verify --require-db` (ölçüm rolü fabrika_app, rolbypassrls=false):
```
✅ prisma/rls.sql applied. Policies in public: 117 → 117
exit=0
✓ tenant-discovery: ExpertPreRegAttempt=0/9, ExpertPreRegistration=0/5 — uzman verisi kapalı
✓ tenant-discovery: ExpertPreRegistration INSERT reddedildi
✓ subject-scoped: ExpertPreRegAttempt=0/9, ExpertPreRegistration=0/5 — uzman verisi kapalı
✓ platform-admin / platform-aggregate / cross-tenant-job: 33 tablo kapsamla açıldı, her system_scope tablosunda tüm satırlar
vitest tests/system-scope.live.test.ts → Test Files 1 passed, Tests 22 passed (22)
```
**Bağımsız önce/sonra ölçümü** (fabrika_app, her amaçta Attempt INSERT + sayım, ROLLBACK):
```
### function = m1-dev (önce)          ### function = pr (sonra)
tenant-discovery   | 5 | 1 | accepted    tenant-discovery   | 0 | 0 | RLS-denied
subject-scoped     | 5 | 2 | accepted    subject-scoped     | 0 | 0 | RLS-denied
platform-admin     | 5 | 3 | accepted    platform-admin     | 5 | 1 | accepted
platform-aggregate | 5 | 4 | accepted    platform-aggregate | 5 | 2 | accepted
cross-tenant-job   | 5 | 5 | accepted    cross-tenant-job   | 5 | 3 | accepted
public-intake      | 5 | 6 | accepted    public-intake      | 5 | 4 | accepted
(sütunlar: amaç | EPR görülen | kendi Attempt satırları | Attempt INSERT)
```
**Mutantlar** (yalnız fonksiyon gövdesi değişti, her biri `diff` ile gösterildi, sonra PR gövdesi geri yüklendi):
```
### m1-dev  rls:verify exit=1  live exit=1
 • tenant-discovery: uzman kişisel verisini görüyor (kapalı olmalı): ExpertPreRegAttempt=9>0, ExpertPreRegistration=5>0
 • tenant-discovery: ExpertPreRegistration INSERT KABUL EDİLDİ   (subject-scoped aynı)
 × tenant-discovery and subject-scoped read 0, …   × tenant-discovery cannot write an expert row   Tests 2 failed | 20 passed
### m2-no-ctj (cross-tenant-job listeden çıktı)  rls:verify exit=1  live exit=1
 • cross-tenant-job: daraldı, tüm satırları görmüyor: ExpertPreRegAttempt=0, ExpertPreRegistration=0
### m3-no-attempt (Attempt ters listeden çıktı)  rls:verify exit=1  live exit=0
 • tenant-discovery: uzman kişisel verisini görüyor (kapalı olmalı): ExpertPreRegAttempt=9>0
 Tests 22 passed (22)            ← live test Attempt'i hiç ölçmüyor
### m4-td-open (tenant-discovery listeye eklendi)  rls:verify exit=1  live exit=1
RESTORED
```
**M3, boş Attempt tablosunda** (`DELETE FROM "ExpertPreRegAttempt"` yalnız izole DB'de; temiz bir DB'de ya da CI'da durum budur):
```
m3b rls:verify exit=0
 ✓ tenant-discovery: ExpertPreRegAttempt=0/0, ExpertPreRegistration=0/5 — uzman verisi kapalı
--- aynı mutantta fabrika_app, enter_system_scope('tenant-discovery'):
INSERT 0 1
attempt_rows_seen_by_tenant_discovery = 1
```
**#124 + #122 birleşik hal** (yerel `merge --no-commit`, hunk "ikisini de tut" ile çözüldü, `tsc` temiz, sonra `merge --abort`):
```
merged #124+#122 rls:verify exit=0
✓ public-intake: ExpertPreRegAttempt kapsam dışında INSERT reddedildi … INSERT kabul edildi (pozitif kontrol)
✓ tenant-discovery: ExpertPreRegAttempt=0/0, ExpertPreRegistration=0/5 — uzman verisi kapalı
merged + M3 (empty Attempt) exit=0        ← B1 birleşik halde de sürüyor
```
**Çakışma ölçümü** (`git merge-tree`, dosya başına `<<<<<<<` sayısı):
```
fo98 (#122) on dev:        rls.sql 0  check-rls-live.ts 0
fo98 (#122) on dev+#124:   rls.sql 0  check-rls-live.ts 1
fo50 (#92)  on dev:        rls.sql 1  check-rls-live.ts 1   (+ DATA_MODEL.md, schema.prisma, rls-models.ts)
fo50 (#92)  on dev+#124:   rls.sql 1  check-rls-live.ts 1
```

## Bulgular (önem sırasıyla)
**Bloke eden: yok.**

**B1 — Test boşluğu, bloke etmiyor:** `scripts/check-rls-live.ts` `probePurposeTables` içindeki kapalı amaç kontrolü ve `tests/system-scope.live.test.ts`.
- *Senaryo:* biri `system_scope_open`'daki ters listeden `ExpertPreRegAttempt`'i düşürür (M3). Bu durumda tenant-discovery ve subject-scoped Attempt'e yazar ve okur. `ExpertPreRegAttempt` boşsa, ki temiz bir DB'de ya da CI'da öyledir (Attempt kayıtları seed edilmiyor), `rls:verify` "0/0 — uzman verisi kapalı" yazıp exit 0 veriyor. Live test yalnız `ExpertPreRegistration`'ı sayıp INSERT ettiği için 22/22 geçiyor. Ölçüm yukarıda (m3b).
- *Kök neden:* kapalı amaçlarda okuma kontrolü `inside > outside` sayımına dayanıyor (0 = 0), INSERT probu da yalnız `EXPERT_TABLE`'a yapılıyor. Bu, FO-98'in (#122) public-intake için kapattığı boşluğun ters yöndeki karşılığı.
- *Önerilen düzeltme:* #122 dev'e girdikten sonra kapalı amaç döngüsünde `EXPERT_DATA_TABLES`'ın her tablosu için #122'nin `PUBLIC_INTAKE_PROBES` haritası kullanılmalı (`tryInsert` → `'rls'` beklenir). Böylece aynı INSERT SQL'inin dört kopyası da bire iner. Live teste de `ExpertPreRegAttempt` fixture'ı ve sayımı eklenmeli. Takip kartı ya da #124'e küçük bir ek commit yeter.

**Ö1 — Merge sırası ve #122 çakışması, öneri:** iki PR da dev ile tek başına temiz. Birlikte olunca `scripts/check-rls-live.ts`'te **tek ve bitişik bir hunk** çıkıyor: ikisi de `PUBLIC_INTAKE_TABLES`'ın altına sabit ekliyor. Çözüm "ikisini de tut", ancak çakışma bloğunun önündeki ortak `/**` yüzünden FO-92 sabitlerinden sonra kalan yetim ` */` satırı silinmeli (ben de öyle yaptım). Birleşik hal izole DB'de exit 0. Önerim önce #122, sonra #124'ü rebase etmek ve rebase sırasında B1'i `PUBLIC_INTAKE_PROBES` ile kapatmak. Ters sıra da çalışır.

**Ö2 — #92 ile ilişki, bilgi:** #92 dev'in gerisinde ve dev ile zaten 5 dosyada çakışıyor (rls.sql'de 1 hunk, ExpertFounderCounter bloğu ile ExpertPreRegAttempt bloğu yan yana). #124 buna yeni bir hunk eklemiyor (rls.sql 1 → 1, check-rls-live 1 → 1). Anlam olarak da uyumlu: #92'nin purge'ü `cross-tenant-job` ile EPR siliyor, bu amaç açık. `ExpertFounderCounter` ters listede yok, sayaç zaten kişisel veri taşımıyor.

**Ö3 — cross-tenant-job'un açık kalması, risk değerlendirmesi:** K-570170 = **A**, patron 20.10 00:05'te cevapladı; bu yüzden yeniden tartışmıyorum, kalan riski yazıyorum.
- dev'de 6 `cross-tenant-job` çağrısı var: stripe-event-retention, invitation retention, alerts-daily, m4-weekly, public-lead purge, notifications retention. **Hiçbiri uzman tablolarına dokunmuyor**, yani bugün sızıntı yok. Kilit yanlışlıkla eklenen bir sorguya karşıdır; bu amaçta bu koruma yok. Altı amacın en genel olanı bu ve çağrı sayısı en hızlı onda artıyor.
- #92 henüz merge edilmedi. Yani #124 bugün dev'de bu amacı **önceden** açıyor; ExpertPreRegAttempt için cross-tenant-job'un bir kullanıcısı hiç yok. Bunun pratik bir zararı yok, karar da bunu kabul ediyor.
- Telafi edici bir kontrol zaten var: `rls:bypass-check` CHECK D, her yeni `withSystemScope(` çağrısını gerekçesiyle baseline'a yazdırıyor. Yeni bir cross-tenant-job çağrısı insan onayı olmadan giremiyor.
- İleride B'ye geçilirse güvenlik ağı sağlam: #92'nin `tests/expert-prereg-retention.live.test.ts` dosyası purge'ü `fabrika_app` (NOBYPASSRLS) ile koşuyor. Amaç kapanır da purge 0 satır silerse bunun sessiz kalmayıp kırmızı olacağını bekliyorum. Bunu B senaryosunda koşmadım; dosyanın rolünü okudum.

**Ö4 — Sadeleştirme, öneri, zevk düzeyinde:** amaç listesi üç yerde elle tutuluyor (rls.sql, `EXPERT_DATA_PURPOSES`, test `EXPECTED`). Test `EXPECTED`'ı `SYSTEM_SCOPE_PURPOSES` üzerinden `toEqual` ile kurduğu için yeni bir amaç eklenince test kırmızı olur ve bu kayma yakalanır. `check-rls-live`'daki sabit 5 amaçlı döngü eskiden kalma bir durum. Kapsam dışı olduğu için yalnız not ediyorum.

**Doğruladığım ve sorun bulmadığım noktalar:** sahip dalı ve `tenant_isolation` diff'te değişmemiş. `IS NOT TRUE` ile eksik bir tablo (to_regclass → NULL) `IN (x, NULL)`'ı NULL yaptığında doğru biçimde "listede yok" sayılıyor. Politika `(SELECT system_scope_open(...))` initplan'ı ile çağrıldığı için ek `to_regclass` çağrılarının sorgu başına maliyeti ihmal edilebilir. INSERT probu `tryInsert` savepoint'i içinde koşuyor. Live test fixture'ı kendi satırını yazıp aynı işlemde ROLLBACK ediyor, global sayım yok.

## Değişen dosyalar
- Yalnız bu rapor: `docs/agent-results/TASK-MVE06JYFQ41OL-crw2-fb.md`. PR koduna dokunulmadı, approve verilmedi.
- Not: görev metnindeki KANIT köşeli parantezi `/Users/macbook/alan/docs/agent-results/TASK-MVE06JYFQ41OL-be-gnd.md` yolunu gösteriyor. Bu dosya yok; yazarın raporu FONBRIDGE altında. Başkasının raporunun üzerine yazmamak için yalnız kendi dosyama yazdım.

## Riskler
- B1 kapanana kadar ters listedeki Attempt kaydının düşmesi temiz DB'de ve CI'da yakalanmaz. Paylaşımlı yerel DB'de Attempt satırları (9) olduğu sürece yakalanır.
- Paylaşımlı DB notu (be-gnd raporu): başka bir ağaç dev'in `rls.sql`'ini uygularsa #124'ün live testleri kırmızı olur. Merge sonrası bu fark kalmaz. Ben paylaşımlı DB'ye hiçbir şey uygulamadım.

## Açık sorular
Yok. cross-tenant-job sorusu K-570170 = A ile kapandı.

## Sonraki adım
1. #122 → dev, ardından #124 rebase. Hunk'ta "ikisini de tut" ve yetim ` */` satırını sil; B1'i `PUBLIC_INTAKE_PROBES` ile kapat.
2. Merge sonrası canlıda `pnpm db:rls` koşulmalı (be-gnd notu).
3. #92 dev ile ayrıca rebase edilmeli; #124'ten bağımsız 5 dosyalık çakışma var.
