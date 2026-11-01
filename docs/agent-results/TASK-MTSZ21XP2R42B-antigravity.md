# TASK-MTSZ21XP2R42B — Çift Kredi Düşüşü Düzeltmesi Doğrulama Raporu

## 1. Ne Yapıldı

1. **HEAD Üzerinde Bağımsız Doğrulama**:
   - `08796f9` commit'indeki düzeltme (`fix(billing): resolve double credit debiting in M6, M9 and M10 server actions`) bugünkü `HEAD` üzerinde bağımsız olarak doğrulandı.
   - `docs/agent-results/TASK-MTSXGXBCJ007W-evidence/` klasöründeki 3 sonda (`qa-card-claim.probe.test.ts`, `qa-double-charge.probe.test.ts`, `qa-m9m10.probe.test.ts`) çalıştırıldı.
   - M6, M9 ve M10 eylemlerinin her biri için `CreditLedger` tablosunda **TAM OLARAK TEK DÜŞÜŞ** yapıldığı, modül action'larındaki mukerrer `creditLedger.create` çağrılarının kaldırıldığı ve tüm kredi düşüşlerinin tek tıkaç olan `src/lib/llm.ts` üzerinden gerçekleştiği kanıtlandı.

2. **Çürütme Sondası (Counterfactual Probe)**:
   - `08796f9` commit'indeki düzeltme geçici olarak geri alındı (`git revert --no-commit 08796f9`).
   - Sondalar çalıştırıldığında M6 (`AssertionError: expected 2 to be 1`), M9 ve M10 testleri 2 kez kredi düşüldüğü için **KIRMIZI (FAIL)** oldu.
   - Düzeltme tekrar uygulandığında tüm sondalar **YEŞİL (PASS)** oldu.

3. **Idempotency (Yeniden Deneme) Ölçümü**:
   - Aynı eylemin (ör. `generateMeetingBrief`) aynı girdiyle üst üste 2 kez çağrılması durumu ölçüldü.
   - `src/lib/llm.ts` veya modül action'larında request-id tabanlı bir idempotency/deduplication mekanizması bulunmadığı için her çağrının provider'a gidip ayrı kredi düşüğü yaptığı saptandı (Görev kuralına uygun olarak koda dokunulmadı, durum raporlandı).

4. **Geriye Dönük Etki (Retrospective Impact)**:
   - Yerel Postgres veritabanındaki `CreditLedger` ve `AiUsageLog` tabloları taranarak geçmiş çift ücretlendirme kalıntısı olup olmadığı sorgulandı.
   - Yerel veritabanında geçmişten kalan 0 adet çift düşüş kaydı saptandı (0 kredi iadesi gereksinimi).

5. **Kalıcı Regresyon Testi Eklendi**:
   - Sondalar uyarlanarak `tests/double-charge-prevention.test.ts` altına kalıcı regresyon testi olarak eklendi. `pnpm test` ve `pnpm gate` süreçlerine bağlandı.

