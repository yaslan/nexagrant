# TASK-MTU6I3V2R30M8 — `withTenant` sarmalayıcısı olmadan kiracıya-özel tabloya erişen doğrudan `prisma.*` çağrıları (SALT OKUNUR triyaj)

**Ajan:** blok-zincir-denet-i (QA-EN) · **Tip:** runtime/güvenlik triyajı · **Kapsam:** `src/` altında, test dosyaları hariç, `prisma.<model>.<method>(` biçiminde yazılmış ve `withTenant`/`withTenantOn` sarmalayıcısı **kullanmayan** çağrılar, yalnızca `prisma/rls.sql`'de listelenen 43 kiracıya-özel/nullable-tenant tablo için.

Kod değiştirilmedi, commit atılmadı, test/kapı komutu koşulmadı.

---

## 0. Sayı doğrulaması

Görev tanımı 101 çağrı diyor. Ölçümüm: **101** — tam eşleşiyor.

Yöntem: `prisma/rls.sql`'deki üç `FOREACH` bloğundan (satır 7-14 tenant_isolation, satır 29 tenant_or_shared) modelleri çıkardım — 43 model (Membership…PlanAssignment + Document, Chunk, ConceptTemplate) — camelCase'e çevirip tek geçişte `grep -rnE "(^|[^.[:alnum:]_])prisma\.(model1|model2|...)\." src --include="*.ts" --include="*.tsx"` çalıştırdım, sonra `*.test.*`/`*.spec.*` ve `/tests?/` yollarını eledim. `Plan/PlanVersion/PlanFeature` (kiracı-dışı platform tabloları, RLS bölümünde ayrı ve zaten `withTenant` beklenmiyor) kapsam dışı bırakıldı — dahil edilselerdi sayı 101'in üstüne çıkardı.

**Önemli nüans (sayı aynı ama içerik saf değil):** 101 satırdan **3 tanesi gerçek kod değil, yorum/docstring içinde örnek/geçmiş-hata metni**:
- `src/app/[locale]/(app)/[workspace]/relationships/[id]/data.ts:12` — eski (düzeltilmiş) hatayı gösteren docstring örneği
- `src/app/api/documents/export/route.ts:15` — eski (düzeltilmiş) açık-uç hatasını anlatan yorum
- `src/lib/k5-pipeline/pipelineStore.ts:65` — "bu yüzden `withTenant` kullanıyoruz" diyen yorum

Yani **gerçek çalışan kod satırı sayısı 98**, ama görev "101"i doğrulamamı istediği için ham regex eşleşmesini (yorumlar dahil) esas aldım ve farkı burada açıklıyorum.

---

## 1. Kritik bağlam: `withTenant` bu kod tabanında bugün RLS'i *fiilen* etkinleştirmiyor

Bu, tüm risk değerlendirmesinin temeli, o yüzden en başa yazıyorum:

- `prisma/rls.sql` politikaları yalnızca `NOBYPASSRLS` bir rolde anlamlıdır. Ama uygulamanın gerçek `DATABASE_URL`'i **`fabrika` rolü** ile bağlanıyor (`.env:7`), ve bu rol `SUPERUSER` + `BYPASSRLS` (`src/lib/db.ts:58-62`, `prisma/rls-app-role.sql:1-9`, `docs/SECURITY_COMPLIANCE.md:51-52`, `docs/SECURITY_COMPLIANCE.md:83-84`: *"Uygulamanın ana DATABASE_URL'i hâlâ fabrika rolündedir; ana bağlantının fabrika_app'e çevrilmesi ayrı bir iştir ve [henüz yapılmadı]"*).
- RLS'in gerçekten iş gördüğü tek yer `DATABASE_URL_RLS_TEST` (`fabrika_app`, `NOBYPASSRLS`) ile çalışan `tests/rls.spec.ts` — yani **test ortamında ölçülüyor, üretim bağlantısında değil.**
- Sonuç: `withTenant(tenantId, ...)` bugün `SET LOCAL app.tenant_id` yapıyor olsa da, ana bağlantı zaten BYPASSRLS olduğu için bu session değişkeninin Postgres tarafında **hiçbir pratik etkisi yok**. `withTenant` kullanmak ile kullanmamak arasındaki gerçek fark bugün *yalnızca* geliştiricinin `where` cümlesine elle `tenantId` yazıp yazmadığıdır — RLS bir savunma katmanı olarak şu an devre dışı.
- Bunun iki sonucu var: (a) aşağıdaki "risk" değerlendirmesi RLS'e değil, sorgunun kendi `where` mantığına bakıyor — bu doğru odak; (b) `admin/layout.tsx`'teki "RLS Protected / RLS Policy %100 Enforced / RLS Güvenlik: 30/30 Tablo" rozetleri şu an **yanıltıcı bir iddia** (bkz. §4).

