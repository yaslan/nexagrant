---
sözleşme: 3
görev: TASK-MVFMLDMCD9Q3K
kod: FA-50
ajan: crw2-gnd
motor: claude
tip: hata
okur: kullanıcı
hüküm: Kısmen bitti: inceleme bulguları 2, 3, 5, 6 kapatıldı ve 9a8aca96 ile yerel commit'lendi (44/44 fixture, typecheck/eslint temiz, mutasyon kanıtlı), PR #121 gövdesi düzeltildi, CI'ın 1 sn'de düşmesi GitHub faturalama olarak kanıtlandı; push ATILMADI çünkü pre-push `pnpm gate` bu dalda FA-49/FA-51 merge'üne kadar tasarım gereği kırmızı ve "gate atlanmaz" denildi — push yolu karar bekliyor.
platform: mac (darwin 27.0.0, worktree /Users/macbook/alan/FONBRIDGE-crw2-fa50) ile koşuldu. Kod saf TS/regex, platforma bağlı yol/süreç/kabuk yok; Windows/Linux koşulmadı (gerekçe: statik tarayıcı + vitest, platform farkı beklenmez; fixture'lar tmpdir+git init kullanır, Windows'ta da çalışır).
sürüm: 1
tarih: 2026-10-19T21:29:12.449Z
---

# FA-50 · PR #121 düzeltmeleri (crw3-gnd incelemesi): bind muafiyeti sıkılaştırıldı, E1 düşüş-alıcı, PR gövdesi, CI nedeni

## Kararlar

```karar
kimlik: karar-1
soru: PR #121 düzeltmeleri (9a8aca96) yerelde; pre-push `pnpm gate` bu dalda FA-49/FA-51 merge'üne kadar tasarım gereği kırmızı (rls:bypass-check 3 bulgu) ve worktree'de DB yok. Push nasıl atılsın?
seçenek: A | --no-verify ile şimdi push
seçenek: B | FA-49+FA-51 merge sonrası tam gate ile push
öneri: A
karar_kimligi: K-570178
```

## Ne yapıldı

Kaynak: `docs/agent-results/TASK-MVFMLDMCD9Q3K-crw3-gnd.md`. Yalnız `scripts/tenant-bypass-scan.ts`, `scripts/check-tenant-bypass.ts`, `tests/tenant-bypass-scan.test.ts` değişti. `src/lib/billing.ts`'e dokunulmadı (K-570173=A → FA-51, dev-gnd). Ortak DB'ye `db:rls` uygulanmadı. Merge yok.

