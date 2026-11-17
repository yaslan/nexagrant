# DATA_MODEL.md — Veri modeli

Kaynak: `prisma/schema.prisma` (bağlayıcı). Bu dosya niyeti ve ilişkileri açıklar.

## 1. Kiracılık

- `Tenant` (şirket/kurum) → `Workspace` (danışmanlıklar için müşteri başına; KOBİ'de tek) → iş kayıtları.
- `Membership(tenant, user, role, workspaceIds[])`; boş `workspaceIds` = tüm çalışma alanları.
- **Paylaşımlı (tenant-agnostik) tablolar:** `Programme, Call, Topic, TopicStat, Organization, Project, Participation, OrgTopicStat, Collab, ModuleCatalog, Plan, AddOnCatalog, Document(tenantId=null), RawFetch, SystemAlert`. RLS: herkese okuma, yalnızca sistem yazma.
- **Kiracıya özel:** geri kalan tümü; `tenantId` zorunlu, RLS `tenant_id = current_setting('app.tenant_id')`.
  Tek istisna sınıfı `tenantId String?` taşıyan tablolardır (`Document`, `Chunk`, `ConceptTemplate`,
  `AuditEvent`) — bkz. §1.1; onlar `tenant_or_shared` politikasını alır.
  ⚠️ `AuditEvent`'in bu sınıfta olması, onu bir idempotency anahtarı olarak kullanmayı
  imkânsız kılar: kiracısı olan bir satır, kiracı bağlamı dışında ne yazılabilir ne okunabilir.
  Stripe webhook'u bu yüzden ayrı bir tabloya taşındı — §17.
- ⚠️ **`SystemAlert` kiracı içeriği taşımaz.** Tabloda `tenantId` yoktur ve `prisma/rls.sql`
  içinde **hiçbir politikası yoktur** — buraya yazılan her şey kiracı yalıtımının dışındadır.
  Uyarılara başlık, gövde, e-posta, sayfa adresi veya `tenantId` yazılmaz; yalnızca
  RLS korumalı satıra bir kimlik referansı (ör. `feedbackId`) ve kapalı kümeli sınıflandırma
  alanları konur. Tek yazar: `src/lib/observability/system-alert.ts` (`recordAlert`), kimlik
  görünümlü anahtarları (`email`, `token`, `apiKey`, …) düşürür ve `redactedKeys` ile bildirir.
  Okuyucu: `/[locale]/admin/alerts` (yalnız platform-admin).
  İndeksler: `[createdAt]`, `[source, createdAt]`, `[resolvedAt, createdAt]`
  (`prisma/migrations/add-systemalert-console-indexes.sql`).

### 1.1 RLS politika sınıfları (TASK-MTU6HUB8FUHMG)

Her tablo üç sınıftan **birine** girer. Sınıf `scripts/rls-models.ts` içinde tanımlıdır ve iki
kapı da (statik `pnpm rls:check`, canlı `pnpm rls:verify`) aynı listeyi okur.

| Sınıf | Politika | `rls-models.ts` | Anlamı |
|---|---|---|---|
| Kiracıya özel | `tenant_isolation` (+ FORCE) | listede yok (varsayılan) | `tenantId` **zorunlu**; yalnız kendi kiracısı okur/yazar |
| Kiracısı olmayabilen | `tenant_or_shared` | `NULLABLE_TENANT` | `tenantId` **`String?`**; `NULL` satır herkese açık |
| Sistem tablosu | politika yok | `SYSTEM_WIDE` | tabloda `tenantId` **hiç yok** |

- ⚠️ `SYSTEM_WIDE` **iki kapıdan da muafiyettir.** Oraya konan bir tablo için kapı asla kırmızı
  yanmaz. Bu yüzden bir tablo oraya "kiracısı yok" olduğu için girer, "kapı sussun" diye değil.
  `ClaimEvidenceLink` ve `EvidenceReminder` bu listede duruyordu; ikisi de bir kiracının
  `Claim`/`Evidence` satırlarını birbirine bağlıyor, `EvidenceReminder.recipientEmails` ise
  o kiracının insanlarının e-posta adresi. İkisine de `tenantId String` eklendi
  (`prisma/migrations/add-evidence-link-tenant-id.sql`), `tenant_isolation` kapsamına alındı,
  `SYSTEM_WIDE`'dan çıkarıldı. RLS satırdaki **kolonu** okur; yabancı anahtarı takip edip
  `Evidence.tenantId`'ye gitmez — bu yüzden kolon tabloda bulunmak zorundadır.
- ⚠️ **`tenantId` `String?` ise `tenant_isolation` YANLIŞ politikadır.** SQL'de `NULL = 'x'`
  sonucu `true` değil `NULL`'dur, yani `tenantId`'si boş satır ne `USING` ne `WITH CHECK`
  koşulunu geçer: yazılamaz ve okunamaz, üstelik sessizce. `AuditEvent.tenantId` `String?` olduğu
  hâlde sıkı politikadaydı; `src/actions/user/request-deletion.ts` hiçbir kiracıya üye olmayan bir
  kullanıcının KVKK/GDPR silme talebi için tam da böyle bir satır yazıyor, o iz kayboluyordu.
  `AuditEvent` artık `Document`/`Chunk`/`ConceptTemplate` ile aynı `tenant_or_shared` desenini
  kullanıyor (`prisma/migrations/auditevent-tenant-or-shared.sql`); `tenantId` **dolu** satırlar
  için hiçbir gevşeme yok, yalnız boş olanlar yaşayabiliyor. Tablo, sıkı döngüden çıkarken
  kaybettiği `FORCE ROW LEVEL SECURITY`'yi ayrı bir satırla koruyor.
- Sınırlar `tests/rls-coverage.test.ts` ile bağlanmıştır: `SYSTEM_WIDE` üyesi hiçbir modelde
  `tenantId` olamaz, `NULLABLE_TENANT` üyesinin `tenantId`'si `String?` olmak zorundadır.

## 2. Ana akış (K5)

```
Topic ──(TopicMatch: K1 fitScore, tenant×topic)──▶ Opportunity(stage G0..G4, intendedRole)
   Opportunity ──(TopicMatch: g0Score + breakdown, fırsat başına)──▶ kanıt kaydı
   Opportunity ──▶ GateDecision[] (her kapı; inputs JSON; ruleVersion)
   Opportunity ──▶ ConsortiumSeat[] (roleKey; organizationId | partnerOrgId; status)
                       └─▶ SeatCandidate[] (M8 puanları)
   Opportunity ──▶ ConceptNote[] (M2) ──▶ Proposal (1:1; esrScores; outcome)
   Opportunity ──▶ Effort[] (kişi-saat)
```

Durumlar: `Opportunity.stage` yalnızca `GateDecision(passed=true)` ile ilerler; geri alma yönetici yetkisiyle ve olay kaydıyla.

**G0 ↔ ESR kalibrasyonu (E11.3).** Kalibrasyon için ayrı bir tablo yok; mevcut zincir yeniden
kullanılıyor: her örnek bir `Opportunity` (`g0Score` = bileşik skor), bir `Proposal`
(`esrScores` = `{total, threshold, outcome, labelSource}`, `outcome` = gerçek etiket) ve bir
`GateDecision` (`gate=G0`, `passed` = tahmin, `inputs` = yedi özellik + ağırlıklar + gerekçeler,
`ruleVersion='g0-canonical-1.0'`). Tüm satırlar `tenantId='esr-calibration'` iç kiracısında durur, bu
yüzden bir tasarım ortağının hattında ya da KPI panosunda **görünmez**. Üretici:
`pnpm beta:esr-calibration --apply`; geri alma `pnpm beta:esr-calibration:rollback --apply`.

## 3. Ortak istihbaratı (K2/M1/M4)

- `Organization` (PIC) paylaşımlı; `OrgTopicStat(organizationId, topicPrefix)` konu öneki bazlı liderlik; `Collab(orgA, orgB)` iş birliği grafı (orgA < orgB normalize).
- Kiracıya özel katman: `Relationship` (odak kişi, sıcaklık, sonraki adım) + `Interaction` + `PartnerOrg` (CORDIS'te olmayanlar).
- "Ortak kartı" görünümü = `Organization ⨝ OrgTopicStat ⨝ Relationship(tenant)`.

## 4. Kanıt (M3) ve YZ (K6)

- `Evidence` kiracıya özel; `sourceUrl` zorunlu (kind=stat için). `validUntil` geçince UI uyarısı.
- `Document/Chunk` RAG deposu; kamusal belgeler paylaşımlı, yüklemeler kiracıya özel. `Chunk.embedding` pgvector(1536).
- `AiUsageLog` her çağrı; `CreditLedger` bakiye = SUM(delta). Kredi düşümü ve log aynı transaction'da.

## 5. Modül ve yetkilendirme

- `ModuleCatalog` manifestlerden seed; `ModuleState(tenant, module) ∈ {OFF, DEV, PILOT, ON}`.
- `Plan` → varsayılan `modules[]`, koltuk, çalışma alanı, kredi; `AddOn(sku)` → `AddOnCatalog.grantsModule|grantsSeats|grantsCredits|grantsWorkspaces`.
- `Plan` **elle yazılmaz**: `src/lib/billing/catalog.ts`'in izdüşümüdür (`free`, `basic`, `pro`, `ultra`; USD liste fiyatı) ve `prisma/seed.ts` §2 tarafından yazılır. EUR merdiveni (`starter/team/business/enterprise`) `prisma/migrations/retire-eur-plan-ladder.sql` ile emekliye ayrıldı — eşleme tablosu ve gerekçesi `docs/BILLING.md` §9. `Subscription.planId`'de yabancı anahtar **yoktur**; emekli bir id ile karşılaşan kod `resolvePlanId()` ile karşılığına çevirir.
- Etkin kapsam (`entitlements(tenant)`) = plan + aktif eklentiler + `ModuleState.grandfathered` satırları; `canEnable` bunu ve bağımlılıkları kontrol eder.
- `ModuleState.grandfathered Boolean @default(false)` — FO-41 (TASK-MVC4JRKUKYPLU). `true` olan satırın modülü, plan ne derse desin kiracıya **tam** açık kalır (`getEntitlements` `allowedModules`'e ekler, `moduleLimits`'ten siler). Neden: F3 paketlemesinde M3 Discover'dan Basic'e taşındı; Discover'da M3'ü açık kiracılar ORPHANED'a düşmesin. Yalnız migration yazar (`prisma/migrations/module-state-grandfathered.sql`, tek seferlik backfill: `moduleId='M3' AND status<>'OFF'` ve `free` dışı canlı aboneliği olmayan kiracı); `BEFORE INSERT/UPDATE` trigger'ı tablo sahibi olmayan rolün (fabrika_app) `true` yazmasını reddeder, `true → false` serbesttir. RLS: tablonun mevcut `tenant_isolation` + `system_scope` politikaları. Geri alma: `.down.sql` (bayrak listesi kaybolur, önce `SELECT` ile saklayın).
- Plan modül sınırı (`PlanGrant.moduleLimits`, kodda; tablo değil): Discover, Basic ve TTO Edition M1'i sınırlı verir (`partnerSearchPerMonth: 10`, `readOnly: true`). Aylık arama sayacı `PartnerSearchQuotaUsage(tenantId, month 'YYYY-MM' UTC, count)` tablosundadır.

### 5.1 Katılım fiyatı kilidi (`Subscription.locked*`) — TASK-MTR882HVZ8BG7

Fiyat sayfası iki katalogda da **"Katıldığınız fiyat sabit kalır"** diyor. Bunu
karşılayan hiçbir kayıt yoktu: `Subscription` yalnızca plan/durum/dönem tutuyordu,
her fiyat `getActiveTier()`'dan (o an açık kampanya) hesaplanıyordu. Ölçüm: ILK5
altında Pro aylık $26.10 ile katılan kiracı, kampanya kapandığında aynı plan için
$87.00 görüyordu (3,33×).

| Sütun | Tip | Anlamı |
|---|---|---|
| `lockedTierCode` | `String?` | Oranın geldiği kampanya (ör. `ILK5`) — köken bilgisi, fiyat otoritesi değil |
| `lockedPercentOff` | `Int?` | Yenilemede ve bu kiracının her yeni satırında uygulanan oran |
| `lockedAmountMinor` | `Int?` | O oranla bir dönemin gerçekte kaça mal olduğu (minor unit, kural 9) |
| `lockedCurrency` | `String?` | `lockedAmountMinor`'ın para birimi |
| `priceLockedAt` | `DateTime?` | Kilidin yazıldığı an |

- **Beşi birlikte** ya doludur ya boştur; `Subscription_price_lock_complete`
  CHECK kısıtı yarım yazılmış bir kilidi veritabanı seviyesinde reddeder
  (`lockedPercentOff` 0–100, `lockedAmountMinor` ≥ 0 da orada doğrulanır).
- **Hepsi NULL** = kilit yokken satılmış abonelik; vitrin kademesiyle
  fiyatlanmaya devam eder. Ne sattığımız kayıtlı olmadığı için bugünkü kampanyayı
  üstüne damgalamak müşterinin oranını sessizce **yükseltebilirdi**.
- Kural tek yerde: `src/lib/billing/price-lock.ts` (saf, birim testli).
  Yazma yolları: `subscription-sync.ts` (Stripe) ve `iyzico.ts`. Okuma yolları:
  `settings/billing/page.tsx` ve `POST /api/billing/checkout`.
- **Neden ayrı tablo değil:** `Subscription` kiracı başına tek satırdır
  (`tenantId` birincil anahtar) ve kilit o tek canlı sözleşmenin bir özelliğidir,
  bir olay akışı değil. Ayrı tablo "hangi satır güncel" kuralını gerektirir ve o
  kural tarif ettiği abonelik satırıyla çelişebilir; bir sütun kendisiyle
  çelişemez. Tarihçe kaybolmuyor: `AuditEvent` her abonelik yazımını kaydediyor
  ve artık kilidi de payload'ında taşıyor.
- **RLS:** yeni tablo yok, `Subscription` zaten `tenant_isolation` listesinde;
  39/39 değişmedi.

Migration: `prisma/migrations/add-subscription-price-lock.sql` (additive +
idempotent) — geri alma: `add-subscription-price-lock.down.sql` (**yıkıcı**:
sütunları düşürmek her abonenin katılım oranını siler ve geri hesaplanamaz).

## 6. İndeks ve performans notları

- `Topic(nextDeadlineAt)`, `TopicMatch(tenantId, g0Score)`, `TopicMatch(tenantId, opportunityId)` (pano rozetinin toplu okuması), `OrgTopicStat(topicPrefix, coordinatorCount)`, `Relationship(tenantId, lastContactAt)`.
- Embedding sorguları için `CREATE INDEX ... USING hnsw (embedding vector_cosine_ops)` (migration'da ham SQL).
- CORDIS yükleme: worker Parquet → `COPY` ile geçici tabloya → upsert; ORM ile satır satır değil.

## 7. Silme ve saklama

- Kiracı silme: `Tenant` cascade; paylaşımlı veriye dokunmaz. O kiracının `AuditEvent` satırları da cascade ile silinir (`AuditEvent.tenant` `onDelete: Cascade`); `tenantId` boş satırlar kalır.
- `AuditEvent` saklaması: süre sınırı ve budama işi **yok**, satırlar kalıcıdır. Hesap silindiğinde `docs/legal/processing-register.md` §13'teki mekanizma uygulanır: `purgeDueUsers` `actorId`'yi NULL'lar, `user.erased` satırı kimlik yerine tek yönlü özet (`subjectRefOf`, `src/lib/legal/subject-ref.ts`) taşır; serbest `data` JSON'u değiştirilmez. Süreli saklama/budama istenirse ayrı karar ve iş gerekir.
- `RawFetch` 90 gün; `AiUsageLog` 24 ay (şeffaflık beyanı için).
- `RawFetch` yalnızca **içerik değiştiğinde** yazılır (`hash` karşılaştırması). Aynı yükü her gece yeniden saklamak tabloyu günde ~1200 satır büyütür, denetim değeri katmaz.
- `Topic.eligibility` (Json) şekli: `{ restricted: "EU_EEA_CH_ONLY" | "TR" | null, eligibleCountries: string[], countriesExcluded: string[], notes?: string, minPartners?: number, minCountries?: number }`. `eligibleCountries` boş dizi = tespit edilmiş kısıt yok. **NG-52:** `minPartners`/`minCountries` çağrının asgari konsorsiyumudur (şartname §4 "asgari ortak"); SEDIA bağdaştırıcısı `conditions` metninden `parseMinimumConsortium` ile okur, metin söylemiyorsa anahtar **yazılmaz** (varsayılan sayı yok). M8 asgari ortak ön filtresi (`src/modules/m8/server/minimum-partners.ts`, şartname §6) bu iki anahtarı okur. Additive JSON anahtarı: migration yok; eski satırlarda anahtar yok = eşik bilinmiyor = filtre yok.
- `Call.openDate` K1 günlük işi tarafından SEDIA `plannedOpeningDate`/`startDate` alanından doldurulur. Çağrının yaşı (`ageInDays`) **saklanmaz**, bu alandan türetilir.

### 7.1 Yumuşak silme (soft delete) — KVKK md.7/md.11 · GDPR md.17

Migration: `prisma/migrations/add-soft-delete.sql` (additive + idempotent) · geri alma: `add-soft-delete.down.sql`.

- `User`: `deletionRequestedAt`, `deletedAt`, `deletionReason`.
- `Tenant`, `Workspace`, `Opportunity`, `Proposal`, `GateDecision`, `Effort`: `deletedAt`, `deletionReason`.
- `deletedAt IS NULL` = canlı kayıt. Silme talebi kaydı **yok etmez**: hesabı hemen erişime kapatır ve 30 günlük itiraz süresi başlatır; kullanıcı bu sürede iptal edebilir (`cancelAccountDeletion`).
- Geri dönüşü olmayan silme tek bir yerde: `usersScheduledDeletion` işi (günlük 03:00 UTC) → `purgeDueUsers()`. Her silme için `AuditEvent(type='user.erased')` yazılır; özne, silinen kimliği geri üretmemek için `sha256(userId)` ile referanslanır.
- `deletionReason` değerleri: `subject_request` (kullanıcı talebi) · `policy` · `tenant_cascade`.
- Yeni sütunlar mevcut satır-seviyesi politikaları değiştirmez: `prisma/rls.sql` politikaları `tenantId` üzerinden satır bazlı çalışır, sütun eklemek kapsamı etkilemez.

#### 7.1.1 FK'siz `User.id` sütunları — imhada koparılan vs. saklanan

`DELETE FROM "User"` yabancı anahtarı olmayan sütunlara ulaşamaz; bu yüzden `purgeDueUsers()`
her birini **elle** adlandırır. Kural: özneye ait satır silinir, kiracıya ait satır kalır ve
yalnız kişiye giden bağ koparılır.

| Sütun | İmhada | Gerekçe |
|---|---|---|
| `CalendarConnection.userId`, `SavedSearch.userId` | satır silinir | özneye ait veri |
| `Effort.userId` | satır silinir | özneye ait veri |
| `AiUsageLog.userId`, `AuditEvent.actorId`, `Opportunity.ownerId`, `Feedback.userId`, `ProposalUsage.usedByUserId` | `NULL` | kayıt kiracının; yalnız bağ kopar |
| `Relationship.ownerUserId` | `NULL` | **aşağıya bakınız** |
| `DualApprovalStep.actorUserId` (+ `actorName`) | **saklanır** | imza kaydı; `@@unique([followupDocId, actorUserId])` buna dayanır. Saklama `docs/legal/processing-register.md` §12'de **adıyla** beyan edilir |
| `Consent.userId` | **saklanır** | aydınlatma/onay kaydı; bkz. §15. Bağı koparmak kaydın var olma sebebini yok eder — "birine gösterildi" ispatı, kimin olduğu silinince ispat olmaktan çıkar. Aynı dayanak: KVKK md.5/2-e / GDPR md.17(3)(e) |

**`Relationship.ownerUserId` — 2026-09-08 kararı (A4, Seçenek C).** Migration:
`prisma/migrations/relationship-owner-nullable.sql` · geri alma:
`relationship-owner-nullable.down.sql` (NULL satır varsa Postgres reddeder — dosyanın başındaki
uyarıya bakın).

- Sütun `String` → `String?`. `NULL` = **atanmamış** ("yeni odak kişi gerekiyor"); imhadan sonra
  ilişki bu duruma düşer.
- Neden koparılıyor: bu bir **iş ataması**, kayıt değil. Üzerinde hiçbir bütünlük kuralı yok
  (tek yapı `@@index([tenantId, ownerUserId])`) ve dış taraf ayrı sütunlarda
  (`counterpartName`, `counterpartEmail`) durduğu için kişi erişildiğinde saklanmasının
  hukuki dayanağı yok. `DualApprovalStep` ile aynı vaka değildir; ikisi ayrı karara bağlandı.
- İlişki satırı **silinmez**: kiracının ortak kaydıdır, dış taraf bilgisiyle birlikte kalır.
- Etkilenen tüketici: `m4WeeklySummary` sahipsiz satırları gruplamaz (bildirilecek kimse yok),
  `unassignedCount` olarak sayar.

### 7.2 Fırsat arşivleme (üründen giriş noktası)

`Opportunity.deletedAt` uzun süre yalnız şemada durdu; üründe onu yazan bir yol yoktu, yani bir fırsat ancak SQL'den siliniyordu. Arşivleme akışı bu boşluğu kapatır:

- Eylem: `archiveOpportunity` (`src/app/[locale]/(app)/[workspace]/pipeline/actions.ts`). `withTenant` içinde çalışır; filtre hem `id` hem `tenantId` taşır, `deletedAt: null` da filtrenin parçasıdır (iki kez arşivlemek ilk damgayı ezmez).
- Yetki: `src/lib/pipeline/archive.ts` — `TENANT_OWNER` · `TENANT_ADMIN` · `PIPELINE_MANAGER` her kaydı, diğer roller yalnız `ownerId`'si kendilerine ait kaydı arşivler. Sahipsiz kayıt (`ownerId = null`) yalnız bu üç role açıktır.
- İz: aynı işlem içinde `AuditEvent(type='opportunity.archived', target=<opportunityId>)`; `deletionReason = 'archived_by_user'`.
- Görünürlük: `deletedAt` dolu kayıt panodan, listelerden, KPI'lardan, panel CSV'sinden, `/api/v1/opportunities` yanıtından ve G0 puanlayıcıdan düşer; detay sayfası 404 verir. Kayıt, kapı kararları ve efor satırları veritabanında kalır.
- **Geri alma üründe yok.** Arşivden çıkarma yalnız veritabanından `deletedAt = NULL` ile yapılabilir; ürün içi geri alma açık bir iş kalemidir.

## 8. v1.1+ tablolar (şemada yorum olarak)

`Evaluation` (M6), `MeetingBrief` (M9), `FollowupDoc` (M10), `ApplicationPart` (M11), `TtoPortfolioItem` (M7), `ApiKey`. (Pazar yeri tabloları kaldırıldı — ADR-0005, `prisma/migrations/drop-marketplace.sql`.)

`ApiKey` hız sınırı (TASK-MUN80XIW5NPV1): `rateWindowStartedAt` + `rateWindowCount` anahtar başına sabit 1 dakikalık pencereyi tutar; `src/lib/api-auth.ts` her `/api/v1` isteğinde tek `UPDATE … RETURNING` ile sayar ve `API_KEY_RATE_LIMIT_PER_MINUTE` (1.000, `src/lib/api-rate-limit.ts`) aşılınca 429 + `Retry-After` döner. Migration: `prisma/migrations/add-api-key-rate-window.sql`.

### 8.1 M6 Evaluator Lens — değerlendirme paneli

`Evaluation` tek tablo, iki şekil taşır; ayrım `readerType` alanındadır:

| readerType | Bağlam | Kullanan alanlar |
|---|---|---|
| `HUMAN` \| `AI` | v1.0 tek-okuyucu merceği, `Opportunity` üzerinde | `excellence`, `impact`, `implementation`, `weaknesses`, `calibration` |
| `PANEL` | v1.1 çok-değerlendiricili panel, `Proposal` üzerinde | `proposalId`, `status`, `avgScore` + `Reviewer` / `Criterion` / `Score` |

v1.1 sütunlarının tümü nullable ya da varsayılanlıdır; mevcut v1.0 satırları ve
`src/modules/m6/server/actions.ts` çağrıları etkilenmez.

- `Reviewer` — panele atanmış değerlendirici. `role`: `evaluator | coordinator`, `status`: `pending | completed`.
  `@@unique([evaluationId, userId])` bir kullanıcının aynı panele iki kez atanmasını engeller.
- `Criterion` — ağırlıklı puanlama ekseni (`Innovation | Feasibility | Impact | Communication`).
  `weight` 0..1 (DB CHECK), bir panelde toplamı 1.0 olmalıdır. `@@unique([evaluationId, name])`.
- `Score` — bir değerlendiricinin bir kriter için verdiği not. `score` 1..5 (DB CHECK `Score_score_check`;
  Prisma CHECK üretemediği için migration dosyasında tanımlıdır). `submittedAt` taslak aşamasında `null`.
  `@@unique([reviewerId, criterionId])` çift puanlamayı engeller.

Dördü de kiracıya özeldir (`tenantId` + `tenant_isolation` RLS politikası).
`Evaluation` silinince `Reviewer`/`Criterion`, `Reviewer` veya `Criterion` silinince `Score` cascade ile silinir.

Migration: `prisma/migrations/add-m6-evaluator-lens.sql` (idempotent, additive) —
geri alma: `prisma/migrations/add-m6-evaluator-lens.down.sql` (yıkıcı, açık onay ister).
TypeScript sözleşmeleri: `src/modules/m6/types.ts`.

### 8.2 M9 Takvim Entegrasyonu — Google Calendar & Outlook Senkronizasyonu

`CalendarConnection` — kiracıya özel takvim sağlayıcısı bağlantıları.

| Alan | Not |
|---|---|
| `tenantId`, `userId`, `provider` | Composite unique key: bir kullanıcı, kiracı başına bir sağlayıcı (google, outlook, ics). |
| `externalId` | Sağlayıcı tarafı ID (Google: calendar ID; Outlook: mailbox addresi). |
| `accessToken`, `refreshToken` | OAuth tokenleri. `CALENDAR_ENCRYPTION_KEY` env değişkeni ile AES-256-GCM algoritması üzerinden şifrelenir (`src/lib/calendar/encryption.ts`, `saveCalendarConnectionTokens`). Çıktı `fkenc1:<iv_hex>:<tag_hex>:<cipher_hex>` zarf formatındadır. Düz metin token yazılması `src/lib/db.ts`'teki Prisma extension (`withCalendarTokenGate`) tarafından engellenir. Anahtar yokluğunda 503 (`CalendarEncryptionNotConfiguredError`) fırlatılır. |
| `tokenExpiresAt` | Token refresh gerekli mi kontrolü. |
| `isConnected`, `lastSyncAt` | Bağlantı durumu ve son senkronizasyon. |

Kiracıya özeldir (`tenantId` + `tenant_isolation` RLS politikası).

**Senkronizasyon:** `MeetingBrief` oluşturulup/güncellenirken, eğer `meetingScheduledAt` belirlenmişse,
`syncMeetingBriefToCalendar()` (`src/lib/calendar/sync.ts`) kiracı kullanıcısının tüm etkin takvim
bağlantılarına olayı kopyalar. Hata (OAuth token geçerliliği vs.) `SystemAlert` üretiyor, iş kırılmıyor.

**Fırsat bağlantısı (TASK-MULQLQIE3ES6G, ROADMAP Açık karar #14):** `MeetingBrief.opportunityId`
nullable, `Opportunity(id)`'ye FK, `ON DELETE SET NULL` (brief kullanıcının kendi metni; fırsat
fiziksel silinse de kalır, bağlantısız görünür) + `@@index([tenantId, opportunityId])`.
`/opportunities/[id]/briefs` yalnız o fırsatın brief'lerini ve ayrı başlık altında kiracının
**fırsata bağlı olmayan** brief'lerini listeler (`listBriefsForOpportunity`,
`src/modules/m9/server/brief-lists.ts`); diğer fırsatların brief'leri okunmaz. Kolondan önce yazılmış
satırlar NULL kaldı — hangi fırsat için yazıldıkları kayıtlı değildi, tahminle bağlanmadı. FK kiracıyı
denetlemez (kısıt denetimi RLS'i atlar); `generateMeetingBrief` başka kiracının fırsat id'sini LLM
çağrısından önce reddeder. RLS değişmedi (`MeetingBrief` zaten `tenant_isolation` listesinde).
Migration: `prisma/migrations/add-meeting-brief-opportunity.sql` (additive, idempotent) — geri alma:
`add-meeting-brief-opportunity.down.sql`.

**Sağlayıcı mimarisi:** `CalendarProvider` arayüzü (`src/lib/calendar/provider.ts`) — connect/disconnect/createEvent/updateEvent/deleteEvent.
Uygulamalar: `IcsProvider` (mevcut generateIcsContent'i wrap), `GoogleCalendarProvider` ve `OutlookCalendarProvider` (mock; OAuth env anahtarları olmadığında).

**Migration:** `prisma/migrations/add-calendar-connections/migration.sql` (idempotent, additive) — 
migration reset gerekiyor (Prisma güvenlik onayı: kullanıcı `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION`'ı
onaylamalı).

### 8.3 M10 Çift Onay — kalıcı onay adımları (TASK-MTSAIWF4ENUSL)

Akışın ara adımları uzun süre yalnız React state'inde yaşadı: finans onayı veriliyor, sayfa
yenileniyor, onay kayboluyordu. Kalıcı olan tek olgu `FollowupDoc.signedAt` idi — yani banner'ın
2. ve 3. aşaması, imzalanıp konsorsiyuma gidecek bir doküman hakkında bellekte tutulan bir
iddiaydı. İki parça kalıcı hale getirildi:

**1. Akışı açan gönderim — `FollowupDoc` üzerinde (yeni sütunlar):**

| Alan | Not |
|---|---|
| `approvalSubmittedAt` | Doküman akışa alındığı an. `null` = akışta değil (banner "boşta"). |
| `approvalSubmittedById` | Akışa alan oturumun kullanıcı id'si — kaydı atfedilebilir kılan alan. |
| `approvalSubmittedByName` | Görünen adın o andaki **anlık görüntüsü**; kullanıcı adını sonradan değiştirse de onay kaydı okunabilir kalır. |

**2. Departman onayları — `DualApprovalStep` (yeni tablo, kiracıya özel):**

| Alan | Not |
|---|---|
| `tenantId` | `tenant_isolation` RLS politikası (prisma/rls.sql + migration içinde de bildirilir). |
| `followupDocId` | `FollowupDoc`'a FK, `onDelete: Cascade`. |
| `department` | `FINANCE` \| `LEGAL`. |
| `actorUserId`, `actorName` | Onayı veren oturum. **FK değildir**: onay bir imzadır, onu üreten kullanıcı satırındaki değişikliği aşmalıdır. |
| `note`, `decidedAt` | Onay notu ve zamanı; onay kaydı satırı bu ikisiyle tamamlanır. |

Çift onayın iki kuralı **uygulama kontrolü değil, unique index**:

- `@@unique([followupDocId, department])` — bir departman bir dokümanı bir kez onaylar.
- `@@unique([followupDocId, actorUserId])` — bir kişi aynı dokümanda en fazla bir departmanı onaylar.
  "Dual"ın iki tık değil iki kişi anlamına gelmesini sağlayan index budur. Gönderim bir sign-off
  değildir, dolayısıyla akışı açan kişi bir departmanı hâlâ onaylayabilir (iki kişilik akış).

Uygulama tarafında aynı kurallar `refusalForDepartmentApproval()` (`src/lib/dual-approval.ts`) ile
okunabilir bir gerekçeye çevrilir; ekrandaki aşama `deriveDualApprovalState()` ile satırlardan
türetilir — yani yanan bir aşama, karşılığında bir satır olduğu anlamına gelir. Hukuk adımı akışı
tamamlar ve imza (`signedAt`) **aynı işlem içinde** yazılır: 4. aşamanın yandığı ama dokümanın
imzasız olduğu bir aralık yoktur. Yeni revizyon (`createNewVersion`) devraldığı onayları siler —
başka bir metne verilmiş onay yeni sürümü imzalamaz.

**Neden `ApprovalRequest` genişletilmedi:** o tablo tek onaylayanlı (`approverId`, `requiredRole`,
`expiresAt`, `executedAt`) genel bir maker-checker isteği modeller; iki departmanın ayrı ayrı
imzaladığı bir akış oraya kardinalite olarak sığmaz (yine de bir alt tablo gerekirdi). Ayrıca
`/approvals` ekranı o tablonun tüm satırlarını listeler ve Onayla/Reddet düğmeleri hiçbir şey
yazmayan stub aksiyonlara bağlıdır — M10 satırlarını oraya koymak, çalışmayan düğmelerin altına
gerçek dokümanlar sermek olurdu.

**Migration:** `prisma/migrations/add-m10-dual-approval-persistence/migration.sql` (idempotent,
additive) — geri alma: aynı klasörde `down.sql` (yıkıcı, açık onay ister).

---

## 9. Beta geri bildirimi (E11.2)

`Feedback` — beta tasarım ortaklarının uygulama içinden gönderdiği kayıtlar. Kiracıya özeldir
(`tenantId` + `tenant_isolation` RLS politikası); triyaj panelini yalnız platform yöneticisi
görür ve o okuma bilinçli olarak kiracılar arasıdır (rota admin layout'unda, her server action
kendi içinde ayrıca rol kontrolü yapar).

| Alan | Not |
|---|---|
| `category` | `BUG · FEATURE_REQUEST · UX · PERFORMANCE · DATA_QUALITY · OTHER` |
| `impact` | Bildirenin beyanı: `BLOCKER · MAJOR · MINOR · IDEA` |
| `priority` | Yürürlükteki öncelik (`P0…P3`). Triyajda elle değiştirilebilir. |
| `autoPriority` | Kural motorunun ilk kararı. **Elle değiştirilse de korunur** — ikisi arasındaki fark, kuralların ne kadar isabetli olduğunun ölçüsüdür. |
| `triageReason` | Hangi kuralın çalıştığı (`impact:BLOCKER`, `keyword:data-loss`, `…>capped:UX`). Kararın denetlenebilirliği. |
| `status` | `NEW · TRIAGED · IN_PROGRESS · RESOLVED · WONT_FIX` |
| `screenshotKey` | R2 nesne anahtarı — **hiçbir zaman açık URL değil**; indirme bağlantısı istendiğinde imzalanır. R2 yapılandırılmamışsa `null` kalır **ve görsel kaybolur**: bildiren kişiye gönderim ekranında söylenir, ayrıca `beta-feedback-screenshot` kaynaklı bir `SystemAlert` yazılır. |
| `alertStatus` / `alertId` | `recorded · failed` (`legacy` = SystemAlert kanalından önceki kayıt). `alertId` → `SystemAlert.id`. Uyarı bir yükselticidir, doğruluk kaynağı satırın kendisidir. |
| `triagedById` / `triagedAt` / `triageNote` | Kimin, ne zaman, hangi gerekçeyle karar verdiği. |

Yazma sırası kasıtlıdır: **önce satır** (triyaj saf fonksiyon, başarısız olamaz), sonra ekran
görüntüsü, sonra `SystemAlert`. Son iki adım "en iyi çaba"dır ve gönderimi düşürmez —
R2 kesintisinde ya da uyarı yazılamadığında ortağın bildirimi yine de kaydedilir
(`src/lib/feedback/submit.ts`). Sonucun satıra damgalanması da (`alertStatus`/`alertId`)
kırılmaz: kayıt zaten kalıcıdır, damga başarısız olursa kullanıcıya hata gösterilmez.

Dış hata izleme servisi **kullanılmaz** (patron kararı, TASK-MTQUN8VV6DK8C): veri
dağıtımdan çıkmaz. Yükseltme kanalı `SystemAlert` tablosu ve `/[locale]/admin/alerts`
konsoludur.

İndeksler: `[tenantId, createdAt]` (kiracı listesi), `[tenantId, status, priority]` (açık
kayıtlar), `[priority, status]` ve `[createdAt]` (platform geneli triyaj panosu ve haftalık özet).

Öncelik kuralları ve yanıt süresi bütçeleri: `src/lib/feedback/triage.ts` —
`PRIORITY_SLA_HOURS` sabiti `docs/BETA_GUIDE.md § 5` tablosunu izler, ikisi birlikte değişir.

Migration: `prisma/migrations/add-feedback.sql` (idempotent, additive; RLS politikasını da
kurar) — geri alma: `prisma/migrations/add-feedback.down.sql` (yıkıcı: tabloyu ve içindeki tüm
bildirimleri siler, önce dışa aktarın). Sütun adları
`prisma/migrations/rename-feedback-alert-columns.sql` ile nötr adlara taşındı; eski dış izleyici
kimlikleri silinmeden tek bir `SystemAlert` satırına (`source = 'feedback-migration'`)
arşivlendi, geri alma bunu geri oynatır (kayıpsız).

## 10. Ömür boyu lisans (TASK-MTR962OV5YGVX)

`LifetimeLicence` — "ilk 20 firma" kampanyasında satılan tek seferlik ömür boyu lisansın
kaydı. Kiracıya özeldir (`tenantId` + `tenant_isolation` RLS politikası). Bu tablo eklenmeden
önce satış **hiçbir yere yazılmıyordu**: Stripe webhook'u `checkout.session.completed` olayında
yalnız `session.subscription` doluysa iş yapıyor, tek seferlik `lifetime-ultra` ödemesi
tahsil edilip unutuluyordu. Fiyat sayfasındaki "5 lisans sahibi · Sıradaki lisans #6"
rozeti de bu yüzden mesaj kataloğuna elle yazılmış bir cümleydi — CLAUDE.md kural 7 ihlali.
Rozet artık bu satırları sayar.

| Alan | Not |
|---|---|
| `seq` | Sınırlı serideki sırası (1'den başlar). Rozet `seq+1`'i "sıradaki lisans" olarak gösterir. **Benzersiz** — iki lisans aynı sırayı iddia edemez. |
| `sku` | `lifetime-ultra` (`src/lib/billing/catalog.ts`). |
| `amountMinor` / `currency` | Gerçekten tahsil edilen tutar, minor unit (CLAUDE.md kural 9). Liste fiyatı değil: hangi kampanyada satıldığı kaydın parçası. |
| `providerEventId` | **Benzersiz** — bir Stripe olayı en fazla bir lisans yazar. Aynı olay yeniden gönderilirse ikinci satır oluşmaz. |
| `providerSessionId` | **Benzersiz** — aynı checkout oturumu *yeni bir olay kimliğiyle* gelse de ikinci satır oluşmaz. |
| `purchasedAt` | Stripe oturumunun oluşturulma zamanı (UTC). |

Üst sınır (20) veri sabitidir: `LIFETIME_LICENCE_CAP`, `src/lib/billing/catalog.ts`.
Türetme `src/lib/billing/lifetime-licence.ts` içindeki saf `lifetimeScarcity()` fonksiyonunda
ve dört durumu var — `unknown` (sayı okunamadı), `none` (0 sahip), `available` (N sahip,
sıradaki N+1), `sold-out` (N ≥ 20). `unknown` bilinçli olarak ayrı bir durumdur: sayım
okunamadığında rozet **hiçbir sayı iddia etmez**, sessizce sıfıra düşmez — yanlış bir sıfır da
en az uydurma bir beş kadar yanlıştır.

**Genel sayım ve RLS.** Fiyat sayfası herkese açıktır, yani hiçbir kiracının içinde değildir;
`tenant_isolation` altında sıfır satır okur ve "henüz sahip yok" derdi (ölçüldü: `fabrika_app`
rolüyle doğrudan `SELECT` = 0, gerçek satır sayısı 20). Bu yüzden sayım
`public.lifetime_licence_count()` üzerinden alınır — `prisma/rls.sql`'de tanımlı, `SECURITY
DEFINER`, argümansız, **yalnız bir tamsayı** döndüren fonksiyon: satır dönmediği için hiçbir
kiracı bu yoldan görünmez. Fonksiyon yoksa sayım `null` olur ve rozet `unknown` durumuna düşer.

Seed **yoktur ve olmamalıdır**: seed'lenmiş bir lisans, seed'lenmiş bir satıştır — rozet yine
kimsenin ödemediği sahipleri duyurmaya başlar (`prisma/seed.ts` §2 sonundaki not).

Migration: `prisma/migrations/add-lifetime-licence.sql` (additive + idempotent; tabloyu,
benzersizlik indekslerini, RLS politikasını ve sayaç fonksiyonunu kurar — iki kez koşuldu,
ikincisi no-op) — geri alma: `prisma/migrations/add-lifetime-licence.down.sql` (yıkıcı:
tabloyu ve tüm lisans kayıtlarını siler; ödeme Stripe'ta kalır, bu veritabanında hiçbir iz
kalmaz — önce dışa aktarın).

**Açık:** `src/app/[locale]/(app)/[workspace]/settings/billing/BillingClient.tsx` içindeki
aynı rozet (`billingPanels.settings.lifetimeOwners` / `lifetimeNext`) hâlâ elle yazılmış
"5 lisans sahibi" metnini gösteriyor; bu görevin dosya kapsamı dışındaydı, ayrı kart gerekiyor.

## 11. Fatura (TASK-MTRD9QBJ2G32E)

`Invoice` — bir kiracıya gerçekten kesilmiş faturanın kaydı. Kiracıya özeldir
(`tenantId` + `tenant_isolation` RLS politikası; `pnpm rls:verify` ile canlı ölçüldü).

Bu tablo eklenmeden önce fatura **hiçbir yerde tutulmuyordu**, ama
`GET /api/billing/invoices/[id]/export` yine de bir Türk e-Faturası **üretiyordu**: ETTN,
tedarikçi VKN'si, vergi dairesi, `isEfaturaUser: true` ve iki kalem, rota dosyasına gömülü
sabitlerdi. Rota oturum aramıyordu ve id'ye bakmıyordu — herhangi bir id ile, oturumsuz,
`200` ve indirilebilir XML/PDF/HTML dönüyordu; belgenin altında "mali mühür ile
onaylanmıştır" yazıyordu. Belgenin anlattığı fatura hiçbir yerde yoktu.

| Alan | Not |
|---|---|
| `number` | Müşterinin gördüğü ve andığı numara. **Kiracı içinde benzersiz**, global değil: iki kiracıya farklı kesenlerden aynı seri gelebilir. |
| `issuedAt` | Düzenleme anı, UTC (CLAUDE.md kural 10). |
| `buyerName` / `buyerVknTckn` / `buyerTaxOffice` / `buyerAddress` / `buyerCity` / `buyerCountry` | Alıcının mali kimliğinin **kesim anındaki fotoğrafı**. Bilerek `Tenant`'a join değil: fatura, kiracı adını değiştirdikten sonra da kime kesildiğini söylemeye devam etmek zorundadır. |
| `lines` | `InvoiceLine[]` (JSONB). Birim fiyatlar **minor unit** (CLAUDE.md kural 9); majör birime tek bir yerde, `invoice-document.ts` içinde çevrilir. Şeması zod ile okunur; okunamayan satır boş fatura değil **hatadır**. |
| `ettn` | Belgenin kendi UUID'si. **Benzersiz** — kayıt yazılırken atanır, koda gömülü değildir. |
| `gibEnvelopeId` | **Yalnız** GİB entegratör üzerinden gönderimi gerçekten kabul ettiğinde dolar. `NULL` = belge hiç gönderilmedi; bu durumda `src/lib/efatura.ts` hem XML'e hem yazdırılabilir sayfaya "mali değeri yoktur" damgasını basar ve mali mühür iddiasını **yazmaz**. Bugün ürün hiçbir şeyi göndermiyor, yani her satırda `NULL`. |
| `fxRate` / `fxRateDate` / `fxRateSource` / `grandTotalTryMinor` | Yabancı para faturasının **TCMB döviz alış kuru**, kurun yayımlandığı **gün**, kaynağı (`TCMB`) ve **TL karşılığı** (ödenecek genel toplam, minor unit). TRY faturada dördü de `NULL`; başka her para biriminde dördü de zorunlu — `Invoice_fx_required_for_foreign_currency` CHECK kısıtı bunu veritabanı düzeyinde uygular. Bkz. `docs/adr/ADR-0002-foreign-currency-invoice-fx.md`. |

**Tedarikçi kimliği bu tabloda değildir.** Satıcı Fabrika'nın kendisidir; her kiracının
faturasında aynıdır ve uygulamanın seçebileceği bir şey değildir. `src/lib/env.ts` üzerinden
yapılandırılır (`INVOICE_SUPPLIER_NAME`, `_VKN`, `_TAX_OFFICE`, `_ADDRESS`, `_CITY`;
`_COUNTRY` ve `_EMAIL` isteğe bağlı). Hiçbirinin varsayılanı **yoktur**: eksikse rota belge
üretmez, `503` ile eksik değişkenleri **adıyla** sayar. Bunlar go-live ayarlarıdır.

**Gönderim entegratör üzerinden olur ve henüz yoktur.** GİB'e iletim lisanslı bir özel
entegratör gerektirir; arayüz ve hata yolları `src/lib/efatura-integrator.ts` içinde,
kimlik bilgileri `EFATURA_INTEGRATOR_*` değişkenlerinde. Dördü de dolmadan gönderim
denenmez (`not_configured`), o entegratöre ait adaptör yazılmadan da gönderilmiş sayılmaz
(`provider_unsupported`). Patronun dolduracağı tam liste: `docs/EFATURA_SETUP.md`.

**Seed yoktur ve olmamalıdır:** seed'lenmiş bir fatura, kesilmemiş bir faturadır.

### 11.1 Yabancı para faturasında kur ve TL karşılığı (ADR-0002)

VUK 215/280/385: yurt içi bir işlemde döviz cinsinden kesilen fatura, **düzenleme
tarihindeki TCMB döviz alış kurunu** ve **TL karşılığını** da göstermek zorundadır;
göstermezse VUK 352 II-7 uyarınca ikinci derece usulsüzlük. ADR-0002 (2026-09-08,
Seçenek (b)) faturayı kendi para biriminde kesip bu iki bilgiyi **satıra yazmayı**
seçti — yalnız XML'de hesaplamayı değil; böylece kesilmiş bir fatura sonradan aynı
rakamlarla yeniden üretilebilir (CLAUDE.md kural 7).

- **Kur nereden gelir:** `src/lib/fx/tcmb.ts` → TCMB'nin günlük bülteni
  (`https://www.tcmb.gov.tr/kurlar/YYYYMM/DDMMYYYY.xml`, kimlik bilgisi gerektirmez).
  Okunan alan `ForexBuying` (alış); `Unit` dikkate alınır, çünkü TCMB bazı para
  birimlerini 100 birim üzerinden kotalar.
- **Hafta sonu / tatil:** TCMB o gün bülten yayımlamaz (HTTP 404). Yürürlükteki kur
  **en son yayımlanan** bültenin kurudur, bu yüzden istemci gün gün geriye kayar
  (en çok `MAX_LOOKBACK_DAYS` = 10 gün) ve **fiilen kullanılan gün** `fxRateDate`'e
  yazılır. Kayma kayıtta görünür, ima edilmez.
- **TCMB'ye ulaşılamazsa geriye KAYILMAZ.** Bağlantı hatası, zaman aşımı ve 5xx
  anında `unreachable` ile biter; yalnız 404 ("o gün bülten yok") imleci geriye taşır.
  Kesinti sırasında geriye kaymak, eski bir kuru geçerli bir kurmuş gibi göstermenin
  ta kendisi olurdu.
- **Kur yoksa fatura da yok** (patron kararı, 2026-09-08): `createInvoiceForPayment`
  `{ status: 'skipped', reason: 'fx_rate_unavailable' }` döner, **hiç satır yazmaz**,
  `SystemAlert` üretir; ödeme etkilenmez ve TCMB döndüğünde aynı `paymentRef` ile
  fatura kesilir. **Son bilinen kur kullanılmaz.** Kayıt taşımayan bir döviz belgesi
  ayrıca `foreignCurrencyFilingBlock` tarafından GİB'e hiç ulaştırılmaz (`blocked`).
- **`TCMB_BASE_URL`** yalnız testin gerçek bankaya çıkmaması için vardır; gerçek
  ortamda boş bırakılır. Farklı bir kur kaynağı koymak için değildir.

Migration: `prisma/migrations/add-invoice.sql` +
`prisma/migrations/add-invoice-fx-rate.sql` (ikisi de additive + idempotent) — geri
alma: `prisma/migrations/add-invoice.down.sql` (yıkıcı: tabloyu ve tüm fatura
kayıtlarını siler; fatura mali bir belgedir, bu refleks bir geri alma değildir) ve
`prisma/migrations/add-invoice-fx-rate.down.sql` (satırlar kalır ama kesilmiş döviz
faturalarının kur kanıtı silinir ve geri getirilemez).

CHECK kısıtı `NOT VALID` eklenir: yazılan/güncellenen her satırda uygulanır, kural
konmadan önce yazılmış satırlar olduğu yerde bırakılır (yerel DB'de böyle bir satır
ölçüldü: TASK-MTSWLWDONWA3W'den kalan `qa-fx-…-USD` QA verisi). Bir ortamda böyle
satır kalmadığında kısıt tek deyimle terfi ettirilebilir:
`ALTER TABLE "Invoice" VALIDATE CONSTRAINT "Invoice_fx_required_for_foreign_currency";`

**Açık:** Ayarlar → Faturalandırma ekranındaki fatura tablosu hâlâ `BillingClient.tsx`
içindeki iki sabit `DEMO_INVOICES` satırını listeliyor (satır 76-92) ve indirme sütununda
bağlantı yok (ölçüldü: sayfada `a[href*="/api/billing/invoices/"]` sayısı = 0). Satırlar
"Demo örnek" rozetiyle işaretli, yani ekran yalan söylemiyor; ama gerçek `Invoice`
satırlarına bağlı da değil. Bağlamak yeni i18n anahtarı (boş durum metni) gerektiriyor ve
`messages/*.json` bu görevin kapsamı dışındaydı — ayrı kart gerekiyor.

### 11.1 Faturayı kim yazar (TASK-MTSWL8ADKZKDM)

`Invoice` tablosu, dışa aktarma rotası ve UBL-TR üreteci vardı; **hiçbir üretim kodu
satır yazmıyordu.** Ölçüm (dev @ `aa11d85`):

```
$ grep -rniE "invoice\.(create|upsert|createMany)" src scripts prisma tests workers
tests/e2e/invoice-export-real-record.spec.ts:81:      prisma.invoice.create({
tests/e2e/billing-invoice-history.spec.ts:90:    await prisma.invoice.create({
```

İki test dosyası, sıfır üretim yazıcısı. Ödeme alınıyor, yalnız `AuditEvent` yazılıyordu;
dolayısıyla ödeme yapmış her müşterinin faturası yoktu ve export her zaman `404` dönüyordu.

Artık **iki ödeme yolu da tek bir fonksiyondan** yazıyor:
`src/lib/billing/invoice-writer.ts` → `createInvoiceForPayment()`. Stripe
(`subscription-sync.ts` → `logInvoicePayment`) ve iyzico (`iyzico.ts` webhook senkronu)
onu çağırır; ikisi aynı satış için farklı belge üretemez.

| Alan | Not |
|---|---|
| `paymentRef` | Faturanın kesildiği sağlayıcı ödemesi. **Kiracı içinde benzersiz** — yeniden iletilen bir webhook ikinci belge kesemez. Yazma yolu eklenmeden önce kesilmiş satırlarda `NULL`; Postgres benzersiz indekste NULL'ları ayrık saydığı için bu satırlar çakışmaz. |

`TenantBillingIdentity` — alıcının **güncel** mali kimliği (kiracı başına tek satır,
`tenantId` birincil anahtar + `tenant_isolation` RLS). Şemada bunu tutan **hiçbir yer
yoktu**: `Tenant` yalnız görünen ad ve ISO ülke kodu taşıyor, Faturalandırma paneli ise
alıcı kimliğini **en yeni faturadan** okuyordu — yani ancak daha önceki bir faturanın
iddia ettiğini yankılayabiliyordu. Bu tablo olmadan `Invoice.buyer*` alanlarını doldurmanın
tek yolu bir mükellef **uydurmaktı**; TASK-MTRD9QBJ2G32E bu depodan tam olarak onu temizledi.

- Bu satır **değişebilir**; `Invoice.buyer*` kesim anındaki dondurulmuş fotoğraftır.
  Buradaki bir yazım hatasını düzeltmek, müşteriye gitmiş bir belgeyi geriye dönük değiştirmez.
- Kiracının satırı **yoksa ya da bir alanı boşsa fatura kesilmez**: ödeme kaydı yerinde
  kalır, `SystemAlert` (`invoice_buyer_identity_missing`) eksik alanları **adıyla** sayar.
  Uyarıya alanların **adı** yazılır, **değeri** değil — uyarı izi müşterinin vergi
  kimliğinin ikinci bir kopyası olmamalıdır.
- **Bu satırı bugün hiçbir ürün ekranı doldurmuyor** — toplama arayüzü ayrı bir kart.
  O ekran yazılana kadar canlıda kesilecek fatura sayısı sıfırdır (aşağıya bakın).

**KDV: ortam değişkeni değil, alıcının ülkesi.** Bir satışın hangi oranda
vergilendiği satıcıya, ürüne ve **alıcıya** dair mali bir olgudur; kodun ya da bir
sunucu ayarının seçebileceği bir sabit değil. Patron kararı (2026-09-08): fiyatlar
KDV **hariç** ilan edilir, oran alıcının ülkesinden gelir ve tek kaynağı
`src/lib/billing/vat-rates.ts`'tir — her satır oranın yanında kaynağını, yürürlük
tarihini ve rejimini taşır. Ülkenin kaynaklı satırı yoksa **fatura kesilmez**
(`SystemAlert: invoice_vat_country_unknown`); ödeme etkilenmez. `%0` geçerli ve
çözülmüş bir cevaptır (Kuveyt) — "oran bilinmiyor" ile aynı şey **değildir**.
Bunu belirleyen `INVOICE_VAT_RATE` ayarı 2026-09-09'da tamamen **kaldırıldı**
(TASK-MTTTMECDO7RC8); ne şemada ne preflight'ta bir izi kalmıştır.

Tahsil edilen tutar **KDV dahil** kabul edilip ayrıştırılır, çünkü değişmez şudur:
**faturanın genel toplamı tahsil edilen parayla birebir aynı olmak zorundadır.**
Ayrıştırmanın bir inceliği ölçüldü: `net + round(net × oran/100)` her tam sayıya
**denk gelmez** — %20'de her altı tutardan yalnız beşine ulaşır. Tek kalemde birebir
eşleşme dayatan bir şema, ödemelerin yaklaşık **altıda birini** faturasız bırakırdı
(200 000 minor unit'e kadar: %20'de tutarların %16,67'si; %18'de %15,25; %10'da %9,09).
Bunun yerine taşmayan en büyük net alınır ve kalan artık, **kendi 0 KDV'li
"Yuvarlama farkı" kalemi** olarak belgeye yazılır. Ölçüldü: bu artık test edilen her oran
ve tutarda **en fazla 1 kuruştur** ve `net + KDV + yuvarlama` her zaman tahsilata eşittir.

**`profileId` bugün bir varsayımdır.** Doğru değer alıcının GİB'de e-Fatura mükellefi olup
olmadığına bağlıdır (`TICARIFATURA` ise mükellef, `EARSIVFATURA` değilse). Bu sorgu lisanslı
entegratör gerektirir, sözleşme yoktur — yani cevap bugün gerçekten bilinmiyor.
`EARSIVFATURA` yazılır ve her kesimde `invoice_profile_assumed` uyarısı düşer. Bu yalnızca
hiçbir belge **gönderilmediği** için güvenlidir (`gibEnvelopeId` her satırda `NULL`, belgede
"mali değeri yoktur" damgası). İlk gerçek gönderimden önce bu değeri taşıyan her satır
mükellef sorgusuyla yeniden profillenmelidir.

Numara: `FB-<yıl>-<altı hane>`, kiracı içinde artan. Tahsis, en yüksek numarayı okuyup bir
sonrakini yazarak yapılır; hakemlik `@@unique([tenantId, number])` indeksindedir ve
benzersizlik ihlalinde üç kez yeniden denenir. Eşzamanlı üç ödemeyle canlı DB'de ölçüldü.

Migration: `prisma/migrations/add-invoice-write-path.sql` (additive + idempotent; iki kez
koşuldu) — geri alma: `add-invoice-write-path.down.sql` (`TenantBillingIdentity`'yi düşürmek
kiracıların verdiği mali kimliklerin **tek** kopyasını siler; `paymentRef`'i düşürmek ödeme
başına tekillik güvencesini kaldırır — ödeme alan bir ortamda koşulmaz).

## 12. `SavedSearch` gerçek yazıcısı (TASK-MTS6M5819RW93)

`SavedSearch` modeli ve `tenant_isolation` RLS politikası zaten şemadaydı, ama depoda hiçbir
yazıcısı yoktu: `/calls` sayfasındaki "Aramayı Kaydet" düğmesi `setTimeout(500)` + toast'tı ve
`src/lib/inngest/jobs/alerts-daily.ts`'in her 08:00 UTC'de okuduğu `notify: true` sorgusu bu
yüzden üretimde her zaman boş dönüyordu (bkz. `docs/agent-results/TASK-MTRNQN0NNVBYM-blog-yazar.md`).
Bu görev gerçek yazıcıyı ekledi; tablo/RLS **değişmedi**, migration yok.

- `GET/POST /api/saved-searches`, `PATCH/DELETE /api/saved-searches/[id]` — hepsi
  `requireTenantApi()` + `withTenant(tenantId, ...)` üzerinden.
- **Liste/silme/bildirim değişikliği `tenantId` + `userId` ile daraltılır** — bir kurum üyesi
  başka bir üyenin kayıtlı aramasını göremez/silemez/susturamaz. Bilinçli bir ürün kararı:
  "Kayıtlı Aramalarım" kişisel bir liste. `alerts-daily.ts`'in günlük dijest sorgusu
  (`SAVED_SEARCH_ALERT_QUERY`) bundan bağımsız — kiracı genelinde `notify: true` olan her
  satırı okur, tek bir kullanıcıya daraltmaz.
- `filters` şekli tek kaynaktan: `alerts-daily.ts`'in dışa açtığı `SavedSearchFiltersSchema`
  (yalnızca `q`/`status`, `.partial()`) buradan import edilir, burada tekrar tanımlanmaz — alan
  adları burada ile cron'da ayrışırsa cron sessizce "filtresiz" davranışa düşer (o dosyadaki not).

## 13. Sürümlü paketler ve özel paket (TASK-MTRJ32BZBY2AI)

`Plan` bir üründür (`free`/`basic`/`pro`/`ultra`) ve bugün ne sattığımızı tutar —
ama **ne sattığımızın tarihçesini** tutmaz. Bir paketin koltuk sayısı düşürülünce
o pakete önceden abone olmuş kiracının hangi şartlarla satın aldığı geri
okunamıyordu; §5.1'in fiyat için çözdüğü sorunun kapsam (koltuk / çalışma alanı /
kredi / modül) tarafı. Bu bölüm o boşluğu kapatan üç tabloyu tarif eder.

| Tablo | Kapsam | Ne tutar |
|---|---|---|
| `PlanVersion` | platform | Bir paketin **değişmez** anlık görüntüsü: fiyat, koltuk, çalışma alanı, kredi, `modules[]` |
| `PlanFeature` | platform | O sürümün kart maddeleri — sıralı, iki dilde |
| `PlanAssignment` | **kiracıya özel** | Özel (private) bir paketin bir kiracıya verilmesi |

### 13.1 `PlanVersion` — yayınlanan sürüm değişmez

| Sütun | Tip | Anlamı |
|---|---|---|
| `planId` | `String` | `Plan.id` (FK, `ON DELETE RESTRICT`) |
| `version` | `Int` | Paket içinde artan sayaç; `(planId, version)` benzersiz |
| `status` | `String` | `draft` \| `published` \| `archived` |
| `monthlyCents` / `yearlyCents` / `currency` | `Int` / `Int` / `String` | Kural 9: minor unit + para birimi |
| `seats` / `workspaces` / `aiCreditsMonthly` | `Int` | O sürümün kapsamı |
| `modules` | `String[]` | Sürümün açtığı modüller |
| `publishedBy` / `publishedAt` | `String?` / `DateTime?` | Kim, ne zaman yayınladı |

- **Değişmezlik kod kuralıdır, kolon kısıtı değil:** `updateDraftVersion`,
  `publishVersion` ve `discardDraftVersion` `draft` olmayan bir sürümde
  `PublishedVersionImmutableError` fırlatır (`src/lib/billing/plan-repository.ts`).
  Yayınlanmış bir paketi düzenlemek `createDraftVersion` ile **yeni** bir sürüm
  yaratır; yayın, önceki `published` satırı `archived` yapar ve satır okunur kalır.
- **Neden okunur kalır:** `Subscription.planVersionId` (nullable, `ON DELETE SET
  NULL`) satılan sürüme çivilenir. Sürüm arşivlense de abonelik satın alındığı
  şartları okumaya devam eder — §5.1'deki `locked*` ile aynı ilke, farklı eksen.
- **Hak-ediş bu sütundan okunur (TASK-MTSJH8NMAXPRM).** `getEntitlements`
  aboneliğin işaret ettiği `PlanVersion`'ı okur; sütun `NULL` ise derlenmiş
  `PLAN_GRANTS` kataloğu cevaplar — sürüm yazılmadan önce satılmış bir satır
  sessizce yeniden hak-edişlenmez. Kural ve reddedilen iki işaretçi (başka
  paketin sürümü, `draft`) `src/lib/billing/entitlement-source.ts`'te.
  Sütunu **kim yazar:** ilk satış ve paket değişiminde abonelik yazıcıları
  (`subscription-sync.ts`, `iyzico.ts`), yayında `publishVersion` (o paketteki
  **canlı** abonelikleri yeni sürüme taşır; `CANCELED` satır bittiği sürümde
  kalır), ve bir kereye mahsus `pnpm db:backfill-plan-version`.
- **Yayın canlı kiracıya ULAŞIR.** `computePublishImpact`'in "bu değişiklik N
  canlı kiracının limitini düşürüyor" uyarısı ve onu geri yazma zorunluluğu
  ancak bu yüzden anlamlı; öncesinde yayın hiçbir kiracıya ulaşmıyordu.
- `Plan` satırı yayında **izdüşüm olarak** güncellenir (mevcut `Plan`
  okuyucuları bozulmasın diye bilinçli çift-yazım). Üç müşteri yüzeyi
  `PlanVersion`'dan render edildiğinde bu çift-yazım kaldırılmalıdır.

### 13.2 `PlanFeature` — kart maddesi vaat ettiğinden fazlasını söyleyemez

| Sütun | Tip | Anlamı |
|---|---|---|
| `planVersionId` | `String` | `PlanVersion.id` (FK, `ON DELETE CASCADE`) |
| `order` | `Int` | Karttaki sıra |
| `kind` | `String` | `module` \| `limit` \| `text` |
| `moduleId` / `limitKey` | `String?` | `kind`'a göre dolan alan |
| `textTr` / `textEn` | `String?` | Kural 8: yeni metin iki dile birden yazılır |

`kind='module'` bir madde yalnızca **o sürümün `modules[]` dizisindeki** ve
`ModuleCatalog`'ta var olan bir modülü gösterebilir; ihlal
`ModuleNotGrantedError` ile hem kaydederken hem yayınlarken reddedilir (yayındaki
kontrol, kayıt kapısını atlayıp doğrudan tabloya yazılmış satırı da yakalar).
Kural 7'nin fiyat kartı karşılığı: kart, paketin açmadığı bir modülü vaat edemez.

### 13.3 `PlanAssignment` — özel paket (RLS'li tek tablo)

| Sütun | Tip | Anlamı |
|---|---|---|
| `planId` | `String` | `Plan.id` (FK, `ON DELETE RESTRICT`) |
| `tenantId` | `String` | `Tenant.id` (FK, `ON DELETE CASCADE`) — RLS anahtarı |
| `assignedBy` / `assignedAt` / `note` | `String?` / `DateTime` / `String?` | Denetim izi |

`(planId, tenantId)` benzersizdir, yani atama idempotenttir. `Plan.visibility`
(`public` \| `private` \| `archived`, varsayılan `public`) hangi paketin
vitrinde olduğunu söyler; `private` paket yalnızca kendisine atanmış kiracıya
görünür ve bu daraltmayı `plansVisibleToTenant(tenantId)` yapar
(`public` olanlar + bu kiracıya atananlar).

**RLS:** `PlanAssignment` `prisma/rls.sql`'deki kanonik `tenant_isolation`
listesindedir (kiracı sayısı 40 → 41). `Plan`, `PlanVersion` ve `PlanFeature`
**platform** tablolarıdır: katalog her kiracı için aynıdır, bu yüzden
`platform_read` (SELECT, `USING (true)`) herkese okutur ve
`platform_no_insert` / `platform_no_update` / `platform_no_delete` kiracı
bağlantısına yazdırmaz. Postgres'te bir politika tek komut adlandırır ve INSERT
politikası `USING` değil `WITH CHECK` alır — üç yazma komutu bu yüzden üç ayrı
politikadır.

Migration: `prisma/migrations/add-plan-versioning/migration.sql` (additive +
idempotent, RLS politikaları dosyanın içinde) — geri alma: aynı klasördeki
`down.sql` (**yıkıcı**: sürüm tarihçesini ve atamaları siler). Depodaki düz
`prisma/migrations/*.sql` dosyaları `prisma migrate deploy`'un gözüne görünmez;
yalnızca klasörlü olanlar uygulanır. Bu yüzden **elle** uygulanmaları gerekir ve
sayıları `docs/RELEASE_CHECKLIST.md` §1'de sayılarak listelenir (2026-09-09
ölçümü: 12 düz dosya, 5 klasörlü; veritabanı Prisma'ya göre yalnız 5'ini
uygulanmış biliyor).

**Bugünkü sınır (bilinçli):** `plansVisibleToTenant` ve `listPublicPlans`
hazırdır ama fiyat sayfası, ayarlar faturalama paneli ve checkout hâlâ statik
`src/lib/billing/catalog.ts`'ten okur. Yani stüdyoda açılan bir paket — herkese
açık ya da özel — henüz hiçbir müşteri yüzeyinde satılmaz; `visibility` şu an
yalnız yönetim ekranında anlamlıdır. Üç yüzeyin `PlanVersion`'dan render'ı bu
kartın kapsamı dışındadır.

## 14. `TopicMatch` fırsat başına anahtarlı (TASK-MTQ63RR8Z0G8E)

`TopicMatch` iki tür satır tutar ve ikisi `opportunityId` ile ayrılır:

| satır | `opportunityId` | anlamı |
|---|---|---|
| K1 eşleşmesi | `NULL` | `fitScore` — kiracı × konu uyumu. Konu başına **tek** satır. |
| G0 kanıt kaydı | dolu | `g0Score` + `breakdown` — **tek bir fırsatın** puanı ve ölçüt dökümü. |

**Neden.** G0 puanı konunun değil fırsatın özelliğidir: `budgetRoleEconomy` (ağırlık 10)
`Opportunity.intendedRole`'ü, `researchAndEndUser` (ağırlık 12) o fırsatın `ConsortiumSeat`
satırlarını okur. `Opportunity.topicId` ise unique değil — aynı konuda N fırsat serbest. Tablo
`@@unique([tenantId, topicId])` iken ikinci skorlama birincinin satırının üzerine yazıyordu ve
kanıt kaydını okuyan pano, hayatta kalan satırı **iki kartta birden** çiziyordu: aynı konuda
koordinatör 44.9, ortak 48.23 ölçüldü, panoda iki kart da 48.23 gösterdi, koordinatörün kendi
detay sayfası ise 44.9 dedi. Aynı fırsat, iki ekran, iki sayı — CLAUDE.md §7 ihlali.

**Anahtar.** `@@unique([tenantId, topicId, opportunityId])`, veritabanında `NULLS NOT DISTINCT`
(Postgres ≥ 15) ile kurulur; böylece `opportunityId` NULL olan K1 satırı da konu başına tek kalır.
Prisma bu niteliği ifade edemediği için K1 satırı `findFirst` + `create`/`update` ile okunup
yazılır (`src/lib/scoring/g0-compute.ts`, `prisma/seed.ts`); fırsat satırı normal `upsert` ile.

**Okuma yüzeyleri.** Pano rozeti (`pipeline/page.tsx`) kanıt satırını **fırsat kimliğiyle** çeker
(tek toplu sorgu); detay sayfası aynı puanı `computeG0ForOpportunity` ile canlı hesaplar ve
hiçbir şey yazmaz. `Opportunity.g0Score` bir önbellek sütunudur: `persistG0` doldurur, ama tohum
verisi de yazabildiği için hiçbir ekran onu doğrudan çizmez.

**PIC değişince yeniden hesaplama (FO-384).** Kiracı PIC kaydeder, temizler veya yönetici kaldırırsa
kiracının **G0 aşamasındaki aktif** fırsatları `rescoreOpportunityG0` ile yeniden puanlanır
(`src/lib/scoring/g0-rescore-tenant.ts`). "Aktif" şemadan okunur: `stage = G0`, `status = ACTIVE`
ve `deletedAt` boş (`G0_RESCORE_SCOPE`, `src/lib/scoring/g0-compute.ts`; K-577267 seçenek A). Liste,
sayfalı devam, kuyruk işi ve yazım aynı filtreyi kullanır. G1–G4 ile `FUNDED`, `WITHDRAWN`,
`SUBMITTED`, `REJECTED`, `ABOVE_THRESHOLD` ve arşivli satırların `g0Score`, `TopicMatch.g0Score`,
`updatedAt` ve `GateDecision` kayıtları PIC değişiminde yazılmaz. Liste ile yazım arasında aşaması
değişen fırsat yazılmaz (`TopicMatch` dahil); bu `failed` değil, `archived` sayılır ve alarm
üretmez (`G0LeftScopeError`). Kapı yolu (`persistG0`, `scripts/rescore-g0.ts`) bu filtreden etkilenmez.
Puan değişmediyse `Opportunity` satırına hiç
yazılmaz; değiştiyse `updatedAt` korunur (pano "son dokunulan" sırasını bozmaz). `TopicMatch`
kanıt kaydı her koşuda yenilenir. Puan hesaplanamazsa (`coverage === 0`) saklanan değer `null`
ile değiştirilir. İstek içinde 25 sn'lik bütçe biter ve kalan fırsatlar `g0-rescore-tenant`
işine (`src/lib/jobs/tasks/g0-rescore-tenant.ts`) bırakılır; iş kiracı ve değişiklik kimliğiyle
kaldığı imleçten (`afterId`, fırsat kimliği sırası) devam eder. Kuyruğa koyamazsa `SystemAlert`
(`source: g0-rescore-after-pic`, kiracı kimliği yok) üretilir. Canlı veriye geriye dönük yazma
bu yoldan yapılmaz; `pnpm jobs:g0-rescore` ayrı bir patron kararıdır.

**Geri doldurma.** `prisma/migrations/topicmatch-per-opportunity/migration.sql` eski konu-başına
satırları şöyle ayırır: kanıt yükü taşıyan bir satır, o kiracıda o konuda **tek** canlı fırsat
varsa o fırsata bağlanır (gerçek K1 `fitScore`'u da varsa puan yeni bir fırsat satırına taşınır,
K1 satırı konu düzeyinde kalır); atfedilemiyorsa (0 veya >1 aday) `g0Score` **temizlenir** ve
sebebi `breakdown`'a yazılır — tahminle bir fırsata yapıştırılmaz. Yeniden hesaplama:
`pnpm jobs:g0-rescore -- --apply`. Geri alma: aynı klasörde `down.sql` (yıkıcı — konu başına tek
satıra çöker, yani geri alınan bozuk davranışın kendisi).

**RLS.** Yeni tablo yok; `TopicMatch` `tenant_isolation` politikasını `prisma/rls.sql`'den almaya
devam eder ve yeni sütun kiracı anahtarı değildir.

## 15. `Consent` — aydınlatma ve rıza kaydı (TASK-MTSWLANXSU0IG)

Migration: `prisma/migrations/add-consent-record.sql` · geri alma: `add-consent-record.down.sql`
(geri alma **kaydı yok eder** ve başka hiçbir tablodan yeniden üretilemez — dosyanın başındaki
dışa aktarma uyarısına bakın). RLS: `tenant_isolation` (`prisma/rls.sql` FOREACH dizisi).

**Neden var.** 2026-09-10'a kadar `grep -n "Consent" prisma/schema.prisma` sıfır sonuç
veriyordu: bir kullanıcının hangi metne, ne zaman, hangi sürümüne onay verdiği hiçbir yerde
kayıtlı değildi. GDPR md.5(2) ispat yükünü veri sorumlusuna verir; ispatlanamayan bir
aydınlatma, yapılmış olsa bile yapılmamış sayılır.

**Kapsamı envanter belirler, tercih değil.** `docs/legal/processing-register.md` 18 işleme
faaliyeti sayar. Bunlardan **yalnız biri** açık rızaya dayanır: §11 (Google/Outlook takvim
OAuth, KVKK md.5/1 / GDPR md.6(1)(a)) — ve o faaliyet bugün hiç veri yazmıyor. Hesap
oluşturma (§1) **sözleşme** temellidir (md.5/2-c / md.6(1)(b)). Bu yüzden kayıt formundaki
kutu "rıza veriyorum" demez: sözleşmeye dayanan bir işleme için rıza istemek, dayandığımız
hukuki sebebi yanlış beyan etmek ve var olmayan bir geri çekme hakkı ima etmek olurdu.

| Sütun | Not |
|---|---|
| `tenantId` | CLAUDE.md kural 1. Aydınlatma Fabrika'ya verilir ama satır, hesabın açıldığı kiracıya kapsanır — kiracı sahibi kendi üyelerinin kaydını denetleyebilir, başkasınınkini göremez |
| `userId` | FK **değil**, imhada **silinmez** (§7.1.1) |
| `kind` | `DISCLOSURE_ACK` (md.10 / md.13 aydınlatma — hukuki sebep DEĞİL) · `TERMS_ACCEPTANCE` (sözleşmenin kurulması) · `EXPLICIT_CONSENT` (md.6(1)(a) — yalnız bunda geri çekme anlamlı) |
| `purpose` | `ACCOUNT_REGISTRATION` (§1) · `CALENDAR_OAUTH` (§11, henüz satır yok) · `LEAD_INTAKE` (NG-138: hazırlık karnesi ziyaretçisinin talebinin danışman kiracısına aktarılmasına rızası; `userId = 'public-lead:<PublicLead.id>'`, hesap yok; migration `add-consent-purpose-lead-intake.sql`) |
| `documentId` + `documentVersion` | Metnin **kendisi saklanmaz**; kimliği ve sürümü saklanır. Metin `messages/{tr,en}.json` içinde `t()` anahtarı olarak yaşar, `src/app/[locale]/privacy` ve `/terms` sunar. Sürüm `src/lib/legal/consent-documents.ts`'te tek yerde beyan edilir; metin değişince **aynı commit'te** sürüm artırılır, eski satırlar eski sürümde kalır ve doğruyu söylemeye devam eder |
| `withdrawnAt` | Geri çekme **işaretlenir, silinmez**. Silinmiş bir geri çekme, hiç olmamış bir geri çekmeden ayırt edilemez |
| `ipAddress` / `userAgent` | **Bilerek yok.** İspat kaydına uyan saklama süresi §12'nin `DualApprovalStep` için savunduğu süredir (md.17(3)(e) — hesabın ömrünün ötesinde). Süresiz saklanan bir ağ tanımlayıcısı, envanterin kendi §22 boşluk #1'ine yeni bir madde ekler. İspat için gereken dört sütun zaten var: kim, hangi belge, hangi sürüm, ne zaman |

**Yazma yolu — iki tane var, ikisi de kapsanır.** Bir Fabrika hesabı iki ayrı yerde doğar:

1. `authorize` (`src/lib/auth.ts`) — e-posta/şifre formu. Onay, kimlik bilgileriyle **birlikte**
   gelir, yani hesap var olmadan **önce** doğrulanır; onaysız kayıt reddedilir (`null` döner).
   Onay satırı hesabın açıldığı **aynı transaction** içinde yazılır: yazım düşerse kullanıcı,
   kiracı, çalışma alanı ve üyelik de geri alınır.
2. `events.createUser` (`src/lib/auth.ts`) — Google/Microsoft OAuth. Adaptör kullanıcıyı zaten
   yaratmış olduğu için burada reddetmek mümkün değil; onay, `signIn` öncesinde sunucu
   tarafında kurulan kısa ömürlü httpOnly çerezle taşınır
   (`src/lib/legal/registration-ack-cookie.ts`). Çerez yoksa satır **yazılmaz** — uydurulmuş
   bir kayıt, eksik kayıttan kötüdür — ve `SystemAlert` (`auth-registration-consent`) üretilir.

**`bindTransactionToTenant`.** Kayıt akışı `withTenant`'ı kullanamayan tek akıştır: kiracı,
ona ihtiyaç duyan transaction'ın ortasında doğar, dolayısıyla transaction açılırken
kapsanacak bir kiracı yoktur. `set_config('app.tenant_id', …, is_local => true)` kiracı id'si
oluşur oluşmaz uygulanır — `withTenantOn`'un kullandığı mekanizmanın aynısı
(`src/lib/db.ts`). Bu çağrı eklenene kadar `Membership` ve `Workspace` bu transaction'da
`app.tenant_id` hiç kurulmadan yazılıyordu; yerel SUPERUSER rolüyle çalıştığı için görünmüyordu,
`fabrika_app` (NOBYPASSRLS) rolüyle `tenant_isolation` hepsini reddederdi.


## 16. Yeni kiracı tablosunun RLS'i nereye yazılır (TASK-MTVDSSJTZCY4T)

Kural tek cümle: **kiracıya özel bir tablo kuran migration, o tablonun
politikasını aynı dosyada kurar** — `ENABLE` + `FORCE` + `tenant_isolation`,
sözcüğü sözcüğüne `prisma/rls.sql:19-21`'deki ifadeyle. `prisma/rls.sql` tek
doğruluk kaynağı olmayı sürdürür ve `pnpm db:rls` her koşuşta politikayı
yeniden kurar (`DROP POLICY IF EXISTS` + `CREATE`, idempotent); migration'daki
kopya yalnız aradaki pencereyi kapatır. O pencere varsayım değil, yayın
yönteminin kendisidir: `docs/RELEASE_CHECKLIST.md` §1 düz
`prisma/migrations/*.sql` dosyalarının kod yayınından önce **elle, tek tek**
uygulanmasını ister ve `pnpm db:rls` ayrı bir adımdır. Arada tablo, üstünde
satır düzeyi güvenlik **açık bile olmadan**, bir kiracının satırlarını tutar —
ölçüldü (2026-09-10, temiz veritabanı, üç migration uygulandı, `db:rls`
koşulmadı): `Invoice`, `TenantBillingIdentity` ve `MeetingBrief` için
`relrowsecurity=f`, politika sayısı 0; `app.tenant_id='tenant-a'` kurulu bir
`fabrika_app` benzeri rol `MeetingBrief`'te **iki kiracının** satırını da
okudu. Kapı bunu `pnpm rls:check` içindeki CHECK 4b ile kontrol eder
(`scripts/rls-migrations.ts`): migration'ın kendi `CREATE TABLE` gövdesinde
`tenantId` gören ve aynı dosyada politika bulamayan her tablo için kırmızı
yanar, tablo adını ve satırı söyleyerek — tablo `schema.prisma`'ya daha
girmemiş olsa bile. `SYSTEM_WIDE` / `NULLABLE_TENANT` istisnaları yine
`scripts/rls-models.ts`'ten okunur, böylece üç kapı "kapsandı"nın ne demek
olduğu konusunda ayrışamaz. Muafiyet listesi **yoktur**: bir tabloyu listeye
yazmak, kartın kapattığı pencereyi kalıcı hâle getirmek olurdu.

## 17. `StripeEventLog` — webhook idempotency anahtarı (TASK-MTVSBEO7VX6Y4 · ADR-0003)

Stripe webhook'unun "bu olayı zaten işledim" kaydı. Üç handler
(`syncStripeSubscription`, `handleSubscriptionCancellation`, `logInvoicePayment`)
her teslimatın başında bu tabloyu okur ve parayı yazan transaction'ın **ilk**
ifadesinde satırı ekler.

| Sütun | Tip | Not |
|---|---|---|
| `id` | `String @id @default(cuid())` | Geriye dönük dolumla gelen satırlar `gen_random_uuid()` taşır |
| `tenantId` | `String` (NOT NULL) | `tenant_isolation` politikasını almasının sebebi bu |
| `stripeEventId` | `String @unique` | Kilidi veritabanına devreden kısıt |
| `handler` | `String` | `subscription.sync` \| `subscription.cancel` \| `invoice.payment` |
| `processedAt` | `DateTime @default(now())` | Dolumda kaynak `AuditEvent.createdAt` |

**Neden `AuditEvent` yetmedi.** Anahtar önceden bir `AuditEvent` satırıydı ve
`data->>'stripeEventId'` ile aranıyordu. `AuditEvent.tenantId` nullable olduğu
için o tablo §1.1'deki `tenant_or_shared` sınıfındadır: kiracısı **olan** bir
satır ancak `app.tenant_id` o kiracıya ayarlıyken yazılabilir ve okunabilir.
Anahtar ise en sonda, paradan sonra, `withTenant`'ın **dışında** yazılıyordu.
Bugün uygulama BYPASSRLS bir rolle (`fabrika`) bağlandığı için bu görünmüyor;
`fabrika_app` altında ölçüldü: para yazıldı (`Subscription=1 CreditLedger=1`),
anahtar yazılamadı (`AuditEvent=0`), guard okuması kör
(`no tenant set: 0`), ve iptal edilmiş bir abonelik bayat bir `active`
olayının tekrar gönderimiyle ACTIVE'e dönüp aylık tahsisi ikinci kez aldı.

**Neden UNIQUE.** Oku-sonra-yaz guard'ı tekrar gönderimi çözer, aynı olayın iki
**eşzamanlı** teslimatını çözmez. Ölçüldü: kısıt kaldırıldığında 8 eşzamanlı
teslimat 8 anahtar + 8 kredi satırı yazıyor (777 yerine 6216 kredi); kısıt
yerindeyken 1 + 1. Kilit artık denetim izinden ayrıdır — `AuditEvent` satırları
yazılmaya devam eder, ama birinin silinmesi bir tekrar oynatmanın kilidini
açmaz.

**Büyüme ve budama.** Webhook başına bir satır, satır ~150 bayt. Budama işi
**bugün yok**; Stripe üç gün tekrar gönderdiği için 90 günden eski satırlar
güvenle silinebilir, ama o ayrı bir kart (bkz. ADR-0003 §Riskler).

RLS: politika `prisma/rls.sql` tenant-scoped dizisinde **ve** kendi
migration'ında (`prisma/migrations/add-stripe-event-log/migration.sql`) —
§16'nın kuralı. Geri alma: aynı dizinde `down.sql`.

## 18. Ajans ↔ kurum bağı ve toplu davet kodu (TASK-MULRQJQYM0NAM · FB KAMU B1)

Migration: `prisma/migrations/add-agency-invite-code.sql` · geri alma: `add-agency-invite-code.down.sql`
(geri alma tüm kodları ve tüm ajans bağlarını siler; kurumların hesabı ve verisi kalır).
Sonrasında `pnpm db:rls` koşulmalı.

**Model.** Ajans ayrı bir model değildir: `Tenant.kind = AGENCY` olan bir kiracıdır (varsayılan
`ORGANIZATION`). Ajans personeli o kiracının sıradan `Membership`'idir. Kodla açılan kiracı
`Tenant.agencyId` ile ajansa bağlanır; bu alan yalnız kayıtta, kodun kullanıldığı transaction'da
yazılır. Ajans silinirse bağ `SET NULL` olur.

**`AgencyInviteCode`.** `tenantId` = ajans (bu ad sayesinde `tenant_isolation` ve tüm RLS
araçları tabloyu olduğu gibi kapsar). Kodun kendisi saklanmaz: yalnız normalize edilmiş halinin
SHA-256'sı (`codeHash`) ve gösterim için son 4 karakter (`codeHint`). Kod 12 karakter,
0/O/1/I/L/U içermeyen 30 harflik alfabeden (`src/lib/agency/invite-code.ts`).
**Kullanım sınırı yok** (TASK-MUM4WVYLSH9IT, leed-fb 29.09): kod yalnız `expiresAt` (≤ 1 yıl) ve
`revokedAt` ile yönetilir. `usedCount` iç sayaçtır, ajansa gösterilmez; `CHECK (usedCount >= 0)`.
`maxUses` emekli kolon: nullable, yeni kod yazmaz, hiçbir yer okumaz (eski satırlar değerini korur).

**Kullanım.** Kayıt olan kişinin kiracısı olmadığı için koda `tenant_isolation` üzerinden
ulaşamaz. Tek kapı `public.redeem_agency_invite(code_hash)` (SECURITY DEFINER,
`search_path = public, pg_temp`): tek `UPDATE … SET usedCount = usedCount + 1 WHERE
revokedAt IS NULL AND expiresAt > now … RETURNING tenantId` (`agency-invite-no-max-uses.sql`).
Satır kilidi eşzamanlı kullanımları sıraya koyar, hiçbir kullanım kaybolmaz. Sınır olmadığı için
ret "tükendi" anlamına gelemez; kodunu kayıt formunda deneyen ajans panelde gördüğünden fazlasını
öğrenmez (TASK-MUM3TMP8HU76G Ö-1). Fonksiyon ajans
id'si ya da NULL döndürür; kodun var olup olmadığı, süresinin dolup dolmadığı dışarıdan ayırt
edilemez. `app.system_scope` fonksiyon düzeyinde açılır, çıkışta (hata dahil) geri alınır.
Reddedilen denemeler `public.note_agency_invite_rejection(code_hash)` ile `AuditEvent`'e
yalnız sebep olarak yazılır (`agency.invite.rejected`; kod, hash ve kişi yok).

**Ajans kurumun içeriğini okuyamaz.** Hiçbir RLS politikası `agencyId`'ye bakmaz. Ajans oturumu
`app.tenant_id = ajans` ile çalışır; bağlı kurumun satırları 0 döner, yazma 42501 alır
(`tests/agency-invite.live.test.ts`, `fabrika_app` ile). B2/B3'teki toplu sayılar, satır değil
sayı döndüren SECURITY DEFINER fonksiyonlarla gelecek.

## 19. Kurumun ili — `Tenant.province` (TASK-MULV3JXS1AW5X · FB KAMU)

Migration: `prisma/migrations/add-tenant-province.sql` · geri alma: `add-tenant-province.down.sql`
(sütunu siler; girilmiş iller kaybolur). Ajans panosu için ek fonksiyon:
`add-agency-funnel-province.sql` · geri alma: `add-agency-funnel-province.down.sql` (önce bu
geri alınır, sonra sütun).

**Alan.** `Tenant.province String?` (NULL = bildirilmedi ya da kurum Türkiye'de değil). Ayar
JSON'unda anahtar değil, sütun (LEED-FB kararı, 29.09.2026): B2/B3 il kırılımı bu alana
`GROUP BY` yapar.

**Değer: plaka kodu değil, il adı.** `src/lib/readiness/provinces.ts` içindeki `TR_PROVINCES`
yazımıyla birebir (`'İstanbul'`, `'Şanlıurfa'`). Karne paylaşım bağlantısı (`?il=Samsun`) ve
kamu kataloğu (`turkeyRegions`) zaten bu adları kullanıyor; tek sözlük üçüne de yeter ve arada
kod↔ad çevirisi gerekmez. Aynı 81 ad veritabanında `CHECK ("Tenant_province_check")` olarak
durur; `src/lib/province.test.ts` iki listenin ayrışmasını yakalar. Uygulamaya giren her değer
`toTenantProvince` (`src/lib/province.ts`) üzerinden geçer: listede olmayan değer hata değil,
NULL'dur (alan isteğe bağlı, kaydı durdurmaz).

**Nerede yazılır.**
- Kayıt (`src/app/[locale]/login/AuthCard.tsx`): isteğe bağlı il seçimi. Kayıtla açılan her
  kiracı `country = 'TR'` olduğundan soru her kayıtta sorulur; `provinceAppliesTo(country)` TR
  dışı bir kiracıda alanı hiç tutmaz. Karneden gelen `?il=` değeri seçimi önceden doldurur
  (`readinessSignupPath(locale, province)`).
  - Credentials dalı: `authorize` → `tenant.create({ province })`.
  - OAuth dalı: il, onay çerezi gibi 15 dakikalık httpOnly bir çerezle
    (`src/lib/registration-province-cookie.ts`) `createUser` olayına taşınır. Çerez her OAuth
    başlangıcında yazılır ya da silinir; önceki bir seçim sonraki kayda geçmez.
- Kurum ayarları (`settings/profile`): sahip/yönetici (`manage_users`) değiştirir; her
  değişiklik `AuditEvent: tenant.province.updated` (`{ from, to }`).

**`Tenant.pic` (FO-383).** Kurumun PIC'i; G0 puanı CORDIS geçmişini bununla okur. Ayarlar →
Kurumsal Profil'den sahip/yönetici (`manage_users`) girer, değiştirir, temizler; 9 hane
(`src/lib/pic.ts`). CORDIS'te karşılığı varsa kuruluş adı gösterilip onay istenir (onay sunucuda
zorunlu), karşılığı yoksa kaydedilir ve geçmiş puanı eklenmeyeceği söylenir. Silinmemiş başka bir
kiracıda duran PIC reddedilir; benzersizlik indeksi yok, yarışı PIC başına
`pg_advisory_xact_lock` kapatır. Her değişiklik `AuditEvent: tenant.pic.updated`
(`{ from, to, cordisName }`). Portaldaki gerçek sahiplik otomatik doğrulanmaz. Red mesajı gerçek
sahibi destek adresine yönlendirir; platform yöneticisi Admin → Kiracılar → kiracı detayından
PIC'i kaldırır (K-576942): zorunlu not, yalnız ekranda görülen değer silinir, `AuditEvent:
tenant.pic.removed` (`{ from, note }`, `actorId` = yönetici, `tenantId` = hedef kiracı). Kaldırma
yeniden puanlama yapmaz: `Opportunity.g0Score` ve `TopicMatch.g0Score` bir sonraki yeniden
hesaba kadar eski değerde kalır.

FO-386: "başka hesapta kayıtlı" cevabı evet/hayır olduğundan, yeni bir PIC'i soran her kayıt
kullanıcı başına sayılır (`PIC_LOOKUPS_PER_HOUR`, `UserWindowLimiter`: süreç içi, N örnek N katı
izin verir, yeniden başlatma sayacı sıfırlar). Sayım kilitten ve sorgudan önce yapılır; sınır
aşılınca hiçbir şey sorgulanmaz ve kaydedilmez. Ret `AuditEvent: tenant.pic.refused`
(`{ pic, reason }`, `reason` = `picTaken` | `rateLimited`, `actorId` = soran, `tenantId` = soranın
kiracısı) yazar; PIC'i tutan kiracı satırda geçmez, onun kaydına da satır düşmez. `rateLimited`
kullanıcı başına saatte bir satırdır.

FO-389: sayaç kayan pencerelidir (sabit pencere kenarında 2x burst vermez; reddedilen soru
sayılmaz). Davetsiz hesap (ajans davet kodundan gelmemiş: `agencyId` boş; canlı abonelik yok
[`ACTIVE`/`TRIALING`/`PAST_DUE`; pilot de bir `Subscription`'dır], ömür boyu lisans yok) saatte
`PIC_LOOKUPS_PER_HOUR_UNSOLICITED` (3) soru sorar ve her soru `PicLookupBudget` ortak günlük
bütçesinden (`PIC_UNSOLICITED_LOOKUPS_PER_DAY`, 2000) harcar. Tavan dolunca davetsiz hesap, hangi
PIC'i sorarsa sorsun, aynı `picRateLimited` cevabını (sonraki UTC gece yarısına kalan süreyle)
alır: PIC listede mi, başka kiracıda mı bilgisi verilmez. Davetli, pilot ve ücretli kiracı bütçeyi
harcamaz, tavandan etkilenmez. `tenant.pic.refused` satırı kiracı başına günde
`PIC_REFUSAL_ROWS_PER_TENANT_PER_DAY` (50) ile sebep başına (`picTaken` / `rateLimited`) sınırlıdır; ret
yine de verilir, yalnız satır yazılmaz. Sebep başına sayılır ki bir günlük `picTaken` satırı "sınır aşıldı"
satırını gizlemesin. Yeni tablo: `PicLookupBudget` (§24, `SYSTEM_WIDE`, politikasız).

FO-389 inceleme düzeltmeleri: bütçe harcaması profil işleminin içinden, uygulama havuzundan ikinci
bir bağlantı isteyemez (10 eşzamanlı davetsiz soru havuzu kilitliyordu); harcama
`picBudgetClient()` ile kendi küçük havuzunda (`PIC_BUDGET_POOL_MAX` = 2, bekleme 5 sn,
`application_name = fonbridge-pic-budget`) ve işlemden bağımsız commit olur. Bütçeye ya da
veritabanına ulaşılamazsa istek `failed` döner (tavan atlanmaz) ve kullanıcının saatlik hakkı geri
verilir (`UserWindowLimiter.refund`). Günlük tavan dolup bir soru geri çevrildiğinde UTC günü başına
tek `SystemAlert` açılır (`source: pic-budget`, `level: warn`, `dedupeKey: pic-budget-spent:<gün>`,
meta yalnız `{ day, ceiling }`; PIC, kiracı ve kullanıcı kimliği yok). Ret satırı tavanına
(`PIC_REFUSAL_ROWS_PER_TENANT_PER_DAY`) ulaşılan gün, kiracı ve sebep başına tek özet satırı
`AuditEvent: tenant.pic.refusal.capped` (`{ reason, cap }`) yazılır; sonraki retler satır
bırakmaz, tavan kalkmaz. Admin → Kiracılar → kiracı detayında ret listesinde görünür.

**RLS.** `Tenant` sistem geneli bir tablodur (`tenantId` sütunu yok), `tenant_isolation`
kapsamı dışındadır; `relrowsecurity = false`, politika 0. Yeni politika gerekmez.

**KVKK.** İl kurum düzeyinde bir veridir; kişisel veri eklenmez.

**Ajans panosu il filtresi.** `public.agency_funnel_counts_by_province(since)` —
`agency_funnel_counts` ile aynı sözleşme (ajans = çağıranın `app.tenant_id`'si, yalnız
tamsayılar), satır başına kurum türü **ve** il. Eski fonksiyon dönüş tipi değişemediği için
yerinde bırakıldı; uygulama artık yenisini çağırır. Küçük hücre kuralı (<5,
`src/lib/agency/funnel.ts`) tür × il tablosunun tamamına uygulanır: her il görünümü tek istekle
alınabildiği için satır (tür toplamı − görünen iller), sütun (il toplamı − görünen türler) ve
iller arası (genel toplam − görünen il toplamları) farklarının hiçbiri 1..4 olamaz. İli
bildirilmemiş kurumlar hiçbir il görünümünde yoktur ve her zaman gizli kütle sayılır.

## 20. Ajans bölge raporu — `AuditEvent` anlık görüntüsü (TASK-MULRR08Y9YI77 · FB KAMU B3)

Şema değişikliği yok. Rapor için ayrı bir tablo açılmadı: şema kilidi var ve leed-fb 29.09'da
**A seçeneğini** onayladı. Aylık rapor, ajansın kendi kiracısında bir `AuditEvent` satırıdır:

| Alan | Değer |
| --- | --- |
| `tenantId` | Ajans kiracısı. Asla NULL değildir, asla kurumun kiracısı değildir |
| `type` | `agency.report.generated` |
| `target` | Dönem, `YYYY-MM` (1 Ekim'deki koşu `2026-09` üretir) |
| `data` | `AgencyReportSnapshotSchema` (`src/lib/agency/report.ts`): `version`, `period`, `generatedAt`, `all`, `byOrgType`, `byProvince` |
| `actorId` | NULL (yazan cron) |

**Neden tasarım ödünü.** `AuditEvent` bir denetim izidir, rapor deposu değildir. Yine de burada
işe yarıyor, çünkü saklanan şey bir dosya değil, panonun **yayımladığı** güvenli çıktının
(`buildAgencyFunnel`: maskeli ve 5'e yuvarlanmış) kopyasıdır. Şema katıdır (`.strict()`):
kiracı id'si, kurum adı, ham sayı ya da il × tür hücresi taşıyan bir `data` doğrulamadan
geçmez. İndirme anında (`/api/agency/reports/[id]`) yazdırılabilir HTML (PDF'e tarayıcı
kaydeder) ve CSV (UTF-8 BOM) bu anlık görüntüden üretilir. R2'ye dosya yazılmaz.

**RLS.** `AuditEvent` `tenant_or_shared` kullanır. Satır `withTenant(ajans)` içinde yazılır
ve okunur; sorguda ayrıca `tenantId = ajans` koşulu vardır. Başka bir ajansın rapor id'si
404 döner.

**Tekrar.** Aynı `(tenantId, type, target)` zaten varsa koşu yeni satır yazmaz. Bunu tekil
indeks değil, uygulama kontrolü sağlar (şema kilidi). Inngest işlevi `concurrency: 1` ile
çalışır.

**Saklama.** `AuditEvent` için süre sınırı ve budama kodu yok (§7); satırlar kalıcıdır.
İleride bir budama işi yazılırsa `agency.report.generated` satırlarını ya dışarıda bırakmalı ya da
rapor geçmişinin o süreyle sınırlı olduğunu ajansa söylemelidir.

**İleride (C seçeneği, ayrı onay):** gerçek PDF (yeni bağımlılık), R2'de saklanan dosya ve
ayrı bir `AgencyReport` tablosu (tekil `(agencyId, period)`).

## 21. `PublicLead` — karne sonuç ekranı iletişim talebi (TASK-MULR765AR5G0C · FB KAMU)

Kayıtsız bir ziyaretçinin `/tr/fon-hazirlik` (`/en/funding-readiness`) sonuç ekranındaki formla, **açık rıza kutusunu işaretleyerek** bıraktığı iletişim talebi.

- **Kiracısız platform verisi, kişisel veri içerir (KVKK).** Ziyaretçinin hesabı yok, dolayısıyla `tenantId` de yok. Tablo `scripts/rls-models.ts` `SYSTEM_WIDE` listesinde ve `SYSTEM_SCOPE_POLICY` kümesinde. Migration: `prisma/migrations/add-public-lead.sql`.
- **DB seviyesi (NG-175 · SEC NG-170 O-1).** RLS **açık + FORCE**, tek politika `system_scope` (`ExpertPreRegistration` ile aynı gövde). Eskiden politikasızdı: kiracı oturumu (`fabrika_app` + `app.tenant_id`) her ziyaretçinin ad, e-posta, kuruluş ve `routedTenantId`'sini okuyabiliyordu (NG-170 S4: 6/6 satır). Şimdi `fabrika_app` kapsam dışında 0 satır görür ve yazamaz (hedef kiracı dahil: kiracıdaki kopya M18 tablolarındadır). `system_scope_open()` tabloyu yalnız üç amaca açar; `tenant-discovery`, `subject-scoped`, `platform-aggregate` mühürlü kapsamla da 0 satır görür. Erişim yolları ve amaçları:

  | Yol | Dosya | Amaç |
  |---|---|---|
  | Form gönderimi `submitPublicLead` | `src/lib/leads/public-lead.ts` | `public-intake` |
  | `/admin/leads` listesi `listPublicLeads` | `src/lib/leads/public-lead.ts` | `platform-admin` |
  | Gece silme `purgeOldPublicLeads` | `src/lib/leads/public-lead.ts` | `cross-tenant-job` |
  | İl → kuruluş aktarımı `forwardPublicLead` (oku, sahiplen, unmatched, geri ver) | `src/lib/leads/public-lead-intake.ts` | `cross-tenant-job` |
  | Eşleşmeyen listesi `listUnmatchedLeads` | `src/lib/leads/province-route.ts` | `platform-admin` |

  Migration: `prisma/migrations/public-lead-rls.sql` (yalnız kurulu `system_scope_open` PublicLead'i tanıyorsa açar; önce `prisma/rls.sql`, yani `pnpm db:rls`). Geri alma: `public-lead-rls.down.sql` (veri kaybı yok; aynı dağıtımda `rls.sql` ve `rls-models.ts` de geri alınmalı, yoksa sonraki `db:rls` politikayı geri koyar). Dağıtım sırası: **önce kod** (sarmalayıcılar eski DB'de de çalışır), sonra `db:rls` + migration. Ölçüm: `rls:verify` (kapsam dışı 0 / INSERT reddi / amaca kapalı) ve `tests/public-lead-rls.live.test.ts`.
- **Alanlar:** `name`, `email` (kırpılmış + küçük harf), `organisation`, `province?` (yalnız `TR_PROVINCES`), `district?`, `readinessCode?` (`<orgType>.<15 cevap>`), `readinessTotal?` / `readinessLevel?` (sunucuda `scoreReadiness` ile yeniden hesaplanır, istemciden alınmaz), `consentVersion` + `consentAt` (`PUBLIC_LEAD_CONSENT.version`, eski sürümle gelen form reddedilir), `transferConsent` (varsayılan `false`) + `transferConsentVersion?` + `transferConsentAt?` (NG-138: danışmanlığa aktarım için AYRI rıza; formun kendi rızası bunu kapsamaz), `transferConsentTenantId?` + `transferConsentOrgName?` (NG-204: rızanın verildiği kuruluşun kiracı id'si ve ziyaretçinin gördüğü ad; ikisi birlikte dolu ya da boş, CHECK `PublicLead_transfer_recipient_check`; FK yok, rıza kanıtı kiracı silinse de kalır), `source` (`fon-hazirlik`), `locale`, `ipHash?` (IP'nin `AUTH_SECRET`'tan türetilen anahtarla HMAC-SHA256'sı; yalnız hız sınırı için, ham IP saklanmaz), `createdAt`.
- **Bot koruması:** honeypot alanı (`website`) doluysa yanıt `ok` olur ama satır yazılmaz. Hız sınırı: e-posta başına 24 saatte 3, IP başına 1 saatte 10. Sayım ve yazma `pg_advisory_xact_lock` altında tek transaction'da yapılır, bu yüzden eşzamanlı istekler sınırı aşamaz.
- **Saklama:** `PUBLIC_LEAD_RETENTION_DAYS = 365` (öneri, karar patronda). Gece `public-lead-cleanup` işi (03:45 UTC) `createdAt < cutoff` tek filtresiyle siler ve silme olduysa `public_lead.purged` AuditEvent'i (`tenantId NULL`, yalnız sayı) yazar. NULL kiracılı denetim satırı yalnız `system_scope` altında yazılabildiği için silme ile denetim `withSystemScope('cross-tenant-job')` içinde tek transaction'dadır.
- **İndeksler:** `createdAt` (silme), `(email, createdAt)` ve `(ipHash, createdAt)` (hız sınırı), `(routeStatus, createdAt)` (eşleşmeyen listesi).
- KVKK: `docs/legal/processing-register.md` §18d.
- **Yönlendirme sonucu (NG-167):** `routeStatus?` (`routed` \| `unmatched`, CHECK), `routeReason?` (`province_missing` \| `province_unmapped` \| `tenant_refused` \| `consent_recipient_mismatch`), `routedTenantId?`, `routedAt?`. Rıza yoksa hiçbiri yazılmaz. Rıza var + il boş/eşlenmemiş → aktarım YOK, `unmatched` (platform admin listesi). Rıza var + il, rızanın verildiği kuruluştan (`transferConsentTenantId`) BAŞKA bir kiracıya eşli (harita sonradan taşındı ya da alıcı kaydı yok) → aktarım YOK, `unmatched/consent_recipient_mismatch` (NG-204). Bkz. §32.

## 22. `ExpertPreRegistration` — uzman ön kaydı (TASK-MVBIXPP33UK1B · FO-19 · FB-UZMAN)

Herkese açık uzman ön kayıt formunun (`POST /api/expert-preregistration`) kaydı. Kayıt hesapsızdır; e-postadaki tek kullanımlık bağlantı doğrular; ilk 100 doğrulanan uzmana "Kurucu Uzman" numarası (`founderNumber`) verilir.

- **Kiracısız platform verisi, kişisel veri içerir (KVKK).** `tenantId` yok. Tablo `scripts/rls-models.ts` `SYSTEM_WIDE` listesinde (ve `SYSTEM_SCOPE_POLICY` kümesinde); RLS **açık**, tek politika `system_scope` (FO-45, TASK-MVC6CTSCLO6LI). Migration: `prisma/migrations/add-expert-pre-registration.sql`, RLS ve kota kolonları: `expert-prereg-rls-mail-quota.sql` (geri alma: `.down.sql`, kayıpçı).
- **RLS kararı.** Canlı uygulama `fabrika_app` ile bağlanır; "deny-all" politika kaydı reddeder. `platform_read USING (true)` deseni (`Plan` tablosundaki gibi) ise tüm uzmanların kişisel verisini her kiracı oturumuna açar; kullanılmaz. Erişim bu yüzden kodda kapatılır: tek yazıcı/okuyucu `src/lib/expert-prereg/server/`, admin okuması `requirePlatformAdminApi()` arkasında.
- **DB seviyesi (FO-45, K-562266 = A).** RLS açık, tek politika `system_scope`. Uygulama rolü (`fabrika_app`) kapsam dışında 0 satır görür ve yazamaz; her okuma/yazma `withSystemScopeOn` içinde, amaçla: `public-intake` (kayıt, doğrulama), `platform-aggregate` (boş koltuk sayısı), `platform-admin` (liste, CSV). `SELECT` yetkisi kaldırılmadı: sistem kapsamı aynı yetkiyi kullanır; kaldırmak kapsamı da kırar. Ölçüm: `rls:verify` tabloyu da ölçer; `prisma/rls.sql` bloğu ve `expert-prereg-rls-mail-quota.sql` aynı politikayı taşır.
- **Alanlar.** `fullName`, `email` (kırpılmış + küçük harf, `@unique`), `emailVerifiedAt?`, `province` (81 il plaka kodu, `options.ts`), `title` (zorunlu "Unvan", FO-25), `organization` (zorunlu "Kurum", FO-25; sütun `String?`, FO-25 öncesi satırlar NULL; migration `add-expert-pre-registration-organization.sql`), `isFreelancer`, `expertiseAreas[]`, `roles[]`, `programmes[]`, `projectCodes?`, `orcid?` (checksum'lu, büyük harf), `linkedinUrl?` (https, linkedin.com), `languages[]` (isteğe bağlı, boş dizi geçerli, FO-25 / K-516717), `referredBy?`, `utmSource?` / `utmMedium?` / `utmCampaign?`, `kvkkAcceptedAt`, `visibilityConsentAt`, `marketingConsentAt?` (FO-144 / K-572235'ten beri yazılmaz: formda pazarlama kutusu yok, eski istemcinin gönderdiği `marketingConsent` şemada atılır; yalnız eski satırlarda dolu, yeniden kayıtta korunur; kolon ileride kutu geri gelirse diye durur), `consentTextVersion` (`kvkk-v4`, sunucu sabiti, FO-332: ürün adı NexaGrant; v3 FO-149; eski satırlar `kvkk-v1` / `kvkk-v2` / `kvkk-v3`, metinleri `content/` altında olduğu gibi durur), `locale` (`tr`/`en`: doğrulama e-postası ve yönlendirme dili), `verifyTokenHash?` (SHA-256; ham token yalnız e-postada), `verifyTokenExpiresAt?` (24 saat), `founderNumber?` (`@unique`), `status` (`pending` | `verified` | `disabled`), `ipHash?` (HMAC-SHA256; anahtar `EXPERT_PREREG_IP_SALT`, o yoksa `AUTH_SECRET`'tan türetilmiş anahtar, FO-23; ikisi de yoksa IP sınırı kapalıdır; düz IP asla saklanmaz), `verifyMailCount` / `verifyMailWindowStart?` (günlük posta kotası, FO-45 F5), `createdAt` (ilk kayıt zamanı; yeniden kayıtta değişmez, FO-26), `lastSubmittedAt?` (son gönderimin yazıya ulaştığı an: yeni satır ya da yeniden düzenlenen bağlantı; soğuma buna göre hesaplanır, FO-26).
- **M8 uzman havuzu (NG-52, K-579696 = A).** Doğrulanmış (`status = 'verified'`) satırlar M8 eşleştirme sayfasında koltuk adayı olarak gösterilir: `src/lib/expert-prereg/server/directory.ts` `listDirectoryExperts()` → `withSystemScopeOn(…, 'expert-directory', …)`. Okunan alanlar yalnız `id, founderNumber, province, isFreelancer, roles, programmes, expertiseAreas, languages` (ad, e-posta, kurum, ORCID, LinkedIn, proje kodları, IP, token YOK); kart takma adlıdır (`Uzman #n`, il, program, rol). Aday `SeatCandidate`'e yazılmaz, davet/iletişim/ücret yok (S2). DB tarafı (NG-188, SEC NG-185 F-1b): okuma `ExpertDirectoryEntry` görünümünden yapılır; `expert-directory` amacı taban tabloda hiçbir satır açmaz (`system_scope_open` false, NG-52'nin `expert_directory` politikası kaldırıldı), bu yüzden ad/e-posta/ORCID/LinkedIn/IP/token sütunları bu amaçla okunamaz. Ayrıntı aşağıda **`ExpertDirectoryEntry` (görünüm)**. Yeni tablo/sütun yok.
- **`ExpertDirectoryEntry` (görünüm, NG-188, SEC NG-185 F-1b).** M8 uzman rehberinin tek okuma yüzeyi; tablo değil, `prisma/rls.sql` + `prisma/migrations/expert-directory-view.sql` ile kurulur (`schema.prisma`'da yok, `prisma db push` görmez). Sütunlar yalnız kart: `id, founderNumber, province, isFreelancer, roles, programmes, expertiseAreas, languages` + `listOrder` (`row_number() OVER (ORDER BY founderNumber NULLS LAST, createdAt, id)`: NG-52 sırası korunur, `createdAt` dışarı çıkmaz). WHERE eski politikanın aynısı: mühürlü kapsam + amaç = `expert-directory` + `status = 'verified'` + `"visibilityConsentAt" IS NOT NULL`. Görünüm sahibinin haklarıyla çalışır (`security_invoker` kapalı); sahip `ExpertPreRegistration`'da RLS'yi atlar (FORCE yok), yani koruma bu WHERE'dir; sahip tablo sahibi değilse taban okuma RLS'ye düşer ve 0 satır döner (kapalı başarısızlık). `security_barrier = true`: çağıranın sızdıran fonksiyonu görünümün WHERE'inden önce satır görmez. Pencere fonksiyonu görünümü güncellenemez yapar (sahip haklarıyla tabloya yazma yolu yok); `fabrika_app` yalnız `SELECT` (rls.sql + `rls-app-role.sql` 3e). `db:rls` görünümü DROP + CREATE ile yeniden kurar (sapmış, fazla sütunlu görünüm OR REPLACE ile daraltılamaz). Alternatif: taban tabloda sütun düzeyi `GRANT` — `public-intake` aynı sütunları `fabrika_app` olarak okuyup yazdığı için kayıt/doğrulamayı kırar; SECURITY DEFINER küme fonksiyonu da aynı işi görürdü ama sütun kümesini katalogda görünür kılmaz ve `rls:verify`'ın sütun yoklaması `pg_attribute` yerine fonksiyon imzasını ayrıştırmak zorunda kalırdı. Ölçüm: `rls:verify` `probeExpertDirectory` (sütun kümesi, security_barrier, güncellenemezlik, kapsam dışı/düz SET/başka amaç 0, taban tablo 0, yalnız verified prob satırı, yazma reddi), `tests/system-scope.live.test.ts`, mutasyonlar `tests/rls-verify-system-scope-policy-set.live.test.ts`.
- **Rıza zamanı sunucu saatidir.** İstemci yalnız `true`/`false` gönderir; damga kayıt anında sunucuda atılır. `kvkkAccepted` ve `visibilityConsent` `true` olmadan kayıt reddedilir (`consent_required`).
- **Kurucu Uzman numarası.** Doğrulama, kayıt ile aynı `pg_advisory_xact_lock` altında tek transaction'da `max(founderNumber)+1` verir; 100'ü geçerse numara `null` kalır, uzman yine doğrulanmış sayılır. `founderNumber` `@unique` olduğu için iki doğrulama aynı numarayı alamaz. Aynı bağlantıya ikinci tıklama numarayı değiştirmez. Boş koltuk: `getRemainingFounderSeats()` = `100 − max(founderNumber)` (en az 0); doğrulamanın sıradaki numarasıyla aynı kaynak (FO-23).
- **Spam ve sınır.** Honeypot `website` doluysa 201 döner, satır yazılmaz. IP başına 1 saatte 5 gönderim (`REGISTRATION_IP_LIMIT`, aynı kilit altında sayılır) → 429. Sayım iki kaynaktan gelir: `ExpertPreRegistration.createdAt` (IP penceresinde açılan satırlar) + `ExpertPreRegAttempt` (aşağıda). Aynı e-posta, **doğrulanmış** (ya da admin'in `disabled` yaptığı) satır → 409 `already_registered`; bu 409 bir `ExpertPreRegAttempt` satırı yazar ve IP sınırını sayar (FO-26: doğrulanmış adrese tekrar tekrar gönderim IP başına sınırlanır). Aynı e-posta, **bekleyen** (`pending`) satır → yeni bağlantı ve 201 (FO-23): satır aynı transaction'da güncellenir (yeni token, yeni 24 saat, `ipHash`, `lastSubmittedAt` ve kota sayaçları bu denemeye çekilir). FO-45 (F6): satırın profili ve rızaları **değişmez** (ad, unvan, kurum, il, alanlar, `kvkkAcceptedAt`/`visibilityConsentAt`/`marketingConsentAt`/`locale`); doğrulama e-postası eski ad ve dille gider. `createdAt` **değişmez** (FO-26: ilk kayıt zamanı); bu deneme bir `ExpertPreRegAttempt` satırı da yazar, böylece IP sınırı sayar. Eski bağlantı geçersiz olur. Son gönderimden (`lastSubmittedAt`) en az 5 dk geçmeden yeniden kayıt → 429 (`RESEND_COOLDOWN_MS`; yoksa tek e-posta adresine sınırsız posta gider). Soğuma içindeki 429 bir deneme satırı yazmaz. **Günlük kota (FO-45 F5):** bir e-posta adresine 24 saatte en fazla 3 doğrulama e-postası (`EXPERT_PREREG_DAILY_MAIL_LIMIT`, `verifyMailCount` + `verifyMailWindowStart`; ilk kayıt da sayılır); aşılınca 429. Pencere, ilk postanın gönderildiği andan 24 saat sürer. Doğrulama e-postası gönderilemezse yeni satır geri silinir; yeniden kayıtta satır (token, IP, `lastSubmittedAt` ve kota sayaçları dahil) uzmanın elindeki önceki bağlantıya geri döner, kota da geri alınır. Doğrulama e-postası gönderilemezse 503 döner: doğrulanamayan bir kayıt kalmaz.
- **Hata sözleşmesi.** `400 { errors: { alan: kod } }`, kodlar: `required`, `invalid`, `too_short`, `too_long`, `too_many`, `invalid_email`, `unknown_slug`, `invalid_orcid`, `invalid_url`, `consent_required`. `409 { errors: { email: 'already_registered' } }`. `503 { error: 'mail_unavailable' | 'mail_failed' }`.
- **İndeksler.** `createdAt`, `(ipHash, createdAt)` (hız sınırı), `(status, createdAt)` (admin filtresi); `email`, `verifyTokenHash`, `founderNumber` benzersiz.
- **`ExpertPreRegAttempt` (FO-26, TASK-MVBLYRLP9ID93).** IP sınırının deneme sayacı: `id`, `ipHash` (HMAC, aynı anahtar), `createdAt`. Yalnız 409 ve yeniden kayıt yollarında yazılır; yeni satır zaten `ExpertPreRegistration` üzerinden sayılır. Saklama: her gönderim, `createdAt`'i 24 saatten (`ATTEMPT_RETENTION_MS`) eski satırları aynı transaction'da siler; cron işi yoktur, tablo en fazla 24 saatlik deneme tutar. Migration: `prisma/migrations/add-expert-pre-reg-attempt.sql` (geri alma: `.down.sql`, kayıpçı: sayaç sıfırlanır, `lastSubmittedAt` düşer). RLS **açık**, tek politika `system_scope` (K-562266 = A, `ExpertPreRegistration` ile aynı duruş): IP'nin HMAC'i takma adlı kişisel veridir ve tablo boşalırsa IP sınırı sıfırlanır; `fabrika_app` tabloyu yalnız `withSystemScope('public-intake')` içinde okur/yazar (`register.ts`), dışarıda 0 satır görür ve her yazma reddedilir. `SYSTEM_SCOPE_POLICY` (`scripts/rls-models.ts`), `rls.sql`'de ExpertPreRegistration bloğunun hemen altında. **Bilinçli istisna (m2, patron kararı):** bekleyen (`pending`) bir adrese gelen soğuma (`RESEND_COOLDOWN_MS`) ve günlük kota (`EXPERT_PREREG_DAILY_MAIL_LIMIT`) 429'ları deneme satırı yazmaz (`register.ts`). Bu 429'lar IP penceresine sayılmadığı için tekrarlanabilir, ama sızdırdıkları bilgi yalnız "adres bekleyen ve soğumada" (ya da aynı bekleyen adresin günlük kotası dolmuş) bilgisiyle sınırlıdır: bilinmeyen bir adres ilk denemede satır açar ve sayılır, doğrulanmış (ya da `disabled`) adres sorgusu ise her 409 bir deneme satırı yazdığı için IP sayacıyla (`REGISTRATION_IP_LIMIT`) kapalıdır. Gerekçe KVKK veri azaltımı: zaten reddedilen ve e-posta göndermeyen bir istek için gereksiz bir IP-HMAC satırı (takma adlı kişisel veri) üretilmez.
- **Saklama: karar verildi (patron, 2026-10-17, FO-50 / TASK-MVC91K7JYOWQC): 1 yıl, doğrulanmış ve doğrulanmamış kayıtlar için aynı.** Süre `EXPERT_PREREG_RETENTION_DAYS = 365` (`src/lib/expert-prereg/server/constants.ts`). Gece `expert-prereg-cleanup` işi (03:55 UTC) `createdAt < cutoff` satırlarını siler (`src/lib/expert-prereg/server/retention.ts`); silme olduysa `expert_prereg.purged` AuditEvent'i (`tenantId NULL`, yalnız sayı) aynı transaction'da yazılır, `cross-tenant-job` amacıyla. En yüksek `founderNumber` taşıyan satır da silinir (K-568932 = A); verilen son numara `ExpertFounderCounter` (§22a) içinde korunur, numara yeniden verilmez, koltuk sayısı (`100 − max`) değişmez.
- **Admin.** `listExpertPreRegistrations(filters)` ve `GET /api/admin/expert-preregistrations/export.csv` (filtreler: `province`, `area`, `status`, `q`). Yalnız platform admin; yetkisizde satır okunmaz (401/403). CSV: `ad, e-posta, il, alanlar, roller, programlar, durum, founderNumber, createdAt, lastSubmittedAt`, UTF-8 BOM, CRLF, formül kaçışlı (`= + - @`).

### 22a. `ExpertFounderCounter` — Kurucu Uzman numara sayacı (FO-50 · K-568932 = A)

Verilen son Kurucu Uzman numarası. Tek satır (`id = 1`, `CHECK ("id" = 1)`); `lastNumber` yalnız artar (`CHECK ("lastNumber" >= 0)`). **"Yalnız artar" DB'de zorlanır (crw-fb Ö-1):** `BEFORE UPDATE` trigger'ı `ExpertFounderCounter_no_decrease` (`expert_founder_counter_no_decrease()`) değeri düşüren her UPDATE'i her rol için reddeder (`check_violation`); `fabrika_app`'in tabloda `DELETE`/`TRUNCATE` yetkisi yoktur (migration, `prisma/rls.sql` ve `prisma/rls-app-role.sql` üçü de geri alır, çünkü `db:rls-role` tüm tablolara DELETE verir). Sahip rolü test değerini DELETE + INSERT ile geri koyar (`tests/helpers/expert-prereg-live-lock.ts`). Neden ayrı: numara satırlardan (`max + 1`) türetilseydi 1 yıllık silme en yüksek numaralı satırı silemezdi (numara yeniden verilirdi); sayaç sayesinde satır tamamen silinir, numara ve koltuk yerinde kalır.

- **Alanlar.** `id Int @id @default(1)`, `lastNumber Int @default(0)`, `updatedAt`.
- **Kiracısız platform verisi, kişisel veri YOK.** `SYSTEM_WIDE` ve `SYSTEM_SCOPE_POLICY` listesinde (`scripts/rls-models.ts`); RLS **açık**, tek politika `system_scope` (`ExpertPreRegistration` ile aynı gövde; `prisma/rls.sql` ve migration aynı bloğu taşır). `fabrika_app` kapsam dışında 0 satır görür, yazamaz. Amaçlar: `public-intake` (doğrulama: oku + artır), `platform-aggregate` (boş koltuk: oku), `cross-tenant-job` (gece silme: satırlardaki en yüksek numaraya çek). `rls:verify` bu tabloyu da ölçer (ölçüm rolünde DELETE/TRUNCATE olmadığı dahil).
- **Yazıcılar.** Yalnız `src/lib/expert-prereg/server/founder-counter.ts` (`lastFounderNumberGiven`, `recordFounderNumberGiven`), `EXPERT_PREREG_LOCK_KEY` advisory kilidi altında. `recordFounderNumberGiven` tek SQL'dir (`INSERT … ON CONFLICT DO UPDATE … WHERE EXCLUDED > stored`): değer büyük değilse hiçbir şey yazmaz, `updatedAt` "son numara verilme anı" olarak kalır; gece silme işinin ikinci koşusu satıra dokunmaz (crw-fb Ö-2).
- **Migration.** `prisma/migrations/add-expert-founder-counter.sql`: tabloyu kurar, başlangıç değeri mevcut satırlardaki en yüksek `founderNumber` (`ON CONFLICT … WHERE EXCLUDED > stored`: tekrar koşu ya da geç koşu sayacı asla düşürmez). İdempotent. `prisma db push` ile kurulmuş, satırı olmayan bir DB'de de kod doğru numarayı verir (satırlardaki en yüksek numara sayılır). Geri alma: `.down.sql` (tabloyu düşürür; en yüksek numaralı satır silinmişse kayıpçı — kodla birlikte geri alınmalı).

## 23. `BlogPost` — herkese açık blog yazıları (AKTAR-MURBCJ0A-1 · okuma süresi TASK-MVDSY96TB1EPM · FO-84 · `readTime` kaldırıldı TASK-MVDVCQW3GI94J · FO-87)

`/[locale]/blog`, `/[locale]/blog/<slug>` ve ana sayfadaki blog bölümünün yazıları; tek yazıcı `/admin/blog` (`requirePlatformAdmin`).

- **Kiracısız platform verisi.** `tenantId` yok; `scripts/rls-models.ts` `SYSTEM_WIDE` listesinde, RLS kapalı (politikasız, `add-blog-post.sql` açıkça `DISABLE` eder). Yazma `src/lib/blog.ts` üzerinden, her yazma bir `AuditEvent` ile aynı transaction'da.
- **Okuma süresi = `readMinutes Int` (NOT NULL, dakika, 1–120).** Sınır DB'de `CHECK BlogPost_readMinutes_range`, kodda `BLOG_READ_MINUTES` (`src/lib/blog-read-time.ts`), sunucu doğrulamasında zod (`validateBlogInput` → `invalid_read_time`). Sayfalar metni **okuyucunun** dilinde `t('blog.readMinutes', { min })` ile yazar (tr `"{min} dk okuma"`, en `"{min} min read"`). Admin formu `type="number"`; yeni yazıda içerikten `estimateReadMinutes` ile dolar, admin elle değiştirince tahmin durur.
- **Migration'lar (sırayla):**
  - `prisma/migrations/blog-read-minutes.sql` (FO-84): kolon + CHECK + backfill. Backfill `readTime`'taki ilk tamsayıyı alır, 1–120 ise o; değilse içerikten `estimateReadMinutes` ile aynı sayımı yapar, en az 1. `readTime` artık yoksa backfill ve `DROP NOT NULL` atlanır, böylece dosya her koşuda idempotent kalır. Geri alma: `blog-read-minutes.down.sql` (`readTime`'ı dakikadan Türkçe "N dk okuma" olarak yeniden yazar, NOT NULL'ı geri koyar, kolonu düşürür).
  - `prisma/migrations/drop-blog-read-time.sql` (FO-87): `readMinutes` NOT NULL olur, eski serbest metin `readTime` kolonu düşer. NULL `readMinutes` varsa doldurmaz, `RAISE EXCEPTION` ile durur; tek doldurucu `blog-read-minutes.sql`'dir. Canlı sıra: önce kod, sonra bu dosya. Geri alma: `drop-blog-read-time.down.sql` (`readTime TEXT` döner, "N dk okuma" ile dolar, `readMinutes` yeniden nullable olur); önce down, sonra kod.

## 24. Partner Search ilanları (FO-58 · TASK-MVCH1YZXDOED · PS-K1)

Funding & Tenders Portal "Partner search" ilanları (keşif: `docs/agent-results/TASK-MVCGPI6V3RM1F-be-fb.md`, plan: `…-leed-fb.md`). Bu kart yalnız şemayı ekler; yazıcı K2 ingestor'dur. Migration: `prisma/migrations/add-partner-search.sql` (geri alma: `add-partner-search.down.sql`, `scripts/apply-migrations.sh --down` ile).

- **Kiracısız referans veri (CORDIS gibi).** `PartnerSearchAnnouncement`, `PartnerProfileSnapshot`, `PartnerSearchIngestionRun`, `UnmatchedOrganization`, `PartnerSearchTopicStat`, `PicLookupBudget`, `PlatformSetting` → `tenantId` yok, politika yok, `scripts/rls-models.ts` `SYSTEM_WIDE`'da; migration RLS'i açıkça `DISABLE` eder (Supabase `ensure_rls`, CHECK 4c).
- **Kişi verisi yok (GDPR).** Person Profile ilanları satır olarak hiçbir tabloda tutulmaz; `PartnerSearchTopicStat(topicIdentifier → personAnnouncementCount)` yalnız anonim sayıdır. `raw` alanına allowlist'teki alanlar yazılır, `ecasId` asla.
- **`PartnerSearchAnnouncement`:** `externalId` (portal anahtarı, unique), `topicIdentifier` → `Topic.identifier` (FK, `ON DELETE CASCADE`), `callIdentifier?`, `type` (`EXPERTISE_REQUEST|EXPERTISE_OFFER`), `description VARCHAR(500)`, `publishedAt?`, `lastSeenAt`, `withdrawnAt?`, `organizationPic?` (eşleşince `CordisOrganization.organisationId`), `organizationName`, `organizationType` (`HES|REC|PRC|PUB|OTH`, varsayılan `OTH`) + `isSme`, `country` (ISO2), `city?`, `keywords`/`programmeCodes` (JSON dizi), `source` (`PORTAL_API|TOPIC_HTML`). İndeksler: `topicIdentifier`, `organizationPic`, `country`, `type`, `lastSeenAt`.
- **`PartnerProfileSnapshot`:** PIC başına son portal profili (her çekimde üzerine yazılır): ad, tip, ülke/şehir, açıklama, anahtar kelimeler, `projectCount`, `announcementCount`, `programmes`, `topCollaborators`, `fetchedAt`. FK yok: profil CORDIS'te olmayan bir kuruma ait olabilir.
- **`PartnerSearchIngestionRun`:** koşu kaydı — `trigger` (`FULL|INCREMENTAL|MANUAL`), `status` (`RUNNING|SUCCESS|PARTIAL|FAILED`), `topicsScanned`, `created`, `updated`, `withdrawn`, `personAnnouncementCount`, `error`.
- **`PartnerSearchAnnouncement.missedScans`** (`INT`, varsayılan `0`): portal taramasında art arda kaç kez görülmediği. Portal geri çekilen ilanların kimliğini vermez (yalnız sayı döner), bu yüzden `withdrawnAt` iki ardışık taramada yokluktan (`WITHDRAW_AFTER_MISSED_SCANS = 2`) hesaplanır; satır yeniden görülünce sayaç sıfırlanır. Migration: `prisma/migrations/add-partner-search-missed-scans.sql` (idempotent `ADD COLUMN IF NOT EXISTS`).
- **`PartnerSearchAnnouncement.missedScanAt`** (`TIMESTAMP(3)`, NULL olabilir): son sayılan kaybın UTC günü. Aynı UTC gününde ikinci bir koşu (03:00 gece koşusu + K1 artımlı koşu, ya da düşen koşunun yeniden çalıştırılması) aynı boşluğu ikinci kez saymaz; `withdrawnAt` iki **farklı günde** yokluktan sonra yazılır. Migration: `prisma/migrations/add-partner-search-missed-scan-day.sql` (`ADD COLUMN IF NOT EXISTS`; geri alma `.down.sql`).
- **Partner Search saklama (FO-65 F4):** `partner-search-retention` işi (03:15 UTC, `partner-search` kuyruğu, bayrak kapalıyken no-op) — CLOSED topic'in ilanları `lastSeenAt` + 90 gün, `withdrawnAt` + 30 gün sonra silinir; `source='partner_search'` `RawFetch` satırları CLOSED topic için `fetchedAt` + 90 gün. Kod: `src/modules/m1/server/partner-search/retention.ts`.
- **Partner Search özet maskesi (FO-65 F3):** `summary` metnindeki e-posta ve telefon, `description`'a ve `RawFetch.payload`'a yazılmadan önce `[email]` / `[phone]` olur. Kural tek yerde: `src/modules/m1/server/partner-search/mask.ts` (`maskContact`).
- **`PlatformSetting`:** platform geneli anahtar/değer bayrakları (`key` PK, `value` JSONB, `updatedAt`). Kiracısız, politikasız, `SYSTEM_WIDE`; RLS migration'da açıkça `DISABLE` edilir (CHECK 4c). İlk anahtar: `partner_search_ingestion_enabled` (varsayılan `false`; `isPartnerSearchIngestionEnabled()` yalnız `true` değeriyle açık sayar, okuma hatasında kapalı kalır). Migration: `prisma/migrations/add-platform-setting.sql` (`ON CONFLICT DO NOTHING`, operatörün değiştirdiği değeri ezmez). **Yazma (FO-65 F2):** `fabrika_app` tabloda yalnız `SELECT` hakkına sahip ve yazıcı fonksiyonu da **çağıramaz** (`EXECUTE` yalnız sahipte, PR #163 crw-fb B1). Tek yazma yolu `set_platform_setting(key, value, actor)` (SECURITY DEFINER, yalnız bu anahtar ve boolean değer; `actor` boş/NULL ise ya da silinmemiş bir `isPlatformAdmin` kullanıcısı değilse reddeder) — satırı yazar ve aynı çağrıda `AuditEvent` (`type='platform.setting.changed'`, `actorId` = admin `User.id`, `tenantId` NULL, `system_scope` sahip yolu) üretir. Uygulama tarafı: `setPartnerSearchIngestionFlag(ownerDb, enabled, actorId)` — `ownerDb` sahip bağlantısıdır (uygulamanın `prisma`'sı değil), `actorId` oturumdaki adminin id'si. Migration: `prisma/migrations/platform-setting-write-guard.sql` (+ `.down.sql`); `prisma/rls-app-role.sql` yeniden koşunca da `REVOKE`'u tekrarlar.
- **`PicLookupBudget` (FO-389):** davetsiz hesapların PIC sorguları için günlük **ortak** bütçe sayacı (`day` `'YYYY-MM-DD'` UTC PK, `count`, `updatedAt`). Kiracısız (sayaç tüm davetsiz hesaplar için tek), politikasız, `scripts/rls-models.ts` `SYSTEM_WIDE`'da; migration RLS'i açıkça `DISABLE` eder (CHECK 4c). **Politika gerekçesi:** satırda kiracı ya da kişi verisi yok, yalnız bir gün ve bir sayı; hangi hesabın sorduğu kaydedilmez. Tek yazıcı `src/lib/pic-budget.ts` `spendUnsolicitedPicLookup`: tek atomik `INSERT … ON CONFLICT (day) DO UPDATE … WHERE count < tavan RETURNING` (yarışta tavanı aşamaz, çok süreç/yeniden başlatmada aynı satırı görür). Harcama profil işleminin **dışında**, kendi bağlantısında commit olur (kaydı geri alınan soru da sayılır). Tavan `PIC_UNSOLICITED_LOOKUPS_PER_DAY` (`src/lib/pic.ts`, 2000). `fabrika_app` yalnız `SELECT, INSERT, UPDATE` alır; `DELETE`/`TRUNCATE` geri alınmıştır (`rls-app-role.sql`). Eski günlerin satırları tutulur (günde 1 satır). Migration: `prisma/migrations/add-pic-lookup-budget.sql` (+ `.down.sql`).
- **`UnmatchedOrganization`:** CORDIS'te karşılığı bulunamayan ilan sahibi kurumlar. Tekil anahtar `matchKey` = `pic:<PIC>` ya da `name:<ÜLKE>:<normalize ad>` (`matchKeyFor`; PIC ve ad ikisi de boşsa anahtar yok, satır yazılmaz); `resolvedPic` eşleşme sonradan bulununca doldurulur (admin konsolunda elle eşleme, audit'li: FO-64). Ingestor `matchPic` yine `unmatched` dönerse ilanın `organizationPic`'ini bu satırın `resolvedPic`'inden yazar; elle eşleme sonraki taramada silinmez ve aynı kurumun yeni ilanları da bağlanır (FO-64 inceleme B1). Otomatik eşleşme (`matched`) her zaman önceliklidir.
- **PIC eşleme:** `src/modules/m1/server/partner-search/match-pic.ts` `matchPic` (saf): 1) tam PIC, 2) aynı ülkede ad benzerliği (`normalizeOrgName` + aksan temizliği, Levenshtein oranı, eşik varsayılan `0.9`), 3) aksi halde `unmatched`. Ülkesiz kayıt bulanık eşleşmez. Bulanık eşleşme için üç ek koşul (FO-58 D1 / FO-116): **PIC önceliği**: ilanın PIC'i gelmişse ve CORDIS'te yoksa bulanık eşlemeye düşülmez, `unmatched` + `pic:<PIC>` anahtarı döner (PIC tüzel kişinin kimliğidir); **fark payı** `DEFAULT_PIC_MATCH_MARGIN = 0.05`: birinci ile ikinci en iyi aday (aynı `organisationId` rakip sayılmaz) arasındaki fark bunun altındaysa `unmatched` (eşit iki aday dahil); **token koruması**: ortak olmayan kelimeler birebir eşleşen tek-harf yazım hatası çiftleri olmalı (4+ harf; `MADIRD`/`MADRID` kabul, `PAVIA`/`PADOVA` ve `SURREY`/`SUSSEX` red). Ad normalize olunca boş kalırsa (ör. yalnız `GmbH`) `matchKeyFor` ham adı büyük harfle kullanır. Ham ad da boşsa (`''`, yalnız boşluk) ve PIC yoksa `matchKeyFor` `null` döner (`PicMatch.unmatched.matchKey: string | null`): iki adsız kurumu ayıracak bir şey yoktur, ortak `name:<ÜLKE>:` anahtarı onları birleştirirdi; K2 bu durumda `UnmatchedOrganization` satırı yazmaz. Adım 1 (tam PIC) ülkeden bağımsız tüm kurumlara karşı yapılır (K2 PIC ile ülke filtresi olmadan arar); adım 2 (bulanık) yalnız aynı ülkedeki adayları okur.
- **`CordisOrganization` additive alanlar:** `hasActiveAnnouncements` (varsayılan `false`), `lastAnnouncementAt?`, `portalProfileFetchedAt?`. Sabit varsayılanlı `ADD COLUMN` PG 11+'da yalnız metadata'dır; hiçbir CORDIS değeri değişmez (dev klonunda satır md5'i öncesi/sonrası aynı ölçüldü).
- **Kiracıya özel tek tablo: `PartnerSearchQuotaUsage`** (`tenantId`, `month` `'YYYY-MM'` UTC, `count`; tekil `(tenantId, month)`; FK `Tenant` `ON DELETE CASCADE`). Discover sorgu sayacı; strict `tenant_isolation` hem migration'da hem `prisma/rls.sql`'de, yazımlar `withTenant` içinde. **Yazan (FO-61):** `consumePartnerSearchQuery` (`src/modules/m1/server/partner-search/api.ts`) — tek `INSERT … ON CONFLICT (tenantId, month) DO UPDATE SET count = count + 1 WHERE count < limit RETURNING count`; satır dönmezse ay dolmuştur (429). Eşzamanlı istekler satır kilidinde sıraya girer; limit plan kataloğundan (`PlanGrant.limits.partner_search_queries_monthly`). Sayaç, okuduğu sayfayla aynı `withTenant` işleminde artar: okuma düşerse sayaç geri alınır. Yeni tablo/sütun yok.
- **Seed yok:** tablolar portaldan gelen veriyle dolar; sahte ilan yazmak kanıt disiplinine (CLAUDE.md §7) aykırı olurdu.

## 25. M17 Interreg Ön Değerlendirme (FO-186 · TASK-MVRIV9LCDHYKO)

Plan: `docs/agent-results/FO-185-leed-fb.md` (kartta "M15"; M15 Post-Award'a ait olduğundan modül kimliği **M17**, anahtar `interreg-review`). Çıktı **iç ön değerlendirmedir, resmî puan değildir**. Rubrik kaynağı: FO-187 (`docs/agent-results/TASK-MVRIVI9Y62503-crw2-fb.md` §1.3, §5) — Annex 7 Quality Assessment Grid, 14 alt kriter × 4 = 56, yarım puan, 0 yok, eşik 37, eleme 1.1/1.2/5.1 < 3. **FO-185 taslağı (7 ölçüt / 100 puan / ağırlık) geçersizdir**; ağırlık ve 0..100 ham puan bu modelde yoktur. Migration: `prisma/migrations/add-interreg-review.sql` (geri alma: `.down.sql`). Rubrik tabloları (`InterregRubric`, `InterregRubricCriterion`) **platform referans verisidir** (`Plan` gibi `platform_read` + `platform_no_*`; uygulama rolü okur, yazamaz). Yazma yalnız politikayla değil yetkiyle de kapalıdır: `fabrika_app`'in bu iki tabloda yalnız `SELECT` yetkisi var; `INSERT/UPDATE/DELETE/TRUNCATE` REVOKE edilmiştir (se-fb D3; migration + `prisma/rls-app-role.sql` adım 3c + `prisma/rls.sql`, çünkü `db:rls-role` her koşuda tüm tablolara DML verir). Diğer üç tablo kiracıya özel; strict `tenant_isolation` hem migration'da hem `prisma/rls.sql`'de, tüm erişim `withTenant` içinde ve yükleyen kullanıcıya daraltılmış (`tenantId` + `userId`).

- **`InterregRubric`:** bir programın bir çağrı/proje türü için yayımladığı değerlendirme tablosu, veri olarak. `id` okunur bir anahtar (`interreg-next-bsb.call2.regular`), `programme`, `label`, `isDefault`, `allowedMarks` (JSONB sayı dizisi, BSB: `[1,1.5,…,4]`), `maxRaw`/`passRaw` `Decimal(6,1)` (BSB: 56 / 37; `passRaw` null = toplam eşiği yok), `budgetMinMinor`/`budgetMaxMinor` + `currency` (cent, BSB Regular: 50 000 100 – 150 000 000 EUR), `maxDurationMonths`, `source` (JSONB: tablo/prosedür adı, URL, değerlendirici kılavuzunun durumu), `tieBreak`, `programChecks` (JSONB; kural + kaynak sayfa). **Yayımlanmış bir tablo yerinde değiştirilmez**; revize tablo yeni `id` olur (analizler eski tabloya bağlı kalır).
- **`InterregRubricCriterion`:** tablonun alt kriteri: `criterionKey` (tekil `(rubricId, criterionKey)`), `officialRef` (`1.1`…`7.2`), `section`, `group` (`strategic|operational`), `name`, `position`, `maxMark` `Decimal(4,1)`, `knockoutBelow?` (bu puanın altı = eleme), `subQuestions`/`afSections` (JSONB), `evidenceExpectation?`. FK rubrik `ON DELETE CASCADE`.
- **Puan aritmetiği** (`src/modules/m17/rubric.ts`, saf): `raw = Σ mark`, `score100 = round(raw/maxRaw×100, 1)`, geçer = `raw ≥ passRaw` ∧ hiçbir `mark < knockoutBelow`. Kodda rakam yok; hepsi rubrik satırından.
- **Seed:** `prisma/seed-data/interreg-rubrics.ts` → `prisma/seed-interreg-rubrics.ts` (`pnpm db:seed` içinde; demo değil, her ortamda gerekir). Upsert, iki kez koşması aynı satırları yazar; `rubricProblems` tutarsız tabloyu (Σ maxMark ≠ maxRaw vb.) yazmadan reddeder. `id` zaten varsa puanlama kimliği (`maxRaw`, `passRaw`, `allowedMarks`, kriter anahtarları ve her birinin `maxMark`/`knockoutBelow`'u) veriyle aynı olmalıdır; değilse seed "yeni id kullan" diyerek durur (crw2 B1). Metin düzeltmesi (ad, alt soru, kaynak) yerinde yazılır. Yazımdan sonra rubrik DB'den okunur ve yeniden denetlenir (sütunun yuvarladığı bir değer burada yakalanır); her rubrik tek transaction'dır, reddedilen koşu iz bırakmaz. Test: `tests/m17-interreg-rubric-seed.live.test.ts`; seed verisi FO-187 §5.2 ile alan alan `tests/fixtures/m17/fo187-bsb-call2-regular.json` altın dosyasına karşı sınanır. **Puanlamadan önce:** F2 puan yazıcısı rubriği `loadScorableRubric(tenantId, id)` (`src/modules/m17/server/rubrics.ts`) ile okur; DB'deki hâl `rubricProblems`'ten geçmezse `ScorableRubricError('rubric_inconsistent')` fırlatır (FO-196), `getRubric` ile ham okuyup `scoreMarks`'a vermez. Yalnız tam metni FO-187'de olan BSB 2. çağrı Regular tohumlanır; SSP (12 × 4 = 48, eşik 32) alt soruları çıkarılınca yeni kayıt olarak eklenir.

- **`InterregAnalysis`:** bir çağrı rehberi + bir proje dosyası, bir rubriğe karşı (`rubricId` zorunlu, FK `ON DELETE RESTRICT`; oluştururken verilmezse `isDefault` rubrik). `status` (`InterregAnalysisStatus`): `UPLOADING` → (`call` çıkarıldı) `CALL_READY` → (iki metin de var) `READY` → F2: `ANALYZING` → `DONE` | `FAILED`. `EXTRACTING` asenkron çıkarıcı için ayrılmıştır; F1 rotası istek içinde çıkarır ve bu durumu yazmaz. Her belge için `<slot>FileName`, `<slot>Format` (`InterregDocFormat`: `PDF|DOCX|MD|TXT`), `<slot>Pages` (yalnız PDF), `<slot>Chars`, `<slot>Text`, `<slot>ExtractedAt`, `<slot>TextExpiresAt` (`slot` = `call` | `project`). **Yüklenen dosyanın baytları hiçbir yerde saklanmaz**; yalnız çıkarılan metin, **yuva başına** 30 gün: çağrı rehberi ve proje dosyası ayrı ayrı, kendi yüklemesinden itibaren süre alır (`callTextExpiresAt`, `projectTextExpiresAt`; FO-195 B5, lider kararı 2026-10-28; eski tek `textExpiresAt` kaldırıldı). Bir yuvanın yeniden yüklenmesi yalnız o yuvanın süresini yeniler. CHECK `InterregAnalysis_text_expiry_pair`: bir yuvanın metni varsa süresi de vardır, yoksa ikisi de NULL (süresiz kalan metin DB düzeyinde yazılamaz). Kısmi indeksler `InterregAnalysis_callTextExpiresAt_idx` / `…projectTextExpiresAt_idx` (`WHERE … IS NOT NULL`, temizleme işi için; Prisma şemasında değil migration'da). Migration `add-interreg-slot-retention.sql` (+ `.down.sql`): eski satırlar için süre `COALESCE(<slot>ExtractedAt, updatedAt) + 30 gün`. **Temizleme işi `m17-text-retention`** (her gece 03:35 UTC, `src/lib/jobs/tasks/m17-text-retention.ts` → `purgeExpiredInterregText`, `src/modules/m17/server/retention.ts`): süresi dolan yuvanın **tamamını** (`FileName`, `Format`, `Pages`, `Chars`, `Text`, `ExtractedAt`, `TextExpiresAt`) NULL yapar, etkilenen analizlerin `status`'unu aynı SQL kuralıyla yeniden hesaplar (`STATUS_FROM_TEXTS_SQL`, `src/modules/m17/server/status.ts`: iki metin → `READY`, yalnız çağrı → `CALL_READY`, yoksa `UPLOADING`) ve o analizlerin `InterregAnalysisResult` / `InterregCriterionMark` satırlarını siler (kanıt alıntıları metinden türer, metin gidince alıntı kalamaz). `ANALYZING` durumundaki analizin `status`'u değişmez (metin yine silinir; F2 sözleşmesi: NULL metin = süresi dolmuş, yeniden yükleme iste). İş idempotenttir (her yuva kendi süresiyle filtrelenir, ikinci koşu 0 satır), 500'lük gruplarla çalışır, `withSystemScope('cross-tenant-job', 'm17-text-retention.purge')` ile kiracılar arası okur; hata `SystemAlert` (`error`) yazar ve yeniden denenir. Kullanıcı `DELETE` ile her an siler. FK `Tenant` ve `User` `ON DELETE CASCADE`: kullanıcı ya da kiracı silinince yüklemeler, sonuçlar ve işaretler de gider (canlı test: `tests/m17-text-retention.live.test.ts`, `tests/gdpr-data-subject.live.test.ts`). Dışa aktarma ve KVKK silme kapsamı: ADR-0010 Ek A.4 (76–78). Tekil `(id, tenantId)` ve `(id, tenantId, rubricId)`: alt tabloların bileşik FK hedefleri. Durum kuralı tek yerdedir: `STATUS_FROM_TEXTS_SQL` (`saveDocument` kilitli satırda, temizleme işi toplu UPDATE'te kullanır); gerçek DB testi `tests/m17-interreg-analyses.live.test.ts`. İndeks `(tenantId, userId, createdAt)` liste için.
- **`InterregAnalysisResult`:** F2 LLM çıktısı, analiz başına en çok bir satır (`analysisId` tekil). `rawScore` `Decimal(6,1)` (rubriğin ölçeğinde, BSB: 14..56), `score100` `Decimal(4,1)` (orantılı görünüm, iç tahmin), `passesThresholds`, `knockouts` (JSONB: eşiğin altındaki `criterionKey`'ler), `reportMarkdown`, `redFlags`/`improvements` (JSONB dizi), `rewriteSample` (JSONB), `programChecks` (JSONB `[{key, status: met|missing|unclear, note}]` — tablonun dışındaki program kuralları; FO-188, `add-interreg-f2-result.sql`), `model`, `promptHash`. Rubrik sürümü analizin `rubricId`'sidir. FK `(analysisId, tenantId)` → `InterregAnalysis(id, tenantId)` `CASCADE`: başka kiracının analizine sonuç yazılamaz (FK denetimi RLS'den geçmez, bu yüzden tek kolonlu FK yetmezdi — se-fb D1). F1'de yazan yok. Yeni bir belge yüklenince silinir (eski sonuç yeni metne ait değildir). F2'de yazan: `src/modules/m17/server/evaluate.ts` (`POST /api/interreg-review/analyses/[id]/evaluate`).
- **`InterregCriterionMark`:** alt kriter başına puan (F2): `rubricId` (analizin `rubricId`'sinin kopyası), `criterionId`; iki bileşik FK: `(analysisId, tenantId, rubricId)` → `InterregAnalysis(id, tenantId, rubricId)` `CASCADE` ve `(criterionId, rubricId)` → `InterregRubricCriterion(id, rubricId)` `RESTRICT` (tekil `(id, rubricId)`). Böylece puan yalnız kendi kiracısının analizine ve o analizin rubriğindeki bir kritere bağlanabilir (se-fb D1, crw2 Ö5). `mark` `Decimal(4,1)` (rubriğin `allowedMarks`'ından biri — `scoreMarks` doğrular), `strengths`/`weaknesses` (JSONB), `evidenceQuote?`, `evidenceLocator?` (ilk kanıt), `evidence` (JSONB `[{quote, location}]` — tüm kanıtlar; FO-188); tekil `(analysisId, criterionId)`. Ağırlık yok (Annex 7 ek ağırlık uygulamaz). F2'de `evaluate.ts` yazar.
- **CHECK yok:** puan ölçeği F2 yazıcısında `scoreMarks` ile doğrulanır (`prisma db push` ile kurulmuş bir DB'de `CREATE TABLE IF NOT EXISTS` içindeki CHECK kaybolur — add-blog-post.sql notu).
- **Analiz seed'i yok:** analiz satırları kullanıcı yüklemesiyle oluşur.

## 26. `SeatCandidate.score` tek ölçek 0–100 (FO-147 · TASK-MVO2QV0INUNSW)

Kolonu iki puanlayıcı yazar: konsorsiyum oluşturucunun "Aday Bul"u (`src/lib/scoring/consortium.ts`) ve
koltuk eşleştiricisi (`src/modules/m8/server/matching.ts`). Boyutları farklıdır, saklanan sayı aynı
tabloda kıyaslanır; ikisi de sonucu kendi maksimumuna oranla `normalizeSeatScore()`'a
(`src/lib/scoring/seat-score.ts`) verir ve **0–100**, iki ondalık, kırpılmış (clamp) değer saklar.
Rakip cezası skoru 0'ın altına düşüremez; sıra ham toplamdan kurulur, kırpma sırayı değiştirmez.

| Yazan | `breakdown` anahtarları | Ham aralık | 0–100'e |
|---|---|---|---|
| Aday Bul (FO-63 sonrası) | `topicExperience, networkCentrality, countryDiversity, smeBonus, warmthBonus, liveDemandSignal, liveDemandReason, total` | 0–1 ağırlıklı | `consortiumSeatScore` |
| Aday Bul (FO-63 öncesi, eski satır) | aynı, `liveDemandSignal` yok, `total` 0–10 | 0–10 | `consortiumSeatScore`, sinyal 0 |
| Eşleştirici (K-578751 sonrası) | `topicExperience, geographicBalance, collabHistory, rivalRisk` (ham puan; 34 + 33 + 33, ceza −10) | −10…100 | `matchSeatScore` = toplam / 100 |
| Eşleştirici (K-578751 öncesi, eski satır) | yukarıdakiler + `relationshipWarmth, centrality` | −10…90 | `legacyMatchSeatScore` = toplam / 90 |

**Şema değişikliği yok.** Ölçek sürümü kolonu (ör. `scoreScale`) eklenmedi: her satır kendi
`breakdown`'ını taşıdığı için skor ondan yeniden türetilebilir; ölçek bilgisi breakdown'un biçiminden
okunur ve yeniden hesaplama bu yüzden kendiliğinden idempotenttir. Eşleştiricinin `breakdown`'ı ham
puan olarak kalır (UI dökümü bunları gösterir); Aday Bul satırlarında `breakdown.total` = `score`.

Eski satırlar: `pnpm jobs:seat-rescore -- --all-tenants` (kuru koşu) / `-- --all-tenants --apply` (`scripts/rescore-seat-candidates.ts`). Kapsam bayrağı zorunlu: `--tenant <id>` ya da `--all-tenants`; değersiz `--tenant` hata verir. Yerel olmayan `DATABASE_URL` üzerinde `--apply` ayrıca `--confirm-remote-db` ister (`src/lib/scoring/seat-rescore-args.ts`).
Kiracı başına `withTenant` içinde okur/yazar, koltuğun sıralarını yeni skora göre yeniden kurar,
`breakdown`'ı iki puanlayıcıdan hiçbirine uymayan koltuğu dokunmadan "SKIPPED" diye raporlar. İkinci
koşu 0 satır yazar. Canlı ortamda ayrı onayla koşulur.

## 27. G1'in okuduğu kayıtlar: `OrgReadiness`, `InternalApproval`, `PartnerBudgetShare` (NG-34 · K-577084)

Şartname §12 ve §17.1'in üç kaydı. Yalnız saklar ve okur; kapı kuralı NG-33'ündür, G0 puanlayıcısı bunları okumaz.
Yazan/okuyan tek yer `src/lib/gates/readiness-records.ts`. Migration: `prisma/migrations/add-org-readiness-tables.sql` (geri alma: `.down.sql`).

- **`OrgReadiness`:** bir kuruluşun EU Login ve LEAR cevabı. `null` = cevaplanmadı, `false` = hayır; ikisi ayrı. `subject`: `self`, `cordis:<ConsortiumSeat.organizationId>`, `partner:<PartnerOrg.id>`; tekil `(tenantId, subject)`. Aynı kuruluş iki fırsatın koltuğunda bir kayıttır. Kiracı silinince gider.
- **PIC kolonu yok:** tek kaynak `Tenant.pic` (kendi), `ConsortiumSeat.organizationId` veya `PartnerOrg.pic` (ortak). Okuma yalnız `present`/`missing` döndürür, numarayı döndürmez. Yanıt `subject`'i de taşımaz (CORDIS koltuğunda `subject` PIC'in kendisidir); yalnız `kind: 'self' | 'cordis' | 'partner'` döner. `Tenant.pic` boşsa kayıt `missing: ['pic', …]` der. Girişi ve sahiplik denetimi FO-383'ün profil formundadır.
- **`InternalApproval`:** fırsat başına bir: `approvedAt`/`approvedById`, `cofinancingCommitmentCents`, `currency`, `councilDecisionRef`, `councilDecisionAt`. Onay taahhüde bağlıdır: tutar veya para birimi değişirse yeni onaydır (yeni tarih, yeni onaylayan); karar referansını düzeltmek onayı değiştirmez.
- **`PartnerBudgetShare`:** koltuk başına bir: `minCents`, `maxCents`, `currency`, `agreedAt`/`agreedById`. `agreedAt` boş = önerildi, mutabakat yok. Şartname sayısal aralık vermez; yazıcı yalnız `0 ≤ min ≤ max` denetler.
- **Kiracı sınırı:** RLS satırın kendi `tenantId`'sine bakar, FK denetimi RLS'ten geçmez. Bu yüzden bileşik FK: `(opportunityId, tenantId)` → `Opportunity(id, tenantId)`, `(seatId, tenantId)` → `ConsortiumSeat(id, tenantId)`; iki üst tabloya bu FK'ların istediği tekil indeks eklendi.
- **Silme:** ikisi üst kayıtla CASCADE gider; kullanıcı silinince `approvedById`/`agreedById` NULL olur.
- **Denetim izi:** `org_readiness.saved`, `internal_approval.saved`, `partner_budget_share.saved`. Tutar ve karar metni denetim satırına girmez.
- **CHECK yok:** `prisma db push` ile kurulmuş DB'de `CREATE TABLE IF NOT EXISTS` içindeki CHECK kaybolur; kural yazıcıdadır.
- **API:** `GET/PUT /api/org-readiness[?seatId=]`, `GET/PUT /api/opportunities/[id]/internal-approval`, `GET/PUT /api/opportunities/[id]/budget-shares`.

## 28. Proje fikri ve karar kaydı: `ProjectIdea`, `DecisionLog` (NG-38 · K-577084, K-577269)

Şartname §4'ün `project_idea` ve `decision_log` tabloları. Migration: `prisma/migrations/add-project-idea-decision-log.sql` (geri alma: `.down.sql`).

- **`ProjectIdea`:** kurumun (kiracının) proje fikri: `title`, `summary`, `keywords[]`, `trl` (1–9), `targetPrograms[]`, `status` (`OPEN` | `APPLIED` | `ARCHIVED`). Yazan/okuyan `src/lib/project-ideas/records.ts`; durum girdiden yazılmaz, oluşturulunca `OPEN`. `APPLIED` "başvur" kararıyla (NG-15) gelir. Fırsata bağ (`project.idea_id`) henüz yok: `Opportunity`'ye kolon demektir, bu kartın dışında.
- **`DecisionLog`:** başvur/vazgeç kararları, yalnız eklenir: `kind` (`APPLY` | `WITHDRAW`), `reason` (zorunlu), `decidedById`, `decidedAt`. Kapı kararları `GateDecision`'da kalır.
- **`WITHDRAWN` yazan tek yer:** `withdrawOpportunity` (`src/lib/k5-pipeline/withdrawal.ts`). Gerekçe boşsa `REASON_REQUIRED` döner, hiçbir şey yazılmaz. Yalnız `ACTIVE` ve `SUBMITTED` fırsattan vazgeçilir; sonuçlu fırsat (`FUNDED`, `REJECTED`, `ABOVE_THRESHOLD`) `ALREADY_DECIDED`, ikinci vazgeçme `ALREADY_WITHDRAWN`. Durum ve kayıt tek işlemde yazılır; durum koşullu güncellenir, eşzamanlı iki istekten biri kazanır. Boru hattındaki "arşivle" (`archived_by_user`) yumuşak silmedir, vazgeçme değildir; değişmedi.
- **Kiracı sınırı:** RLS + bileşik FK `(opportunityId, tenantId)` → `Opportunity(id, tenantId)` (indeks §27'den).
- **Silme:** `ProjectIdea` kiracıyla, `DecisionLog` fırsatıyla CASCADE gider; kullanıcı silinince `createdById`/`decidedById` NULL olur, fikir metni ve gerekçe kalır.
- **Denetim izi:** `opportunity.withdrawn` (veri: karar kimliği, eski durum), `project_idea.created`. Gerekçe ve fikir metni denetim satırına girmez.
- **CHECK yok:** TRL aralığı, boş olmayan gerekçe ve metin uzunlukları (başlık 200, özet 2000, gerekçe 2000, etiket 100) yazıcıdadır.

## 29. `Tenant.picRegistryStatus` — AB kayıt sitesi doğrulaması (FO-396)

`Tenant.picRegistryStatus` (`FOUND` | `NOT_FOUND` | `UNKNOWN`, boş = hiç kontrol edilmedi) ve
`Tenant.picRegistryCheckedAt`. AB'nin açık kuruluş profili uç noktası (`src/lib/pic-registry.ts`)
kuruluş numarasını sorar; sonuç `src/lib/pic-registry-refresh.ts` ile kiracı satırına yazılır. Kontrol
DB işleminin dışında, 5 sn zaman aşımı ve 256 KB sınırıyla yapılır; hata/zaman aşımı `UNKNOWN`'dur.

**Neden:** Sıfır CORDIS kaydı tek başına "yeni kuruluş" demez. Yanlış ya da kayıtsız bir numara da sıfır
kayıt verir. Geçmişsiz ortak kolaylığı (`isNoHistoryPartner`, payda 75) yalnızca `FOUND` ise verilir.
Kayıtsız numara 77,11 GO → 57,83 NO_GO'ya düşer. `G0_SCORING_VERSION` 2.3.

**Durum kuralları (FO-396 adım 2):**
- PIC formdan değişince ya da kaldırılınca durum `null` olur (eski `FOUND` yeni numaraya taşınmaz). Form
  kaydı yeni PIC'i sorgularsa sonuç yazılır; sorgu hata verirse durum `null` kalır ve `pic-registry`
  uyarısı (`reason: refresh_failed`) üretilir.
- Yazım koşulludur (`updateMany where {id, pic}`): sorgu sürerken PIC değiştiyse sonuç atılır
  (`stored: false`); yeni PIC kendi sorgusuyla karar verir.
- Geçici hata (`timeout`, `network`, `http_error`) `UNKNOWN` olarak yazılır ve `pic-registry-retry` işi
  kuyruğa girer: 10 dk, 40 dk, 2 sa sonra (en fazla 3 yeniden deneme). Sonuç `FOUND`/`NOT_FOUND` olursa
  veya PIC değişirse iş atlanır. Son deneme de yanıt vermezse `retry_exhausted` uyarısı üretilir; durum
  `UNKNOWN` kalır (verilmiş kolaylık yoktur). Yanıt şekli değişirse (`schema_changed`) yeniden denenmez.
- Yeniden deneme anahtarı `pic-registry-retry:<auditEventId>:<attempt>`; tek PIC değişikliği için iş en
  fazla bir kez kuyruğa girer. Kuyruğa yazılamazsa `retry_not_queued` uyarısı üretilir.

**Migration:** `prisma/migrations/tenant-pic-registry-status/` — iki `ADD COLUMN IF NOT EXISTS`,
veri geçişi yok; ikinci çalıştırma no-op (kanıt: FO-396 raporu). Geri alma: `down.sql` (kolonları
ve kontrol sonuçlarını siler; kolon yoksa kolaylık da yoktur). `Tenant` sistem geneli tablo, RLS yok.

## 30. Bildirim kanalı ve sıklık tercihi: `NotificationPreference`, `NotificationEmailItem` (NG-43 · şartname §13)

Şartname §13: "kanal tercihi kullanıcı bazlı; haftalık özet ve anlık uyarı ayrı ayarlanır". Migration: `prisma/migrations/add-notification-preferences.sql` (geri alma: `.down.sql`). `Notification` tablosu ve `NotificationType` değişmedi.

- **Olay listesi (`NotificationEvent`):** §13'ün dokuz olayı, şartname sırasıyla. Kod: `src/lib/notifications/events.ts`. Saklanan türlerin eşlemesi: `SAVED_SEARCH_MATCH` → `NEW_MATCHING_CALL`, `EVIDENCE_EXPIRING` → `OBLIGATION_REMINDER`; `CREDIT_GRANTED` / `CREDIT_EXHAUSTED` §13 dışıdır (hesap bildirimi): yalnız panel, kapatılamaz.
- **`NotificationPreference`:** (kiracı, kullanıcı, olay, kanal) başına bir satır, `frequency`. `PANEL`: `INSTANT` | `OFF`. `EMAIL`: `INSTANT` | `WEEKLY` | `OFF`. Satır yoksa varsayılan: panel `INSTANT`, e-posta `OFF` (istenmemiş posta yok). Yazan/okuyan `src/lib/notifications/preferences.ts` (`setPreferenceFor`, Zod; istemciden kullanıcı kimliği alınmaz).
- **`NotificationEmailItem`:** e-posta kuyruğu. `dispatchNotification` tercihe göre panel satırı (`Notification`) ve/veya kuyruk satırı yazar. `sendNotificationEmails` (`src/lib/notifications/email-outbox.ts`) `INSTANT` satırlarını tek tek, `WEEKLY` satırlarını kullanıcı ve kiracı başına tek özet postasıyla gönderir; SMTP kabul edince satırı silmez, `sentAt` ile işaretler: (kiracı, kullanıcı, `dedupeKey`) tekil indeksi e-postanın tek tekrar önleyicisidir, satır kalmazsa aynı anahtarla yeniden koşan üretici aynı postayı yeniden kuyruğa koyardı (NG-43 inceleme B-1). Gönderim sorguları yalnız `sentAt IS NULL` satırları okur. Gönderilmiş satırları `notifications-retention` (`pruneNotificationStores`) `sentAt`'ten itibaren 90 gün sonra siler; gönderilmemiş satır kalır. Gönderim hatasında satır gönderilmemiş kalır, sonraki koşuda yeniden denenir. Gönderim başarılı olup işaretleme düşerse koşu durmaz, `failures` sayılır ve o posta talebin kira süresi (15 dk) dolunca yeniden gider (en az bir kez), sonraki koşuda değil. Kiracıdan ayrılan ya da silme talebi olan alıcının satırı gönderilmeden silinir. Metin saklanmaz; tür + payload gönderimde alıcının dilinde işlenir. **Tek koşu (NG-131):** `claimToken` + `claimedAt` (nullable, `add-notification-email-claim.sql`). Gönderim koşusu alıcının satırlarını SMTP'den önce tek `UPDATE` ile talep eder (yalnız talepsiz ya da talebi 15 dk'dan eski satırlar); çakışan ikinci koşu bunları atlar, alıcı tek posta alır. Gönderim hatasında talep bırakılır, ölen koşunun talebi 15 dk sonra düşer. Her batch'ten önce talep yenilenir (`claimedAt`); yenileme beklenen sayıda satır vermezse (kira kayboldu, başka koşu almış) o batch gönderilmez ve `claimLost` sayılır (NG-164). Zamanlama: `notification-email-instant` (her 5 dk) ve `notification-email-weekly` (Pzt 07:00 UTC), ortak `notification-email` kuyruğu.
- **Kiracı sınırı:** ikisi de RLS (`tenant_isolation`) altında. `userId` FK taşımaz (`Notification.userId` gibi).
- **Silme:** kişi silinince `users-scheduled-deletion` ikisini de `userId` ile siler. Kiracı silinince CASCADE.
- **Henüz bağlı değil:** mevcut üreticiler (`alerts-daily`, `evidence-expiring`) hâlâ `recordNotification` çağırır; `dispatchNotification`'a geçişleri ve `sendNotificationEmails` için zamanlanmış iş (`schedule.ts`) ayrı iştir.


## 31. M18 Müşteri Satış Hattı: `LeadOrganization`, `LeadContact`, `LeadMatch`, `Deal`, `DealActivity`, `DealTask`, `ServicePackage`, `ServiceQuote`, `FunderRule` (NG-143 · M18-F1)

Plan: `docs/agent-results/FO-265-be-fb.md` seçenek B. HibeLead'in (`project_leed`) danışmanlık satış özellikleri FonBridge kurallarıyla **yeniden yazıldı**, Drizzle şeması kopyalanmadı: cuid, `tenantId` + strict RLS, para `Int` cent + `currency`, yumuşak silme `deletedAt`. Migration: `prisma/migrations/add-m18-client-pipeline.sql` (geri alma: `.down.sql`; DDL `prisma migrate diff` çıktısıdır, idempotent sarılmıştır). Manifest: `src/modules/m18/manifest.ts` (`M18`, `client-pipeline`, `statusBadge: 'soon'`). F1 yalnız veri katmanıdır; ekran yok (F3).

- **Kapsam birimi kiracıdır**, çalışma alanı değil (`workspaceId` yok). Lider varsayımı (FO-265 K4); çalışma alanına bölmek gerekirse additive bir `workspaceId?` kolonu eklenir.
- **Adlar bilerek ayrık:** `Deal` danışmanlık sözleşmesine giden satış kartıdır, M5 `Opportunity` (G0–G4) değildir. `ServiceQuote` danışmanın ücret teklifidir, M5 `Proposal` (AB başvurusu) değildir. `LeadOrganization` danışmanın müşterisidir, M1 `PartnerOrg` (ortak) değildir; isteğe bağlı bağlar `partnerOrgId?` ve `cordisPic?` FK taşımaz (başka modülün tablosu).
- **Ortak kolonlar (dokuz tablonun hepsi):** `tenantId` (FK `Tenant` `CASCADE`), `createdAt`, `updatedAt`, `deletedAt?`, `sourceRef?` + tekil `(tenantId, sourceRef)`. `sourceRef` ileride HibeLead içe aktarması (`hibelead:<uuid>`) için: `INSERT … ON CONFLICT ("tenantId","sourceRef") DO NOTHING` iki kez koşunca ikinci koşu 0 satır yazar (canlı ölçüldü). Postgres'te NULL'lar tekil indekste çakışmaz; elle girilen satırlar `sourceRef` taşımaz.
- **Kiracılar arası bağ kapalı:** çocuk → ebeveyn bağları bileşik `(parentId, tenantId)` → `(id, tenantId)` (tekil `(id, tenantId)` hedefleri: `LeadOrganization`, `LeadContact`, `Deal`, `ServicePackage`). FK denetimi RLS'den geçmez; tek kolonlu FK ile A kiracısı B'nin kurumuna deal asabilirdi (canlı ölçüm: bileşik FK reddediyor). İsteğe bağlı bileşik bağlar (`Deal.primaryContactId`, `Deal.servicePackageId`, `ServiceQuote.packageId`) `NO ACTION`'dır: `SET NULL` `tenantId`'yi de boşaltmaya çalışırdı. Paket ve kişi yumuşak silinir; kullanımdaki paketin sert silinmesi reddedilir. Kurum ya da kiracı silinince zincir (kişi, deal, teklif, görev, aktivite, eşleşme) birlikte gider (ölçüldü).
- **`DealStage`:** HibeLead `deal_stage` sırası birebir: `NEW → QUALIFIED → CONTACTED → DISCOVERY_MEETING → ELIGIBILITY_ANALYSIS → PROPOSAL → CONTRACT → APPLICATION_PREP → SUBMITTED → WON | REJECTED` (11 hat aşaması) + her aşamadan çıkış `LOST`. `WON`/`REJECTED` hibe sonucudur (başvuru sonrası), `LOST` satışın kaybıdır.
- **`LeadOrganization`:** `name`, `legalName?`, `orgType?` (HibeLead 18 değerli taksonomisi metin olarak; `OrgType` eşlemesi F2), `provinceCode?` (plaka), `district?`, `nuts2?`, `website?`, `sectorCodes[]`, `themes[]`, `sizeBand?`, `lifecycle` (`LEAD|CLIENT|DISQUALIFIED`), `disqualifyReason?`, `ownerUserId?` (FK yok), `pic?`, `cordisPic?`, `partnerOrgId?`, `dedupeKey?` (tekilleştirme F2; indeks `(tenantId, dedupeKey)`). Embedding yok (HibeLead 1024 boyut; gerekirse 1536 ile yeniden üretilir, F2/F5).
- **`LeadContact`:** `fullName`, `title?`, `email?`, `phone?`, `linkedinUrl?`, `doNotContact`. Kişisel veridir: rıza ve aydınlatma kaydı `Consent`'te tutulur (HibeLead `contact_consents`/`consent_texts` taşınmaz).
- **`LeadMatch`:** müşteri kurumu × paylaşımlı `Call`: `fitScore?` (0–100), `hardFail`, `reasons` (JSONB), `status` (`SUGGESTED|ACCEPTED|REJECTED|CONTACTED`); tekil `(tenantId, organizationId, callId)`. `TopicMatch` kiracının kendisini eşler, bu tablo müşterisini.
- **`Deal`:** `organizationId`, `primaryContactId?`, `callId?` (FK `Call` `SET NULL`), `servicePackageId?`, `title`, `stage`, `stageChangedAt`, `leadScore?`, `scoreBreakdown?`, `estimatedFeeCents?` + `currency`, `winProbability?`, `expectedCloseAt?`, `lostReason?`, `ownerUserId?`.
- **`DealActivity`** (`kind`, `payload`, `note?`, `actorUserId?`, `occurredAt`) ve **`DealTask`** (`title`, `dueAt?`, `doneAt?`, `assigneeUserId?`, `autoGenerated`, `autoRuleKey?`): deal'e bileşik FK, `CASCADE`.
- **`ServicePackage`:** `pricingModel` (`FIXED|FIXED_PLUS_SUCCESS|HOURLY|RETAINER`), `baseFeeCents`, `successFeeBp?` (baz puan, 500 = %5), `successFeeCapCents?`, `currency`, `deliverables[]`, `active`. **Başarı primi danışmanlık ücretidir, hibe bütçesinde uygun maliyet değildir** (`docs/BILLING.md`, CLAUDE.md "Yapma").
- **`ServiceQuote`:** `dealId`, `version` (tekil `(tenantId, dealId, version)`), `packageId?`, `lineItems` (JSONB, kalem fiyatları cent), `totalCents` + `currency`, `status` (`DRAFT|SENT|VIEWED|ACCEPTED|REJECTED`), `validUntil?`. PDF/DOCX ve müşteri linki F7.
- **`FunderRule`:** danışmanın kaydettiği fon veren kuralı (`funderName`, `programmeId?` → paylaşımlı `Programme` `SET NULL`, `title`, `body`, `severity` `INFO|WARNING|BLOCKER`, `sourceUrl?`, `verifiedAt?`, `active`). Bilgi amaçlıdır, tek başına bir şeyi engellemez.
- **`Call`'a additive kolonlar** (paylaşımlı, `tenantId` yok; ikinci çağrı tablosu açılmadı): `eligibleApplicantTypes TEXT[]`, `eligibleRegions TEXT[]` (varsayılan `{}`), `cofinancingRateBp INT?` (7500 = %75), `complexity TEXT?` (`LOW|MEDIUM|HIGH`). Bugün yazan yok; K1/F6 toplayıcıları doldurur.
- **Enum gibi metin kolonlar** (`status`, `kind`, `severity`, `pricingModel`, `lifecycle`) Postgres enum değildir; geçerli değerleri F2 yazıcıları Zod ile doğrular. CHECK yok (`prisma db push` ile kurulan DB'de `CREATE TABLE IF NOT EXISTS` içindeki CHECK kaybolur — add-blog-post.sql notu).
- **Hazırlık karnesi girişi (NG-138 · M18-F4).** Sözleşme `src/core/contracts/lead-intake.ts` (`LeadIntakeRequest` → `LeadIntakeResult`), tüketici `src/modules/m18/server/intake*.ts`. Kabul edilen bir `PublicLead` hedef kiracıda tek transaction'da `LeadOrganization` + `LeadContact` + `Deal` (`NEW`) + `DealTask` (`new.first-contact`, 2 gün) + `DealActivity` (`FORM`, yalnız karne varsa) + `Consent` (`EXPLICIT_CONSENT` / `LEAD_INTAKE`) yazar. **Kişi tek kopya:** platformda `PublicLead` kalır, kiracıda her satır `sourceRef = public-lead:<publicLeadId>` taşır (şema değişmedi; `(tenantId, sourceRef)` tekil indeksi tekrarı engeller, ikinci istek `duplicate` döner). **Onaysız aktarım yok:** `PublicLead`'in kendi rızası (`public-lead-contact`) bir alıcı adlandırmaz, bu yüzden kabul edilmez; sözleşme `documentId = lead-intake-transfer` ve geri çekilmemiş ayrı bir rıza ister (`consent_missing` / `consent_wrong_document` / `consent_withdrawn`). **Hedef kiracı:** `orgType = CONSULTANCY` ya da `kind = AGENCY` ve silinmemiş, ayrıca M18 kiracının kendi kullanıcılarına açık (`isIntakeTarget`; NG-205 · SEC NG-203 D-A2: modül kuralı `state-machine.ts` `isOpenToTenantMembers`, satış dışı beta M18 için bugün yalnız `PILOT`; `ModuleState` satırı yoksa `OFF`). Aksi `tenant_ineligible`. Modül denetimi `duplicate` yanıtından SONRA: kiracı M18'i kapatmadan önce düşmüş kopya doğru raporlanır, yeni satır yazılmaz. **Üretici (tur 2):** `src/lib/leads/public-lead-intake.ts` `forwardPublicLead` bir `PublicLead`'i `LeadIntakeRequest`'e çevirir, M18'e yalnız `LeadIntakePort` ile konuşur; `PublicLead.transferConsent` (+ `transferConsentVersion`, `transferConsentAt`; migration `add-public-lead-transfer-consent.sql`, varsayılan `false`) literal `true` ve sürüm+zaman dolu değilse port hiç çağrılmaz, satır oluşmaz. **Karne formu (NG-179):** ayrı, işaretsiz, isteğe bağlı "danışmanlık kuruluşuna aktarım" kutusu; yalnız seçilen ilin eşlenmiş kuruluşu varsa gösterilir. İşaretliyse ve il eşlenmişse `transferConsent = true`, `transferConsentVersion = transfer-consent-v1-2026-11` (sabit `PUBLIC_LEAD_TRANSFER_CONSENT`, sunucu yazar) ve `transferConsentAt` (sunucu saati) yazılır; il eşlenmemişken işaretli gönderim rıza yazmaz. Metin `docs/legal/drafts/transfer-consent-v1.md` §4/§5/§5c; hukukçu yazılı onayı olmadan canlıya çıkmaz (patron kararı 14.11.2026). Alıcı tarafında `forwardPublicLead` henüz forma bağlı değil (NG-181 kapanmadan bağlanmaz). **Atama yok:** `Deal.ownerUserId` boş düşer; hedef kiracıyı çağıran açıkça verir, danışman atama kuralı açık ürün kararı. **Olay:** oluşan lead için `src/core/events` üzerinden `m18.lead-intake.created` (sözleşme `LeadIntakeCreatedPayload`, yalnız id'ler, kişisel veri yok) commit sonrası yayınlanır; dinleyici hatası lead'i bozmaz.
- **`LeadEligibilityReport` — uygunluk ön raporu (NG-136 · M18-F5).** Müşteri kurumu × paylaşımlı `Call` için YZ taslağı: `organizationId` (bileşik FK `(organizationId, tenantId)` → `LeadOrganization`, kurumla birlikte silinir), `callId` (FK `Call`), `status` (`DRAFT|APPROVED`, varsayılan `DRAFT`; DB `CHECK` kısıtı `LeadEligibilityReport_status_check`), `content` (Markdown; puan/oran yok), `locale`, `model?`, `createdByUserId?`, `approvedByUserId?`, `approvedAt?`, `deletedAt?`. Strict RLS (`tenant_isolation`). Migration `prisma/migrations/add-m18-eligibility-report.sql` (idempotent; geri alma `.down.sql`). **Onaysız M18 dışına çıkmaz:** yalnız deal ile AYNI çağrıya ait `APPROVED` rapor (çağrısız deal'e rapor gitmez) `DealBriefContextPort` (`src/core/contracts/deal-brief-context.ts`) üzerinden M9 brifine "iç ön değerlendirme — resmî değerlendirme değildir" etiketiyle gider; `DRAFT` hiçbir sözleşmeden okunmaz. Her ekranda "İç ön değerlendirme — resmî puan değildir" etiketi. Lead birleştirmede raporlar korunan kuruma taşınır. **Zenginleştirme tablo açmaz:** web sitesinden (robots.txt'ye uyarak, en çok 5 sayfa) üretilen öneri kullanıcı alan alan işaretleyip onaylamadan `LeadOrganization`'a yazılmaz. YZ çağrıları `M18:enrich-organization` ve `M18:eligibility-pre-report` (`docs/BILLING.md`, 1 / 2 kredi, patron onayı 15.11.2026). Kredi M17 deseniyle: fiyat model çağrısından ÖNCE kiracı kredi kilidi altında `CreditLedger` `usage:M18` olarak rezerve edilir, model çağrısı 0 kredilik `-attempt` anahtarıyla `AiUsageLog`'a yazılır; eylem sonuç vermezse (kullanılamaz yanıt, boş rapor, çağrı hatası, TASLAK yazılamaması) aynı `refId` ile `refund:M18` yazılır (`src/modules/m18/server/ai-credits.ts`). Zenginleştirmede bakiye fiyatı karşılamıyorsa site hiç okunmadan reddedilir (salt-okur ön kontrol `assertM18Balance`; bağlayıcı kontrol yine kilit altındaki rezervasyon — NG-202 B2).
- **Seed yok:** M18 satırları kullanıcı girişi ya da içe aktarmayla oluşur. HibeLead DB'sinde göç edilecek gerçek kayıt yok (FO-265 §5; 2026-11-13'te yeniden ölçüldü, NG-143 raporu).

## 32. `ProvinceLeadRoute` — il → danışmanlık kuruluşu eşlemesi (NG-167 · M18)

Patron kararı: karneden gelen lead, karnede yazılan ile göre o bölgeye bakan kuruluşa (kiracıya) gider. Bu tablo o eşlemedir; `forwardPublicLead` hedef kiracıyı yalnız buradan seçer. Varsayılan/rastgele kiracı YOK: eşleme yoksa lead aktarılmaz, `PublicLead.routeStatus = 'unmatched'` olur.

- **Platform verisi, kiracı verisi değil.** Sütun `targetTenantId` (alıcı; bilerek `tenantId` DEĞİL, çünkü sahibi değil). `SYSTEM_WIDE` + `SYSTEM_SCOPE_POLICY`: RLS açık, tek politika `system_scope` (`ExpertFounderCounter` ile aynı). **Kiracılar okuyamaz ve yazamaz** (hedef kiracının kullanıcısı dahil; `tests/province-lead-route.live.test.ts`, gerçek `fabrika_app`). Yalnız `withSystemScope('platform-admin' | 'cross-tenant-job')` içindeki kod erişir; NG-175 (SEC NG-170 D-1) bunu DB'de de daraltır: `system_scope_open()` tabloyu başka amaca açmaz (`tenant-discovery`, `subject-scoped`, `platform-aggregate`, `public-intake` mühürlü kapsamla da 0 satır görür ve yazamaz; `rls:verify`, `tests/public-lead-rls.live.test.ts`).
- **Alanlar:** `province` (`TR_PROVINCES` yazımı; DB CHECK, `src/lib/leads/province-route.test.ts` listeyi eşitler), `targetTenantId` (FK `Tenant`, `ON DELETE CASCADE`), `active`, `updatedBy` (admin kullanıcı id), `createdAt`, `updatedAt`.
- **Kısıt:** bir il en fazla BİR aktif kiracıya (kısmi benzersiz indeks `ProvinceLeadRoute_province_active_key ... WHERE "active"`; Prisma ifade edemez, yalnız migration'da). Bir kiracı birden çok il alabilir. Pasif satırlar geçmiştir, tekrarlanabilir.
- **Yönetim:** yalnız platform admin (`requirePlatformAdmin`), `src/app/[locale]/admin/lead-routes/actions.ts`; sözleşme `src/core/contracts/lead-routing.ts`. Hedef: silinmemiş, danışmanlık/ajans kiracısı ve M18'i kiracıya açık olmalı (`isIntakeTarget`, NG-205); seçici listesi (`listIntakeTenantOptions`) aynı kuralı uygular. Her değişiklik `AuditEvent` (`lead-route.set` / `.moved` / `.deactivated`, `tenantId NULL`, `target = il`, yalnız il + kiracı id'leri).
- Migration: `prisma/migrations/add-province-lead-route.sql` (+ `.down.sql`: tablo ya da `PublicLead` yönlendirme sonucu doluysa reddeder).
- **Ziyaretçiye kuruluş adı: `public.province_transfer_org_name(text)` (NG-179).** Karne formundaki aktarım kutusu, işaretlemeden önce seçilen ilin kuruluş ADINI gösterir. D-1 yüzünden ziyaretçinin `public-intake` kapsamı bu tabloda 0 satır görür; D-1 bilerek GEVŞETİLMEDİ (`public-intake`'e tablo açılsa anonim yoldaki her kod tüm il → `targetTenantId` haritasını okuyabilirdi). Onun yerine dar bir `SECURITY DEFINER` fonksiyon (`lifetime_licence_count()` kalıbı): girdi tek il adı (tam eşleşme), çıktı tek `text` — kiracının adı; kiracı id'si, başka sütun ya da başka il DÖNMEZ (set döndürmez). Yalnız `active` rota + `isIntakeTenant` koşulu (silinmemiş VE `orgType='CONSULTANCY'` ya da `kind='AGENCY'`); aksi hâlde NULL. `search_path = public, pg_temp` sabit; `app.system_scope`'a dokunmaz — tablo sahibi olarak okur (`ProvinceLeadRoute` RLS ENABLE, FORCE değil). EXECUTE: PUBLIC'ten alındı, yalnız `fabrika_app`'e (ayrıca `prisma/rls-app-role.sql` §5). Çağıran tek yer `src/lib/leads/transfer-org.ts` → `transferOrgNameFor`; `LEAD_TRANSFER_CONSENT_ENABLED` kapalıyken hiç çağrılmaz. `isIntakeTenant` değişirse fonksiyonun WHERE'i aynı PR'da değişir (NG-205'in M18 modül şartı `isIntakeTarget`'ta, `isIntakeTenant`'ta DEĞİL: `ModuleState` FORCE RLS altında, sahip rolü kiracı GUC'u olmadan 0 satır okur; kutu M18'i sonradan kapanmış bir kiracının adını gösterebilir, iletim o zaman `tenant_refused` ile listeye düşer); `tests/transfer-org-name.live.test.ts` ikisini aynı satırlarda eşitler. **Uyarı:** tabloya ileride `FORCE ROW LEVEL SECURITY` eklenirse fonksiyon sessizce NULL döner ve kutu kaybolur — o değişiklik bu fonksiyonu da ele almalı. Migration: `prisma/migrations/add-province-transfer-org-name.sql` (+ `.down.sql`: yalnız fonksiyonu düşürür, veri yok).
- **Rıza alıcıya bağlı (NG-204 · SEC NG-203 O-A1).** Ziyaretçi aktarım kutusunu BİR kuruluşun adı altında işaretler. Gönderimde sunucu ilin o anki kuruluşunu `public.province_transfer_org(text)` ile okur (SECURITY DEFINER, `province_transfer_org_name` ile aynı WHERE, girdi tek il, çıktı en çok bir satır `(tenant_id, org_name)`, EXECUTE yalnız `fabrika_app`; yalnız sunucu tarafı, id istemciye dönmez). Rıza ancak form ile gelen ad (`transferOrgName`) o anki adla aynıysa kaydedilir ve `transferConsentTenantId` + `transferConsentOrgName` yazılır; ad eskimiş ya da yoksa rıza yazılmaz (lead yine saklanır). `forwardPublicLead` yalnız haritanın hedefi = `transferConsentTenantId` ise sahiplenir ve iletir; değilse port çağrılmaz, sahiplenme olmaz, lead `unmatched/consent_recipient_mismatch` işaretlenir. İl aynı kuruluşa geri eşlenirse lead iletilebilir. Migration: `prisma/migrations/add-public-lead-transfer-recipient.sql` (+ `.down.sql`: alıcı kaydı dolu satır varsa reddeder; önce kod geri alınır). Ölçüm: `tests/public-lead-consent-recipient.live.test.ts`, `tests/transfer-org-name.live.test.ts`.
- **`PublicLead` yönlendirme alanları (NG-174 · SEC NG-170 Y-1/D-2).** Bir lead EN FAZLA BİR kiracıya aktarılır. `forwardPublicLead` hedefi port çağrılmadan ÖNCE tek koşullu `UPDATE ... WHERE routedTenantId IS NULL AND routeStatus IS DISTINCT FROM 'routed'` ile sahiplenir (kayıp çağrı count 0 görür; paralel çağrılarda tek satır). `routed` lead için tekrar çağrı yalnız AYNI kiracıya gider (M18 `duplicate` döner); eşleme başka kiracıya taşınmış, eşleme kalkmış ya da kiracı silinmişse `skipped/already_routed`, port çağrılmaz. `routed` kaydın üzerine `unmatched` yazılmaz. Kiracı silinince `routedTenantId` olduğu gibi kalır (FK değil; alıcının denetim izi). Yeniden yönlendirme (yeni alıcı) bilerek YOK: yeni rıza gerektirebilir, ürün/hukuk kararı açık. M18 hedefi reddederse (`tenant_not_found`/`tenant_ineligible`) sahiplenme `unmatched/tenant_refused`'a çevrilir; başka bir reddte ya da port hata verirse sahiplenme geri verilir (lead yeniden denenebilir).
- **Tutarlılık CHECK'i** `PublicLead_route_consistency_check`: ya üç alan da NULL; ya `routeStatus='routed'` + `routedTenantId` dolu + `routeReason` NULL; ya `routeStatus='unmatched'` + `routeReason` ∈ {`province_missing`, `province_unmapped`, `tenant_refused`, `consent_recipient_mismatch`} (= `UnmatchedReason`) + `routedTenantId` NULL. Migration: `prisma/migrations/add-public-lead-route-consistency.sql` (+ `.down.sql`: yalnız CHECK'i düşürür, veri kaybı yok). Mevcut satır ihlal ediyorsa migration sayıyı yazıp durur, sessizce düzeltmez.
- **Takılı (kopyasız) lead görünürlüğü (NG-182).** "Takılı" = `routeStatus='routed'` + `routedTenantId` dolu, ama o kiracıda `sourceRef = 'public-lead:<id>'` taşıyan NE `LeadContact` NE `Deal` var (NG-181 port hata verdiğinde sahiplenmeyi kiracıda bırakır; port hep hata verirse ya da eşleme sonra taşınırsa lead hiçbir ekranda görünmez). Kiracının sonradan soft-delete ettiği kopya kopya sayılır (teslim edildi); kiracı hard-delete olursa kopyaları cascade ile gider ve lead `tenantDeleted` ile listede çıkar. **Yalnız görünürlük:** yeniden yönlendirme, kopyalama, sahiplenmeyi bırakma ya da silme YOK; `forwardPublicLead`'e bağlı değil. Okuyucu `src/lib/leads/stuck-leads.ts` → `listStuckRoutedLeads(db, { olderThanMinutes, purpose })`: tek salt-okunur SELECT (`PublicLead` LEFT JOIN `Tenant` + iki `NOT EXISTS`; `(tenantId, sourceRef)` iki tabloda da benzersiz, her sonda tek indeks araması), `withSystemScopeOn('platform-admin' | 'cross-tenant-job')` içinde (iki literal çağrı yeri, `scripts/tenant-bypass-baseline.json` check D). Kiracı oturumu `PublicLead`'de 0 satır görür (NG-175). Eşik: `PUBLIC_LEAD_STUCK_AFTER_MINUTES` (`src/lib/env.ts`, varsayılan 60, 1..10080) — daha genç `routed` lead yolda sayılır. **Ekran:** Admin > Lead yönlendirme, eşleşmeyen listesinin altında "Takılı lead'ler (kopyasız)" (`listStuckRoutedLeadsAction`, `requirePlatformAdmin`, en çok `STUCK_PAGE_MAX`=200 satır + toplam; buton yok). **Alarm:** `public-lead-stuck` işi (`*/15 * * * *`, `src/lib/jobs/tasks/public-lead-stuck.ts`) her takılı lead için TEK açık `warn` `SystemAlert` açar (`source='public-lead-stuck'`, `meta = { publicLeadId, olderThanMinutes, routedAt, tenantDeleted }`, `dedupeKey='public-lead:<id>'`). `SystemAlert` kiracısız ve RLS'sizdir: meta'da kiracı id'si/adı ya da kişi verisi YOK (yalnız lead id; ad ekranda platform-admin kapsamında birleştirilir; `alerts:check` silinmiş kiracıyı gösteren alarmı da bu yüzden yakalamaz). Açık alarmı olan lead atlanır (ikinci koşu satır açmaz, sayaç artırmaz; `recordAlert`'in kendi katlaması yalnız kaynağın son 5 açık satırına baktığı için yetmez). Lead artık takılı değilse (kopya geldi, lead silindi) açık alarmı iş kapatır; operatör alarmı lead hâlâ takılıyken kapatırsa sonraki koşu yenisini açar. İş hata verirse `public-lead-stuck-job` kaynağıyla `error` alarmı yazıp yeniden atar. Canlı test: `tests/public-lead-stuck.live.test.ts`.
