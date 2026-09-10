# TASK-MTU64JWHRNDL — RLS kapsam denetimi (SALT OKUNUR)

> **Bu denetim CANLI ÖLÇÜM İÇERMEZ.** Veritabanına hiç bağlanılmadı; `pnpm db:migrate`,
> `pnpm db:rls`, `pnpm rls:check`, `pnpm rls:verify` **koşulmadı**, hiçbir şey commit edilmedi.
> Aşağıdaki her cümle `prisma/schema.prisma`, `prisma/rls.sql`, `prisma/migrations/**`,
> `scripts/rls-models.ts`, `scripts/check-rls.ts`, `scripts/check-rls-live.ts` ve `src/**`
> dosyalarının **statik okumasından** çıkarıldı. "Politika beyan edilmiş" ≠ "veritabanı uyguluyor";
> ikincisini yalnız `pnpm rls:verify` söyler ve onu blok-zincir-dev koşar (çakışma kuralı).

Denetim tarihi: 2026-09-09 · branch `dev` · HEAD `c0caeaf`

---

## 1. Ne bulundu — özet

| | |
|---|---|
| `prisma/schema.prisma`'daki toplam model | 72 |
| `tenantId` alanı taşıyan model | **46** |
| `rls.sql` `tenant_isolation` dizisi | 43 |
| `rls.sql` `tenant_or_shared` dizisi | 3 |
| İsim düzeyinde kapsam dışı kalan `tenantId` modeli | **0** |
| `tenantId` YOK ama kiracı verisi taşıyan, hiç politikası olmayan tablo | **2** (B-1) |
| Politikası var ama ifadesi diğerlerinden farklı olan tablo | **1** (C-1) |
| Kiracı tablosuna `withTenant` dışından yapılan `prisma.*` çağrısı (`src/`, test hariç) | **101** |

**Sonuç:** İsim eşleşmesi düzeyinde `rls.sql` şemayla tam örtüşüyor — `pnpm rls:check`'in
sorduğu soru bugün temiz. Ama üç ayrı yerde politika beyanı ile gerçek koruma arasında
boşluk var: iki tablonun hiç politikası yok ve **iki kapı da onları görmezden gelmeye
önceden programlanmış** (B-1); `CalendarConnection`'ın migration'daki politikası diğer
42'den yapısal olarak farklı ve tek başına uygulandığında tabloyu tamamen okunamaz
bırakıyor (C-1); `AuditEvent`'in şeması `null` kiracıya izin verirken politikası vermiyor
ve kod fiilen `null` kiracılı satır yazıyor (C-2).

---

## 2. (a) Tablo → RLS politikası matrisi

`prisma/rls.sql`'deki `CREATE POLICY tenant_isolation ... USING ... WITH CHECK ...` ifadesinde
`FOR` yan tümcesi **yok**; PostgreSQL'de bu `FOR ALL` demektir. `FOR ALL` bir politikada
`USING` → SELECT / UPDATE(eski satır) / DELETE, `WITH CHECK` → INSERT / UPDATE(yeni satır)
komutlarına uygulanır. Dolayısıyla `tenant_isolation` ve `tenant_or_shared` taşıyan her tablo
dört komutun dördünde de kapsanır — aşağıdaki ✔'ler bunu ifade eder, canlı ölçümü değil.

