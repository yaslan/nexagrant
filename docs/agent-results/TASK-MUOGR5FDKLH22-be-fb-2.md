Hüküm: Bitti (dalda). Havuz doluyken evidence confirm artık fırlatmıyor, `{success:false, error:'service_busy'}` döndürüyor. S2'de fırlatma 150 → 0 (150 `service_busy`). Gerçek tarayıcıda yükleme ekranı tr/en `upload.error.service_busy` metnini gösteriyor. Kapılar temiz. Bir önkoşul var: dal, dev'de olmayan `cs-fb/g1-pool-timeout` dalını da taşıyor (aşağıda Risk 1).
Entegrasyona hazır: be-fb/g1-confirm-service-busy <bu raporu taşıyan commit; kod commit'i 149d4313>
Platform beyanı: mac'te doğrulandı (macOS 27.0.1, Node 26.5.0, pnpm 11.25.0, Docker `pgvector/pgvector:pg16` + `bitnamilegacy/minio`, Playwright Chromium headless). Linux ve Windows'ta koşulamadı, çünkü bu makinede yalnız mac var. Koda bakınca değişiklik platforma bağlı değil: bir `try/catch`, digest/code karşılaştırması ve iki JSON anahtarı var; yol, kabuk, süreç ya da ikili adı yok. pg-pool'un zaman aşımı metni her işletim sisteminde aynı. Prod Linux konteynerinde davranışın aynı olmasını bekliyorum.

# TASK-MUOGR5FDKLH22 — be-fb (2. teslim): evidence confirm → `service_busy`

## 0. Önceki teslimin düzeltmesi
Önceki rapor (`TASK-MUOGR5FDKLH22-be-fb.md`, 57e13bc0) şunları "yapıldı" diye yazmıştı ama diff'te yoktular: confirm action değişikliği, istemci, tr/en anahtarı, canlı kanıt. O commit ayrıca ana checkout'ta `devop-fb/muoibd-gates` dalının üstüne yazılmıştı. Bu teslimde:
- Scratchpad'de dev'den (`49c46a78`) **ayrı worktree** açtım: `git worktree add -b be-fb/g1-confirm-service-busy <scratchpad>/wt dev`.
- 57e13bc0'ı cherry-pick ettim (`97754fde`).
- Ana checkout'ta hiçbir komut koşmadım: checkout, stash ve commit yok. Git işlemleri `GIT_DIR` ile ve yalnız worktree'de yapıldı.
- 57e13bc0'daki `src/lib/service-busy.ts`, cs-fb'ninkiyle bayt bayt aynıydı (birleştirmede çakışma çıkmadı). Eski test (`tests/confirm-service-busy.test.tsx`) `@/lib/tenant`'ı tamamen mock'luyordu, o yüzden sahte bir kanıttı. Yeniden yazdım.
- Eski rapor dosyasının başına bu rapora yönlendiren bir "geçersiz" notu ekledim.
- Devop-fb dalındaki yanlış yere yazılmış 57e13bc0'a dokunmadım. Geri alınıp alınmayacağı entegratörün kararı (Ö-2).

## 1. Ne yapıldı
**Önkoşul: tipli SERVICE_BUSY.** Görev "tipli SERVICE_BUSY"yi yakalamamı istiyor. Bu hata (`ServiceBusyError`, `digest=SERVICE_BUSY`) yalnız `cs-fb/g1-pool-timeout` dalında var, dev'de yok. Dev'de pilot kontrolü ham pg-pool hatasıyla düşüyor. Bu yüzden o dalı benim dalıma merge ettim (`b3b56ede`, çakışmasız). B, A'nın üstüne oturuyor; cs-fb 1-3-1'i de böyle öneriyordu.