---

## 2. Kova 1 — Gerçek kiracı-sızıntısı riski taşıyanlar (3 satır, dosya:satır + tek cümlelik risk)

Üçü de **aynı hata sınıfı**: sayfa `requireTenantPage`/`requireTenantAction` (bu depoda zaten var olan, "kiracısız oturum → veri yok, asla fallback tenant yok" kuralını uygulayan yardımcı — `src/lib/tenant.ts:16-17`) yerine `const tenantId = session?.tenantId` ile ham okuma yapıyor, sonra `tenantId ? {...} : {...}` üçlü operatörüyle **tenantId boşsa filtreyi tamamen düşürüyor**. Bu tam olarak `concept-notes/actions.ts:10-15` ve `relationships/[id]/data.ts:6-27`'de belgelenmiş, TASK-MTRKV9JGY7OQY'de bir kez düzeltilmiş hatanın ta kendisi — üç kardeş sayfada düzeltilmeden duruyor.

En riskliden başlayarak:

1. **`src/app/[locale]/(app)/[workspace]/evidence/page.tsx:21-22`** — `prisma.evidence.findMany({ where: tenantId ? { tenantId } : {} })`: `tenantId` boşsa `where: {}` olur ve **tüm kiracıların Evidence kayıtları** (PROJECT.md'ye göre kuruluşların sertifika/mali rapor/geçmiş başarı kanıtları) tek sorguda, tek sayfada başka bir kiracıya döner.
2. **`src/app/[locale]/(app)/[workspace]/concept-notes/page.tsx:24-25`** — `prisma.conceptNote.findMany({ where: tenantId ? { tenantId } : {} })`: aynı desen, `where: {}` olduğunda **tüm kiracıların Concept Note'ları** (rakip firmaların taslak başvuru metinleri) listelenir ve sayfada gösterilir.
3. **`src/app/[locale]/(app)/[workspace]/concept-notes/[id]/page.tsx:26-27`** — `prisma.conceptNote.findFirst({ where: tenantId ? { id, tenantId } : { id } })`: `tenantId` boşsa filtre `{ id }`'ye düşer — tahmin edilebilir/bilinen bir `id` ile **başka bir kiracının tek bir Concept Note'unu hedefli okuma (IDOR)**; #1/#2'den farklı olarak "her şeyi dök" değil, tek kayıt, ama aynı kök neden.

**Erişilebilirlik notu (önemli, azaltıcı ama ortadan kaldırmayan bir bağlam):** Üçü de `moduleGate('M2'/'M3', locale)` arkasında (`src/lib/modules/guard.tsx` → `checkModuleAccess` → `tenantScopeOf(await auth())`), ve `checkModuleAccess` scope `null` ise `allowed:false` döner (`src/lib/modules/access.ts:82-84`) — yani normal akışta sayfa gövdesine ulaşıldığında `tenantId` zaten dolu olmalı, çünkü aynı istekte `auth()` iki kez çağrılıp tutarlı sonuç vermesi bekleniyor. Bu, hatayı bugün *muhtemelen tetiklenemez* kılıyor ama *kanıtlanmış güvenli* değil: kod satırı tek başına okunduğunda (code review, refactor, bu fonksiyonun başka bir bağlamda yeniden kullanılması, ya da `moduleGate` çağrısının unutulması/gevşetilmesi) güvenliği hiçbir şekilde garanti etmiyor — tam da `relationships/[id]/data.ts`'nin docstring'inin anlattığı "gate modüle bakıyordu, kiracıya bakmıyordu, sızıntı gizliydi" senaryosunun ta kendisi. Üç dosyanın da düzeltmesi mekanik: `requireTenantPage`/`requireTenantAction` çağırıp `tenantId`'yi zorunlu/garanti hale getirmek (concept-notes/actions.ts ve relationships/data.ts'de zaten yapıldığı gibi).

