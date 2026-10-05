# TASK-MUOG51GJ3PUOG#golive — FB Supabase canlıya hazırlık (devop-fb)

**Hüküm: GEÇTİ (R-S7 ve R-S2 kapandı; crw2-fb Ö-1..Ö-4 kapandı).** Kod `devop-fb/supabase-golive` dalında, 3 commit: `510dcdb1`, `de7367bd`, `693bfbe0`. Push yok, dev'e merge yok. Canlıya yalnız yeni migration uygulandı. Uygulama bağlanmadan önce patronun iki işi var: Data API'yi kapatmak (§4) ve yedek planına bakmak (§5).
**Tip:** runtime/altyapı (TLS + DB yetkisi) + test · **Platform:** mac (darwin 27, Node 26.5, Docker `pgvector/pgvector:pg16`, psql 16 istemcisi). Canlı ortam Supabase PG 17.11 (eu-west-1, session pooler). Windows ve Linux'ta koşulmadı (§8).
**Tarih:** 01.10.2026 · patron onayı 01.10.2026

## 1. Ne yapıldı

| # | İş | Sonuç |
|---|---|---|
| 1 | **R-S7 SSL** | Yol olarak **URL'de `sslmode=verify-full&sslrootcert=<CA yolu>`** seçildi. Supabase Root 2021 CA `certs/supabase-prod-ca-2021.crt` dosyasında (kamuya açık sertifika; parmak izi `certs/README.md`'de). `Dockerfile` runner aşaması `certs/`'i kopyalıyor, worker aşaması zaten `COPY . .` ile alıyordu. RELEASE_CHECKLIST §2.1'e satır eklendi. Doğrulama kapalı değil: `uselibpqcompat` ve `rejectUnauthorized:false` yok. |
| 1b | `rls:verify --require-db` | DB'ye ulaşılamazsa artık **exit 1** veriyor. Bayraksız sürüm eskisi gibi "ATLANDI" deyip exit 0 veriyor. Bu, R-S7'nin "TLS kırıkken kapı yeşil" açığıydı. Checklist §3.1 adım 5 bu bayrakla güncellendi. |
| 2 | **R-S2 Data API** | Yeni migration `prisma/migrations/revoke-api-role-function-execute.sql` + `.down.sql` + `apply-order.txt` (42. dosya). Aynı blok `prisma/rls.sql`'in sonunda da var (system_scope_* fonksiyonlarını o dosya oluşturuyor). `rls-app-role.sql`, sonradan kurulan bir `fabrika_app` için yetkiyi yeniden veriyor. **Canlıda `fabrika_migrate` ile uygulandı** ve iki kez koşuldu. |
| 2b | public USAGE geri alma | **Uygulanmadı, gerekçe §4'te.** `fabrika_migrate` bunu yapamıyor (ölçüldü). Data API'yi kapatmak daha kapsamlı bir kontrol. |
| 3 | crw2-fb Ö-1..Ö-4 | Dördü de kapandı (§3). |
| 4 | Yedek (§4.1) | AgentSpace Supabase entegrasyonu yalnız başka bir projeyi görüyor (ap-northeast-1, FonBridge değil). Plan ve PITR doğrulanamadı. Panelden bakılacak yer §5'te. |

## 2. Kanıt

Ekler `docs/agent-results/TASK-MUOG51GJ3PUOG-devop-fb-ekler/H-*` dosyalarında. Bağlantı dizesi ve şifre hiçbir eke basılmadı; sır taraması temiz.

### 2.1 R-S7: ölçüm (canlı pooler, `fabrika_app`, node-pg 8.23 / pg-connection-string 2.14)

