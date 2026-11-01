# TASK-MVIB70K677R5M · FO-116 üçüncü geçiş: FO-58 + FO-116, origin/dev üstüne temiz dal (be-fb)

**Hüküm:** BAŞARILI. Temiz dal hazır, push/PR yok. CRW-FB onayı bekleniyor.
**Tip:** runtime (dal taşıma / cherry-pick, kod davranışı değişmedi)
**Platform:** mac (Darwin 27, pgvector/pgvector:pg16 izole konteyner). Değişiklik saf TS + SQL + doküman; platforma bağlı yol yok (süreç, dosya yolu, kabuk adı yok). Windows/Linux koşulamadı (bu makinede yok); CI Linux'ta aynı `db:setup` sırasını koşar.

## Ne yapıldı
- Dal `be-fb/fo58-partner-search-dev`, worktree `.claude/worktrees/fo58-ps-dev`, taban `origin/dev` = `0125d91f`.
- Yalnız iki commit cherry-pick edildi:

| Kaynak | Yeni hash | Mesaj |
|---|---|---|
| `0a654b99` | **`79cfe31e`** | feat(m1): partner search data model, migration and PIC matching (FO-58) |
| `37efa245` | **`f466f378`** | fix(m1): tighten partner-search PIC fuzzy matching (FO-58 D1) |

