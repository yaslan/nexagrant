# ADR-0011 — Bildirim deposu (Notification): model, üreticiler, okundu durumu

- **Durum:** KABUL EDİLDİ (06.10.2026). Lider onayı ve patron kararı K-1790 = A (toplu); kalem kalem aynı cevaplar K-1791..K-1798 (§9). Uygulama: FB-NOTIF-1 sprinti (TASK-MUVR24EHWI2RA, TASK-MUVR2C9H3KTHQ, TASK-MUVR2HXPCYRGT).
- **Tarih:** 2026-10-06
- **Kart:** TASK-MUVIK218O313G. Önceki tespit: `docs/agent-results/TASK-MUU7678DFI9QF-explor-fb.md` (alan/ kökünde; B0, N1).
- **Hazırlayan:** PRM-FB
- **İlgili:** ADR-0008 (graphile-worker iş kuyruğu), ADR-0009 (imzalı `system_scope`), ADR-0010 (kurum dışa aktarma/silme, model envanteri), `prisma/rls.sql`, `src/lib/db.ts`.

Bu ADR'deki tüm dosya:satır atıfları `origin/dev` 2f32dfae üzerinde `git grep` ile ölçüldü.

## 1. Bağlam

Bildirim merkezi (kabuktaki zil + `/notifications` · `/bildirimler`) hep boş:

- `prisma/schema.prisma` içinde bildirim modeli yok.
- `src/app/[locale]/(app)/[workspace]/notifications/page.tsx:33` → `initialNotifications={[]}`.
- `src/components/UserMenu.tsx:227` → `baseNotifications = useMemo(() => [], [])`. İkisi de TASK-MTQYXISOPUJ53'te uydurma öğeler ("%92 eşleşme", "500 AI kredi") silinince boşaltıldı.
- Okundu bilgisi yalnız tarayıcıda: `src/lib/hooks/use-read-notifications.ts:25-27` anahtarı e-postaya bağlar (`fonbridge_read_notifs_<email>`).
- **N1 hatası:** aynı dosyada `GUEST_STORAGE_KEY = 'fonbridge_read_notifs_guest'` (satır 22), `readSnapshot` bu anahtarı her zaman okur (satır 43-48), `useReadNotificationIds` onu oturum açmış kullanıcının kümesine birleştirir (satır 76-79). Sonuç: oturum kapalıyken okunan kimlikler, aynı tarayıcıda sonra oturum açan **herkes** için okunmuş sayılır.
- `tests/e2e/notifications-center.spec.ts:314-366` → 6 `test.fixme` (rozet, tümünü okundu, yenileme, zil noktası, sekmeler arası, B/A izolasyonu) depo olmadığı için kapalı.

Ürün bugün kullanıcıya üç şeyi yalnız e-postayla ya da hiç söylemiyor: kayıtlı aramaya yeni çağrı düştüğünü, kredinin yenilendiğini/bittiğini, kanıt belgesinin süresinin dolduğunu. SMTP yoksa (`SMTP_HOST` boş) bu bilgi hiç ulaşmıyor (§2.1).

## 2. Üretici envanteri (gerçek yerler)

### 2.1 Eşleşme

| Olay | Yer | Alıcı | Not |
|---|---|---|---|
| **Kayıtlı aramaya yeni çağrı düştü** | `src/lib/jobs/tasks/alerts-daily.ts:150` `sendSavedSearchAlerts`. Kanca noktası: `matchCount === 0` kontrolünden (satır 194) sonra, `mailer(...)` (satır 226) ile `touchLastRun` (satır 228) arası. | `SavedSearch.userId` (şema satır 715) | Günlük cron, zaten `withTenant` (`runTenant`) içinde. Bugün e-posta **aramanın sahibine değil, kurumun ilk sahibine** gidiyor (`ownerEmailQuery`, satır 91, 170). SMTP yoksa `NO_MAIL_PROVIDER` ile başarısız sayılıyor ve `lastRunAt` ilerlemiyor (satır 208-219). |
| K1 konu eşleşmesi yeniden hesaplandı | `src/lib/scoring/topic-match.ts:144` `writePage`, yazım `createMany` satır 177, güncelleme satır 170 | yok (kurum düzeyi, `TopicMatch` userId taşımaz) | Kurum başına yüzlerce satır; eşik ve alıcı kuralı olmadan bildirim seli olur. MVP dışı. |
| M8 konsorsiyum aday eşleşmesi | `src/modules/m8/server/matching.ts:138` `runSeatMatch` (yazım satır 319); `src/lib/scoring/consortium.ts:67` `runScoring` (yazım satır 173) | — | Kullanıcının bastığı düğmeyle (`FindCandidatesButton`) senkron çalışır, sonuç zaten ekranda. Bildirim değeri yok. |
| G0 skoru | `src/lib/scoring/g0-compute.ts:430` (`topicMatch.upsert`) | — | Kullanıcı tetikli, senkron. Bildirim değeri yok. |