1. **Bulgu 2 — bind muafiyeti sıkılaştırıldı.** Yeni `qualifyingBindAt(block, cb)` (export, test edildi): bind yalnız `bindTransactionToTenant(<cb>,` ilk argümanıyla VE callback gövdesinin üst düzeyinde (süslü derinlik 1; `await` soyulunca önceki karakter `{` `;` `}`) duran bir ifadeyse sayılır. Sözcüksel kural, akış analizi değil; görülemeyen bind = çıplak blok (güvenli yön). `bindTransactionToTenant(prisma, id)` (P1), `if (x) await bind(tx,…)` (P2a), `if (x) { bind }` (P2b), sonraki satırda bind (P2c), iç fonksiyonda bind (P2d), `try { bind }` muaf ETMEZ. `src/lib/auth.ts:459` muaf kalır (gerçek ağaçta doğrulandı); `:836` helper'a devreden blok ne bulgu ne muafiyet (bilinen sınır, fixture'da pinlendi).
2. **Bulgu 3 — E1 düşüş-alıcı.** `bareTransaction(receivers)` E2 ile aynı alıcı listesini kullanır (`prisma` + `<x> ?? prisma`). `db.$transaction(…)` üzerinde `const db = client ?? prisma` → E1. Yan düzeltme: `$` ile başlayan tanımlayıcıda `\b` sınır görmüyordu → `escapeRegExp` + `(?<![\w$])` lookbehind (E1 ve E2 regex'lerinde).
3. **Bulgu 6 — PR gövdesi** `gh pr edit 121` ile yeniden yazıldı: üç bulgunun sahibi tablo hâlinde (admin/tenants + plan-repository → FA-49 [K-570174=A]; billing.ts:82 → FA-51 [K-570173=A / K-570156=A]); merge sırası FA-49 → FA-51 → PR #121; CI nedeni; doğrulama bölümü güncel.
4. **Bulgu 5 — CI.** Kök neden kanıtlı (aşağıda). Workflow dosyası DEĞİŞTİRİLMEDİ.

## Kanıt (ham çıktı)

**Fixture testleri (28 → 44):**
```
$ npx vitest run tests/tenant-bypass-scan.test.ts
 Test Files  1 passed (1)
      Tests  44 passed (44)
```

**Mutasyon kanıtı (her kural kendi testini kızartıyor, sonra geri alındı):**
```
MUTATION 1 (üst-düzey koşulu kaldırıldı)   → Tests  7 failed | 37 passed  (P2a, P2b, P2c, P2d, try-block, qualifyingBindAt ×2)
MUTATION 2 (ilk-argüman koşulu kaldırıldı) → Tests  2 failed | 42 passed  (P1, qualifyingBindAt)
MUTATION 3 (E1 alıcı yalnız prisma)        → Tests  3 failed | 41 passed  (düşüş-alıcı bozuk, bind'li düşüş-alıcı, $db)
```

**Gerçek ağaç, `pnpm rls:bypass-check` (origin/dev 80271979 + 9a8aca96):** tasarım gereği 3 E2 bulgusu aynen; muafiyet aynen:
```
❌ 3 tenant bypass(es) this baseline has never seen:
  CHECK E2
  src/app/[locale]/admin/tenants/page.tsx:25   tenants = await prisma.tenant.findMany({
  src/lib/billing.ts:82                         const tenant = await db.tenant.findUnique({
  src/lib/billing/plan-repository.ts:391        const plans = await prisma.plan.findMany({
ℹ CHECK E1 exemptions (K-570148 = A): 1 bare transaction block(s) …
  src/lib/auth.ts:459 — bound at :503, 3 tenant-scoped access(es) after it exempt
```

**typecheck / eslint:** `pnpm typecheck` → 0 hata; `npx eslint` (3 dosya) → 0 hata, 0 uyarı. Pre-commit kapısı: `✓ Kapı temiz (staged kapsamı)`.

**Tam `pnpm gate` (pre-push'un koştuğu komut, kanıt için elle koşuldu):**
```
$ pnpm db:generate && pnpm lint && pnpm typecheck && pnpm test && …
lint: ✖ 4 problems (0 errors, 4 warnings)   ← accept.ts, e2e fixture, settings-profile-update.test.ts; dev'den gelen, bu PR'ın dosyaları değil
test: Test Files  16 failed | 323 passed | 32 skipped (371) · Tests  56 failed | 4253 passed | 648 skipped (4957)
gate exit=1  (pnpm test'te durdu; i18n/rls:check/rls:bypass-check/rls:verify/e2e'ye hiç gelmedi)
```
Düşen 16 dosyanın hatası tek tip: `PrismaClientKnownRequestError … password authentication failed for user "fabrika"` (28P01) / `AuthenticationFailed` — worktree'de `.env` yok, canlı DB testleri. 16 dosyanın hiçbiri `tenant-bypass*`'ı import etmiyor (grep: 0). Gate ayrıca FA-49/FA-51 merge'üne kadar `rls:bypass-check`'te de yapısal olarak kırmızı kalır (yukarıdaki 3 bulgu, kartın kabul ölçütü).

**CI (bulgu 5) — kök neden:** `gh api repos/yaslan/fonbridge/check-runs/118261102221/annotations`:
```
annotation_level: failure
message: "The job was not started because recent account payments have failed or your spending limit needs to be increased. Please check the 'Billing & plans' section in your settings"
```
Job 0 adımla 1 sn'de kapanıyor (`steps: []`). `gh run list --workflow CI`: son 60 koşunun 60'ı failure, tüm dallar + dev push'ları; son **başarılı** CI koşusu 2026-10-04 (37212607921). Yani PR #121'e özgü değil; FO-32 (TASK-MVC36EFDB7VX8, devop-fb, backlog) zaten "faturalama düzelince CI'ı yeniden koşma" olarak takip ediyor. Çözüm ofis sahibinin GitHub Billing & plans ekranında; workflow değişikliği gerekmez.

**Commit (dar):**
```
$ git log --oneline -3   (öncesi) 31a784c1 / 80271979 / 9166a99d
$ git commit -F … -- scripts/tenant-bypass-scan.ts scripts/check-tenant-bypass.ts tests/tenant-bypass-scan.test.ts
9a8aca96 fix(rls-gate): tighten the CHECK E1 bind exemption and judge `client ?? prisma` transactions (PR #121 review)
$ git show --name-only HEAD → scripts/check-tenant-bypass.ts, scripts/tenant-bypass-scan.ts, tests/tenant-bypass-scan.test.ts
```

## Değişen dosyalar
- `scripts/tenant-bypass-scan.ts` (+84/−13): `bareTransaction()`, `bindCall()`, `escapeRegExp()`, `qualifyingBindAt()`; docstring (E1 alıcı + muafiyet koşulları); alıcı listesi E1'den önce hesaplanır.
- `scripts/check-tenant-bypass.ts` (+10/−3): E1 başlık, HOW_TO_FIX ve muafiyet bilgi metni bind koşullarını söylüyor.
- `tests/tenant-bypass-scan.test.ts` (+134): probe P1, P2a-d, try-block, await'siz bind, auth.ts:836 şekli, `qualifyingBindAt` birimleri, düşüş-alıcı bozuk/düzeltilmiş ikizi, `$db`.
- PR #121 gövdesi (GitHub, dosya değil). Worktree `/Users/macbook/alan/FONBRIDGE-crw2-fa50`, dal `task/task-mvfmldmcd9q3k`, **push edilmedi** (origin hâlâ 31a784c1).

## Riskler
- Commit yalnız yerel: PR #121 diff'i hâlâ 31a784c1; crw3-gnd yeniden inceleme push'a bağlı.
- Muafiyet kuralı sözcüksel: `try { bind }` ve helper içinde bind (oauth-registration.ts) muaf değil / görünmez — beyan edilmiş sınır, her ikisi fixture'da pinli. Bugünkü dev kodunda muaf blok yalnız auth.ts:459, değişmedi.
- CI kırmızı kaldıkça PR #121 (ve diğer tüm PR'lar) yalnız yerel kanıtla merge edilecek.

## Sonraki adım
Patron/lider push kararını verir (aşağıdaki karar). A ise: `git push --no-verify origin task/task-mvfmldmcd9q3k` + crw3-gnd yeniden inceleme. B ise: FA-49 + FA-51 merge'ünü bekle, dalı origin/dev üstüne al, `.env` ile tam gate, push. Sonra sıra: FA-49 → FA-51 → PR #121 merge → dev'de `pnpm gate`.