| Tablo | schema.prisma satır | tenantId | rls.sql politikası | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|---|---|---|
| Membership | 125 | String | tenant_isolation | ✔ | ✔ | ✔ | ✔ |
| Workspace | 146 | String | tenant_isolation | ✔ | ✔ | ✔ | ✔ |
| TenantProfile | 160 | String | tenant_isolation | ✔ | ✔ | ✔ | ✔ |
| ModuleState | 194 | String | tenant_isolation | ✔ | ✔ | ✔ | ✔ |
| PlanAssignment | 262 | String | tenant_isolation | ✔ | ✔ | ✔ | ✔ |
| Subscription | 290 | String | tenant_isolation | ✔ | ✔ | ✔ | ✔ |
| AddOn | 330 | String | tenant_isolation | ✔ | ✔ | ✔ | ✔ |
| LifetimeLicence | 342 | String | tenant_isolation | ✔ | ✔ | ✔ | ✔ |
| Invoice | 358 | String | tenant_isolation | ✔ | ✔ | ✔ | ✔ |
| TenantBillingIdentity | 418 | String | tenant_isolation | ✔ | ✔ | ✔ | ✔ |
| CreditLedger | 431 | String | tenant_isolation | ✔ | ✔ | ✔ | ✔ |
| TopicMatch | 562 | String | tenant_isolation | ✔ | ✔ | ✔ | ✔ |
| SavedSearch | 579 | String | tenant_isolation | ✔ | ✔ | ✔ | ✔ |
| Opportunity | 747 | String | tenant_isolation | ✔ | ✔ | ✔ | ✔ |
| GateDecision | 792 | String | tenant_isolation | ✔ | ✔ | ✔ | ✔ |
| ConsortiumSeat | 809 | String | tenant_isolation | ✔ | ✔ | ✔ | ✔ |
| PartnerOrg | 832 | String | tenant_isolation | ✔ | ✔ | ✔ | ✔ |
| Proposal | 844 | String | tenant_isolation | ✔ | ✔ | ✔ | ✔ |
| Effort | 860 | String | tenant_isolation | ✔ | ✔ | ✔ | ✔ |
| Evidence | 877 | String | tenant_isolation | ✔ | ✔ | ✔ | ✔ |
| Claim | 925 | String | tenant_isolation | ✔ | ✔ | ✔ | ✔ |
| ProposalUsage | 953 | String | tenant_isolation | ✔ | ✔ | ✔ | ✔ |
| **ConceptTemplate** | 979 | String? | tenant_or_shared | ✔ | ⚠ C-3 | ⚠ C-3 | ⚠ C-3 |
| ConceptNote | 988 | String | tenant_isolation | ✔ | ✔ | ✔ | ✔ |
| Relationship | 1013 | String | tenant_isolation | ✔ | ✔ | ✔ | ✔ |
| Interaction | 1032 | String | tenant_isolation | ✔ | ✔ | ✔ | ✔ |
| SeatCandidate | 1046 | String | tenant_isolation | ✔ | ✔ | ✔ | ✔ |
| AiUsageLog | 1061 | String | tenant_isolation | ✔ | ✔ | ✔ | ✔ |
| **Document** | 1080 | String? | tenant_or_shared | ✔ | ⚠ C-3 | ⚠ C-3 | ⚠ C-3 |
| **Chunk** | 1091 | String? | tenant_or_shared | ✔ | ⚠ C-3 | ⚠ C-3 | ⚠ C-3 |
| **AuditEvent** | 1104 | String? | tenant_isolation | ⚠ C-2 | ⚠ C-2 | ⚠ C-2 | ⚠ C-2 |
| Evaluation | 1124 | String | tenant_isolation | ✔ | ✔ | ✔ | ✔ |
| Reviewer | 1150 | String | tenant_isolation | ✔ | ✔ | ✔ | ✔ |
| Criterion | 1168 | String | tenant_isolation | ✔ | ✔ | ✔ | ✔ |
| Score | 1184 | String | tenant_isolation | ✔ | ✔ | ✔ | ✔ |
| MeetingBrief | 1201 | String | tenant_isolation | ✔ | ✔ | ✔ | ✔ |
| **CalendarConnection** | 1212 | String | tenant_isolation | ⚠ C-1 | ⚠ C-1 | ⚠ C-1 | ⚠ C-1 |
| FollowupDoc | 1234 | String | tenant_isolation | ✔ | ✔ | ✔ | ✔ |
| DualApprovalStep | 1263 | String | tenant_isolation | ✔ | ✔ | ✔ | ✔ |
| ApplicationPart | 1279 | String | tenant_isolation | ✔ | ✔ | ✔ | ✔ |
| TtoPortfolioItem | 1291 | String | tenant_isolation | ✔ | ✔ | ✔ | ✔ |
| MarketplaceListing | 1304 | String | tenant_isolation | ✔ | ✔ | ✔ | ✔ |
| ApiKey | 1317 | String | tenant_isolation | ✔ | ✔ | ✔ | ✔ |
| Invitation | 1328 | String | tenant_isolation | ✔ | ✔ | ✔ | ✔ |
| ApprovalRequest | 1342 | String | tenant_isolation | ✔ | ✔ | ✔ | ✔ |
| Feedback | 1385 | String | tenant_isolation | ✔ | ✔ | ✔ | ✔ |

