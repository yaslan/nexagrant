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
| `accessToken`, `refreshToken` | OAuth tokenleri, düz metin. Bugün **boş** — Google/Outlook OAuth henüz bağlanmadı (`connectCalendar` `CALENDAR_OAUTH_NOT_CONFIGURED` ile reddediyor, `/api/calendar/callback` yok). Bu akış devreye girmeden önce şifreleme şart — bkz. ROADMAP açık karar #12, TASK-MTSHP3BMTAD3Y. |
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

Migration: `prisma/migrations/add-invoice.sql` (additive + idempotent) — geri alma:
`prisma/migrations/add-invoice.down.sql` (yıkıcı: tabloyu ve tüm fatura kayıtlarını siler;
fatura mali bir belgedir, bu refleks bir geri alma değildir).

**Açık:** Ayarlar → Faturalandırma ekranındaki fatura tablosu hâlâ `BillingClient.tsx`
içindeki iki sabit `DEMO_INVOICES` satırını listeliyor (satır 76-92) ve indirme sütununda
bağlantı yok (ölçüldü: sayfada `a[href*="/api/billing/invoices/"]` sayısı = 0). Satırlar
"Demo örnek" rozetiyle işaretli, yani ekran yalan söylemiyor; ama gerçek `Invoice`
satırlarına bağlı da değil. Bağlamak yeni i18n anahtarı (boş durum metni) gerektiriyor ve
`messages/*.json` bu görevin kapsamı dışındaydı — ayrı kart gerekiyor.

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
yalnızca klasörlü olanlar uygulanır.

**Bugünkü sınır (bilinçli):** `plansVisibleToTenant` ve `listPublicPlans`
hazırdır ama fiyat sayfası, ayarlar faturalama paneli ve checkout hâlâ statik
`src/lib/billing/catalog.ts`'ten okur. Yani stüdyoda açılan bir paket — herkese
açık ya da özel — henüz hiçbir müşteri yüzeyinde satılmaz; `visibility` şu an
yalnız yönetim ekranında anlamlıdır. Üç yüzeyin `PlanVersion`'dan render'ı bu
kartın kapsamı dışındadır.
