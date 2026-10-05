# ADR-0010 — Kurum (tenant) düzeyi tüm veriyi dışa aktarma ve kurum hesabını silme

- **Durum:** ÖNERİLDİ (taslak). Kod yok. Patron kararları K-1..K-5 bekleniyor (§9).
- **Tarih:** 2026-10-01
- **Kart:** TASK-MUPIQODOCEZH9 (FB-GAP-1), pilot SSS P-5. Önceki tespit: `docs/agent-results/TASK-MUPA77EIENLPH-be-fb.md` (alan/ kökünde).
- **Hazırlayan:** BE-FB
- **İlgili:** ADR-0007 (pilot süresi dolunca salt-okunur), ADR-0008 (graphile-worker iş kuyruğu), ADR-0009 (imzalı `system_scope`), `docs/legal/processing-register.md`, `docs/legal/dpa-en.md` §6.

## 1. Bağlam

Kişi düzeyinde iki yol var ve ikisi de çalışıyor:

- `src/actions/user/export-data.ts` — KVKK md.11 / GDPR md.15, 20. Kişinin satırlarını tek `withSystemScope('subject-scoped', …)` işleminde toplar (satır 63), sırları dışarıda bırakır (satır 92), `user.data.exported` denetim kaydını `sha256(userId)` ile yazar (satır 217-249).
- `src/actions/user/request-deletion.ts` + `src/lib/jobs/tasks/users-scheduled-deletion.ts` — KVKK md.7 / GDPR md.17. Talep yalnız işaret koyar (satır 104-111), 30 gün sonra gece işi siler: önce R2, sonra FK'siz `User.id` kolonları, sonra `User` satırı, en son `user.erased` denetim kaydı (iş dosyası satır 104-195).

Kurum düzeyinde **hiçbiri yok**:

- `grep -rnE "tenant\.(delete|deleteMany)\(" src scripts` yalnız test/seed dosyalarında çıkar (6 test, 4 seed).
- `Tenant.deletedAt` **okunur ama hiçbir yerde yazılmaz.** Okuyanlar: `src/lib/auth.ts:729`, `src/lib/tenant-liveness.ts:19,33`, `src/lib/api-auth.ts:115`. `tenant.update(` çağrıları yalnız `province` (`settings/profile/actions.ts:40`), `kind` (`agency/actions.ts:59`), `settings` (`agency/cobrand-store.ts:113`) yazar.
- `deletionReason` sözlüğünde `tenant_cascade` tanımlı (`prisma/schema.prisma:119`, `docs/DATA_MODEL.md:158`) ama yazan kod yok.
- `/admin/tenants` yalnız listeler (`src/app/[locale]/admin/tenants/page.tsx`), silme ya da dışa aktarma yok.

Buna karşılık `docs/legal/dpa-en.md:48` müşteriye şunu vaat ediyor: "On termination the Controller may export all data within 30 days. After that period the data is permanently deleted." Ürün bu vaadi bugün yerine getiremiyor. GDPR md.28(3)(g) da işleyenin (Fabrika, kiracı içeriği için — register §6, §7) hizmet bitince veriyi sorumlunun seçimine göre **iade etmesini ya da silmesini** şart koşuyor.

### 1.1 Neden "Tenant satırını sil" yetmez

