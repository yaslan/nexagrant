# FO-375 — MySQL Faz 1: görünüm şeması ve iki istemci (be-fb, tur 4)

**Kart:** TASK-MVZTBLOCAWR8X · **Ajan:** be-fb · **Dal:** `be-fb/mysql-faz1` · **Worktree:** `/Users/macbook/alan/FONBRIDGE-worktrees/be-fb-fo375` · **Draft PR:** #263
**hüküm: Kısmen bitti (gate yeşil, 555 incelemesi açık). Görünüm katmanı, iki istemci, kapı, mutantlar, iki kez kurulum ve kiracı izolasyon ölçümleri tamam. 555 `String` alanının alan-alan incelemesi yapılmadı; kapı sonucu aşağıda.**

**Platform beyanı:** mac (Darwin 27.2, yerel Docker `mariadb:11.8.9`). Windows ve Linux koşulmadı (bu makinede yok; kart kapsamı yalnız-mac).

---

## Ne yapıldı

| # | Kart adımı | Durum | Kanıt |
|---|---|---|---|
| 1–2 | Worktree, dal, yerel `mariadb:11.8` (Hostinger eşleniği) | Önceki turda tamam | Ölçüm aşağıda |
| 3 | `prisma migrate diff` MariaDB denemesi | Önceki turda DURDU (`-2` raporu); lider kapsamı açık tuttu | `FO-375-be-fb-2.md` |
| 4 | Şema çevirisi (18 liste, 15 LongText, 3 vektör, 24 enum, 48 Json) | Tamam (önceki tur) | `generate.mjs --check` |
| 5 | 91 model sınıflandırması | **Tamam, bu turda lider bölümüne göre** | Tablo aşağıda |
| 6 | Üretici betik + iki istemci (görünüm, tablo) + kapı | **Bu turda** | `generate.mjs`, `view-schema.prisma`, `views.sql` |
| 7 | Her DDL için `down` | Tamam: `init.down.sql`, `views.down.sql` | Down/up döngüsü aşağıda |
| 8 | Adaptör (`@prisma/adapter-mariadb`) | Paket kurulu; havuz ayarı Faz 2 | `package.json` |
| 4′ (lider) | 555 `@db`'siz String incelemesi | **Açık** (aşağıda, sayım yapıldı) | Sayım aşağıda |

### Sınıflandırma (kart 5, lider bölünmesi: 54 kiracı görünümü / 5 platform görünümü / 32 sistem tablosu)

Üreteç (`classifyModels`) bu üçlüyü koda yazar ve sayılar değişirse dururken hata verir.

- **Kiracı (54), `v_<tablo>` = `SELECT * … WHERE tenantId = fabrika_current_tenant() WITH CASCADED CHECK OPTION`:** AgencyInviteCode, Membership, Workspace, TenantProfile, ModuleState, PlanAssignment, Subscription, AddOn, LifetimeLicence, Invoice, TenantBillingIdentity, CreditLedger, TopicMatch, SavedSearch, PartnerSearchQuotaUsage, Opportunity, GateDecision, ConsortiumSeat, PartnerOrg, Proposal, Effort, Evidence, Claim, ClaimEvidenceLink, ProposalUsage, ConceptTemplate, ConceptNote, Relationship, Interaction, SeatCandidate, AiUsageLog, Document, Chunk, AuditEvent, StripeEventLog, Notification, Evaluation, Reviewer, Criterion, Score, MeetingBrief, CalendarConnection, FollowupDoc, DualApprovalStep, ApplicationPart, TtoPortfolioItem, ApiKey, Invitation, ApprovalRequest, Feedback, Consent, InterregAnalysis, InterregAnalysisResult, InterregCriterionMark (ve listede kalan kiracı modelleri; tam liste üreteçte).
- **Platform (5), `ALGORITHM=TEMPTABLE`, filtresiz:** Plan (`v_Plan`), PlanVersion, PlanFeature, InterregRubric, InterregRubricCriterion.
- **Sistem (32), görünüm YOK, yalnız tablo istemcisi (İ-2 A, Faz 2):** Tenant, User, Account, Session, VerificationToken, ModuleCatalog, AddOnCatalog, PlatformSetting, Programme, Call, Topic, TopicStat, RawFetch, SystemAlert, BlogPost, PublicLead, ExpertPreRegistration, ExpertPreRegAttempt, ExpertFounderCounter, CordisProject, CordisOrganization, CordisParticipation, CordisProjectTopic, CordisProjectSciVoc, CordisImportRun, CordisPartnerProfile, CordisCoParticipation, PartnerSearchAnnouncement, PartnerProfileSnapshot, PartnerSearchIngestionRun, UnmatchedOrganization, PartnerSearchTopicStat.

