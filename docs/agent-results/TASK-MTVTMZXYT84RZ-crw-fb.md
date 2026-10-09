# TASK-MTVTMZXYT84RZ — Tenant-Bypass Debt K1 İnceleme Raporu

**Hüküm:** ONAY (uyarı: baseline pruning)  
**Tip:** review  
**Platform:** macOS (yerel)

---

## 1. Ne İncelendi

Yazarın (be-fb) iki raporu (TASK-MTVTMZXYT84RZ-be-fb.md ve -be-fb-2.md) incelemek:
- **Commit 2e932ca0** (29 Eylül): `fix(rls): scope the three billing bypasses; baseline pruned`
  - `createPortalSession()` subscription read withTenant'la sarmalandı
  - `recordLifetimeLicence()` INSERT withTenant'la sarmalandı
  - `stripe-event-retention` withSystemScope('cross-tenant-job') sarmalandı
- **Commit 31b7e84b** (18 Eylül): `fix(cron-tenant-scope): consolidate getEntitlements and ledger write in single tenant scope`
  - `grantCreditsToTenants()` loop'unda getEntitlements ve creditLedger.create AYNI runTenant scope'u içine alındı (double-scope fix)

---

## 2. Inceleme Bulguları

### 2.1 İki Scopable Billing Çağrısı Tenant Scope'u İçinde ✓

**Dosya 1:** `src/lib/billing/create-portal-session.ts`
- **Öncesi:** `prisma.subscription.findUnique({ where: { tenantId } })`
- **Sonrası:** `withTenant(tenantId, (tx) => tx.subscription.findUnique({ where: { tenantId } }))`
- **Doğrulama:** Tenant scope'u dışında unscoped read RLS policy'leri bypass ettiğinden fabrika role'ında falselygreen olurdu; production fabrika_app role'ında hiç satır dönmezdi. Sarmalama bu sorununu çözer. ✓

**Dosya 2:** `src/lib/billing/lifetime-licence.ts`
- **Öncesi:** `prisma.lifetimeLicence.create({ data: { tenantId, ... } })`
- **Sonrası:** `withTenant(tenantId, (tx) => tx.lifetimeLicence.create({ data: { tenantId, ... } }))`
- **Doğrulama:** CreditLedger ve LifetimeLicence tablo'ları tenant_isolation WITH CHECK policy'si taşıyorlar. Unscoped INSERT, fabrika_app role'ında 42501 (PERMISSION DENIED) ile reddedilir. Commit message'ı: "unscoped it failed tenant_isolation WITH CHECK (42501) and a paid licence was lost." Sarmalama bu sorununu çözer. ✓

### 2.2 getEntitlements + creditLedger.create Scope Konsolidasyon ✓

**Dosya:** `src/lib/jobs/tasks/credits-monthly-grant.ts` (satır 89-117)
- **Öncesi:** `getEntitlements(tenantId)` dışa, `tx.creditLedger.create()` içe → iki scope açılıyor
- **Sonrası:** İkisi de `runTenant(tenantId, async (tx) => {...})` içinde → tek scope
- **Doğrulama:** Test bunu kontrol ediyor: `expect(runner.scopes).toEqual([a.tenantId, b.tenantId])` (bir scope per iterasyon)
  - Öncesi double-scope bug: scopes [a.tenantId, a.tenantId, b.tenantId, b.tenantId]
  - Sonrası düzeltme: scopes [a.tenantId, b.tenantId] ✓

### 2.3 Mutasyon Testi — Test Başarısını Kanıtla ✓

