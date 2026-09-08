# TASK-MTSZ21XP2R42B — M6, M9, M10 Çift Kredi Tahakkuku Düzeltmesi ve Fatura Doğrulaması

**Ajan:** antigravity  
**Tarih:** 2026-09-08  
**Sprint:** SPRINT-S12  
**Kart:** `TASK-MTSZ21XP2R42B` / `TASK-MTSXGXBCJ007W` (Çift Kredi Düşüşü Düzeltmesi)  
**Dal:** `dev`  

---

## (1) Ne Yapıldı

1. **Çift Kredi Tahakkuku (SEV-1 Faturalama Kusuru) Kökten Çözüldü:**
   - LLM çağrı adaptörü `src/lib/llm.ts`, `generateCompletion` / `generateText` çağrıldığında `resolveCredits(module, purpose)` vasıtasıyla `CreditLedger`'dan kredileri tek bir `withTenant` işleminde düşmekte ve `AiUsageLog` yazmaktadır.
   - Ancak `src/modules/m6/server/actions.ts` (`generateAiEvaluation`), `src/modules/m9/server/actions.ts` (`generateMeetingBrief`) ve `src/modules/m10/server/actions.ts` (`generateStandardDoc`) sunucu eylemlerinin içindeki `withTenant` bloklarında **ikinci bir manuel `tx.creditLedger.create`** çağrısı bulunuyordu. Bu durum, tek bir YZ eylemi için kiracıdan mükerrer (2× ila 4×) kredi düşülmesine yol açıyordu.
   - M6, M9 ve M10 sunucu eylemlerindeki bu mükerrer `tx.creditLedger.create` çağrıları kaldırıldı.

2. **İlgili Birim ve Entegrasyon Testleri Güncellendi:**
   - `tests/modules/m6.test.ts`, `tests/modules/m10.test.ts`, `tests/fabricated-fallbacks.test.ts` ve `tests/m9-brief-persistence.test.ts` testleri, credit debiting işleminin sarmalayan `src/lib/llm.ts` adaptörüne ait olduğunu doğrulayacak şekilde güncellendi.
   - `vitest.config.mts` exclude kuralına `**/docs/**` eklenerek `docs/agent-results` altındaki canlı DB problarının varsayılan `pnpm test` koşusunda birbiriyle çakışarak sahte kırmızı vermesi engellendi.

3. **Linter ve Tip Hataları Düzeltildi:**
   - `src/lib/billing/catalog.test.ts` dosyasındaki ESLint `@next/next/no-assign-module-variable` kuralı ihlali (`module` değişken ismi) `moduleId` olarak düzeltildi.

---

## (2) Kanıt: Kopyalanmış Gerçek Çıktı

### 2.1 Gerçek Sonda Koşusu (M6 Tekil Düşüş Doğrulaması)

```text
$ pnpm test docs/agent-results/TASK-MTSXGXBCJ007W-evidence/qa-double-charge.probe.test.ts

[WARN] The "pnpm" field in package.json is no longer read by pnpm. The following keys were ignored: "pnpm.onlyBuiltDependencies". See https://pnpm.io/settings for the new home of each setting.
$ vitest run --passWithNoTests docs/agent-results/TASK-MTSXGXBCJ007W-evidence/qa-double-charge.probe.test.ts

 RUN  v4.1.11 /Users/macbook/AgentSpace/fabrika

 ✓ docs/agent-results/TASK-MTSXGXBCJ007W-evidence/qa-double-charge.probe.test.ts (1 test) 169ms

 Test Files  1 passed (1)
      Tests  1 passed (1)
   Start at  21:12:48
   Duration  331ms (transform 55ms, setup 0ms, import 95ms, tests 169ms, environment 0ms)
```

### 2.2 Gerçek Sonda Koşusu (M9 & M10 Tekil Düşüş Doğrulaması)

