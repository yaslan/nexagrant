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
- Etkin kapsam (`entitlements(tenant)`) = plan + aktif eklentiler; `canEnable` bunu ve bağımlılıkları kontrol eder.

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

- Kiracı silme: `Tenant` cascade; paylaşımlı veriye dokunmaz; `AuditEvent` 12 ay anonimleştirilmiş saklanır (KVKK/GDPR).
- `RawFetch` 90 gün; `AiUsageLog` 24 ay (şeffaflık beyanı için).
- `RawFetch` yalnızca **içerik değiştiğinde** yazılır (`hash` karşılaştırması). Aynı yükü her gece yeniden saklamak tabloyu günde ~1200 satır büyütür, denetim değeri katmaz.
- `Topic.eligibility` (Json) şekli: `{ restricted: "EU_EEA_CH_ONLY" | "TR" | null, eligibleCountries: string[], countriesExcluded: string[], notes?: string }`. `eligibleCountries` boş dizi = tespit edilmiş kısıt yok.
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
| `purpose` | `ACCOUNT_REGISTRATION` (§1) · `CALENDAR_OAUTH` (§11, henüz satır yok) |
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

**Saklama.** §3'teki "AuditEvent 12 ay anonimleştirilmiş" kuralı için bugün bir budama kodu yok.
Böyle bir iş yazılırsa `agency.report.generated` satırlarını ya dışarıda bırakmalı ya da
rapor geçmişinin 12 ayla sınırlı olduğunu ajansa söylemelidir.

**İleride (C seçeneği, ayrı onay):** gerçek PDF (yeni bağımlılık), R2'de saklanan dosya ve
ayrı bir `AgencyReport` tablosu (tekil `(agencyId, period)`).

## 21. `PublicLead` — karne sonuç ekranı iletişim talebi (TASK-MULR765AR5G0C · FB KAMU)

Kayıtsız bir ziyaretçinin `/tr/fon-hazirlik` (`/en/funding-readiness`) sonuç ekranındaki formla, **açık rıza kutusunu işaretleyerek** bıraktığı iletişim talebi.

- **Kiracısız platform verisi.** Ziyaretçinin hesabı yok, dolayısıyla `tenantId` de yok. Tablo `scripts/rls-models.ts` `SYSTEM_WIDE` listesinde ve RLS politikası yok (`User` ile aynı durum). Kiracı kod yolu tabloya dokunmaz. Tek yazıcı `src/lib/leads/public-lead.ts` `submitPublicLead`, tek okuyucu `/admin/leads` (`requirePlatformAdmin`). Migration: `prisma/migrations/add-public-lead.sql`.
- **Alanlar:** `name`, `email` (kırpılmış + küçük harf), `organisation`, `province?` (yalnız `TR_PROVINCES`), `district?`, `readinessCode?` (`<orgType>.<15 cevap>`), `readinessTotal?` / `readinessLevel?` (sunucuda `scoreReadiness` ile yeniden hesaplanır, istemciden alınmaz), `consentVersion` + `consentAt` (`PUBLIC_LEAD_CONSENT.version`, eski sürümle gelen form reddedilir), `source` (`fon-hazirlik`), `locale`, `ipHash?` (IP'nin `AUTH_SECRET`'tan türetilen anahtarla HMAC-SHA256'sı; yalnız hız sınırı için, ham IP saklanmaz), `createdAt`.
- **Bot koruması:** honeypot alanı (`website`) doluysa yanıt `ok` olur ama satır yazılmaz. Hız sınırı: e-posta başına 24 saatte 3, IP başına 1 saatte 10. Sayım ve yazma `pg_advisory_xact_lock` altında tek transaction'da yapılır, bu yüzden eşzamanlı istekler sınırı aşamaz.
- **Saklama:** `PUBLIC_LEAD_RETENTION_DAYS = 365` (öneri, karar patronda). Gece `public-lead-cleanup` işi (03:45 UTC) `createdAt < cutoff` tek filtresiyle siler ve silme olduysa `public_lead.purged` AuditEvent'i (`tenantId NULL`, yalnız sayı) yazar. NULL kiracılı denetim satırı yalnız `system_scope` altında yazılabildiği için silme ile denetim `withSystemScope('cross-tenant-job')` içinde tek transaction'dadır.
- **İndeksler:** `createdAt` (silme), `(email, createdAt)` ve `(ipHash, createdAt)` (hız sınırı).
- KVKK: `docs/legal/processing-register.md` §18d.
