# TASK-MUNRAS3B9WBY3 — İNCELEME-63: cs-fb RBAC düzeltmesinin yeniden incelemesi (TASK-MUNQAXELV83HO) · se-fb

**Durum:** TAMAM
**Karar:** ONAY. İNCELEME-59'un üç maddesi kapandı:
- **B-1:** GUEST_PARTNER canlıda `FORBIDDEN_ROLE` alıyor ve satır değişmiyor.
- **Y-3:** 6 rol × 2 route canlı DB'de denendi. Yalnız OWNER geçiyor, geri kalanlar Stripe çağrısından önce 403 alıyor.
- **Y-1:** eski 10 mutantın 9'u kırmızı, cs-fb'nin sonucu tekrarlandı.

Bu inceleme üç yeni bulgu çıkardı, hiçbiri engelleyici değil:
- **Y-A:** yeni mutantlarımın 14'ünden 13'ü bekçiyi geçiyor.
- **Y-B:** G5 ucuza kapatılabilir.
- **Ö-A / Ö-B:** billing portalıyla ilgili, bu commit'ten önce de vardı.

Bugün kodda bu kalıpların hiçbiri yok ve canlı bir açık yok. Takip kartı öneriyorum (§9).

**İncelenen:** dev `fbce5bd6`. Kod `7cf2fdd2`, merge `62fd07c2`, cs-fb raporu `9870ca2b` + `fbce5bd6`. Merge sonrası `src/` ve `tests/`, `7cf2fdd2` ile birebir aynı (`git diff --quiet 7cf2fdd2 HEAD -- src tests` → 0). Önceki inceleme: `TASK-MUNOE0Q4FR2J-se-fb.md` (İNCELEME-59).
**Ortam:** worktree `scratchpad/wt63` (detached `fbce5bd6`). İzole DB kendi konteynerimde: `sefb-i63-pg` (pgvector/pgvector:pg16, 127.0.0.1:55463). CI'daki "Prepare database" adımını birebir uyguladım:
1. `prisma db push`
2. `db:rls-role`
3. `apply-migrations.sh` iki kez (38/38). Host'ta psql olmadığı için konteynere giden shim kullandım: `ekler/psqlw.sh`.
4. `db:rls` (112 politika)
5. `db:seed`

**Platform beyanı:** Doğrulama mac'te yapıldı (Darwin 27, Node + vitest 4.1.11, Postgres Docker konteynerde). İncelenen kod yolları platformdan bağımsız: sunucu tarafında rol kontrolü, Prisma ve TS AST taraması. Bekçi `path.sep`'i `/`'e çeviriyor, bu yüzden Windows ve Linux'ta aynı sonucu beklerim. Windows ve Linux'ta koşulmadı, çünkü bu makinede yalnız mac var. CI (ubuntu) aynı suitleri koşuyor.

## Özet risk tablosu

| # | Önem | Bulgu | Konum | Durum |
|---|---|---|---|---|
| B-1 | — | GUEST_PARTNER artık `updateRelationship` ile yazamıyor | `relationships/actions.ts:97` | **KAPANDI**, canlı kanıtlı (§1) |
| Y-1 | — | İNCELEME-59'un G1–G4 ve G6–G10 mutantları artık kırmızı | `tests/server-action-rbac-guard.test.ts` | **KAPANDI**, mutant kanıtlı (§2) |
| Y-3 | — | checkout ve portal yalnız `manage_billing` (OWNER) ile açılıyor | `api/billing/{checkout,portal}` | **KAPANDI**, canlı kanıtlı (§5) |
| **Y-A** | Orta (test ağı, canlı açık yok) | Yeni 14 mutanttan 13'ü RBAC bekçisini geçiyor (ayrıntı aşağıda) | guard `establishes()`, `writeOf()`, `moduleOf()` | mutant kanıtlı (§4) |
| **Y-B** | Düşük | G5 hâlâ açık: readOnly action'ın başka modüldeki bir fonksiyonla yazması yakalanmıyor. ~40 satırlık transitif import takibiyle kapanıyor; bugün gerçek ağaçta 0 isabet var | guard, bilinen kör nokta | tarama kanıtlı (§2) |
| Ö-A | Düşük (önceden vardı) | Billing portal oturumdaki kiracıya bakmıyor; kullanıcının OWNER olduğu herhangi bir kiracıyı açıyor (`findFirst`, `orderBy` yok) | `api/billing/portal/route.ts:30-40` | canlı kanıtlı (§5 çapraz vaka) |
| Ö-B | Düşük (önceden vardı) | Portal 500 yanıtında iç hata metnini (tenant id dahil) istemciye döndürüyor | `portal/route.ts` catch | canlı (§5) |
| Ö-C | Düşük (CI kararlılığı) | `use-server-exports` ve bazı özellik/perf testleri yük altında varsayılan 5 sn timeout'a düşüyor. Tam koşumda 37 sahte kırmızı çıktı | `vitest.config.mts` testTimeout | koşum kanıtlı (§7) |

