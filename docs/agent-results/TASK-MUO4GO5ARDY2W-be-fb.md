# TASK-MUO4GO5ARDY2W — FB GÜVENLİK (İNCELEME-86 Y-1): silinmiş kiracının oturumsuz yolları kapandı

**Durum:** TAMAM · **Ajan:** be-fb · **Tarih:** 30.09.2026
**Dal:** `be-fb/muo4go-deleted-tenant-paths` (dev `6d7e5b51`'den), ayrı worktree. Kapılar yeşil olduğu için dev'e merge edildi, push yapılmadı.
**Ortam:** İzole Postgres `befb-o4go-pg` (pgvector:pg16, 127.0.0.1:5487, DB adı `fabrika`). Hazırlık CI sırasıyla yapıldı: `prisma db push` → `db:rls-role` → `apply-migrations.sh` ×2 ("40 files applied" ×2) → `db:rls` (28→112) → `db:seed`. Paylaşılan `fabrika` :5433'e bağlanılmadı. `db:rls-role`'ün worktree'ye yazdığı `.env` silindi ve tüm URL'ler env'den verildi.
**Platform:** Doğrulama macOS'ta (Darwin 27.0.0) yapıldı. Değişiklik yalnız SQL/Prisma sorgu koşullarından ve TypeScript'ten oluşuyor. Süreç, dosya yolu, kabuk ya da ekran koduna dokunulmadı, bu yüzden Windows ve Linux'ta da aynı SQL üretilir. CI (ubuntu-latest) yeni canlı test dosyasını tam vitest içinde koşacak. Windows ve Linux burada koşulamadı, çünkü bu makinede yalnız macOS var.

## 1. Ne yapıldı
Kural: **`Tenant.deletedAt` dolu (geçmiş ya da ileri tarihli) = silinmiş.** Silinmiş kiracı hiçbir oturumsuz kimlikle okunamaz ve yazılamaz. `deletedAt` temizlenince aynı kimlik yeniden çalışır; hiçbir şey iptal edilmiyor. Bu, jwt callback'teki oturum kuralıyla (TASK-MUO2B59ZNY7D7) aynı.

1. **API anahtarı** (`src/lib/api-auth.ts`): mevcut sayaç `UPDATE "ApiKey" … RETURNING` ifadesine `AND EXISTS (SELECT 1 FROM "Tenant" WHERE id = … AND "deletedAt" IS NULL)` eklendi. Ek sorgu yok. Silinmiş kiracıda UPDATE satır döndürmüyor ve istek mevcut "revoked" dalından **401 `AUTH_INVALID_API_KEY`** alıyor. Sayaç artmıyor, `lastUsedAt` yazılmıyor. `ApiKey` modelinde `tenant` ilişkisi olmadığı için keşif sorgusuna filtre eklenemiyordu. `/api/v1/{opportunities,calls,partners,partners/[pic]}` rotalarının dördü de bu fonksiyonu kullanıyor.
2. **Partner portalı:** yeni `isTenantLive(tx, tenantId)` (`src/lib/tenant-liveness.ts`) yardımcısı, token'ın çözüldüğü aynı `withSystemScope('tenant-discovery')` işleminde çağrılıyor. Üç çağrı yerinde kullanılıyor:
   - `addBudgetLineByToken` (`src/modules/m11/server/actions.ts`): silinmiş kiracıda `{ success: false }` döner, hiçbir şey yazılmaz.
   - `portal/partner/[token]/page.tsx` sayfa gövdesi: `notFound()`.
   - Aynı dosyadaki `generateMetadata`: proje başlığı sızmaz, genel başlık döner.
   Bypass-baseline'daki çağrı yerleri ve bağlam etiketleri değişmedi.
3. **Oturumsuz yolların taraması** yapıldı (tablo §3). Aynı kuralın eksik olduğu iki cron fan-out'u da düzeltildi:
   - `alerts-daily` → `alertEnabledSearches(tx)`
   - `m4-weekly-summary` → `dueRelationshipActions(tx, until)`
   İkisi de `keepLiveTenantRows` ile tek bir ek `Tenant` okumasıyla süzülüyor.
4. **`credits-monthly-grant`:** `GRANTABLE_TENANTS_QUERY = { where: { deletedAt: null }, select: { id: true } }`. Testin aynı argümanları DB'ye verebilmesi için dışa aktarıldı.
5. Yeni canlı test: `tests/deleted-tenant-sessionless.live.test.ts`, 5 test, `fabrika_app` (NOBYPASSRLS) altında koşuyor. Her senaryo üç adımdan oluşuyor: canlı kiracı → sil → ret → geri al → erişim döner.

## 2. Kanıt

### A. P1/P2 canlı tekrarı: tabanda açık, düzeltmeyle kapalı (`ekler/baseline-repro.txt`)
Düzeltme `git stash` ile geri alındı, yeni test yerinde bırakıldı:
```
AssertionError: expected 200 to be 401                                                   ← P1: silinmiş kiracının anahtarı 200 dönüyor
AssertionError: expected { Object (success, requestedTotal) } to deeply equal { success: false }  ← P2: yazma başarılı
AssertionError: promise resolved "{ …(10) }" instead of rejecting                         ← portal sayfası açılıyor
Tests  4 failed | 1 skipped (5)
```
Düzeltmeyle birlikte: `Test Files 1 passed · Tests 5 passed (5)`. Testlerin iddiaları:
- API: canlıyken 200 ve fırsat başlığı var. Silinince 401 `AUTH_INVALID_API_KEY`, gövdede başlık yok, `rateWindowCount` ve `lastUsedAt` değişmiyor. İleri tarihli `deletedAt` de 401. `deletedAt=null` yapılınca 200 ve başlık geri geliyor.
- Portal yazma: silinmişken `{success:false}` ve bütçe satırı 0. Geri alınınca `success:true` ve 1 satır.
- Portal okuma: silinmişken sayfa `notFound`, metadata'da proje başlığı yok. Geri alınınca ikisi de açılıyor.
- Kredi, alarm ve M4 fan-out'ları: silinmiş kiracı listede yok, geri alınınca listede.

### B. Mutantlar: 11/11 kırmızı (`ekler/mutants.py.txt`, `ekler/mutants-out.txt`)
Taban `Tests 5 passed (5)`. Geri yüklemeden sonra da `5 passed` ve `git status` yalnız bu kartın değişikliklerini gösteriyor.

| Mutant | Sonuç |
|---|---|
| M1 api-auth: `EXISTS` satırı silindi | 1 kırmızı ✅ |
| M2 api-auth: ters koşul (`IS NOT NULL`) | 1 kırmızı ✅ |
| M3 api-auth: ileri tarihli `deletedAt` canlı sayılıyor | 1 kırmızı ✅ |
| M4 m11 action: canlılık kontrolü yok | 1 kırmızı ✅ |
| M5 portal sayfa gövdesi: kontrol yok | 1 kırmızı ✅ |
| M6 portal `generateMetadata`: kontrol yok | 1 kırmızı ✅ |
| M7 `isTenantLive` `deletedAt`'e bakmıyor | 2 kırmızı ✅ |
| M8 credits: filtre yok | 1 kırmızı ✅ |
| M9 alerts-daily: `keepLiveTenantRows` yok | 1 kırmızı ✅ |
| M10 m4-weekly: `keepLiveTenantRows` yok | 1 kırmızı ✅ |
| M11 `keepLiveTenantRows` `deletedAt` filtresi yok | 1 kırmızı ✅ |

İnceleme-86 Ö-2'deki "şekil sabitleme" sorunu burada yok: testler davranışı ölçüyor, `where`'in şeklini değil.

### C. Kapılar (`ekler/gates.txt`; izole DB, `CI=true`, `AUTH_SECRET` CI fikstürü)
```
tsc exit=0 · lint exit=0 · i18n exit=0
Test Files  290 passed | 2 skipped (292) · Tests  3558 passed | 36 skipped (3594) · vitest exit=0
live-skip gate: 44 live files, 385 live tests passed, 28 allowed skip(s) → exit 0
build exit=0
```
İlk tam koşuda `teardown-where-guard` testi yeni dosyada `in: tenants` (yerel const) biçimini reddetti. Satırlar `in: presentIds(tenantIds)` olarak düzeltildi, sonra tam koşu, tsc ve lint yeniden koşuldu (yukarıdaki sonuçlar). Test sonrası sızıntı yok: `Tenant/Workspace/User` içinde `dts-%` sayımı 0/0/0.

## 3. Tarama: kiracıyı oturumsuz çözen yollar

| Yol | Kimlik | Silinmiş kiracı | Durum |
|---|---|---|---|
| `/api/v1/*` (4 rota) | API anahtarı (`keyHash`) | **401** | **Düzeltildi** (1) |
| `portal/partner/[token]` sayfa + metadata | magic token | **404 / genel başlık** | **Düzeltildi** (2) |
| `addBudgetLineByToken` | magic token | **`success:false`, yazma yok** | **Düzeltildi** (2) |
| Davet linki `lookupInvitation` (`accept.ts:85`) | davet token'ı | `revoked` | Zaten doğruydu (İNC-86 J4) |
| `credits-monthly-grant` | cron | kredi verilmiyor | **Düzeltildi** (4) |
| `alerts-daily` fan-out | cron (e-posta) | aramalar listeye girmiyor | **Düzeltildi** |
| `m4-weekly-summary` fan-out | cron (bugün e-posta göndermiyor, TODO) | eylemler listeye girmiyor | **Düzeltildi** (e-posta eklenince de hazır) |
| `k1-topic-match`, `k1-embeddings`, `m4-stale-relationships`, ajans raporu ve hunisi | cron | zaten `deletedAt: null` | Doğru |
| Oturumlu tüm rotalar (dışa aktarımlar: `documents/export`, `dashboard/export-csv`, `concept-notes/[id]/export`, `billing/invoices/[id]/export`, `evidence/[id]/download`, `agency/reports/[id]`, `billing/portal` …) | `auth()` / `requireTenantApi` | oturumda kiracı yok | jwt filtresini miras alıyor. **Token'lı dışa aktarım linki yok** (grep `hashSecretToken|tokenHash|magicToken`: yalnız portal ve davet) |
| Public lead (`fon-hazirlik`) | yok | — | Kapsam dışı: kiracısız (`tenantId: null`) |

**Kasıtlı istisnalar** (silinmiş kiracıda da çalışmaları gerekiyor):
- **Stripe / iyzico webhook'ları ve `lifetime-licence.findRecorded`:** sağlayıcının imzaladığı para olayları. Bekleme süresindeki bir kiracının iptali, iadesi ya da yenilemesi kayda geçmezse defter ile sağlayıcı birbirinden ayrılır. Bu yollar kiracının verisini dışarıya açmıyor.
- **`alerts-sweep`:** yumuşak silinmiş kiracıyı bilerek "yaşıyor" sayıyor. Bekleme süresinde alarm kapatılmaz (İNC-86 Ö-1).
- **Saklama ve silme job'ları** (`users-scheduled-deletion`, `invitation-cleanup`, `public-lead-cleanup`, `stripe-event-cleanup`): silinmiş kiracıda da çalışmaları gerekiyor, KVKK silmesinin kendisi bunlar.
- **Platform yöneticisi ekranları** (`listTenantsForAssignment`, `pilot.listPilots`, `admin/*`) ve `feedback-weekly-digest`: iç kullanım. Operatörün silinmiş kiracıyı görmesi gerekiyor.
- **Geri alma:** bir rota yok (İNC-86 Ö-4). Geri alma bugün operatörün `deletedAt = NULL` yazmasıyla yapılıyor ve yukarıdaki bütün yollar bu durumda erişimi kendiliğinden geri veriyor (testlerle kanıtlandı).

## 4. Değişen dosyalar
- `src/lib/api-auth.ts`: sayaç UPDATE'ine `EXISTS` koşulu.
- `src/lib/tenant-liveness.ts` (yeni): `isTenantLive`, `keepLiveTenantRows`.
- `src/modules/m11/server/actions.ts`, `src/app/[locale]/portal/partner/[token]/page.tsx`: portal kontrolleri.
- `src/lib/jobs/tasks/credits-monthly-grant.ts`: `GRANTABLE_TENANTS_QUERY`.
- `src/lib/jobs/tasks/alerts-daily.ts`: `alertEnabledSearches`.
- `src/lib/jobs/tasks/m4-weekly-summary.ts`: `dueRelationshipActions`.
- `tests/deleted-tenant-sessionless.live.test.ts` (yeni).
- `docs/agent-results/TASK-MUO4GO5ARDY2W-be-fb.md` ve `…-ekler/`: `baseline-repro.txt`, `mutants.py.txt`, `mutants-out.txt`, `gates.txt`. Sır taraması (`[0-9a-f]{64}|sk-…|AUTH_SECRET=`) boş çıktı.
- Şema ve migration değişikliği yok.

## 5. Riskler
- Portal ve fan-out'lar birer ek `Tenant` PK okuması yapıyor (işlem içinde, `Tenant_pkey`). API yolunda ek tur yok.
- Silinmiş kiracının anahtarı bilinçli olarak "Invalid or revoked" mesajıyla 401 alıyor, silinme ayrıca belirtilmiyor. Bir istemci bunu anahtar iptali sanabilir; bilgi sızdırmamak için bu tercih edildi.
- Testler route ve action fonksiyonlarını süreç içinde çağırıyor, gerçek bir HTTP sunucusu kullanılmadı. Kod yolu aynı; middleware bu testlerde yok (İNC-86 ile aynı sınır).

## 6. Açık sorular
- Kiracı silme ve geri alma bir ürün özelliği olacak mı (İNC-86 Ö-4)? Olursa, "silinmiş" anlamı buradaki gibi "`deletedAt` dolu" kalmalı. M3 mutantı bunu sabitliyor.

## 7. Sonraki adım
- Lider: dev'e merge edildi, push kararı liderde.
