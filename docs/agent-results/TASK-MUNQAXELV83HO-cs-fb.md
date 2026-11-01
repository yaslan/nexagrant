# TASK-MUNQAXELV83HO — RBAC düzeltme: İNCELEME-59 B-1 / Y-1 / Y-3 · cs-fb

**Durum:** TAMAM (yeniden inceleme se-fb'de)
**Kaynak inceleme:** `docs/agent-results/TASK-MUNOE0Q4FR2J-se-fb.md` (480326f8)
**Dal:** `cs-fb/munqax-rbac`, dev `110c0b37` tabanlı; kod commit'i `7cf2fdd2`. dev'e `--no-ff` ile merge edildi (`62fd07c2`), push yok.
**İzole DB:** kendi konteynerim `csfb-rbac-pg` (127.0.0.1:5496, veritabanı `csfb_rbac`). Paylaşılan `fabrika` DB'sine yazılmadı.
**Platform beyanı:** Doğrulama mac'te yapıldı (Darwin 27, Node, vitest 4.1.11, pgvector/pg16 konteyneri). Değişen kod yolları platforma bağlı değil: sunucu tarafında rol karşılaştırması, route handler ve TypeScript AST taraması. Bekçi yolları `path.sep` ile normalize ediyor, bu yüzden Windows ve Linux'ta aynı sonucu beklerim. Windows ve Linux'ta koşulmadı, çünkü bu makinede yalnız mac var. CI (ubuntu) ilk push'ta Linux'u koşacak.

| # | Bulgu | Yapılan | Kanıt |
|---|---|---|---|
| **B-1** | GUEST_PARTNER `updateRelationship` ile yazıyordu | `requireTenantAction({ can: 'view_proposal' })` | H5 canlı: `throw:FORBIDDEN_ROLE`, satır aynı; davranış testi |
| **Y-1** | Bekçi 10 mutanttan 8'ini kaçırıyordu | Bekçi yeniden yazıldı, 11 kendi-mutant testi eklendi | mutants.py: **10'dan 9'u kırmızı**, önceden sağ kalan 8'den 7'si ölüyor; yalnız G5 sağ |
| **Y-3** | checkout rolsüz, portal ADMIN'e açık | checkout `manage_billing` → 403; portal rolleri rbac.ts'ten | Birim testi: 6 rol × 2 route, Stripe çağrısından ÖNCE 403 |

## 1) Ne yapıldı

### B-1: `updateRelationship`
- `src/app/[locale]/(app)/[workspace]/relationships/actions.ts`: `requireTenantAction()` → `requireTenantAction({ can: 'view_proposal' })`.
- GUEST_PARTNER'da `view_proposal` yok. Diğer beş iç rolde var. Yani yalnız dış partner kesildi.
- Nihai eşik KARAR 7'ye bırakıldı. Fonksiyonun yorumu bunu söylüyor.
- `ownerUserId` için mevcut `manage_workspaces` kontrolü duruyor.
- **Tutarsızlık notu (karar için):** Aynı `nextStep` alanını üç action farklı eşiklerle koruyor:
  - `createRelationship` ve `addInteraction` → `edit_proposal` (MEMBER yazamaz).
  - m4 `updateNextStep` → `edit_proposal`.
  - `updateRelationship` → artık `view_proposal` (MEMBER yazabilir).
  - Yani MEMBER bir ilişkinin `nextStep`'ini `updateRelationship` ile değiştirebiliyor, ama aynı alanı m4 `updateNextStep` ile değiştiremiyor. KARAR 7 bunu tek bir eşiğe bağlamalı. se-fb'nin güvenlik önerisi: `contribute_assigned` + `ownerUserId === userId`.

### Y-1: bekçi (`tests/server-action-rbac-guard.test.ts`)
Bir rol kontrolü artık yalnız action'ı durduran bir biçimdeyse sayılıyor:
- **Fırlatan ifade, kendi başına bir deyim olarak:** `requireTenantAction({ can: '<Action>' })`, `assertTenantActionRole(scope, '<Action>')` ya da `requirePlatformAdmin()`. `&&`, `||`, `?:` arkasında ya da bir geri çağrı içinde olmamalı.
- **`if (!<check>(…)) return|throw`**, `else` olmadan. `<check>` şunlardan biri: `can`, `isPlatformAdminSession`, `canArchiveOpportunity`, `canConfirmSeat`. Bu koşulların `||` ile birleşimi de sayılıyor; `&&` ile birleşimi yalnız hepsi kontrolse sayılıyor.
- **Aynı dosyadaki bir yardımcıya çağrı**, o yardımcının gövdesi yukarıdakilerden birini yapıyorsa.
- `<Action>` bir literal (ya da aynı dosyada tanımlı bir `const`) olmalı ve `rbac.ts`'in `Action` tipinde bulunmalı. Bu, G2'yi (`can: undefined`) ve uydurma izin adlarını kapatıyor.

**Sıra kuralı:**
- Her yazma, kendi yolunda bir kontrolden **sonra** gelmeli.
- `withTenant` geri çağrısı içindeki bir kontrol yalnız o geri çağrıdaki sonraki yazmaları kapsar. `if` bloğu içindeki bir kontrol yalnız o bloğu kapsar.
- Bu kural G6'yı kapatıyor. Pipeline'daki archive/declare (`canArchiveOpportunity` geri çağrı içinde) yeşil kalıyor.

**Yazma tespiti:**
- `<herhangi>.<model>.<yazma metodu>(…)` ya da `<model>.<yazma metodu>(…)`. `<model>` = `prisma/schema.prisma`'daki model adları (75 model).
- Artı `$executeRaw*`, hem çağrı hem tagged template biçiminde (eski bekçi tagged template'i görmüyordu).
- Kapatılan mutantlar: G3 (`(t)=>`), G4 (destrüktür), G8 (`prisma as client`).

**Diğer kapatılan boşluklar:**
- `export { fn }` / `export { fn as other }` artık okunuyor (G7).
- `export … from` biçimindeki re-export bulgu olarak çıkıyor, çünkü bekçi hedefini göremiyor.
- Satır içi `'use server'` fonksiyonları her dosyada taranıyor (G10). Satır içi action doğrudan yazarsa ALLOWED'da olsa bile bulgu çıkıyor. Portal formu ALLOWED'a eklendi: yalnız `addBudgetLineByToken`'a devrediyor.

**Kendi-mutant testleri (11):**
- G1: sonucu kullanılmayan `can`
- G1/B-1: gerçek `updateRelationship`'e koşullu `can`'ı geri koyma
- G2: `undefined` ve uydurma izin adı
- G3, G4, G8
- G6: gerçek `updateTenantProvince`'ta kontrolü yazmadan sonraya taşıma
- G7
- G10 ×2: portal sayfası ve rol kontrolsüz satır içi action
- G9: fail-closed, kırmızı kalıyor
- Yeşil kontrol: kabul edilen her biçim (const izin, `if(!can) throw` bloğu, yardımcı, geri çağrı içi kontrol) bulgu vermiyor. Böylece "her şeyi reddeden bekçi" yeşil geçemez.

**Kalan kör noktalar (dosyanın yorumunda da yazıyor):**
- G5: başka modüldeki bir yardımcı üzerinden yazma.
- Model erişimcisinin farklı adlı bir değişkende saklanması (`const e = tx.evidence; e.deleteMany()`).

**Davranış testi (`tests/server-action-rbac.test.ts`):**
- Tabloya `relationships.updateRelationship → view_proposal` eklendi (57 → 58).
- Gerçek akış testi eklendi:
  - MEMBER yazıyor; `updateMany` doğru `where { id, tenantId }` ile çağrılıyor.
  - GUEST_PARTNER `FORBIDDEN_ROLE` / `view_proposal` alıyor.
  - `withTenant` ve `updateMany` hiç çağrılmıyor.

### Y-3: billing
- **`src/app/api/billing/checkout/route.ts`:** `requireTenantApi()`'den hemen sonra `can(asRole(role), 'manage_billing')` kontrol ediliyor. Yoksa `403 { error: 'Forbidden', code: 'FORBIDDEN_ROLE' }` dönüyor. Bu ret pilot okumasından, fiyatlamadan, vergiden ve Stripe'tan önce geliyor.
- **`src/app/api/billing/portal/route.ts`:** sabit `['TENANT_OWNER','TENANT_ADMIN']` kaldırıldı. Yerine `Object.values(Role).filter(r => can(r, 'manage_billing'))` geldi, bugün yalnız OWNER. Artık ADMIN 403 alıyor.
- **`tests/billing-manage-billing-role.test.ts` (yeni):** Stripe modülü spy'larla değiştirildi ve route "canlı görünen" test anahtarıyla yüklendi.
  - 6 rolün her biri için beklenti `can()`'dan hesaplanıyor.
  - OWNER Stripe'a ulaşıyor: `checkout.sessions.create` / `billingPortal.sessions.create` çağrılıyor. Bu, testin "herkesi reddediyor" diye yeşil geçemeyeceğini gösteriyor.
  - Diğer beş rol 403 alıyor ve hiçbir spy çağrılmıyor.

## 2) Kanıt

Ekler: `docs/agent-results/TASK-MUNQAXELV83HO-cs-fb-ekler/`
- `i59-rbac-hostile.live.test.ts`: se-fb'nin dosyası. DB adı `csfb_rbac` yapıldı ve assert'li bir `H5-fix` testi eklendi.
- `live-run.txt`: partner token'ları maskelendi.
- `mutants-out.txt`
- `full-test-summary.txt`
- `psqlw.sh`: `apply-migrations.sh` için konteyner psql sarmalayıcısı.

**İzole DB kurulumu** (CI "Prepare database" adımlarının aynısı):
- `prisma db push` yerine `migrate diff --from-empty` + konteyner psql kullanıldı (AI koruması). Ardından `db:rls-role`, `apply-migrations.sh` ×2, `db:rls` ve `db:seed`.
```
✅ fabrika_app connects as fabrika_app, app.tenant_id unset by default.
apply-migrations: 38 files applied
apply-migrations: 38 files applied
✅ prisma/rls.sql applied. Policies in public: 28 → 112
Seeding completed with E10 data.
```

**H5 düşman çağrısı, canlı `csfb_rbac`** (`DATABASE_URL=…/csfb_rbac AUTH_SECRET=<ci> npx vitest run tests/i59-rbac-hostile.live.test.ts`):
```
H5 GUEST_PARTNER updateRelationship → throw:FORBIDDEN_ROLE; relA now {"notes":"orig","warmth":"cold"}
H5-fix GUEST_PARTNER updateRelationship → throw:FORBIDDEN_ROLE; relA before {"notes":"orig","warmth":"cold","ownerUserId":null} after {"notes":"orig","warmth":"cold","ownerUserId":null}
H5-fix MEMBER updateRelationship → ok:{"success":true}; relA.notes = member-wrote
 Tests  8 passed (8)
```
- Önce (se-fb): `ok:{"success":true}; relA now {"notes":"guest-wrote","warmth":"cold"}`.
- H1–H3, H6 ve H8 aynı sonuçları verdi. H1'de 10 yasak çağrının 10'u reddedildi.
- H4 ve H6 bu kartın kapsamında değil (Y-2 ve Y-4). Değişmeden duruyorlar.
- Fixture id'leri `live-run.txt`'deki `I59_FIXTURE` satırında. Silme yapılmadı.

**Mutantlar** (`python3 mutants.py`, se-fb'nin betiği aynen; worktree kökünde):
```
### G1 decoy can(): exit=1 … Tests  10 failed | 75 passed (85)
### G2 can: undefined: exit=1 … Tests  11 failed | 74 passed (85)
### G3 readOnly writes via (t)=>: exit=1 … Tests  10 failed | 75 passed (85)
### G4 readOnly writes via destructured client: exit=1 … Tests  10 failed | 75 passed (85)
### G5 readOnly calls cross-module writer: exit=0 Test Files  3 passed (3) | Tests  85 passed (85)
### G6 role check AFTER the write: exit=1 … Tests  2 failed | 83 passed (85)
### G7 export {} of local fn: exit=1 … Tests  11 failed | 74 passed (85)
### G8 prisma under another name: exit=1 … Tests  10 failed | 75 passed (85)
### G9 can spread from const: exit=1 … Tests  10 failed | 75 passed (85)
### G10 inline 'use server' in page: exit=1 … Tests  1 failed | 84 passed (85)
```
- **Önce 8/10 sağdı, şimdi 1/10 sağ (G5).** İstenen G1/G2/G3/G6/G7/G10'un hepsi ölüyor; G4 ve G8 de ölüyor.
- Her kırmızı mutantta ana tarama testi ("every write action checks the caller role…") kırmızı.
- Mutant başına 10–11 test düşüyor. Bunun sebebi mutant'ın `evidence/actions.ts`'e eklenmesi: aynı dosyayı okuyan kendi-mutant testleri de fazladan bulguyu görüyor. Bu beklenen bir durum.
- Her mutanttan sonra dosya geri yazıldı. `git status` yalnız benim dosyalarımı gösterdi.

**Bekçi ve hedefli testler:**
```
npx vitest run tests/server-action-rbac-guard.test.ts tests/server-action-rbac.test.ts tests/use-server-exports.test.ts tests/billing-manage-billing-role.test.ts
 Test Files  4 passed (4)
      Tests  98 passed (98)
```
- Bekçi 18/18 geçti.
- Tarama sayısı: 37 dosya / 128 action. Bu, se-fb envanterindeki 36 modül / 127 export + 1 satır içi action ile birebir tutuyor.

**Tam koşum:** `CI=true pnpm test`, `AUTH_SECRET='ci-vitest-auth-secret-fixture-not-for-any-deployment'` (ci.yml Test adımı), DB `csfb_rbac`.
- 1. koşum:
  ```
  Test Files  1 failed | 255 passed | 2 skipped (258)
       Tests  1 failed | 3121 passed | 9 skipped (3131)
  FAIL tests/teardown-where-guard.test.ts … "tests/stale-relationship-reminder.live.test.ts:395 where: args (not a const object literal)"
  ```
- 2. koşum (bekçideki tip düzeltmesinden sonra):
  ```
  Test Files  2 failed | 254 passed | 2 skipped (258)
       Tests  2 failed | 3120 passed | 9 skipped (3131)
  FAIL tests/oauth-registration.live.test.ts > … crw-fb's scenario … → Error: Test timed out in 5000ms.
  FAIL tests/teardown-where-guard.test.ts (aynı)
  ```
- **Bilinen kırmızı:** `teardown-where-guard`. Sebep `stale-relationship-reminder.live.test.ts:395`, benim dosyam değil. se-fb bunu TASK-MUNQ9IGG6R59R'de düzeltiyor.
- **`oauth-registration.live` zaman aşımı yük kaynaklı bir flake.** 1. tam koşumda yeşildi, tek başına 3 kez koşuldu: `Tests 20 passed (20)` ×3. Bu değişiklik auth/OAuth yoluna dokunmuyor.
- **Önceden var olan durum:** `billing-checkout-auth.test.ts`'in "signed-in tenant" testi DB'siz worktree'de dev `110c0b37` üzerinde de kırmızıydı (`getPilotState` DB okuyor). İzole DB ile tam koşumda yeşil.

**Merge sonrası (dev `62fd07c2`, se-fb'nin teardown düzeltmesi 47f75927 dahil):**
```
npx vitest run tests/server-action-rbac-guard.test.ts tests/server-action-rbac.test.ts tests/use-server-exports.test.ts tests/billing-manage-billing-role.test.ts tests/billing-checkout-auth.test.ts tests/teardown-where-guard.test.ts
 Test Files  6 passed (6)
      Tests  107 passed (107)
```
Birleşik dev'de bilinen kırmızı (`teardown-where-guard`) da yeşil.

**Typecheck / lint:**
```
$ tsc --noEmit   → typecheck_exit=0
$ eslint         → lint_exit=0
```

## 3) Değişen dosyalar
- `src/app/[locale]/(app)/[workspace]/relationships/actions.ts`: B-1.
- `src/app/api/billing/checkout/route.ts`, `src/app/api/billing/portal/route.ts`: Y-3.
- `tests/server-action-rbac-guard.test.ts`: Y-1, bekçi + 11 kendi-mutant testi + portal için ALLOWED satırı.
- `tests/server-action-rbac.test.ts`: B-1 tablo satırı + gerçek akış testi.
- `tests/billing-manage-billing-role.test.ts` (yeni): Y-3.
- `docs/agent-results/TASK-MUNQAXELV83HO-cs-fb.md` + `-ekler/`

## 4) Riskler
- **Portal davranış değişikliği:** TENANT_ADMIN artık "Faturalandırmayı yönet" düğmesinde 403 alıyor (`BillingClient.tsx`, `BillingActions.tsx`). Arayüz bu durumda `error` metnini gösteriyor. Düğmenin ADMIN'e hiç gösterilmemesi ayrı bir UI işi, bu kartta dokunulmadı.
- **Portal kiracı seçimi (kapsam dışı, not):** Route, oturumdaki `tenantId`'yi değil, kullanıcının `manage_billing` rolündeki **ilk** üyeliğini kullanıyor. Birden fazla kiracının sahibi olan bir kullanıcı yanlış kiracının portalını açabilir. Checkout oturum kiracısını kullanıyor. İkisinin hizalanması önerilir.
- **Bekçi daha katı:** Yeni bir action "if'in içinde `can`" gibi bir kalıpla yazılırsa CI kırmızı olur. Bu istenen davranış. Yanlış pozitif görülürse bekçi değil action düzeltilmeli, ya da gerekçesiyle ALLOWED'a eklenmeli.
- **G5 hâlâ açık:** readOnly action'ın başka modüldeki yazan bir yardımcıyı çağırması yakalanmıyor. Davranış testleri ve inceleme bu boşluğu kapatmaya devam etmeli.

## 5) Açık sorular
- **KARAR 7:** `updateRelationship`'in nihai eşiği ve `nextStep`'in üç action'da tek kurala bağlanması (§1 B-1 notu).
- **Portal:** TENANT_ADMIN'e yalnız görüntüleme (fatura listesi) açık kalsın mı? Bugün bu `/settings/billing` sayfasından zaten görülüyor. Portal ise ödeme yöntemi ve iptal yetkisi veriyor.

## 6) Sonraki adım
- **se-fb:** yeniden inceleme. `-ekler/i59-rbac-hostile.live.test.ts` (H5 / H5-fix) ve `mutants.py` aynen yeniden koşulabilir.
- **Dokunulmadı (patron kararı bekliyor):** Y-4 signDocument / çift onay, partner portal linki, updateNoteStatus, Y-2 JWT rol yenileme (TASK-MUNQB0GR306U0).
- **İzole DB temizliği:** `docker rm -f csfb-rbac-pg` (yalnız benim konteynerim, başka veri yok). se-fb yeniden testi için bıraktım; onay gelince kaldırırım.
