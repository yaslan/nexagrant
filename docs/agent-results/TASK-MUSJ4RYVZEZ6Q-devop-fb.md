---
sözleşme: 3
görev: TASK-MUSJ4RYVZEZ6Q
kod: TASK-MUSJ4RYVZEZ6Q
ajan: devop-fb
motor: claude
tip: yayın
okur: ekip
hüküm: Bitti: PR #17 (fb/minio-ci) MinIO'yu CI'a ekliyor; PR #18 (CSP R2_ENDPOINT) ile birlikte evidence spec'leri dev (219/0) ve start modunda yeşil, R2_ENDPOINT boş mutantı yalnız o iki spec'i kırmızı yapıyor — merge sırası önce #18 sonra #17, inceleme onayı bekliyor.
platform: Linux CI (GitHub Actions ubuntu-latest, Docker) — tüm kanıtlar oradan. Yerel doğrulama (imaj çekme, bucket adımı, storage.ts presign→PUT→copy, CORS preflight) macOS Docker 29.7.2'de önceki oturumda yapıldı. Windows koşulamadı: ci.yml yalnız ubuntu runner'da çalışır, docs/DEVOPS-MINIO-SETUP.md komutları docker/aws CLI'dır ve Windows'ta WSL/Docker Desktop ile aynıdır, platform-bağımlı yol yok.
sürüm: 2
tarih: 2026-10-03T16:51:58.462Z
---

# FB CI: MinIO test object store — evidence upload zinciri CI'da dev + start modunda gerçek depoya karşı yeşil, mutant kırmızı

## 1. Ne yapıldı
- PR #17 (`fb/minio-ci`, base `dev`, rebase `da3491a7`) — yalnız `.github/workflows/ci.yml` + `docs/DEVOPS-MINIO-SETUP.md`; `src/` dokunulmadı.
  - `Start MinIO (test object store)` adımı: Chainguard MinIO imajı **digest ile sabit** (`cgr.dev/chainguard/minio@sha256:4cf4831a2bbcf13ddca09c1cbcc9faff716dd3c4247e0babc32864b8ee8e0034`, MinIO RELEASE.2026-09-22). MinIO'nun kendi kanalları kapalı (Docker Hub `minio/minio` 404, `dl.min.io` 410, 03.10.2026); PR'ın ilk iki koşusu bu yüzden kırmızıydı.
  - `docker run`, `services:` değil: imajın varsayılan komutu yok, servis container'ına `server /data` verilemiyor. Health bekleme ≤30 sn, bucket head-or-create (idempotent; gerçek hata yutulmaz, `docker logs` basılır).
  - `R2_*` yalnız E2E adımında (`R2_ACCOUNT_ID=ci-minio`, `R2_ENDPOINT=http://localhost:9000`, `R2_ACCESS_KEY_ID`/`R2_SECRET_ACCESS_KEY=minioadmin`, `R2_BUCKET=test-evidence`) — job genelinde olsaydı vitest suite'leri de `storage.ts` üzerinden S3'e geçerdi. Değerler test-only; gerçek R2 sırrı yok. Hem push/PR (dev) hem `workflow_dispatch e2e_server=start` yolunda aynı adım çalışır.
  - `timeout-minutes: 120`: faz 0'daki start koşusu 99 dk; GitHub varsayılanı 360. 120 ≈ %20 pay bırakır, asılı koşuyu 4 saat erken keser.
  - Yerel kullanım: `docs/DEVOPS-MINIO-SETUP.md` (docker run + env + durdurma).