### 2.2 Kanıt uyarısı

| Olay | Yer | Durum |
|---|---|---|
| Kanıt süresi doluyor / doldu | `Evidence.validUntil` (şema satır 1024); rozet hesabı `src/lib/evidence-status.ts:61` `evidenceBadge`; skor `src/lib/evidence-health.ts:34` `calculateEvidenceHealthScore` | **Üretici YOK.** İkisi de yalnız sayfa okunurken hesaplayan saf fonksiyonlar. Süre dolumunu tarayan bir iş yok (`src/lib/jobs/tasks/` içinde `validUntil` geçmiyor). |
| Kanıt hatırlatıcısı | `model EvidenceReminder` (şema satır 1114: `notifyAt`, `sent`, `recipientEmails`) | **Üretici YOK.** `git grep "evidenceReminder\."` src içinde 0 sonuç; yalnız `src/modules/m3/manifest.ts:25` tablo adını listeler. Model var, yazan/okuyan kod yok. |
| Kanıt doğrulandı/reddedildi | `src/app/[locale]/(app)/[workspace]/evidence/actions.ts:467` `verifyEvidenceAction` | Olay var ama `Evidence` modelinde yükleyen kullanıcı alanı yok → alıcı belirlenemez. |
| `src/lib/evidence-ai.ts:105` `extractEvidenceMetadata` | — | Metadata çıkarımı; bildirim üretecek bir olay değil. |

Kanıt uyarısı için yeni bir cron işi gerekir (`validUntil` taraması + `EvidenceReminder` kullanımı). Bu ayrı bir karttır.

> **Güncelleme (TASK-MUVR7HQQZVA2Z, 06.10.2026):** Üretici yazıldı: `evidence-expiring` işi (05:20 UTC), `src/lib/notifications/evidence-expiring.ts`. Kararlar: K-4956 = B, yani alıcı yükleyendir (`Evidence.createdBy`; yükleme akışı bu alanı dolduruyor, yukarıdaki "yükleyen alanı yok" tespiti eksikti). Değer `'system'` ise ya da kişi artık üye değilse uyarı TENANT_OWNER'lara gider. K-4958 = A: kural rozetle aynıdır (`EXPIRING_SOON_DAYS` = 30, yalnız doğrulanmış belge). K-4959 = A: `EvidenceReminder` kullanılmadı; tekrarı `dedupeKey = evidence-expiring:<id>:<validUntil ISO>` engelliyor. Modelin kaldırılması ayrı bir kart.

### 2.3 Kredi

| Olay | Yer | Alıcı |
|---|---|---|
| **Aylık kredi yüklendi** | `src/lib/jobs/tasks/credits-monthly-grant.ts:67` `grantCreditsToTenants`, yazım satır 98 (`createMany … skipDuplicates`); `count > 0` dalı satır 112-116 | Kurum sahipleri (`Membership.role`) — `CreditLedger` userId taşımaz |
| Abonelikle kredi yüklendi (Stripe) | `src/lib/billing/subscription-sync.ts:304` `syncStripeSubscription`, yazım satır 587 ve 603 | Kurum sahipleri |
| Abonelikle kredi yüklendi (iyzico) | `src/lib/iyzico.ts:539` `handleIyzicoWebhook`, yazım satır 751 | Kurum sahipleri |
| AI kullanımı kredi düştü | `src/lib/llm.ts:485` `generateCompletion`, yazım satır 552 | Bildirim değil (her çağrıda olur) |
| **Kredi bitti** | `src/lib/llm.ts:486-489` (`balance <= 0` → `throw 'Insufficient AI credits…'`) | Çağıran kullanıcı + sahipler; günde bir kez (dedupe) |

### 2.4 Diğer (MVP dışı aday)

- `src/lib/relationships/stale-reminder.ts:341` `sendStaleRelationshipReminders` (M4 bayat ilişki, `m4-stale-relationships` işi) — bugün yalnız e-posta.

## 3. Karar (önerilen)

### 3.1 Model

