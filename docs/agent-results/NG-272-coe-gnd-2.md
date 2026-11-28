# NG-272 — fix456 (PR #456 inceleme düzeltmeleri B-1..B-3) — coe-gnd

**Hüküm: KISMEN.** Kod ve birim testleri tamam, yerelde commit edildi (`83cde3ee`). Push YAPILMADI: pre-push kapısı, PR ile ilgisiz tek bir testte (`tests/storage-dev-delete.test.ts`, NG-369) kırmızı kaldı. PR 456 draft olarak kaldı; merge/ready yapılmadı.

**Platform beyanı:** Windows 11 Pro + WSL Ubuntu-24.04 üzerinde koşuldu. macOS'ta koşulmadı. Değişen kod saf TypeScript; platforma özgü bir davranış eklenmedi.

**Kart/brif çelişkisi:** Kart açıklaması (get_task) API anahtarı kapısını anlatıyor ve bu özellik zaten `d21778ee`'de. Brif ise bu turda inceleme düzeltmelerini (B-1..B-3) istiyor. Brif görev olarak uygulandı; B-4 kapsam dışı bırakıldı ve dokunulmadı.

## Ne yapıldı

- **B-1:** `SYSTEM_ROLE` string `"SYSTEM"` yerine `unique symbol` oldu (`src/lib/rbac.ts`). Sahte string rolü artık sistem yetkisi vermiyor. Test önce eski koda karşı kırmızı görüldü: `tests/rbac-system-role.test.ts`, eski kodda 3 başarısız, yeni kodda 6/6 yeşil.
- **B-2:** `PARTNER_API_MODULE` dışa aktarıldı; `NG_KEY_ROUTES` her özelliğin `NG_FEATURE_MODULE` karşılığının tanımsız ya da `PARTNER_API_MODULE` olduğunu doğrular (`tests/api/api-key-ng-gate-call.test.ts`).
- **B-3:** `authenticateApiKey` içinde `ngFeatureGate` çağrısı doğrulandı (3 test + 403 testi). Mutant `if (false && ng)` ile 2 test kırmızı oldu; mutant geri alındıktan sonra 4/4 yeşil.

## Kanıt (ham çıktı)

Lint + typecheck (commit'in pre-commit kapısı, staged kapsamı):
```
→ eslint (staged files)
→ tsc --noEmit (proje geneli, yalnız staged dosyalar bloke eder)
✓ Kapı temiz (staged kapsamı).
[detached HEAD 83cde3ee] fix(rbac): SYSTEM_ROLE is a symbol; key gate has direct guards (NG-272 review B-1..B-3)
 4 files changed, 160 insertions(+), 3 deletions(-)
```

İzole tam kapı (`pnpm gate:isolated git push origin HEAD:task/ng-272`, 2 koşu):
```
 Test Files  1 failed | 632 passed | 2 skipped (635)
      Tests  1 failed | 9091 passed | 68 skipped (9160)
 FAIL tests/storage-dev-delete.test.ts > deleteObjectBytes, dev store (NG-369 Ö5) > an object that is not there is removed: true
AssertionError: expected false to be true
error: failed to push some refs to 'https://github.com/yaslan/nexagrant.git'
```
İki koşuda da aynı tek test düştü; push pre-push kapısında reddedildi.

Testin tek başına koşusu (kapı ortamı olmadan): `2 passed`.

Yeniden üretme (R2 değişkenleri ayarlı):
```
R2_ACCOUNT_ID=gate-test R2_ENDPOINT=http://127.0.0.1:9 vitest run tests/storage-dev-delete.test.ts
 Tests  1 failed | 1 passed (2)
 FAIL ... an object that is not there is removed: true
```

Kök neden: `src/lib/storage.ts` içindeki `s3` istemcisi modül yüklenirken `process.env.R2_ACCOUNT_ID`'ye bakılarak seçiliyor. Test ise `env`'i `{}` ile taklit ediyor ama `process.env`'i temizlemiyor; kendi yorumu da "Dev store only (no R2 account)" diyor. İzole kapı CI'nin R2 test değerlerini (MinIO) verdiği için test R2 yoluna düşüyor. Test, NG-369 commit'i `6392afef`'te eklendi; bu commit `d21778ee`'nin atasıdır. Benim commit'im storage'a dokunmuyor (`git diff --stat` boş).

PR 456 CI (önceki head `d21778ee`, run 45901675319): `build-and-test` pass, `cordis-worker` pass, `e2e (1..3)` pass, `e2e-gate` pass, `i18n-audit` pass, `lighthouse-a11y` pass.

## Değişen dosyalar (commit `83cde3ee`)

- `src/lib/rbac.ts` (B-1)
- `src/lib/api-auth.ts` (B-2: `PARTNER_API_MODULE` export)
- `tests/rbac-system-role.test.ts` (yeni)
- `tests/api/api-key-ng-gate-call.test.ts` (yeni; B-2 + B-3)
- `docs/agent-results/NG-272-coe-gnd-2.md` (bu dosya)

Ayrıca worktree'de `scripts/git-core-bare.sh` CRLF→LF (indeksle hizalama; pre-commit kancası CRLF yüzünden hata veriyordu). Bu commit'te değil; içerik farkı yok.

## Riskler

- Push yapılmadı: PR 456 uzak dalında hâlâ `d21778ee`; yerel `83cde3ee` ayrı.
- Yerel izole kapı, CI'den farklı env ile kırmızı kalıyor (storage testi). CI yeşil; ama push'u kapı kuralına göre engelleyen yerel kırmızılık bu.
- Worktree'de yanlışlıkla 5611 dosyanın EOL'ünü değiştirdim (betik hatası). Geri alındı; `git status` yalnızca 45 symlink `T` kaydı + bu commit'in dosyaları. Ana checkout (`FONBRIDGE-dev`) etkilenmedi.
- B-4 (kapsam dışı) dokunulmadı.

## Açık sorular

1. `tests/storage-dev-delete.test.ts` testi `process.env` R2 değişkenlerini temizlemeli mi (NG-369 sahibinin kararı)? Önerim: test başında `vi.stubEnv('R2_ACCOUNT_ID', '')` ya da modülü `process.env` olmadan yükleyen bir fixture. Bu NG-369 testi olduğu için bu turda değiştirmedim.
2. Bu düzeltme onaylanırsa push yapılıp kapı yeniden koşulabilir.

## Sonraki adım

- Patron/lider onayı: storage testi için yukarıdaki düzeltme (NG-369 sahibi ya da bu iş) → ardından `pnpm gate:isolated git push origin HEAD:task/ng-272` → `gh pr checks 456`.
- PR draft kalacak; merge/ready yapılmayacak.
