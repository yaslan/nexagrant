# TASK-MTU64JWHRNDL — Kiracıya özel tablo ↔ RLS politikası kapsam envanteri (statik yeniden denetim)

> **CANLI ÖLÇÜM YOK.** Veritabanına bağlanılmadı; `pnpm db:migrate`, `pnpm db:rls`,
> `pnpm rls:check`, `pnpm rls:verify` **koşulmadı**; hiçbir dosya değiştirilmedi, commit yok.
> Aşağıdaki her satır `prisma/schema.prisma`, `prisma/rls.sql`, `prisma/migrations/**`,
> `scripts/rls-models.ts`, `scripts/check-rls.ts`, `scripts/check-rls-live.ts`,
> `tests/rls-coverage.test.ts` ve `src/**` dosyalarının **statik okumasından** çıkarıldı.
> "Politika beyan edilmiş" ≠ "veritabanı uyguluyor"; ikincisini yalnız `pnpm rls:verify` söyler.

Denetim: 2026-09-09 · branch `dev` · HEAD `d27d8f4` · denetçi `blok-zincir-dse`

Bu, aynı kartın **ikinci** geçişi. Birincisi `docs/agent-results/TASK-MTU64JWHRNDL-geli-tirici.md`
(HEAD `c0caeaf`) üç boşluk bulmuştu (B-1, C-1, C-2); bunlar TASK-MTU6HUB8FUHMG'de düzeltildi.
Bu rapor (a) o üç düzeltmeyi dosya düzeyinde **doğruluyor**, (b) envanteri güncel şemaya göre
**yeniden** üretiyor, (c) **yeni bir boşluk** raporluyor (D-1).

---

## 1. Özet

| Ölçüm | Değer | Önceki geçiş (`c0caeaf`) |
|---|---|---|
| `schema.prisma` toplam model | 72 | 72 |
| `tenantId` taşıyan model | **48** | 46 |
| `rls.sql` `tenant_isolation` dizisi | 44 | 43 |
| `rls.sql` `tenant_or_shared` dizisi | 4 | 3 |
| `rls.sql` `platform_*` dizisi | 3 | 3 |
| **CHECK 1** — `tenantId` var, `rls.sql`'de yok | **0** | 0 |
| **CHECK 2** — `tenantId` yok ama FK ile kiracıya bağlı, politikasız | **0** ✅ | 2 (B-1) |
| **CHECK 3** — `String?` ↔ politika sınıfı uyuşmazlığı | **0** ✅ | 1 (C-2) |
| **CHECK 4** — migration ↔ `rls.sql` ifade sapması | **0** ✅ | 1 (C-1) |
| **CHECK 4b** — migration tabloyu kuruyor ama politikayı beyan etmiyor | **3** ⚠ YENİ | ölçülmedi |
| **CHECK 5** — `rls.sql`'de adı geçen ama modeli olmayan tablo | 0 | ölçülmedi |
| Dizi çakışması (bir tablo iki politika sınıfında) | 0 | ölçülmedi |
| `src/` altında `withTenant`'sız kiracı sorgusu | 96 | 101 |

**Sonuç:** İsim düzeyinde kapsam tam ve önceki üç bulgunun üçü de kapanmış. Kalan tek yeni
boşluk **D-1**: üç kiracı tablosu, kendisini kuran migration'da hiçbir RLS ifadesi taşımıyor —
`prisma/rls.sql` koşulmadan migration'la kurulan bir veritabanında bu üç tablo RLS'siz kalır.

---

## 2. (a) Tablo → RLS politikası matrisi (48 kiracı tablosu)

`tenant_isolation` ve `tenant_or_shared` ifadelerinde `FOR` yan tümcesi yoktur; PostgreSQL'de
bu `FOR ALL` demektir (`USING` → SELECT/UPDATE-eski/DELETE, `WITH CHECK` → INSERT/UPDATE-yeni).
Aşağıdaki "FORCE" sütunu tablonun `rls.sql`'de `FORCE ROW LEVEL SECURITY` alıp almadığıdır —
almayan tabloda **tablo sahibi rol politikadan muaftır**.

