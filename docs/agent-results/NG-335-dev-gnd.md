---
hüküm: Kısmen bitti: .gitattributes + CLAUDE.md kuralı yapıldı, lint/typecheck/tam kapı ve CI yeşil; ancak kartın ZORUNLU Windows tarafı ham `git diff --stat` karşılaştırması yapılamadı (worktree gitdir'i Windows git'ten okunamıyor; önce birleşme gerekiyor).
tip: feature
platform: Windows 11 + WSL2 Ubuntu-24.04 (mac/Linux'ta koşulmadı; git işlemleri WSL içinden yapıldı)
---

# NG-335 — Taşıma-1: `.gitattributes` (LF) + "git yalnız WSL içinden" kuralı

PR: https://github.com/yaslan/nexagrant/pull/415 (draft, base `dev`, head `task/ng-335`, commit `d872f341`)

## Ne yapıldı
1. `.gitattributes` (yeni): `* text=auto eol=lf`, `*.sh` ve `githooks/*` LF, `png jpg webp pdf dump zip` binary. İndekste CRLF/karışık satır sonu taşıyan 26 izli dosya (`.ics`, `.csv`, evidence logları, 2 HTML fixture) `-text` ile pinlendi; LF'e çevrilseydi içerik değişirdi (`.ics` RFC 5545 gereği CRLF).
2. `CLAUDE.md`: dosya sonuna yeni bölüm "Git ortamı (WSL)". Mevcut "Komutlar" bölümüne dokunulmadı (NG-331 ile çakışma yok).
3. Taban commit'ten (`9e452d13`) `task/ng-335` worktree'si: `/home/aslan/alan/wt/ng-335`.

## Kanıt (ham çıktı)

Satır sonu istatistiği (indeks, değişiklik öncesi):
```
i/crlf  6   i/mixed 20   i/lf 5632   i/-text 1624   i/none 10   symlink 45   exec 77
```

Renormalize (`git add --renormalize .`): içerik değişikliği **0**. Yalnız `.gitattributes` ve `CLAUDE.md` staged.

Öznitelik çözümü (`git check-attr`):
```
githooks/pre-push: eol: lf   text: set
docs/beta/beta-weekly-sync.ics: text: unset
a.png: binary: set
```

LF zorlaması (`git hash-object --path=…`, CRLF girdi vs LF girdi):
```
test.sh            same=yes  (422c2b7a…)
githooks/pre-push  same=yes
beta-weekly-sync.ics (-text) same=no   (beklenen)
```

Exec bit korundu: `githooks/pre-push`, `scripts/gate-isolated.sh` → `100755`.

Kalite kapıları:
```
pnpm db:generate  rc=0
pnpm lint         rc=0
pnpm typecheck    rc=0   (db:generate'den sonra; öncesi rc=2 — generate eksikti)
```

Pre-push tam kapı (izole DB `fabrika_test_ng335`, `E2E_PORT=3110`), son koşu:
```
test: 610 dosya / 8615 test geçti (75 skipped)
git push → To https://github.com/yaslan/nexagrant.git  * [new branch] task/ng-335 -> task/ng-335
git ls-remote origin refs/heads/task/ng-335 → d872f3418167643c27fc2cd8a7835b5fdb879b52 (yerel HEAD ile aynı)
```

CI (PR #415, `gh pr checks 415`, WSL içinden):
```
build-and-test  pass  9m9s
cordis-worker   pass  31s
e2e (1)         pass  17m45s
e2e (2)         pass  24m35s
e2e (3)         pass  22m16s
e2e-gate        pass  3s
```

Kapı-kırmızı denemeleri (kayıt): ilk pre-push koşusunda `tests/jobs-enqueue-force.live` ve `tests/public-lead-stuck.live` kırmızıydı; sebep DB adının koruma kuralına uymamasıydı (`ng335` → `fabrika_test_ng335`). Yeni adla iki test 15/15 geçti. Push bu kırmızılarda reddedildi (uzak dal yok, doğru davranış).

## Değişen dosyalar
- `.gitattributes` (yeni)
- `CLAUDE.md` (+5 satır, dosya sonu)
- `docs/agent-results/NG-335-dev-gnd.md` (bu rapor)

## Riskler
- `-text` listesi 26 dosyayı kapsıyor; yeni CRLF dosyası eklenirse `.gitattributes`'a elle eklenmeli (CLAUDE.md'de not var).
- Windows tarafı doğrulaması yapılmadı (aşağıda).

## Açık sorular / eksikler
1. **Windows ham `git diff --stat` önce/sonra karşılaştırması yapılmadı.** Worktree'nin `.git` dosyası WSL yolu gösterdiği için Windows git bu worktree'yi okuyamıyor. Bu kanıt, PR birleşip ana checkout'ta `.gitattributes` olduğunda alınabilir.
2. **Bağımlılık:** kart "NG-331 önce bitmeli" diyor. NG-331 (PR #414) henüz birleşmedi ve kendi raporunda "kısmen bitti" (paylaşımlı mailpit). Bu PR CLAUDE.md'ye yalnız dosya sonuna ekleme yaptığı için çakışma riski düşük; birleşme sırası lidere bırakıldı.
3. CLAUDE.md "Worktree'de gate" tarifindeki `DB=<is>` yazımı yetersiz: DB adı `fabrika_test_ng<sayı>` olmalı (`jobs-enqueue-force.live` koruması). Tarif düzeltmesi önerilir; bu PR'da yapılmadı (kapsam dışı).

## Sonraki adım
- Lider: PR #415 birleşme sırası (NG-331 sonrası önerilir).
- Birleşme sonrası: ana checkout'ta Windows git ile `git diff --stat` ve satır sonu uyarılarının azaldığını kaydet.
- Taşıma-2 (symlink/betik yolu) NG-336/qa-gnd kapsamında; bu kartta dokunulmadı.