| Varyant | Sonuç |
|---|---|
| A `sslmode=require`, CA yok | `FAIL SELF_SIGNED_CERT_IN_CHAIN` |
| B `require` + `NODE_EXTRA_CA_CERTS=certs/…` | `OK {"u":"fabrika_app"}` (jobs: `OK {"u":"fabrika_jobs"}`) |
| **C `verify-full&sslrootcert=certs/…`** | **`OK {"u":"fabrika_app"}`** |
| D `verify-full` + **yanlış CA** (negatif kontrol) | `FAIL SELF_SIGNED_CERT_IN_CHAIN` → doğrulama gerçekten açık |
| E psql `verify-full` | `fabrika_app\|f` |
| F `verify-full`, CA yok | `FAIL SELF_SIGNED_CERT_IN_CHAIN` |

(`pg_stat_ssl.ssl=f` beklenen bir değer: TLS istemci ile pooler arasında, pooler ile backend arası yerel bağlantı.)

**Neden URL, `NODE_EXTRA_CA_CERTS` değil:** Repodaki her node-pg yolu (`src/lib/db.ts` Pool, graphile-worker `run`/`makeWorkerUtils`, `check-rls-live`, `apply-rls`, `setup-rls-role`) bağlantıyı yalnız `connectionString` ile kuruyor. Kodda `ssl` seçeneği yok (grep ile doğrulandı). pg-connection-string `sslrootcert` dosyasını okuyup `ssl.ca` olarak koyuyor. Aynı URL psql ve pg_dump'ta da çalışıyor. `NODE_EXTRA_CA_CERTS` süreç açılırken okunur, `.env` ile verilemez ve Supabase özel kökünü sürecin **tüm** giden TLS bağlantılarına (Anthropic, OpenAI, SMTP) güvenilir kök olarak ekler. URL yolu bu güveni yalnız DB bağlantısıyla sınırlıyor. B varyantı yedek seçenek olarak kanıtlı.

**Uçtan uca (H-L3, H-L4), `NODE_EXTRA_CA_CERTS` yokken:**
```
rls:verify --require-db, DATABASE_URL=fabrika_app …verify-full&sslrootcert…
  Ölçüm rolü: fabrika_app (rolsuper=false, rolbypassrls=false) — kaynak: DATABASE_URL
  ✓ yazma (negatif) ✓ yazma (pozitif, geri alındı) ✓ yazma (çapraz)
  ✅ 47 kiracıya özel tabloda … fabrika_app rolüyle GERÇEKTEN ölçüldü   → exit 0
aynı kapı, CA'sız sslmode=require URL'i                                → exit 1
uygulama yolu (src/lib/db.ts → PrismaPg → countLifetimeLicences()):
  {"current_user":"fabrika_app","lifetime_licence_count":0}
```
`0` sonucu önemli: kod hata olursa `null` döner. Yani hem TLS hem revoke sonrası `fabrika_app`'in EXECUTE yetkisi gerçek uygulama yolunda çalışıyor. Next sunucusunu ayrı bir worktree'de başlatamadım (Turbopack, kök dışına işaret eden symlink'li node_modules'ü reddetti). Bu yüzden aynı modül zinciri tsx ile çağrıldı. Geçici betik silindi, süreç durdu, worktree kaldırıldı.

### 2.2 R-S2: canlı önce / sonra (`fabrika_migrate`, H-L1, H-L2)

```
ÖNCE  lifetime_licence_count()    | proacl (NULL) | anon t | authd t | app t | jobs t
      system_scope_sealed()       |               | t      | t       | t     | t
      system_scope_open(regclass) |               | t      | t       | t     | t
      sahip fonksiyonu 8, API'den çağrılabilir 3
uygula: psql -1 -v ON_ERROR_STOP=1 -c "SET app.system_scope='on'" -f …revoke-api-role-function-execute.sql
        (HEAD 693bfbe0, dosya md5 c59cb774…) → SET, DO, exit 0 ; ikinci koşu → exit 0
SONRA {fabrika_migrate=X/fabrika_migrate,fabrika_app=X/fabrika_migrate} | anon f | authd f | app t | jobs f   (×3)
      sahip fonksiyonu 8, API'den çağrılabilir 0
```
`fabrika_jobs` EXECUTE yetkisini kaybetti. Bu bilinçli: rolün hiçbir tabloda yetkisi yok (faz 3 F6: 0/75), dolayısıyla politika fonksiyonlarına da ihtiyacı yok.

