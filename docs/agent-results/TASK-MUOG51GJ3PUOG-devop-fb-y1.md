Hüküm: GEÇTİ — Y-1 kapandı (Prisma CLI artık yanlış CA'yı ve uyuşmayan adı reddediyor, doğru CA ile bağlanıyor); Ö-A uygulandı; Ö-C (41→42) de düzeltildi. Push/merge yok.
Tip: bug (güvenlik, R-S7) · Platform: mac (darwin, Docker pgvector/pgvector:pg16) — ayrıntı §4

# TASK-MUOG51GJ3PUOG #y1 — devop-fb: crw2-fb Y-1 (Prisma CLI verify-full) + Ö-A

Kaynak inceleme: `docs/agent-results/TASK-MUOG51GJ3PUOG-crw2-fb-golive.md` §2.2, §4 Y-1, Ö-A, Ö-C.
Dal: `devop-fb/supabase-golive`, 80e89ae3 üstüne 3 commit (worktree `/Users/macbook/alan/FONBRIDGE-wt-devopfb-golive`):

```
ba2f16e5 docs: RELEASE_CHECKLIST §2.1/§3.1 ve certs/README — Prisma CLI TLS istisnası, 42 dosya (Y-1, Ö-C)
59fd7a57 fix(rls:verify): API rolü kontrolünde eklenti üyelerini dışla (Ö-A)
7fb5dedd fix(db): Prisma CLI'ya verify-full+sslrootcert'i strict TLS olarak çevir (Y-1)
```

## 1. Ne yapıldı

- **Y-1, önerilen yol (1):** Yeni dosya `prisma/cli-url.ts` → `toPrismaCliUrl(url, cwd)`. `prisma.config.ts` artık `datasource.url: toPrismaCliUrl(process.env.DATABASE_URL)` veriyor.
  - URL'de `sslmode=verify-full` (ya da `verify-ca`) varsa CLI'ya `sslmode=require&sslaccept=strict&sslcert=<CA'nın mutlak yolu>` gidiyor ve `sslrootcert` çıkarılıyor. Göreli yol `cwd`'ye göre mutlak yola çevriliyor.
  - CA dosyası yoksa config yüklenirken `DATABASE_URL sslrootcert not found: <yol>` hatası veriyor ve bağlanmıyor.
  - `verify-*` ile birlikte `sslcert` ya da `sslaccept` da verilmişse belirsiz sayılıp reddediliyor. Diğer URL'ler hiç değişmeden geçiyor.
  - Dönüşüm yalnız Prisma CLI'nın config nesnesinde yapılıyor. `process.env` değişmiyor, bu yüzden node-pg'ye (`src/lib/db.ts`, worker, tsx betikleri, `db:seed`) orijinal URL gidiyor. `prisma.config.ts` ya da `cli-url` hiçbir yerden import edilmiyor (grep sonucu boş).
  - Operatör tek URL kullanmaya devam ediyor.
- **Birim testi:** `tests/prisma-cli-url.test.ts`, 8 test. 7 mutantın 7'si öldü.
- **Belge:**
  - `RELEASE_CHECKLIST.md` §2.1 DB TLS satırına Prisma CLI istisnası eklendi: dönüşümü config yapar, dönüşmüş biçim node-pg'ye verilmez, `--from-url`/`--to-url` dönüşümü atlar.
  - §3.1 adım 1'e salt-okuma ön kontrol komutu ve beklenen çıktılar eklendi.
  - `certs/README.md`'ye Prisma paragrafı eklendi.
- **Ö-A uygulandı:** `scripts/check-rls-live.ts` API rolü sorgusuna migration'daki `NOT EXISTS (… pg_depend … deptype = 'e')` filtresi eklendi.
- **Ö-C (ek, aynı bölüm):** §3.1'deki "41 dosya / `41 files applied`" ifadeleri 42'ye çevrildi, `--list | tail -6` örneği güncellendi.
- Ö-B, Ö-D, Ö-E bu kartın kapsamı dışında, dokunulmadı (§5).

## 2. Kanıt (kopyalanmış çıktı)

Ortam: yerel `pgvector/pgvector:pg16` konteyneri `devopfb-y1-tlspg`, 127.0.0.1:55331, `ssl=on`, `log_connections=on`. Kendi test CA'larım: **A** (sunucu sertifikasını imzalayan, SAN yalnız `DNS:localhost`) ve **B** (ilgisiz). Ad uyuşmazlığı için aynı sunucuya `127.0.0.1` ile bağlanıldı. :5433'e dokunulmadı, canlıya bağlanılmadı.

### 2.1 Önceki davranış yeniden üretildi (dönüşümsüz config, yanlış CA)
```
== ÖNCEKİ DAVRANIŞ (dönüşümsüz config, yanlış CA)
P4001 The introspected database was empty:          ← yanlış CA ile BAĞLANDI
sunucu: connection authorized: user=postgres database=postgres SSL enabled (protocol=TLSv1.2, …)
```

### 2.2 Yeni config ile `prisma db pull --print` (salt-okuma)
```
== DOĞRU CA, localhost                 P4001 The introspected database was empty   ← bağlandı
== YANLIŞ CA, localhost                Error: P1011 Error opening a TLS connection: The certificate was not trusted.
== DOĞRU CA, ad uyuşmaz 127.0.0.1       Error: P1011 … The certificate was not trusted.
== göreli doğru CA (../../../../private/tmp/…/caA.crt)   P4001 (bağlandı)
== göreli repo CA certs/supabase-prod-ca-2021.crt (bu sunucu için yanlış)   Error: P1011
== verify-ca, yanlış CA                Error: P1011
== sslrootcert=system, özel CA         Error: P1011 … not trusted
== olmayan dosya                       Failed to load config file … Error: DATABASE_URL sslrootcert not found: …/yok.crt
```

### 2.3 `prisma db push` ve `migrate diff` yolları
```
== db push YANLIŞ CA        Error: P1011: Error opening a TLS connection: The certificate was not trusted.
== db push ad uyuşmaz       Error: P1011: Error opening a TLS connection: The certificate was not trusted.
== db push DOĞRU CA         🚀  Your database is now in sync with your Prisma schema. Done in 291ms
   public tablo sayısı: 75
== migrate diff --from-config-datasource caB (push sonrası)   exit=1  Error: P1011
== migrate diff --from-config-datasource caA (push sonrası)   exit=0
== migrate diff boş DB, DOĞRU CA --script                      CREATE TABLE sayısı: 75
```
RELEASE_CHECKLIST §3.1 adım 1'e eklenen ön kontrol komutu belgede yazıldığı gibi koşuldu:
```
caA exit=0
caB exit=1 P1011
```

### 2.4 Tek URL, uçtan uca: zincirin tamamı verify-full URL'iyle
`DATABASE_URL=postgresql://postgres:***@localhost:55331/y1chain?sslmode=verify-full&sslrootcert=<caA>`. Aynı URL Prisma CLI, psql (apply-migrations) ve node-pg (db:rls-role, db:rls, db:seed, rls:verify) tarafından kullanıldı:
```
🚀  Your database is now in sync with your Prisma schema.
✅ fabrika_app connects as fabrika_app, app.tenant_id unset by default.
apply-migrations: 42 files applied as postgres
apply-migrations: 42 files applied as postgres
✅ prisma/rls.sql applied. Policies in public: 28 → 112
seed exit 0
```
Dönüşmüş URL'in neden node-pg'ye gitmemesi gerektiği de ölçüldü:
```
node-pg ORİJİNAL URL BAĞLANDI ssl= true
node-pg DÖNÜŞMÜŞ URL FAIL UNABLE_TO_VERIFY_LEAF_SIGNATURE
dönüşmüş: postgresql://postgres:***@localhost:55331/postgres?sslmode=require&sslaccept=strict&sslcert=%2Fprivate%2Ftmp%2F…%2FcaA.crt
```

### 2.5 Birim testi ve mutantlar
```
tests/prisma-cli-url.test.ts   Tests  8 passed (8)
MUTANT sslaccept=strict kaldırıldı                      →  4 failed | 4 passed  KILLED
MUTANT sslrootcert silinmiyor                           →  4 failed | 4 passed  KILLED
MUTANT verify-ca dalı kaldırıldı                        →  1 failed | 7 passed  KILLED
MUTANT path.resolve kaldırıldı (göreli yol)             →  1 failed | 7 passed  KILLED
MUTANT existsSync kontrolü kapatıldı                    →  1 failed | 7 passed  KILLED
MUTANT sslmode=require yazılmıyor                       →  4 failed | 4 passed  KILLED
MUTANT sslcert/sslaccept belirsizlik reddi kapatıldı    →  1 failed | 7 passed  KILLED
```
(İlk mutant turunda geri yükleme yanlış kurulmuştu: dosya izlenmediği için `git checkout` çalışmadı ve mutantlar üst üste bindi. Dosya elle düzeltildi, yedekten geri yüklemeli ikinci tur koşuldu ve son `cmp` ile `RESTORED` görüldü. Yukarıdaki satırlar ikinci turdan.)

### 2.6 Ö-A: eklenti üyeleri (aynı y1chain DB'si; `anon`/`authenticated` rolleri var, `vector` şema sahibine ait)
```
== ESKİ rls:verify (filtresiz, HEAD:scripts/check-rls-live.ts)
exit=1
   Supabase API rolleri şema sahibinin fonksiyonlarını çağırabiliyor (/rest/v1/rpc): array_to_halfvec(double precision[],integer,boolean) → anon, …
   satır sayısı: 236
== YENİ rls:verify (eklenti üyeleri dışlı)
exit=0
✅ 47 kiracıya özel tabloda politika yerinde ve izolasyon fabrika_app rolüyle GERÇEKTEN ölçüldü …
-- negatif kontrol: GRANT EXECUTE ON FUNCTION public.redeem_agency_invite(text) TO anon
anon GRANT sonrası exit=1
   Supabase API rolleri şema sahibinin fonksiyonlarını çağırabiliyor (/rest/v1/rpc): redeem_agency_invite(text) → anon
REVOKE sonrası exit=0
```

### 2.7 Tam takım (temiz PG16, CI sırası)
Konteyner `devopfb-y1-cipg` 127.0.0.1:55332, CI ile aynı kullanıcı, `CI=true`, `AUTH_SECRET=<CI fixture>`:
```
prisma db push → db:rls-role ✅ → apply-migrations "42 files applied as fabrika" ×2 → db:rls 28 → 112 → db:seed ok
→ rls:verify --require-db ✅ 47 tablo → prep=0
Test Files  5 failed | 311 passed | 2 skipped (318)
     Tests  33 failed | 4197 passed | 54 skipped (4284)
  23 src/lib/auth-callbacks.test.ts · 1 tests/teardown-where-guard.test.ts   ← 82d8b63c eksikliği (dev'de c1156bb5), bu dalla ilgisiz
   8 tests/settings-profile-update.test.ts · 1 tests/server-action-rbac-guard.test.ts   ← bilinen Y-4: 9 kırmızı
   1 tests/e2e-profile-save.spec.ts [toplama hatası]                                       ← bilinen Y-4
 ✓ tests/prisma-cli-url.test.ts (8 tests)
 ✓ tests/migration-owner-chain.live.test.ts (17 tests)
check-live-skips exit=0
tsc --noEmit exit=0 · eslint (değişen 4 dosya) exit=0
DATABASE_URL olmadan prisma generate (Dockerfile:26 benzetimi): ✔ Generated … exit=0
```
crw2-fb'nin aynı daldaki ölçümüyle karşılaştırma: 33 kırmızının dağılımı aynı. Geçen test sayısı 4189'dan 4197'ye çıktı; fark yeni 8 birim testi. Yeni kırmızı yok.

## 3. Değişen dosyalar
- `prisma/cli-url.ts` (yeni): dönüşüm fonksiyonu.
- `prisma.config.ts`: `toPrismaCliUrl` çağrısı.
- `tests/prisma-cli-url.test.ts` (yeni): 8 birim testi.
- `scripts/check-rls-live.ts`: Ö-A filtresi ve yorum.
- `docs/RELEASE_CHECKLIST.md`: §2.1 TLS satırı, §3.1 adım 1, 41→42 (adım 3, deadlock notu, `--list` örneği).
- `certs/README.md`: Prisma CLI istisnası.
- Bu rapor (bir kopyası dalda da var).

## 4. Riskler
- **`--from-url` / `--to-url` / `--url`:** URL'i doğrudan Prisma'ya vermek config'i atlar ve eski doğrulamasız davranışı geri getirir. Bunu belgeyle yasakladım ama kodla engelleyemiyorum. Repoda böyle bir çağrı yok (grep).
- **Supabase'de ölçülmedi:** Dönüşüm canlıya karşı koşulmadı; görev yerel. Pooler sertifikası `*.pooler.supabase.com` joker adıyla geliyor. Prisma'nın (rustls/native-tls) joker ad eşleşmesini kabul ettiğini canlıda görmedim.
  - Bu adres için ilk `db push`'tan önce §3.1 adım 1'deki `migrate diff … --exit-code` ön kontrolü koşulmalı. Sonuç `0` ya da `2` olmalı; `P1011` gelirse durulmalı. Ön kontrol salt-okumadır.
  - Yerelde ad denetimi tam ad (`localhost`) ve uyuşmazlık (`127.0.0.1`) ile ölçüldü.
- **`verify-ca` daha sıkı hale geliyor:** Prisma'da yalnız CA doğrulayan bir mod yok, bu yüzden `verify-ca` da ad denetimine çevriliyor. Repoda `verify-ca` kullanılmıyor.
- **`sslrootcert=system`:** strict modda sertifika sistem deposuna değil, Prisma'nın kendi kök listesine karşı denetleniyor. Özel CA'nın reddedildiğini ölçtüm, ama genel kök listesinin içeriğini ölçmedim. Supabase için repodaki CA kullanılıyor, `system` kullanılmıyor.
- **Platform:**
  - Doğrulama yalnız macOS'ta (darwin) yapıldı, PG Docker'da (Linux) koştu.
  - Kod `path.resolve` ve `existsSync` kullanıyor. Linux imajında (`/app/certs/…`) yol mutlak olduğu için davranış aynı.
  - Windows'ta `C:\…` mutlak yolu ve URL içindeki ters bölü kodlaması koşulmadı, çünkü bu ortamda Windows yok. Projenin dağıtım hedefi Linux imajı.
- **Docker imajı derlenmedi.** `COPY . .` (Dockerfile:19/40) `prisma/cli-url.ts`'yi imaja taşıyor. `prisma generate` URL olmadan koşuyor (yukarıda ölçüldü).

## 5. Açık sorular
- Ö-B (`rls.sql` ayna bloğunu tek başına test etme), Ö-D (down dosyası başlık notu) ve Ö-E (`rls-app-role.sql` adım 5 için live test) yapılmadı. Bu kart Y-1 ve Ö-A'yı istiyordu. İstenirse aynı dala küçük bir commit olarak eklenebilir; karar leed-fb'nin.
- Patronun açık işleri (Data API'nin kapatılması, plan ve PITR doğrulaması) yerinde duruyor. Bu iş onları değiştirmiyor.

## 6. Sonraki adım
- crw2-fb `7fb5dedd` ve `59fd7a57`'yi yeniden incelemeli (Y-1 kapanışı). Ardından leed-fb dalı dev'e alır. Dal dev ile merge edilince 24 kırmızı kalkar, yalnız Y-4'ün 9 kırmızısı kalır (crw2-fb §2.4).
- Canlı açılışta, `db push`'tan önce §3.1 adım 1'deki ön kontrol koşulur ve `*.pooler.supabase.com` joker adının Prisma'da `0`/`2` döndüğü görülür.
- Yerel test konteynerleri (`devopfb-y1-tlspg`, `devopfb-y1-cipg`) kaldırıldı. Test CA'ları scratchpad'deydi.
