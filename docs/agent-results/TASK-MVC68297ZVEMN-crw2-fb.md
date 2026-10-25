---
gorev: TASK-MVC68297ZVEMN
kod: FO-43
ajan: crw2-fb
tip: bug (repo hijyeni)
hukum: BASARILI — PR #89 dev'e açık, merge edilmedi
platform: mac (darwin, Python 3.9.6 sistem; python3.12 yok)
tarih: 2026-10-17
---

# FO-43 — Dev'de izlenen .venv/ kaldırıldı, .gitignore eklendi

## Ne yapıldı
- **Kaynak commit:** `c915bc43` (2026-09-06, Yasin ASLAN, "feat(security): complete RLS validation CI check and E2E test framework"). Bu commit 6038 dosyaya dokunmuş. `.venv/`'yi ekleyen tek commit bu: `git log origin/dev --diff-filter=A -- .venv` başka commit göstermiyor.
- `origin/dev` üstünden yeni dal açıldı: `crw2-fb/fo43-untrack-venv`. Ardından `git rm -r --cached .venv` koşuldu ve 5659 dosya indeksten çıktı.
- `.gitignore` dosyasına `.venv/` ve `venv/` eklendi; nedenini anlatan yorum da var.
- `workers/README.md` içindeki "Yerel çalıştırma" bölümü artık venv'in yerelde nasıl kurulacağını anlatıyor: `python3.12 -m venv .venv`, Windows için activate satırı, `requirements-dev.txt` kurulumu, isteğe bağlı pytest, bozulursa silip yeniden kurma.
- Commit `640d9b47` normal push ile gönderildi (pre-push → tam `pnpm gate`, `--no-verify` yok). **PR #89 → dev:** https://github.com/yaslan/fonbridge/pull/89 (MERGE EDİLMEDİ).

## Kanıt (ham çıktı)
```
$ git ls-tree -r --name-only origin/dev .venv | wc -l
    5659
$ git log origin/dev --diff-filter=A --format='%h %ad %an %s' --date=short -- .venv
c915bc43 2026-09-06 Yasin ASLAN feat(security): complete RLS validation CI check and E2E test framework

# dalda, commit sonrası
$ git ls-files .venv | wc -l
       0
$ git check-ignore -v .venv/pyvenv.cfg
.gitignore:124:.venv/	.venv/pyvenv.cfg
$ git show --stat HEAD | tail -1
 5661 files changed, 19 insertions(+), 1776010 deletions(-)
# yeni yerel .venv oluşturulduktan sonra izlenmeyen dosya:
$ git status --short --untracked-files=all | grep -c '^?? .venv'
0
```

Kod referans taraması: `git grep -i venv origin/dev -- package.json src scripts workers .github githooks Dockerfile* docker-compose*` boş döndü. `.venv`'yi kullanan kod, script, CI ya da imaj yok. `.dockerignore` onu zaten dışarıda bırakıyordu.

Eski `.venv`'nin işe yaramadığının kanıtı: depodaki venv Python 3.9'du. Sistem 3.9 ile `pip install -r workers/cordis/requirements-dev.txt` şu hatayı veriyor:
```
ERROR: No matching distribution found for fastapi==0.143.3
```
Sabitlenmiş bağımlılıklar ≥3.10 istiyor; README'deki `python3.12` doğru seçim.

Pre-push gate (`E2E_PORT=3150`, DB `localhost:5433`, çünkü 3000 başka bir süreçteydi):
```
eslint            ✖ 4 problems (0 errors, 4 warnings)
tsc --noEmit      temiz
vitest            Test Files 347 passed | 7 skipped (354) · Tests 4547 passed | 120 skipped
i18n:check        ✅ passed
rls:check         ✅ All 47 tenant-scoped models have RLS policies registered.
rls:bypass-check  ✅ no new tenant bypass
rls:verify        ✅ 47 kiracıya özel tabloda ... izolasyon fabrika_app rolüyle GERÇEKTEN ölçüldü
playwright        332 passed | 8 skipped (16.4m)
alerts:check      ✅ Öksüz alarm yok
push              * [new branch] crw2-fb/fo43-untrack-venv -> crw2-fb/fo43-untrack-venv
```

## Değişen dosyalar
- `.gitignore` (+6)
- `workers/README.md` (+13/−1)
- `.venv/**` (5659 dosya, yalnız indeksten çıktı)

## Riskler
- **Pull eden checkout'ta `.venv` silinir.** Git, izlenen dosyayı kaldıran bir commit'i çektiğinde o dosyaları çalışma ağacından da siler. Ana checkout'ta (`/Users/macbook/alan/FONBRIDGE`) ya da başka worktree'lerde `.venv` kullanan biri varsa, merge sonrası venv'i README'deki adımlarla yeniden kurmalı. O venv zaten py3.9'du ve pinli bağımlılıkları kuramıyordu, yani kayıp pratikte yok.
- Git geçmişi küçülmedi: 1.77 M satır `c915bc43`'te duruyor. Klon boyutunu düşürmek history rewrite (filter-repo) gerektirir; bu kapsam dışı ve geri alınamaz, yapılmadı.
- Python 3.12 bu makinede yok. README'deki `python3.12 -m venv` adımı burada uçtan uca koşulamadı. Venv oluşturma ve ignore davranışı 3.9 ile doğrulandı.

## Açık sorular
- History'den temizleme (filter-repo + force push) istenir mi? Geri alınamaz, tüm klonları etkiler, patron kararı gerekir.

## Sonraki adım
- PR #89'un incelenip dev'e merge edilmesi (crw2-fb merge etmedi). Merge sonrası venv kullanan ajanlar `.venv`'yi yeniden kurmalı.

## Platform beyanı
- **Doğrulanan:** mac (darwin). Gate, venv oluşturma ve ignore kontrolü burada koşuldu.
- **Windows / Linux:** koşulamadı, çünkü elde yalnız bu mac var. Değişiklik platformdan bağımsız: `.gitignore` deseni her yerde aynı çalışır. README Windows için `.venv\Scripts\activate` satırını ayrıca veriyor. Silinen venv yalnız darwin ikilileri içeriyordu (`_duckdb.cpython-39-darwin.so`), yani Windows ve Linux'ta zaten hiç çalışmıyordu.
