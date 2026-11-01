# TASK-MULQL8QB679LQ — FB Admin çalışma programı PDF yükleme ekranı (K6 RAG) — fe-fb

> DURUM: Kod, sunucu doğrulaması, canlı yükleme (HTTP), yetki kapısı, tip/lint/i18n/vitest ve temiz worktree build **tamam**.
> **Tarayıcıda gerçek tıklama koşumu ve tr/en/390px kareleri ALINAMADI**: AgentSpace kill-guard (R8) Playwright'ı engelledi. Kullanıcı onay verdi, ama guard önekli komutu da reddetti. Aşağıdaki "Açık" bölümünde tek satırlık `!` komutu var.

Commit: `935ef391` (dev). Kapsam dışı dosyalara dokunulmadı: devop-fb, se-fb ve cs-fb'nin commit'lenmemiş dosyaları commit'e girmedi.

## 1) Ne yapıldı
1. **Rota okundu** (`src/app/api/admin/documents/upload/route.ts`). Eskiden `kind` ve `title` serbest metindi, boyut ya da tip sınırı yoktu, her hata `500 {error: <ham mesaj>}` dönüyordu. Başarı yanıtı `{success, docId, chunks}` idi; `chunks` Postgres'in onayladığı satır sayısı.
2. **Sunucu doğrulaması eklendi.** Tümü kapıdan (`requirePlatformAdminApi`) sonra ve ilk gömme çağrısından önce çalışır:
   - `too_large` (413): 20 MB sınırı. Hem beyan edilen `content-length` hem gerçek dosya boyutu kontrol edilir.
   - `not_pdf` (415): `%PDF-` imzası. Content-Type ve dosya adı istemcinin elindedir, bu yüzden karar baytlara bakar.
   - `bad_kind` (400): allowlist `work_programme | topic`. Şemadaki öteki iki tür bu formun işi değil: `cordis_summary`'i iş kuyruğu yazar, `tenant_upload` kiracının kendi dosyasıdır.
   - `bad_title` (400): kırpılmış başlık 1–200 karakter olmalı. Başlık kırpılmış haliyle saklanır.
   - `duplicate` (409): paylaşılan korpusta aynı tür + başlık (büyük/küçük harf duyarsız) zaten varsa. Yanıtta `existing: {id, chunks, createdAt}` döner. `allowDuplicate=true` gönderilirse yine de yüklenir.
   - `no_text` (422): metin katmanı olmayan PDF. Yeni `NoExtractableTextError` sınıfı eklendi; eskiden genel 500 dönüyordu.
   - `upload_failed` (500): `message` alanıyla döner.
   - Sabitler istemciyle ortak modülde: `src/lib/rag-upload.ts` (sunucu importu yok).
3. **Sayfa `/[locale]/admin/documents`.** Topic-stats düzeni kullanıldı:
   - Form: PDF, tür seçimi, başlık. Başlık boşsa dosya adından doldurulur.
   - Yükleme sırasında `aria-live` durum satırı; buton ve alanlar kilitlenir.
   - Sonuç kartı: "“…” için N parça kaydedildi" ve belge kimliği.
   - Hata kartı `role=alert`. Yinelenen belgede mevcut kaydın parça sayısını ve tarihini gösterir, "Yine de yükle" butonu sunar.
   - **Liste yolu var**: `listSharedDocuments` son 50 paylaşılan `work_programme/topic` belgesini parça sayılarıyla okur. CORDIS belgeleri bilerek listelenmez.