**Değişiklik** (yalnız `confirmEvidenceUploadAction`, başka çağrı yerine dokunulmadı):
- `src/app/[locale]/(app)/[workspace]/evidence/actions.ts`: `requireTenantAction({ can: 'edit_proposal' })` bir `try` içine alındı.
  - `isServiceBusy(error)` doğruysa `{ success: false as const, error: 'service_busy' as const }` dönüyor.
  - Diğer her hata olduğu gibi yeniden fırlatılıyor: `PILOT_EXPIRED`, `FORBIDDEN_ROLE`, TenantScopeError, P2002, TypeError…
  - Dönüş tipi çıkarımla genişledi: `error` birliğine `'service_busy'` eklendi.
  - Kontrol `try` içinde bir `const` bildirimi olarak duruyor. İlk denemede `scope = await …` ataması kullanmıştım; RBAC bekçisi bunu "rol kontrolü yok" diye kırmızıya çevirdi (ek 16'nın önceki koşusu). Bekçinin okuduğu biçim bildirim.
- `messages/tr.json` ve `messages/en.json`: `Evidence.upload.error.service_busy`
  - tr: "Sistem şu an çok yoğun; belge kaydedilmedi. Birkaç saniye sonra yeniden yükleyin."
  - en: "The system is very busy right now, so the document was not saved. Upload it again in a few seconds."
- **İstemci kodu değişmedi. Gerekmedi ve bunu kanıtladım.** `evidence-client.tsx:229` zaten `t(\`upload.error.${res.error}\`)` ile her hata kodunu anahtara çeviriyor, `:244` bunu `alert` ediyor. Eksik olan yalnız anahtardı. Tarayıcıda görünen metin: "Yükleme hatası: Sistem şu an çok yoğun; …" (ek 20/21).

**Testler:**
- `tests/confirm-service-busy.test.tsx`, 8 test. Gerçek `requireTenantAction` ve `assertTenantActionWritable` koşuyor; yalnız pilot sorgusu düşürülüyor. Testler şunları kontrol ediyor:
  - havuz dolu → `toStrictEqual({success:false,error:'service_busy'})` ve sürücü metni yok;
  - PILOT_EXPIRED hâlâ fırlıyor; FORBIDDEN_ROLE hâlâ fırlıyor;
  - P2002 ve TypeError yutulmuyor (aynı nesne fırlıyor);
  - tr/en anahtarı var ve `save_failed`'dan farklı;
  - yükleme ekranı gerçek tr/en katalogla render ediliyor, dosya seçilip form gönderiliyor, gerçek confirm `service_busy` döndürüyor ve `alert` metni bu anahtarı içeriyor.
- `tests/service-busy-action.test.tsx` (cs-fb): "evidence confirm SERVICE_BUSY ile reddeder" testi yeni sözleşmeye göre güncellendi: artık döner, reddetmez, sürücü metni sunucu logunda. Bu, testi gevşetmek değil; sözleşme patron kararıyla değişti. `requireTenantAction`'ın kendi reddi aynı dosyada hâlâ sıkı sıkıya test ediliyor.

## 2. Kanıt
Ham çıktılar `TASK-MUOGR5FDKLH22-be-fb-2-ekler/` klasöründe.

**Önce kırmızı, sonra yeşil** (ek 01 / 02):
```
RED  (actions.ts değişmeden, anahtar yokken): Tests 4 failed | 4 passed (8)
     × returns { success: false, error: service_busy } …   × tr and en both have it …
     × tr: the upload screen alerts …                        × en: the upload screen alerts …
GREEN: Test Files 2 passed (2) · Tests 20 passed (20)
```
**Mutantlar** (ek 14). Her birinden sonra geri alındı, `cmp` ile kontrol edildi, sonuç "actions restored OK".

| Mutant | Sonuç |
|---|---|
| M1 yakalama kaldırıldı | KILLED, 4 failed |
| M2 her hata `service_busy` (yutma) | KILLED, 4 failed (PILOT_EXPIRED, FORBIDDEN_ROLE, P2002, TypeError) |
| M3 `save_failed` döndür | KILLED, 4 failed |
| M4 tr anahtarı silindi | KILLED, 2 failed |

**Canlı S2** (ek 07–10):
- İzole Postgres `befb-g1c-pg` 127.0.0.1:**55188**, MinIO 127.0.0.1:**59188**. :5433'e hiç bağlanılmadı.
- DB kurulumu CI sırasıyla yapıldı: `db push → db:rls-role → apply-migrations ×2 (41 files applied) → db:rls → db:generate → db:seed`, `setup exit=0`.
- Uygulama havuzu `fabrika_app` rolüyle ve gerçek havuzla koştu (`@/lib/db` mock yok).
- Senaryo: 10 bağlantı `pg_sleep(1.6)` ile tutulurken 150 eşzamanlı confirm. Harness, cs-fb'nin ölçüm dosyasından yalnız S2 bölümü alınarak kuruldu; repoya girmedi (ek `zz-befbg1c.live.test.ts.txt`).
```
ÖNCE-1 dev 49c46a78        : S2 150 confirm in 1015 ms: {"THROW no-digest RAW-POOL-TEXT msg=\"timeout exceeded when trying to connect\"":150}  thrown=150 raw_pool_text=150
ÖNCE-2 A (b3b56ede, B yok) : S2 150 confirm in 1012 ms: {"THROW digest=SERVICE_BUSY no-pool-text …":150}                                        thrown=150 raw_pool_text=0
SONRA  A + B (son hal)     : S2 150 confirm in 1016 ms: {"value error=service_busy":150}                                                        thrown=0   raw_pool_text=0
SONRA  havuz boşalınca     : S2 AFTER pool free: confirm={"success":true} rows=1
```
Her koşuda `S2 activity while held: app:active=10` ve `holders: {"held":10}`, yani havuz gerçekten doluydu.

**Gerçek tarayıcı** (ek 11–13, 20–22; Playwright Chromium, `next dev -p 3188`, izole DB, demo girişi `admin@yasinaslan.com.tr` TENANT_OWNER, `/tr|en/main/evidence`):
- Akış gerçek tıklamalarla: "Yeni Belge Yükle (R2)" → dosya seç → "Cloudflare R2'ye Yükle".
- **Hata enjeksiyonu (repo dışı, `pg-inject.cjs.txt`).** Gerçek uygulamada havuzu dışarıdan, yalnız pilot kontrolünü düşürecek biçimde doldurmak mümkün değil (Risk 2'ye bakın). Bu yüzden dev sunucusu `NODE_OPTIONS=--require pg-inject.cjs` ile başlatıldı. Bu önyükleme `pg.Pool.prototype.connect`'i sarıyor. PUT tamamlanınca 2 bağlantıya izin veriyor (confirm'in auth jwt okuması) ve bir sonrakini pg-pool'un kendi metniyle (`timeout exceeded when trying to connect`) düşürüyor. Bağlantı logunda (ek 13) düşen bağlantının pilot kontrolünün `startTransaction`'ı olduğu görülüyor. Sunucu logu: `[requireTenantAction] pilot check could not reach the database: timeout exceeded when trying to connect`.
- Server action yanıtı (ağdan okundu): `1:{"success":false,"error":"service_busy"}`.
- Gerçek `dialog` olayında yakalanan alert metni:
  ```
  tr: "Yükleme hatası: Sistem şu an çok yoğun; belge kaydedilmedi. Birkaç saniye sonra yeniden yükleyin."
  en: "Upload error: The system is very busy right now, so the document was not saved. Upload it again in a few seconds."
  ```
- ÖNCE (aynı akış, dev kodu): `"Yükleme hatası: timeout exceeded when trying to connect"`. Sürücü metni kullanıcıya gidiyordu (ek 12, 22).
- DB kontrolü: enjeksiyonlu SONRA koşularından `Evidence` satırı yazılmadı. Yalnız kalibrasyon ve ilk hatalı ÖNCE koşusundan birer satır var; o koşuda enjeksiyon kurulmamıştı ve yükleme başarılı oldu.
- Ekran görüntüleri: `20-sonra-tr-yukleme-ekrani.png`, `21-sonra-en-…`, `22-once-dev-tr-…`. ⚠ Headless Chromium native `alert()` kutusunu fotoğraflayamıyor; açık kutu `page.screenshot`'ı da kilitliyor. Bu yüzden resim koşusunda `window.alert` yerine, uygulamanın `alert`'e verdiği **aynı** diziyi yükleme modalının üstünde bir şeritte gösteren küçük bir yerine koyucu kullanıldı. Şeritte "window.alert():" öneki var. Metnin kendisi, yerine koyucusuz koşunun gerçek `dialog` olayıyla birebir aynı (ek 11).

**Bekçiler ve kapılar** (ek 16, son kod `149d4313` öncesi aynı içerik; sonradan yalnız yorum eklendi, ardından tsc 0 ve rbac + 2 servis-meşgul suite'i 84/84 yeniden koşuldu):
```
tsc exit=0 · lint exit=0 · i18n exit=0
✓ tests/api/action-leak-scan.test.ts (133 tests) · ✓ tests/api/api-error-body-guard.test.ts (22 tests) · ✓ tests/server-action-rbac-guard.test.ts (64 tests)
 Test Files  308 passed | 2 skipped (310)
      Tests  4119 passed | 52 skipped (4171)
vitest exit=0 · live-skip-gate exit=0        (CI=true, canlı suite'ler izole DB'ye karşı, AUTH_SECRET test değeri)
next build: ✓ Compiled successfully · build exit=0   (ek 15)
```
Tam vitest'in ilk koşusu 4 dosya kırmızı verdi:
- `server-action-rbac-guard`: gerçek bulgu, yukarıda anlatılan atama biçimi. Düzeltildi.
- 3 canlı dosya: `AUTH_SECRET is not set`. CI bunu set ediyor, ortam eksiğiydi.

## 3. Değişen dosyalar (dal `be-fb/g1-confirm-service-busy`)
- `97754fde`: 57e13bc0'ın cherry-pick'i (`src/lib/service-busy.ts`, eski test, eski rapor)
- `b3b56ede`: merge `cs-fb/g1-pool-timeout`. Getirdikleri: `src/lib/tenant.ts`, `src/lib/hooks/use-action-error-text.ts`, `Common.serviceBusy`, cs-fb testleri ve raporu.
- `149d4313`: `src/app/[locale]/(app)/[workspace]/evidence/actions.ts`, `messages/tr.json`, `messages/en.json`, `tests/confirm-service-busy.test.tsx`, `tests/service-busy-action.test.tsx`
- Rapor commit'i: bu dosya, `…-be-fb-2-ekler/`, eski `…-be-fb.md`'ye eklenen geçersiz notu

## 4. Riskler
1. **Önkoşul dal.** Bu dal dev'e merge edilirse `cs-fb/g1-pool-timeout` (A) da gelir. A henüz ayrı bir entegrasyon kararı bekliyorsa, ikisi birlikte alınmalı. B, A olmadan anlamsız: dev'de tipli hata yok.
2. **Gerçek istekte havuz doluyken ilk düşen genelde `auth()` olur, pilot kontrolü değil.** Bunu koddan çıkardım; canlı denemedim. `auth.ts:722` jwt callback'i her istekte havuzdan üyelik okuyor, bir kez yeniden deniyor, ikinci başarısızlıkta token'ı tenantsız bırakıyor. Sonra `assertTenant` `TenantScopeError` fırlatıyor. Kalibrasyon logu (ek 13) confirm başına sırayı gösteriyor: 2 auth bağlantısı, ardından pilot `startTransaction`. Yani havuz uzun süre tamamen doluysa kullanıcı `service_busy` yerine "tenant yok" hatasını görebilir. `service_busy` yolu, auth'un bağlantı aldığı ama pilotun alamadığı durumu kapsıyor: D7'deki gibi kısa tepeler. S2 harness'ı `auth`'u mock'ladığı için bunu göstermiyor. Ayrı kart önerisi Ö-1'de.
3. Tarayıcı kanıtı gerçek havuz doluluğu değil, hedefli bir bağlantı hatası enjeksiyonu kullanıyor. Gerçek havuz davranışının kanıtı S2.
4. `SERVICE_BUSY_CODE` (`service-busy.ts`) değeri `'serviceBusy'`, bu action'ın kodu ise `'service_busy'`. Görev bu adı istedi ve `upload.error.*` anahtarları snake_case. İstemci bu değeri `isServiceBusy`'den değil, `upload.error.<code>` yolundan okuyor, bu yüzden sorun yok. Ama iki yazım var.

## 5. Açık sorular
- **Ö-1:** Risk 2 için ayrı kart açılsın mı? `auth()`'un jwt okuması `NOT_CONNECTED` ile iki kez düşünce tenantsız bırakmak yerine `ServiceBusyError` verilebilir. Ancak bu, fail-closed tasarımına dokunur; güvenlik incelemesi gerekir.
- **Ö-2:** Ana checkout'taki `devop-fb/muoibd-gates` dalında yanlışlıkla duran 57e13bc0 geri alınsın mı? Dokunmadım: ana checkout'ta komut yasak ve dal başkasının.
- **Ö-3 (sonuç yolu):** Görev metnindeki ek blok sonucu ana checkout yoluna (`…/FONBRIDGE/docs/agent-results/TASK-MUOGR5FDKLH22-be-fb.md`) yazmamı istiyor. Görevin kendisi ise raporu `-2.md` olarak yalnız dalda commit'lememi ve ana checkout'a dokunmamamı istiyor. Görevin açık talimatına uydum. Eski `be-fb.md`'yi dalda bu rapora yönlendirdim. Merge edilince o yol doğru içeriği gösterecek. Ana checkout'a kopya bırakmadım; cs-fb'nin gördüğü gibi izlenmeyen bir kopya merge'ü durdurur.

## 6. Sonraki adım
- Entegratör: `cs-fb/g1-pool-timeout` + `be-fb/g1-confirm-service-busy` birlikte dev'e (push yok, merge yok; benden değil).
- İzole konteynerler (`befb-g1c-pg`, `befb-g1c-minio`) rapor commit'inden sonra kaldırılıyor. Worktree scratchpad'de duruyor.
