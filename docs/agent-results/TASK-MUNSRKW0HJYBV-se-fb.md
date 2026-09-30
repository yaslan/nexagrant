# TASK-MUNSRKW0HJYBV — FB TAKİP (İNCELEME-63 Y-A/Y-B + Ö-A/Ö-B/Ö-C) · se-fb

**Durum:** TAMAM
**Dal:** `se-fb/munsrk-rbac-guard`, dev `618dc024`'ten açıldı, kendi worktree'mde çalışıldı. Kapılar yeşil olduğu için dev'e merge edildi, push edilmedi.
**Kaynak:** İNCELEME-63 raporu `docs/agent-results/TASK-MUNRAS3B9WBY3-se-fb.md` §4, §2, §5, §7.
**Ekler:** `docs/agent-results/TASK-MUNSRKW0HJYBV-se-fb-ekler/`

**Platform beyanı:** Her şey mac'te doğrulandı (Darwin 27, Node + vitest 4.1.11, Postgres 16 Docker konteynerde).
- Bekçi saf bir TS AST taraması. Dosya yollarını `path.sep` → `/` ile, modül kimliklerini `path.posix` ile çözüyor. Bu yüzden Windows ve Linux'ta aynı sonucu beklerim.
- Portal route ve vitest ayarı platforma bağlı değil.
- Windows ve Linux'ta koşulmadı, çünkü bu makinede yalnız mac var. CI (ubuntu-latest) aynı suitleri koşuyor.

## Özet