Y-A'nın mutant sınıfları (N numaraları §4'teki tabloda):
- Rol kontrolü sayılıyor ama action'ı durdurmuyor: N1, N2, N5, N13.
- Sahte ya da sabit kontrol: N3, N4.
- Yazma tespiti kaçırıyor: N6, N7, N8, N9, N12.
- Adsız `export default` hiç taranmıyor: N11.

## 1) H5 aynen yeniden (B-1)

`ekler/i59-live-rerun.txt`. İNCELEME-59 ekindeki `i59-rbac-hostile.live.test.ts` ile `i59-jwt-stale-role.live.test.ts`'yi aynen koştum. Tek değişiklik DB korumasındaki ad: `/sefb_i59` → `:55463/fabrika`.
Komut: `DATABASE_URL=…:55463/fabrika AUTH_SECRET=<ci.yml değeri> npx vitest run tests/i59-rbac-hostile.live.test.ts --reporter=verbose` → **Tests 7 passed**.
```
H5 GUEST_PARTNER updateRelationship → throw:FORBIDDEN_ROLE; relA now {"notes":"orig","warmth":"cold"}
```
Aynı koşumdan diğer sonuçlar:
- H1: MEMBER'ın `updateRelationship(relA,{ownerUserId})` çağrısı hâlâ `{"success":false,"error":"FORBIDDEN"}` alıyor; odak kişi ataması `manage_workspaces` ile korunuyor.
- H8: 6 rolün sonucu hâlâ `can()` ile birebir.
- H1–H3: yasaklı ve kiracılar arası çağrılar önceki gibi reddediliyor.

cs-fb'nin kendi birim testi (`server-action-rbac.test.ts` "relationship edit…") şunu da doğruluyor: MEMBER yazıyor, GUEST_PARTNER `withTenant`'a hiç ulaşmıyor.

## 2) G1–G10 aynen yeniden + G5 (Y-1)

`ekler/i63-old-mutants-out.txt`. İNCELEME-59'daki `mutants.py`'yi değiştirmeden wt63 kökünden koştum:
```
G1 exit=1 · G2 exit=1 · G3 exit=1 · G4 exit=1 · G5 exit=0 (85/85 yeşil) · G6 exit=1 · G7 exit=1 · G8 exit=1 · G9 exit=1 · G10 exit=1
```
Her kırmızı mutantta ilk düşen test gerçek src taraması ("every write action checks the caller role…"). Yani yakalayan bekçinin kendisi; yan testler değil. G6 ve G10'da yalnız bu test (ve G6'nın kendi-mutant testi) düşüyor. cs-fb'nin "9/10 kırmızı, yalnız G5 sağ" sonucu **tekrarlandı**.

**G5 neden sağ?** `Walker.node()` yalnız aynı dosyadaki yardımcılara iniyor (`this.mod.all.get(name)`). `import { scoreCandidatesForSeat } from '@/lib/scoring/consortium'` çağrısına girmiyor. Bekçinin doc-comment'i bunu bilinen kör nokta olarak yazıyor.

**Kabul edilebilir mi?** Bugün için evet, ama kapatılmalı (Y-B, düşük). Gerekçesi:
- Ölçtüm: `ekler/i63-g5-scan.cjs` ~40 satırlık bir betik. `@/` ve göreli import'ları 6 seviyeye kadar takip ederek readOnly action'ları tarıyor.
  - Gerçek ağaçta: `readOnly actions: 13; distinct imported callees followed from them: 37; readOnly actions reaching a Prisma write (any module): 0`
  - G5 mutantı uygulanınca: `WRITE app/…/consortium/actions.ts#getConflicts → lib/scoring/consortium.ts:170 tx.seatCandidate.deleteMany ; lib/scoring/consortium.ts:173 tx.seatCandidate.create`
- Bugün canlı bir açık yok, kapatmanın maliyeti de düşük.
- Aynı kör nokta readOnly dışında da var (N14): **yazma action'ında** modül dışı yazma rol kontrolünden **önce** yapılırsa (G6'nın modül dışı hâli) bekçi yeşil kalıyor. Transitif takip bunu da kapatır.

