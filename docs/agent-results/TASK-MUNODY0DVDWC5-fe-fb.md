# TASK-MUNODY0DVDWC5 — Y-4 kalan (B-1/B-2/B-3): kanıt yüklemede tür/boyut imzası + kimlikli indirme — fe-fb

**Durum:** TAMAM (inceleme bekliyor; tek açık madde: gerçek tarayıcı e2e'si kill-guard onayı bekliyor, §5)
**Dal:** `fe-fb/munody-evidence` → dev'e `--no-ff` merge: `592c2174` (commit'ler `7e24d1a6`, `a2a54966`). Push yok.
**Kaynak:** `docs/agent-results/TASK-MUN80W2VFY56R-se-fb-inceleme58.md` §2.4, §3 B-1/B-2/B-3
**Platform beyanı:** Doğrulama mac'te yapıldı (Darwin 27, Node 22, vitest 4.1.11, `pgvector/pgvector:pg16` ve `bitnamilegacy/minio` konteynerleri). Değişen kod platforma bağlı değil: S3 imzası, HTTP route handler'ları, Buffer ile bayt karşılaştırma. Tek dosya yolu kodu (`devObjectPath`) değişmedi. Bu yüzden Linux ve Windows'ta aynı sonucu beklerim. Windows ve Linux'ta koşulmadı, çünkü bu makinede yalnız mac var. CI (ubuntu) MinIO suite'ini atlar, çünkü job'da S3 servisi yok (§4).

## 1. Ne yapıldı

**B-1: tür ve boyut, sunucuda ve imzada**
- `src/lib/storage.ts`:
  - İzin listesi `EVIDENCE_TYPES`: pdf, png, jpg/jpeg, webp, docx, xlsx. Uzantı ile MIME aynı girdiyi göstermeli.
  - Boyut sınırı `EVIDENCE_MAX_BYTES` = 25 MB. Arayüz daha önce "max 100MB" yazıyordu; bu da 25 MB'a çekildi (§5).
  - `evidenceUploadType()`: presign öncesinde tarayıcının beyanını kontrol eder.
  - `storedEvidenceMatches()`: depodaki nesneyi kontrol eder. Uzantı, boyut, depoda kayıtlı Content-Type ve ilk baytlar (magic) birbirini tutmalı. docx/xlsx için magic ZIP başlığıdır.
- `getPresignedUploadUrl` `ContentType` ve `ContentLength` alıyor ve `signableHeaders: ['content-type','content-length']` ile imzalıyor. URL'de `X-Amz-SignedHeaders=content-length;content-type;host` görünüyor.
- Yeni `statObject()` fonksiyonu HeadObject ve ilk 16 bayt için ranged GET yapıyor. Dev deposunda stat ve read kullanıyor.
- `actions.ts`:
  - `getPresignedUploadUrlAction(category, fileName, mimeType, fileSizeBytes)` izin dışı istekte `{success:false,error}` döner.
  - `confirmEvidenceUploadAction` önce `statObject` çağırır. Nesne yoksa `object_missing` döner. Uymayan nesneyi **yalnız o tek anahtarla** (`deleteObjectBytes(objectKey)`) siler ve reddeder. Satıra istemcinin beyanını değil, deponun boyut ve türünü yazar.
  - `createEvidence` (FormData yolu) da aynı kuralları `uploadFileToR2` üzerinden uygular.

**B-2: genel URL yok, kimlik doğrulamalı indirme**
- `fileUrl` artık hiçbir yolda yazılmıyor (`null`). `publicObjectUrl()` kaldırıldı. `getPresignedDownloadUrl` artık genel URL'ye geri düşmüyor.
- Yeni `GET /api/evidence/[id]/download`:
  - Oturum gerekli, `requireTenantApi` kullanılıyor.
  - Satır `withTenant` içinde `(id, tenantId)` ile okunuyor ve anahtar `tenantObjectKeyOf` ile kiracı önekinde olmalı.
  - Başka kiracının kaydı ya da uydurma bir id 404 döner.
  - R2 varken 5 dakikalık presigned GET'e 302 ile yönlendirir. Yanıt her zaman `response-content-disposition=attachment` ve `Cache-Control: private, no-store` taşır.
  - Dev'de baytları `attachment`, `nosniff` ve `sandbox` CSP başlıklarıyla kendisi sunar.
