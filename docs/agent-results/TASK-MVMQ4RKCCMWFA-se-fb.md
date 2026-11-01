---
sözleşme: 3
görev: TASK-MVMQ4RKCCMWFA
kod: FO-133
ajan: se-fb
motor: claude
tip: hata
okur: ekip
hüküm: Bitti — Ö-1, Ö-2 ve M2 kapandı; kod başı b273db0b, PR #155'e push edildi, pre-push gate yeşil (393 e2e geçti, 0 kırmızı).
platform: mac (darwin). Kod yolları saf TS (CSV metni) ve Playwright e2e; platforma bağlı kod yok. Windows/Linux koşulmadı.
sürüm: 1
tarih: 2026-10-24
---

# FO-133 — FO-126 takibi (PR #155)

**Ajan:** se-fb · **Dal:** `se-fb/fo126-csv-sinks` (PR #155) · **Kod başı:** `b273db0b` (önceki: `41da69d7`) · **Worktree:** `.claude/worktrees/fo133-csv-sinks` (kendi `node_modules`, izole Postgres `localhost:55733/fabrika`, e2e sunucusu `:55734`; paylaşılan `:5433`/`:3000` ve ana `node_modules` kullanılmadı).

## Ne yapıldı

| Madde | Yapılan | Durum |
|---|---|---|
| Ö-1 | `tests/csv-export-sinks.test.ts`: `export-csv.ts` içinde `opportunityCsv(opportunities)` ve `evidence-client.tsx` içinde `new Blob([evidenceCsv(filteredItems)]` çağrılarını kaynak taraması ile kilitleyen 2 test. | Kapandı (kırmızı kanıt aşağıda) |
| Ö-2 | `tests/e2e/fo126-csv-formula-download.spec.ts` artık `demo-tenant` yerine `evidenceTenant('fo126')` ile kendi tenant'ında; opportunity ve evidence bu tenant'ta; `afterAll` önce opportunity'yi, sonra fixture teardown'ını çağırıyor. Teardown'a `requireId` konuldu (`teardown-where-guard` kuralı). | Kapandı (kırmızı kanıt yok, aşağıda açıklanır) |
| M2 | `src/lib/evidence/evidence-csv.ts`: `validUntilDay()` — `Date` ve ISO string aynı UTC günü (`YYYY-MM-DD`) basıyor; geçersiz string olduğu gibi kalıyor, `csvCell`'den geçmeye devam ediyor. Test: Date, ISO string ve `YYYY-MM-DD` girdisi aynı çıktıyı veriyor. | Kapandı |

## Kanıt (ham çıktı)

**M2 — eski kodda kırmızı** (test yeni, `validUntilDay` yokken):
```
 FAIL  tests/csv-export-sinks.test.ts > evidence pack export (FO-126) > ValidUntil prints as a UTC day, the same for a Date and for its ISO string
AssertionError: expected 'Sat Oct 24 2026 03:00:00 GMT+0300 (Tü…' to be '2026-10-24' // Object.is equality
 Tests  1 failed | 8 passed (9)
```
Sonra düzeltme ile yeşil (`tests/csv-export-sinks.test.ts` + `tests/teardown-where-guard.test.ts`: 15/15).

**Ö-1 — mutant, kırmızı, geri alındı:**
- Dashboard çağrısı ham birleştirmeye çevrildi (`data: opportunities.map(...).join("\n")`):
  ```
  × the dashboard export writes its rows through opportunityCsv
  Tests  1 failed | 1 passed | 7 skipped (9)
  ```
- Evidence çağrısı ham birleştirmeye çevrildi (`new Blob([filteredItems.map((i) => i.title).join("\n")]`):
  ```
  × the evidence pack download is built by evidenceCsv
  Tests  1 failed | 1 passed | 7 skipped (9)
  ```
- Her iki dosya sonra geri alındı (`git diff` boş / `git checkout --`).

**Ö-2 — e2e, yeni spec yeşil** (izole DB + `E2E_PORT=55734`):
```
✓ fo126-csv-formula-download.spec.ts:67 › the dashboard CSV download carries the formula title as text (1.7s)
✓ fo126-csv-formula-download.spec.ts:86 › the evidence pack CSV download carries the formula title as text (909ms)
```
Teardown sonrası DB kontrolü: `Opportunity` içinde `=cmd%` başlıklı satır 0; `Evidence` içinde 0; `ev-fo126%` tenant 0.

**Tam gate (pre-push, `b273db0b`):**
```
 Test Files  380 passed | 7 skipped (387)
      Tests  5021 passed | 120 skipped (5141)
  393 passed (10.9m)   — e2e, 9 skipped
   41da69d7..b273db0b  se-fb/fo126-csv-sinks -> se-fb/fo126-csv-sinks
EXIT=0
```

**Lint + typecheck** (değişen dosyalar): temiz (`eslint` + `tsc --noEmit`).

**İlk push denemesi (başarısız, gate):** Aynı kodla ilk denemede e2e'de `tests/e2e/public-shell.spec.ts:117` ("the 404 page has the header and footer too") 60 s zaman aşımıyla düştü (`1 failed`, `392 passed`). Bu test CSV ile ilgisiz. Tek başına koşuldu: `✓ (6.1s)`. İkinci push denemesinde tam gate yeşil geçti ve push tamamlandı. Zaman aşımının soğuk derleme kaynaklı olduğu tahmin; kök neden doğrulanmadı.

## Skipped
- Unit: 120 skipped (testlerin çoğu canlı DB/ortam gerektiren suite'ler; her birinin gerekçesi tek tek okunmadı).
- E2E: 9 skipped (mevcut `test.skip`/koşula bağlı testler; gerekçeleri bu turda incelenmedi).

## Değişen dosyalar
- `src/lib/evidence/evidence-csv.ts` (M2)
- `tests/csv-export-sinks.test.ts` (Ö-1, M2 testleri)
- `tests/e2e/fo126-csv-formula-download.spec.ts` (Ö-2)
- `docs/agent-results/TASK-MVMQ4RKCCMWFA-se-fb.md` (bu rapor)

## Riskler
- Ö-2 için eski kodda kırmızı koşu yapılmadı: değişiklik yalnız test izolasyonu. Doğrulama, yeni spec'in yeşil koşusu ve teardown sonrası DB temizliği ile yapıldı.
- Ö-1 kaynak taraması metin eşleşmesidir: çağrı satırı aynen yeniden adlandırılırsa test bunu yakalar ama farklı bir sink ile aynı metin üretilirse yakalamaz. Gerçek davranış e2e ile de kilitli.
- `validUntil` gerçekte `Date` mi `string` mi geliyor: `initialData` kaynağı bu turda doğrulanmadı; her iki durum da test ediliyor.

## Açık sorular
- Yok.

## Sonraki adım
1. Gözden geçirme: PR #155 (`b273db0b`) için inceleme (crw-fb).
2. #153 (FO-124) merge olduktan sonra #155'i `dev` üzerine rebase (1. tur uyarısı geçerli).
3. Temizlik: `fo133-pg` konteyneri ve worktree bu rapordan sonra kaldırılacak.

## Definition of Done
- [x] Ö-1 çağrı satırı kilidi + kırmızı kanıt
- [x] Ö-2 e2e kendi tenant'ında (yeşil koşu + DB temizliği; eski kodda kırmızı koşu yok — yalnız test izolasyonu)
- [x] M2 ISO tarih + test (kırmızı → yeşil)
- [x] Gate yeşil, PR #155 güncel (`b273db0b`)
- [x] Platform beyanı (mac)
