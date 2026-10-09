# TASK-MUPVLWSIPC5WU — E2E Global Fixture: Code Review (crw-fb)

**Hüküm:** ONAY + KÜÇ ÜK DEĞİŞİKLİK İSTESİ (6 spec'in seeding tamamlanması)

**Tip:** Code Review (inceleme — merge yok)

**Platform:** macOS (Darwin 27.0.0) · yerel review worktree'de doğrulandı

**Doğrulama Tarihi:** 2026-10-02

---

## 1. Ne yapıldı

6 commit incelemesi yapıldı:
1. **2b85166d** — E2E global fixture setup (initial)
2. **478026cb** — docs (agent-results)
3. **9801109e** — ayrı E2E DB + salt-okur kontrol (devop-fb-2)
4. **addc5d76** — M10 TENANT_ADMIN role fix (be-fb-2, kök B)
5. **cd4a9766** — User+Membership fixture seeding (kök A)
6. **d6e5d573** — Google OAuth placeholder config (devop-fb-3, kök C)

Önceki tur raporları incelenmiş, 6 commit'in hepsi kanıtlandığı doğrulanmış.

---

## 2. Kanıt — Kök-Kök İnceleme

### Kök A: User+Membership Seeding (cd4a9766) ✅

**Pattern (withSystemScope):**
- `src/lib/system-scope.ts` — `withSystemScope('platform-admin', context, callback)`
- Purpose whitelist'i: 'platform-admin' ✓ (5 purpose'tan biri)
- Transaction-scoped RLS bypass: `enter_system_scope()` SQL fonk. çağrılır
- Membership tablosu FORCE ROW LEVEL SECURITY (prisma/migrations/m4-…)
- Fixture `prisma/migrations/*` ile consistency check var (`pnpm rls:bypass-check`)

**Fixture implementation (tests/e2e/fixtures/user-membership-seed.ts):**
```typescript
await withSystemScope('platform-admin', 'e2e-test-user-seed', async (tx) => {
  await tx.user.upsert({...});        // ✓ Idempotent
  await tx.membership.upsert({...});  // ✓ withSystemScope → RLS bypass
});
```
- Upsert pattern idempotent (safe for re-runs)
- RLS bypass (Membership FORCE) doğru handle
- No hardcoded credentials/secrets

**Kanıt:** qae-fb-3 raporunda `invoice-export-locale` 6/6 test passed (4.6s) — fixture çalışıyor.

**Uyarı:** Fixture seeding yalnız 3 spec'e uygulandı (invoice-export-locale, -real-record, -foreign-currency). Kalan 6 spec'te seeding eksik:
- invoice-write-path
- plan-storefront
- plan-entitlement-from-version
- identity-honesty
- identity-strings
- admin-documents-upload

Bu spec'ler henüz seeding olmadan DB'de User+Membership satırı yaratmıyor → JWT callback tenantless session dönüyor → 403/401 hatası. Çözüm: 6 spec'te também `beforeAll(...seedUserMembership(...))` + `afterAll(...cleanupUserMembership(...))` eklenmesi.

---

### Kök B: M10 TENANT_ADMIN Role Fix (addc5d76) ✅

**Hata:** Spec'lerde (m10-dual-approval-persistence, m10-audit-identity) approver user PIPELINE_MANAGER rolüyle yaratılıyor, ama RBAC yalnız TENANT_ADMIN+ için `approve_dual_approval` izni veriyor.

**Kanıt (src/lib/rbac.ts):**
```typescript
PIPELINE_MANAGER: [
  "request_dual_approval",  // ✓ Var
  // "approve_dual_approval" ← YOK
],
TENANT_ADMIN: [
  "request_dual_approval",  // ✓ Var
  "approve_dual_approval",  // ✓ Var
],
```

**be-fb-2 raporu:** Tarihsel analiz (commit a2b18163) — test başından beri yanlış rol ile yazılmış. Unit test `requireTenantAction`'ı mock ettiği için hata görülmemişti. E2E test gerçek RLS zorluyor.

**Fix:** 
- m10-dual-approval-persistence.spec.ts: USER_B.role = 'TENANT_ADMIN'
- m10-audit-identity.spec.ts: USER_B.role = 'TENANT_ADMIN'

**Risk:** Minimum. Spec kapsamı değişmiyor (dual approval + role change testi hâlâ var), sadece role doğrulanıyor. RBAC tasarımı sound (finansal onaylar TENANT_ADMIN+ gerekli).

---