- `evidence-client.tsx`: iki "Belgeyi Aç" linki artık `r2ObjectKey` varsa `/api/evidence/<id>/download` adresine gidiyor. CSV'deki `FileUrl` sütunu yerine `FileName` yazılıyor.

**B-3: checksum ve istemci hatası**
- S3Client `requestChecksumCalculation` ve `responseChecksumValidation` ayarları `'WHEN_REQUIRED'` yapıldı.
- İstemci presign reddinde, `!put.ok` durumunda ve confirm reddinde throw ediyor. Her hata kodunun i18n anahtarlı bir mesajı var: `Evidence.upload.error.*` (tr ve en).
- Dev yedeği `/api/evidence/mock-upload` daha önce var olmayan bir adrese gidiyordu ve istemci PUT'u atlıyordu. Bu yüzden baytı olmayan kayıt açılıyordu (B-4'ün dev kısmı). Artık baytlar gerçekten `.dev-objects`'e yazılıyor. Rota R2 imzasının zorladığı kuralları kendisi uyguluyor: anahtar kiracı önekinde, uzantının türü, boyut sınırı ve `edit_proposal` yetkisi. Production'da ya da R2 ayarlıyken 404 döner.
- Test amaçlı `R2_ENDPOINT` override'ı eklendi (path-style). Ayarlanmamışsa davranış eskisi gibi R2.

## 2. Kanıt

Ekler: `docs/agent-results/TASK-MUNODY0DVDWC5-fe-fb-ekler/` (`minio-live-run.txt`, `mutants-out.txt`, `mutants.sh`, `mut.py`, `full-test-summary.txt`, `build-summary.txt`, `i18n-summary.txt`)

**Canlı düşman testleri: gerçek MinIO + izole Postgres (`fefb_ody`, RLS rolü `fabrika_app`)**
Dosya: `tests/evidence-upload-s3.live.test.ts`. Yalnız oturum mock'lanıyor; `requireTenantAction` ve `requireTenantApi` gerçek çalışıyor. Yüklenen içerikler zararsız metin ya da küçük PDF iskeleti.
```
✓ B-1 … types outside the list, a type that disagrees with the extension, and bad sizes get no URL
✓ B-1 … the URL signs type and length and carries no empty-body checksum (B-3)
✓ B-1 … the store refuses a PUT whose type differs from the signed one          (MinIO 403 ×3: text/html, svg, octet-stream)
✓ B-1 … the store refuses a PUT larger or smaller than the signed length        (MinIO 403 ×2)
✓ B-1 … confirm refuses a key that was never uploaded, and writes no row        (object_missing)
✓ B-1 … confirm refuses a stored object whose bytes are not the key’s type, and removes that one object   (komşu nesne duruyor)
✓ B-1 … confirm refuses a stored object whose content type is not the key’s, even with PDF bytes
✓ B-1 … confirm refuses a stored object over the limit, whatever size the browser claims
✓ B-1 … positive control: a real PDF goes through, and the row records the store’s size and type   (fileUrl null)
✓ B-2 … a CONFIDENTIAL file cannot be read without a session, neither from the store nor through the app  (store 403, route 401)
✓ B-2 … another tenant’s evidence is a 404 and no signed URL is handed out
✓ B-2 … a row of A that names B’s object does not open it
✓ B-2 … positive control: the owner gets a 5-minute signed download of the same bytes, as an attachment
 Test Files  1 passed (1)
      Tests  13 passed (13)
```