**Uygulama Data API kullanmıyor:** `src scripts package.json next.config.ts .env.example Dockerfile docker-compose.yml` içinde `@supabase/`, `supabase-js`, `/rest/v1`, `/graphql/v1`, `NEXT_PUBLIC_SUPABASE`, `SUPABASE_(ANON|SERVICE|KEY)` araması 2 eşleşme verdi. İkisi de bu işte `check-rls-live.ts`'e eklediğim yorum satırları. Uygulama DB'ye yalnız node-pg ile bağlanıyor.

### 2.3 Yerel PG16 (yalıtılmış konteyner 127.0.0.1:55291; :5433'e dokunulmadı; iş bitince silindi)

```
prisma db push → db:rls-role → apply-migrations #1: "42 files applied as fabrika"
→ db:rls: 28 → 112 → apply-migrations #2: "42 files applied as fabrika" → db:seed exit 0
→ rls:verify --require-db: ✅ 47 tablo … fabrika_app → exit 0
ACL: 3 fonksiyon {fabrika=X/fabrika,fabrika_app=X/fabrika}, fabrika_app t
--require-db + ulaşılamaz DB → exit 1 ; bayraksız → "ATLANDI" exit 0 (eski davranış)
migration-owner-chain.live: 17/17 geçti
typecheck exit 0 ; eslint (değişen ts) exit 0
tam vitest: 4189 geçti, 33 kaldı, 54 atlandı
```
Kalan 33 test bu değişiklikle ilgisiz. 23'ü `auth-callbacks`, 1'i `teardown-where-guard` (be-fb'nin `auth-jwt-membership-app-role.live.test.ts:159` dosyası). İkisi de be-fb'nin dev'e alınmamış `82d8b63c` düzeltmesini bekliyor. Kalan 8+1+1 (`settings-profile-update`, `server-action-rbac-guard` G6, `e2e-profile-save`) eski ve biliniyor. Taban `268500d2` worktree'sinde aynı 3 dosya **32 hata** verdi; fark yalnız profil e2e'nin toplama hatası (H-G5).

### 2.4 Mutasyon kanıtı (H-G4): 5/5 öldürüldü

| Mutant | Öldüren test |
|---|---|
| MA (=crw2 M1) note bilinen-kod dalında geri yükleme silindi | Ö-1 testi |
| MB (=crw2 M5) note `'on', false` | Ö-1 testi |
| MC migration + rls.sql, anon/authenticated revoke'u kaldırıldı | Ö-2 testi |
| MD migration + rls.sql, PUBLIC revoke'u kaldırıldı | Ö-2 testi |
| ME clause grep'i eski desene döndü | Ö-4 testi (tırnaklı varyant) |

## 3. crw2-fb bulguları

- **Ö-1 KAPANDI.** Yeni test `note_agency_invite_rejection` fonksiyonunu iptal edilmiş bir kodla çağırıyor, yani bilinen-kod dalını koşuyor. Çağıranın değeri unset/off/on olmak üzere 3 durumda deneniyor, her çağrı **COMMIT** ile bitiyor. İşlem içinde değer aynen geri dönüyor, COMMIT sonrasında oturumda değer kalmıyor. Testin gerçekten o dalı koştuğu `AuditEvent` sayısıyla kanıtlanıyor (3 çağrı → +3 satır, `reason=revoked`). M1 ve M5 artık ölüyor.
- **Ö-2 KAPANDI (DB tarafında).** Migration'ın 2. adımı çalıştıran rolün public'teki **tüm** fonksiyonlarından (eklenti üyeleri hariç) anon/authenticated için EXECUTE yetkisini geri alıyor. Böylece zincir `postgres` ile koşulsa bile Supabase'in varsayılan ACL'i bir delik bırakmıyor. Test bunu Supabase tarzı varsayılan yetkiyle (`ALTER DEFAULT PRIVILEGES FOR ROLE <owner> … GRANT EXECUTE ON FUNCTIONS TO anon, authenticated`) kurulmuş, kopya bir DB'de ölçüyor. Önce kontrol: varsayılan gerçekten uygulanıyor (`t`). Ardından zincir, rls.sql ve ikinci zincir koşuluyor. Sonuç: çağrılabilir fonksiyon `[]`, 3 fonksiyonda PUBLIC EXECUTE yetkisi `[]`, `fabrika_app` 4 fonksiyonda `t` (enter_system_scope dahil). Kapı: `rls:verify`, Supabase'de bu rollerden biri sahip fonksiyonunu çağırabiliyorsa exit 1 veriyor.
- **Ö-3 KAPANDI.** `ADR-0009:15` altına "Değişti (TASK-MUOG51GJ3PUOG)" notu eklendi.
- **Ö-4 KAPANDI.** Ön kontrol önce `--` yorumunu siliyor, sonra büyük/küçük harf ayırmadan, tırnaklı ya da tırnaksız adı arıyor. 4 varyantlı testin hepsi reddediliyor. Gerçek 42 dosyada yanlış pozitif yok.

## 4. Data API: public USAGE kararı ve patron adımları

**USAGE geri alma uygulanmadı.** Gerekçeler:
1. **Yapılamıyor.** USAGE'ı `pg_database_owner` (= `postgres`) vermiş. `fabrika_migrate` ile denendi (geri alınan işlemde): `WARNING: no privileges could be revoked for "public"`, `anon_usage_hala = t` (H-L5).
2. **Yetmiyor.** ACL'de PUBLIC'in de `=U` hakkı var. anon'dan geri almak için PUBLIC'ten de geri almak gerekir. Bu da Supabase'in kendi rollerini (auth/storage/realtime) bilinmeyen biçimde etkileyebilir.
3. **Bugün açıkta bir şey kalmadı.** anon/authenticated için tablo yetkisi 0/75, sahip fonksiyonlarında EXECUTE 0/8. Data API'nin bu iki rolle göreceği bir nesne yok.

**Kalan gerçek risk ve asıl kontrol:** Supabase `postgres` için public'te varsayılan ACL tanımlı: `anon`/`authenticated` için tablolarda `arwdDxtm`, fonksiyonlarda `X` (H-live-acl-before). **Supabase panelindeki SQL Editor `postgres` olarak çalışır.** Orada açılan her tablo ya da fonksiyon Data API'den anonim olarak okunur ve yazılır. Bunu kapatan kontrol, Data API'nin kendisini kapatmaktır:

**PATRON — Data API'yi kapat (uygulama kullanmıyor, kanıt §2.2):**
1. supabase.com/dashboard → FonBridge projesi (eu-west-1).
2. Sol menü **Project Settings → Data API** (bazı panel sürümlerinde **Integrations → Data API**).
3. **"Enable Data API"** anahtarını kapat → Save. Bu seçenek yoksa: **Exposed schemas** listesinden `public`'i (ve `graphql_public`'i) çıkar → Save.
4. Kontrol (terminalde, anahtar basmadan): `curl -s -o /dev/null -w '%{http_code}\n' https://<ref>.supabase.co/rest/v1/` → 404 ya da 401/406 bekleniyor, 200 gelmemeli. İstersen bana haber ver, ben de bakayım.
5. Geri alma: aynı anahtarı aç.