**Politikası olmayan, `tenantId` taşımayan ama kiracı verisi tutan tablolar** (bkz. B-1):

| Tablo | schema.prisma satır | tenantId | rls.sql politikası | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|---|---|---|
| ClaimEvidenceLink | 940 | — | **YOK** | ✗ | ✗ | ✗ | ✗ |
| EvidenceReminder | 967 | — | **YOK** | ✗ | ✗ | ✗ | ✗ |

**Platform tabloları** (`Plan`, `PlanVersion`, `PlanFeature` — `tenantId` yok, kasıtlı):
`platform_read FOR SELECT USING (true)` + `platform_no_insert FOR INSERT WITH CHECK (false)`
+ `platform_no_update FOR UPDATE USING (false)` + `platform_no_delete FOR DELETE USING (false)`
→ dört komut da açıkça adlandırılmış. `FORCE` **yok** (kasıtlı: platform yazımları sahibi rolle
koşuyor). `prisma/rls.sql:59-75` ile `prisma/migrations/add-plan-versioning/migration.sql:117-131`
aynı ifadeyi taşıyor, sapma yok.

---

## 3. (b) Politikası hiç olmayan kiracı tabloları

### B-1 — `ClaimEvidenceLink` ve `EvidenceReminder`: kiracı verisi, sıfır izolasyon

```
prisma/schema.prisma:940  model ClaimEvidenceLink   claimId → Claim(tenant), evidenceId → Evidence(tenant)
prisma/schema.prisma:967  model EvidenceReminder    evidenceId → Evidence(tenant), recipientEmails String[]
```

Her ikisi de kiracıya özel tablolara (`Claim`, `Evidence`) yabancı anahtarla bağlı, yani
taşıdıkları her satır bir kiracıya aittir. Ama kendi `tenantId` sütunları yok, dolayısıyla:

* `prisma/rls.sql` içinde hiç geçmiyorlar → `ENABLE ROW LEVEL SECURITY` bile çalışmıyor.
* **`scripts/rls-models.ts:19` ikisini de `SYSTEM_WIDE` kümesine yazmış** — yani hem statik
  kapı (`check-rls.ts`) hem canlı kapı (`check-rls-live.ts`, aynı `tenantScopedModels()`'i
  kullanıyor) bu iki tabloyu **görmezden gelmeye önceden programlanmış**. Kapı bu ikisi için
  hiçbir zaman kırmızı yanmaz.
* `src/modules/m3/manifest.ts:25` ikisini de M3'ün tabloları olarak beyan ediyor
  (`tables: ['Evidence', 'Claim', 'ClaimEvidenceLink', 'EvidenceReminder']`).

CLAUDE.md kural 1 ("RLS politikası olmayan tablo PR'ı geçmez") uyarınca bu iki tablo bugünkü
haliyle PR geçirmemeliydi; geçmelerinin sebebi kuralın "`tenantId` taşıyan tablo" diye
uygulanması, tabloların ise `tenantId` yerine FK ile kiracıya bağlanması.

**Bugünkü fiili risk sınırlı ama sıfır değil.** İki tabloya yazan/okuyan tek bir uygulama
kod yolu yok (grep: yalnız manifest ve `rls-models.ts` eşleşiyor, sorgu yok) — yani şu an
kiracı verisi *tutmuyorlar*. Risk, ilk yazma yolu eklendiği anda sessizce açılır:
`EvidenceReminder.recipientEmails` bir e-posta dizisidir (kişisel veri) ve app rolüyle
tüm kiracılara okunabilir olur, hiçbir kapı ötmeden.