**Plan ile çelişki:** Yok. FO-355 bölüm 4 "37 tenantId'siz model: görünümlü, salt-okur platform ya da sistem" der; lider 5 + 32 bölmesi bu üçlüyle uyumlu. Yine de iki sınıf kararı lidere açık (aşağıda).

### İki istemci

- `prisma/mysql/schema.prisma` → `node_modules/.prisma/client-mysql` (tablo istemcisi, migration ve sistem kapsamı).
- `prisma/mysql/view-schema.prisma` → `node_modules/.prisma/client-mysql-view` (59 model, her biri `@@map("v_<tablo>")`). Sistem modelleri bu şemada yok; sistem modellerine işaret eden alanlar da düşürüldü, böylece görünüm istemcisi ilişkiler üzerinden sistem tablolarına ulaşamaz.
- İzin listesi ve geçiş Faz 2 (kart: "izin listesi ve geçiş Faz 2"). Uygulama kodu bu turda değişmedi (`src/` dokunulmadı).

---

## Kanıt (ham çıktı)

### Kapı: `node scripts/mysql-schema/generate.mjs --check`

```
baseline:   mysql artifacts up to date ({"listFields":18,"longText":15,"vectorFields":3,"ciColumns":41,"views":54,"platformViews":5})   exit=0
mutant C:   view-schema.prisma elle düzenlendi (@@map("v_Plan") → @@map("Plan"))
            stale or hand-edited: prisma/mysql/view-schema.prisma. Run: node scripts/mysql-schema/generate.mjs   exit=1
mutant D:   views.sql elle düzenlendi (ilk WITH CASCADED CHECK OPTION silindi)
            stale or hand-edited: prisma/mysql/views.sql. Run: node scripts/mysql-schema/generate.mjs   exit=1
restored:   mysql artifacts up to date (...)   exit=0
```

Önceki tur mutantları (`init.sql` VARCHAR(190), `workspaceIds` String[]) da hâlâ kırmızı. Mutant C'nin ilk denemesinde `@@map` yalnız modelin son satırından sonra eklenmişti (yorum satırı olan modellerde yanlış yere düşüyordu); bu yüzden `view-schema` içinde `Plan` görünüm adını taşımıyordu. Kapı bunu yakalayamazdı çünkü karşılaştırma aynı hatalı üreticiyle yapılıyordu. Düzeltildi: `@@map` artık modelin kendi kapanış `}` satırından önce konur, ve üreteç 59 eşlemeyi saymazsa hata verir.

### Üretim ve kurulum (iki kez baştan + down/up)

```
### install #1 (reset + apply)     ok: --reset on fabrika_faz1
### down + up                      ok: --down; ok: apply
### install #2 (reset + apply)     ok: --reset on fabrika_faz1
```

Nesne sayımı (her kurulum sonrası): `tables=91 views=59 routines=1`. `--down` sonrası `0 0 0`.

### Kiracı izolasyonu (görünüm üzerinden, gerçek sorgu)

İki kiracı (`tA`, `tB`), birer `Workspace`. Birinci bölüm `ROLLBACK` içinde.

```
tA session: v_Workspace rows   1   tenant tA
tB session: v_Workspace rows   1   tenant tB
NULL session var: v_Workspace  0
base table Workspace (no filter) 2
```

Oturum değişkeni hiç set edilmemiş taze oturum (iki satır committed):

```
fabrika_current_tenant()                NULL
v_Workspace rows                        0
Workspace rows (no filter)              2
v_Plan rows (platform, no filter)       0   ← Plan tablosu boş; veriyle ölçülmedi (aşağıda)
```

### Yazma izolasyonu (kritik bulgu, düzeltildi)

Bu turun ilk ölçümünde `WITH CASCADED CHECK OPTION` yoktu: `information_schema.VIEWS` 54 kiracı görünümünü `IS_UPDATABLE=YES` gösteriyordu ve `tA` oturumundan `v_Workspace`'e `tenantId='tB'` ile INSERT kabul ediliyordu. Eklenince:

```
tA session: INSERT own tenant (tA) via v_Workspace       → kabul (autocommit; ölçüm sonrası silindi)
tA session: INSERT tB tenant via v_Workspace             → ERROR 1369 (44000): CHECK OPTION failed `fabrika_faz1`.`v_Workspace`
fresh session, var unset: INSERT via v_Workspace         → ERROR 1369 (44000): CHECK OPTION failed
```

Platform görünümleri (`ALGORITHM=TEMPTABLE`): `IS_UPDATABLE=NO` (beş görünümün beşi). Yazma DB seviyesinde kapalı.

### Harmanlama, LongText, SQL_MODE (`information_schema`)