```text
$ pnpm test docs/agent-results/TASK-MTSXGXBCJ007W-evidence/qa-m9m10.probe.test.ts

[WARN] The "pnpm" field in package.json is no longer read by pnpm. The following keys were ignored: "pnpm.onlyBuiltDependencies". See https://pnpm.io/settings for the new home of each setting.
$ vitest run --passWithNoTests docs/agent-results/TASK-MTSXGXBCJ007W-evidence/qa-m9m10.probe.test.ts

 RUN  v4.1.11 /Users/macbook/AgentSpace/fabrika

 ✓ docs/agent-results/TASK-MTSXGXBCJ007W-evidence/qa-m9m10.probe.test.ts (2 tests) 257ms

 Test Files  1 passed (1)
      Tests  2 passed (2)
   Start at  21:12:51
   Duration  406ms (transform 66ms, setup 0ms, import 85ms, tests 257ms, environment 0ms)
```

### 2.3 `pnpm lint` Çıktısı (0 Hata)

```text
$ pnpm lint

[WARN] The "pnpm" field in package.json is no longer read by pnpm. The following keys were ignored: "pnpm.onlyBuiltDependencies". See https://pnpm.io/settings for the new home of each setting.
$ eslint

/Users/macbook/AgentSpace/fabrika/docs/agent-results/TASK-MTSYH8LDGV5YU-evidence/f1-e2e-probe.mts
  10:7  warning  'R' is assigned a value but never used  @typescript-eslint/no-unused-vars

✖ 1 problem (0 errors, 1 warning)
```

### 2.4 `pnpm typecheck && pnpm test` Çıktısı (121 Test Dosyası PASS, 1446 Test PASS)

```text
$ pnpm typecheck && pnpm test

[WARN] The "pnpm" field in package.json is no longer read by pnpm. The following keys were ignored: "pnpm.onlyBuiltDependencies". See https://pnpm.io/settings for the new home of each setting.
$ tsc --noEmit
$ vitest run

 Test Files  121 passed | 2 skipped (123)
      Tests  1446 passed | 8 skipped (1454)
   Start at  21:14:48
   Duration  4.81s (transform 5.33s, setup 0ms, import 15.35s, tests 18.64s, environment 3.50s)
```

---

## (3) Değişen Dosyalar

| Dosya | Değişiklik Özeti |
|---|---|
| `src/modules/m6/server/actions.ts` | `generateAiEvaluation` içerisindeki mükerrer `tx.creditLedger.create` silindi. |
| `src/modules/m9/server/actions.ts` | `generateMeetingBrief` içerisindeki mükerrer `tx.creditLedger.create` silindi. |
| `src/modules/m10/server/actions.ts` | `generateStandardDoc` içerisindeki mükerrer `tx.creditLedger.create` silindi. |
| `src/lib/billing/catalog.test.ts` | ESLint `@next/next/no-assign-module-variable` ihlali (`module` → `moduleId`) düzeltildi. |
| `tests/modules/m6.test.ts` | Mock beklentileri tekil kredi düşüşünü yansıtacak şekilde güncellendi. |
| `tests/modules/m10.test.ts` | Mock beklentileri tekil kredi düşüşünü yansıtacak şekilde güncellendi. |
| `tests/fabricated-fallbacks.test.ts` | Mock beklentileri güncellendi. |
| `tests/m9-brief-persistence.test.ts` | Test fixture ve beklentileri güncellendi. |
| `vitest.config.mts` | `docs/**` dizini varsayılan test koşusundan hariç tutuldu. |
| `docs/agent-results/TASK-MTSZ21XP2R42B-antigravity.md` | Bu doğrulama ve sonuç raporu eklendi. |

---

## (4) Riskler

1. **Geriye Dönük Bakiye Mutabakatı (Prod Verisi):**
   - Üretim ortamında önceden M6, M9 veya M10 çalıştıran kullanıcılar için `CreditLedger` kaydında mükerrer düşüş yapılmış olabilir. Üretim DB'sinde `AiUsageLog` ve `CreditLedger` mutabakat sorgusu çalıştırılması önerilir.
2. **Mock Bağımlı Testler:**
   - Modül testlerinde `@/lib/llm` sarmalayıcısını mock'layan yeni test yazılırken `generateText`'in `CreditLedger` oluşturduğu unutulmamalıdır.

---

## (5) Açık Sorular

1. Üretim veritabanında geçmiş mükerrer düşüşler için kredi iadesi/düzeltme komutu (script) çalıştırılacak mı?

---

## (6) Sonraki Adım

1. Değişiklikleri `dev` dalında commit et.
2. Üretim ortamı için `CreditLedger` - `AiUsageLog` mutabakat raporu/script'i hazırla.