4. **Menü**: `AdminSidebarNav`'a "Belgeler (K6 RAG)" / "Documents (K6 RAG)" eklendi (K6 rozeti). Mobil menü aynı bileşeni kullanır.
5. **Yetki**: sayfa mevcut admin layout kapısının arkasında (`isPlatformAdminSession` → `notFound()`). Rota kendi `requirePlatformAdminApi` kapısını korur.
6. **i18n**: tr ve en için `adminDocuments` isim alanı (43 satır, eş anahtar kümesi). Baseline artmadı.
7. **Testler**:
   - `tests/admin-upload-authz.test.ts`: 4 yetki testine 10 doğrulama testi eklendi. Her ret için `processPdfAndStore`'un çağrılmadığı da kontrol edilir.
   - `tests/e2e/admin-documents-upload.spec.ts`: yetki kapısı, tr/en/390px sayfa ve menü tıklaması, PDF olmayan dosyada sunucu reddi, klavye ile gönderim testleri. Canlı yükleme testi yalnız `E2E_LIVE_EMBED=1` ile açılır, böylece rutin e2e koşusu OpenAI'ye para harcamaz. Canlı test yalnız kendi oluşturduğu tek id'yi, id boş değilse siler.

## 2) Kanıt
Yetki kapısı, `pnpm dev` :3000'e gerçek HTTP ile (repo'daki e2e deseniyle imzalanmış oturum çerezleri; sır basılmadı):
```
admin page: 200
member page: 404
admin api not-pdf: {"error":"not_pdf"} 415
member api not-pdf: {"error":"Forbidden",...,"code":"PLATFORM_ADMIN_REQUIRED"} 403
anon api: {"error":"Unauthorized",...,"code":"UNAUTHENTICATED"} 401
```
Canlı yükleme (platform admin, 2,8 KB sentetik tek sayfa PDF, gerçek OpenAI gömmesi):
```
upload: {"success":true,"docId":"cmun5odcs0000gixkhr400cak","chunks":3} 200
dup:    {"error":"duplicate","existing":{"id":"cmun5odcs0000gixkhr400cak","chunks":3,"createdAt":"2026-09-29T20:55:37.372Z"}} 409
SELECT [{"id":"cmun5odcs0000gixkhr400cak","kind":"work_programme","title":"E2E K6 probe 20260929T205535","shared":true,"chunks":3,"embedded":3,"tenantless":3,"dims":1536}]
AiUsageLog [{"calls":3,"tokens":576}]
```
- Harcama: text-embedding-3-large ile 576 token ≈ **0,0001 USD** (sınır 0,5 USD).
- Admin sayfası HTML'i yüklenen başlığı listede gösterdi (`curl … | grep` → `E2E K6 probe 20260929T205535`).

Temizlik (tek id, boş-id koruması ile):
```
deleted 1 remaining {"docs":0,"chunks":0}
```
Kapılar:
- `vitest run tests/admin-upload-authz.test.ts src/lib/rag.test.ts` → **2 dosya, 33/33 geçti**.
- Temiz worktree (`git worktree add --detach … HEAD` = 935ef391, gerçek `pnpm install --frozen-lockfile` + `prisma generate`):
  - `pnpm typecheck` → exit 0
  - hedefli `eslint` → exit 0
  - `pnpm i18n:check` → "✅ i18n check passed … no file gained hard-coded text", exit 0
  - `pnpm build` → **exit 0**; rota listesinde `ƒ /[locale]/admin/documents` ve `ƒ /api/admin/documents/upload` var.
- Ana ağaçta `pnpm typecheck` kırmızı, ama yalnız devop-fb'nin commit'lenmemiş `src/lib/jobs/tasks/credits-monthly-grant.ts(44)` dosyasında. Benim dosyalarımla ilgisi yok; HEAD temiz.
- Tam süit koşulmadı. İzole DB gerektiriyor, kural gereği koşulmadı.

**Eksik kanıt:** tarayıcıda tıklama koşumu ve kareler (01-page-tr, 02-page-en, 03-page-tr-390, 04-not-pdf-error-tr, 05-non-admin-404-tr, 06-upload-success-tr, 07-duplicate-warning-en) alınamadı. Nedeni: kill-guard R8, Playwright komutunu `MURAT_LIVE_OK=1` önekiyle de reddetti. Spec hazır ve commit'li; kareler `docs/agent-results/TASK-MULQL8QB679LQ-screenshots/` altına yazılacak.