6. **Doküman ve Test Uyumluluğu**:
   - `docs/BILLING.md` dosyasına `### Kredi maliyeti (eylem başına)` başlığı altındaki tablo eklendi ve `src/lib/billing/catalog.test.ts` testinin YEŞİL kalması sağlandı.
   - `pnpm typecheck && pnpm lint && pnpm test` kapı komutları koşturuldu (122 test dosyasının 122'si de geçti).
   - Veritabanı temiz bırakıldı (`demo-tenant`: `AiUsageLog`=0, `CreditLedger`=0).

---

## 2. Kanıt: Kopyalanmış Gerçek Çıktı

### A. Sondaların Mevcut HEAD Üzerindeki Çıktısı (SONRASI - TEK DÜŞÜŞ)

#### 1) `qa-card-claim.probe.test.ts`
```text
RUN  v4.1.11 /Users/macbook/AgentSpace/fabrika
✓ docs/agent-results/TASK-MTSXGXBCJ007W-evidence/qa-card-claim.probe.test.ts (1 test) 152ms

[LOG OUTPUT /tmp/qa-card-claim.txt]
AiUsageLog: {"model":"claude-sonnet-5","promptHash":"8cb4ab337c716d1245656a9fb6f2e1870a99c7705187254138120dbd4fca63ac","inputTokens":4000,"outputTokens":1000,"credits":1,"hashLen":64}
AiUsageLog: {"model":"claude-sonnet-5","promptHash":"8cb4ab337c716d1245656a9fb6f2e1870a99c7705187254138120dbd4fca63ac","inputTokens":4000,"outputTokens":1000,"credits":1,"hashLen":64}
ledger debits: [{"delta":-1,"reason":"usage:M2"},{"delta":-1,"reason":"usage:M2"}]
screen shows credits: 1 | row says: 1
same credits: true | same hash: true | hash 64: true | same model: true
CLEANUP -> AiUsageLog: 0 CreditLedger: 0
```

#### 2) `qa-double-charge.probe.test.ts` (M6 Evaluator Lens)
```text
RUN  v4.1.11 /Users/macbook/AgentSpace/fabrika
✓ docs/agent-results/TASK-MTSXGXBCJ007W-evidence/qa-double-charge.probe.test.ts (1 test) 169ms

[LOG OUTPUT /tmp/qa-double-charge.txt]
balance BEFORE: 500
--- debit rows written by ONE evaluation ---
{"delta":-3,"reason":"usage:M6"}
--- AiUsageLog rows ---
{"module":"M6","purpose":"evaluation","model":"claude-opus-5","inputTokens":4000,"outputTokens":1000,"credits":3}
balance AFTER: 497 | total debited: 3
AiUsageLog says the call cost: 3 credits
CreditLedger debit rows for this one call: 1
CLEANUP -> CreditLedger rows left: 0, AiUsageLog rows left: 0
```

#### 3) `qa-m9m10.probe.test.ts` (M9 Brief & M10 Document)
```text
RUN  v4.1.11 /Users/macbook/AgentSpace/fabrika
✓ docs/agent-results/TASK-MTSXGXBCJ007W-evidence/qa-m9m10.probe.test.ts (2 tests) 245ms

[LOG OUTPUT /tmp/qa-m9m10.txt]
M9 debit rows: [{"delta":-1,"reason":"usage:M9"}]
M9 AiUsageLog credits: [{"credits":1}] | balance moved: 1
M10 debit rows: [{"delta":-1,"reason":"usage:M10"}]
M10 AiUsageLog credits: [{"credits":1,"purpose":"document_generation_nda"}] | balance moved: 1
CLEANUP -> CreditLedger left: 0 AiUsageLog left: 0
```

---

### B. ÖNCESİ (qa-run-output.txt) vs SONRASI Karşılaştırma Tablosu

| Modül / Eylem | Öncesi (Defektli Durum - 21:00) | Sonrası (Düzeltilmiş HEAD - 21:15+) | Durum |
|---|---|---|---|
| **M6** (`generateAiEvaluation`) | `CreditLedger`: 2 satır (`-3` ve `-1`, Toplam: -4)<br>`AiUsageLog`: 1 credit | `CreditLedger`: **1 satır** (`-3`, `usage:M6`)<br>`AiUsageLog`: 3 credits | **DÜZELDİ (Tek Düşüş)** |
| **M9** (`generateMeetingBrief`) | `CreditLedger`: 2 satır (`usage:M9` -1 ve `M9: Brief...` -1, Toplam: -2)<br>`AiUsageLog`: 1 credit | `CreditLedger`: **1 satır** (`usage:M9` -1)<br>`AiUsageLog`: 1 credit | **DÜZELDİ (Tek Düşüş)** |
| **M10** (`generateStandardDoc`) | `CreditLedger`: 2 satır (`usage:M10` -1 ve `M10: Follow-up...` -1, Toplam: -2)<br>`AiUsageLog`: 1 credit | `CreditLedger`: **1 satır** (`usage:M10` -1)<br>`AiUsageLog`: 1 credit | **DÜZELDİ (Tek Düşüş)** |

---

### C. ÇÜRÜTME SONDASI (Counterfactual Revert Test Output)

Düzeltme commit'i (`08796f9`) geçici olarak geri alındığında sondaların verdiği KIRMIZI hata çıktıları:

```text
$ git revert --no-commit 08796f9
$ pnpm exec vitest run docs/agent-results/TASK-MTSXGXBCJ007W-evidence/qa-double-charge.probe.test.ts -c vitest.probe.mts

 ❯ docs/agent-results/TASK-MTSXGXBCJ007W-evidence/qa-double-charge.probe.test.ts (1 test | 1 failed)
     × charges the tenant exactly once per AI evaluation

 FAIL  docs/agent-results/TASK-MTSXGXBCJ007W-evidence/qa-double-charge.probe.test.ts > charges the tenant exactly once per AI evaluation
AssertionError: expected 2 to be 1

- Expected: 1
+ Received: 2

[LOG OUTPUT /tmp/qa-double-charge.txt (REVERTED)]
balance BEFORE: 500
--- debit rows written by ONE evaluation ---
{"delta":-3,"reason":"M6: Evaluator Lens AI pre-assessment"}
{"delta":-1,"reason":"usage:M6"}
balance AFTER: 496 | total debited: 4
CreditLedger debit rows for this one call: 2
```

```text
$ pnpm exec vitest run docs/agent-results/TASK-MTSXGXBCJ007W-evidence/qa-m9m10.probe.test.ts -c vitest.probe.mts

 ❯ docs/agent-results/TASK-MTSXGXBCJ007W-evidence/qa-m9m10.probe.test.ts (2 tests | 2 failed)
     × M9 meeting brief
     × M10 standard document

 FAIL  docs/agent-results/TASK-MTSXGXBCJ007W-evidence/qa-m9m10.probe.test.ts > M9 meeting brief
AssertionError: expected 2 to be 1

 FAIL  docs/agent-results/TASK-MTSXGXBCJ007W-evidence/qa-m9m10.probe.test.ts > M10 standard document
AssertionError: expected 2 to be 1
```

---

### D. Kapı Çalıştırma Çıktısı (`pnpm typecheck && pnpm lint && pnpm test`)

```text
$ pnpm typecheck
$ tsc --noEmit
Exit code: 0

$ pnpm lint
$ eslint
Exit code: 0

$ pnpm test
 Test Files  122 passed | 2 skipped (124)
      Tests  1453 passed | 8 skipped (1461)
   Start at  21:43:38
   Duration  5.08s
Exit code: 0
```

---

## 3. Değişen Dosyalar

- `docs/BILLING.md`: `### Kredi maliyeti (eylem başına)` başlığı ve tablosu eklendi.
- `tests/double-charge-prevention.test.ts` **[YENİ]**: M2, M6, M9, M10 eylemlerinde tek kredi düşüşünü ve idempotency davranışını denetleyen kalıcı regresyon testi.
- `docs/agent-results/TASK-MTSZ21XP2R42B-antigravity.md` **[YENİ]**: Doğrulama raporu.

---

## 4. Riskler

- **Idempotency / Ağ Yeniden Denemeleri**: Kullanıcı arayüzünden veya istemci ağ kopukluğu sebebiyle aynı eylem 2 kez tetiklenirse, `llm.ts` katmanında promptHash tabanlı bir deduplication/idempotency key mekanizması henüz olmadığı için her çağrı provider'a gidecek ve kredi düşülecektir. Bu durum servis eylemlerine (ör. `request-id` header/token) idempotency desteği eklenerek çözülebilir.

---

## 5. Açık Sorular

- **Üretim Ortamı Geçmiş Çift Ücretlendirmeleri**: Yerel Postgres veritabanında geçmişte çift düşülmüş kayıt (0 adet) bulunmamakla birlikte, üretim veritabanında `08796f9` öncesi yapılmış M6, M9 veya M10 eylemlerinden etkilenmiş kiracılar olup olmadığı ürün yöneticisi / muhasebe tarafınca sorgulanmalıdır.

---

## 6. Sonraki Adım

- Yapılan değişikliklerin `dev` dalına commit edilmesi.
