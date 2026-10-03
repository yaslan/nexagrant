# TASK-MUSFO7ELD7WYF: R2'siz production kanıt yüklemesi (mock-upload 404)

**Hüküm:** Bitti: R2'siz production'da presign artık erken ve i18n'li `object_store_unconfigured` ile reddediyor. Mock URL prod'da hiç üretilmiyor (iki katmanda). Hata native `alert` yerine modal içindeki `role="alert"` alanında görünüyor. CI object store kararı patronda (aşağıda §5).
**Tip:** hata (production yapılandırma)
**Platform:** mac (Darwin 27, Chromium/Playwright, yerel Postgres). Kod platformdan bağımsız: `NODE_ENV` + env okuma + React. Dosya yolu, süreç ya da kabuk kodu yok. Windows/Linux'ta koşulmadı; davranış farkı beklenmiyor.
**Dal / PR:** `be-fb/evidence-no-object-store` (origin/dev d0d2f5ec'den), PR base `dev` (link aşağıda §7)

## 1. Ne yapıldı
Kök neden: `R2_ACCOUNT_ID` boşken `s3=null`. `getPresignedUploadUrl` NODE_ENV'e bakmadan dev'e özel `/api/evidence/mock-upload?key=…` URL'ini veriyordu. Bu rota production'da 404 döndüğü için kullanıcı native `alert` içinde "Dosya depoya yüklenemedi (HTTP 404)" görüyordu.

- `src/lib/storage.ts`
  - `objectStoreMissingInProduction(source = env, objectStore = hasObjectStore)` eklendi. Saf fonksiyon olduğu için test edilebilir.
  - `ObjectStoreUnconfiguredError` eklendi (`code='object_store_unconfigured'`).
  - `getPresignedUploadUrl` production'da store yoksa **fırlatır**. Mock URL'i asla döndürmez (ikinci savunma katmanı).
- `evidence/actions.ts` → `getPresignedUploadUrlAction`: tür ve boyut kontrolünden sonra, presign'dan önce `{ success:false, error:'object_store_unconfigured' }` döner. Sunucu log'una `console.error` yazar; bu bir dağıtım arızası, kullanıcı hatası değil. Desen dosyadaki mevcut `{ success:false, error }` sözleşmesiyle aynı. Tür ve boyut hatası öncelikli kalır: `.exe` hâlâ `unsupported_type` alır.
- `messages/{tr,en}.json` → `Evidence.upload.error.object_store_unconfigured`. TR metni: "Belge yükleme bu kurulumda henüz açık değil: dosya deposu yapılandırılmamış. Dosyanız gönderilmedi; lütfen yöneticinize bildirin." İstemci zaten `t('upload.error.${presign.error}')` ile çeviriyor.
- `evidence-client.tsx`: yükleme hatası `alert()` yerine modal içinde `role="alert"` + `data-testid="evidence-upload-error"` alanında gösteriliyor. Stil calendar ekranının amber bandıyla aynı. Alan modal açılınca ve yeni denemede temizleniyor. Silme akışındaki `alert` kapsam dışı, dokunulmadı.
- `docs/RELEASE_CHECKLIST.md`: madde #8 ve §2.2'deki R2 satırı zaten vardı ama metni eskiydi ("başarılı görünür ama saklanmaz", "EKSİK: hata/alarm"). Güncel davranışla ve canlı kontrol adımıyla değiştirildi.
- Testler:
  - YENİ `tests/evidence-object-store-unconfigured.test.tsx` (13 test). Kapsadıkları: fonksiyonun doğruluk tablosu; prod'da `getPresignedUploadUrl` fırlatıyor, prod dışında hâlâ mock URL veriyor; action prod'da reddediyor, `.exe` hâlâ `unsupported_type`; TR/EN UI'da bant metni görünüyor, `fetch` (PUT) hiç çağrılmıyor, native alert 0.
  - `tests/confirm-service-busy.test.tsx`: aynı metni artık `alert` stub'ından değil `role="alert"` bandından okuyor. Assert gevşetilmedi: metin aynı, ek olarak alert sayısı 0 bekleniyor.

## 2. Kanıt
**R2'siz prod build + start, gerçek tarayıcı.** Komut: `DEMO_LOGIN_ENABLED=false pnpm build` → `E2E_PORT=3158 E2E_WEB_SERVER=start DEMO_LOGIN_ENABLED=false …`. Koşu geçici bir spec ile yapıldı (`throwaway-proof.spec.ts.txt`: 2a'nın `fixtures/session.ts`'i ile minted oturum, kendi `evidenceTenant('r2proof')` kiracısı). Spec ve fixture koşudan sonra silindi, commit'te yok. `.env`'de `R2_ACCOUNT_ID` boş.
```
[WebServer] [getPresignedUploadUrlAction] no object store configured in production (R2_ACCOUNT_ID unset); upload refused
  ✓  1 [chromium] › tests/e2e/zz-befb-r2-proof.spec.ts:15:5 › production without R2: upload refused early, no mock-upload request (972ms)
  1 passed (3.2s)
```
Ağ kaydı (`network.txt`, sayfadaki tüm istekler `page.on('request')` ile toplandı):
```
banner: Yükleme hatası: Belge yükleme bu kurulumda henüz açık değil: dosya deposu yapılandırılmamış. Dosyanız gönderilmedi; lütfen yöneticinize bildirin.
dialogs (native alert): []
requests total: 40
requests containing "mock-upload": 0
PUT requests: 0
POST requests (server actions):
POST http://localhost:3158/tr/ev-r2proof-e2e/evidence
```
Spec ayrıca DB'de bu kiracı için `evidence` satır sayısının 0 olduğunu doğruladı. Ekran görüntüsü: `TASK-MUSFO7ELD7WYF-be-fb/prod-no-r2-upload-refused.png` (modal açık, amber bantta TR mesaj).

**Mutantlar** (unit, `tests/evidence-object-store-unconfigured.test.tsx`):
- M1, action'daki prod kontrolü kaldırıldı (`if (false && …)`) → 3 test kırmızı:
  ```
  × production: refuses early with object_store_unconfigured, and no URL
  × tr: the modal shows the sentence, sends no PUT and raises no native alert
  × en: …
  AssertionError: expected 'Yükleme hatası: Depolama şu an kullan…' to contain 'Belge yükleme bu kurulumda henüz açık…'
  Tests  3 failed | 10 passed (13)
  ```
- M2, storage'daki prod kontrolü kaldırıldı → 1 test kırmızı:
  ```
  × production: throws instead of handing out the dev mock-upload URL
  AssertionError: expected { …(2) } to be an instance of ObjectStoreUnconfiguredError
  Tests  1 failed | 12 passed (13)
  ```
- Her iki mutant geri alındı. İki katman ayrı ayrı testle kilitli.

**Dev modda mevcut E2E** (bu dalın kendi spec'leri, demo form ile, `dev-green.log`):
```
  ✓  1 … evidence-fabrication.spec.ts:43:5 › an upload with no readable metadata does not gain invented metadata (3.4s)
  ✓  2 … evidence-unverified-badge.spec.ts:67:5 › a document nothing has verified is not shown as verified (1.0s)
  ✓  3 … evidence-unverified-badge.spec.ts:89:5 › a fresh upload is recorded as unverified, not valid (1.2s)
  3 passed (10.4s)
```
**Statik kontroller ve vitest:**
- Vitest (evidence + rbac + live dosyaları): `Test Files 9 passed (9) · Tests 109 passed | 45 skipped (154)`. Atlanan 45 test `evidence-upload-s3.live` ve `evidence-confirm-store-faults.live`: MinIO yok. Bunlar `scripts/live-skip-gate.ts`'te zaten bilinçli atlama olarak listeli.
- `pnpm typecheck` exit 0.
- `eslint` (değişen 5 kod/test dosyası) temiz.
- `pnpm i18n:check`: `✅ i18n check passed: both catalogs agree…`

## 3. Değişen dosyalar
- `src/lib/storage.ts`
- `src/app/[locale]/(app)/[workspace]/evidence/actions.ts`
- `src/app/[locale]/(app)/[workspace]/evidence/evidence-client.tsx`
- `messages/tr.json`, `messages/en.json`
- `tests/evidence-object-store-unconfigured.test.tsx` (yeni), `tests/confirm-service-busy.test.tsx`
- `docs/RELEASE_CHECKLIST.md` (madde #8 ve §2.2 R2 satırı)
- `docs/agent-results/TASK-MUSFO7ELD7WYF-be-fb.md` + `TASK-MUSFO7ELD7WYF-be-fb/` (png, log, network.txt, geçici spec kopyası)

## 4. Riskler
- Start-mode E2E'de `evidence-unverified-badge.spec.ts:89` ve `evidence-fabrication.spec.ts:43` R2'siz koşulduğunda hâlâ KIRMIZI. Bu bilinçli: artık ham 404 yerine anlaşılır bir ret görüyorlar. Nasıl yeşile döneceği §5'teki karara bağlı.
- `env.NODE_ENV` modül yüklenirken parse ediliyor. Test bu yüzden `env` nesnesini mutasyonla değiştiriyor ve her testten sonra geri yüklüyor.
- Hata metninin başına istemci, mevcut davranış gereği "Yükleme hatası:" ekliyor. Bu önek `isTr` ile sabit yazılmış (i18n değil). Önceden de böyleydi, kapsam dışı bırakıldı.

## 5. CI object store kararı (patron/lider; UYGULANMADI)
Soru: start-mode E2E'de iki yükleme testi (`evidence-unverified-badge:89`, `evidence-fabrication:43`) nasıl koşsun?

| # | Seçenek | Ne kazandırır | Maliyet / risk |
|---|---|---|---|
| A | **MinIO servis container'ı** (`ci.yml` `services:`) + E2E adımına `R2_ACCOUNT_ID=minio-test`, `R2_ENDPOINT=http://localhost:9000`, anahtar ve bucket env'leri + bucket oluşturma adımı (`mc mb` ya da `aws s3api create-bucket`) | Start-mode'da gerçek presign → PUT → confirm zinciri test edilir. Aynı servis, CI'da bugün atlanan 2 live vitest dosyasını da açar (`live-skip-gate` listesindeki 2 madde silinebilir). Kod tarafı hazır: `R2_ENDPOINT` + `forcePathStyle` zaten var. | Her CI koşusuna tahminen +20–40 sn (imaj ~100 MB çekme + health check). Bu süre ölçülmedi. Actions dakikası buna göre artar (hesapta harcama limiti var, bkz. faturalama hafızası). Tarayıcıdan `localhost:9000`'e cross-origin PUT için CORS'a dikkat: MinIO varsayılanı izinli, ilk koşuda doğrulanmalı. Bakım: imaj sürümü sabitlenmeli. |
| B | Start-modda **bilinçli skip** (`test.skip(E2E_WEB_SERVER==='start' && !R2, 'no object store')`) | Sıfır maliyet, kırmızı biter | Production yükleme yolu CI'da hiç doğrulanmaz. Kart "skip ekleme" diyor, bu yüzden önerilmiyor. |
| C | Spec'leri **moda duyarlı** yapmak: start + R2 yok ise yeni reddi assert et (bant görünür, PUT 0, satır 0); dev'de yüklemeyi assert et | Sıfır altyapı maliyeti. Bu düzeltmenin prod davranışı CI'da kilitlenir. | Gerçek yükleme zinciri start-modda yine test edilmez. Spec'lere dokunur: TASK-MUSBCXP9RKS3D ekibinin alanı, onlarla koordinasyon gerekir. |
| D | Prod'da test bayrağıyla dev stand-in'i açmak | — | **Önerilmez:** bu kartın kapattığı hatayı bayrakla geri açar. |

**Öneri:** A, ayrıca C'nin "R2 yok" dalı. A gerçek zinciri ve 2 atlanan live suite'i açar. C, A olmayan koşularda reddi kilitler. Uygulama devop-fb'nin işi ve onay bekliyor.

## 6. Açık sorular
- Karar §5 (A / B / C).
- Go-live: canlıda R2 açılacak mı, yoksa pilotta yükleme kapalı mı kalacak? Checklist madde #8 hâlâ PATRON kararı. Bu PR ile "kapalı" seçeneği artık anlaşılır bir mesajla çalışıyor.

## 7. Sonraki adım
PR (base dev) → crw-fb incelemesi. Karar gelirse ayrı kartla devop-fb uygular.

> Not: Bu rapor, görev talimatındaki tam yola (`/Users/macbook/alan/docs/agent-results/TASK-MUSFO7ELD7WYF-be-fb.md`) da aynen yazıldı. Repo kopyası PR'la birlikte incelemeye gidiyor.