İsteğe bağlı ek sertleştirme (yalnız `postgres` yapabilir, uygulamadım): `ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES, FUNCTIONS, SEQUENCES FROM anon, authenticated;` (her nesne türü için ayrı ifade; geri alma `GRANT` ile).

Not: `public.rls_auto_enable()` Supabase'in kendi olay tetikleyici fonksiyonu (sahibi `postgres`). anon onu da EXECUTE edebiliyor, ama tetikleyici fonksiyonu doğrudan RPC ile çağrılamaz. Ben dokunmadım, sahibi ben değilim.

## 5. Yedekleme (§4.1): patronun bakacağı yer

AgentSpace Supabase entegrasyonu bağlı (izin beyanı `projects:read`), ama listede yalnız **başka bir proje** var (`ap-northeast-1`, "…'s Project"). FonBridge projesi (eu-west-1) bu anahtarın organizasyonunda değil. Plan ve PITR bu yüzden doğrulanamadı. FonBridge'in bulunduğu organizasyonun anahtarı Ayarlar → Entegrasyonlar → Supabase'e bağlanırsa planı ve yedek durumunu ben okurum.
Panelden bakılacak yerler:
1. **Organization → Billing**: plan (Free / Pro / Team). Free planda otomatik ve indirilebilir yedek **yok** (doğrulanmalı). Pilot verisi için en az Pro gerekir.
2. **Project → Database → Backups**: "Scheduled backups" sekmesinde son yedeğin tarihi; "Point in Time" sekmesi açık mı (PITR ücretli eklenti, Pro üstü).
3. Plan yükseltilene kadar bizim tarafımızda yedek: RELEASE_CHECKLIST §4.1'deki `pg_dump`. Hafıza notu: `fabrika_app` ile dump boş çıkar (FORCE RLS), sahip rolüyle ve `SET app.system_scope` oturumuyla alınmalı. Bağlantı URL'i §2.1'deki verify-full biçiminde olmalı.