```prisma
model Notification {
  id          String           @id @default(cuid())
  tenantId    String
  userId      String           // alıcı; User.id (SavedSearch.userId ile aynı desen)
  workspaceId String?          // olayın ait olduğu çalışma alanı; NULL = kurum geneli
  type        NotificationType
  payload     Json             @default("{}") // yalnız kimlik ve sayı; metin YOK
  dedupeKey   String?          // aynı olayın ikinci kez yazılmasını engeller
  createdAt   DateTime         @default(now())
  readAt      DateTime?        // NULL = okunmadı
  tenant      Tenant           @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@unique([tenantId, userId, dedupeKey])
  @@index([tenantId, userId, readAt, createdAt])
}

enum NotificationType {
  SAVED_SEARCH_MATCH   // payload: { searchId, searchName, matchCount, since }
  CREDIT_GRANTED       // payload: { amount, period?, source: 'monthly'|'stripe'|'iyzico' }
  CREDIT_EXHAUSTED     // payload: { module }
  EVIDENCE_EXPIRING    // payload: { evidenceId, validUntil }  (üreticisi ayrı kart)
}
```

- **Metin depoya yazılmaz.** Başlık/açıklama `next-intl` ile `type` + `payload`'dan üretilir; kullanıcı dili değişince eski bildirimler de doğru dilde görünür. (Bugünkü e-posta gövdesi İngilizce sabit — `alerts-daily.ts:200-206`.)
- **`dedupeKey`**: kayıtlı aramada `saved-search:<searchId>:<since ISO>`. SMTP başarısız olunca `lastRunAt` ilerlemez ve iş ertesi gün aynı pencereyi yeniden sayar; anahtar olmadan aynı bildirim her gün tekrar yazılır. Yazım `createMany({ skipDuplicates: true })` ya da `upsert` ile.
- Migration `prisma/migrations/` altında `.sql` + `.down.sql` çifti, `apply-migrations.sh` ile iki kez uygulanabilir (idempotent).

### 3.2 RLS (projenin gerçek deseni)

Projede RLS tek bir oturum ayarına dayanır: `app.tenant_id`. `withTenantOn` (`src/lib/db.ts:185`) bunu `set_config('app.tenant_id', …, true)` ile yazar; sistem işleri ADR-0009'daki imzalı `app.system_scope_token` ile `withSystemScope` (`src/lib/system-scope.ts:177`) üzerinden geçer. **Kullanıcı düzeyi bir oturum ayarı yok.**

Öneri:

1. `Notification`, `prisma/rls.sql` satır 7-15'teki katı listeye eklenir → `tenant_isolation` politikası (`USING/WITH CHECK "tenantId" = current_setting('app.tenant_id', true)`), `ENABLE` + `FORCE ROW LEVEL SECURITY`. `scripts/check-rls.ts` ve `pnpm rls:verify` listeyi doğrular.
2. **Kullanıcı izolasyonu uygulama katmanında**: her okuma/yazma `where: { tenantId, userId: session.user.id }` taşır. Bu, aynı şekilde `userId` taşıyan `SavedSearch`'in bugünkü desenidir (`src/app/api/saved-searches/[id]/route.ts:40-45`).
3. Üreticiler zaten `withTenant` içinde çalışır (`alerts-daily.ts` `runTenant`, `credits-monthly-grant.ts` `runTenant`, `llm.ts:534`); ek kapsam gerekmez.

Kullanıcı düzeyini veritabanında zorlamak (`app.user_id`) ayrı bir karardır: K-5.

### 3.3 Okundu durumu ve N1'in kapanışı