| # | Bulgu (İNCELEME-63) | Ne yapıldı | Kanıt |
|---|---|---|---|
| **Y-A** | Yeni 14 mutanttan 13'ü RBAC bekçisini geçiyordu | Bekçi sıkılaştırıldı: durduran biçim, import doğrulaması, yardımcıda erken dönüş, yazma tespiti, default export. Her mutant bekçide kendi testine sahip | **14/14 kırmızı** [RBAC bekçisi]. 16 geri-almanın her biri tam hedef testini kırmızıya çeviriyor (§2) |
| **Y-B** | G5: başka modüldeki yazma görülmüyordu | Transitif import takibi eklendi: `@/` ve göreli import, barrel, `import * as`, default import; en fazla `MAX_DEPTH = 6` modül | G5 ve N14 kırmızı. 6 seviyeli overlay zinciri kırmızı, 7. seviye takip edilmiyor (§3) |
| **Ö-A** | Portal, oturum kiracısına bakmıyordu | Sorguya `tenantId: <oturum kiracısı>` eklendi, oturum `requireTenantApi()` ile okunuyor | Birim testte RED→GREEN (4→0). Canlı DB'de önce 3 kırmızı, sonra 4/4 yeşil (§4) |
| **Ö-B** | Portal 500 yanıtı iç mesajı (tenant id) döndürüyordu | Yanıt artık sabit cümle, ayrıntı yalnız logda | Birim ve canlı testte gövdede tenant id yok, logda var (§4) |
| **Ö-C** | Varsayılan 5 sn timeout ve duvar saati eşikleri yük altında sahte kırmızı üretiyordu | `vitest.config.mts`'e `testTimeout: 30_000` ve `hookTimeout: 60_000` eklendi. RAG olay-döngüsü testinde ürünün süre bütçesi yükseltildi. İNCELEME-45 eşiği duvar saati yerine CPU süresiyle ölçülüyor | Önce: 4 kırmızı (3 timeout + 1 bütçe), load 73–121. Son hâlde dev merge'ü sonrası **3/3 tam koşum yeşil** (3190/3190, load 19–52) (§5) |
| **Ö-D** (yeni) | `k1-embeddings.live` paralel bir nightly sweep ile yarışıyordu (7 koşuda 2 kırmızı) | Assertion `created` sayısı yerine TopicMatch satırlarına bakıyor | Zorla üretilen yarışta eski assertion `expected 0 to be 6`, yenisi yeşil (§5) |
| Kapılar | — | `tsc --noEmit`, `pnpm lint`, `pnpm build` (dev merge'ü sonrası da) | Üçü de EXIT=0 (§5) |

**Bekçi gevşetilmedi.**
- ALLOWED'a girdi eklenmedi.
- Mevcut hiçbir test gevşetilmedi.
- Gerçek `src/` ağacında **0 bulgu** var, yani yanlış pozitif yok. Transitif yürüyüş 80 modülde 321 fonksiyona girdi ve en fazla 4 seviye derine indi.
- FP1 ve FP2 (boolean'ı değişkende tutmak, `if (can) {…}`) İNCELEME-63'teki gibi fail-closed kırmızı kalıyor.

## 1) Y-A: bekçide ne değişti

Dosya `tests/server-action-rbac-guard.test.ts`. Doc-comment yeni kuralları anlatıyor. Değişiklikler:

| Mutant | Kural |
|---|---|
| N1 | `try` içindeki kontrol, `try` sonrasını kapsıyor ama yalnız her `catch` çıkış yapıyorsa (throw ya da return). Yardımcı fonksiyonda `catch` yeniden fırlatmak zorunda. |
| N2, N13 | Kontrol yalnız ifadenin kendisi olduğunda sayılıyor: `await check(…)`, `check(…)` ya da `const x = await check(…)`. `void`, `.catch`/`.then`, `?.`, başka bir çağrının argümanı olarak sayılmıyor. Async kontroller (`requireTenantAction`, `requirePlatformAdmin`) `await` gerektiriyor. |
| N3 | Kontrol adı, tanımlandığı modülden import edilmiş olmalı (`CHECK_SOURCES`: `can`→`lib/rbac`, `requireTenantAction`/`assertTenantActionRole`/`requirePlatformAdmin`/`isPlatformAdminSession`→`lib/tenant`, …). Aynı dosyada tanımlanmış ya da başka modülden gelen bir `can` kontrol sayılmıyor. |
| N4 | `can`'in (ve `canConfirmSeat`'in) rol argümanı sabit olamaz: string literal, `Role.X` ya da string `const` reddediliyor. |
| N5 | Yardımcı fonksiyon, kontrolünden önce `return` edebiliyorsa kontrol kurmuş sayılmıyor. Kontrolü `return` ile reddeden yardımcı da sayılmıyor (`if (!can) return {ok:false}` çağırana bir şey söylemez), yalnız `throw` sayılıyor. |
| N6 | Parametre varsayılanları gövdeden önce geziliyor. |
| N7 | `tx['evidence']` (element erişimi) model sayılıyor. |
| N8 | Çağrılmayıp referans olarak verilen fonksiyon (`withTenant(t, wipeTx)`) referans noktasında geziliyor. |
| N9 | `$queryRaw` ve `$queryRawUnsafe` içindeki SQL'de `INSERT/UPDATE/DELETE/…` varsa yazma sayılıyor. |
| N10 | Fonksiyon olmayan export (`export const x = wrap(…)`) reddediliyor. |
| N11 | Adsız `export default async function` ve `export default async () =>` taranıyor. |
| N12 | Model erişimcisini tutan değişkenler (`const ev = tx.evidence`, `{ evidence: ev }`) takma ad olarak izleniyor. |

Her mutant için bekçinin kendi-mutant testi var. Bunlar `describe('İNCELEME-63 N1–N14')` altında, varyantlarıyla birlikte (N2c, N3c, N4b, N5b/c, N9b, N11 arrow, N12b). Kabul edilen biçimler testine üç yeni yeşil örnek eklendi: `try{check; write}catch{return}`, `catch` loglayıp yeniden fırlatan, ve `throw` eden yardımcı.

**Mutant betiği (İNCELEME-63, değiştirilmeden):** `ekler/i63-mutants-final-out.txt`. Her mutant yeni bir `'use server'` dosyasına yazılıyor, sonra siliniyor.
```
C0 → KIRMIZI [RBAC bekçisi] · C1 → KIRMIZI [RBAC bekçisi]
N1 N2a N2b N3a N3b N4 N5 N6 N7 N8 N9 N10 N11 N12 N13 N14 → hepsi KIRMIZI [RBAC bekçisi]
FP1 → KIRMIZI (fail-closed, önceki gibi) · FP2 → KIRMIZI (fail-closed, önceki gibi) · FP3 → YEŞİL
```

Her bulgu doğru nedenle düşüyor (ilk koşunun çıktısından):
- `n1: writes before any role check covers them: tx.evidence.deleteMany`
- `n7: readOnly: true but writes: tx['evidence'].deleteMany`
- `n9: … prisma.$queryRaw (writing SQL)`
- `n10: exported value is not a function the guard can read`
- `default: write action without a role check`
- `n14: writes before any role check covers them: tx.seatCandidate.deleteMany (lib/scoring/consortium.ts:170, via runScoring (lib/scoring/consortium))`

**İNCELEME-59 G1–G10 yeniden:** `ekler/i59-mutants-rerun.txt`. 10/10 kırmızı. **G5 artık kırmızı**, ve onu yalnız gerçek src taraması yakalıyor ("every write action checks…").

## 2) Kendi-mutant testleri bekçiyi gerçekten koruyor mu? (geri-alma testi)

Betik `ekler/guard-reverts.py`, çıktı `ekler/guard-reverts-out.txt`. Her sıkılaştırmayı tek tek geri aldım ve bekçi dosyasını koştum. Sayılan şey **hangi testin** düştüğü, exit kodu değil:

```
R1 catch çıkmak zorunda değil      → × N1 …            R9  $queryRaw yazma değil        → × N9 …
R2 await gerekmiyor                → × N2 …            R10 fonksiyon olmayan export yok → × N10 …
R3 import doğrulaması yok          → × N3 …            R11 adsız default atlanıyor      → × N11 …
R4 sabit rol kabul                 → × N4 …            R12 takma ad yok                 → × N12 …
R5 yardımcıda erken dönüş yok      → × N5 …            R13 opsiyonel çağrı sayılıyor    → × N13 …
R6 parametre gezilmiyor            → × N6 …            R14 modül dışı yürüyüş yok       → × N14/G5 + × G5 6-seviye
R7 element erişimi model değil     → × N7 …            R15 MAX_DEPTH = 1                → × G5 6-seviye
R8 referans takip edilmiyor        → × N8 …            R16 server-action sınırı yok     → × gerçek src taraması (yanlış pozitif)
```
16 geri-almanın 16'sında tam hedef testi kırmızıya döndü. Her testin bir işi var.

## 3) Y-B: G5 transitif takip

`Walker.follow()` şunları izliyor:
- aynı dosyadaki fonksiyonlar (derinlik değişmez),
- `@/` ve göreli import'lar (adlı, default ve namespace),
- `export { a } from` ve `export *` barrel'ları.

Bir modülden ötekine geçiş en fazla `MAX_DEPTH = 6` seviye. Modüller önbellekte tutuluyor.

**İki bilinçli sınır:**
1. **TRUSTED** (`lib/db`, `lib/tenant`, `lib/rbac`, `lib/system-scope`, `lib/auth`) modüllerine girilmiyor. Bunlar kiracılığın ve kontrollerin kendisi: `withTenant`'in `$executeRaw` ile RLS kiracısını ayarlaması action'ın yazması değil. Onlara verilen callback, action'ın yazdığı yerde geziliyor.
2. **Başka bir `'use server'` modülünün export'u** (başka bir action) içine girilmiyor. O da bir uç ve kendi kontrolü kendi yerinde yargılanıyor; çağıran onu atlatamaz. Bu sınır olmadan gerçek ağaçta tek bir yanlış pozitif çıkıyor: `portal/partner/[token]/page.tsx` satır içi action'ı, token ile doğrulanan `addBudgetLineByToken`'a devrediyor ve bu "writes directly" diye işaretleniyor (R16).

**Testler:**
- *N14 / G5*: gerçek `lib/scoring/consortium.ts`. Kontrolden önce çağrılınca ve readOnly altında kırmızı, kontrolden sonra çağrılınca yeşil.
- *6 seviye*: `overlay` ile sanal `lib/i63/l1 … l6` zinciri kuruluyor (barrel, `export const` arrow, `import * as`, `export default` içeriyor). l6'daki yazma bulunuyor: `prisma.evidence.delete (lib/i63/l6.ts:2, via wipe (lib/i63/l6))`. Bir modül daha eklenince (7. seviye) takip edilmiyor. Bu sınır doc-comment'te yazıyor.

**Gerçek ağaç ölçümü** (geçici sayaçla alındı, sayaç geri alındı): `modules=80 functions=321 maxDepth=4`. Bulgu sayısı 0. Tarama süresi: bekçi dosyası boşa yakın makinede 188 ms test / 1.1 sn toplam (yeni testlerden önce), 33 testle load ~50'de 2.0 sn test / 10.3 sn toplam (import 7.9 sn).

**Hâlâ görülmeyenler** (doc-comment'te yazılı): fonksiyon argümanıyla ya da nesne içinde taşınan model erişimcisi, dinamik `import()` ya da `require` arkasındaki yazma, 6 seviyeden derindeki yazma.

## 4) Ö-A / Ö-B: billing portal

`src/app/api/billing/portal/route.ts`:
- `auth()` + `session.user.id` yerine `requireTenantApi()` kullanılıyor. Kiracısız oturum 401 `TENANT_SCOPE_REQUIRED` alıyor, `{ write: true }` yok: süresi dolmuş pilot da ödeme yapabilmeli.
- Üyelik sorgusu `where: { userId, tenantId: sessionTenantId, role: { in: BILLING_ROLES } }`. Rol, JWT'den değil DB satırından okunuyor. Bayat JWT rolü ancak signIn'de yenileniyor, bu yüzden bu tercih bilinçli.
- `catch` artık `{ error: 'Failed to create portal session' }` ile 500 dönüyor. `console.error` ayrıntıyı logluyor.
- **cs-fb çakışması (TASK-MUN80XIW5NPV1 O-2):** `cs-fb/mun80x-api-hardening` dalında ve worktree'sinde `src/app/api/billing/` altında bir değişiklik yok (`git diff dev...cs-fb/mun80x-api-hardening -- src/app/api/billing/portal/route.ts` boş). Değişikliği küçük tuttum (route'ta +13/−16). Merge'de çakışma çıkarsa bu dosyadaki 500 satırı cs-fb'nin genel kalıbına uyarlanabilir.

**Birim testi** (`tests/billing-manage-billing-role.test.ts`, 4 yeni test; üyelik mock'u artık `where.tenantId`'ye uyuyor):
- MEMBER(A)+OWNER(X) → 403, Stripe 0
- iki kiracının sahibi → oturumdaki kiracı (`withTenant('tenant-A', …)`)
- kiracısız oturum → 401, okuma yok
- 500 gövdesi sabit cümle; tenant id gövdede yok, logda var

Sonuçlar:
- Eski route: `Tests 4 failed | 13 passed (17)`
- Yeni route: `Tests 17 passed (17)`

**Canlı test** (izole DB `sefb-munsrk-pg`, :55464). Test dosyası `ekler/munsrk-portal.live.test.ts`; repoya eklenmedi. Yalnız `auth()` ve Stripe SDK sahte. `requireTenantApi`, `withSystemScope` ve `withTenant` gerçek. A ve X kiracılarının Stripe müşterileri `cus_A` ve `cus_X`.

Eski route (`ekler/portal-live-before.txt`, tenant id maskeli):
```
CROSS MEMBER(A)+OWNER(X) session=A → 200 {"url":"https://billing.stripe.test/cus_X"} stripe=1 customer=cus_X
OWNER-BOTH session=A → 200 customer=cus_X; session=X → 200 customer=cus_X
O-B session=N → 500 body={"error":"No Stripe customer found for tenant <tenantId-maskeli>. …"} bodyHasTenantId=true
Tests 3 failed | 1 passed (4)
```

Yeni route (`ekler/portal-live-after.txt`):
```
CROSS MEMBER(A)+OWNER(X) session=A → 403 {"error":"No tenant found or insufficient permissions"} stripe=0 customer=null
CROSS same user session=X → 200 customer=cus_X
OWNER-BOTH session=A → 200 customer=cus_A; session=X → 200 customer=cus_X
O-B session=N → 500 body={"error":"Failed to create portal session"} bodyHasTenantId=false logHasTenantId=true
Tests 4 passed (4)
```

Eski route'ta iki kiracının sahibi, A'dayken bile X'in portalını alıyordu (`findFirst`, `orderBy` yok). Bu artık yok.

## 5) Ö-C ve tam koşum

**Kök neden:** vitest'in 5 sn varsayılan timeout'u boş makine için bir bütçe. Yük altında en çok şunlar düşüyor:
- tarama testleri (her tutar × her oran),
- kaynak tarayıcılar,
- canlı fixture'lar.

**Düzeltme:**
- `vitest.config.mts`: `testTimeout: 30_000` ve `hookTimeout: 60_000`, gerekçesiyle birlikte yorumda. Kendi bütçesini veren testler bütçesini koruyor; takılan bir test yine düşüyor.
- `tests/rag-pdf-real-parse.test.ts`'teki "İNCELEME-45 shape" (30 000 sayfa ayrıştırılmadan reddedilir) duvar saatiyle `< 3000 ms` ölçüyordu. Yük altında 3.34 sn okudu (İNCELEME-63'te 3.96 sn). Ölçüm artık süreç CPU süresi (`process.cpuUsage`, işçi thread'i dahil). Eşik aynı: 3000 ms. Ölçülen değerler (`ekler/i45.txt`, load ~25): duvar 499–733 ms, CPU 725–1053 ms. Korunan regresyon (30 000 sayfayı ayrıştırmak) her iki ölçüde de onlarca saniye tutar.
- `tests/rag-pdf-worker-isolation.test.ts`'teki "İNCELEME-52 shape" testi olay döngüsünü ölçüyor, süre sınırını değil. Süre sınırı bir sonraki test tarafından 500 ms ile ayrıca doğrulanıyor ve dokunulmadı. Bu testte `maxParseMs` 150 sn'ye, test timeout'u 180 sn'ye çıkarıldı. Assertion'lara dokunulmadı: `worstGapMs < 500` ve ping sayısı aynı.

**Tam koşumlar** (hepsi izole DB'de; env: `CI=true`, `AUTH_SECRET` = ci.yml değeri). Özet `ekler/full-run-summary.txt`:

| Koşu | load (başta→sonda) | Sonuç |
|---|---|---|
| Önce (timeout düzeltmesi yok, bekçi değişikliği var) | 73 → 121 | `4 failed \| 3149 passed`. 3 × `Test timed out in 5000ms` (withholding-rounding 6.5 sn, vat-by-country 5.3 sn, invoice-writer 9.9 sn) ve RAG `parse_too_heavy` (30.3 sn) |
| Sonra #1 (tsc + lint aynı anda) | 55 → 47 | `1 failed \| 3152 passed`. **Timeout yok.** Kırmızı olan `k1-embeddings.live` (aşağıda Ö-D) |
| Sonra #2 | 28 → 53 | `3153 passed`, EXIT=0 |
| Sonra #3 | 53 → 59 | `3153 passed`, EXIT=0 |

**Ö-D (yeni, düşük önem, bu görevde düzeltildi):** `tests/k1-embeddings.live.test.ts` "k1-topic-match now writes rows…" testi 7 tam koşumun 2'sinde `expected 1 to be 6` ile düştü. Tekil koşumda yeşil. Bu bir timeout değil.
- **Kök neden (koddan):** `tests/topic-match-nightly.live.test.ts:240` gerçek `k1TopicMatchTask`'i koşuyor. Bu task daraltılmamış bir `recomputeAllTopicMatches({ now })` çalıştırıyor (`src/lib/jobs/tasks/k1-topic-match.ts:22`) ve paralel koşan k1 dosyasının kiracılarını k1'in gömülmüş topic'lerine karşı önceden puanlıyor. Böylece k1'in kendi koşusu satırları `created` değil `updated/unchanged` olarak sayıyor.
- **Düzeltme:** assertion `r.created + r.updated + r.unchanged === 6` ve DB'de `(T_A, T_B) × MY_TOPICS` için 6 TopicMatch satırı. Testin iddiası ("embedded tenants için satır yazılır") aynen duruyor; hiç satır yazılmazsa test yine düşer.
- **Kanıt:** yarışı zorla ürettim (k1 çağrısından önce daraltılmamış bir sweep). Eski assertion `AssertionError: expected +0 to be 6` ile düştü, yeni assertion `6 passed`. İki dosya birlikte ×2 koşuldu: `15 passed`.

**dev merge'ü sonrası koşumlar:** dev `cdb85b2c`'yi dala aldım. Bu merge cs-fb'nin API sertleştirmesini ve yeni `add-api-key-rate-window` migrasyonunu getirdi. İzole DB sıfırdan kuruldu: 39/39 migrasyon ×2, 112 politika, seed (`ekler/db-prep-merged.txt`). İlk denemem geçersizdi: zsh `$E` değişkenini kelimelere bölmediği için DB env'i hiç geçmedi. Aynı dosya adlarıyla açık env kullanarak yeniden koştum.

| Koşu | load | Sonuç |
|---|---|---|
| merged-1 | 34 → 41 | `3190 passed`, EXIT=0 |
| merged-2 | 41 → 59 | `1 failed`: İNCELEME-45 duvar saati `3336 < 3000` → CPU'ya çevrildi |
| merged-3 | 22 → 47 | `1 failed`: k1 (Ö-D) → düzeltildi |
| merged-4 | 47 → 53 | `3190 passed`, EXIT=0 |
| **merged-5 / 6 / 7 (son hâl)** | 19 → 52 | **`3190 passed \| 22 skipped` ×3, EXIT=0 ×3** |

Portal canlı testi merge edilmiş kodda da `4 passed` (`ekler/portal-live-merged.txt`).

**Kapılar (merge öncesi ve merge sonrası son hâl, `ekler/full-run-summary.txt`):**
- `npx tsc --noEmit -p .` → EXIT=0
- `pnpm lint` → EXIT=0, çıktı yok
- `pnpm build` → EXIT=0 ("Compiled successfully", 31/31 statik sayfa)
- RBAC ve billing suitleri (`server-action-rbac-guard`, `server-action-rbac`, `use-server-exports`, `billing-manage-billing-role`) → `Test Files 4 passed · Tests 117 passed` (`ekler/rbac-suites-verbose.txt`)

## 6) Değişen dosyalar
- `tests/server-action-rbac-guard.test.ts`: bekçi (Y-A, Y-B) ve 16 yeni kendi-mutant testi (18 → 33 test)
- `src/app/api/billing/portal/route.ts`: Ö-A, Ö-B
- `tests/billing-manage-billing-role.test.ts`: portal için 4 yeni test, kiracıya uyan üyelik mock'u
- `vitest.config.mts`: Ö-C
- `tests/rag-pdf-worker-isolation.test.ts`: Ö-C, yalnız olay-döngüsü testinin bütçesi
- `tests/rag-pdf-real-parse.test.ts`: Ö-C, İNCELEME-45 eşiği CPU süresiyle ölçülüyor
- `tests/k1-embeddings.live.test.ts`: Ö-D
- `docs/agent-results/TASK-MUNSRKW0HJYBV-se-fb.md` ve `…-ekler/`: kanıt. Ekler vitest'in dışında (`**/docs/**` hariç tutuluyor).

## 7) Riskler
- **Daha sıkı bekçi, yeni kodda daha çok kırmızı demek.** Özellikle şu biçimler artık reddediliyor: `if (!can) return` yapan yardımcı, `try { check } catch { log }`, `const ok = can(…)`. Hata mesajı kabul edilen biçimleri söylüyor. Bugün gerçek kodda 0 bulgu var.
- **TRUSTED listesi bir güven kararı.** `lib/db` ya da `lib/tenant` içine gerçek bir iş yazması eklenirse bekçi onu görmez. Liste kısa tutuldu ve doc-comment'te gerekçelendirildi.
- **Server-action sınırı.** readOnly bir action başka bir *write* action çağırırsa bekçi bunu işaretlemez. Çağrılan action kendi `requireTenantAction`'ını (pilot kapısı ve rol) çalışma anında koşuyor, bu yüzden açık değil. Ama "readOnly" etiketi o çağrı için yanıltıcı olur.
- **Ö-C.** 30 sn timeout gerçek bir yavaşlamayı 6 kat daha geç yakalar. CPU ölçümü, I/O'da bekleyen bir yavaşlamayı göremez; ama bu testin koruduğu şey CPU işi (30 000 sayfa). `db.ts` `connectionTimeoutMillis: 1000` değişmedi. İNCELEME-63'te 3 kez "Connection terminated due to connection timeout" görülmüştü, bu görevin 11 geçerli tam koşusunda hiç görülmedi.
- **cs-fb'nin `api-error-body-guard`'ı** yalnız `errorMessage(…)` kalıbını arıyor. Eski portaldaki `err.message ||` biçimini yakalamazdı. Bugün `src/app/api` altında bu biçimde yalnız `admin/topic-stats/import` var ve o, tipli 4xx doğrulama mesajları; 500 sızıntısı değil. Bekçinin `\.message` biçimini de kapsaması cs-fb'ye öneri.

## 8) Açık sorular
- `topic-match-nightly.live`'daki gerçek task çağrısı daraltılmamış kalmaya devam ediyor. Başka bir paralel canlı dosyanın TopicMatch sayılarını da bozabilir. Task'a test için `tenantIds` geçirilebilmeli mi? Bu küçük bir ürün değişikliği olur, bu yüzden bu görevde yapmadım.
- `@typescript-eslint/no-floating-promises` (type-aware lint) açılsın mı? N2'yi lint seviyesinde de yakalar. Bekçi artık bunu kendisi yakalıyor, bu yüzden isteğe bağlı.

## 9) Sonraki adım
- İnceleme: cs-fb ya da crw-fb. Bekçinin yeni kurallarına karşı kendi mutantlarını denesinler.
- Temizlik: izole konteyner `sefb-munsrk-pg` ve worktree kaldırılıyor (§10).

## 10) dev'e merge ve temizlik

**Merge:** `f23d79cc` (`--no-ff`, dev `4981483b` üzerine). Son rebase'imden sonra dev yeni `src` değişiklikleri almıştı (sayfa hatalarıyla ilgili). Merge temiz geçti. Birleşik commit'i ayrıca doğruladım (`ekler/dev-merge-summary.txt`):
- RBAC, billing ve api-error-body suitleri: `Tests 119 passed`. Sıkılaştırılmış bekçi yeni `src`'de de 0 bulgu veriyor.
- Tam `vitest run` ×2 (load 11 → 68): `3240 passed | 22 skipped`, EXIT=0 ×2.
- `tsc` EXIT=0 · `lint` EXIT=0 · `build` EXIT=0.
- **Push yapılmadı.**

**Temizlik:**
```
$ docker rm -f sefb-munsrk-pg              → sefb-munsrk-pg
$ docker ps -a | grep -c sefb-munsrk        → 0
$ git worktree remove --force …/scratchpad/wt ; git worktree list | grep -c 85137787 → 0
```
`se-fb/munsrk-rbac-guard` dalı yerelde duruyor. Merge edildiği için silinebilir; silme kararını lidere bırakıyorum.
