# TASK-MULQKFER4MF0Y — FB RLS bypass kapısı kırmızı (se-fb)

**Durum:** tamamlandı → review · **Dal:** `dev` · **Commit:** `2e932ca0` (kod + testler) · baseline değişikliği `e8a6b8e3` içinde (bkz. Riskler §1) · **Push:** yapılmadı (devop-fb kartında)
**Platform beyanı:** macOS (Darwin 27.0.0) üzerinde, fabrika-postgres :5433'e karşı doğrulandı. Değişen kod platformdan bağımsız: yalnız Prisma/Postgres işlem sarmalama var, süreç, dosya yolu ya da kabuk ayrımı yok. Windows ve Linux'ta koşulamadı, çünkü bu makinede yalnız mac var. Koddan beklenen davranış bu platformlarda da aynı.

## 1. Ne yapıldı

| Çağrı yeri | Önce | Sonra | Gerekçe |
|---|---|---|---|
| `src/lib/billing/stripe-event-retention.ts` `pruneOldStripeEvents` | `prisma.stripeEventLog.deleteMany` (CHECK A, yeni bypass) | `withSystemScope('cross-tenant-job', 'stripe-event-retention.prune', tx => …)` | Gece cron'u (`stripe-event-cleanup`) tüm kiracıların eski satırlarını tarihe göre siler. Kiracı kümesi WHERE'in ÇIKTISI olduğu için `withTenant`'a verilecek bir kiracı yok. Bu, `alerts-daily`/`m4-weekly-summary` ile aynı sınıf. Baseline'a CHECK D `system-scope` girdisi, dosyadan okunmuş gerekçeyle eklendi. |
| `src/lib/billing/create-portal-session.ts` | `prisma.subscription.findUnique` (borç) | `withTenant(tenantId, tx => tx.subscription.findUnique(…))` | `tenantId` zaten parametre. |
| `src/lib/billing/lifetime-licence.ts` `recordLifetimeLicence` | `prisma.lifetimeLicence.create` (borç) | `withTenant(tenantId, tx => tx.lifetimeLicence.create(…))` | Kiracı elde. P2002 dalı değişmedi: hata işlemden dışarı fırlıyor, `findRecorded` yeni bir işlemde koşuyor. |
| `scripts/tenant-bypass-baseline.json` | 3 borç/fixed + retention yok | `--prune` ile 3 girdi kapandı (`create-portal-session`, `lifetime-licence.create`, `subscription-sync` fallback) + retention D girdisi; `$comment` borç listesi güncellendi | — |

Ek olarak:
- `src/lib/billing/lifetime-licence.test.ts`: `@/lib/db` mock'una `withTenant` eklendi. Sahte istemciyi referansla veriyor, böylece `create` gözlenebilir kalıyor.
- `src/lib/inngest/jobs/stripe-event-cleanup.ts`: "No tenant isolation: all logs are system-wide" yorumu yanlıştı, `withSystemScope('cross-tenant-job')` olarak düzeltildi.
- Testler:
  - `tests/stripe-event-retention.live.test.ts` artık `fabrika_app` (NOBYPASSRLS) ile koşuyor. Fixture'lar sahip rolden kuruluyor. Yeni iki kiracılı süpürme testi eklendi.
  - Yeni `tests/billing-k1-tenant-scope.live.test.ts` (4 test, `fabrika_app`): portal okuması, çapraz kiracı okuma reddi, licence yazımı + idempotency, çapraz kiracı yazma reddi (`row-level security`).

## 2. Kanıt

**Kapı, önce:** `pnpm rls:bypass-check`, çıkış 1. `CHECK A … src/lib/billing/stripe-event-retention.ts:20`.

**Kapı, sonra (çalışma ağacı):** `pnpm rls:bypass-check` çıkış 0; `--prune` çıktısı:
```
Pruned 3 baseline entries:
  A|src/lib/billing/create-portal-session.ts|subscription.findUnique  1 -> 0
  A|src/lib/billing/lifetime-licence.ts|lifetimeLicence.create  1 -> 0
  B2|src/lib/billing/subscription-sync.ts|tenantId-fallback  1 -> 0
```
**Kapı, temiz worktree'de HEAD `c8dcef26`:** `25 call site(s) outside a tenant scope; baseline records 25.` `✅ SUCCESS … 0 still owed.` HEAD_GATE=0

**Diğer kapılar:** `pnpm typecheck` 0 · `pnpm lint` 0 · `pnpm rls:verify` 0 (`✅ 47 kiracıya özel tabloda politika yerinde … fabrika_app rolüyle GERÇEKTEN ölçüldü`).

