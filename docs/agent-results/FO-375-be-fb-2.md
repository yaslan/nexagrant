# FO-375 — MySQL/MariaDB Faz 0–1 (2. tur)

**Kart:** TASK-MVZTBLOCAWR8X · **Ajan:** be-fb · **Tip:** feature (şema + doğrulama) · **Dal:** `be-fb/mysql-faz1` (worktree `FONBRIDGE-worktrees/be-fb-fo375`)
**Platform kapsamı:** mac (darwin 27.2). Windows/Linux koşulmadı.
**Bağımlılık:** lider kararı (03.11) — A yolu, 18 dizi alanı `Json`, yan tablo yok.

## Hüküm

**KISMİ — Faz 1 şema ve kapı tamam; Faz 1'in kapanması için 3 iş açık** (aşağıda "Açık sorular"): 28→31 `insensitive` arama kolonunun collation kararı, 2 ham-SQL noktasının Json'a uyarlanması, `@prisma/adapter-mariadb` bağımlılığı. Uygulama kodu (Prisma istemcisinin MariaDB'ye bağlanması) bu turda yazılmadı; şema ve DDL katmanı hazır.

## Ne yapıldı

1. **Ayrı şema, PG şeması değişmedi.** `prisma/schema.prisma` diff'i boş. `scripts/mysql-schema/generate.mjs` üç artefakt üretir: `prisma/mysql/schema.prisma`, `prisma/mysql/init.sql`, `prisma/mysql/init.down.sql`. `--check` modu üçünü de doğrular; eşleşmezse exit 1.
2. **`migrate diff` ham çıktısı** `prisma migrate diff --from-empty --to-schema prisma/mysql/schema.prisma --script` → 91 `CREATE TABLE`. Banner temizlenip `utf8mb4_unicode_ci` → `utf8mb4_bin`'e çevrildi.
3. **Boş MariaDB 11.8.9'da uygulandı** (`fo375-mariadb`, DB `fabrika_faz1`, `apply.sh --reset`). İki kez koşuldu, ikisi de exit 0.
4. **Down/up döngüsü:** `apply.sh --down` → 0 tablo; `apply.sh` → 91 tablo.
5. **Kapı mutantı (yeniden yapıldı, öncekisi geçersizdi):** mutasyonun gerçekten uygulandığı `mutate.mjs` ile (eşleşme yoksa hata verir) doğrulandı.
6. **Davranış ölçümleri** (aşağıda ham çıktı).
7. **Birim testleri:** `tests/mysql-schema.test.mjs` 8/8 geçti; eslint exit 0.

### Kapı mutantı — ham çıktı

```
== mutant A: prisma/mysql/init.sql, Tenant.id VARCHAR(191) -> VARCHAR(190)
mutated prisma/mysql/init.sql
stale or hand-edited: prisma/mysql/init.sql. Run: node scripts/mysql-schema/generate.mjs
mutant A exit=1 (expect 1)
== mutant B: prisma/mysql/schema.prisma, Membership.workspaceIds Json -> String[]
mysql schema build failed: prisma migrate diff failed:
Error: P1012
error: Field "workspaceIds" in model "Membership" can't be a list. The current connector does not support lists of primitive types.
mutant B exit=1 (expect 1)
== restored
mysql artifacts up to date ({"listFields":18,"longText":15,"vectorFields":3})
restored exit=0 (expect 0)
```

Önceki turda iki mutant de exit 0 vermişti; sebep `sed` deseninin eşleşmemesiydi (mutasyon uygulanmamıştı). Bu turda eşleşme doğrulanıyor.

### Down/up döngüsü — ham çıktı

```
after down:  tables_in_db = 0
ok: --down on fabrika_faz1 (container fo375-mariadb)
after re-up: tables_in_db = 91
```

### Davranış ölçümleri (MariaDB 11.8.9, strict mod, ROLLBACK'li geçici tablolar)

| Durum | Sonuç |
|---|---|
| Liste kolonu `'[]'` | Kabul; `JSON_TYPE` = `ARRAY`, `JSON_LENGTH` = 0 |
| Liste kolonu `NULL` (NOT NULL kolon) | **Reddedildi**: `ERROR 1048 Column 'j' cannot be null` |
| Liste kolonu değer verilmeden (kolon eksik, DEFAULT yok) | **Reddedildi**: `ERROR 1364 Field 'j' doesn't have a default value` |
| Liste kolonu `'not json'` | **Reddedildi**: `ERROR 4025 CONSTRAINT j failed` (`JSON_VALID` check) |
| `'["istanbul","ankara"]'` | Kabul; `JSON_LENGTH` = 2 |
| `VARCHAR(191)`'e 192 karakter | **Reddedildi**: `ERROR 1406 Data too long` (sessiz kesme yok) |
| `LONGTEXT`'e 20000 karakter | Kabul; 20000 karakter saklandı |
| `utf8mb4_bin`, `LIKE '%istanbul%'` (veri `Istanbul`) | **0** (büyük/küçük harf duyarlı) |
| `utf8mb4_unicode_ci`, aynı sorgu | **1** |

**Önemli çıkarım — `@default([])`:** DDL'de `DEFAULT` yazılmıyor (`COLUMN_DEFAULT` NULL). Varsayılan `[]` yalnızca Prisma istemcisi üzerinden uygulanır. Ham `INSERT` (Prisma dışı) bu kolonlarda `NULL`/eksik değerle hata verir. Bu bilinçli bir sonuçtur: Json alanlarına yazan her yol değeri açıkça vermelidir.

**Önemli çıkarım — `insensitive` aramalar:** `utf8mb4_bin` varsayılanıyla, Prisma'nın `mode: 'insensitive'` aramaları MariaDB'de büyük/küçük harfe duyarlı kalır. Bu bir regresyondur; aşağıda açık soru.

## Değişen dosyalar

- `scripts/mysql-schema/generate.mjs` (yeni)
- `scripts/mysql-schema/apply.sh` (yeni, çalıştırılabilir)
- `tests/mysql-schema.test.mjs` (yeni, 8 test)
- `prisma/mysql/schema.prisma`, `prisma/mysql/init.sql`, `prisma/mysql/init.down.sql` (üretilmiş, commit'li)
- `docs/agent-results/FO-375-be-fb-2.md` (bu rapor)

`prisma/schema.prisma`, `.env`, ana checkout, Hostinger, Supabase: dokunulmadı.

## Model sınıflandırması (DoD) — 91 model

Yöntem: `tenantId` alanı içerip içermemesi (şema taraması). Kullanıcı/oturum/kiracı tabloları **tenant-scoped değil**, platform tablosudur; önceki turdaki "54 tenantId / 37 platform" sayısında hata vardı, aşağıda düzeltildi.

- **Kiracıya özel (tenantId var): 54**
- **Platform / sistem (tenantId yok): 37**

Platform/sistem listesi:
- Kimlik ve kiracı (düzeltme: bunlar kiracı tablosu DEĞİL, platform/kimlik): `Tenant`, `User`, `Account`, `Session`, `VerificationToken`
- Katalog ve plan: `ModuleCatalog`, `Plan`, `PlanVersion`, `PlanFeature`, `AddOnCatalog`, `PlatformSetting`
- Programme/çağrı/konu: `Programme`, `Call`, `Topic`, `TopicStat`
- Sistem: `RawFetch`, `SystemAlert`, `BlogPost`, `PublicLead`
- Uzman ön-kayıt: `ExpertPreRegistration`, `ExpertPreRegAttempt`, `ExpertFounderCounter`
- Cordis (dış veri, salt-okur platform): `CordisProject`, `CordisOrganization`, `CordisParticipation`, `CordisProjectTopic`, `CordisProjectSciVoc`, `CordisImportRun`, `CordisPartnerProfile`, `CordisCoParticipation`
- Partner arama (platform verisi): `PartnerSearchAnnouncement`, `PartnerProfileSnapshot`, `PartnerSearchIngestionRun`, `UnmatchedOrganization`, `PartnerSearchTopicStat`
- Interreg rubrik (platform): `InterregRubric`, `InterregRubricCriterion`

**Belirsiz (işaretli, karar bekliyor):**
- `Tenant`: tenant tablosunun kendisi; `tenantId` taşımaz, ama kiracı izolasyonunun kökü. RLS/`withTenant` kapsamı dışında tutulmalı mı? → karar gerekli.
- `User`, `Account`, `Session`: kimlik; kiracıya üyelik `Membership` üzerinden. Platform sayılmalarında sorun yok, ama `Membership` (tenantId'li) ile birlikte gözden geçirilmeli.
- `Cordis*`, `PartnerSearch*`: içerik platform verisi mi, yoksa kiracının türetilmiş görünümü mü? Mevcut şemada tenantId yok → platform kabul edildi.

Not: "görünümlü / salt-okur platform / sistem" üçlü sınıflandırması tam tablo olarak bu raporda verildi; tablo kolon-düzeyi değil model-düzeyidir.

## Ham SQL ve liste alanları (lider talimatı: 18 alan)

Taranan 2 gerçek kullanım (diğer `ANY(`/`unnest(`/`@>`/`&&` yerleri skaler kolonlarda, sorun yok):
- `src/lib/expert-prereg/server/admin.ts:43` — `where.expertiseAreas = { has: filters.area }`. Prisma `has` filtresi liste kolonuna bağlı; Json'da çalışmaz. **Çözüm önerisi:** Faz 1'de `JSON_CONTAINS(expertiseAreas, JSON_QUOTE(?))` raw koşulu veya uygulama tarafında filtre; `expertiseAreas` küçük kümeli olduğu için in-memory de kabul edilebilir. Karar: `JSON_CONTAINS` (sorguyu DB'de tutar).
- `src/lib/scoring/embeddings.ts:377-431` — raw SQL `SELECT … keywords …`, sonuç `string[]` olarak okunuyor. Json'da MariaDB `JSON` döner; **uygulama sınırında `JSON.parse` + Zod doğrulaması** gerekir.
- `tests/plan-storefront.spec.ts:81` — `Plan.modules` için PG sözdizimli raw `INSERT`. MariaDB'de bu test dal dışında; `plan` fixture'ı Prisma ile yazılmalı.

Lider kararındaki "Prisma `has` kullanımı yok" varsayımı **yanlıştı**: `admin.ts:43` kullanıyor. Bu, Faz 1 kapsamına alındı.

## Riskler

1. **`insensitive` regresyonu (31 yer, 12 dosya):** `utf8mb4_bin` varsayılanıyla arama büyük/küçük harfe duyarlı kalır (ölçüm: 0 vs 1). Öneri: bu kolonları `utf8mb4_unicode_ci` yap; 31 yerin tamamını tek tek listele. **Yapılmadı** — karar bekliyor (aşağıda).
2. **Prisma dışı yazımlar `[]` varsayılanını almaz** (ölçüldü). Raw SQL veya seed yazan her yer değer vermeli.
3. **`LONGTEXT`/`VARCHAR(191)`:** 555 `String` (`@db`'siz) `VARCHAR(191)`'e düşüyor; strict mod taşmada hata verir (sessiz kesme yok). Uzun alanlar (`@db.Text` adayları) incelenmedi.
4. **Adapter:** `@prisma/adapter-mariadb` kurulu değil; istemci bağlantısı bu turda yok.

## Açık sorular (lider kararı gerekli)

1. **Collation:** `insensitive` 31 kolon için `utf8mb4_unicode_ci` istisnası mı, yoksa tüm şema `utf8mb4_unicode_ci` mı? Öneri: yalnızca 31 arama kolonu `_ci`, geri kalan `_bin` (anahtar çakışması ve performans için). Karar verilmeden adım 4 kapanmaz.
2. **Tenant tablosu:** RLS/`withTenant` kapsamı dışında mı kalsın?
3. **Süre:** Plan 6,5–10,5 gün idi. Bu turda Faz 1 şema/DDL/kapı tamamlandı; kalan iş (collation, 2 raw-SQL düzeltmesi, adapter, Zod sınırı) için tahmin **~5–8 iş günü** (uygulama kodu dahil).

## Doğrulama — kapılar

- `node scripts/mysql-schema/generate.mjs --check` → exit 0 (`listFields 18, longText 15, vectorFields 3`)
- Kapı mutantları A ve B → exit 1 (yukarıda)
- `npx vitest run tests/mysql-schema.test.mjs` → 8/8 geçti
- `npx eslint scripts/mysql-schema/generate.mjs tests/mysql-schema.test.mjs` → exit 0
- `env -u CI -u DATABASE_URL FONBRIDGE_GATE_NO_CACHE=1 bash scripts/gate-isolated.sh pnpm gate` → **GATE_EXIT=0** (3. tur, `origin/dev` `92315c31` ile birleştirildikten sonra, merge commit `1ee87901`). Ham günlük: `/private/tmp/claude-501/-Users-macbook-alan-FONBRIDGE/ed80b82e-55d4-4a27-a334-7f0efd9e49f4/scratchpad/fo375-gate2.log`
  - `Test Files 487 passed | 2 skipped (489)`, `Tests 6311 passed | 54 skipped (6365)`
  - e2e: `475 passed (9.0m)`, `7 skipped`
  - lint: `4 problems (0 errors, 4 warnings)`
  - `check-orphan-alerts`: açık alarm 3, öksüz 0
  - `gate-isolated] ok: pnpm finished on an isolated database`
- Önceki turdaki gate (`GATE_EXIT=1`, 85 e2e kırığı) tarayıcı önbelleği eksikliğindendi (`browserType.launch`); bu turda tarayıcı kuruluyken geçti.

## Sonraki adım

1. Lider: collation kararı (açık soru 1) ve Tenant kapsamı (açık soru 2).
2. Karar gelince: 31 `insensitive` kolonu `_ci` yap, `expertiseAreas` `has` → `JSON_CONTAINS`, `embeddings.ts` keywords parse, `plan-storefront` fixture.
3. `@prisma/adapter-mariadb` ekle, Prisma istemcisi MariaDB'ye bağlansın, CRUD smoke test.
