---
hüküm: BAŞARILI (kısmi: kanıt PR'ında build-and-test tetiklenmesi kanıtlandı; tamamlanma sonucu kapatmadan önce henüz bitmedi)
tip: bug (CI kapsam açığı)
platform: GitHub Actions Linux runner (ubuntu-latest); yerel gate WSL2 Ubuntu 24.04 üzerinde koştu. Kod platformdan bağımsız (yalnız YAML tetikleyici + dokümantasyon satırı).
---

# NG-353 — Yığılı (stacked) PR'larda tam CI koşsun (coe-gnd)

**Kart:** TASK-MWUCNNW79W2N6 · **Dal:** `task/ng-353` (taban `origin/dev`) · **Commit:** `6a59815a0ba271c0807acf7cb05bcb592bbba62a` · **Draft PR:** https://github.com/yaslan/nexagrant/pull/434 (base `dev`, merge yok)

## Ne yapıldı
1. `.github/workflows/ci.yml` → `on.pull_request.branches`: `["main", "dev", "task/**", "se-fb/**", "be-fb/**"]`. `push` tetikleyicisi `main`/`dev`'de kaldı; bir commit bir kez koşar (push'ta değil, PR'da). `concurrency` eklenmedi, çünkü çift koşu zaten olmuyor.
2. `docs/RELEASE_CHECKLIST.md`: yığılı PR'da tam CI'ın otomatik koştuğunu belirten bir satır.
3. Diğer iş akışları (`i18n-check.yml`, `a11y-check.yml`, `check-rls.yml`) değiştirilmedi.
4. Kanıt PR'ı: `ng-353-ci-probe` dalı `task/ng-353` üstüne boş bir commit ile açıldı, PR #435 base `task/ng-353`. Kanıt alındıktan sonra PR kapatıldı, uzak ve yerel dal silindi, eski uzak-izleme referansı temizlendi.

## Kanıt (ham çıktı)

### Pre-push gate (`task/ng-353`, `E2E_PORT=3152`, izole DB `fabrika_test_ng353`)
```
$ git push -u origin task/ng-353   (rc=0, push.rc)
...
  715 passed (30.0m)
$ NODE_ENV=${NODE_ENV:-test} tsx scripts/check-orphan-alerts.ts
açık SystemAlert satırı            : 7
  tenant'ı SİLİNMİŞ (öksüz)         : 0
✅ Öksüz alarm yok ...
To https://github.com/yaslan/nexagrant.git
 * [new branch]        task/ng-353 -> task/ng-353
```
Uzak doğrulama: `git ls-remote origin task/ng-353` → `6a59815a0ba271c0807acf7cb05bcb592bbba62a refs/heads/task/ng-353` (yerel HEAD ile aynı).
Gate kilidi: ng-351'in `pnpm run gate:core` süreci bitene kadar bekledi (pid 3769580); bekleme sırasında `--no-verify` kullanılmadı.

### Yığılı PR'da `build-and-test` tetiklenmesi (#435, base `task/ng-353`)
`docs/agent-results/...` içindeki log: `/home/aslan/alan/wt/ng353-logs/pr-checks-evidence.txt`
```
## gh pr view 435
{"baseRefName":"task/ng-353","headRefName":"ng-353-ci-probe","isDraft":true,"number":435,"state":"OPEN",...}
## gh pr checks 435
build-and-test	pending	0	https://github.com/yaslan/nexagrant/actions/runs/45357396442/job/138318522944
cordis-worker	pending	0	https://github.com/yaslan/nexagrant/actions/runs/45357396442/job/138318523460
## gh run list
in_progress  test: CI probe stacked on task/ng-353 ...  CI  ng-353-ci-probe  pull_request  45357396442
in_progress  ci: run full CI on PRs stacked on task/**, ... (NG-353)  CI  task/ng-353  pull_request  45357356990
```
Yorum: `task/ng-353` tabanlı PR'da `pull_request` olayı CI'ı kendiliğinden başlattı (eskiden yalnız main/dev tabanlı PR'larda koşardı). Kanıt alındıktan sonra PR #435 kapatıldı: `✓ Closed pull request yaslan/nexagrant#435`, `✓ Deleted branch ng-353-ci-probe`.

**Açık kalan:** #435'in `build-and-test` işi kapatma anında `pending`/`in_progress` idi (~30 dk). Tam işin yeşil bitişi bu raporda doğrulanmadı; kapatılan PR'ın koşusu iptal edilecek ya da sonucu okunamayacak. Tamamlanma kanıtı için #434 (dev tabanlı, aynı `ci.yml`) koşusu `45357356990` takip edilmeli.

### Lint/YAML
- `actionlint`: makinede kurulu değil, çalıştırılmadı. Yerine `gh run list` ile workflow'un parse edilip koştuğu kanıtlandı.

## Değişen dosyalar
- `.github/workflows/ci.yml` (`pull_request.branches` + yorum)
- `docs/RELEASE_CHECKLIST.md` (+1 satır)
- `docs/agent-results/NG-353-coe-gnd.md` (bu dosya)

## Riskler
- Yığılı dallar artık tam CI (build-and-test + e2e, ~30 dk) koşturur; `task/**` altındaki her PR'ın runner süresini artırır. Ölçülen kapsam: açık PR tabanları `task/**`, `se-fb/**`, `be-fb/**`.
- `be-fb/**` kalıbı açık PR'lardan ölçülmedi (kart "gerekirse" diyordu); ileride gerekmeyen bir taban açılırsa CI yine koşar, ama gereksiz olabilir.
- Gate'in e2e koşusunda WebServer loglarında `ECONNRESET ... aborted` uyarıları göründü; testlerin tamamı geçti (715 passed), ama bu gürültü ayrıca incelenmeli.

## Açık sorular
- `be-fb/**` gerçekten gerekli mi? Açık PR'ların tabanlarına bakılmalı.

## Sonraki adım
1. #434 `build-and-test` (run `45357356990`) bitince sonucu bu dosyaya ekle (ek dosya: `NG-353-coe-gnd-2.md`, write-once kuralı).
2. #434'ü ready-for-review yapmak ve merge kararı patrona ait; bu işte merge yok.