- Bu oturumda: dal `origin/dev` üzerine rebase edilip `--force-with-lease` ile pushlandı. CSP bağımlılığı (PR #18 `befb/csp-r2-endpoint` 8d57a077, TASK-MUSJHQI1EMZQ5) ile birleşik **kanıt dalı** `devop-fb/minio-csp-proof` (c6ae11ee) ve `R2_ENDPOINT: ''` **mutant dalı** `devop-fb/minio-csp-mutant` pushlanıp `workflow_dispatch` ile koşturuldu. İkisi de atılabilir; PR #17'ye ürün kodu girmedi.

## 2. Kanıt (CI loglarından kopya)
### 2a. MinIO ayağa kalkıyor + bucket — her koşuda aynı (37132929193, 37135095710, 37135097509, 37135099278)
```
Status: Downloaded newer image for cgr.dev/chainguard/minio@sha256:4cf4831a2bbcf13ddca09c1cbcc9faff716dd3c4247e0babc32864b8ee8e0034
MinIO up after 2s
bucket test-evidence ready
```
### 2b. PR dalı tek başına (CSP düzeltmesi yok) — 37132929193, dev modu ❌
```
  2 failed
    [chromium] › tests/e2e/evidence-fabrication.spec.ts:43:5 › an upload with no readable metadata does not gain invented metadata
    [chromium] › tests/e2e/evidence-unverified-badge.spec.ts:89:5 › a fresh upload is recorded as unverified, not valid
  2 skipped
  217 passed (19.9m)
```
Neden: tarayıcının `http://localhost:9000` PUT'u CSP `connect-src` tarafından kesiliyor → PR #18.
### 2c. Kanıt dalı (#17 + #18), dev modu — 37135095710 ✅ (15:57→16:25 UTC, 28 dk)
```
  2 skipped
  219 passed (18.2m)
  ✓   53 [chromium] › tests/e2e/evidence-fabrication.spec.ts:44:5 › an upload with no readable metadata does not gain invented metadata (7.5s)
  ✓   55 [chromium] › tests/e2e/evidence-unverified-badge.spec.ts:99:5 › a fresh upload is recorded as unverified, not valid (4.3s)
```
### 2d. Kanıt dalı, `workflow_dispatch e2e_server=start` — 37135097509 (15:57→16:49 UTC, 52 dk)
```
  ✓   53 [chromium] › tests/e2e/evidence-fabrication.spec.ts:44:5 › an upload with no readable metadata does not gain invented metadata (2.3s)
  ✓   54 [chromium] › tests/e2e/evidence-unverified-badge.spec.ts:77:5 › a document nothing has verified is not shown as verified (877ms)
  ✓   55 [chromium] › tests/e2e/evidence-unverified-badge.spec.ts:99:5 › a fresh upload is recorded as unverified, not valid (1.2s)
  36 failed
  5 skipped
  6 did not run
  174 passed (43.7m)
```
İki hedef spec start modunda **yeşil**. 36 kırmızı, kartın öngördüğü demo-giriş spec'leri (TASK-MUSBCXP9RKS3D kapsamı, bu PR'dan bağımsız): calls-sedia-status 6, m6-evaluator 4, m9-brief-generate-failure 3, partb-template-identity 2, notfound-status 2, module-gate 2, m9-briefs-form 2, m9-brief-persistence 2, identity-strings 2, gate-settings-readonly 2, saved-search/relationship-tenant-isolation/pipeline-note-author/opportunity-archive/m9-ics-download/gate-tenant-isolation/e2e-profile-save/concept-template-tenant-isolation/auth 1'er. Hiçbiri evidence-* değil.
### 2e. Mutant (`R2_ENDPOINT: ''`), dev modu — 37135099278 ❌ (beklenen)
```
  2 failed
    [chromium] › tests/e2e/evidence-fabrication.spec.ts:44:5 › an upload with no readable metadata does not gain invented metadata
    [chromium] › tests/e2e/evidence-unverified-badge.spec.ts:99:5 › a fresh upload is recorded as unverified, not valid
  2 skipped
  217 passed (18.3m)
[WebServer] [WARN] csp violation {"directive":"connect-src","blocked":"https://test-evidence.ci-minio.r2.cloudflarestorage.com","page":"/tr/ev-badge-e2e/evidence","disposition":"enforce"}
```
Endpoint boşalınca presign gerçek R2 adresine gidiyor, yükleme olmuyor, **yalnız** iki evidence spec'i kırmızı → spec'ler gerçekten MinIO'ya bağlı, sahte yeşil yok.
### 2f. PR #18 CI
`befb/csp-r2-endpoint` 8d57a077 build-and-test 37134534354 **success**. `Accessibility Check` kırmızı — ama o workflow'un son 8 koşusunun hepsi kırmızı, merge edilmiş #13/#14/#15 dalları dahil: PR #18'e özgü değil, taban sorunu.

## 3. Değişen dosyalar
PR #17: `.github/workflows/ci.yml` (+43/−1), `docs/DEVOPS-MINIO-SETUP.md` (+44). Atılabilir dallar: `devop-fb/minio-csp-proof` (= #17 + #18 merge), `devop-fb/minio-csp-mutant` (= proof + `R2_ENDPOINT: ''`). Bu rapor.

## 4. Riskler
- **Merge sırası:** #17 tek başına dev'e girerse dev CI'ı 2 spec kırmızı olur (2b). Önce #18.
- Chainguard imaj digest'i sabit; MinIO'nun kendi dağıtım kanalları kapandığı için gelecekte digest'i bilinçli bump etmek gerekir (`:latest` yok).
- Start koşusu kanıt dalında 52 dk sürdü (faz 0: 99 dk); `timeout-minutes: 120` yeterli, ama makine yavaşlarsa 120 dk'ya yaklaşabilir — o zaman kesmek yanlış alarm verir, değer gözlenmeli.
- be-fb §5'in notu: aynı MinIO ile CI'da atlanan 2 live vitest dosyası (`live-skip-gate`) da açılabilir; kapsam dışı bırakıldı, ayrı kart.

## 5. Açık sorular
- crw-fb/crw2-fb inceleme onayı (DoD maddesi) — bekliyor.
- Atılabilir `devop-fb/minio-csp-*` dalları #17 merge edilince silinebilir.

## 6. Sonraki adım
1. PR #18 merge (be-fb/lider). 2. PR #17 rebase + merge. 3. Merge sonrası dev'de bir `workflow_dispatch e2e_server=start` koşusu ile 2d'yi dev üzerinde tekrarla. 4. Kanıt dallarını sil.

## Geri alma
PR #17 revert = ci.yml'den `timeout-minutes` ve `Start MinIO` adımı + E2E adımındaki `R2_*` satırları; ürün koduna dokunmadığı için uygulamada etkisi yok.
