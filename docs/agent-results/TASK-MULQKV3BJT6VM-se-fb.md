# TASK-MULQKV3BJT6VM — FB K3 taban oranlar: Horizon Dashboard xlsx → TopicStat (se-fb)

Sprint FB-GAP-1 · dal `dev` · push yok · ajan: se-fb

## 1. Ne yapıldı

Platform admin için `/[locale]/admin/topic-stats` ekranı eklendi. Akış: dosya seç → önizle → onayla → G0'ı yeniden hesapla.

| Parça | Dosya | Not |
| --- | --- | --- |
| xlsx okuyucu | `src/lib/k3-topic-stats/xlsx.ts` | **Yeni bağımlılık yok.** Projede zaten olan `unzipper` (K2 CORDIS importer) ve regex tabanlı küçük bir OOXML hücre okuyucusu kullanılıyor. package.json/lockfile değişmedi, bu yüzden leed-fb'ye sorma gerekmedi. |
| Sütun eşleme + satır normalizasyonu | `src/lib/k3-topic-stats/horizonDashboard.ts` | `HORIZON_DASHBOARD_COLUMNS` alan başına kabul edilen başlık yazımlarını tutar (CORDIS `cordisSchema.ts` ile aynı fikir). Zorunlu sütun çözülemezse `LAYOUT_CHANGED` hatası verir; bulunan başlıkları da listeler, sütun tahmin etmez. Başlık ilk 20 satırda aranır (dashboard'un başlık bloğu için). İlk uygun sayfa seçilir. |
| Plan / yazma / yeniden puanlama | `src/lib/k3-topic-stats/importer.ts` | `planTopicStatImport` hiçbir şey yazmaz. `applyTopicStatImport` transaction içinde, advisory lock altında yeniden planlar ve öyle yazar. `rescoreG0ForPrefixes` ilgili fırsatları bulup `rescoreOpportunityG0` çağırır. |
| API | `src/app/api/admin/topic-stats/import/route.ts`, `…/rescore/route.ts` | İkisi de önce `requirePlatformAdminApi()` çalıştırır: anonim çağrı 401, platform admini olmayan 403 alır. Apply, önizlemenin döndürdüğü sha256'yı ister; dosya değiştiyse 409 döner. |
| Ekran | `src/app/[locale]/admin/topic-stats/{page,client}.tsx`, `src/components/AdminSidebarNav.tsx` | Sütun eşleme tablosu, 6 sayaç (eklenecek, güncellenecek, değişmeyen, eşleşmedi, hatalı, boş), eşleşmeyen kod listesi, hatalı satırlar (satır no + sebep), ilk 200 planlı satır, mevcut kaynak özeti. |
| i18n | `messages/tr.json`, `messages/en.json` → `adminTopicStats.*` | Yalnız kendi namespace'im eklendi, ayrı commit. `src/locales`'e dokunulmadı. |
| Bypass baseline | `scripts/tenant-bypass-baseline.json` | Rescore'un kiracılar arası fırsat okuması için 1 adet `system-scope:platform-admin` kaydı, gerekçesiyle. |

### Tasarım kararları

- **Upsert anahtarı** `(topicPrefix, topicId, country, orgType)`, uygulama katmanında. **Şema değişmedi.** TopicStat'ta benzersizlik kısıtı yok ve şema kilidi fe-fb'de. İki importer'ın aynı anda "insert" kararı vermesi (TOCTOU) `pg_advisory_xact_lock` + transaction içinde yeniden planlama ile kapatıldı.
- **`source` anahtarın parçası DEĞİL.** `loadG0Snapshot` bir konu ailesinin satırlarını sırasız okuyor (`g0-compute.ts:230`). Kaynak anahtara girseydi Q3 ve Q4 satırları yan yana durur, G0 aralarından rastgele birini seçerdi. Sonraki çeyrek dosyası mevcut satırı **günceller** (canlı testte kanıtlandı).
- **Kanıt disiplini (CLAUDE.md §7):** `source = horizon-dashboard|<dosya adı>|<veri tarihi YYYY-MM-DD>`, `importedAt = now`. Dosya adı yol ve kontrol karakterlerinden arındırılıyor, en fazla 120 karakter. §6 gereği `RawFetch`'e `horizon_dashboard_xlsx` kaydı yazılıyor: sha256, boyut, sayfa, eşleme, sayaçlar, eşleşmeyen kodlar. Baytların kendisi DB'ye yazılmıyor.
- **Eşleşme:** kod `Topic.identifier` ile birebir eşleşirse `matchedAs: topic` olur ve `topicId` dolar. Kod bir konu ailesinin öneki ise (`topicPrefixOf(identifier) === kod`) `matchedAs: family` olur, `topicId = null`. İkisi de değilse **eşleşmedi**: satır yazılmaz, ekranda satır numarası ve koduyla listelenir, RawFetch'e de girer. Sessizce atılmaz.
- **Oran ölçeği sütun bazında belirlenir, hücre bazında tahmin edilmez.**
  - `%` içeren hücre her zaman yüzdedir.
  - Başlıkta `%` varsa çıplak sayılar da yüzdedir.
  - Aksi halde sütundaki tüm çıplak değerler ≤ 1 ise kesir kabul edilir ve ×100 uygulanır.
  - Teklif ve fonlanan sayıları varsa yazılan oranla 1 puandan fazla fark eden satır `rateMismatch` ile reddedilir. Böylece ölçek hatası sessiz kalamaz.
- **Ülke:** ISO2 kodu, `EL→GR`, `UK→GB`. İngilizce ülke adı runtime ICU (`Intl.DisplayNames`) ile koda çevrilir, "Türkiye/Turkey" de dahil; bunun için bağımlılık gerekmez. "All countries", "Total" ve boş değer `null` olur (tüm ülkeler). Tanınmayan ülke satırı reddedilir.
- **G0 yeniden hesaplama: öneri BUTON (otomatik değil), buton yapıldı.** Gerekçe:
  1. Rescore her kiracının fırsatlarına yazıyor (g0Score ve TopicMatch kanıtı), yani operatörün yükleme sonucunu okuduktan sonra bilinçli başlatması gereken bir etki.
  2. Tek tıkta en fazla 500 fırsat işleniyor ve sınır aşılırsa ekran bunu söylüyor. Büyük yükleme için `pnpm jobs:g0-rescore -- --apply` zaten var.
  3. Otomatik tetikleme yükleme isteğini uzatır. Rescore'daki bir hata, başarılı bir yüklemeyi başarısız gibi gösterirdi.

  İleride otomatikleştirmek istenirse doğru yer bir Inngest işi olur (`inngest` projede var); istek içinde çalıştırılmamalı.

## 2. Kanıt

### Birim ve canlı testler (yalnız K3 dosyaları)

```
$ set -a; source .env; set +a; pnpm vitest run tests/k3-topic-stats-parse.test.ts tests/k3-topic-stats-authz.test.ts tests/k3-topic-stats-import.live.test.ts
 Test Files  3 passed (3)
      Tests  52 passed (52)
```

- `tests/k3-topic-stats-parse.test.ts` (39) gerçek xlsx baytlarıyla koşuyor (`tests/helpers/xlsx-fixture.ts`, node:zlib ile zip yazıyor). Kapsam:
  - başlık bloğunun altında başlık bulma, kapak sayfasını atlama
  - `"8%"` ve `0.08` → 8, `"8,5 %"`, `(%)` başlığı, sayılardan hesaplanan oran
  - boş satır sayılıyor ama hata sayılmıyor
  - 11 red sebebinin her biri satır numarasıyla
  - bozuk sütunda `LAYOUT_CHANGED` + görülen başlıklar, iki sütunun aynı alanı istemesi
  - güvenlik: zip değil, DOCTYPE/XXE reddi, **zip bombası** (50 MB+ açılan parça, sıkıştırılmış hali < 1 MB, bayt sayacıyla durduruluyor), boyut sınırı
- `tests/k3-topic-stats-authz.test.ts` (8):
  - import (preview ve apply) ve rescore: anonim 401, **platform admini olmayan TENANT_OWNER 403**; importer ve rescore hiç çağrılmıyor
  - hash uyuşmazlığında 409, bozuk tarihte 400, geçersiz prefix'lerde (`[]`, `'x'`, SQL benzeri, sayı, string) 400
- `tests/k3-topic-stats-import.live.test.ts` (5, gerçek Postgres):
  - önizleme hiçbir şey yazmıyor
  - apply önizlemenin söylediğini yazıyor; eşleşmeyen kod listeleniyor ve yazılmıyor
  - **aynı dosya ikinci kez:** `insert 0, update 0, unchanged 3`, yazılan 0, RawFetch `unchanged`, DB satırları birebir aynı
  - **sonraki çeyrek:** 3 update, toplam hâlâ 3 satır
  - `loadG0Snapshot.baseRatePct === 20` (içe aktarılan TR oranı)
  - rescore fırsatı buluyor ve `failed: 0`

### Testlerin gerçekten yakaladığının mutasyonla kanıtı

Her mutasyon geri alındı ve sonrasında 44/44 yeşil.

- importer'da "her zaman insert" (naif create) → **3 canlı test kırmızı** (idempotent, sonraki çeyrek, G0)
- oran ölçeğini "her zaman yüzde" yapmak → **2 parse testi kırmızı**

### Kapılar

| Kapı | Sonuç |
| --- | --- |
| `pnpm lint` | temiz (K3 dosyalarında 0 uyarı) |
| `pnpm i18n:check` | ✅ "both catalogs agree, every key used in src/ resolves, and no file gained hard-coded text" (325/325 baseline) |
| `pnpm rls:bypass-check` | ✅ "no new tenant bypass … 32 on the sanctioned cross-tenant path" (platform-admin 9 çağrı / 6 dosya) |
| `pnpm typecheck` | **K3 dosyalarında 0 hata.** Kırmızı, ama tüm hatalar fe-fb'nin şu an commit'lenmemiş ajans işinde: `src/lib/agency/funnel.ts` (M), `src/app/[locale]/(app)/ajans/*`, `funnel.test.ts`, `tests/agency-funnel.live.test.ts` (`byOrgType`/`province` alanları yok). Benim commit'imden önce de aynıydı. |
| `pnpm test` (`set -a; source .env; set +a`) | **2170 geçti · 36 kırmızı · 8 atlandı** (192 dosya; 187 geçti, 3 kırmızı, **2 atlandı**). 36 kırmızının tamamı `src/lib/agency/funnel.test.ts` (17), `src/lib/agency/tmpwide.attack.test.ts` (17, git'te izlenmeyen dosya) ve `tests/agency-funnel.live.test.ts` (2). Hepsi fe-fb'nin devam eden ajans işi. `k3-topic-stats` hiçbir hata satırında geçmiyor (grep sayısı 0). |

### Gerçek tarayıcı (leed-fb'nin sunucusu, http://localhost:3000)

Chrome headless, Playwright ile gerçek `setInputFiles` ve tıklama. Oturum `.env` AUTH_SECRET ile imzalanmış bir JWT çerezi, `admin-plan-editor.spec.ts` ile aynı yöntem. Betik kendi Call/Topic/kiracı/fırsat verisini kurdu ve sonra sildi. Tıklamadan önce hidrasyon sinyali (`__reactProps$`) beklendi, `networkidle` değil.

```json
{ "nonAdminStatus": 404, "nonAdminRescoreStatus": 403,
  "preview": {"insert":"3","update":"0","unchanged":"0","unmatched":"1","rejected":"1","blank":"1"},
  "statsAfterPreview": 0,
  "written": "3 satır eklendi, 0 satır güncellendi.",
  "rescore": "1 fırsat işlendi: 1 puanlandı, 0 kanıt yetersiz, 0 hata.",
  "secondPreview": {"insert":"0","unchanged":"3","applyDisabled":true},
  "layoutError": "Dosya düzeni tanınmadı. … Dosyada bulunan başlıklar: Topic identifier renamed · Rate of success",
  "consoleErrors": ["…422 (Unprocessable Entity)"] }
```

Tek konsol hatası bozuk-düzen senaryosunun beklenen 422 yanıtı. Kareler `docs/agent-results/TASK-MULQKV3BJT6VM-screenshots/`:

- `00-non-admin-404.png`: admin olmayan kullanıcı sayfayı 404 görüyor (admin layout `notFound()`)
- `01-empty-form.png`
- `02-preview.png`: sütun eşleme; "Türkiye"→TR; "All countries"→Tümü; "Atlantis" satır 9'da reddedildi; eşleşmeyen kod satır 7; konu ailesi eşleşmesi
- `03-applied-rescored.png`: yazıldı, G0 butonu ve sonucu, kaynak özeti `horizon-dashboard|…xlsx|2026-09-29`
- `04-reupload-unchanged.png`: aynı dosya 0 eklenecek / 3 değişmeyen, Onayla pasif
- `05-layout-error.png`: açık düzen hatası ve bulunan başlıklar

Tarayıcı testinde yakalanıp düzeltilen **2 gerçek hata** (commit `75bba15b`):

1. Yeniden önizlemede yanıt gelene kadar önceki sayaçlar ekranda kalıyordu; admin bayat sayı okuyabilirdi.
2. `toLocaleString()` tarih biçimi dev'de hidrasyon uyuşmazlığı ("1 Issue" rozeti) üretiyordu; tarih artık deterministik `YYYY-MM-DD HH:MM UTC`.

Temizlik doğrulaması: `topicStat` (K3E2E) 0, topic 0, call 0, kiracı 0, `rawFetch(horizon_dashboard_xlsx)` 0. Chrome'un açılamadığı bir denemede kalan 2 topic, 2 call ve 1 kiracı (kendi `RUN=K3E2EMULZRHMY` verim) elle silindi ve 0'a indiği doğrulandı.

## 3. Değişen dosyalar

Commit'ler: `f626b2cf` (i18n), `72c824db` (özellik ve testler), `75bba15b` (UI düzeltmesi), ardından bu rapor.

- `src/lib/k3-topic-stats/xlsx.ts`, `horizonDashboard.ts`, `importer.ts` (yeni)
- `src/app/api/admin/topic-stats/import/route.ts`, `…/rescore/route.ts` (yeni)
- `src/app/[locale]/admin/topic-stats/page.tsx`, `client.tsx` (yeni)
- `src/components/AdminSidebarNav.tsx` (+1 menü öğesi)
- `messages/tr.json`, `messages/en.json` (`adminTopicStats`)
- `scripts/tenant-bypass-baseline.json` (+1 system-scope kaydı)
- `tests/helpers/xlsx-fixture.ts`, `tests/k3-topic-stats-{parse,authz}.test.ts`, `tests/k3-topic-stats-import.live.test.ts` (yeni)

## 4. Riskler

1. **Gerçek Horizon Dashboard dışa aktarımı elimizde yok (VARSAYIM).** Sütun takma adları dashboard'un yayımlanmış alan adlarından yazıldı, gerçek bir dosyayla denenmedi. İlk gerçek yükleme bir takma adı tutturamazsa sessiz veri değil, başlıkları listeleyen `LAYOUT_CHANGED` hatası çıkar; düzeltmesi `HORIZON_DASHBOARD_COLUMNS`'a bir yazım eklemek. **Aksiyon:** patron/PM gerçek bir dosya paylaşsın, fixture olarak eklenip test edilsin.
2. **Unique indeks yokken bütünlük advisory lock'a dayanıyor.** Import yolu seri ama DB seviyesinde garanti yok. Seed ya da başka bir yazar aynı anahtara satır eklerse `updateMany` hepsini birlikte günceller (tutarlı kalır), sayıları çoğalmaz. Şema kilidi açılınca önerilen: `@@unique([topicPrefix, topicId, country, orgType])` + `NULLS NOT DISTINCT` (TopicMatch'teki desen). **Bu turda şema değişikliği gerekmediği için leed-fb'ye mesaj atılmadı.**
3. **Rescore'un kiracılar arası okuması** yeni bir `withSystemScope('platform-admin')` kaçışı. Yalnız `id` ve `tenantId` okunuyor, yazma kiracının kendi kapsamında. Baseline'a gerekçesiyle eklendi; kurala göre bu gerekçenin bir insan tarafından onaylanması gerekiyor (leed-fb inceleme).
4. **CSRF:** route'lar çerezle doğrulanıyor. NextAuth çerezi `SameSite=Lax` olduğu için başka siteden gelen multipart POST çerez taşımıyor; ayrıca apply, önizleme hash'ini istiyor. Ek bir Origin kontrolü yok; projedeki diğer admin upload route'larıyla aynı seviye.
5. **Kapsam dışı ama bu işte görülen güvenlik bulgusu (YÜKSEK, ayrı kart önerisi):** `src/app/[locale]/admin/cordis/actions.ts` içindeki 7 server action'ın (`handleRunCordisImportAction`, `handleRunCordisSync`, `handleRunCordisLiveDelta`, `handleTestRagQuery` …) **hiçbirinde `requirePlatformAdmin()` yok** (dosyada `auth()` ya da `requirePlatformAdmin` geçmiyor).
   - **Kanıt:** konum `actions.ts:10-83`, ve aynı dosyanın API ikizi `/api/admin/cordis/import` kapıyı taşıyor.
   - **Etki:** server action'lar herkese açık POST uç noktalarıdır; admin layout'undaki `notFound()` onları korumaz. Action ID'sini bilen biri pahalı CORDIS import/sync işlerini ve platform hesabına yazılan gömme (embedding) çağrılarını (`handleTestRagQuery`) tetikleyebilir.
   - **Düzeltme:** her action'ın ilk satırına `await requirePlatformAdmin();` ve `admin-upload-authz.test.ts` desenindeki gibi bir 403 testi.
   - Burada düzeltilmedi (kapsam ve paralel sahiplik); board'a kart açılmasını öneriyorum.

## 5. Açık sorular

- Eşleşmeyen kodlar da `topicId=null` ile saklanmalı mı (K1 konuyu sonra eklediğinde yeniden yükleme gerekmesin diye)? Kart "eşleşmedi"yi ayrı bir kategori olarak tanımladığı için şimdilik yazılmıyor ve listeleniyor.
- Dashboard kuruluş türünü (`orgType`) kodla mı (HES/PRC/REC/PUB/OTH) yoksa adla mı veriyor? Şu an metin olduğu gibi büyük harfe çevrilip saklanıyor. G0 şu an `orgType`'ı okumuyor.

## 6. Sonraki adım

1. Gerçek bir Horizon Dashboard xlsx'i fixture olarak eklenip takma adlar doğrulanmalı.
2. Şema kilidi açılınca TopicStat'a unique kısıt eklenmeli (Risk 2).
3. CORDIS admin server action'larının yetki açığı için kart açılmalı (Risk 5).
4. leed-fb'nin baseline gerekçesini (Risk 3) onaylaması gerekiyor.

**Platform beyanı:** doğrulama **macOS'ta** yapıldı (Darwin 27, Node 26.5, Chrome headless, Postgres :5433). Kod yolu platformdan bağımsız: süreç, kabuk, dosya yolu ya da ikili adı kullanılmıyor. xlsx tamamen bellekte açılıyor (`unzipper.Open.buffer`), dosya adı `/` ve `\` ayırıcılarının ikisine göre temizleniyor. Windows ve Linux'ta **koşulamadı**, çünkü bu makinede yalnız macOS var. Koddan bakıldığında aynı davranış bekleniyor; tek ortam bağımlılığı Node ICU'su (`Intl.DisplayNames`, tam ICU'lu resmi Node derlemelerinde var).