## 3) Yanlış pozitif ve mevcut action'lar

`ekler/rbac-suites-verbose.txt`. `npx vitest run tests/server-action-rbac-guard.test.ts tests/server-action-rbac.test.ts tests/use-server-exports.test.ts tests/billing-manage-billing-role.test.ts` → **Test Files 4 passed, Tests 98 passed**.
- Gerçek ağaçta bekçi temiz: "every write action checks the caller role…" ✓, "scans the real server action modules" ✓ (>25 dosya, >100 anahtar).
- Behaviour tablosu artık **58** action (57 + `updateRelationship`): "the table covers all 58 mapped actions" ✓. 58 × 6 rolün hepsi yeşil.
- **Gerçek kodda yanlış pozitif yok.** Sıkılaştırılmış bekçiyi geçirmek için `src/`'de hiçbir action yeniden yazılmadı: `7cf2fdd2` src'de yalnız 3 dosyaya dokunuyor (relationships, checkout, portal).
- ALLOWED'a eklenen tek girdi `portal/partner/[token]/page.tsx#inline:PartnerPortalPage:1`. Bu doğru, çünkü satır içi form yalnız `addBudgetLineByToken`'a devrediyor; o action da zaten ALLOWED'da ve token ile doğrulanıyor. Satır içi action kendisi yazarsa ALLOWED'dan bağımsız olarak reddediliyor (G10 mutantı kırmızı).
- Kasıtlı yanlış pozitif yoklamaları (§4 FP1–FP3):
  - `const ok = can(…); if (!ok) return` → **kırmızı**
  - `if (can(…)) { write }` → **kırmızı**
  - `try { requireTenantAction({can}); write } catch` → yeşil

  İlk ikisi fail-closed çalışan yanlış pozitifler, kabul edilebilir. Bekçinin hata mesajı kabul edilen biçimleri söylüyor. İsterse doc-comment'e "boolean değişkende tutulan `can` sayılmaz" diye eklenebilir.

## 4) Yeni mutantlarım (Y-A)

Betik `ekler/i63-mutants.py`, çıktı `ekler/i63-new-mutants-out.txt`. Her mutantı **yeni** bir `'use server'` dosyasına yazdım: `evidence/i63-mut.ts`, koşudan sonra silindi, `git status` temiz. Böylece bekçinin kendi-mutant testleri bozulmuyor; kırmızı çıkarsa bu yalnız gerçek src taramasından geliyor. Her mutantta `server-action-rbac-guard` + `server-action-rbac` + `use-server-exports` koşuldu (`--testTimeout=60000`, nedeni Ö-C).

**Pozitif kontroller:** C0 (rolsüz düz yazma) ve C1 (yazan readOnly) → ikisi de **kırmızı [RBAC bekçisi]**. Yani yeni dosya gerçekten taranıyor.

| # | Mutant | Sonuç | Gerçekte ne olur |
|---|---|---|---|
| N1 | `try { await requireTenantAction({ can }) } catch {}` sonra yazma | **sağ** | FORBIDDEN yutuluyor, yazma yapılıyor |
| N2a | `void requireTenantAction({ can: 'edit_proposal' })` (await yok) | **sağ** | promise reddi action'ı durdurmuyor |
| N2b | `await requireTenantAction({ can }).catch(() => null)` | **sağ** | aynı |
| N3a | aynı dosyada `const can = () => true` + `if (!can(role,'edit_proposal')) return` | **sağ** | sahte `can` |
| N3b | aynı dosyada boş `function requirePlatformAdmin() {}` | **sağ** | sahte kontrol |
| N4 | `if (!can('TENANT_OWNER', 'edit_proposal')) return` | **sağ** | çağıranın rolü hiç sorulmuyor |
| N5 | yardımcı `gate(skip){ if (skip) return; await requireTenantAction({can}) }` + `gate(true)` | **sağ** | yardımcının erken dönüşü "kontrol kurdu" sayılıyor |
| N6 | varsayılan parametrede yazma `(id, _w = prisma.evidence.deleteMany(…))` | **sağ** | parametre gövdeden önce çalışır; bekçi parametreleri gezmiyor |
| N7 | readOnly + `tx['evidence'].deleteMany` | **sağ** | element erişimi model sayılmıyor |
| N8 | readOnly + `withTenant(tenantId, wipeTx)` (aynı dosyadaki yazıcı referansla veriliyor) | **sağ** | yalnız çağrılan yardımcıya iniliyor. Bu kalıp kodda idiomatik: `src/lib/billing/pilot.ts:123` `withTenant(tenantId, read)` |
| N9 | readOnly + `` prisma.$queryRaw`DELETE … RETURNING id` `` | **sağ** | yalnız `$executeRaw*` yazma sayılıyor |
| N10 | `export const n10 = wrap(async …)` | kırmızı (**use-server-exports**) | RBAC bekçisi görmüyor, diğer bekçi yakalıyor |
| N11 | `export default async function (id) { … }` (adsız) | **sağ** | `moduleOf` adsız bildirimi atlıyor, use-server-exports da kabul ediyor |
| N12 | `const ev = tx.evidence; ev.deleteMany()` | **sağ** | doc-comment'te bilinen kör nokta |
| N13 | `skip?.(await requireTenantAction({ can }))` (`skip` undefined) | **sağ** | opsiyonel çağrı kısa devre yapıyor, argüman hiç değerlendirilmiyor |
| N14 | yazma action'ında modül dışı yazıcı, sonra `if (!can) return` | **sağ** | G5'in yazma action'ındaki hâli |