| Tablo | schema satır | tenantId | rls.sql politikası | FORCE | migration CREATE TABLE | migration politikası |
|---|---|---|---|---|---|---|
| AddOn | 330 | String | tenant_isolation | ✔ | — | — |
| AiUsageLog | 1074 | String | tenant_isolation | ✔ | — | — |
| ApiKey | 1336 | String | tenant_isolation | ✔ | — | — |
| ApplicationPart | 1298 | String | tenant_isolation | ✔ | — | — |
| ApprovalRequest | 1361 | String | tenant_isolation | ✔ | — | — |
| AuditEvent | 1123 | String? | tenant_or_shared | ✔ | — | — |
| CalendarConnection | 1231 | String | tenant_isolation | ✔ | add-calendar-connections/migration.sql | add-calendar-connections/migration.sql |
| **Chunk** | 1104 | String? | tenant_or_shared | **✗** | — | — |
| Claim | 925 | String | tenant_isolation | ✔ | — | — |
| ClaimEvidenceLink | 944 | String | tenant_isolation | ✔ | — | — |
| ConceptNote | 1001 | String | tenant_isolation | ✔ | — | — |
| **ConceptTemplate** | 992 | String? | tenant_or_shared | **✗** | — | — |
| ConsortiumSeat | 809 | String | tenant_isolation | ✔ | — | — |
| CreditLedger | 431 | String | tenant_isolation | ✔ | — | — |
| Criterion | 1187 | String | tenant_isolation | ✔ | add-m6-evaluator-lens.sql | add-m6-evaluator-lens.sql |
| **Document** | 1093 | String? | tenant_or_shared | **✗** | — | — |
| DualApprovalStep | 1282 | String | tenant_isolation | ✔ | add-m10-dual-approval-persistence/migration.sql | add-m10-dual-approval-persistence/migration.sql |
| Effort | 860 | String | tenant_isolation | ✔ | — | — |
| Evaluation | 1143 | String | tenant_isolation | ✔ | — | — |
| Evidence | 877 | String | tenant_isolation | ✔ | — | — |
| EvidenceReminder | 976 | String | tenant_isolation | ✔ | — | — |
| Feedback | 1404 | String | tenant_isolation | ✔ | add-feedback.sql | add-feedback.sql |
| FollowupDoc | 1253 | String | tenant_isolation | ✔ | — | — |
| GateDecision | 792 | String | tenant_isolation | ✔ | — | — |
| Interaction | 1045 | String | tenant_isolation | ✔ | — | — |
| Invitation | 1347 | String | tenant_isolation | ✔ | — | — |
| **Invoice** | 358 | String | tenant_isolation | ✔ | add-invoice.sql | **YOK — D-1** |
| LifetimeLicence | 342 | String | tenant_isolation | ✔ | add-lifetime-licence.sql | add-lifetime-licence.sql |
| MarketplaceListing | 1323 | String | tenant_isolation | ✔ | — | — |
| **MeetingBrief** | 1220 | String | tenant_isolation | ✔ | add-m9-meeting-schedule/migration.sql | **YOK — D-1** |
| Membership | 125 | String | tenant_isolation | ✔ | — | — |
| ModuleState | 194 | String | tenant_isolation | ✔ | — | — |
| Opportunity | 747 | String | tenant_isolation | ✔ | — | — |
| PartnerOrg | 832 | String | tenant_isolation | ✔ | — | — |
| PlanAssignment | 262 | String | tenant_isolation | ✔ | add-plan-versioning/migration.sql | add-plan-versioning/migration.sql |
| Proposal | 844 | String | tenant_isolation | ✔ | — | — |
| ProposalUsage | 959 | String | tenant_isolation | ✔ | — | — |
| Relationship | 1026 | String | tenant_isolation | ✔ | — | — |
| Reviewer | 1169 | String | tenant_isolation | ✔ | add-m6-evaluator-lens.sql | add-m6-evaluator-lens.sql |
| SavedSearch | 579 | String | tenant_isolation | ✔ | — | — |
| Score | 1203 | String | tenant_isolation | ✔ | add-m6-evaluator-lens.sql | add-m6-evaluator-lens.sql |
| SeatCandidate | 1059 | String | tenant_isolation | ✔ | — | — |
| Subscription | 290 | String | tenant_isolation | ✔ | — | — |
| **TenantBillingIdentity** | 418 | String | tenant_isolation | ✔ | add-invoice-write-path.sql | **YOK — D-1** |
| TenantProfile | 160 | String | tenant_isolation | ✔ | — | — |
| TopicMatch | 562 | String | tenant_isolation | ✔ | — | — |
| TtoPortfolioItem | 1310 | String | tenant_isolation | ✔ | — | — |
| Workspace | 146 | String | tenant_isolation | ✔ | — | — |