```
column collation   varchar  utf8mb4_bin            876
column collation   varchar  utf8mb4_unicode_ci      53
column collation   longtext utf8mb4_bin            133
column collation   longtext utf8mb4_unicode_ci       4
long text columns  longtext                        137
routine  fabrika_current_tenant  SQL_MODE=ANSI_QUOTES,ONLY_FULL_GROUP_BY,STRICT_ALL_TABLES,NO_ENGINE_SUBSTITUTION  DEFINER=root@localhost
views    59  definer_security=59  updatable=54
session (apply init)  sql_mode=ANSI_QUOTES,ONLY_FULL_GROUP_BY,STRICT_ALL_TABLES,NO_ENGINE_SUBSTITUTION  tz=+00:00  iso=READ-COMMITTED
```

Notlar:

- `_ci` kolonlar 53 varchar + 4 longtext = 57 satır. Bu sayı 41 "arama" kolonu değil: `ciColumns` yalnız arama alanlarını (`mode:'insensitive'`) ve unique/id olmayanları işaretler; 41 kolon üreteçte, DDL'de 57 `utf8mb4_unicode_ci` kolon görünüyor, çünkü `LONGTEXT` kolonların bir kısmı da `_ci`. Lider "otomatik 41 `_ci` kolon kabul" dedi; **sayım uyuşmuyor, ayrı raporlanıyor** (aşağıda, açık soru 2).
- `LONGTEXT` 137 kolon (`@db.Text` 15 + `String` ile gelen uzun kolonlar değil; `@db.LongText` ile işaretlenenler 15 satır olarak kaynaktan çevrildi, kalanı `Json` alanlarının MariaDB karşılığı `longtext`'tir).
- Tablo varsayılanı `utf8mb4_bin`, veritabanı varsayılanı `utf8mb4_bin` (`apply.sh --reset`).
- `fabrika_current_tenant` ve tüm görünümler `DEFINER=root@localhost`, `SECURITY_TYPE=DEFINER`. A-TEK'te tek kullanıcı var; DEFINER ayrıcalık yükseltmesi yaratmıyor, ama Faz 2 izin listesi bu varsayımı yeniden kontrol etmeli.

### Unit testler

```
npx vitest run tests/mysql-schema.test.mjs
 Tests  18 passed (18)
```

Yeni testler: 91 model sınıfı (54/5/32), 59 görünüm eşlemesi, kiracı görünümünde `WITH CASCADED CHECK OPTION` (54 satır), platform görünümü `TEMPTABLE`, down betiği, sistem modellerine işaret eden alan olmaması.

### Gate

Izole gate: `env -u CI -u DATABASE_URL FONBRIDGE_GATE_NO_CACHE=1 bash scripts/gate-isolated.sh pnpm gate` → `GATE_EXIT=0`. Log: `/private/tmp/claude-501/-Users-macbook-alan-FONBRIDGE/5f5c7c96-ad70-4ced-ab23-99d7fa41b90e/scratchpad/fo375-gate3.log` (satır 66666: `mysql artifacts up to date`, satır 66669: `GATE_EXIT=0`).

Not: loglarda görünen "failed" kelimeleri test başlıkları ve beklenen hata kayıtlarıdır; kapı kırmızı değildir.

---

## Değişen dosyalar (bu tur)

- `scripts/mysql-schema/generate.mjs`: sınıflandırma, görünüm şeması, görünüm SQL'i, down, `prisma validate`, iki istemci üretimi, kapı genişletmesi
- `scripts/mysql-schema/apply.sh`: `views.sql` uygulama/indirme
- `tests/mysql-schema.test.mjs`: 6 yeni test
- `package.json`: `mysql:check` girintisi düzeltildi (kapı zincirine eklenmişti)
- `prisma/mysql/view-schema.prisma`, `prisma/mysql/views.sql`, `prisma/mysql/views.down.sql`: yeni (üretilmiş)
- `prisma/mysql/schema.prisma`, `prisma/mysql/init.sql`, `prisma/mysql/init.down.sql`: yeniden üretildi (değişiklik yok, kapı tutarlılığı için)
- `docs/agent-results/FO-375-be-fb-4.md`: bu rapor

`prisma/schema.prisma`, `.env`, ana checkout, Hostinger, Supabase, canlı: dokunulmadı.

Commit: `5e9e8abd feat(mysql): FO-375 view schema, tenant/platform views, two clients`.

---

## Kalan iş: 555 `@db`'siz `String`

Sayım (üretilmiş `prisma/mysql/schema.prisma`):

- Toplam **555** `String` skaler, `@db` yok (lider sayısı ile eşleşti).
- **106** `@id` / `@unique` (anahtar): `VARCHAR(191)` kalır; InnoDB için yeterli, değişikliği gerektirmiyor.
- **37** ad-tabanlı uzun metin adayı (`body|content|text|html|prompt|summary|description|note|reason|answer|feedback|analysis|…`): ad tahmini, veri veya kullanım değil. Her biri kullanım yerinden doğrulanmalı.
- **~412** kalan: kısa kalacak adaylar (kod, ad, e-posta, durum, URL). Alan-alan açık yazım (`@db.VarChar(n)`) yapılmadı.

Bu turda kolon tipi değiştirilmedi. Gerekçe: tip değişikliği DDL'i değiştirir, `init.sql` ve kapı bunu yeniden üretir; alan-alan karar lider onayı ister ve bu tur kapsamı görünüm katmanıydı. Açık iş olarak bırakıldı.

---

## Riskler

1. **Yazma yolu (kapatıldı):** Kiracı görünümü yazmayı CHECK OPTION ile sınırlar. Faz 2 izin listesi bunun üstüne eklenmeli; bu tur yalnız görünüm katmanını kapatır.
2. **Görünüm istemcisi ve oturum değişkeni:** `@app_tenant_id` her bağlantıda set edilmeli. Prisma havuzunda bağlantı yeniden kullanılınca değer sızabilir. Havuz ayarı (`resetAfterUse`) Faz 2 işi; burada ölçülmedi.
3. **Json varsayılanı:** `@default("[]")` ve `@default("{}")` DDL'de `DEFAULT` olarak yok (MariaDB JSON default kabul etmiyor). Ham SQL ve seed yazan her yol değer vermeli. Test fixture'ları bu nedenle `settings = '{}'` yazıyor.
4. **`insensitive` aramalar:** Arama kolonları `_ci`; kalan kolonlar `_bin`. Büyük/küçük harf davranışı kolon bazında değişir, Faz 2'de arama noktaları tek tek test edilmeli.
5. **Platform görünümü boş veriyle ölçüldü:** `Plan` tablosu boş; "filtresiz" davranış yapısal kanıtla (`SHOW CREATE VIEW` içinde `WHERE` yok) ve `IS_UPDATABLE=NO` ile doğrulandı, satır sayısıyla değil.
6. **Yeni yazılan kolonlarda görünüm yenilenmeli:** Tablo değişince `views.sql` yeniden üretilmeli; kapı bunu zorlar.

---

## Açık sorular (lidere)

1. **555 `String` incelemesi:** Alan-alan karar lider onayıyla mı, yoksa 37 adayın yalnız uzun-metin olanları LongText ve gerisi `VARCHAR(191)` kalsın mı? Öneri: 37 adayın kullanım yerinden doğrulanması, sonra toplu `@db.LongText`. Reversible; ben yaparım.
2. **`_ci` sayısı:** Lider 41 kabul etti; ölçüm 53 varchar + 4 longtext = 57 `utf8mb4_unicode_ci` kolonu gösteriyor. Fark: `ciColumns` yalnız `mode:'insensitive'` alanlarını alıyor, ama `Json`/`LONGTEXT` kolonların bir kısmı da `_ci` aldı. Hangisinin doğru olduğuna bakılıp kapı sayıyla sabitlenmeli. Ben kapıya sayı sabitlemesi eklemeyi öneriyorum.
3. **Sistem sınıfı kararları:** `Tenant` (kiracının kökü), `Cordis*` ve `PartnerSearch*` (platform verisi mi, kiracı türevi mi?). Şimdi "sistem" sayıldı: görünüm yok, yalnız tablo istemcisi. Platform olarak kabul edilirse 5 görünüm daha eklenir. Bu bir ürün kararı; yapmadım.
4. **Rapor yolu:** Kart `FO-375-be-fb-4.md` diyor; bracketli not `FO-375-be-fb.md` diyor. Bu rapor `-4` ile yazıldı (lider metni).
5. **rapor_yaz:** Araç ana checkout'a (kirli, başka işlerin dalı) yazar ve önceki tur raporu orada duruyor. Bu yüzden raporu doğrudan dalın worktree'sine yazdım. Lider isterse araçla ana ağaca kopyalanır.

---

## Sonraki adım

1. 555 alan incelemesi (açık soru 1 onayından sonra).
2. `_ci` sayısı için kapı sabitlemesi (açık soru 2).
3. Faz 2: izin listesi, havuz `resetAfterUse`, `system-scope.ts` tablo istemcisi.

**Süre tahmini (güncel):** Faz 0–1 kart planı 6,5–10,5 gündü. Bu turda görünüm katmanı, iki istemci, kapı ve ölçümler kapandı. Kalan Faz 1 işi (555 inceleme + `_ci` sabitlemesi + kapanış gate'i) için **1,5–2,5 iş günü**. Bu tahmin 555 alanın ortalama 2 dakikalık incelemesine dayanır; gerçek süre alan sayısına göre değişir.