- Çakışmalar (4 dosya, dev'deki her şey korundu):
  - `docs/DATA_MODEL.md`: dev'in §22 ExpertPreRegistration ve §23 BlogPost bölümleri kaldı; Partner Search **§24** oldu.
  - `prisma/migrations/apply-order.txt`: dev'in son 4 satırı (`drop-evidence-reminder.sql` … `blog-read-minutes.sql`) korundu, `add-partner-search.sql` en sona eklendi (51/51).
  - `prisma/rls.sql`: dev listesi esas alındı (`EvidenceReminder` dev'de düşürüldüğü için listeye GERİ GELMEDİ), yalnız `PartnerSearchQuotaUsage` eklendi. DISABLE döngüsü otomatik birleşti.
  - `tests/rls-coverage.test.ts`: CHECK 4c beklenen listesi = dev'in `ExpertPreRegistration`'ı + FO-58'in 5 tablosu.
- `schema.prisma`, `scripts/rls-models.ts` çakışmasız birleşti.
- 2. commit (FO-116) çakışmasız uygulandı.

## Kanıt (ham çıktı)

### Dal kapsamı
```
$ git log --oneline origin/dev..HEAD
f466f378 fix(m1): tighten partner-search PIC fuzzy matching (FO-58 D1)
79cfe31e feat(m1): partner search data model, migration and PIC matching (FO-58)

$ git diff --stat origin/dev...HEAD
 docs/DATA_MODEL.md                                 |  15 ++
 prisma/migrations/add-partner-search.down.sql      |  36 ++++
 prisma/migrations/add-partner-search.sql           | 197 +++++++++++++++++++++
 prisma/migrations/apply-order.txt                  |   1 +
 prisma/rls.sql                                     |   8 +-
 prisma/schema.prisma                               | 144 +++++++++++++++
 scripts/rls-models.ts                              |   6 +
 .../m1/server/partner-search/match-pic.test.ts     | 177 ++++++++++++++++++
 src/modules/m1/server/partner-search/match-pic.ts  | 145 +++++++++++++++
 tests/rls-coverage.test.ts                         |  12 +-
 10 files changed, 737 insertions(+), 4 deletions(-)

$ git diff --name-only origin/dev...HEAD | grep -ci 'interreg\|keep'
0
```

### İzole DB (paylaşılan :5433 `fabrika`'ya DOKUNULMADI)
Konteyner `fo58-psdev-pg` (127.0.0.1:5658, pgvector:pg16, DB `fabrika`). `DATABASE_URL` / `DATABASE_URL_RLS_TEST` komut satırında açıkça verildi; `.env` okunmadı/kopyalanmadı. İş sonunda konteyner durduruldu (`docker stop`; silinmedi, CRW isterse `docker start fo58-psdev-pg`).

`pnpm db:generate` `db:setup` adım 0'da koştu.

```
setup1 exit=0
setup2 exit=0            # ikinci tam kurulum = idempotency
==> [51/51] add-partner-search.sql
psql:...add-partner-search.sql:51: NOTICE:  column "hasActiveAnnouncements" of relation "CordisOrganization" already exists, skipping
... (tüm CREATE ... IF NOT EXISTS → "already exists, skipping")
```

Down/up döngüsü (`scripts/apply-migrations.sh --down add-partner-search.down.sql`, sonra ileri yön iki kez):
```
-- before
PartnerProfileSnapshot rls=false force=false
PartnerSearchAnnouncement rls=false force=false
PartnerSearchIngestionRun rls=false force=false
PartnerSearchQuotaUsage rls=true force=true
PartnerSearchTopicStat rls=false force=false
UnmatchedOrganization rls=false force=false
cordis_ps_cols=3
policies=PartnerSearchQuotaUsage:tenant_isolation,PartnerSearchQuotaUsage:system_scope
==> [down] add-partner-search.down.sql
apply-migrations: rolled back with add-partner-search.down.sql as fabrika
down exit=0
-- after-down
cordis_ps_cols=0          # 6 tablo yok, 3 CORDIS kolonu yok
up1 exit=0
up2 exit=0
-- after-up
(6 tablo aynı RLS durumuyla geri geldi) cordis_ps_cols=3
policies=PartnerSearchQuotaUsage:tenant_isolation
```
`system_scope` politikası migration'dan değil `prisma/rls.sql`'den gelir; döngü sonrası `pnpm db:rls` koşunca geri geldi (CI ve canlı sırası da migration → `db:rls`):
```
✅ prisma/rls.sql applied. Policies in public: 115 → 116
system_scope,tenant_isolation
```
CORDIS değeri değişmiyor (2 prob satırı eklendi, ölçüldü, sonra silindi):
```
before=fa16cacf178222efbdc5f85e1e156f1f
down=0 md5=fa16cacf178222efbdc5f85e1e156f1f
up=0 md5=fa16cacf178222efbdc5f85e1e156f1f
999000001|f|t     # hasActiveAnnouncements=false, lastAnnouncementAt NULL
999000002|f|t
```

### RLS
```
rls:check exit=0
✅ SUCCESS: every one of them carries ENABLE + FORCE + tenant_isolation in its own migration.
CHECK 4c — 8 policy-less tables are created by migrations: BlogPost, ExpertPreRegistration, PartnerSearchAnnouncement, PartnerProfileSnapshot, PartnerSearchIngestionRun, UnmatchedOrganization, PartnerSearchTopicStat, PublicLead
✅ SUCCESS: every one of them DISABLEs row level security in its own migration.

rls:verify --require-db exit=0
Kiracıya özel model: 48 · RLS açık tablo: 56 · tenant_isolation politikası: 48
RLS açık + 0 politika (deny-all): 0 · RLS kapalı + anon/authenticated erişimi: 0
Ölçüm rolü: fabrika_app (rolsuper=false, rolbypassrls=false) — kaynak: DATABASE_URL_RLS_TEST
...
✅ 48 kiracıya özel tabloda politika yerinde ve izolasyon fabrika_app rolüyle GERÇEKTEN ölçüldü: okuma ve yazma, kiracı sınırında reddedildi.
```

### Lint / typecheck
```
lint exit=0
✖ 4 problems (0 errors, 4 warnings)
typecheck exit=0
```
4 uyarı dev'den gelir, bu dalın dokunmadığı dosyalarda: `src/lib/invitations/accept.ts:31` (`Prisma`), `tests/e2e/fixtures/concept-template-tenant.ts:4` (`E2E_IDENTITIES`), `tests/settings-profile-update.test.ts:5,16` (`beforeAll`, `withTenant`). `git diff --name-only origin/dev...HEAD` bu üç dosyayı içermiyor.

### Vitest
```
$ perl -e 'alarm 900; exec @ARGV' pnpm exec vitest run src/modules/m1/server/partner-search tests/rls-coverage.test.ts tests/api/api-error-body-guard.test.ts
vitest exit=0
 Test Files  3 passed (3)
      Tests  80 passed (80)
   Duration  5.83s
```
80 geçti, 0 atlandı, 0 kırmızı. `api-error-body-guard` bu dalda yeşil (interreg yok).

## Değişen dosyalar (yeni dalda, origin/dev'e göre)
`docs/DATA_MODEL.md`, `prisma/migrations/add-partner-search.sql`, `prisma/migrations/add-partner-search.down.sql`, `prisma/migrations/apply-order.txt`, `prisma/rls.sql`, `prisma/schema.prisma`, `scripts/rls-models.ts`, `src/modules/m1/server/partner-search/match-pic.ts`, `src/modules/m1/server/partner-search/match-pic.test.ts`, `tests/rls-coverage.test.ts`.
Bu rapor dosyası ana çalışma ağacına yazıldı (yeni dala girmedi).

## Riskler
- `origin/dev` ilerlerse `apply-order.txt` ve `rls.sql` listeleri yeniden çakışabilir; çözüm aynı: dev satırları korunur, `add-partner-search.sql` en sona gider.
- Cherry-pick commit tarihleri kaynak commit tarihini korur (yazar tarihi 2026-10-21).
- Tam `pnpm test` / e2e bu geçişte koşulmadı: kart yalnız yukarıdaki üç hedefi istedi.

## Açık sorular
- Eski dal `be-fb/fo58-partner-search-model` ve worktree'si `fo58-ps-model` duruyor. Silinmesi lider kararı; ben dokunmadım.

## Sonraki adım
CRW-FB `79cfe31e` + `f466f378`'i inceler; onaydan sonra lider push/PR işini ayrı verir.