**Platform tabloları** (`tenantId` yok, kasıtlı — `platform_read` + `platform_no_insert/update/delete`):

| Tablo | schema satır | FORCE | migration politikası |
|---|---|---|---|
| Plan | 206 | ✗ (kasıtlı: yazımlar sahibi rolle koşar) | add-plan-versioning/migration.sql |
| PlanVersion | 223 | ✗ (kasıtlı) | add-plan-versioning/migration.sql |
| PlanFeature | 246 | ✗ (kasıtlı) | add-plan-versioning/migration.sql |

**"migration CREATE TABLE = —" olan 37 tablo** şema-push döneminden gelir; onları kuran bir
migration dosyası deposunda yoktur, dolayısıyla D-1 onları ilgilendirmez — tek politika kaynakları
`prisma/rls.sql`'dir. (Bkz. hafıza: `fabrika-prisma-migrations-are-hand-applied`.)

---

## 3. Önceki geçişin üç bulgusu — dosya düzeyinde doğrulama

### B-1 KAPANDI ✅ — `ClaimEvidenceLink`, `EvidenceReminder`

* `prisma/schema.prisma:946` ve `:978` — ikisinde de `tenantId String` (nullable **değil**).
* `prisma/rls.sql:14` — `tenant_isolation` dizisinin sonunda ikisi de var.
* `scripts/rls-models.ts:24-32` — `SYSTEM_WIDE` kümesinde artık yoklar; küme yorumu neden
  çıkarıldıklarını kayda geçiriyor.
* `tests/rls-coverage.test.ts:45-52` — **kümenin kendisini** doğruluyor: `SYSTEM_WIDE` üyesi
  hiçbir modelde `tenantId` olamaz. Bu hata sınıfı artık sessizce geri gelemez.
* Bağımsız ölçüm (bu denetim, CHECK 2): `tenantId` taşımayan 24 modelin **hiçbiri** kiracıya özel
  bir modele FK ile bağlı değil. FK-türevli kiracı verisi kalmadı.

### C-1 KAPANDI ✅ — `CalendarConnection` politikası

`prisma/migrations/add-calendar-connections/migration.sql:24-31` bugün referans ifadenin birebir
aynısı:

```sql
ALTER TABLE "CalendarConnection" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CalendarConnection" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "CalendarConnection";
CREATE POLICY tenant_isolation ON "CalendarConnection"
    USING ("tenantId" = current_setting('app.tenant_id', true))
    WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));
```