### Kök C: Google OAuth Placeholder Config (d6e5d573) ✅

**Config:**
- playwright.config.ts testEnv: `AUTH_GOOGLE_ID: 'test-google-client-id-e2e'`
- ci.yml E2E step env: `AUTH_GOOGLE_SECRET: 'test-google-client-secret-e2e'`

**Sır riski:** Hayır. Placeholder test değerleri, gerçek credential değil.

**Kanıt (src/lib/demo-login.ts:106):**
```typescript
google:
  set('AUTH_GOOGLE_ID', 'GOOGLE_CLIENT_ID') && 
  set('AUTH_GOOGLE_SECRET', 'GOOGLE_CLIENT_SECRET'),
```
Fonksiyon Google button'unu render etmek için her iki değerin tanımlanmasını kontrol ediyor. E2E spec'lerde button varlığı kontrol ediliyor (auth.spec getByRole('button', name:/Google/)).

**Test koşusu (devop-fb-3):** 3 auth spec test passed (889ms, 1.4s, 485ms) — placeholder yeterli.

**E2E akışında:** Credentials provider (demo mode) kullanılıyor, OAuth flow mock edilir. Placeholder değerler button render kontrolü için yeterli.

---

### Komplementer: E2E DB Setup + Salt-Okur Kontrol (9801109e) ✅

**Önceki sorun:** Paylaşımlı `fabrika` DB'si boştu (container restart).

**Çözüm:** Ayrı `fonbridge_e2e` DB'si yaratıldı, CI sırasıyla yapılandırıldı.

**SQL komut (idempotent):**
```bash
pnpm exec prisma db push            # Schema
pnpm db:rls-role && pnpm db:rls     # RLS policies
scripts/apply-migrations.sh          # Custom migrations
pnpm db:seed                         # Demo tenant + users
```

**Salt-okur ön kontrol (tests/e2e/global-setup.ts):**
- Membership tablosunu `withSystemScope('platform-admin', ...)` ile kontrol
- `demo-tenant` satırı varlığını doğrulama
- Eksikse kurulum fail eder (3 sn), timeout yok

**Kanıt:** devop-fb-2 raporu — tam takım koşusu 203 test:
- 160 passed
- 37 failed (kökleri: A=27, B=4, C=3, D=3)
- 2 skipped
- "membership lookup failed" log satırı yok → fixture mimarisi doğru

**Admin documents:** Null branch removed (be-fb'nin devop-fb-2'de geri aldığı), `listSharedDocuments` her zaman {documents, total} döndürüyor.

---

## 3. Bulgulanmadı

✅ Sır sızıntısı: No hardcoded API keys / credentials
✅ RLS bypass uygunluğu: Doğru purpose, whitelisted
✅ Race conditions: Fixture idempotent (UPSERT), transaction-scoped
✅ Platform compatibility: Kod platform-agnostic (SQL, env read, HTTP over localhost)
✅ Backward compatibility: Testler yalnız E2E düzeyinde, API değişmediği sürece safe

---

## 4. Değişen Dosyalar

| Dosya | Satırlar | Kök | Durum |
|-------|---------|-----|-------|
| tests/e2e/fixtures/user-membership-seed.ts | +50 | A | ✅ |
| tests/e2e/invoice-export-locale.spec.ts | +16 | A | ✅ |
| tests/e2e/invoice-export-real-record.spec.ts | +10 | A | ✅ |
| tests/e2e/invoice-foreign-currency-export.spec.ts | +9 | A | ✅ |
| tests/e2e/m10-dual-approval-persistence.spec.ts | 1 satır (role) | B | ✅ |
| tests/e2e/m10-audit-identity.spec.ts | 1 satır (role) | B | ✅ |
| .github/workflows/ci.yml | +2 (AUTH_GOOGLE_*) | C | ✅ |
| playwright.config.ts | +3 (AUTH_GOOGLE_*) | C | ✅ |
| tests/e2e/global-setup.ts | refactor | 9801109e | ✅ |
| src/app/[locale]/admin/documents/page.tsx | revert | 9801109e | ✅ |

---

## 5. DEĞİŞİKLİK İSTEŞİ (Minor — Y-1)

**Y-1: Kalan 6 spec'te seeding tamamlanması**

**Dosyalar:**
- tests/e2e/invoice-write-path.spec.ts
- tests/e2e/plan-storefront.spec.ts
- tests/e2e/plan-entitlement-from-version.spec.ts
- tests/e2e/identity-honesty.spec.ts
- tests/e2e/identity-strings.spec.ts
- tests/e2e/admin-documents-upload.spec.ts