Önerilen düzeltme (bu görev kapsamı dışında, uygulanmadı): iki tabloya `tenantId String`
eklemek (additive), `rls.sql` dizisine yazmak, `rls-models.ts:19`'daki `SYSTEM_WIDE`
kaydından çıkarmak. Alternatif — FK üzerinden EXISTS ile politika yazmak — kapıların
`tenant_isolation` adına bakması yüzünden ek iş ister.

---

## 4. (c) Politikası var ama ifadesi farklı olanlar (kopyala-yapıştır sapması)

### C-1 — `CalendarConnection`: tek başına uygulandığında tabloyu tamamen okunamaz bırakan RESTRICTIVE politika

`prisma/migrations/add-calendar-connections/migration.sql:24-29`:

```sql
ALTER TABLE "CalendarConnection" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON "CalendarConnection" AS RESTRICTIVE
    USING (
        (current_setting('app.tenant_id')::text != '' AND "tenantId" = current_setting('app.tenant_id')::text)
        OR (SELECT current_setting('is_system')::boolean)
    );
```

Referans ifade (`prisma/rls.sql:19-22`, ve aynen `add-feedback.sql:75`, `add-lifetime-licence.sql:55`,
`add-m6-evaluator-lens.sql:154`, `add-m10-dual-approval-persistence/migration.sql:55`,
`add-plan-versioning/migration.sql:110`):

```sql
CREATE POLICY tenant_isolation ON %I
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true))
```

Dört ayrı sapma, hepsi aynı dosyada:

1. **`AS RESTRICTIVE`, üstelik tek politika.** PostgreSQL'de restrictive politikalar erişim
   *vermez*, yalnız daraltır; RLS açık bir tabloda hiç permissive politika yoksa hiçbir satır
   görünmez. Bu migration tek başına uygulandığında `CalendarConnection` **kendi kiracısına
   bile kapalıdır**. `prisma/rls.sql` sonradan koşarsa `DROP POLICY IF EXISTS tenant_isolation`
   bunu siler ve doğru permissive politikayı kurar — yani tablonun son hâli **hangi dosyanın
   en son koştuğuna** bağlı. Diğer beş migration'da bu belirsizlik yok, çünkü hepsi rls.sql
   ile birebir aynı ifadeyi kuruyor.
