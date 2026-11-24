---
hüküm: BAŞARILI (tamamlanma kanıtı; ilk raporun "açık kalan" maddesini kapatır)
tip: bug (CI kapsam açığı)
platform: GitHub Actions Linux runner (ubuntu-latest); yerel gate WSL2 Ubuntu 24.04. Kod platformdan bağımsız.
---

# NG-353 — Tamamlanma kanıtı (coe-gnd, ek 2)

**Ana rapor:** `docs/agent-results/NG-353-coe-gnd.md` · **Draft PR:** https://github.com/yaslan/nexagrant/pull/434 (base `dev`) · **Dal başı:** `ceb80230` (sonuç dosyası commit'i), kod commit'i `6a59815a`

## Ne eklendi
Ana raporda #435 (yığılı test PR'ı) için `build-and-test` "pending" olarak kalmıştı. Bu ek, yığılı-tabanlı koşuyu tamamlanmış hâliyle ve #434 üzerindeki tam CI'ı kanıtlar.

## Kanıt (ham çıktı)

### `gh run view 45357356990` (`task/ng-353` tabanlı PR #434'ün `6a59815a` koşusu, tetikleyici `pull_request`)
```
$ gh run list --branch task/ng-353 --limit 3
completed  success  ci: run full CI on PRs stacked on task/**, se-fb/**, be-fb/** (NG-353)  CI  task/ng-353  pull_request  45357356990  33m22s  2026-11-24T08:34:49Z
$ gh run view 45357356990 --json jobs
build-and-test   success
cordis-worker    success
e2e (1)          success
e2e (2)          success
e2e (3)          success
e2e-gate         success
```

### Dal başı (`ceb80230`) için koşu
`git push` ile tetiklenen `45365272757` koşusu push anında hâlâ `pending` idi; bu rapor yazılırken sonucu bilinmiyor. Sonucu `gh pr checks 434` ile sonradan doğrulanmalı.

```
$ gh pr checks 434
build-and-test  pending  https://github.com/yaslan/nexagrant/actions/runs/45365272757/job/138345248329
cordis-worker   pending  https://github.com/yaslan/nexagrant/actions/runs/45365272757/job/138345248774
```

### Dal ve PR durumu
```
$ git ls-remote origin task/ng-353
ceb80230b6024f864f987ad41f1bde8b8f54d596  refs/heads/task/ng-353
$ gh pr view 434 --json isDraft,baseRefName,state
{"baseRefName":"dev","headRefOid":"ceb80230b6024f864f987ad41f1bde8b8f54d596","isDraft":true,"state":"OPEN"}
```

## Değişen dosyalar
- `docs/agent-results/NG-353-coe-gnd-2.md` (bu dosya)

## Riskler
- `ceb80230` koşusunun sonucu bu raporda yok (yukarıda pending).
- Ana raporda işaretlenen `be-fb/**` ve `actionlint` açıkları hâlâ açık.

## Açık sorular
- `be-fb/**` kalıbı gerekli mi? Açık PR tabanlarına bakılmalı.

## Sonraki adım
Patron/lider: #434 hazır olunca ready-for-review ve merge kararı. Bu işte merge yok.