**14 mutanttan 13'ü RBAC bekçisini geçti** (N10'u başka test yakaladı).

**Değerlendirme:**
- Gerçek kodda bu 14 kalıbın hiçbiri yok. Bekçi bugün temiz, rol kontrolü de çalışma anında yapılıyor (§1, §5). Bu yüzden bu bir canlı açık değil, **regresyon ağının deliği**, ve engelleyici saymıyorum.
- Ama bekçinin doc-comment'i "a role check now counts only in a shape that stops the action" diyor. N1, N2 ve N5 kasıt gerektirmeyen, gerçekçi hatalar ve bu iddiayı çürütüyor:
  - try/catch ile loglama sarmalı (N1)
  - unutulmuş `await` (N2): `no-floating-promises` kuralı eslint'te açık değil
  - erken dönen yardımcı (N5)
- N3/N4 bilinçli hile gerektirir, kod incelemesinin işi.

**Önerilen düzeltme** (takip kartı, öncelik sırasıyla):
1. **Durduran biçim.** Throwing check yalnız `await <check>` (ya da senkron `assertTenantActionRole`) biçiminde ifade olarak sayılsın: `void`, `.catch`, `.then` ve opsiyonel zincir içinde sayılmasın. `try` bloğundaki bir kontrol, catch bloğu her yolda `throw` ya da `return` ile bitmiyorsa sonraki ifadeleri kapsamasın. Bu N1, N2 ve N13'ü kapatır.
2. **Yardımcı.** `statements()`'da `if (…) return` bir kontrolden önce geliyorsa, yardımcı "kontrol kurdu" sayılmasın. Bu N5'i kapatır.
3. **Yazma tespiti.** Element erişimli alıcı (`x['model']`) da model sayılsın. `$queryRaw*` içinde `INSERT|UPDATE|DELETE` geçiyorsa yazma sayılsın. Fonksiyona argüman olarak verilen aynı dosyadaki yardımcıya da inilsin. Parametre başlatıcıları da gezilsin. Bu N6, N7, N8 ve N9'u kapatır.
4. **Tarama.** `export default` (adsız) de taransın. Bekçinin kullandığı `can` / `requireTenantAction` / `requirePlatformAdmin` adlarının `@/lib/rbac` ya da `@/lib/tenant`'tan import edildiği doğrulansın; aynı dosyada tanımlıysa kontrol sayılmasın. Bu N3, N4 ve N11'i kapatır. N4 için `can`'in ilk argümanı string literal ise ret.
5. **G5/N14.** `ekler/i63-g5-scan.cjs`'deki transitif import takibi bekçiye taşınsın.
6. Ayrıca `@typescript-eslint/no-floating-promises` (type-aware) açılması N2'yi lint seviyesinde de yakalar.

## 5) Billing: 6 rol × 2 route (Y-3)