Dört sapmanın dördü de gitmiş: `AS RESTRICTIVE` yok, `FORCE` var, `, true` bayrağı var,
`is_system` kaçış kapısı yok. Depodaki **altı** literal `tenant_isolation` ifadesi
(`add-feedback.sql:75`, `add-lifetime-licence.sql:55`, `add-m6-evaluator-lens.sql:154`,
`add-m10-dual-approval-persistence/migration.sql:55`, `add-plan-versioning/migration.sql:110`,
`add-calendar-connections/migration.sql:29`) artık `prisma/rls.sql:19-21` ile karakter düzeyinde
aynı (yalnız `add-feedback.sql:73` ve `add-lifetime-licence.sql:53`'teki `FORCE  ROW LEVEL
SECURITY` çift boşlukludur — ifade farkı değil, biçim farkı; tek-boşluklu bir grep burada
yanlış-negatif verir, bkz. hafıza `fabrika-force-rls-double-space-grep-trap`). **CHECK 4 sapma
sayısı: 0** — bağımsız olarak TASK-MTUGK2OUVAFDN taraması da aynı sonuca vardı
(`docs/agent-results/TASK-MTUGK2OUVAFDN-blok-zincir-denet-i.md`): CalendarConnection izole bir
vakaydı, sistemik değil. O tarama **politika taşıyan** 8 dosyanın ifadelerini karşılaştırdı;
aşağıdaki D-1 ise **politika hiç taşımayan** 3 dosyayla ilgilidir — iki sonuç çelişmez, tamamlar.

### C-2 KAPANDI ✅ — `AuditEvent`

* `prisma/rls.sql:39` — `tenant_or_shared` dizisinde; `:41` aynı döngüde
  `DROP POLICY IF EXISTS tenant_isolation` var, yani zaten migrate edilmiş bir veritabanındaki
  eski sıkı politika **OR'lanarak hayatta kalamaz**.
* `prisma/rls.sql:54` — `ALTER TABLE "AuditEvent" FORCE ROW LEVEL SECURITY` ayrıca belirtilmiş
  (paylaşılan döngü FORCE etmiyor). Muafiyet açığı yok.
* `scripts/rls-models.ts:41` — `NULLABLE_TENANT` kümesine eklenmiş, `check-rls.ts` kırmızı yanmıyor.
* `prisma/migrations/auditevent-tenant-or-shared.sql` + `.down.sql` — ileri/geri çifti mevcut.
* `tests/rls-coverage.test.ts:106-155` — politika sınıfını **ve** onu gerektiren üç yazma yolunu
  (`request-deletion.ts`, `users-scheduled-deletion.ts`, `export-data.ts`) birlikte doğruluyor.

**CHECK 3 (bu denetim):** 4 `String?` modelin dördü de `tenant_or_shared`; 44 `String` modelin
hiçbiri `tenant_or_shared` altında değil. Uyuşmazlık yok.

---

## 4. YENİ BULGU

### D-1 — Üç kiracı tablosu, kendisini kuran migration'da hiç RLS ifadesi taşımıyor

```
prisma/migrations/add-invoice.sql              → CREATE TABLE "Invoice"                (RLS ifadesi: 0)
prisma/migrations/add-invoice-write-path.sql   → CREATE TABLE "TenantBillingIdentity"  (RLS ifadesi: 0)
prisma/migrations/add-m9-meeting-schedule/migration.sql → CREATE TABLE "MeetingBrief"  (RLS ifadesi: 0)
```

Depodaki diğer **beş** kiracı tablosu kuran migration bunu tam tersi yapıyor ve gerekçesini de
yazıyor — `add-feedback.sql:69-71`:

> "Same shape as every other tenant-scoped table in prisma/rls.sql, **repeated here so applying
> this file alone leaves no window where the table exists without a policy**."

Aynı cümle `add-lifetime-licence.sql:49-51`, `add-m6-evaluator-lens.sql:145-146`,
`add-m10-dual-approval-persistence/migration.sql:50-51`'de de var. Yani depo bu pencereyi
**bilinen bir risk olarak tanımlamış** ve beş tabloda kapatmış; bu üçünde açık.

Üçünün de `rls.sql`'de politikası var, dolayısıyla `pnpm rls:check` ve
`tests/rls-coverage.test.ts` yeşil — **iki kapı da bu boşluğu ölçmüyor.** Fark yalnız migration'lar
uygulanıp `pnpm db:rls` **koşulmadığı** anda görünür: o pencerede üç tabloda
`ENABLE ROW LEVEL SECURITY` bile yoktur, yani NOBYPASSRLS bir rol bile tüm kiracıların
faturalarını, fatura kimliklerini (VKN/TCKN, vergi dairesi, fatura adresi —
`add-invoice-write-path.sql:9-19`) ve toplantı brifinglerini okuyabilir.

İki dosya bunu **kasıtlı** yapıyor ve söylüyor (`add-invoice.sql:19-20`,
`add-invoice-write-path.sql:37-39`: "RLS: added to the tenant_isolation list in prisma/rls.sql in
the same change"). `add-m9-meeting-schedule/migration.sql` (13 satır) hiçbir şey söylemiyor.
Yani bu bir sapma değil, **iki farklı yerleşik gelenek**: politikayı migration'da tekrar et
(5 tablo) ya da yalnız `rls.sql`'e bırak (3 tablo). Sorun, geleneğin hangisi olduğunun
kod tabanında karara bağlanmamış olması ve hiçbir kapının bu ayrımı ölçmemesi.

**Düzeltme önerisi (uygulanmadı — görev salt okunur):** üç migration'ın sonuna diğer beşteki
dört satırlık bloğu ekle (`ENABLE` + `FORCE` + `DROP POLICY IF EXISTS` + `CREATE POLICY`,
idempotent, additive). Ardından bu sınıfın geri gelmemesi için `tests/rls-coverage.test.ts`'e
tek bir dosya-düzeyi iddiası: *"bir migration kiracıya özel bir tablo `CREATE TABLE` ediyorsa
aynı dosya o tablo için `CREATE POLICY` de etmelidir."* Bu iddia bugün 3 tabloda kırmızı yanar
ve düzeltmeden sonra kalıcı korumadır.

### D-2 (düşük) — `add-evidence-link-tenant-id.sql` ileri/geri çifti asimetrik

`.down.sql:9-14` `ClaimEvidenceLink`/`EvidenceReminder` üzerinde `tenant_isolation`'ı DROP ediyor
ve `NO FORCE` + `DISABLE` uyguluyor; ileri dosya (`add-evidence-link-tenant-id.sql`) bunların
hiçbirini **kurmuyor** — yalnız kolon ve indeks ekliyor, başlıkta "After this migration run
`pnpm db:rls`" diyor. Geri alma, ileri yolun kurmadığı bir durumu geri alıyor. Bu hatalı değil
(`IF EXISTS` idempotent ve `pnpm db:rls`'in koştuğu varsayımı yazılı), ama D-1 ile aynı belirsizliğin
ikinci yüzü: politikanın nerede yaşadığı dosya başına değişiyor.

---

## 5. Hâlâ açık olan, bu denetimde değişmemiş bulgular

Aşağıdakiler önceki geçişte raporlandı, TASK-MTU6HUB8FUHMG kapsamında **değildi** ve bugün de
aynen duruyor. Yeniden bulgu olarak açmıyorum, kapsam envanterinin dürüst olması için sayıyorum.

* **C-3 — `tenant_or_shared` yazma tarafı fazla geniş.** `prisma/rls.sql:44-45`:
  `WITH CHECK ("tenantId" IS NULL OR ...)`. Herhangi bir kiracı bağlamı `tenantId: null` vererek
  **tüm kiracılara görünen** bir `Document`/`Chunk`/`ConceptTemplate` satırı bırakabilir; `USING`
  de aynı olduğu için platform şablonlarını **güncelleyebilir/silebilir**. Doğrusu komut başına
  ayrı politika olurdu (SELECT gevşek, INSERT/UPDATE/DELETE sıkı).
* **Document / Chunk / ConceptTemplate'te FORCE yok** (`rls.sql:49-53` bunu açıkça ve gerekçesiyle
  seçiyor: FORCE eklemek seed ve importer yazımlarını değiştirir). Tablo sahibi rol bu üç tabloda
  politikadan muaf.
* **C-4 — canlı kapının kapsamı.** `scripts/check-rls-live.ts:411-422` yalnız
  `pg_class.relrowsecurity` ve `pg_policies` içinde `policyname = 'tenant_isolation'` sorguluyor.
  Bugün hâlâ **hiç sorulmayan**: `relforcerowsecurity`, `pg_policies.permissive`,
  `tenant_or_shared` (4 tablo), `platform_*` (3 tablo). Yani "ENABLE var ama FORCE yok" ya da
  "politika RESTRICTIVE" bir tablo canlı kapıdan yeşil geçer. C-1 tam olarak bu sınıftı; düzeltildi
  ama **kapı hâlâ o sınıfı göremiyor**.
* **`withTenant` atlaması.** `src/` altında sarmalayıcısız kiracı sorgusu **96** (önceki geçişte
  101; `withTenant` çağrı yeri 129 → 135, `Document` sorguları RAG birleştirmesiyle listeden çıktı).
  `scripts/` altındaki 135 çağrı kasıtlı yönetici rolüdür, bulgu değildir.

---

## 6. Kanıt — komut çıktıları

Üç denetim betiği de salt okunur ve scratchpad'dedir; hiçbiri veritabanına bağlanmaz.

```
$ node scratchpad/audit.mjs
rls.sql arrays:
 [0] n=44 Membership,...,PlanAssignment,ClaimEvidenceLink,EvidenceReminder
 [1] n=4  Document,Chunk,ConceptTemplate,AuditEvent
 [2] n=3  Plan,PlanVersion,PlanFeature
policy names: tenant_isolation,tenant_or_shared,platform_read,platform_no_insert,platform_no_update,platform_no_delete

TOTAL models: 72  tenantId models: 48

--- CHECK 1: tenantId model not in rls.sql ---
NONE

--- CHECK 3: nullable/strict mismatch ---
  (nullable models: ConceptTemplate,Document,Chunk,AuditEvent)      ← hiçbiri tenant_isolation altında değil

--- CHECK 2: no tenantId but FK to a tenant-scoped model ---
                                                                    ← boş: FK-türevli kiracı tablosu kalmadı
```

```
$ node scratchpad/audit2.mjs        # tenantId'siz 24 modelin FK hedefleri
non-tenant models (24):
  Tenant, User, Account(→User), Session(→User), VerificationToken, ModuleCatalog,
  Plan, PlanVersion(→Plan), PlanFeature(→PlanVersion), AddOnCatalog, Programme,
  Call(→Programme), Topic(→Call), TopicStat(→Topic), RawFetch, SystemAlert,
  CordisProject, CordisOrganization, CordisParticipation(→CordisProject,CordisOrganization),
  CordisProjectTopic(→CordisProject), CordisProjectSciVoc(→CordisProject),
  CordisImportRun, CordisPartnerProfile(→CordisOrganization), CordisCoParticipation
  ⚠ TENANT-LINKED işareti: hiçbirinde yok
```

```
$ node scratchpad/audit3.mjs
CHECK 5: rls.sql names with no matching model: NONE

CHECK 4: tenant-scoped tables — created by a migration but that migration states no policy
  Invoice                  created=prisma/migrations/add-invoice.sql               ⚠ CREATED, NO POLICY IN ANY MIGRATION
  MeetingBrief             created=prisma/migrations/add-m9-meeting-schedule/...   ⚠ CREATED, NO POLICY IN ANY MIGRATION
  TenantBillingIdentity    created=prisma/migrations/add-invoice-write-path.sql    ⚠ CREATED, NO POLICY IN ANY MIGRATION
```

```
$ node scratchpad/matrix.mjs | head -2
OVERLAP between arrays: NONE          ← bir tablo iki politika sınıfında birden değil
```

```
$ for f in add-invoice.sql add-invoice-write-path.sql add-m9-meeting-schedule/migration.sql; do
    grep -ciE 'row level security|create policy' "prisma/migrations/$f"; done
0
0
0
```

```
$ M=<schema'dan üretilen 48 kiracı modeli, lowerCamel>
$ grep -rnoE "\bprisma\.($M)\." src | grep -v '\.test\.' | grep -v '\.spec\.' | wc -l
      96
$ grep -rnoE '\bwithTenant(On)?[<(]' src scripts | grep -v '\.test\.' | wc -l
     135
```

Kanıt yeniden üretimi (salt okunur, DB'siz): yukarıdaki dört komut + betikler
`/private/tmp/claude-501/.../scratchpad/{audit,audit2,audit3,matrix}.mjs`.

---

## 7. Değişen dosyalar

**Hiçbiri.** Bu görev salt okunurdur: DB'ye yazılmadı, migration koşulmadı, commit yapılmadı.
Tek yeni dosya bu rapordur (`docs/agent-results/TASK-MTU64JWHRNDL-blok-zincir-dse.md`).

---

## 8. Riskler / neyin ölçülmediği (açıkça)

* **Veritabanına hiç bağlanılmadı.** `pg_policies`, `pg_class.relrowsecurity`,
  `pg_class.relforcerowsecurity`, `pg_policies.permissive` **sorulmadı**. "Beyan edilmiş" ≠
  "uygulanıyor": `scripts/check-rls.ts:5-8`'in kaydettiği gibi 2026-09-07'de depo 38 politika
  beyan ederken veritabanında 1 tane vardı. Bu raporun hiçbir satırı canlı bir iddia değildir.
* D-1'in **fiili** etkisi, üretim veritabanının nasıl kurulduğuna bağlıdır. Migration'lar
  uygulanıp ardından `pnpm db:rls` koşuluyorsa pencere kapanır ve D-1 yalnız bir gelenek
  tutarsızlığıdır. Kurulum sırası bu denetimde **doğrulanmadı** (canlı koşu yok).
* Uygulamanın hangi rolle bağlandığı denetlenmedi (`.env` okunmadı). §5'teki `withTenant`
  sonuçları "NOBYPASSRLS bir rolde" koşuluna bağlıdır.
* `rls-app-role.sql` / `setup-rls-role.ts` içeriği bu geçişte incelenmedi; kapsam
  tablo↔politika envanteriydi.

---

## 9. Açık sorular

1. **D-1 hangi yöne kapansın?** Politika her migration'da tekrar mı edilsin (5 tablonun yaptığı,
   yorumlarda gerekçesi yazılı), yoksa tek kaynak `prisma/rls.sql` mi olsun (3 tablonun yaptığı)?
   Karar hangisi olursa olsun, **ölçülebilir** hâle gelmesi için `rls-coverage.test.ts`'e tek bir
   iddia yeter. Karar `docs/ROADMAP.md` "Açık kararlar"a mı yazılsın?
2. **C-3** (paylaşılan tabloların yazma tarafı) bir sonraki sprintte kart açılacak mı? Bugün
   herhangi bir kiracı platform `ConceptTemplate` satırını silebiliyor — bu bir yetkilendirme
   kararı, tasarım kararı değil.
3. **C-4** (canlı kapının FORCE/permissive/`tenant_or_shared`/`platform_*` körlüğü) düzeltilene
   kadar `pnpm rls:verify` yeşili "44/51 tablo ölçüldü" demektir. Kapı çıktısı bunu **yazsın mı**?
   Bugün yazmıyor ve okuyan "hepsi ölçüldü" sanıyor.

---

## 10. Sonraki adım (öneri — uygulanmadı)

| # | İş | Dosya | Boyut |
|---|---|---|---|
| 1 | D-1: üç migration'a dört satırlık RLS bloğunu ekle | `add-invoice.sql`, `add-invoice-write-path.sql`, `add-m9-meeting-schedule/migration.sql` | ~12 satır, additive + idempotent |
| 2 | D-1 kalıcı koruma: "kiracı tablosu kuran migration politikayı da kurar" iddiası | `tests/rls-coverage.test.ts` | ~20 satır |
| 3 | C-4: canlı kapıya `relforcerowsecurity` + `permissive` + `tenant_or_shared` + `platform_*` | `scripts/check-rls-live.ts` | orta |
| 4 | C-3: `tenant_or_shared`'ı komut başına ayır (SELECT gevşek, yazma sıkı) | `prisma/rls.sql` + migration | orta, davranış değiştirir — ayrı kart |

Hiçbiri bu görevde uygulanmadı; görev **statik envanter, canlı koşu yok** olarak tanımlıydı.