## 3) Değişen dosyalar
- `src/lib/rag-upload.ts` (yeni): allowlist, sınırlar, hata kodları, PDF imzası
- `src/lib/rag.ts`: `NoExtractableTextError`, `listSharedDocuments`, `findSharedDocumentByTitle`
- `src/app/api/admin/documents/upload/route.ts`: doğrulama ve hata kodları
- `src/app/[locale]/admin/documents/page.tsx`, `client.tsx` (yeni)
- `src/components/AdminSidebarNav.tsx`: menü bağlantısı
- `messages/tr.json`, `messages/en.json`: `adminDocuments`
- `tests/admin-upload-authz.test.ts`, `tests/e2e/admin-documents-upload.spec.ts` (yeni)

## 4) Riskler
- **Aynı belge iki kez yüklenirse** (soru 4): eskiden hiçbir koruma yoktu. Her parça yeniden gömülüyordu (platforma maliyet) ve belge korpusta iki kez yer alıyordu. `retrieveChunks` top-K'yı aynı metnin kopyalarıyla dolduruyordu; bu da tüm kiracıların RAG bağlamında çeşitliliği düşürüyordu. Şimdi aynı tür + başlık 409 alıyor ve admin açıkça "Yine de yükle" demeden gömme yapılmıyor.
  - Sınır: `Document`'te içerik hash'i yok. Aynı PDF farklı başlıkla yüklenirse yakalanmaz. Kesin çözüm `Document.contentSha256` kolonu (migration). Bu kartın kapsamı dışında bırakıldı.
- **Uzun istek**: `processPdfAndStore` parçaları sırayla, parça başına bir çağrıyla gömer. 20 MB'lık bir çalışma programı (~1–2 bin parça) dakikalar sürer; ters vekil (reverse proxy) zaman aşımına takılabilir. UI "birkaç dakika sürebilir; sayfayı kapatmayın" diyor. Kalıcı çözüm, işi graphile-worker kuyruğuna almak (ayrı kart).
- Menü etiketleri `AdminSidebarNav`'daki mevcut `locale === 'tr' ? … : …` desenini izliyor, i18n anahtarı değil. Bileşenin tamamı böyle ve `src/components` i18n baseline taramasında değil. Tutarlılık için desen korundu.

## 5) Açık sorular
- İçerik hash'iyle kesin yinelenen koruması (migration) ve kuyruğa alınmış ingest istenirse ayrı kart açılmalı.

## 6) Sonraki adım
Tarayıcı koşumunu kullanıcı kendi oturumunda başlatmalı (guard yalnız kullanıcının kendi komutunu kabul ediyor). Komut FONBRIDGE kökünde, :3000 boşken çalıştırılır; Playwright kendi dev sunucusunu açar. Harcama ≈0,0001 USD; test kendi belgesini id ile siler:
```
! cd /Users/macbook/alan/FONBRIDGE && MURAT_LIVE_OK=1 E2E_LIVE_EMBED=1 E2E_SHOTS_ROOT=docs/agent-results npx playwright test tests/e2e/admin-documents-upload.spec.ts
```
Sonra kareler bu rapora eklenir.

## Platform beyanı
- Doğrulama **macOS** (Darwin 27, zsh, Node 26.5) üzerinde yapıldı.
- Dokunulan kod yolu platforma bağlı değil: süreç, dosya yolu, kabuk, kısayol ya da DPI kullanılmıyor. Yükleme `FormData` + `fetch` ile, PDF baytları bellekte işleniyor, doğrulama saf JS. Bu yüzden Windows ve Linux'ta davranış koddan aynı olmalı.
- Windows ve Linux'ta **koşulamadı**: bu makinede o platformlar yok.