Test `ekler/i63-billing.live.test.ts`, çıktı `ekler/i63-billing-run.txt`. Gerçek izole DB kullanıldı; `requireTenantApi`, portalın `withSystemScope` üyelik okuması, pilot okuması, tier ve fiyatlandırma gerçek. Yalnız `auth()` ve Stripe SDK sahte (Stripe çağrıları sayıldı). Sonuç: **Tests 2 passed**.
```
TENANT_OWNER     can(manage_billing)=true  | checkout → 200  stripe=1 | portal → 500 No Stripe customer found for tenant … stripe=0
TENANT_ADMIN     can(manage_billing)=false | checkout → 403 FORBIDDEN_ROLE stripe=0 | portal → 403 No tenant found or insufficient permissions stripe=0
PIPELINE_MANAGER can(manage_billing)=false | checkout → 403 FORBIDDEN_ROLE stripe=0 | portal → 403 … stripe=0
WRITER           can(manage_billing)=false | checkout → 403 FORBIDDEN_ROLE stripe=0 | portal → 403 … stripe=0
MEMBER           can(manage_billing)=false | checkout → 403 FORBIDDEN_ROLE stripe=0 | portal → (çapraz test)
GUEST_PARTNER    can(manage_billing)=false | checkout → 403 FORBIDDEN_ROLE stripe=0 | portal → 403 … stripe=0
CROSS MEMBER(A)+OWNER(X): checkout(A) → 403 FORBIDDEN_ROLE stripe=0; portal → 500 (No Stripe customer found for tenant <X'in id'si>)
```
- **Portalda açık rol:** yalnız TENANT_OWNER. `BILLING_ROLES = Object.values(Role).filter(r => can(r,'manage_billing'))`, `rbac.ts`'teki `manage_billing` = yalnız OWNER ile tutarlı. ADMIN artık kapalı. OWNER'ın 500 alması rol kapısının ötesinde: test kiracısının Stripe müşterisi yok.
- **Checkout:** rol kontrolü pilot okumasından, fiyatlandırmadan ve Stripe'tan önce yapılıyor. Reddedilen 5 rolde Stripe çağrısı 0. OWNER 200 alıyor ve Stripe'a ulaşıyor (1 çağrı).
- **Ö-A (önceden vardı, bu commit'in işi değil):** çapraz vakada oturum kiracısı A olan MEMBER, portalda X kiracısının oturumunu açmaya çalıştı: hata metninde X'in id'si görünüyor. Bu bir yetki yükseltmesi değil, çünkü kullanıcı gerçekten X'in OWNER'ı. Ama portal oturum kiracısını yok sayıyor, ve birden çok kiracının sahibi olan bir kullanıcıda hangi kiracının açılacağı belirsiz (`findFirst`, `orderBy` yok). Öneri: sorguya `tenantId: session.tenantId` eklensin.
- **Ö-B:** portal 500 dönerken `err.message`'ı istemciye veriyor (tenant id ve Stripe hata metni). Öneri: genel bir mesaj dönsün, ayrıntı yalnız loglansın.

## 6) Ürün kararı bekleyen maddelere dokunulmamış (KARAR 4/7/8)

- `git diff --quiet 7cf2fdd2^ HEAD -- 'src/app/[locale]/(app)/[workspace]/concept-notes/' src/modules/m11/server/partner-link.ts src/modules/m10` → **değişmemiş**. KARAR 4 (`updateNoteStatus`), KARAR 8 (`issuePartnerPortalLink`) ve m10 (Y-4, bu kapsamın dışında) aynı.
- KARAR 7: relationships'te değişen tek kod satırı `requireTenantAction()` → `requireTenantAction({ can: 'view_proposal' })`. `ASSIGN_OWNER_ACTION = 'manage_workspaces'` (satır 91) aynı. Yorum da "Where the line finally sits is KARAR 7; this only keeps the outside partner out" diyor. İç rollerin hepsi hâlâ yazıyor, karar açık.
- Canlı teyit (§1'deki H6):
  - `WRITER updateNoteStatus(free-text status) → ok:{"success":true}` (KARAR 4 önceki hâlinde)
  - `WRITER issuePartnerPortalLink ×2 → ok … hash changed twice: true` (KARAR 8 önceki hâlinde)
  - `WRITER signDocument → success:true` (Y-4, TASK-MUNRAQA3OEZ83'te ele alınıyor)

## 7) Tam koşum (CI=true pnpm test, typecheck, lint)

Özet: `ekler/full-run-summary.txt`.
- Komut: `CI=true DATABASE_URL=…:55463/fabrika DATABASE_URL_RLS_TEST=fabrika_app@…:55463/fabrika AUTH_SECRET='ci-vitest-auth-secret-fixture-not-for-any-deployment' pnpm test`. AUTH_SECRET, ci.yml'deki Test adımının değeri.
- Kanıt testlerimi (`i59-*`, `i63-*`) koşudan **önce** ağaçtan çıkardım.

**Sonuç:** `Test Files 25 failed | 230 passed | 3 skipped (258) · Tests 37 failed | 2943 passed | 144 skipped (3124) · EXIT=1`.

**Kırmızıların hepsi yük kaynaklı**, 7cf2fdd2'den değil:
- Koşum sırasında makinenin yük ortalaması 40 ile 98 arasındaydı (`uptime`).
- 37 kırmızının 31'i `Test timed out in 5000ms`. Kalanlar zamana bağlı eşikler (`expected 3962.43 to be less than 3000`, PDF `parse_too_heavy`), `Connection terminated due to connection timeout` ×3 ve bir kez "Postgres is unreachable".
- Kırmızı 25 dosyanın `7cf2fdd2`'nin dokunduğu 6 dosyayla kesişimi **yok**.
- Aynı 25 dosya `--maxWorkers=1 --no-file-parallelism` ile yeniden koşuldu: `Test Files 1 failed | 24 passed (25) · Tests 1 failed | 436 passed (437)`. Kalan tek dosya `tests/withholding-rounding.test.ts` ("every net from 1 to 3000", 5795 ms timeout). Bu dosya tekil olarak iki kez koşuldu: **8 passed / 8 passed** (1020 ms / 904 ms).
- RBAC ve billing suitleri (§3) 98/98 yeşil.

**typecheck:** `pnpm typecheck` (`tsc --noEmit`) → **EXIT=0**. **lint:** `pnpm lint` (`eslint`) → **EXIT=0**, uyarı yok.

**Ö-C:** 5 sn varsayılan timeout, paylaşılan ve yüklü makinede 37 sahte kırmızı üretti. `use-server-exports` taraması boşta 3.6–4.3 sn sürüyor, eşiğe çok yakın. CI runner'ı daha boş, ama bu testler için açık bir `testTimeout` vermek flake riskini düşürür.

## 8) Değişen dosyalar
- `docs/agent-results/TASK-MUNRAS3B9WBY3-se-fb.md` (bu rapor)
- `docs/agent-results/TASK-MUNRAS3B9WBY3-se-fb-ekler/`: `i59-live-rerun.txt` (partner token'ları maskeli), `i63-old-mutants-out.txt`, `i63-mutants.py`, `i63-new-mutants-out.txt`, `i63-g5-scan.cjs`, `i63-billing.live.test.ts`, `i63-billing-run.txt`, `rbac-suites-verbose.txt`, `full-run-summary.txt`, `psqlw.sh`. Bunlar kanıt, test olarak repoya eklenmedi; `docs/**` vitest'in dışında kalıyor.
- Ürün koduna dokunulmadı. Worktree, mutant dosyaları silinmiş hâlde temiz.

## 9) Riskler, açık sorular, sonraki adım
- **Temizlik:** izole konteyner `sefb-i63-pg` ve worktree `wt63` iş bitince kaldırıldı (§10). İNCELEME-59'un `sefb_i59` DB'si zaten yoktu. `fabrika-postgres` üzerinde eski bir `sefb_mulql2` DB'si duruyor (se-fb adıyla, bu görevden değil). Patronun izole DB temizliği isteği kapsamında silinmesini öneriyorum, ama bu görevde oluşturulmadığı için dokunmadım.
- **Yol çelişkisi:** görev sarmalayıcısı sonucu `/Users/macbook/alan/docs/agent-results/TASK-MUNOE0Q4FR2J-se-fb.md`'ye yazmamı istiyordu. Bu yol hem repo dışında, hem de İNCELEME-59 raporumun adını taşıyor. Oraya yazmak önceki raporu taklit eder ya da ezer. Gövdedeki SONUÇ DOSYASI yolunu esas aldım.
- **Sonraki adım (takip kartı, cs-fb ya da be-fb):**
  - Y-A §4 öneri 1–4 ve Y-B/N14 (transitif import takibi). Her mutant bekçiye kendi-mutant testi olarak eklenmeli.
  - Ö-A: portal sorgusuna `tenantId: session.tenantId`.
  - Ö-B: 500 mesajı genelleştirilmeli.
  - Ö-C: açık `testTimeout`.
  - Hiçbiri merge'ü geri almayı gerektirmiyor.

## 10) Temizlik kanıtı
```
$ docker rm -f sefb-i63-pg            → sefb-i63-pg
$ docker ps -a | grep -c sefb-i63       → 0
$ git worktree remove --force …/wt63    ; git worktree list | grep -c wt63 → 0
```