---

## 3. Kova 2 — Bilinçli, sarmalayıcısız olması doğru olan yollar (98 satırın geri kalanının tamamı, gruplandırılmış)

Her grup için dosya + satır aralığı + neden güvenli olduğu:

**A) Sihirli-token portalı (oturum yok, token = kimlik bilgisi; okunan satır kendi tenant'ını taşıyor)**
- `src/app/[locale]/portal/partner/[token]/page.tsx:36,73` — `applicationPart.findUnique({ where: { magicToken: token } })`
- `src/modules/m11/server/actions.ts:543` — `addBudgetLineByToken`, aynı desen; yazma `part.tenantId` ile yeniden kapsanıyor.

**B) Platform-admin konsolu (`/admin/*`, layout'ta `isPlatformAdminSession` + her action'da tekrar `requirePlatformAdmin()`, kasıtlı kiracılar-arası)**
- `src/app/[locale]/admin/feedback/page.tsx:44`, `actions.ts:45`
- `src/app/[locale]/admin/audit/page.tsx:23`
- `src/app/[locale]/admin/modules/page.tsx:28`, `actions.ts:35` (+ `tx.moduleState`/`tx.auditEvent` transaction içi, admin'in seçtiği `tenantId` parametresiyle)
- `src/lib/billing/plan-repository.ts:374,585,753` (admin plan/subscription istatistikleri, `/admin/billing/plans` altında çağrılıyor)

**C) Stripe webhook / sistem işleri (tenantId Stripe metadata'sından — kullanıcı girdisi değil, Fabrika'nın kendi yazdığı güvenilir alan; her çağrı bu tenantId ile filtreli)**
- `src/lib/billing/subscription-sync.ts` — 17 satır (214, 257, 269, 281, 316, 344, 359, 368, 374, 384, 398, 414, 439, 450, 523, 529, 545, 555, 610 civarı) — hepsi Stripe event'inden türeyen `tenantId` ile
- `src/lib/billing/lifetime-licence.ts:176,183,223` — `highest`/`findRecorded` kasıtlı global (sıra numarası + Stripe event idempotency, tüm kiracılar için tek sayaç — `prisma/rls.sql:38-53`'teki `lifetime_licence_count()` SECURITY DEFINER fonksiyonuyla aynı kasıtlı istisna ailesi)
- `src/lib/billing/create-portal-session.ts:15` — `tenantId` çağıranın doğruladığı parametre
- `src/app/api/billing/portal/route.ts:14` — `membership.findFirst({ where: { userId: session.user.id, role: {...} } })`: tenant henüz bilinmiyor, `userId` oturumdan; kullanıcı yalnız kendi üyeliklerini görebilir

**D) Cron/zamanlanmış işler (kasıtlı kiracılar-arası iterasyon, alt-işlemler doğru şekilde o iterasyonun tenantId'siyle kapsanmış)**
- `src/lib/inngest/jobs/alerts-daily.ts:104,125,143,171`
- `src/lib/inngest/jobs/credits-monthly-grant.ts:31`
- `src/lib/inngest/jobs/m4-weekly-summary.ts:62`
- `src/lib/feedback/digest-run.ts:49,54` — dosya başında açıkça belgelenmiş: *"Reads the window and everything still open, both cross-tenant."*

**E) KVKK/GDPR — `userId` (oturumdan, asla parametre olarak dışarıdan alınmıyor) ile kapsanmış, kasıtlı olarak `tenantId` değil**
- `src/actions/user/export-data.ts:67,86,90,91,92,98,215`
- `src/actions/user/request-deletion.ts:79,134,235,240`
- `src/lib/inngest/jobs/users-scheduled-deletion.ts` — 11 satır (101,107,118,119,126,127,128,129,138,217,224) — dosya içindeki uzun yorum, hangi satırın "öznenin kendi verisi" (silinir) hangisinin "kiracının verisi" (`null`'lanır, silinmez) olduğunu tek tek gerekçelendiriyor; okudum, mantık tutarlı.

**F) Paylaşılan platform kataloğu (nullable `tenantId`, RLS'de `tenant_or_shared` politikası — tasarım gereği kiracı filtresiz)**
- `ConceptTemplate`: `opportunities/[id]/m2/page.tsx:58,68`; `concept-notes/actions.ts:26`; `concept-notes/[id]/page.tsx:32` (not: bu dosyadaki `conceptNote` sorgusu Kova 1'de risk olarak işaretli, `conceptTemplate` sorgusu değil); `concept-notes/page.tsx:30` (fallback `{tenantId:null}}` — güvenli, "tüm kayıtlar" değil "yalnız paylaşılanlar"); `api/concept-notes/[id]/export/route.ts:34`; `m2/server/actions.ts:90,192`
- `MarketplaceListing`: `marketplace/page.tsx:21` — dosyada açıkça yorumlanmış: *"cross-tenant catalogue by design"*
- `ApiKey` doğrulama: `api-auth.ts:41` — tenant henüz bilinmiyor, `keyHash` ile bulunuyor (auth sınırının kendisi)
- `Document`: `ai/rag.ts:90,146` — bkz. §4, RLS varsayımıyla ilgili ayrı bir not var

**G) `if (tenantId)` ile "sorguyu atla", asla "filtresiz sorgula" değil — güvenli desen**
- `src/app/[locale]/(app)/[workspace]/approvals/page.tsx:23`

**H) Zaten `requireTenantPage`/`requireTenantAction`/`requireTenantApi`/401-guard kullanan veya her `where`'de açık `tenantId` taşıyan doğrudan çağrılar**
- `src/app/[locale]/(app)/[workspace]/settings/calendar/page.tsx:32`
- `src/app/[locale]/(app)/[workspace]/pipeline/actions.ts:211,218,222,295,362` — dosyada iki ayrı yorum bunu açıkça gerekçelendiriyor (workspace lookup'ta çift `tenantId`, `updateMany`+`tenantId` vs. çıplak `update`)
- `src/app/[locale]/(app)/[workspace]/opportunities/[id]/m2/page.tsx` — asıl kiracı verisi zaten `withTenant` ile; buradaki 2 çıplak çağrı `conceptTemplate` (F)
- `src/app/api/v1/opportunities/route.ts:44` — `authenticateApiKey` ile gelen `tenantId`
- `src/app/api/concept-notes/[id]/export/route.ts:18,29,34` — `!tenantId → 401` guard'ından sonra
- `src/app/api/documents/export/route.ts:15` — bu aslında Kova 3 (yorum), gerçek kod zaten `withTenant` kullanıyor
- `src/lib/dashboard/fetch-metrics.ts:57,84` — `tenantId` parametresi, tek çağıran (`export-csv/route.ts`) `!tenantId → 401` guard'lı
- `src/lib/feedback/submit.ts:117,190` — `create`, kiracıyı sızdırmaz (yanlış tenantId sadece geri bildirimi yanlış etiketler, okuma değil)
- `src/lib/modules/access.ts:88` — `checkModuleAccess`'in kendisi, `scope.tenantId` zaten doğrulanmış
- `src/modules/m9/server/calendar-actions.ts:31,43,71,79` — `disconnectCalendar` önce `findUnique(id)` sonra JS'te `tenantId !== / userId !==` kontrolü, sonra silme; TOCTOU riski yok (tek istek, race yok) ama son `delete`'in `where`'inde `tenantId` yok — sıkılaştırılabilir (bkz. §4) ama bugün istismar edilebilir değil.

---

## 4. Yolda gördüğüm, dokunmadığım sorunlar

1. **`src/app/[locale]/admin/layout.tsx:101-104,144-146,165-168`** — Admin konsolu her sayfada *"RLS Protected"*, *"RLS Policy %100 Enforced"*, *"RLS Güvenlik: 30 / 30 Tablo"* rozetleri gösteriyor. §1'de gösterildiği gibi ana bağlantı (`fabrika` rolü) `BYPASSRLS`, yani bu iddia **şu an üretim bağlantısı için doğru değil** — RLS yalnızca ayrı bir test rolüyle (`fabrika_app`) doğrulanıyor. Platform yöneticilerine yanlış bir güvenlik garantisi veriliyor; CLAUDE.md §7'nin "gösterilen her istatistik gerçek bir kayda bağlı olmalı" ilkesiyle de çelişiyor.

2. **`src/lib/ai/rag.ts:56-64`** (yorum, TASK-MTSZ0AL4QP2CT) — Bu yorum, kiracıya-özel `Document`/`Chunk` yazmalarının "RLS tarafından reddedildiğini" varsayıyor. §1'deki bulguyla bu varsayım şüpheli: ana bağlantı BYPASSRLS olduğu için bu yazmalar muhtemelen bugün **reddedilmiyor, sessizce geçiyor** (tenantId doğru olduğu sürece zararsız, ama yorumun kendisi yanlış bir zihinsel modeli belgeliyor). Daha önemlisi: gelecekte biri "ana bağlantıyı `fabrika_app`'e çevirme" işini (`prisma/rls-app-role.sql:9`'da "ayrı, sonraki bir iş" olarak anılıyor) tamamlarsa, bu denetimde bulunan **98 sarmalayıcısız çağrının tamamı** aynı anda ya sessizce boş sonuç dönmeye (okuma) ya da politika ihlaliyle patlamaya (yazma) başlar — çünkü `app.tenant_id` hiçbirinde ayarlanmıyor. Bu, o migrasyonu yapacak kişi için büyük, belgelenmemiş bir patlama yarıçapı.

3. **`src/modules/m9/server/calendar-actions.ts:43-45`** — `disconnectCalendar`, sahiplik JS'te doğrulandıktan sonra `prisma.calendarConnection.delete({ where: { id: connectionId } })` çağırıyor; `where`'de `tenantId`/`userId` yok. Bugün istismar edilebilir değil (tek istek, kontrol-sonra-eylem arasında yarış yok) ama depodaki yerleşik disiplinle (`pipeline/actions.ts`'nin `updateMany`+`tenantId` yorumu) tutarsız — savunma-derinliği için `deleteMany({ where: { id, tenantId, userId } })`'a çevrilebilir.

4. **Tekrarlayan hata sınıfı için hiçbir statik koruma yok.** Aynı "`session?.tenantId` + üçlü operatör fallback" hatası bu depoda en az iki kez düzeltilmiş (`concept-notes/actions.ts`, `relationships/[id]/data.ts` — ikisi de yorumlarında düzeltmeyi belgeliyor) ve en az üç kez düzeltilmeden kalmış (Kova 1). Ne bir lint kuralı ne CI grep'i bu deseni yakalıyor — `pnpm review-rls` slash komutunun (`.claude/commands/review-rls`) bunu kapsayıp kapsamadığına bakmadım (görev kapsamı dışı), ama kapsamıyorsa iyi bir aday.

---

## Özet

| Kova | Satır sayısı |
|---|---|
| 1 — Gerçek risk | 3 |
| 2 — Kasıtlı/doğru sarmalayıcısız yol | 95 |
| 3 — Yanlış pozitif (yorum/docstring) | 3 |
| **Toplam (ham regex eşleşmesi)** | **101** |

Kova 1'deki 3 satırın hepsi aynı kök nedene bağlı ve mekanik bir düzeltmesi var (`requireTenantPage`/`requireTenantAction` kullanmak). Bu triyaj salt-okunur olduğu için düzeltme uygulanmadı.
