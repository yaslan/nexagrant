---
hüküm: düzeltme tamam — yeniden inceleme talep ediliyor (merge YOK)
tip: bug
platform: macOS (darwin, arm64) koşuldu; sunucu TS + Postgres, platformdan bağımsız — Linux/Windows ayrıca koşulmadı
kart: TASK-MVXIZJ0C7UETD (FO-313)
dal: be-fb/fo288-generate-reservation (PR #234)
---

# FO-313 — PR #234 düzeltmesi: FO-310 RET bulguları Y-1 ve Y-2

- Kart: TASK-MVXIZJ0C7UETD · Anahtar: FO-313 · Ajan: BE-FB
- Bağlı inceleme: `docs/agent-results/FO-310-crw-fb.md` (CRW-FB, hüküm RET-düzeltme ile)
- Kapsam: yalnız PR #234 ve dalı. Merge yapılmadı.

## Ne yapıldı

### Y-1 — iade, usage satırından ayrı idempotent transaction'a alındı

`src/lib/llm.ts`, `generateCompletion` içinde:

- Önceki hâl: `credits === 0` dalında `releaseAiReservation` ile `aiUsageLog.create` **aynı** `withTenant` transaction'ındaydı. Usage insert düşerse iade de geri alınıyordu → kullanıcı öder, teslim yok, kayıt yok.
- Yeni hâl:
  1. Usage satırı (ve rezervasyonu olmayan çağıranda kesinti) tek transaction'da yazılır; hatası `writeFailures`'a alınır.
  2. Rezervasyonlu ve `credits === 0` ise `releaseCallCredits` **kendi** transaction'ında çalışır (kendi advisory lock'u, `releaseAiReservation` zaten `refund:<module>` satırı varsa yazmaz → idempotent). Usage hatasından bağımsız çalışır.
  3. İki yazımdan biri düşerse `AiUsageLogWriteError` fırlatılır (`cause` = ilk hata).
- Sonuç: usage insert hatası iadeyi geri almaz.

Ayrı transaction'ın sebebi: lider kararı (teknik) — "iadeyi ayrı, idempotent bir transaction'a taşı; usage insert hatası iadeyi geri almasın".

### Y-1 testleri ve mutasyon

Yeni test: `src/lib/llm.stop-reason.test.ts` → "refunds the reservation even when the usage row fails to write (FO-310 Y-1)". Usage insert'i zorla reddeder; beklenen: `AiUsageLogWriteError`, iki ledger yazımı (`-1` rezervasyon, `+1` `refund:M10`), net defter hareketi `0`.

