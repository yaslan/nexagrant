---
gorev: TASK-MVC68297ZVEMN
kod: FO-43#fix
ajan: crw2-fb
tip: fix (PR #89 inceleme düzeltmesi, doküman)
hukum: TAMAM — crw-fb bulgu #1 ve #2 giderildi; FO-17 ile çakışma kalktı; push edildi, merge edilmedi
platform: mac (darwin) — git merge-tree + pre-push pnpm gate bu makinede koşuldu; Windows/Linux koşulamadı
tarih: 2026-10-17
---

# FO-43 düzeltme — `workers/README.md` kurulumu hash'li kilitten

PR: https://github.com/yaslan/fonbridge/pull/89 · dal `crw2-fb/fo43-untrack-venv` · `640d9b47` → **`dbba2196`** (normal push, force yok, `--no-verify` yok). Merge edilmedi. Git geçmişi temizliği yapılmadı.

## Ne yapıldı
1. "Yerel çalıştırma" bloğu crw-fb'nin önerdiği sıraya çevrildi: `python3.12 -m venv .venv` → `source .venv/bin/activate` → `pip install --require-hashes -r workers/cordis/requirements.lock` → (testler için) `pip install -r workers/cordis/requirements-dev.txt` + `python -m pytest workers/cordis`.
2. Kilit satırı FO-17 (`c03c23c7`) ile **bayt bayt aynı** ve FO-17'nin çalıştırma bloğunun ilk satırı olarak duruyor. Bu yüzden iki dal temiz birleşiyor.
3. `requirements-dev.txt` bu dalda zaten var (FO-17'deki ile aynı içerik: `-r requirements.txt`, `pytest==9.1.1`, `httpx2==2.13.1`). Bu iki dev paketinin kilitte olmadığı ve hash'siz kurulduğu README'de ve PR'da not edildi.
4. PR gövdesi güncellendi: tek satırlık yeniden kurulum komutu (crw-fb bulgu #2), FO-17 ilişkisi, dev-paket boşluğu.

### Önerilen biçimden tek sapma (gerekçeli)
crw-fb'nin önerdiği **tek blok** biçimi FO-17 ile hâlâ çakışıyordu. Bunu ölçtüm (aşağıda). Sebep: bizim satırlar FO-17'nin değiştirdiği satıra bitişik düşüyor. İki ek önlem gerekti:
- venv ve test komutları ayrı bloklarda; kilit satırı FO-17'deki çalıştırma bloğunda, onun yerinde.
- Yeni bloklar `sh` çiti kullanıyor. İkinci bir ` ```bash ` çitiyle git diff, tabandaki değişmemiş çiti bizim ilk çitimizle eşliyor. O zaman hunk'lar yine bitişik düşüyor ve çakışma geri geliyor (aşağıda ölçüldü). `sh` ve `bash` aynı şekilde vurgulanır.

## Kanıt (ham çıktı)
```
# Deneme A — crw-fb'nin tek blok biçimi (commit edilmedi, geçici commit-tree)
$ git merge-tree --write-tree <tmpA> c03c23c7
CONFLICT (content): Merge conflict in workers/README.md

# Deneme B — bölünmüş bloklar, ikisi de ```bash
$ git merge-tree --write-tree <tmpB> c03c23c7
CONFLICT (content): Merge conflict in workers/README.md     exit=1
(çakışma: tabandaki ```bash bizim ilk ```bash'imizle eşlendi)

# Son hâl — commit dbba2196
$ git merge-tree --write-tree dbba2196 c03c23c7
26b755abf3f9a15f27075d756af2825105cec58c                  fo17exit=0
$ git merge-tree --write-tree dbba2196 origin/dev
4fbdcbe76e70c3e927eb232196e4d9ff00baf0c5                  devexit=0
$ git diff --name-status origin/dev...dbba2196 | grep -v '^D	\.venv/'
M	.gitignore
M	workers/README.md
$ git ls-files .venv | wc -l
       0

# Push (pre-push = pnpm gate)
1. deneme: Tests 1 failed | 4546 passed — tests/migration-owner-chain.live.test.ts
   tek başına yeniden koşuldu: Tests 17 passed (17)  → paylaşılan DB yükü altında flake; README değişikliğiyle ilgisi yok
2. deneme: Test Files 347 passed | 7 skipped (354)
           Tests 4547 passed | 120 skipped (4667)
           e2e: 332 passed (13.4m); scripts/check-orphan-alerts.ts koştu
   640d9b47..dbba2196  crw2-fb/fo43-untrack-venv -> crw2-fb/fo43-untrack-venv

$ gh pr view 89 --json headRefOid,state,mergeable
dbba2196276c500750fa53191489bd021b5b7131 OPEN MERGEABLE
```

FO-17 ile birleşmiş README'nin "Yerel çalıştırma" bölümü (merge-tree `26b755ab` çıktısından): FO-17'nin "Yığın" paragrafı + venv bloğu + kilit/uvicorn bloğu + dev/test bloğu sırasıyla. Bölümde tekrar ya da çakışma işareti yok.

## Değişen dosyalar
- `workers/README.md` (commit `dbba2196`, PR #89 dalında)
- PR #89 açıklaması (gh pr edit)
- Bu rapor (FONBRIDGE çalışma ağacında ayrı commit)

## Riskler
- `pytest` ve `httpx2` kilitte değil, hash'siz kuruluyor. FO-17'de de aynı boşluk var. Dev kilidi açmak ayrı bir karar.
- `migration-owner-chain.live.test.ts` tam kapıda bir kez düştü, tek başına geçti. Paralel ajan yükünde flake. Ayrı izlenmeli.
- İki dal da README'ye dokunuyor. Hangisi önce merge edilirse edilsin, öbürü otomatik birleşir (merge-tree ile ölçüldü). Biri önce rebase/squash ile değiştirilirse kontrolü yeniden yapmak gerekir.

## Açık sorular
- Dev paketleri kilide mi eklenecek, yoksa ayrı `requirements-dev.lock` mı açılacak? Karar devop-fb'de.

## Sonraki adım
- crw-fb yeniden incelesin (`dbba2196`). Merge yok.

## Platform beyanı
- **Doğrulanan:** mac (darwin). `git merge-tree`, pre-push `pnpm gate` (vitest + e2e + rls + alerts) bu makinede koşuldu.
- **Windows / Linux:** koşulamadı, bu makine yalnız mac. Değişiklik yalnız Markdown. Windows aktivasyon satırı (`.venv\Scripts\activate`) metin olarak duruyor. `pip --require-hashes` platformdan bağımsız, ama kilitte o platformun 3.12 wheel'i olmalı. Bu kilidin özelliği; bu PR onu değiştirmedi.
- **Python 3.12:** yerelde yok, README komutları uçtan uca koşulamadı.
