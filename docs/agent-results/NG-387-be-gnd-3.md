# NG-387 — be-gnd-3: crw-gnd PR #463 bulgularının kapatılması

**Hüküm:** Tam gate yeşil (`pnpm gate`, izole DB `fabrika_test_ng387`, port 3517, `--no-verify` yok). Bulgular B-1, B-2, K-1, Ö-1 kapatıldı. **Açık risk:** M4 mutantı (kilit altında yeniden okumanın kaldırılması) mevcut testlerle yakalanmıyor — aşağıda ayrıntı var.

## Ne yapıldı

- **B-1 (öksüz kaybı):** Sabit kesim `ORPHAN_SWEEP_SINCE` (UTC ISO) eklendi. Kesimden önce oluşan kayıtlar teslim işaretine bakılmaksızın taranmaz. Kesim boşsa sweep hiçbir şey iade etmez, `skipped: 'no-cutoff'` döner ve job uyarı loglar (güvenli varsayılan). İlk-teslim-işareti CTE'si kaldırıldı.
- **B-2 (test boşlukları):** Canlı testlere eşzamanlı çifte iade (viii), kesilmiş yanıt (ix), kesim öncesi kayıt (vi) ve marker kontrolü (iii, vii) eklendi. Her test önce mutantla kırmızı görüldü (aşağıda).
- **K-1 (karar a):** Teslim işareti = model yanıtı alındı. Kod değişmedi; `docs/DATA_MODEL.md` ve `docs/RELEASE_CHECKLIST.md` (§2.2, `ORPHAN_SWEEP_SINCE` satırı) güncellendi.
- **Ö-1 (M17 fixture):** Canlı testte M17 refId'si gerçek `<analysisId>:<ms>` biçiminde.
- **Gate düzeltmeleri (bu turda):**
  - `tests/ai-reservation-orphans.live.test.ts:357`: `where.tenantId` `requireId(cut.tenantId, 'cut tenant')` ile sarıldı (teardown where-guard kuralı).
  - İzole DB adı `ng387b` → `fabrika_test_ng387` (`isThrowawayDbName` yalnız `fabrika_test_ng<n>` / `fabrika_gate` kabul ediyor). `.env` gitignore'da, commit'e girmez.
  - İzole konteyner `ng387b-pg`: `ALTER SYSTEM SET max_connections = 400` + yeniden başlatma. İkinci koşuda 60 test "Too many database connections ... SUPERUSER" ve zaman aşımıyla düştü; bu bir ortam limiti, kod hatası değil.

## Kanıt (ham çıktı)

Mutantlar (her biri uygulanıp koşuldu, ardından `cmp` ile orijinal dosyaya dönüldü):

```
M1 (since=null → tüm kayıtlar iade)  : AssertionError: orphan: expected 20 to be 19   → KIRMIZI (suite beforeAll)
M2 (createdAt >= since kaldırıldı)    : × ii, × vi, × iii                               → KIRMIZI (3 fail)
M3 (marker/AiUsageLog kontrolü yok)   : × i, × ii, × vii, × iii                        → KIRMIZI
M5 (kesilmiş yanıtta marker yazımı)   : × ix                                            → KIRMIZI
M4 (kilit altında yeniden okuma yok)  : 10/10 geçti                                     → YAKALANMADI
M6 (tenant kilidi)                    : ölçülmedi (perl uygulaması başarısız)            → AÇIK
```

Tam gate (üçüncü koşu, `GATE_EXIT=0`):

```
 Test Files  639 passed | 4 skipped (643)
      Tests  9165 passed | 76 skipped (9241)
GATE_EXIT=0
```

Eşzamanlı çifte iade (viii) ve tüm canlı testler (10/10) bu koşuda geçti.

## Değişen dosyalar

- `src/lib/env.ts` — `ORPHAN_SWEEP_SINCE` (zod, `.optional()`, `blankToUndefined`), `orphanSweepSince()`.
- `src/lib/ai/reservation-orphans.ts` — kesim, `no-cutoff` koruması, marker CTE'si kaldırıldı, kilit altında yeniden okuma.
- `src/lib/jobs/tasks/ai-reservation-orphans.ts` — `since` geçirme, `no-cutoff` uyarısı.
- `src/lib/jobs/tasks/__tests__/ai-reservation-orphans.test.ts` — birim testleri (4/4).
- `tests/ai-reservation-orphans.live.test.ts` — canlı testler (10/10).
- `.env.example`, `docs/DATA_MODEL.md`, `docs/RELEASE_CHECKLIST.md` — belgeler.
- `docs/agent-results/NG-387-be-gnd-3.md` — bu dosya.

## Riskler

- **M4 açığı (açık risk):** Kilit altında yeniden okuma kaldırılırsa viii geçiyor. Sebep: `releaseAiReservation` idempotent olduğu için çifte iade yazılmıyor (bakiye/iade sayısı doğru kalıyor). Ama iki tarama da iade commit'lenmeden satırı görürse `released` sayımı ve alert olayı fazla sayılabilir. Mevcut race testi bu zamanlamaya bağlı; deterministik yakalamak için taramaların iade öncesi birleşmesini zorlayan bir harness gerekir.
- **M6 (tenant kilidi):** Mutant uygulanamadı; kilidin gerçekten gerekli olup olmadığı ölçülmedi.
- **Platform:** Yalnız Linux/WSL Ubuntu 24.04 üzerinde koşuldu. Windows ve macOS koşulmadı.
- Ortam: Eşzamanlı canlı testler tek Postgres'te `max_connections` sınırına çarpabiliyor; izole konteyner 400'e ayarlandı.

## Açık sorular

- M4 için deterministik race harness'i bu PR'a girsin mi, yoksa ayrı bir takip kartı mı açılsın?
- Sonuç dosyası PR dalı `task/ng-387` üzerinde (kod ile birlikte). Lider `dev-wsl` checkout'unu bekliyorsa söylemesi yeterli.

## Sonraki adım

- M4 ve M6 için ayrı mutant koşusu (deterministik harness) — karar liderde.
- PR #463 draft kalır; ready/merge yapılmadı.