`schema.prisma`'daki 75 modelden kiracıya bağlı 50'si (`prisma/rls.sql` satır 8-15'teki 47 + `Document`, `Chunk`, `ConceptTemplate`). Bunların **21'i `Tenant`'a FK zinciriyle bağlı değil**. `DELETE FROM "Tenant"` onları yerinde bırakır (Ek A, "Cascade" sütunu "YOK"): `SavedSearch`, `PartnerOrg`, `Evidence`, `Claim`, `ClaimEvidenceLink`, `ProposalUsage`, `EvidenceReminder`, `ConceptTemplate` (kiracı satırları), `ConceptNote`, `Relationship`, `Interaction`, `SeatCandidate`, `AiUsageLog`, `Document`, `Chunk`, `MeetingBrief`, `CalendarConnection`, `TtoPortfolioItem`, `ApiKey`, `Feedback`, `Consent`. Ayrıca `TopicMatch`'in K1 satırları (`opportunityId = NULL`) yalnız `Topic`'e bağlı, onlar da kalır.

Ters yönde iki tehlike var. Cascade bunları **siler**:

- `Invoice` (`schema.prisma:461`, `onDelete: Cascade`) — VUK'a göre saklanması gereken mali belge.
- `AuditEvent` (`schema.prisma:1244`, `onDelete: Cascade`) — silmenin kendisini kanıtlayacak kayıt da onunla gider.

## 2. Karar (önerilen)

Kurum verisi **iki ayrı arka plan işiyle** yönetilir. İkisi de mevcut kalıpları yeniden kullanır, yeni bir kaçış yolu açmaz.

### 2.1 Kim tetikler, kim onaylar

- **Tetikleyen:** yalnız `TENANT_OWNER`. `src/lib/rbac.ts`'e yeni bir `Action` eklenir: `manage_tenant_lifecycle`. Yalnız `TENANT_OWNER` listesine girer. `TENANT_ADMIN` dahil değildir, çünkü kurum silme bir yönetim işi değil sözleşmeyi bitirme işidir.
- **Platform yöneticisi** kurumun yazılı talebiyle (destek kaydı) aynı işi `/admin/tenants` üzerinden başlatabilir. Pilot için ilk yol budur (K-3).
- **Onay (silme için):**
  1. Sahip kurumun `slug`'ını elle yazar. Bu, yanlış kurumda tıklamayı önler.
  2. Kurumda başka `TENANT_OWNER` varsa talep, mevcut `ApprovalRequest` akışında yeni bir `actionType` (`TENANT_DELETION`, `requiredRole: TENANT_OWNER`) olarak ikinci sahibin onayına düşer. Tek sahipli kurumda bu adım atlanır.
  3. Talep anında bütün `TENANT_OWNER` ve `TENANT_ADMIN` üyelerine e-posta gider. Talep eden sahip de dahil.
- **Dışa aktarma** onay istemez, ama `manage_tenant_lifecycle` ister. İçinde bütün üyelerin adı ve e-postası var.

### 2.2 Dışa aktarma biçimi

Tek bir ZIP dosyası. GDPR md.20'deki "yapılandırılmış, yaygın kullanılan, makinece okunabilir" şartını karşılar:

```
fonbridge-export-<slug>-<YYYYMMDD>.zip
├── manifest.json        # exportId, tenantId, generatedAt (UTC), schemaVersion (git SHA),
│                        # tablo başına satır sayısı ve sha256, dosya listesi, notice{tr,en}
├── tables/<Model>.ndjson # Ek A'da "Dışa aktarılır" olan her model; satır başına bir JSON
└── files/<r2 key>        # Evidence nesneleri, Feedback ekran görüntüleri, ajans logosu
```

- Sırlar asla girmez. Bunlar `export-data.ts:92`'deki kuralla aynı: `ApiKey.keyHash`, `Invitation.tokenHash`, `ApplicationPart.magicTokenHash`, `AgencyInviteCode.codeHash`, `CalendarConnection.accessToken/refreshToken`, `Account.*_token`.
- Vektörler (`embedding`) girmez, çünkü kaynak metinden yeniden üretilir ve taşınabilir değildir.
- `notice`, `export-data.ts:189-192`'deki Evaluator Lens uyarısını aynen taşır.
- Para alanları minor unit + currency olarak kalır (CLAUDE.md kural 9). Zamanlar UTC ISO-8601 olur.

### 2.3 Arka plan işi

İş kuyruğu ADR-0008'deki graphile-worker'dır. Yeni görevler `src/lib/jobs/schedule.ts` + `tasks/index.ts`'e eklenir.

**`tenant-export`** (talep üzerine, kendi `queue`'su, `jobKey = tenant-export:<tenantId>`, yani aynı kurum için ikinci bir iş birinciyle birleşir):

1. **`withTenant(tenantId, …)` içinde okur, `withSystemScope` KULLANMAZ.** Kiracı tablolarının hepsi `tenantId` taşır ve `tenant_isolation` altında okunabilir. Bu, kişi düzeyindeki dışa aktarmadan iyidir: yeni bir `scripts/tenant-bypass-baseline.json` girdisi açılmaz. Üyelerin `User` satırları (RLS'siz, `scripts/rls-models.ts:25`) aynı işlemde `Membership.userId` ile okunur.
2. Model listesi elle yazılmaz. `scripts/rls-models.ts`'deki `tenantScopedModels()` + `NULLABLE_TENANT`'tan türetilir. Yeni bir model eklendiğinde dışa aktarmada eksik kalırsa test kırmızı olur (kart U-2).
3. ZIP, R2'ye `exports/<tenantId>/<exportId>.zip` olarak yazılır. Bu dördüncü önek olur (§2.5). Talep edene 7 gün geçerli imzalı bağlantı e-postayla gider (`getPresignedDownloadUrl`, `storage.ts:393`).
4. `tenant-export-cleanup` (günlük) 7 günü geçen ZIP'leri siler.
5. KVKK md.13/2 ve GDPR md.12(3) en geç 30 günlük yanıt süresi koyar. İş dakikalar içinde biter, süre bu yüzden risk değildir.

**`tenants-scheduled-deletion`** (günlük 03:15 UTC, `users-scheduled-deletion`'dan sonra, `maxAttempts: 5`, `fill: '6h'`):

1. **Keşif:** `Tenant` RLS'sizdir (`rls-models.ts:25`). `deletionRequestedAt <= now() - 30 gün` sorgusu için sistem kapsamı gerekmez.
2. **Ön koşul (fail-closed):** Kurumda `Invoice` ya da `LifetimeLicence` satırı varsa silme yapılmaz. `recordAlert` ile `SystemAlert` yazılır, kurum bekletmede kalır (§2.6, K-4). Pilot kurumlarında bu satırlar yoktur (ADR-0007 madde 3).
3. **Önce depolama:** `users-scheduled-deletion.ts:107`'deki kural burada da geçerli: DB silmesi başarısız olursa dosya yetim kalmamalı. Üç önek silinir: `<tenantId>/`, `incoming/<tenantId>/`, `feedback/<tenantId>/`. Ayrıca `exports/<tenantId>/` silinir. `ListObjectsV2` **sayfalı** okunur (`ContinuationToken`), çünkü tek çağrı en çok 1000 anahtar döner.
4. **FK'siz 21 tablo:** tek bir `withTenant(tenantId, …)` işleminde, Ek A'daki sırayla `deleteMany({ where: { tenantId } })` çalışır. `Consent` silinmez (Ek A, K-2 notu).
5. **Üyeler (K-2):** Başka kurumu olmayan üyelere `deletionRequestedAt = <kurumun talep anı>` ve `deletionReason = 'tenant_cascade'` yazılır. Bu değer sözlükte zaten var. Hesap, mevcut `users-scheduled-deletion` ile silinir. Başka kurumu olan üyenin yalnız `Membership` satırı gider (cascade).
6. **Mezar taşı:** `AuditEvent { tenantId: NULL, type: 'tenant.erased', target: sha256(tenantId), data: { requestedAt, purgedAt, rowCounts, objectCount } }`. `withSystemScope('cross-tenant-job', …)` ile yazılır. Bu, `user.erased`'in kalıbıdır (`users-scheduled-deletion.ts:236-273`). Kurumun kendi `AuditEvent`'leri cascade ile gider. Mezar taşı kurum satırına bağlı olmadığı için kalır.
7. **`DELETE FROM "Tenant"`:** geri kalan 29 tablo cascade ile gider.
8. Hata olursa kurum başına `SystemAlert` yazılır. Yalnız kod ve kurum id'si taşır, içerik taşımaz (`buildPurgeFailureAlert` kalıbı, `users-scheduled-deletion.ts:46-64`).

**Doğrulanması gereken varsayım:** FK cascade eylemlerinin RLS'e takılmadığı varsayılıyor. PostgreSQL'de referans bütünlüğü RLS'i atlar. `MeetingBrief` yorumu da aynı şeyi söylüyor (`schema.prisma:1376-1377`: "constraint checks bypass RLS"). Bu, `fabrika_app` ile canlı testte ölçülecek (kart U-3). Ölçüm başarısız çıkarsa 7. adım sahip rolüyle çalışan bir SECURITY DEFINER fonksiyona taşınır.

### 2.4 30 gün bekleme ve bekleme sırasındaki durum

- Talep anında `Tenant.deletionRequestedAt` yazılır. Bu **yeni ve additive** bir kolondur: `ADD COLUMN IF NOT EXISTS`, nullable.
- **Bekleme süresince kurum salt-okunurdur, kapanmaz (K-1).** `assertTenantWritable` (`src/lib/billing/pilot.ts:140`) `deletionRequestedAt`'i de okur. Pilot süresi dolmuş kurumdaki gibi yazmalar sunucuda reddedilir. Amber bant gösterilir. Dışa aktarma ve "silmeyi iptal et" açık kalır.
- `Tenant.deletedAt` bekleme sırasında **yazılmaz.** Bugünkü anlamı "kapalı"dır (`auth.ts:729` kurumu oturumdan düşürür). Bekleme sırasında yazılırsa sahip iptal ekranına ulaşamaz. `deletedAt` yalnız silme işi başlarken (adım 3'ten önce) yazılır, böylece silme sırasında kimse yazamaz.
- **İptal:** `manage_tenant_lifecycle` + `deletionRequestedAt = NULL` + `tenant.deletion.cancelled` denetim kaydı.

### 2.5 Depolama ve dış sistemler

| Yer | Ne var | Dışa aktarma | Silme |
|---|---|---|---|
| R2 `<tenantId>/…` | Kanıt dosyaları (`generateR2ObjectKey`, `storage.ts:51-68`), ajans logosu (`agency/cobrand-store.ts:106`) | `files/` altına | Önek, sayfalı |
| R2 `incoming/<tenantId>/…` | Onaylanmamış yükleme hazırlığı (`storage.ts:186`, `INCOMING_KEY_SHAPE`) | Hayır (onaylanmamış) | Önek |
| R2 `feedback/<tenantId>/…` | Geri bildirim ekran görüntüsü (`feedback/submit.ts:104`) | `files/` altına | Önek |
| R2 `exports/<tenantId>/…` | Bu ADR'nin ZIP'i (yeni) | — | 7 gün + silmede önek |
| Stripe | `Subscription.providerCustomerId` müşterisi | Hayır | **Kod yok.** `grep -rnE "customers\.(del\|delete)" src` sonuç vermiyor. Pilot `provider='pilot'`, Stripe müşterisi yok. Ücretli satışta ayrı kart gerekir. |
| Anthropic / OpenAI | İstem ve embedding girdisi (register §6, §7) | — | Bizde istem saklanmaz (`promptHash`). Sağlayıcı tarafındaki saklama bizim kontrolümüzde değil, silme bildiriminde söylenir. |
| SMTP (Vulut cPanel) | Gönderilmiş bildirim e-postaları | — | Sunucu günlükleri bizim kodumuzda değil, bildirimde söylenir. |
| PostHog | Varsayılan kapalı (register §19a) | — | Açıksa el ile silme talebi, runbook'a yazılır. |
| graphile-worker `jobs` | `tenantId` taşıyan bekleyen iş yükleri (`jobs/events.ts:95`) | — | Fan-out işleri `keepLiveTenantRows` ile ölü kurumu atlar (`tenant-liveness.ts:30`). Silme işi kuruma ait bekleyen işleri `remove_job` ile kaldırır. |
| Sunucu günlükleri | `console.error` içinde id'ler (ör. `users-scheduled-deletion.ts:198`) | — | Saklama süresi tanımsız (register §22), bildirimde söylenir. |
| DB yedekleri | **Bugün yok** (`docs/RELEASE_CHECKLIST.md:261-263`) | — | Yedek kurulunca silinen veri dönüş süresi boyunca yedekte kalır. Silme bildirimi bunu söylemek zorunda. |

### 2.6 Saklananlar

- **`Invoice`, `LifetimeLicence`:** mali kayıt. VUK md.253 (5 yıl) ve TTK md.82 (10 yıl) saklama ister. Cascade bunları siliyor, bu yüzden silme işi bu satırlar varken çalışmaz (§2.3 adım 2). Ücretli satıştan önce K-4 kararı ve mali müşavir onayı gerekir. Önerilen yol: `Invoice`'ın kurum FK'si `SET NULL` yapılır ve `buyer*` anlık görüntüsü kalır, ya da satış öncesi bir arşiv tablosu açılır.
- **`Consent`:** register §18b'de Fabrika'nın kendi md.5(2) kanıtıdır. Kişi silmesinde de tutulur (`users-scheduled-deletion.ts:168-179`). Kurum silmesinde de tutulur. FK'si olmadığı için kendiliğinden kalır. Kurum satırı gittikten sonra yalnız sistem kapsamında okunabilir. Register'a satır eklenir.
- **Mezar taşı `AuditEvent`:** kişisel veri taşımaz. Yalnız hash, sayılar ve tarihler.

### 2.7 Denetim

| Olay | Nerede | Kapsam |
|---|---|---|
| `tenant.export.requested` / `.completed` / `.failed` | `AuditEvent`, kurumun kendi | `withTenant` |
| `tenant.deletion.requested` / `.cancelled` | `AuditEvent`, kurumun kendi | `withTenant` |
| `tenant.erased` | `AuditEvent`, `tenantId NULL` | `withSystemScope('cross-tenant-job')` |

`data` alanına yalnız sayılar, tarihler ve `sha256(actorId)` yazılır. `export-data.ts:224-228`'deki "row counts only" kuralı geçerlidir. Kişisel verinin ikinci kopyası denetim kaydına yazılmaz.

## 3. Hukuki dayanak

| Kural | Bu ADR'deki karşılığı |
|---|---|
| KVKK md.7 — işleme şartı kalkınca silme, yok etme ya da anonimleştirme | `tenants-scheduled-deletion` + Ek A "Silme" sütunu |
| KVKK md.11/1-b, -e — bilgi talep etme, silinmesini isteme | Kişi düzeyi zaten var. Kurum talebi bütün üyeler adına sahipten gelir, üyeler K-2 ile kişisel silmeye girer. |
| KVKK md.13/2 — başvuru en geç 30 gün içinde ücretsiz sonuçlanır | Dışa aktarma dakikalar içinde biter. |
| GDPR md.17(1), md.17(3)(b), (e) — silme hakkı, yasal yükümlülük ve hukuki talep istisnaları | `Invoice` / `Consent` istisnası (§2.6) |
| GDPR md.20 — makinece okunabilir taşınabilirlik | NDJSON + manifest (§2.2) |
| GDPR md.28(3)(g) — hizmet bitince iade ya da silme, sorumlunun seçimine göre | Dışa aktarma + silme. DPA §6 vaadinin ürün karşılığı. |
| GDPR md.5(2) — hesap verebilirlik | §2.7 denetim olayları + mezar taşı |

**Not:** GDPR yalnız kişisel veriyi kapsar. Kurumun ticari verisinin (teklifler, kanıtlar) iadesi sözleşme yükümlülüğüdür, DPA §6'dan gelir. Bu yüzden dışa aktarma **bütün** kurum verisini kapsar, yalnız kişisel veriyi değil.

## 4. Pilot süresi dolmuş kurum

- ADR-0007 madde 5: süre dolunca kurum salt-okunur kalır, **veri silinmez**, otomatik silme yoktur. Bu ADR bunu değiştirmez.
- Salt-okunur kurumda **dışa aktarma açık olmalıdır.** `tenant-export` okuma işidir, `assertTenantWritable`'dan geçmez. Talebi açan sunucu eylemi `requireTenantAction({ readOnly: true, can: 'manage_tenant_lifecycle' })` kullanır. Talep satırını yazması pilot kapısına takılmamalıdır. Kapıdan muaf, adı konmuş tek istisna budur. Rapor ve test bu yüzden kart U-4'te ayrıca ister.
- **Silme talebi de açık olmalıdır.** Süresi dolmuş pilot kurumunun en olası isteği budur.
- Açık soru (karar değil): süresi dolmuş ve talep açmamış kurumun verisi ne kadar tutulur? DPA §6 "termination"dan sonra 30 gün diyor, ADR-0007 süresiz salt-okunur diyor. İkisi çelişiyor (§9 K-1 notu).

## 5. Yetim kurum

**Bugünkü davranış:** Tek sahip kendi hesabını silerse yalnız uyarı alır (`request-deletion.ts:79-101`, `soleOwnerOf`), silme engellenmez. 30 gün sonra `Membership` cascade ile gider (`schema.prisma:190`). Kurum sahipsiz kalır. Hiç kimse `manage_billing` ya da `manage_tenant_lifecycle` yapamaz, kurum verisi de süresiz kalır.

Kişi silmesinin kurum verisine iki yan etkisi daha var. Bunlar da bu ADR'nin kapsamına girer:

- `ApprovalRequest.requester` `onDelete: Cascade` (`schema.prisma:1533`). Talep edenin silinmesi kurumun onay geçmişini de siler.
- `Reviewer.user` `onDelete: Cascade` (`schema.prisma:1319`), `Score` da `Reviewer`'a cascade. Hakemin silinmesi kurumun panel puanlarını siler.

Öneri K-5'te.

## 6. Reddedilen seçenekler

- **Yalnız `DELETE FROM "Tenant"`:** 21 tablo yerinde kalır, faturalar ve denetim kaydı gider (§1.1).
- **Dışa aktarmayı `withSystemScope('subject-scoped')` ile yazmak:** kişi kalıbını kopyalamak olurdu. Gereksiz bir kaçış açar, çünkü kurum `withTenant`'ın tam sorusu.
- **Senkron (istek içinde) ZIP üretmek:** kanıt dosyaları 25 MB'a kadar (`EVIDENCE_MAX_BYTES`, `storage.ts:115`). İstek zaman aşımına düşer ve havuzu tutar (G-1 havuz zaman aşımı geçmişi).

## 7. Sonuçlar

- Bir migration gerekir: `Tenant.deletionRequestedAt` + `TenantDataRequest` tablosu (durum takibi). Additive ve idempotent olur, down dosyası olur.
- `scripts/tenant-bypass-baseline.json`'a tek yeni `withSystemScope` girer (mezar taşı). Dışa aktarma ve 21 tablo silmesi kapsam içindedir.
- `docs/legal/processing-register.md`'ye bir bölüm eklenir. §13 satırı güncellenir: `AuditEvent.actorId` artık NULL'lanıyor (`users-scheduled-deletion.ts:146`), register bunun açık olduğunu yazıyor. `dpa-en.md` §6 ürünle hizalanır.

## 8. Bu ADR'nin bulduğu, kapsam dışı hata

`deleteUserFilesFromR2` (`src/lib/storage.ts:484-512`) `users/<userId>/` önekini siler, ama bu öneke **hiçbir kod yazmıyor**. `grep -rn "users/" src` yalnız bu satırı buluyor (`storage.ts:491`). Yazılan önekler `<tenantId>/`, `incoming/<tenantId>/` ve `feedback/<tenantId>/`. Kişi silmesinin "önce depolama" adımı (register §15'in dayanağı) bu yüzden hiçbir şey silmiyor. Kişiye ait dosya zaten kurum önekinde ve kurumun verisi sayılır, bu yüzden davranış muhtemelen doğru. Yanlış olan, register'ın ve kod yorumunun anlattığı şey. Ayrıca sayfalama yok, tek çağrı en çok 1000 anahtar siler. Kart U-6.

## 9. Patron kararları

Ayrıntılı 1-3-1 metinleri sonuç raporunda (`docs/agent-results/TASK-MUPIQODOCEZH9-be-fb.md` §5). Özet:

- **K-1** Bekleme sırasında kurum: salt-okunur + dışa aktarma açık (öneri) / hemen kapalı / bekleme yok.
- **K-2** Üyelerin kişisel hesapları: yalnız başka kurumu olmayanlar `tenant_cascade` ile silinir (öneri) / hiçbiri / hepsi.
- **K-3** Pilotta tetikleyen: önce platform yöneticisi + iş, sonra sahip self-servis (öneri) / yalnız el prosedürü / doğrudan self-servis.
- **K-4** Mali kayıt varken silme: fail-closed + mali müşavir (öneri) / faturaları da sil / faturayı FK'siz arşive al.
- **K-5** Yetim kurum: tek sahip, sahipliği devretmeden ya da kurumu silmeden hesabını silemez (öneri) / bugünkü uyarı / en eski yöneticiye otomatik devir.

---

## Ek A — Model envanteri (75 model)

Kaynak: `prisma/schema.prisma` (dev `629cc071`). Bağ türü `scripts/rls-models.ts` ve `prisma/rls.sql:7-15, 30` ile çapraz kontrol edildi. "Cascade" sütunu şemadaki `@relation(onDelete: Cascade)` zincirinden hesaplandı. Canlı DB'de `pg_constraint` ile teyit **yapılamadı**, çünkü `localhost:5433` kapalıydı (TASK-MUPE1WNXJGYXT). Temel şema `prisma migrate dev` ile kurulduğu için FK'ler şemadan gelir. Kart U-3'ün canlı testi bunu ölçer.

Kısaltmalar:
- **KV** (kişisel veri): Y = yüksek (ad/e-posta/kimlik no/serbest metin), D = dolaylı (yalnız `userId`), — = yok.
- **Dışa:** E = dışa aktarılır, E\* = sırlar/vektör hariç, H = hayır.
- **Silme:** C = `Tenant` silinince cascade ile, X = işin açıkça sildiği (FK yok), S = saklanır, A = anonimleştirilir, P = platform verisi, dokunulmaz.

### A.1 Kiracı kökü, kimlik, üyelik

| # | Model | Kiracı bağı | KV | Dışa | Silme | Not |
|---|---|---|---|---|---|---|
| 1 | Tenant | kök (RLS yok) | — (kurum adı, PIC) | E | son adım | `settings` içinde ajans logo anahtarı var |
| 2 | AgencyInviteCode | tenantId → Tenant | — | E\* | C | `codeHash` hariç, `codeHint` girer |
| 3 | User | yok (SYSTEM_WIDE) | Y | E (yalnız üyeler: id, ad, e-posta, dil) | K-2 | `isPlatformAdmin` girmez |
| 4 | Account | User üzerinden | Y (token) | H | User ile | sır |
| 5 | Session | User üzerinden | D | H | User ile | |
| 6 | VerificationToken | yok | D | H | P | kuruma bağlanamaz |
| 7 | Membership | tenantId → Tenant | D | E | C | |
| 8 | Workspace | tenantId → Tenant | — | E | C | |
| 9 | TenantProfile | tenantId → Tenant | — | E\* | C | `embedding` hariç |
| 10 | Invitation | tenantId → Tenant | Y (e-posta) | E\* | C | `tokenHash` hariç |
| 11 | ApprovalRequest | tenantId → Tenant | D | E | C | |
| 12 | Consent | tenantId, FK yok | D | E | **S** | Fabrika'nın md.5(2) kanıtı, §2.6 |

### A.2 Modüller, plan, faturalama

| # | Model | Kiracı bağı | KV | Dışa | Silme | Not |
|---|---|---|---|---|---|---|
| 13 | ModuleCatalog | yok | — | H | P | |
| 14 | ModuleState | tenantId → Tenant | — | E | C | |
| 15 | Plan | yok | — | H | P | |
| 16 | PlanVersion | yok | — | H | P | |
| 17 | PlanFeature | yok | — | H | P | |
| 18 | PlanAssignment | tenantId → Tenant | D (`assignedBy`) | E | C | |
| 19 | AddOnCatalog | yok | — | H | P | |
| 20 | Subscription | tenantId → Tenant | — | E | C | Stripe müşterisi dışarıda kalır (§2.5) |
| 21 | AddOn | Subscription üzerinden | — | E | C | |
| 22 | LifetimeLicence | tenantId → Tenant | — | E | **S / fail-closed** | mali (K-4) |
| 23 | Invoice | tenantId → Tenant | Y (VKN/TCKN, adres) | E | **S / fail-closed** | VUK md.253, TTK md.82 (K-4) |
| 24 | TenantBillingIdentity | tenantId → Tenant | Y (VKN/TCKN) | E | C | |
| 25 | CreditLedger | tenantId → Tenant | — | E | C | |
| 26 | StripeEventLog | tenantId → Tenant | — | H | C | idempotency anahtarı |
| 26a | Notification | tenantId → Tenant | D (`userId`, alıcı; `payload` yalnız kimlik/sayı) | E | C | ADR-0011 (TASK-MUVR24EHWI2RA). Kişi silmede `users-scheduled-deletion` `userId` ile siler, kişi dışa aktarmasında (`export-data.ts`) yer alır; 90 gün sonra `notifications-retention` siler. Ek A sayımına (75) sonradan eklendi. |

### A.3 Paylaşılan katalog (K1, K2, CORDIS) — dokunulmaz

| # | Model | Kiracı bağı | KV | Dışa | Silme |
|---|---|---|---|---|---|
| 27-30 | Programme, Call, Topic, TopicStat | yok | — | H | P |
| 31 | RawFetch | yok | — | H | P |
| 32 | SystemAlert | yok (`meta` kurum/kişi id'si taşıyabilir) | D | H | P (id taşır, içerik taşımaz) |
| 33 | PublicLead | yok (anonim ziyaretçi) | Y | H | P (kendi temizlik işi var) |
| 34-41 | CordisProject, CordisOrganization, CordisParticipation, CordisProjectTopic, CordisProjectSciVoc, CordisImportRun, CordisPartnerProfile, CordisCoParticipation | yok | — | H | P |

### A.4 Kiracı içeriği — FK zinciriyle Tenant'a bağlı (cascade)

| # | Model | Zincir | KV | Dışa | Silme |
|---|---|---|---|---|---|
| 42 | Opportunity | → Workspace → Tenant | — (`ownerId` D) | E (arşivliler `deletedAt` ile) | C |
| 43 | GateDecision | → Opportunity | D (`decidedBy`) | E | C |
| 44 | ConsortiumSeat | → Opportunity | — | E | C |
| 45 | Proposal | → Opportunity | — | E | C |
| 46 | Effort | → Opportunity | D | E | C |
| 47 | Evaluation | → Opportunity | D | E | C |
| 48 | Reviewer | → Evaluation | D | E | C |
| 49 | Criterion | → Evaluation | — | E | C |
| 50 | Score | → Reviewer | Y (yorum) | E | C |
| 51 | FollowupDoc | → Opportunity | Y (`approvalSubmittedByName`) | E | C |
| 52 | DualApprovalStep | → FollowupDoc | Y (`actorName`) | E | C (imza, dışa aktarmayla kuruma teslim edilir, register §12) |
| 53 | ApplicationPart | → Opportunity | serbest metin | E\* | C |
| 54 | TopicMatch (G0 satırları) | → Opportunity | — | E | C |
| 55 | AuditEvent | tenantId? → Tenant | D + `data` JSON | E | C, mezar taşı ayrı (§2.3/6) |

### A.5 Kiracı içeriği — Tenant'a FK yok (iş açıkça siler; sıra bu)

| Sıra | Model | Bağımlılık | KV | Dışa | Silme |
|---|---|---|---|---|---|
| 1 | ApiKey | — | — | E\* (ad, önek, son kullanım) | X — **ilk sırada**, API yazmasını keser |
| 2 | CalendarConnection | — | Y (düz metin token) | E\* (token hariç) | X |
| 3 | EvidenceReminder | → Evidence | Y (`recipientEmails`) | E | X (Evidence ile de gider) |
| 4 | ProposalUsage | → Evidence | D | E | X |
| 5 | ClaimEvidenceLink | → Claim, Evidence | — | E | X |
| 6 | Evidence | — | serbest metin + OCR | E + dosya | X |
| 7 | Claim | — | serbest metin | E | X |
| 8 | Chunk (tenantId ≠ NULL) | → Document | serbest metin | E\* | X |
| 9 | Document (tenantId ≠ NULL) | — | — | E | X (platform satırları NULL, dokunulmaz) |
| 10 | ConceptTemplate (tenantId ≠ NULL) | — | — | E | X |
| 11 | ConceptNote | — | serbest metin | E | X |
| 12 | MeetingBrief | Opportunity SetNull | Y (`partnerName`, metin) | E | X |
| 13 | Interaction | — | serbest metin | E | X |
| 14 | Relationship | — | Y (`counterpartName/Email`, üçüncü kişi) | E | X |
| 15 | SeatCandidate | — | — | E | X |
| 16 | PartnerOrg | — | — | E | X |
| 17 | TopicMatch (K1, `opportunityId NULL`) | → Topic | — | E | X |
| 18 | SavedSearch | — | D | E | X |
| 19 | AiUsageLog | — | D | E | X (kredi faturası yok, pilot) |
| 20 | TtoPortfolioItem | — | — | E | X |
| 21 | Feedback | — | Y (serbest metin, ekran görüntüsü) | E + dosya | X |
| — | Consent | — | D | E | S (A.1 #12) |

**Sayım (betikle doğrulandı, rapor §2):** 75 model = `tenantId` kolonu olmayan 25 (A.3'te 15 + A.2'de 5 katalog + `Tenant`, `User`, `Account`, `Session`, `VerificationToken`) + `tenantId` taşıyan 50 (Tenant'a cascade zinciri olan 29 + FK zinciri olmayan 21; bu 21'in 20'si açıkça silinir, 1'i `Consent` saklanır). `TopicMatch` iki satır sınıfı yüzünden iki yerde görünür.