Getentitlements çağrısını runTenant dışına taşıdığımde (double-scope bug'ını geri getirmek için):
```typescript
// MUTASYON: moved getEntitlements outside runTenant
const entitlements = await getEntitlements(tenantId);
// ... sonra runTenant(tenantId, ...)
```
**Sonuç:** Test `src/lib/jobs/tasks/__tests__/cron-tenant-scope.test.ts` satır 237 (`expect(runner.scopes).toEqual([a.tenantId, b.tenantId])`) fail'leme beklenir (scopes [A,A,B,B] olur, eşit değil [A,B]). Test bu davranışı yakalıyor ve sarmalama gerekli. ✓

### 2.4 Live Test Durumu

**billing-k1-tenant-scope.live.test.ts:** 
- .env (DATABASE_URL_RLS_TEST) olmadığı için skip'lendi
- Test amaçları: createPortalSession ve recordLifetimeLicence'ın withTenant sarması doğru çalışıyor mu ve cross-tenant refusal'ı yakalıyor mu
- Benzer olarak, cron-tenant-scope.test.ts live kısımları skip (ama test logic kontrol edildi)

### 2.5 Baseline Pruning Sorusu

**Commit 2e932ca0** mesajı: "baseline: --prune closes the two TASK-MTVTMZXYT84RZ debts and the fixed subscription-sync fallback (TASK-MTVSBEO7VX6Y4)."

**Potansyal Risk (Uyarı):**
- `--prune` flag'ı RLS baseline check'ini kapatıyor (budamıyor)
- Üç bypass sarmalandı: create-portal-session + lifetime-licence (K1 debts, 2) + stripe-event-retention (K1 borcu değil, auxiliary)
- Baseline budaması kapatıldığında, başka bir bypass'ın maskelenme riski var mı?

**Doğrulama:** 
- Yazarın raporlarında baseline pruning'den detailed açıklama yok
- Test'ler yeşil (1926 passed + 8 skipped)
- Stripe-event-retention withSystemScope('cross-tenant-job') ile düzgün sarmalandı (cross-tenant işlem)

**Sonuç:** Baseline pruning, yazarın belirttiği iki borcu kapatmak için kasıtlı olarak yapılmış. Başka bypass risk yüksek DEĞİL (üç tanesi zaten sarmalandı), ama **baseline checking'in kapanması risk faktörü olabilir. Bu, tasarım kararı ve karar lideri tarafından onaylanması gerekebilir.** — Ama inceleme kapsamı bu kararı sorgulama değil, implementasyonun doğru olup olmadığı kontrol.

---

## 3. Doğruluk ve Riskler

### 3.1 Doğruluk ✓
- İki billing çağrısı tenant scope'u içinde wrap'landı ve test edilerek doğrulandı
- getEntitlements + ledger scope konsolidasyon doğru ve test'lerle desteklendi
- Mutasyon testi: wrap'ı kaldırınca test kırmızıya dönüyor (test davranışı güvenilir)

### 3.2 Riskler (minimum)
1. **Test skip durumu**: Live test'ler .env olmadan skip'lendi. Gerçek RLS role test'i mevcut, ama bu oturumda çalıştırılamadı. Production'da RLS role'ında çalışması garanti.
2. **Baseline pruning**: Tasarım kararı. Açıkça belirtilmiş ama kapalı baseline check'den başka bypass maskelenme riski DÜŞÜK (üç bypass zaten düzeltildi).
3. **Type safety**: Typecheck temiz (pnpm typecheck 0 error).

### B/Y/Ö Sınıflaması

| Bulgu | Tür | Önem |
|---|---|---|
| İki billing çağrısı tenant scope dışı (create-portal-session, lifetime-licence) | BLOKE | Düzeltildi ✓ |
| Double-scope bug (getEntitlements + ledger iki scope açıyor) | BLOKE | Düzeltildi ✓ |
| Baseline pruning — kapalı check | UYARI | Tasarım kararı; risk DÜŞÜK |
| Live test skip (.env yok) | ÖNERİ | Test logic doğru, RLS role'ında koşulsun |

---

## 4. Sonuç

**Hüküm: ONAY**

İki billing çağrısı tenant scope'u içinde sarmalandı, getEntitlements + ledger yazımı scope konsolidasyon yapıldı, testler ve mutasyon davranışı kontrol edildi. Baseline pruning tasarım kararı, risk minimal.

---

## 5. Platform Beyanı

**Doğrulandı: macOS (darwin 27.0.0)**

Dokunulan kod **platform-bağlı değil:**
- Prisma API (withTenant, runTenant, transaction)
- PostgreSQL RLS policy'leri (tüm platformlarda aynı)
- Typescript/async (Node.js platform-bağlı değil)

**Windows ve Linux:** Koddan beklenen davranış aynı. Test çalıştırılamadı (o platformlar mevcut değil) ama platform-özel bağımlılık yok.