Mutasyon (iadeyi tekrar usage transaction'ına koy, eski hata): test kırmızı.

```
× refunds the reservation even when the usage row fails to write (FO-310 Y-1) 4ms
 FAIL  src/lib/llm.stop-reason.test.ts > Anthropic stop_reason — max_tokens (cut off) > refunds the reservation even when the usage row fails to write (FO-310 Y-1)
 Test Files  1 failed | 1 passed (2)
      Tests  1 failed | 67 passed (68)
```

Düzeltilmiş hâl (mutasyon geri alındı, dosya kopyayla doğrulandı):

```
 Test Files  2 passed (2)
      Tests  68 passed (68)
```

Sınır: bu test mock'lanmış transaction'la koşar; gerçek Postgres rollback davranışı canlı testte değil. Ayrı transaction olduğu kod yapısıyla garanti edilir (iki ayrı `withTenant` çağrısı).

### Y-2 — FO-288 raporundaki "Assertion değiştirilmedi" ifadesinin düzeltilmesi

FO-288 raporu (`docs/agent-results/FO-288-be-fb.md:22`) "Assertion değiştirilmedi" diyordu; bu yanlıştı. Değişen assertion'lar ve gerekçeleri:

| # | Dosya | Eski | Yeni | Gerekçe |
|---|---|---|---|---|
| 1 | `src/lib/llm.generate.test.ts` | `ledgerRow().refId` = `'note_9'` | `ledgerRow()` = `{ reason: 'usage:M2', delta: -1 }` | Rezervasyon satırının `refId`'si artık çağrının kendi rezervasyon anahtarı (`module:purpose:uuid`); iadenin doğru debit'i bulabilmesi için benzersiz olmalı. Proposal bağı `usageRow().proposalId` üzerinde hâlâ assert ediliyor (`note_9`). Proposal bağının defter satırında olmadığı artık açık. |
| 2 | `src/lib/llm.generate.test.ts` | `creditLedger.create` `not.toHaveBeenCalled()` (sağlayıcı hatası) | `netLedgerMovement() === 0` | Rezervasyon artık debit yazıyor, iade de +1 yazıyor. "Hiç yazılmadı" değil "net sıfır" doğru iddia. Not: `netLedgerMovement` iki yazımın varlığını değil toplamı kontrol eder; iade yazılmazsa toplam −1 olur ve test kırmızı verir. |
| 3 | `src/lib/llm.stop-reason.test.ts` | `creditLedger.create` `not.toHaveBeenCalled()` (kesilmiş cevap) | `netLedgerMovement() === 0` | Aynı gerekçe: rezervasyon + iade. |
| 4 | `src/lib/llm.generate.test.ts` | `rejects.toBeInstanceOf(AiUsageLogWriteError)` (ledger yazımı düşünce) | `not.toBeInstanceOf(AiUsageLogWriteError)`, mesaj `'db down'`, sağlayıcı çağrılmadı | Rezervasyon sağlayıcıdan **önce** yapılır; bu noktada hata "ödendi ama kaydedilmedi" değildir. `AiUsageLogWriteError` bu durumda yanlış etiket olurdu. Sağlayıcının çağrılmadığı da test ediliyor (daha güçlü iddia). |

Gerekçesiz zayıflatma bulunmadı; hiçbir değişiklik geri alınmadı.

### Ö-1 — yorum temizliği

`src/lib/llm.ts` `reserveAiAction` yorumundaki bayat `{@link chargeAiAction}` referansı (fonksiyon kaldırılmıştı) kaldırıldı; yerine ledger nedeni ve fiyatı yazıldı.

### Ö-2..Ö-4 — uygulanmadı (kapsam dışı, lider kararı bekliyor)

- Ö-2 (fiyatı 0 yolunda gereksiz `lock + findFirst`): davranış değişikliği, bu düzeltmenin kapsamı dışı.
- Ö-3 (`releaseCallCredits` hatasının orijinal sağlayıcı hatasını maskelemesi): ayrı küçük iş olarak açılabilir. Not: bu düzeltmede iade hatası artık `AiUsageLogWriteError` içinde raporlanıyor, sağlayıcı hatası ise `.catch` içinde hâlâ önce fırlatılıyor.
- Ö-4 (0 < bakiye < fiyat reddi, ürün kararı): ürün onayı ve kullanıcı mesajı i18n'i lider/ürün kararı.

## Değişen dosyalar

- `src/lib/llm.ts` — Y-1 (iade ayrı tx), Ö-1 (yorum)
- `src/lib/llm.stop-reason.test.ts` — Y-1 regresyon testi + `AiUsageLogWriteError` import
- `docs/agent-results/FO-313-be-fb.md` — bu rapor

`src/lib/llm.generate.test.ts` — bu düzeltmede değişmedi (Y-2 satır 1, 2, 4 zaten FO-288 commit'indeki değişiklikler; burada yalnız rapor).

## Kanıt

Lint: `0 errors (4 warnings)`. Uyarılar düzeltme öncesinden var (`tests/settings-profile-update.test.ts` vb.).
Typecheck: `tsc --noEmit` hatasız.

Gate (izole, `bash scripts/gate-isolated.sh pnpm gate`), ham log: `scratchpad/gate-fo313.log`:
```
2026-11-01T07:48:34Z [gate-isolated] pnpm gate (E2E_PORT=3401)
 Test Files  474 passed | 2 skipped (476)
      Tests  6151 passed | 54 skipped (6205)
2026-11-01T08:06:27Z [gate-isolated] ok: pnpm finished on an isolated database
2026-11-01T08:06:27Z [gate-isolated] removed container fabrika-gate-20261101074815-14866
GATE_EXIT=0
```
Gate exit kodu: **0**. (Unit 6150 → 6151: yeni Y-1 testi.)

## Riskler

- Yeni ayrı refund tx'i: usage yazımı başarılıyken iade başarısız olursa çağıran `AiUsageLogWriteError` alır; kullanıcı rezervasyon borcunu bu çağrı için taşır (idempotent `releaseCallCredits` bir sonraki denemede düzeltir, otomatik yeniden deneme yok).
- `refId` formatı FO-288'de değişti (`proposalId` → `module:purpose:uuid`); denetim/raporlama sorgusu varsa etkilenir (FO-310'da kaynak kodda okuyan yol bulunmadı).

## Açık sorular

1. Ö-3 (sağlayıcı hatasını maskeleme) bu PR'da mı, ayrı işte mi kapatılsın?
2. Ö-4 (bakiye < fiyat reddi) ürün onayı alındı mı?

## Sonraki adım

CRW-FB yeniden incelemesi (yarış + mutasyon + gate) → ONAY bekleniyor. Merge kararı lider/inceleyicide.
