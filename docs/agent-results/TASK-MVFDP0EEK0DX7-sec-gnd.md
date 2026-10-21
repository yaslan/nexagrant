# TASK-MVFDP0EEK0DX7 (FO-99) — ADR-0009 public-intake tablo listesi

**Hüküm:** KISMEN TAMAM — doküman değişikliği yapıldı ve commit'lendi (`2e6bed09`); push ve PR **açılamadı**. Pre-push kapısı (`pnpm gate`, test adımı) 6 testte kırıldı; kapı atlanmadı. Görev tamamlanmış sayılmaz, DONE yazılmadı.
**Tip:** bug (doküman kayması)
**Platform:** mac (darwin, bu makine). Değişiklik yalnız `.md`; platforma bağlı kod yolu yok.

## Ne yapıldı
- `docs/adr/ADR-0009-signed-system-scope.md:50`: public-intake amacının açtığı tablo listesine `ExpertPreRegAttempt` eklendi (FO-26, PR #95, dev'de `9166a99d`). Karar (K-569554=C) ve kapsam değişmedi. Listenin kopyaları da satıra yazıldı.
- Kart önkoşulu doğrulandı: `git log origin/dev` içinde `d8b97f7e` ve `9166a99d` görünüyor.
- Ayrık worktree: `/Users/macbook/alan/FONBRIDGE-wt-fo99`, dal `se-fb/fo99-adr0009-public-intake` (origin/dev `80271979`'dan). Paylaşılan ağaca dokunulmadı.

## Kanıt (ham çıktı)
Dört kopya (`git grep -n -e "public-intake" -e "ExpertPreRegAttempt" -- docs/adr prisma/rls.sql scripts/check-rls-live.ts src/lib/system-scope.ts`):
```
docs/adr/ADR-0009-signed-system-scope.md:50: ... amaç `public-intake` ise yalnız `ExpertPreRegistration`, `ExpertFounderCounter` ve `ExpertPreRegAttempt` açılır (FO-26 ...)
prisma/rls.sql:327: to_regclass('public."ExpertPreRegAttempt"'))) IS TRUE)))
prisma/rls.sql:331: ... Purpose public-intake opens only ExpertPreRegistration, ExpertFounderCounter and ExpertPreRegAttempt (FO-52, FO-26).
scripts/check-rls-live.ts:631: const PUBLIC_INTAKE_TABLES = new Set([EXPERT_TABLE, 'ExpertFounderCounter', 'ExpertPreRegAttempt']);
src/lib/system-scope.ts:110: * The database opens only ExpertPreRegistration, ExpertFounderCounter and ExpertPreRegAttempt for it (FO-52,
```
Dört yer aynı üç tabloyu gösteriyor.

Test koşusu (`pnpm test`, worktree, `.env` yüklü):
```
Test Files  3 failed | 360 passed | 7 skipped (370)
Tests  6 failed | 4792 passed | 120 skipped (4918)
```
Kırılanlar: `tests/expert-prereg-form.test.tsx` (3, 30 sn zaman aşımı), `tests/rag-pdf-worker-isolation.test.ts` (2, süre eşiği), `tests/api/api-error-body-guard.test.ts` (1, zaman aşımı).
İzole yeniden koşu (3 dosya): `Tests 4 failed | 62 passed (66)` — aynı tür hatalar, bir form testi farklı.
Makine yükü: `load averages: 47.23 45.23 32.15`.

## Neden değerlendirme
- Commit yalnız `docs/adr/ADR-0009-signed-system-scope.md` içeriyor (`git diff --stat origin/dev HEAD`: 1 dosya, 1+/1-). Test edilen kod origin/dev ile birebir aynı; kırılmalar bu değişiklikten gelmiyor.
- Kırılmalar zamanlama tabanlı (zaman aşımı, ms eşiği) ve yüksek yük altında koşuldu. Dev'de aynı kırılma olup olmadığı bu koşuda ölçülmedi (dev ağacında ayrı koşu yapılmadı).

## Riskler
- Pre-push kapısı geçmediği için branch uzakta yok; PR açılmadı.
- `--no-verify` ile atlamak proje kuralına aykırı; yapılmadı.

## Açık sorular
- Kapıyı yük düşünce yeniden denemek mi, yoksa dev'de aynı testlerin durumu doğrulanıp (dev ağacında koşu) kırılmanın dev'de de var olduğu kanıtlanınca kapı kararını sahibi mi verecek?

## Sonraki adım
1. Yük düşünce (veya dev baseline kanıtlanınca) `git push -u origin se-fb/fo99-adr0009-public-intake` ve PR (base `dev`, merge yok).
2. Ardından bu dosyayı içeren commit ile DONE.
