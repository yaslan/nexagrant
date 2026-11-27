---
version: 1
kart: NG-384
karttaki-id: TASK-MWYT4XIXQVWVB
ajan: qa-gnd
hüküm: Kısmen bitti: kod ve yerel kanıt tamam (5/5 tek başına, 3/3 tam paket, lint/typecheck/pre-commit, pnpm gate rc=0); PR CI sonucu push sonrası `gh pr checks` ile raporlanır. Kilit-kaldırma mutantı ile kırmızı tekrar-üretimi YAPILAMADI (aşağıya bak).
tip: bug (CI kırmızısı: paylaşımlı DB tabloları üzerinde kilitsiz canlı testler)
platform: Linux (WSL2 Ubuntu-24.04, Windows 11 ana makine üzerinden wsl.exe). CI Linux yerelde koşulmadı (yalnız GitHub Actions'taki PR kontrolü); macOS ve Windows-native koşulmadı.
dal: task/ng-384
commit: 3ec8903f
base: dev (origin/dev = ff8bcfbd)
izole-db: fabrika_test_ng384 (127.0.0.1:5684, konteyner ng384-pg)
---

# NG-384 — CI run 45919454769: üç canlı DB testinin test-DB kilidi düzeltmesi

## Ne yapıldı

Düzeltme yalnız test dosyalarında; ürün kodu, zaman aşımı ve retry değişmedi.

| Dosya | Değişiklik |
|---|---|
| `tests/helpers/test-db-lock.ts` | `STRIPE_WEBHOOK_LIVE_LOCK = 'StripeEventLog:webhook-live'` sabiti eklendi |
| `tests/stripe-webhook-idempotency-rls.live.test.ts` | `holdTestDbLock` ile dosya boyu kilit: `beforeAll` (wipe öncesi) → `afterAll` (wipe + `$disconnect`), `finally` ile serbest bırakma |
| `src/lib/billing/internal-plan.test.ts` | Aynı Stripe kilidi `beforeAll`'da tutuluyor, `afterAll`'da bırakılıyor; plan upsert'ü `PUBLIC_SECTOR_PLANS_LOCK` altında |
| `tests/rls-verify-system-scope-policy-set.live.test.ts` | NG-188 ve NG-183 testlerinin gövdesi ve `afterEach` (`dropStrays`) `EXPERT_DIRECTORY_POLICY_LOCK` altında |

Kilit sırası kontrolü: PUBLIC_LEAD (dosya) → EXPERT; aynı anahtarın iç içe alımı yok (deadlock riski yok).

Worktree notu: `git diff --numstat` yalnız bu 4 dosyayı gösteriyor (`9/2`, `9/0`, `31/22`, `11/2`). Worktree'de başka çok sayıda "M" işareti var (`.agentspace/`, `.claude/`, `CLAUDE.md` vb.; satır sonu CRLF/LF farkı — checkout artefaktı). Bunlar commit'e dahil edilmedi.

## Kanıt (ham özet)

### 1. Her dosya tek başına 5/5 (izole DB, `RLS_MUTATION_DB=fabrika_test_ng384`)

```
stripe-webhook-idempotency-rls.live.test-run1..5  rc=0  Tests  7 passed (7)
internal-plan.test-run1..5                        rc=0  Tests  13 passed (13)
rls-verify-system-scope-policy-set.live.test-run1..5 rc=0  Tests  7 passed (7)
SOLO_DONE  (15/15 rc=0)
```

Bu koşularda bu üç dosyanın hiçbir testi atlanmadı (skip = 0).

### 2. Tam paket paralel koşu, 3/3

```
full-run1 rc=0  Tests  9038 passed | 126 skipped (9164)
full-run2 rc=0  Tests  9038 passed | 126 skipped (9164)
full-run3 rc=0  Tests  9038 passed | 126 skipped (9164)
```

126 atlanan test üç dosyanın dışında; üç dosyada skip yok (bkz. 1).

### 3. Kilit-kaldıran mutant ile eşzamanlı koşu — KIRMIZI ÜRETİLEMEDİ

Mutant: `tests/stripe-webhook-idempotency-rls.live.test.ts` kopyası, `holdTestDbLock` çağrısı no-op. Aynı anda gerçek stripe testi ve gerçek internal-plan testi aynı DB'de koşuldu (2 tur).

```
concurrent-run1 mutant_rc=0 real_stripe_rc=0 real_plan_rc=0
  mutant-run1:  Tests  7 passed (7)
  real-stripe-run1:  Tests  7 passed (7)
  real-plan-run1:  Tests  13 passed (13)
concurrent-run2 mutant_rc=0 real_stripe_rc=0 real_plan_rc=0
  mutant-run2:  Tests  7 passed (7)
  real-stripe-run2:  Tests  7 passed (7)
  real-plan-run2:  Tests  13 passed (13)
```

Yorum: bu iki turda kilidin yokluğu kırmızıya dönmedi. Bu, kilidin gereksiz olduğu anlamına GELMEZ — yarış penceresi küçük ve wipe tenant-kapsamlı. Ama düzeltmenin etkisini bu deneyle kanıtlamış olmuyoruz; CI'daki kırmızının yeniden üretimi yapılamadı. İlk mutant denemesinde sed hatası (benim betik hatam, kilit mantığıyla ilgisiz) oldu; düzeltilip yeniden koşuldu, log'lar ayrıca saklı.

### 4. Lint, typecheck

```
pnpm lint      rc=0
pnpm typecheck rc=0
```

Commit öncesi pre-commit kancası (eslint + tsc, staged kapsam): "Kapı temiz (staged kapsamı)".

### 5. Tam `pnpm gate` (E2E_PORT=5510, RLS_MUTATION_DB=fabrika_test_ng384)

```
Kilit alındı (18 dk 13 sn beklendi)   — makine çapı gate kilidi, başka işler sırada
Test Files  632 passed | 4 skipped (636)
Tests       9038 passed | 126 skipped (9164)
e2e         738 passed (28.9m)
gate rc=0
```

### 6. m18 log durumu

`tests/m18-own-route-close.live.test.ts:286` beklenen negatif assertion (`permission denied for function close_own_province_routes`) içerir; tam pakette geçti. Bu iş onu değiştirmedi.

### 7. RLS_MUTATION_DB durumu

Yerel koşularda `RLS_MUTATION_DB=fabrika_test_ng384` verildi; mutasyon testleri (rls-verify dosyasında) koştu ve geçti. CI'da `RLS_MUTATION_DB` tanımlı değil; mutasyon `isGithubActions()` ile açılıyor.

## Değişen dosyalar

- `tests/helpers/test-db-lock.ts`
- `tests/stripe-webhook-idempotency-rls.live.test.ts`
- `tests/rls-verify-system-scope-policy-set.live.test.ts`
- `src/lib/billing/internal-plan.test.ts`
- `docs/agent-results/NG-384-qa-gnd.md` (bu dosya)

## Riskler

1. **Kapsam dışı, kilitsiz paylaşımlı-tablo yazıcıları:** `tests/stripe-event-retention.live.test.ts` (cross-tenant `stripeEventLog.deleteMany ... in`), `tests/stripe-webhook-tenant-scope.live.test.ts`, `src/lib/billing/pilot.test.ts` aynı tablolara yazıyor ve bu kilitleri almıyor. Görev bu üç dosyayla sınırlıydı; bunlar gelecekte benzer kırmızı üretebilir.
2. **Zaman aşımı:** NG-183 testi `EXPERT` kilidini bekleyebilir; varsayılan 30 sn timeout'a bağlı. Zaman aşımı artırılmadı (görev kuralı). Yerelde bekleme gözlenmedi; CI'da gözlenirse FAIL olarak ele alınmalı.
3. **Kilit kanıtı zayıf:** Yukarıdaki mutant deneyi kırmızı üretmedi. Kilidin ihtiyacı CI kırmızısı ve kod okumasına dayanıyor, deneyle ölçülmüş değil.
4. **Yerel checkout artefaktı:** Worktree'de `prisma/rls.sql` ve diğer dosyalar CRLF olarak materialize edilmişti; mutasyon testi LF metnini arıyor. LF normalizasyonu yalnız yerel çalışma ağacında yapıldı, commit'e girmedi.

## Açık sorular

- Kapsam dışı üç dosyanın da kilide alınması ayrı bir iş olarak açılmalı mı? (Bu iş kapsamında değil.)

## Sonraki adım

1. `git push -u origin task/ng-384` (pre-push kancası tam gate'i yeniden koşar; `E2E_PORT=5510`).
2. `gh pr create --draft --base dev` ile draft PR; açıklamada DoD işaretlenir.
3. `gh pr checks` sonucu bu dosyaya ve karta yazılır. CI kırmızıysa hüküm "Başarısız" olur.

## Definition of Done

- [x] Her dosya tek başına 5/5 yeşil (15/15 koşu, rc=0)
- [x] Tam paket paralel 3/3 yeşil (izole DB)
- [x] Kilit-kaldıran mutant eşzamanlı koşu: sonuç ham çıktıyla yazıldı — kırmızı ÜRETİLEMEDİ
- [x] Lint ve typecheck rc=0
- [x] Tam `pnpm gate` rc=0 (E2E_PORT=5510)
- [x] Yalnız 4 test/kaynak dosyası commit'lendi (`git show --name-only`); `git add -A` kullanılmadı
- [x] Testler gevşetilmedi: timeout, retry, skip yok
- [ ] Push (pre-push gate) ve draft PR (base dev) — push sonrası işaretlenecek
- [ ] `gh pr checks` sonucu — push sonrası işaretlenecek
- [x] Platform beyanı yazıldı (WSL2 Ubuntu-24.04; CI Linux yerelde değil; macOS/Windows-native yok)