**Mutantlar: 15 mutantın 14'ü kırmızı** (`mutants-out.txt`, her mutanttan sonra `git checkout -- <dosya>`, son `git status` temiz)
```
M1-no-signable-headers        2 failed     M9-client-claims-recorded     1 failed
M2-no-content-length          2 failed     M10-confirm-skips-stat        1 failed
M3-mime-ext-not-compared      1 failed     M11-default-checksums         1 failed
M4-no-presign-size-limit      1 failed     M12-download-no-key-prefix    1 failed
M5-no-magic-sniff             1 failed     M13-download-inline           1 failed
M6-no-stored-type-check       1 failed     M14-download-long-ttl         1 failed
M7-no-stored-size-check       1 failed     M15-download-no-tenant-where  13 passed (SAĞ)
M8-no-delete-on-refusal       3 failed
```
- M15 sağ kalıyor, çünkü indirme sorgusu `withTenant` (RLS) altında koşuyor. Başka kiracının satırı `where` koşulunda `tenantId` olmasa da görünmüyor. `tenantId` koşulu ikinci katman olarak kaldı. Tek katman kalan bir durum değil.
- **B-3 varsayımı:** M11'de (varsayılan checksum) yalnız URL parametresi testi kırıldı. MinIO boş gövde CRC32'si taşıyan URL'ye gerçek baytlarla yapılan PUT'u **kabul etti**. Yani "BadDigest ile reddedilir" varsayımı MinIO'da yeniden üretilmedi. R2'nin davranışı hâlâ bilinmiyor. Düzeltme parametreyi zaten kaldırıyor.

**Kapılar**
- `pnpm typecheck`: 0 hata. Worktree'de ve merge sonrası dev'de ayrı ayrı koşuldu.
- `pnpm lint`: 0 hata.
- `pnpm i18n:check`: geçti (312/314). "Paid down" notu `admin/settings`'e ait, benimle ilgisi yok.
- `pnpm build`: rc=0. `/api/evidence/[id]/download` ve `/api/evidence/mock-upload` derlendi. `instrumentation.ts` Edge uyarısı önceden de vardı.
- **CI=true `pnpm test` tam koşum** (izole DB, `AUTH_SECRET=ci-vitest-auth-secret-fixture-not-for-any-deployment`):
  ```
  Test Files  257 passed | 2 skipped (259)
       Tests  3120 passed | 22 skipped (3142)
  rc=0
  ```
  22 atlanan testin 13'ü MinIO suite'i: CI'da S3 env'i olmadığı için atlanıyor (`CI=true` ile ayrıca koşuldu: 13 skipped, fail değil).
- Merge sonrası dev (`592c2174`): tsc=0; ilgili 6 dosya (S3 live, evidence-object-key live, storage, rbac, rbac-guard, missing-id) 119/119 geçti. Env açıkça izole DB'ye yönlendirildi.

**Temizlik:** Test sonrası MinIO kovasında 0 nesne ve DB'de 0 `evs3-*` kiracı kaldı. Ardından `fefb-ody-pg` ve `fefb-ody-minio` konteynerleri `docker rm -f` ile kaldırıldı ve worktree silindi. Paylaşılan fabrika DB'sine yazılmadı.

## 3. Değişen dosyalar
- `src/lib/storage.ts`: izin listesi, imzalı presign, `statObject`, indirme presign'ı, checksum ayarı, `R2_ENDPOINT`, `publicObjectUrl` kaldırıldı
- `src/app/[locale]/(app)/[workspace]/evidence/actions.ts`: presign doğrulaması, confirm'de HeadObject, tek anahtarla silme, `fileUrl: null`
- `src/app/[locale]/(app)/[workspace]/evidence/evidence-client.tsx`: `res.ok` kontrolü, hata mesajları, indirme linki, CSV'de URL yok, 25 MB etiketi, `.webp`
- `src/app/api/evidence/[id]/download/route.ts` (yeni), `src/app/api/evidence/mock-upload/route.ts` (yeni)
- `src/lib/env.ts`: yalnız `R2_PUBLIC_HOST` yorumu
- `messages/tr.json`, `messages/en.json`: `Evidence.upload.*`
- Testler: `tests/evidence-upload-s3.live.test.ts` (yeni), `tests/evidence-object-key.live.test.ts` (yeni imza, PDF baytı), `tests/server-action-rbac.test.ts` (4. argüman), `tests/storage-public-url.test.ts` (genel URL üretilmediğini doğrular)