**Tam test (`set -a; source .env; set +a; pnpm test`):**
```
Test Files  167 passed | 2 skipped (169)
     Tests  1966 passed | 8 skipped (1974)
```
**Atlanan: 8.** `tests/adapters.test.ts` 2, `tests/k1-daily-calls.test.ts` 4, `tests/sedia-adapter.test.ts` 2. Üçü de `RUN_LIVE_ADAPTER_TESTS` ile kapılı dış ağ testleri; bu kartla ilgisiz. Yeni ve değişen canlı testler atlanmadı.

**Mutasyon kanıtı** (sarma geri alındı → kırmızı → geri kondu → yeşil):
| Mutant | Test | Kapı |
|---|---|---|
| retention unwrapped (`prisma.stripeEventLog.deleteMany`) | `4 failed \| 1 passed`: `expected +0 to be 2` (iki kiracılı süpürme), `expected +0 to be 1` (diğer 3) | exit 1 |
| portal unwrapped | `1 failed`: `No Stripe customer found for tenant t-k1-a-…` | exit 1 |
| licence write unwrapped | `1 failed`: `Code: 42501 … new row violates row-level security policy for table "LifetimeLicence"` | exit 1 |
| hepsi geri konunca | `5 passed` / `4 passed` | exit 0 |

Mutantlar `fabrika_app` altında gerçek hatayı da ölçtü:
- retention sessizce 0 siliyordu ve bunu başarı diye raporluyordu;
- portal, ödeyen kiracıya "kurulumu tamamla" diyordu;
- ödenmiş lifetime lisansı kaydedilemiyordu.

## 3. Değişen dosyalar
`2e932ca0`:
- `src/lib/billing/stripe-event-retention.ts`
- `src/lib/billing/create-portal-session.ts`
- `src/lib/billing/lifetime-licence.ts`
- `src/lib/billing/lifetime-licence.test.ts`
- `src/lib/inngest/jobs/stripe-event-cleanup.ts`
- `tests/stripe-event-retention.live.test.ts`
- `tests/billing-k1-tenant-scope.live.test.ts`

`scripts/tenant-bypass-baseline.json`: içeriği benim hazırladığım baseline ile birebir aynı (diff ile doğrulandı), ama `e8a6b8e3` (be-fb) içine girdi.

## 4. Riskler
1. **Baseline aynı commit'e girmedi.** Kart, baseline'ın değişiklikle AYNI commit'te gitmesini istiyordu; bu sağlanamadı.
   - Ne oldu: be-fb'nin `orders.ts` girdisini hariç tutmak için süzülmüş baseline blob'unu `git update-index` ile PAYLAŞIMLI index'e yazdım. be-fb aynı dakikada index'i commit'ledi (`e8a6b8e3`). Böylece baseline benim kod commit'imden (`2e932ca0`) bir commit önce girdi. Üstelik be-fb'nin kendi `orders.ts` D girdisi dışarıda kaldı ve HEAD kapısı bir süre kırmızı oldu. be-fb bunu `c8dcef26` ile geri koydu; HEAD'de kapı yeşil.
   - Paylaşılan dalda geçmiş yeniden yazılmadı.
   - Öğrenim: paylaşımlı ağaçta ayrı `GIT_INDEX_FILE` ile commit et, ortak index'e blob yazma. Kendi commit'im bu yolla yapıldı.
2. `git worktree prune` iki yabancı "prunable" kaydı da temizledi (fabrika scratch `wt`, `.fabrika-d7-clean`). Bu kayıtların dizinleri zaten yoktu, yani yalnız eski metadata gitti. Diskte bir şey silinmedi.
3. `withSystemScope` bir uygulama-süreci sınırı değil. Açıklaması `src/lib/system-scope.ts`'de; ikinci rol kararı insanda (TASK-MTVTPVTEBCF5Z §6). Retention `deleteMany` işlem boyunca tüm kiracılara açık. Blok küçük tutuldu: tek sorgu.

## 5. Açık sorular
- `.env` satır 57 `EMAIL_FROM=Fabrika <no-reply@example.com>` tırnaksız. Bu yüzden istenen `set -a; source .env` zsh'de (parse error) ve bash'te (syntax error) o satırda duruyor. Ondan sonraki değişkenler, `DATABASE_URL_RLS_TEST` dahil, export EDİLMİYOR. Canlı RLS testleri `.env`'i kendileri okuduğu için koştu, ama komutun kendisi yanıltıcı. Değeri tırnaklamak gerek: yerel dosya, sahibine bırakıldı, dokunulmadı.

## 6. Sonraki adım
- devop-fb: `2e932ca0` + `c8dcef26` push (bu kart push etmedi).
- Kart → review.