2. **`FORCE ROW LEVEL SECURITY` yok.** Diğer tüm kiracı tablolarında var. Tablo sahibi rol
   (migration'ları koşan rol) politikadan muaf kalır.
3. **`missing_ok` bayrağı yok:** `current_setting('app.tenant_id')` — ikinci argüman `true`
   verilmediği için parametre tanımlı değilse `NULL` dönmez, **hata fırlatır**
   (`unrecognized configuration parameter`). Referans ifadede `, true` var; oradaki davranış
   "bağlam yoksa hiçbir satır" (fail-closed), buradaki "bağlam yoksa sorgu patlar".
   Aynı sorun `current_setting('is_system')` için de geçerli ve daha ağır: `is_system` nokta
   içermeyen bir isim, PostgreSQL özel parametrelerde `öbek.ad` biçimi ister — bu çağrı
   tanımlanabilir bir parametreye karşılık gelmiyor, her koşuda hata verir.
4. **`is_system` kaçış kapısı** başka hiçbir politikada yok; sisteme özel bir baypas kavramını
   yalnız bu tabloda tanımlıyor.

Ayrıca aynı dosyanın 9-10. satırları `accessToken`'ın düz metin tutulduğunu ve OAuth'tan önce
şifrelenmesi gerektiğini not düşüyor (`docs/ROADMAP.md` açık karar #12); `src/lib/db.ts:28-52`
bunu `withCalendarTokenGate` uzantısıyla makine düzeyinde zorluyor. Bu ayrı bir konu, ama
aynı tablonun koruma yüzeyi olduğu için burada anılıyor.

### C-2 — `AuditEvent`: şema `null` kiracıya izin veriyor, politika vermiyor, kod `null` yazıyor

```
prisma/schema.prisma:1107   tenantId  String?
prisma/rls.sql:8            'AiUsageLog','AuditEvent',        ← tenant_isolation dizisinde
scripts/rls-models.ts:23    NULLABLE_TENANT = new Set(['Document', 'Chunk', 'ConceptTemplate'])   ← AuditEvent yok
```

`AuditEvent.tenantId` `String?`. `Document`/`Chunk`/`ConceptTemplate` de öyle ve onlar
`tenant_or_shared` (`"tenantId" IS NULL OR ...`) alıyor. `AuditEvent` ise sıkı
`tenant_isolation` altında: `"tenantId" = current_setting('app.tenant_id', true)`. `NULL = 'x'`
sonucu `NULL`'dır, `true` değil — dolayısıyla `tenantId` `null` olan bir satır **hiçbir bağlamda
okunamaz** ve `WITH CHECK` yüzünden **hiç yazılamaz**.

Kod bu satırları kasten üretiyor:

```
src/actions/user/request-deletion.ts:235
    await prisma.auditEvent.create({ data: { type, target: subjectRef, data } });   // tenantId YOK
```

(`recordErasureAudit`, kullanıcının hiçbir kiracıda üyeliği kalmadığı dal — KVKK/GDPR silme
talebinin kaydı.) Aynı desen `src/lib/inngest/jobs/users-scheduled-deletion.ts:217,224`'te de var.

Bugün bu yazımlar geçiyor, çünkü uygulama yerelde SUPERUSER `fabrika` rolüyle bağlanıyor
(`prisma/rls-app-role.sql:3` bunu açıkça söylüyor). NOBYPASSRLS bir rolde — yani üretimin
olması gereken hâli — bu `create` çağrısı RLS ihlaliyle reddedilir; `recordErasureAudit`
`try/catch` ile sarılı ve hatayı `console.warn`'a yazıp yutuyor, yani **silme talebinin denetim
kaydı sessizce kaybolur**. Bu, `scripts/check-rls-live.ts:17-21`'in anlattığı
TASK-MTSWVADF7RQ1B F-1 vakasının birebir aynısıdır (`embedText`'in `AiUsageLog` yazımı).

Ek olarak `src/app/[locale]/admin/audit/page.tsx:23` `prisma.auditEvent.findMany()` ile
kiracı bağlamı olmadan okuyor; `tenant_isolation` altında bu sayfa NOBYPASSRLS rolde
**her zaman boş liste** gösterir — `prisma/rls.sql:44-49`'daki `lifetime_licence_count()`
yorumunda anlatılan "sıfır okuyup 'henüz yok' diye rapor etme" hatasının aynısı.

### C-3 — `tenant_or_shared`: her kiracı, tüm kiracıların gördüğü satır yazabilir ve platform satırını silebilir

`prisma/rls.sql:29-34`:

```sql
CREATE POLICY tenant_or_shared ON %I
  USING ("tenantId" IS NULL OR "tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" IS NULL OR "tenantId" = current_setting('app.tenant_id', true))
```

Okuma tarafı doğru (paylaşılan iş programları herkese görünsün). Yazma tarafı fazla geniş:

* **INSERT:** `WITH CHECK` `tenantId IS NULL`'ı kabul ettiği için, herhangi bir kiracı bağlamındaki
  bir yazma yolu `tenantId: null` vererek **tüm kiracılara görünen** bir `Document` / `Chunk` /
  `ConceptTemplate` satırı bırakabilir.
* **UPDATE / DELETE:** `USING` de `tenantId IS NULL`'ı kabul ettiği için, herhangi bir kiracı
  **platform satırlarını değiştirebilir veya silebilir** (`ConceptTemplate` — `cetp_pre`,
  `he_stage1_blind` gibi platform şablonları; `prisma/schema.prisma:981` yorumu "null = platform").

Referans `tenant_isolation` bu üç komutu kiracı sınırında kapatıyor; `tenant_or_shared`
okuma gevşekliğini yazmaya da taşımış. Doğrusu ayrı komut politikaları olurdu:
`FOR SELECT USING (tenantId IS NULL OR ...)` + `FOR INSERT/UPDATE/DELETE` yalnız
`tenantId = current_setting(...)`. **Bu bir öneridir, uygulanmadı.**

### C-4 — İki kapının da göremediği şeyler (kapsam boşluğu, sapma değil)

`scripts/check-rls-live.ts:419-421` yalnız `policyname = 'tenant_isolation'` satırlarını sayıyor
ve yalnız `tenantScopedModels()` listesine bakıyor. Sonuç olarak canlı kapı şunları **hiç
ölçmüyor**:

* `Document`, `Chunk`, `ConceptTemplate` — politika adı `tenant_or_shared`, model listesi
  `NULLABLE_TENANT` ile bunları zaten dışlıyor. Üç tablo için RLS'in açık olup olmadığı bile
  sorulmuyor.
* `Plan`, `PlanVersion`, `PlanFeature` — `platform_*` politikaları hiç kontrol edilmiyor.
* `ClaimEvidenceLink`, `EvidenceReminder` — B-1.
* **`relforcerowsecurity`** hiçbir yerde sorulmuyor: `ENABLE` var ama `FORCE` yok bir tablo
  (C-1'deki `CalendarConnection` tam olarak bu) kapıdan yeşil geçer.
* Politikanın **permissive mi restrictive mi** olduğu sorulmuyor (yine C-1).
* Davranışsal yazma sondası **yalnız `AiUsageLog`** üzerinde koşuyor
  (`check-rls-live.ts:305`); 43 tablonun `WITH CHECK`'i tek tablodan genelleniyor.

Bunlar kapıyı yalancı yapmıyor — ölçtüğü şeyi dürüstçe ölçüyor ve ölçemediğinde yeşil
yazmıyor — ama kapsamı, sandığından dar.

---

## 5. (d) `withTenant` sarmalayıcısını atlayan sorgular

`withTenant` (`src/lib/db.ts:104-115`) bir `$transaction` açıp
`SELECT set_config('app.tenant_id', $1, true)` koşar. **Sarmalayıcı dışındaki her `prisma.*`
çağrısında `app.tenant_id` tanımsızdır**, dolayısıyla `current_setting('app.tenant_id', true)`
`NULL` döner ve NOBYPASSRLS bir rolde hem okuma 0 satır verir hem yazma reddedilir.

Sayım (grep tabanlı, `.test.` / `.spec.` dosyaları hariç):

```
bare prisma.<kiracıModeli>.<işlem> — src/     : 101
bare prisma.<kiracıModeli>.<işlem> — scripts/ : 179
withTenant / withTenantOn çağrı yeri          : 129
```

`scripts/` altındaki 179 çağrı (seed, e2e hazırlığı, `esr-calibration`, `beta-onboarding`)
kasıtlı olarak yönetici rolüyle koşar — bunlar bulgu değil. **Asıl liste `src/` altındaki 101
çağrıdır**; model başına:

```
AuditEvent=11, Opportunity=9, ConceptTemplate=8, Feedback=7, Subscription=7,
Membership=6, CalendarConnection=6, ModuleState=6, AddOn=6, ApplicationPart=4,
SavedSearch=4, ConceptNote=3, Relationship=3, LifetimeLicence=3, CreditLedger=3,
Effort=2, AiUsageLog=2, ApprovalRequest=2, Workspace=2, Document=2,
Evaluation=1, Evidence=1, MarketplaceListing=1, ApiKey=1, ProposalUsage=1
```

Bunların hepsi hata değil — bir kısmı kasıtlı platform/admin yolu, bir kısmı `where: { tenantId }`
ile elle filtreliyor (RLS yerine uygulama katmanında). Ama **RLS'e tabi bir rolde davranışı
değişecek** olan yollar bunlar. En keskin örnekler, grep kanıtıyla:

| Yer | Çağrı | RLS'e tabi rolde ne olur |
|---|---|---|
| `src/actions/user/request-deletion.ts:235` | `prisma.auditEvent.create({ data: { type, target, data } })` — `tenantId` yok | INSERT reddedilir; `catch` yutar → silme talebi denetim kaydı **kaybolur** (C-2) |
| `src/actions/user/request-deletion.ts:240` | `prisma.auditEvent.create({ data: { tenantId, ... } })` | Bağlam yok → `WITH CHECK` başarısız → INSERT reddedilir |
| `src/app/[locale]/admin/audit/page.tsx:23` | `prisma.auditEvent.findMany({...})` | **Her zaman boş liste** — admin denetim ekranı sessizce kör |
| `src/app/[locale]/admin/modules/page.tsx:28` | `prisma.moduleState.findMany()` — filtre bile yok | Her zaman 0 satır |
| `src/lib/ai/rag.ts:90` | `prisma.document.create({ data: { tenantId, ... } })` | `tenant_or_shared` `WITH CHECK` başarısız → yükleme reddedilir |
| `src/lib/ai/rag.ts:118` | `$executeRaw INSERT INTO "Chunk" (...)` | Aynı; `stored !== chunks.length` kontrolü hata fırlatır |
| `src/lib/ai/rag.ts:146` | `prisma.document.delete({ where: { id } })` | Temizlik yolu; 0 satır etkiler, yetim `Document` kalır |
| `src/lib/billing/subscription-sync.ts:316,344,398,439,450` | `subscription.upsert`, `addOn.findMany`, `creditLedger.create`, `moduleState.upsert`, `auditEvent.create` | Webhook yolu; okuma 0, yazma reddedilir → abonelik senkronu sessizce hiçbir şey yapmaz |
| `src/lib/billing/lifetime-licence.ts:176,183,223` | `lifetimeLicence.findFirst/create` | Aynı sınıf; `rls.sql:44-56` bu tablo için zaten SECURITY DEFINER istisnası açmış |
| `src/lib/inngest/jobs/alerts-daily.ts:104,125,143,171` | `savedSearch.findMany/update`, `membership.findMany` | Arka plan işi; 0 kayıt bulur, "uyarı yok" diye biter |
| `src/lib/inngest/jobs/credits-monthly-grant.ts:31` | `creditLedger.create` | Aylık kredi dağıtımı reddedilir |
| `src/lib/inngest/jobs/users-scheduled-deletion.ts:101-138` | `aiUsageLog/effort/savedSearch/relationship/proposalUsage` üzerinde `deleteMany`/`updateMany` | Zamanlanmış silme **0 satır** siler → kişisel veri kalır, iş başarılı raporlar |
| `src/lib/api-auth.ts:41` | `prisma.apiKey.findUnique({...})` | Anahtar hiç bulunmaz → tüm API kimlik doğrulaması reddeder (bu yol bağlam kurulmadan ÖNCE koşmak zorunda; tasarım gereği istisna, ama RLS ile çelişiyor) |
| `src/modules/m9/server/calendar-actions.ts:31,43,71,79` | `calendarConnection.findUnique/create/delete` | C-1'deki politika hangi hâlde kalırsa ona bağlı |
| `src/app/[locale]/(app)/[workspace]/evidence/page.tsx:21` | `prisma.evidence.findMany({...})` | Kiracı sayfası ama sarmalayıcısız — 0 satır |
| `src/app/[locale]/(app)/[workspace]/concept-notes/page.tsx:24` | `prisma.conceptNote.findMany({...})` | Aynı |
| `src/app/[locale]/(app)/[workspace]/approvals/page.tsx:23` | `prisma.approvalRequest.findMany({...})` | Aynı |
| `src/app/[locale]/(app)/[workspace]/marketplace/page.tsx:21` | `prisma.marketplaceListing.findMany({...})` | Aynı |
| `src/app/[locale]/(app)/[workspace]/pipeline/actions.ts:211,218,222,295,362` | `workspace.findFirst`, `opportunity.create/updateMany` | Aynı dosyanın 407, 472, 576. satırları `withTenant` kullanıyor — **aynı dosya içinde iki farklı desen** |

Son satır en önemlisi: `pipeline/actions.ts` hem sarmalayıcılı hem sarmalayıcısız yolları
yan yana taşıyor, yani "hangisi doğru desen" sorusunun cevabı kod tabanında tutarlı değil.

**Kanıt tekrar üretimi** (salt okunur):

```bash
# src/ altındaki sarmalayıcısız kiracı sorgusu sayımı
grep -rnoE '\bprisma\.(auditEvent|opportunity|conceptTemplate|feedback|subscription|membership|calendarConnection|moduleState|addOn|applicationPart|savedSearch|conceptNote|relationship|lifetimeLicence|creditLedger|effort|aiUsageLog|approvalRequest|workspace|document|evaluation|evidence|marketplaceListing|apiKey|proposalUsage)\.' src \
  | grep -v '\.test\.' | grep -v '\.spec\.' | wc -l      # → 101

grep -rnoE '\bwithTenant(On)?[<(]' src scripts | grep -v '\.test\.' | wc -l   # → 129
```

---

## 6. Neyin ölçülmediği (açıkça)

* Veritabanına **hiç bağlanılmadı**. `pg_policies`, `pg_class.relrowsecurity`,
  `pg_class.relforcerowsecurity`, `pg_policies.permissive` **sorulmadı**.
* Dolayısıyla "veritabanında bu politikalar gerçekten var mı" sorusu bu raporda
  **cevapsızdır**. `check-rls.ts`'in başlığındaki uyarı burada da geçerli:
  2026-09-07'de depo 38 politika beyan ederken veritabanında 1 tane vardı.
* `CalendarConnection`'ın son hâlinin RESTRICTIVE mi PERMISSIVE mi olduğu (C-1) **yalnız
  canlı sorguyla** belirlenebilir: `select policyname, permissive, cmd, qual, with_check
  from pg_policies where tablename = 'CalendarConnection';`
* Uygulamanın üretimde hangi rolle bağlandığı denetlenmedi (`.env` okunmadı). C-2 ve (d)
  bölümündeki sonuçlar "NOBYPASSRLS bir rolde" koşuluna bağlıdır.
* Migration'ların hangi sırayla uygulandığı denetlenmedi; C-1'deki belirsizlik bundan doğuyor.

## 7. Sonraki adım (öneri — uygulanmadı)

1. **C-1** en acili: `add-calendar-connections/migration.sql`'deki politikayı diğer beşiyle
   birebir aynı ifadeye getir (`FORCE` + permissive + `, true` + `WITH CHECK`). Additive ve
   idempotent: `DROP POLICY IF EXISTS` + `CREATE POLICY` zaten iki kez koşmaya güvenli.
2. **C-2**: `AuditEvent`'i `rls.sql`'de `tenant_isolation` dizisinden `tenant_or_shared`
   dizisine taşı **ve** `scripts/rls-models.ts:23`'teki `NULLABLE_TENANT` kümesine ekle —
   ikisi birlikte, yoksa `check-rls.ts` kırmızı yanar.
3. **B-1**: `ClaimEvidenceLink` / `EvidenceReminder`'a `tenantId` ekle (additive migration),
   `rls.sql` dizisine yaz, `rls-models.ts:19`'daki `SYSTEM_WIDE` kaydından çıkar.
4. **C-4**: `check-rls-live.ts`'e `relforcerowsecurity` ve `pg_policies.permissive`
   kontrolü ekle; `tenant_or_shared` ve `platform_*` tablolarını da kapsama al.
5. **(d)**: `pipeline/actions.ts`'i tek desende topla; `admin/audit/page.tsx` ve
   `admin/modules/page.tsx` için platform okuması gerektiği açıkça yorumlansın ya da
   `lifetime_licence_count()` gibi dar bir SECURITY DEFINER yoluna alınsın.

Bu adımların hiçbiri bu görevde uygulanmadı — görev SALT OKUNUR tanımlandı.