## 6. Değişen dosyalar

| Commit | Dosyalar |
|---|---|
| `510dcdb1` build(db-tls) | `certs/supabase-prod-ca-2021.crt` (yeni), `certs/README.md` (yeni), `Dockerfile` (runner'a `COPY certs`), `docs/RELEASE_CHECKLIST.md` (§2.1 satırı, §3.1 adım 5) |
| `de7367bd` fix(db-acl) | `prisma/migrations/revoke-api-role-function-execute.sql` + `.down.sql` (yeni), `apply-order.txt`, `prisma/rls.sql` (ayna blok), `prisma/rls-app-role.sql` (adım 5), `scripts/check-rls-live.ts` (`--require-db`, API rolü kontrolü, ölçüm rolüne system_scope_* EXECUTE) |
| `693bfbe0` test(migrations) | `tests/migration-owner-chain.live.test.ts` (Ö-1, Ö-2, Ö-4), `scripts/apply-migrations.sh` (Ö-4), `docs/adr/ADR-0009-signed-system-scope.md` (Ö-3) |

Canlı DB'de 3 fonksiyonun ACL'i değişti (yukarıda). Git dışında değişiklik yok; `.env.supabase.local` aynı kaldı.

**Paylaşımlı ağaç olayı:** be-fb'nin rapor commit'i `3ab94d37` (yalnız `docs/agent-results/TASK-MUPYHVSBW47GD-be-fb-auth*`) benim `git switch -c`'imden 14 saniye sonra, ortak ağaçta **benim dalıma** düştü. Geçmişi yeniden yazmadım, commit dalda duruyor. leed-fb merge sırasında bu commit'i dev'e birlikte alabilir ya da ayrı cherry-pick yapabilir. be-fb'nin bunu bilmesi gerekiyor.

## 7. Riskler

- **R-S7 dağıtım:** CA yolu URL'de mutlak olmalı. İmajda `/app/certs/…`, imaj dışında repo kopyasının mutlak yolu. Yol yanlışsa bağlantı açık hatayla düşer (`ENOENT`). Sessizce doğrulamasız bağlanma olmaz. CA'nın son geçerlilik tarihi **2031-04-26**. Supabase kökü değiştirirse `certs/` güncellenmeli.
- **Ayna blok:** Aynı DO bloğu migration'da ve `rls.sql`'de var. Biri değişip öteki değişmezse Ö-2 testi ve `rls:verify` kırmızıya döner (MC ve MD mutantlarıyla ölçüldü).
- **Yeni roller:** PUBLIC artık 3 fonksiyonu çağıramıyor. Kiracı tablolarını sorgulayacak yeni bir rol (ör. ileride bir raporlama rolü) `system_scope_open` ve `system_scope_sealed` için açık GRANT ister, yoksa `permission denied for function` alır. Bu sessiz değil, yüksek sesle düşer. `fabrika_app`, ölçüm rolü ve sahip kapsanıyor.
- **CI'de Ö-2 testi** cluster düzeyinde `anon`/`authenticated` rollerini (yoksa) kurup testin sonunda siliyor. Rol adları sabit, aynı cluster'da koşan paralel bir suite bu rolleri görebilir. Kalıcı bir etkisi yok.
- R-S1 (`ensure_rls`), R-S3 (CI'de PG17 yok), R-S4 (session pooler) faz 3'teki gibi açık. R-S5 yedek açık (§5).

## 8. Platform beyanı

Tüm koşular macOS (darwin 27) üzerinde yapıldı: Node 26.5, Docker `pgvector/pgvector:pg16`, Homebrew psql. Canlı hedef Supabase (Linux sunucu). Windows ve Linux'ta koşulmadı, çünkü bu makinede o ortamlar yok. Koddan çıkarımlar:
- `sslrootcert` dosya yolu: Linux imajında `/app/certs/…`. Windows'ta node-pg `fs.readFileSync` mutlak yolu (`C:\…` ya da URL-kodlu) okur; psql de aynı parametreyi destekler.
- `apply-migrations.sh` ve Ö-4 grep'i bash + sed + grep ister (Windows'ta WSL ya da Git Bash). `sed 's/--.*$//'` BSD ve GNU'da aynı çalışır.
- SQL ve `check-rls-live.ts` platformdan bağımsız.

## 9. Açık sorular

1. Patron: Data API kapatıldı mı (§4)? Kapatıldıktan sonra §4 adım 4'teki kontrolü ben yaparım.
2. Patron: Supabase planı ve PITR (§5). Ya da FonBridge organizasyonunun anahtarını entegrasyona bağla.
3. leed-fb: `3ab94d37` (be-fb raporu) bu dalla birlikte mi alınacak?

## 10. Sonraki adım

- leed-fb: `devop-fb/supabase-golive` incelemesi ve merge. crw-fb/crw2-fb'ye `de7367bd` (yetki değişikliği) için inceleme önerilir.
- Üretim env'i: `DATABASE_URL=<fabrika_app pooler URL>?sslmode=verify-full&sslrootcert=/app/certs/supabase-prod-ca-2021.crt`, `JOBS_DATABASE_URL` da aynı sonekle (`fabrika_jobs`). Açılıştan önce `pnpm rls:verify --require-db` → exit 0 olmalı.
- **Geri alma:** canlı ACL → `DATABASE_URL=<fabrika_migrate verify-full URL> scripts/apply-migrations.sh --down revoke-api-role-function-execute.down.sql` (3 fonksiyonu PUBLIC'e geri açar). Kod → 3 commit'i `git revert`. TLS → URL sonekini kaldırmak tek başına bağlantıyı **düşürür**; geri dönüş için B yolu (`NODE_EXTRA_CA_CERTS`) var.
- **İzleme:** her DDL'den sonra Supabase Security Advisor'a bakılmalı ve `rls:verify --require-db` koşulmalı. SQL Editor'de `postgres` ile nesne açılırsa `rls:verify` bunu göremez (yalnız sahip fonksiyonlarına bakar); bu açığı Data API'yi kapatmak kapatır.

Hafıza: §11'e bakınız.

## 11. Hafıza

`fonbridge-supabase-tls-ve-data-api-yetkisi` kaydı yazıldı: node-pg TLS yolu seçimi, PUBLIC→anon kalıtımı, USAGE'ın pg_database_owner'da olması, entegrasyonun yanlış projeyi görmesi, paylaşımlı ağaçta dala düşen commit.