## 4. Riskler
- **CI MinIO suite'ini koşmuyor.** ci.yml'de S3 servisi yok, bu yüzden suite atlanıyor. Kalıcı koruma için ci.yml'e bir MinIO servisi ve `EVIDENCE_S3_TEST_*` değerleri eklenmeli. Bu kartın kapsamında değildi ve CI dosyasına dokunmadım.
- **Eski satırlar:** `r2ObjectKey`'i olmayan, yalnız `fileUrl` taşıyan eski satırlar artık linklenmiyor. İndirme rotası da yalnız `r2ObjectKey` kabul ediyor. se-fb §2.6'ya göre yerelde bu tür satır 0. Prod sayımı bilinmiyor.
- **Genel kova:** Prod'da kova genel erişime açıksa, eski URL'yi bilen biri dosyayı okumaya devam eder. Kod artık URL üretmiyor ve yaymıyor, ama kovanın **kapatılması** bir altyapı işi.
- **25 MB sınırı** eski 100 MB etiketinden düşük. 25 MB'tan büyük gerçek belgeler reddedilir.
- **Confirm yolu:** R2'ye her confirm'de 2 istek (HEAD ve ranged GET) gidiyor.
- **docx/xlsx:** magic yalnız ZIP başlığını doğruluyor. Keyfi bir ZIP `.docx` adıyla geçebilir. Bu tür `attachment` olarak indirildiği için tarayıcıda çalıştırılmaz.
- **İmza yeri:** R2'nin `content-length` imzasını MinIO gibi uyguladığını varsayıyorum. Gerçek R2'ye karşı koşulmadı.

## 5. Açık sorular
- **Gerçek tarayıcı e2e'si koşulamadı.** `tests/e2e/evidence-fabrication.spec.ts` ve `evidence-unverified-badge.spec.ts` specleri UI'dan gerçek yükleme yapıyor ve yeni dev yükleme rotasından geçiyor. AgentSpace kill-guard `[R8-canli-app-varken-acilis]` bu koşuyu engelledi: canlı uygulama açıkken Murat'ın onayı gerekiyor. Onay gelirse şu komutla koşulabilir: `MURAT_LIVE_OK=1 E2E_PORT=3471 DATABASE_URL=<izole> npx playwright test tests/e2e/evidence-*.spec.ts`. Kod yolu MinIO testindeki confirm yoluyla aynı; farkı yalnız dev deposu.
- Dev yükleme rotasının red yolları (415, 413 ve başka kiracının anahtarı için 403) için ayrı bir otomatik test yazılmadı. Kurallar `evidenceUploadType` ve `tenantObjectKeyOf` ile ortak ve bunlar MinIO suite'inde sınanıyor.
- Prod'da `R2_PUBLIC_HOST` ayarlı mı ve kova genel mi? (se-fb ve devop-fb'nin sorusu, hâlâ açık)
- 25 MB ürün açısından uygun mu?

## 6. Sonraki adım
- İnceleme (başka ajan).
- Onay gelirse e2e koşusu.
- ci.yml'e MinIO servisi ekleyen ayrı bir kart.
- Prod kovasının genel erişime kapatıldığının doğrulanması (devop).
- B-4'ün kalan kısmı: confirm'de DB hatasında `success:true` dönmesi. Kapsam dışı, dokunulmadı.
