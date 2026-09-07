# DATA_MODEL.md — Veri modeli

Kaynak: `prisma/schema.prisma` (bağlayıcı). Bu dosya niyeti ve ilişkileri açıklar.

## 1. Kiracılık

- `Tenant` (şirket/kurum) → `Workspace` (danışmanlıklar için müşteri başına; KOBİ'de tek) → iş kayıtları.
- `Membership(tenant, user, role, workspaceIds[])`; boş `workspaceIds` = tüm çalışma alanları.
- **Paylaşımlı (tenant-agnostik) tablolar:** `Programme, Call, Topic, TopicStat, Organization, Project, Participation, OrgTopicStat, Collab, ModuleCatalog, Plan, AddOnCatalog, Document(tenantId=null), RawFetch, SystemAlert`. RLS: herkese okuma, yalnızca sistem yazma.
- **Kiracıya özel:** geri kalan tümü; `tenantId` zorunlu, RLS `tenant_id = current_setting('app.tenant_id')`.
- ⚠️ **`SystemAlert` kiracı içeriği taşımaz.** Tabloda `tenantId` yoktur ve `prisma/rls.sql`
  içinde **hiçbir politikası yoktur** — buraya yazılan her şey kiracı yalıtımının dışındadır.
  Uyarılara başlık, gövde, e-posta, sayfa adresi veya `tenantId` yazılmaz; yalnızca
  RLS korumalı satıra bir kimlik referansı (ör. `feedbackId`) ve kapalı kümeli sınıflandırma
  alanları konur. Tek yazar: `src/lib/observability/system-alert.ts` (`recordAlert`), kimlik
  görünümlü anahtarları (`email`, `token`, `apiKey`, …) düşürür ve `redactedKeys` ile bildirir.
  Okuyucu: `/[locale]/admin/alerts` (yalnız platform-admin).
  İndeksler: `[createdAt]`, `[source, createdAt]`, `[resolvedAt, createdAt]`
  (`prisma/migrations/add-systemalert-console-indexes.sql`).

## 2. Ana akış (K5)

```
Topic ──(TopicMatch: fitScore, g0Score)──▶ Opportunity(stage G0..G4, intendedRole)
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

## 6. İndeks ve performans notları

- `Topic(nextDeadlineAt)`, `TopicMatch(tenantId, g0Score)`, `OrgTopicStat(topicPrefix, coordinatorCount)`, `Relationship(tenantId, lastContactAt)`.
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

### 7.2 Fırsat arşivleme (üründen giriş noktası)

`Opportunity.deletedAt` uzun süre yalnız şemada durdu; üründe onu yazan bir yol yoktu, yani bir fırsat ancak SQL'den siliniyordu. Arşivleme akışı bu boşluğu kapatır:

- Eylem: `archiveOpportunity` (`src/app/[locale]/(app)/[workspace]/pipeline/actions.ts`). `withTenant` içinde çalışır; filtre hem `id` hem `tenantId` taşır, `deletedAt: null` da filtrenin parçasıdır (iki kez arşivlemek ilk damgayı ezmez).
- Yetki: `src/lib/pipeline/archive.ts` — `TENANT_OWNER` · `TENANT_ADMIN` · `PIPELINE_MANAGER` her kaydı, diğer roller yalnız `ownerId`'si kendilerine ait kaydı arşivler. Sahipsiz kayıt (`ownerId = null`) yalnız bu üç role açıktır.
- İz: aynı işlem içinde `AuditEvent(type='opportunity.archived', target=<opportunityId>)`; `deletionReason = 'archived_by_user'`.
- Görünürlük: `deletedAt` dolu kayıt panodan, listelerden, KPI'lardan, panel CSV'sinden, `/api/v1/opportunities` yanıtından ve G0 puanlayıcıdan düşer; detay sayfası 404 verir. Kayıt, kapı kararları ve efor satırları veritabanında kalır.
- **Geri alma üründe yok.** Arşivden çıkarma yalnız veritabanından `deletedAt = NULL` ile yapılabilir; ürün içi geri alma açık bir iş kalemidir.

## 8. v1.1+ tablolar (şemada yorum olarak)

`Evaluation` (M6), `MeetingBrief` (M9), `FollowupDoc` (M10), `ApplicationPart` (M11), `TtoPortfolioItem` (M7), `MarketplaceListing/Engagement/Commission`, `ApiKey`.

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
| `accessToken`, `refreshToken` | OAuth tokenleri; **TODO:** `CALENDAR_ENCRYPTION_KEY` ile şifre (prod'da zorunlu). |
| `tokenExpiresAt` | Token refresh gerekli mi kontrolü. |
| `isConnected`, `lastSyncAt` | Bağlantı durumu ve son senkronizasyon. |

Kiracıya özeldir (`tenantId` + `tenant_isolation` RLS politikası).

**Senkronizasyon:** `MeetingBrief` oluşturulup/güncellenirken, eğer `meetingScheduledAt` belirlenmişse,
`syncMeetingBriefToCalendar()` (`src/lib/calendar/sync.ts`) kiracı kullanıcısının tüm etkin takvim
bağlantılarına olayı kopyalar. Hata (OAuth token geçerliliği vs.) `SystemAlert` üretiyor, iş kırılmıyor.

**Sağlayıcı mimarisi:** `CalendarProvider` arayüzü (`src/lib/calendar/provider.ts`) — connect/disconnect/createEvent/updateEvent/deleteEvent.
Uygulamalar: `IcsProvider` (mevcut generateIcsContent'i wrap), `GoogleCalendarProvider` ve `OutlookCalendarProvider` (mock; OAuth env anahtarları olmadığında).

**Migration:** `prisma/migrations/add-calendar-connections/migration.sql` (idempotent, additive) — 
migration reset gerekiyor (Prisma güvenlik onayı: kullanıcı `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION`'ı
onaylamalı).

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