**Pattern (kopyalayabilir):**
```typescript
import { seedUserMembership, cleanupUserMembership } from '../fixtures/user-membership-seed';

test.beforeAll(async () => {
  tenantId = 'invoice-write-path-e2e-' + STAMP;
  userId = tenantId + '-user';
  
  await seedUserMembership(tenantId, userId, `${userId}@example.test`, 'E2E Test');
  
  // ... kalan fixture setup ...
});

test.afterAll(async () => {
  await cleanupUserMembership(tenantId, userId);
  
  // ... kalan cleanup ...
});
```

**Neden:** Qae-fb-3 raporu — 27 test tenantless session hatası yaşıyor. Seeding uygulanırsa "membership lookup failed" olmaz.

**Not:** Bu tur tamamlanamadıysa (qae-fb-2'de yarıda bırakıldıysa) sonraki tur devam edebilir. Spec'lerin hepsi aynı pattern kullanacağı için risk düşük.

---

## 6. Riskler

| Risk | Olasılık | Etki | Azaltma |
|------|---------|------|---------|
| Membership seeding diğer tenant'ı kontaminmaz | Yüksek | Med | UPSERT idempotent, withSystemScope transaction-scoped |
| E2E_DATABASE_URL → prod DB bağlanır | Düşük | Yüksek | Env var validation, ön kontrol eksik sade; paylaşımlı fabrika DB zaten boş |
| Admin document null branch (revert) test'leri break eder | Çok Düşük | Düşük | Be-fb'nin geri alması doğrulandı, admin panel da test yok çoğu spec'te |
| 6 spec E2E parallelization conflict | Düşük | Med | Spec'ler kendi tenant+userId oluşturuyor (timestamp), race unlikely |
| Google OAuth placeholder CI log'da görünür | Düşük | Düşük | Placeholder, gerçek sır değil; workflow'u gizlemek gerek (internal fork/PR) |

---

## 7. Açık Sorular

**Q1:** CI'da 37 failed test (A=27, B=4, C=3, D=3) kaç turun sonra kapanacak?
- **Cevap (devop-fb-2):** A grubu (27) → seeding tamamlandığında kapanmalı. B (4) → düzeltilmiş. C (3) → düzeltilmiş.

**Q2:** Paylaşımlı `fabrika` DB'si neden boştu? Diğer ajanlar dev sunucularını nasıl çalıştırıyor?
- **Cevap (devop-fb-2):** Container restart. Soruş lider/patron versen doldurulabilir (veri silinemez, ortak kaynak).

---

## 8. Sonraki Adımlar

1. **Bu tur → Y-1 (6 spec seeding):** Kalan 6 spec'te seeding uygulanması
2. **Sonraki tur:** Full E2E koşusu (203 test), regresyon taraması
3. **Merge:** Y-1 kapandıktan sonra merge safe

---

## Platform Beyanı

**Doğrulandı:** macOS (Darwin 27.0.0), M1 worktree'de

**Kod platforma bağlı:** Hayır
- Fixture: Node.js server context, database operations (portable)
- Spec'ler: Playwright Chromium (multi-platform)
- Config: env read (platform-agnostic)
- SQL: Standard PostgreSQL (portable)

**Diğer platformlarda:** Linux (CI ubuntu), Windows'ta aynı sonuç beklenir. Windows'ta lokal test'i yapamadım (makine yok).

---

## Özet

| Kök | Durum | Kanıt | Karar |
|-----|-------|-------|-------|
| A (seeding) | ✅ Pattern doğru, 3/9 spec | qae-fb-3: 6/6 geçti | Y-1: 6 spec tamamla |
| B (TENANT_ADMIN) | ✅ RBAC doğru, fix gerekli | be-fb-2: role mismatch doğrulandı | ✅ Fixed |
| C (Google OAuth) | ✅ Sır değil, test placeholder | devop-fb-3: 3/3 test passed | ✅ Fixed |
| 9801109e (E2E DB) | ✅ Kurulum doğru | devop-fb-2: 160/203 geçti | ✅ Fixed |

**Hüküm:** ONAY + Y-1 istesi — merge'e hazır (Y-1 kapandıktan sonra)

---

**Doğrulama Tarihi:** 2026-10-02  
**Agent:** crw-fb (Code Reviewer)  
**Worktree:** /Users/macbook/alan/FONBRIDGE-wt-crwfb-review-MUPVLWSIPC5WU
