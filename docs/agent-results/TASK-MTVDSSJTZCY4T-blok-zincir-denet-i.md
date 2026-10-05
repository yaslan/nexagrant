# TASK-MTVDSSJTZCY4T — RLS kapısı artık migration'ları da okuyor (CHECK 4b)

**Platform beyanı:** doğrulama **mac** (darwin 25.6.0, Apple silicon) üzerinde
yapıldı. Dokunduğum yolların hiçbiri platforma bağlı değil — SQL metni,
`node:fs` ile dosya tarama ve `process.exit`. Tek platform bağımlılığı **ölçüm
aracında**: bu makinede `psql` ikilisi yok, temiz-veritabanı ölçümleri
`docker exec postgres-vector psql` ile yapıldı (`docs/agent-results/
TASK-MTVDSSJTZCY4T-evidence/probe-window.sh` bunu böyle yazıyor ve dosyada
söylüyor). Linux/Windows'ta aynı script yerel `psql` ile de koşar; **koşulmadı**
— o platformlarda kurulu bir Postgres bu makinede yok. Kapının kendisi
(`pnpm rls:check`) saf Node + dosya okuma olduğu için üç platformda da aynı
davranır.

## 1. Ne yapıldı

**(a) Ölçüm tekrarlandı ve genişletildi.** LEED-EN'in dosya düzeyindeki sayımı
(`CREATE TABLE` var, `CREATE POLICY` 0) **teyit edildi**: üç dosya. Sayımın
diğer yarısı **tashih**: "5 tablo A geleneğini izliyor" eksik — gerçek sayı
**9 tablo / 6 dosya**. `add-calendar-connections`, `add-consent-record`,
`add-m10-dual-approval-persistence` ve `add-plan-versioning` (PlanAssignment)
da politikayı migration'ında taşıyor. Yani A azınlık değil, **baskın gelenek**
(12 kiracı tablosunun 9'u). Genişletme, kartın istediği gibi `CREATE POLICY`
yanında `ENABLE` ve `FORCE` ifadelerini de sayıyor ve **tablo başına** ölçüyor
(dosya başına değil) — çünkü `add-m6-evaluator-lens.sql` üç tablo kurup tek
`CREATE POLICY` yazar (döngü içinde) ve dosya düzeyinde sayan bir tarayıcı
bunu yanlış okur. Her iki dosya biçimi (`add-x.sql` ve `add-x/migration.sql`)
taranıyor; üçüncü bulgu (`MeetingBrief`) tam da klasörlü biçimdeydi.

Yol boyunca üç **grep tuzağı** ölçüldü ve tarayıcıda kapatıldı:

| tuzak | nerede | etkisi |
|---|---|---|
| yorumdaki `CREATE TABLE` | `add-lifetime-licence.sql:11-12` | düz grep dosyayı 2 tablo kuruyor sanır |
| `FORCE··ROW LEVEL SECURITY` (çift boşluk) | `add-feedback.sql:73`, `add-lifetime-licence.sql:53` | `FORCE ROW` araması **yanlış negatif** verir |
| kolonların tek satırda yazılması | mutasyon sondası A | tarayıcının ilk hâli tabloyu hiç görmedi |

**(b) Karar: A geleneği doğrudur** (gerekçe §2).

**(c) CHECK 4b `pnpm rls:check`'e bağlandı** (`scripts/check-rls.ts`), tarama
mantığı paylaşılan `scripts/rls-migrations.ts`'te, değişmezleri
`tests/rls-coverage.test.ts`'te. Neden teste değil script'e: `rls:check` bu
depoda **dosya düzeyi statik kapı** olarak konumlanmış (kendi başlığı öyle
diyor) ve `pnpm gate` onu çağırıyor; `rls-coverage.test.ts` ise
**sınıflandırmanın dürüstlüğünü** koruyor (bir tablo `SYSTEM_WIDE`'a park
edilerek kapı susturulmasın — TASK-MTU6HUB8FUHMG B-1). Yeni soru dosya düzeyi
ve kırmızı/yeşil bir kapı sorusu → `rls:check`. Sınıflandırma ve mutasyon
sondası ise kalıcı test olarak `rls-coverage.test.ts`'e eklendi (8 yeni test).

**(d) Kapı bugün yeşil, muafiyet listesi YOK.** Üç migration A geleneğine
getirildi. Cırcırlı liste kurmadım: listeye yazılan tablo, kartın kapattığı
pencereyi kalıcı hâle getirir. i18n baseline'ı (TASK-MTVBJW8ATMD3G) ölçülemez
sayıda mevcut ihlali olan bir alan için doğru araçtı; burada ihlal sayısı **3**
ve üçü de tek satır SQL ile kapanıyor — baseline'a gerek yok. `findings.length
=== 0` bugünden itibaren sert kural.

**(e) İfade birebir.** Üç dosyaya eklenen politika `prisma/rls.sql:19-21` ile
sözcüğü sözcüğüne aynı. Kapı bunu da ölçüyor ve kanonik metni **rls.sql'den
okuyor** (`canonicalPolicyClauses()`), kopyalamıyor — kaynak değişirse kapı
kendini yeniden temellendirir, iki metin ayrışamaz.

**(f) Kural yazıldı:** `docs/DATA_MODEL.md` §16 (tek paragraf: kural + ölçüm +
kapının adı) ve `docs/RELEASE_CHECKLIST.md` §1'e üç satırlık atıf — çünkü
pencerenin kendisi orada tarif ediliyor.

## 2. Karar: neden A (politika migration'ın içinde)

Geri alması pahalı bir kapı kuralı olduğu için gerekçe ölçüme dayanıyor:

1. **Pencere varsayım değil, yayın yönteminin kendisi.**
   `docs/RELEASE_CHECKLIST.md` §1 düz `prisma/migrations/*.sql` dosyalarının
   kod yayınından önce **elle, tek tek** uygulanmasını ister (bugün 13 dosya);
   `pnpm db:rls` bu listede **ayrı bir adım değil, hiç yok**. Klasörlü olanlar
   `prisma migrate deploy` ile gelir, `db:rls` yine sonradan koşar.
2. **O pencerede tabloda RLS *açık bile değil*.** Ölçüldü (temiz veritabanı,
   üç migration uygulandı, `db:rls` koşulmadı): `Invoice`,
   `TenantBillingIdentity`, `MeetingBrief` → `relrowsecurity=f`, politika 0.
   `app.tenant_id='tenant-a'` kurulu, `NOBYPASSRLS` bir rol `MeetingBrief`'te
   **iki kiracının** satırını da okudu (§3'te çıktı). Bu, `Invoice` ve
   `TenantBillingIdentity` için VKN/TCKN, vergi dairesi ve fatura adresi
   demek.
3. **Tekrarın maliyeti yok.** `prisma/rls.sql` tek doğruluk kaynağı olmayı
   sürdürüyor ve idempotent (`DROP POLICY IF EXISTS` + `CREATE`); migration'daki
   kopya da idempotent. Üç dosya ikinci kez uygulandı, hepsi temiz geçti.
4. **B geleneğinin yorumu doğruyu söylüyor ama yanlış dosya hakkında.** "RLS
   eklendi — `prisma/rls.sql`'e" cümlesi doğrudur; yalnız o dosyanın
   uygulanması ayrı ve elle bir adım. Yorum, okuyanı korunmuş sanmaya
   götürüyordu.

## 3. Kanıt (kopyalanmış çıktı)

### `pnpm rls:check` — yeşil (HEAD `b4b0944` + bu değişiklik)

```
Found 45 tenant-scoped models requiring RLS policies:
AddOn, AiUsageLog, ApiKey, ... Workspace

✅ SUCCESS: All 45 tenant-scoped models have RLS policies registered.
   (Declared, not measured — `pnpm rls:verify` asks the database.)

CHECK 4b — 12 tenant-scoped tables are created by migrations.
✅ SUCCESS: every one of them carries ENABLE + FORCE + tenant_isolation in its own migration.
```

### Değişiklikten ÖNCEKİ tarama (aynı tarayıcı, `git show HEAD:` içerikleri değil, ilk koşum)

```
tables: 12 findings: 3
  ❌ prisma/migrations/add-invoice-write-path.sql:46 creates tenant table "TenantBillingIdentity" and no policy in the same file
  ❌ prisma/migrations/add-invoice.sql:26 creates tenant table "Invoice" and no policy in the same file
  ❌ prisma/migrations/add-m9-meeting-schedule/migration.sql:2 creates tenant table "MeetingBrief" and no policy in the same file
```

### ZORUNLU mutasyon sondası A — kapı gerçekten kırmızıya dönüyor

`prisma/migrations/zz-mutation-probe.sql` üç varyantla kuruldu, ölçüldü,
**silindi** (dosya ağaçta yok; kalıcı hâli `tests/rls-coverage.test.ts`
içindeki "mutation probe" testi — geçici dizinde aynı senaryoyu kurar).

```
===== A1: creates a tenant table, no policy (columns on one line)
exit code: 1
CHECK 4b — 13 tenant-scoped tables are created by migrations.
❌ ERROR: a migration creates a tenant-scoped table it does not protect:
  prisma/migrations/zz-mutation-probe.sql:2 — creates tenant table "ProbeSecret" and no policy in the same file

===== A2: policy written, row level security never enabled
exit code: 1
  prisma/migrations/zz-mutation-probe.sql:2 — "ProbeSecret" has a policy but no ENABLE ROW LEVEL SECURITY (a policy on a table without RLS enabled is never applied)
  prisma/migrations/zz-mutation-probe.sql:2 — "ProbeSecret" is not FORCEd, so the table owner bypasses its own policy

===== A3: enabled but not FORCEd, and the wording drifts from rls.sql
exit code: 1
  prisma/migrations/zz-mutation-probe.sql:2 — "ProbeSecret" is not FORCEd, so the table owner bypasses its own policy
  prisma/migrations/zz-mutation-probe.sql:2 — "ProbeSecret" policy wording differs from prisma/rls.sql — expected USING ("tenantId" = current_setting('app.tenant_id', true)) and WITH CHECK ("tenantId" = current_setting('app.tenant_id', true))

===== probe file deleted
exit code: 0
CHECK 4b — 12 tenant-scoped tables are created by migrations.
✅ SUCCESS: every one of them carries ENABLE + FORCE + tenant_isolation in its own migration.
```

**A1'in ikinci koşumu bir kusur buldu:** ilk tarayıcı sürümü kolonları tek
satırda yazan sondayı **hiç görmedi** (13 değil 12 tablo saydı, yeşil kaldı).
`tenantId` kolonu artık satır başına değil virgülle sınırlı aranıyor. Sonda
olmasa bu delik kapıya yeşil olarak girecekti.

### Mutasyon sondası B — mevcut A geleneği ihlal SAYILMIYOR

`Feedback` (`add-feedback.sql:72-77`) tarama tablolarında **var** ve
bulgularda **yok**; kalıcı test:

```
✓ 4b — every migration protects the tenant table it creates > probe B — a table whose policy is in its own migration is no violation
```

`npx vitest run tests/rls-coverage.test.ts` → `Tests 26 passed (26)`
(öncesi 18; +8 test CHECK 4b için).

### Pencere ölçümü — temiz veritabanı, `db:rls` KOŞULMADAN

`bash docs/agent-results/TASK-MTVDSSJTZCY4T-evidence/probe-window.sh`

**ÖNCE** (dosyaların HEAD içeriği, `git show HEAD:… | psql`):

```
         table         | rls_enabled | forced | policies
-----------------------+-------------+--------+----------
 Invoice               | f           | f      |        0
 MeetingBrief          | f           | f      |        0
 TenantBillingIdentity | f           | f      |        0

 reading_as |  tenant  | rows_visible |    ids
------------+----------+--------------+-----------
 app_probe  | tenant-a |            2 | mb-a,mb-b      ← tenant-a, tenant-b'nin brief'ini okudu
```

**SONRA** (çalışma ağacı, yine `db:rls` koşulmadan):

```
         table         | rls_enabled | forced |     policies
-----------------------+-------------+--------+------------------
 Invoice               | t           | t      | tenant_isolation
 MeetingBrief          | t           | t      | tenant_isolation
 TenantBillingIdentity | t           | t      | tenant_isolation

 reading_as |  tenant  | rows_visible | ids
------------+----------+--------------+------
 app_probe  | tenant-a |            1 | mb-a
```

İdempotentlik — üçü ikinci kez uygulandı: `re-ran OK` ×3 (yalnız
`NOTICE: … already exists, skipping`).

### `pnpm rls:verify` — canlı ölçüm yeşil

```
Kiracıya özel model: 45 · RLS açık tablo: 52 · tenant_isolation politikası: 45
Ölçüm rolü: fabrika_app (rolsuper=false, rolbypassrls=false)
   ✓ okuma (negatif): app.tenant_id yokken 19 dolu tablonun hepsi 0 satır döndü
   ✓ okuma (pozitif): AiUsageLog kendi kiracısı bağlamında 9 satır döndü
   ✓ yazma (negatif/pozitif/çapraz): reddedildi / kabul edildi / reddedildi
✅ 45 kiracıya özel tabloda politika yerinde ve izolasyon fabrika_app rolüyle GERÇEKTEN ölçüldü
```

Not — kart "44 tablo" diyor, ölçüm **45**: ağaca bu arada `Consent` girdi
(komşu kartın henüz commit'lenmemiş `add-consent-record.sql` dosyası).
Regresyon değil, artış.

### Diğer kapılar

```
$ pnpm lint      → exit 0 (çıktı yok)
$ pnpm test      → Test Files 149 passed | 2 skipped (151) · Tests 1795 passed | 8 skipped (1803) · exit 0
$ pnpm typecheck → exit 2 — TEK dosyada: tests/billing-identity-action.test.ts (4 hata)
```

`tests/billing-identity-action.test.ts` **benim değil ve takip edilmiyor**
(`git status` → `??`): başka bir ajanın ağaçta duran, commit'lenmemiş dosyası.
Benim dokunduğum dosyalarda tip hatası yok (`pnpm typecheck` çıktısında hata
üreten dosya listesi tek satır: o dosya). Ona dokunmadım. Bu yüzden
`pnpm gate` **bugün bütün olarak yeşil değil** ve nedeni bu kart değil.

`pnpm test:e2e` **koşulmadı**: bu kart çalışma zamanı kodu değiştirmiyor
(SQL yorumu + politika satırları, bir tarama script'i, testler, docs). Gerçek
etkileşimli doğrulama burada e2e değil, yukarıdaki iki sondadır — kapı
kırmızıya döndürüldü ve temiz veritabanında çapraz kiracı okuması **önce
gerçekleşti, sonra engellendi**.

## 4. Değişen dosyalar

| dosya | ne |
|---|---|
| `scripts/rls-migrations.ts` | **yeni** — tarayıcı: iki dosya biçimi, yorum ayıklama, tablo başına ENABLE/FORCE/policy, kanonik ifadeyi rls.sql'den okuma |
| `scripts/check-rls.ts` | CHECK 4b eklendi; kırmızıda tablo adı + satır + düzeltme reçetesi yazıp `exit 1` |
| `tests/rls-coverage.test.ts` | +8 test (sonda B, iki dosya biçimi, yorum tuzağı, kanonik ifade, kalıcı mutasyon sondası) |
| `prisma/migrations/add-invoice.sql` | `Invoice` için ENABLE+FORCE+policy (COMMIT öncesi) + yorum düzeltmesi |
| `prisma/migrations/add-invoice-write-path.sql` | `TenantBillingIdentity` için aynısı |
| `prisma/migrations/add-m9-meeting-schedule/migration.sql` | `MeetingBrief` için aynısı + checksum notu |
| `docs/DATA_MODEL.md` | §16 — kural, ölçüm, kapının adı |
| `docs/RELEASE_CHECKLIST.md` | §1'e üç satır: bu dosyalar politikasını kendi içinde taşır |
| `docs/agent-results/TASK-MTVDSSJTZCY4T-evidence/` | `probe-window.sh` (pencere ölçümü), `probe-prisma-migrations.mts` (checksum envanteri) |

## 5. Riskler

1. **`add-m9-meeting-schedule/migration.sql` uygulanmış bir migration'dı ve
   dosyayı değiştirdim.** `_prisma_migrations`'ta kayıtlı sha256 artık eski
   (`4fefa865e40d…` = dosyanın HEAD hâli; ölçülüp doğrulandı). Ölçülen sonuç:
   Prisma 7.10'da `migrate status` ve `migrate deploy` checksum'ı
   **karşılaştırmıyor** (değiştirilmiş dosyayla ikisi de sessiz kaldı);
   `migrate dev` ise bu depoda zaten koşamıyor — `add-m10` `FollowupDoc`'a
   atıfta bulunuyor ve onu hiçbir migration kurmuyor (temiz veritabanında
   **dokunulmamış** ağaçla da P3006 → P3018). Yani bu düzenlemenin ek maliyeti
   yok; gelecekte checksum doğrulayan bir sürüm gelirse çözüm
   `prisma migrate resolve`. Eklenen blok idempotent olduğu için tekrar
   uygulama zararsız.
2. **Zaten uygulanmış veritabanlarında tabloların politikası `db:rls`'ten
   geliyor.** Dev veritabanında bugün politikalar yerinde (`rls:verify` yeşil),
   bu yüzden aksiyon gerekmiyor. `db:rls` hiç koşmamış bir ortam varsa üç dosya
   yeniden uygulanabilir (idempotent) ya da `pnpm db:rls` koşulur.
3. **Tarayıcı statiktir.** `CREATE TABLE`'ı dinamik SQL'le (`EXECUTE format`)
   kuran bir migration gelirse görünmez. Bugün öyle bir dosya yok; gelirse
   kapı sessiz kalır — bilinen sınır, `scripts/rls-migrations.ts` başlığında
   yazıyor değil, **burada** yazıyor.
4. **Paylaşılan ağaç.** `docs/DATA_MODEL.md` şu an başka bir ajan tarafından da
   düzenlenmiş durumda (`git status` → ` M`). Commit'te yalnız kendi hunk'ımı
   stage ettim ve `git diff --cached` ile doğruladım (§6).

## 6. Açık sorular

1. **`add-m10` neden `FollowupDoc`'a atıfta bulunuyor ve onu kimse
   kurmuyor?** Klasörlü migration geçmişi bugün boş bir veritabanına
   uygulanamıyor (P3018). Bu kartın kapsamı değil ama `prisma migrate dev`
   bu depoda çalışmıyor demek; `docs/ROADMAP.md`'deki `db push` çakışması
   notuyla aynı kökten. Ayrı kart ister — **bu satır düzeldiğinin kanıtı
   değildir**.
2. `tests/billing-identity-action.test.ts` (takip edilmeyen, tip hatalı) kimin?
   `pnpm gate`'i bugün o dosya kırıyor.

## 7. Sonraki adım

- Yeni kiracı tablosu ekleyen kart: `docs/DATA_MODEL.md` §16 + `/add-table`
  akışı; kapı zaten söylüyor.
- `pnpm gate`'in bütün olarak yeşile dönmesi için (1) yukarıdaki takip
  edilmeyen test dosyasının sahibi tip hatalarını kapatmalı.
