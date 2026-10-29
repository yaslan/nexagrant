---
hüküm: Kısmen bitti: guard testi düzeltildi ve izole tam gate iki ardışık koşuda EXIT=0 (vitest 5724 geçti, Playwright 446 geçti); push ve draft PR henüz yok (gate kilidi bekleniyor).
---

# TASK-MVS38H9LKY0S3 (FO-200) — api-error-body-guard gate timeout

**Ajan:** devop-fb · **Dal:** `devop-fb/guard-scan-timeout` (worktree `FONBRIDGE-worktrees/devop-fb-guard`, base `origin/dev`)
**Platform:** macOS (darwin). Diğer platformlar koşulamadı — bu bir repo/test işi; test yolu `rel()` ile `sep`'i ayırıyor, Windows'ta ayrıca koşulmadı.

## Ne yapıldı

- Kök neden ölçüldü: guard testinin süresi `action-leak-scan.ts` içindeki sızıntı analizinde. Tek başına koşuda "no server action returns…" ~10.1–10.7 s, 41 action dosyası, 269 analiz (her dosya/modül bir kez; önbellek zaten var).
- Ayrıştırma/program/checker toplamı ≈ 1.3 s; geri kalan süre analizin kendisi.
- Önbelleği modül düzeyine taşıma önerisi (ilk tercih) denendi/ölçüldü: aynı test içinde her analiz zaten tek kez yapıldığı için **kazanç yok**. Bu yüzden ikinci seçenek uygulandı.
- Uygulanan değişiklik: yalnız o teste `120_000` ms zaman sınırı + gerekçe yorumu. Global `testTimeout` 30 s, kapsam, desen listesi, `skip` aynen.
- Geçici enstrümantasyonlar (test + scan) geri alındı; `git diff` yalnız bu iki satır.

## Kanıt (ham)

Kasıtlı sızıntı (`src/__fo200_probe.ts`, `'use server'` + `catch → return { error: e }`) ile guard KIRMIZI:
```
FAIL  … no server action returns what it caught (beyond the known list)
AssertionError: expected { Object (src/__fo200_probe.ts) } to deeply equal {}
Tests  1 failed | 21 skipped (22)
```
Probe dosyası silindi (`probe removed`).

Tam izole gate (`bash scripts/gate-isolated.sh pnpm gate`), 2 ardışık koşu:
```
Run 1: Test Files  434 passed | 2 skipped (436)
       Tests  5724 passed | 54 skipped (5778)
       4 skipped / 446 passed (10.6m)
       [gate-isolated] ok: pnpm finished on an isolated database
       EXIT=0
Run 2: Test Files  434 passed | 2 skipped (436)
       Tests  5724 passed | 54 skipped (5778)
       4 skipped / 446 passed (9.6m)
       [gate-isolated] ok: pnpm finished on an isolated database
       EXIT=0
```
Not: vitest varsayılan reporter'ı geçen testleri tek tek listelemiyor; guard testinin tam-gate içi süresi ayrıca ölçülmedi. Guard testi yeşil (dosya düzeyinde 0 fail).

rag-pdf-worker-isolation (3 koşu, 25/25 yeşil) — "fast" assertion'lar ve gözlenen süreler:

| Test | Assert | Koşu 1 | Koşu 2 | Koşu 3 |
|---|---|---|---|---|
| 128 MB-inflating, fast | < 3000 ms | 823 | 927 | 1967 |
| LZW bomb 1.3 GB, fast | < 5000 ms | 535 | 876 | 1082 |
| İNCELEME-52 shape | (assertion yok; event-loop gap < 500) | 5580 | 5177 | 14702 |

Ticket'taki yük altı değerler (5.7 s > 3 s, 6.4 s > 5 s) bu koşularda tekrarlanmadı; ancak makine load average ≈ 50 iken ölçüldü, ölçüm gürültülü (guard testinde aynı kodla 10 s ↔ 42 s).

Enstrümantasyon gürültüsü: e2e web server log'unda ~145 kez `src/instrumentation.ts:18` `process.exit(1)` satırı göründü; hata metni log'a düşmedi. Bu koşularda e2e 446/446 geçti; sebebi kesin değil (yeniden üretmek için `register()` e2e benzeri env ile geçti).

## Değişen dosyalar

- `tests/api/api-error-body-guard.test.ts` — açıklama yorumu + `}, 120_000);`
- `docs/agent-results/TASK-MVS38H9LKY0S3-devop-fb.md` — bu rapor

Commit'lenmedi: `scripts/gate-isolated.sh` (worktree'de untracked; kart "commit edilmez" dedi).

## Riskler

- 120 s bütçe bir **workaround**: tarama süresi değişmedi; yük altında ~52 s sürse bile geçer, ama tarayıcı yavaş kalmaya devam eder. Gerçek düzeltme sızıntı analizinin kendisini hızlandırmak (se-fb/guard sahibi kararı) gerektirir.
- rag-pdf testlerinde süre flake'i yük altında mümkün (ticket'taki 5.7 s/6.4 s). Bu kartta değiştirilmedi (güvenlik testi; se-fb kararı).

## Açık sorular

1. Guard tarayıcısının yavaşlığı için 120 s bütçe mi kabul, yoksa `action-leak-scan.ts` analizini hızlandırma mı (ayrı kart)?
2. rag-pdf "fast" eşikleri (3 s / 5 s) yük altında gevşetilsin mi? — se-fb kararı.

## Sonraki adım

- Draft PR (base `dev`), açıklamada süre/kanıt özeti.
- Gate çalıştırma: pre-push hook izole DB'de (`bash scripts/gate-isolated.sh git push -u origin devop-fb/guard-scan-timeout`).