- **Tek kaynak sunucu**: `readAt`. Her bildirim satırı tek bir kullanıcıya aittir, dolayısıyla okundu durumu doğal olarak **kullanıcı başına, bildirim başına**dır. Çalışma alanına göre ayrı okundu tutmak için aynı satırın birden çok çalışma alanında görünmesi gerekir; bu modelde öyle bir durum yok (K-1).
- **localStorage overlay kaldırılır** (öneri, K-2). `useReadNotificationIds`, `applyReadState` ve `notificationStorageKey` silinir; `markNotificationsRead` bir server action olur (`readAt = now()` yazar, `where: { tenantId, userId, id: { in: ids } }` ya da hepsi).
- **N1 böyle kapanır**: misafir anahtarı birleştirmesi (`use-read-notifications.ts:43-48, 76-79`) kodla birlikte gider. Oturum kapalı kullanıcının bildirimi yoktur, dolayısıyla misafir durumu da yoktur. Tarayıcılarda kalan eski `fonbridge_read_notifs_*` anahtarları bir kez temizlenir (zil ilk açıldığında `localStorage.removeItem`), içerikleri okunmaz.
- Neden "iyimser önbellek olarak bırak" önerilmiyor: overlay sunucu cevabıyla birleştirildiği sürece, N1 hatası ya da benzeri (başka hesabın anahtarı) geri gelir ve sunucu `readAt` boşken istemci "okundu" gösterir; mutant testi (`markNotificationsRead` hiçbir şey yazmıyor) overlay yüzünden E2E'de yakalanmaz. İyimser arayüz gerekiyorsa React `useOptimistic` ile bellek içinde, kalıcı depolama olmadan yapılır.
- **Sekmeler arası güncelleme** (fixme #5) bugün `storage` olayına dayanıyor. Overlay gidince bu test, diğer sekmenin odaklanınca (`visibilitychange`/`focus`) listeyi yeniden çekmesi şeklinde yeniden yazılır. Bu, testin anlamını değiştirir; qae-fb bunu açıkça not eder.

### 3.4 Saklama

Öneri (K-3): `createdAt`'ten **90 gün** sonra silinir (okunmuş ya da okunmamış). Yeni graphile-worker işi `notifications-retention` (ADR-0008 deseni, `stripe-event-cleanup.ts` örneği), `withSystemScope` ile günlük `deleteMany`. Ayrıca:

- `src/lib/jobs/tasks/users-scheduled-deletion.ts:144` yanına `tx.notification.deleteMany({ where: { userId } })` (KVKK md.7 silme).
- `src/actions/user/export-data.ts` kişi dışa aktarmasına `Notification` eklenir (KVKK md.11).
- ADR-0010 Ek A model envanterine `Notification` eklenir (kurum silmede `onDelete: Cascade` ile gider).

### 3.5 Çalışma alanı

`workspaceId` doldurulabilir ama MVP'deki iki üretici (kayıtlı arama, kredi) kurum düzeyindedir → `NULL`. Zil ve sayfa, kullanıcının **tüm** bildirimlerini gösterir; `workspaceId` doluysa yalnız o çalışma alanının URL'sinde süzme sonraki iştir.

## 4. MVP kapsamı

Önceki taslaktaki "MVP'de üretici yok" seçeneği zili ürün tarafında hep boş bırakır; değer yalnız testte görünür. Seçenekler (K-4):

| | Kapsam | Ürüne değer | Çaba |
|---|---|---|---|
| A | Depo + API + zil/sayfa, üretici yok | Yok (zil boş) | S |
| **B (öneri)** | A + **kayıtlı arama eşleşmesi** (`alerts-daily.ts`) | Var: günlük iş zaten çalışıyor, `withTenant` içinde, alıcısı (`SavedSearch.userId`) satırda; SMTP olmadan da kullanıcıya ulaşır | S-M (bir kanca + `SAVED_SEARCH_ALERT_QUERY.select`'e `userId`) |
| C | B + **aylık kredi yüklendi** (`credits-monthly-grant.ts:112`) | Ek: aylık bir bilgi | +S (sahipleri bulma; `count > 0` dalı zaten idempotent) |

Neden kayıtlı arama en kolay: tek yer, tek alıcı, zaten kiracı kapsamlı transaction, var olan bir kullanıcı ayarına (`SavedSearch.notify`) bağlı, ve tekrar riski `dedupeKey` ile kapanıyor. Kredi bitti (`llm.ts:486`) hata yolunda olduğu için ve kanıt uyarısının üreticisi hiç olmadığı için MVP dışı.

**MVP'de:** model + migration + RLS; `listNotifications`, `markNotificationsRead(ids | 'all')`; zil + sayfa depodan; overlay ve misafir anahtarı kaldırıldı (N1); B üreticisi; saklama işi + KVKK silme/dışa aktarma kancaları; 6 fixme testi açık.
**MVP dışı:** kredi bitti, kanıt süre uyarısı (yeni cron), K1/M8 eşleşmeleri, M4 bayat ilişki, e-posta/bildirim tercih ekranı, gerçek zamanlı push (SSE/websocket).

## 5. İş bölümü

| Rol | İş | Bağımlılık |
|---|---|---|
| **be-fb** | Model, enum, migration (`.sql` + `.down.sql`), `rls.sql` listesi; server action'lar `listNotifications` (son N, `readAt` ile), `markNotificationsRead(ids \| 'all')`; `alerts-daily.ts` kancası (`dedupeKey`, alıcı `SavedSearch.userId`); `notifications-retention` işi; `users-scheduled-deletion.ts` ve `export-data.ts` eklemeleri. Vitest: B kiracısı A'nın bildirimini görmez (`fabrika_app` rolüyle canlı), aynı kiracıda kullanıcı X, Y'nin bildirimini göremez/okundu yapamaz, `dedupeKey` ikinci yazımı engeller. | ADR onayı |
| **fe-fb** | Zil (`UserMenu.tsx:227-252`) ve sayfa (`notifications/page.tsx:33` + client) server action'dan beslenir; `use-read-notifications.ts` kaldırılır, eski anahtarlar bir kez temizlenir; metinler `next-intl` (EN/TR) ile `type`+`payload`'dan; `pnpm i18n:check` temiz. | be-fb action imzaları |
| **qae-fb** | `notifications-center.spec.ts` 6 fixme'yi açar, seed'i `withSystemScope` ile `Notification` satırı yazarak yapar; #5'i odak/yeniden çekme davranışına göre yeniden yazar; temiz DB'de CI tarifiyle (db push → db:rls-role → apply-migrations ×2 → db:rls → db:seed), benzersiz `E2E_PORT`, `--repeat-each=3`; mutant: `markNotificationsRead` yazmıyorsa E2E kırmızı. | be-fb + fe-fb |

## 6. Reddedilen seçenekler

- **Yalnız localStorage (bugünkü durum):** cihazlar arası yok, N1 hatası, sunucu tarafı üretici yazamaz.
- **Overlay'i iyimser önbellek olarak tutmak:** §3.3.
- **Ayrı `NotificationRead` birleştirme tablosu:** bir bildirim tek kullanıcıya ait olduğu için gereksiz; kurum geneli "duyuru" (bir satır, çok okuyucu) gelirse yeniden değerlendirilir.
- **Bildirim metnini depoya yazmak:** dil değişince eski bildirimler yanlış dilde kalır; payload yeterli.
- **`app.user_id` ile RLS (MVP'de):** `withTenantOn` ve tüm çağıranlarına dokunur; K-5.

## 7. Sonuçlar

- Bir tablo, bir enum, bir RLS liste girdisi, bir yeni cron işi.
- `use-read-notifications.ts` ve birim testi `tests/notifications-read-store.test.tsx` yerini server action testlerine bırakır.
- Kayıtlı arama sahibi, SMTP olmasa da yeni çağrıları zilde görür.

## 8. Bu ADR'nin bulduğu, kapsam dışı hatalar

- `alerts-daily.ts:91, 170`: kayıtlı arama e-postası aramanın sahibine (`SavedSearch.userId`) değil, kurumun ilk sahibine gidiyor. Çok üyeli kurumda üye kendi aramasının uyarısını hiç almıyor, sahip başkasının aramasını alıyor. (MVP B seçeneği bildirim tarafını doğru alıcıyla yapar; e-posta alıcısı ayrı kart.)
- `EvidenceReminder` modeli ve RLS'i var, kullanan kod yok (§2.2).

## 9. Patron kararları

| # | Soru | Seçenekler | Öneri | Patron kararı |
|---|---|---|---|---|
| K-1 | Okundu durumu kapsamı (N1) | a) kullanıcı başına (her satır tek kullanıcı, `readAt`) · b) çalışma alanı başına | **a** | **a** (K-1791) |
| K-2 | localStorage overlay | a) tamamen kaldır, eski anahtarları bir kez temizle · b) iyimser önbellek olarak tut (misafir birleşmesi kalkar) | **a** | **a** (K-1793) |
| K-3 | Saklama süresi | a) 90 gün (hepsi) · b) okunmuş 30 / okunmamış 180 gün · c) süresiz | **a** | **a** (K-1795) |
| K-4 | MVP'deki üretici | A) yok · B) kayıtlı arama · C) kayıtlı arama + aylık kredi | **B** | **B** (K-1796) |
| K-5 | Kullanıcı izolasyonu nerede | a) RLS kiracı + uygulama `where userId` (SavedSearch deseni) · b) yeni `app.user_id` ayarı ile RLS | **a** (b ayrı ADR) | **a** (K-1797) |
| K-6 | Kayıtlı arama bildiriminin alıcısı | a) `SavedSearch.userId` · b) bugünkü e-posta gibi kurumun ilk sahibi | **a** | **a** (K-1798) |

## 10. Platform

Kod yok; bu bir tasarım belgesi. Önerilen değişiklikler (Prisma, SQL, server action, React) platformdan bağımsızdır; doğrulama Linux konteyner CI-eşdeğeri ile yapılacaktır (kart DoD).
