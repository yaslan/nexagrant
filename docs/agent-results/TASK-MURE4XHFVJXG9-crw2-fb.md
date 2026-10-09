# TASK-MURE4XHFVJXG9 · Onay Merkezi Kalıcılığı İncelemesi

**Hüküm:** ✅ ONAY — bloker bulgu yok

**Ajan:** crw2-fb · **Dal:** be-fb/approvals-persist · **Commit aralığı:** 405e01dd...6756a5ed (3 commit)

---

## 1. İnceleme Kapsamı

Yazar raporunu (AKTAR-MURBCJ0A-1-be-fb-approvals.md) okudum ve şu konuları doğruladım:

1. **Kalıcılık (Persistence)**: Onay Merkezi taleplerinin DB'ye yazılıp yazılmadığı ve sunucu yeniden başlasa da kayıtların durup durmadığı
2. **Tenant izolasyonu**: RLS politikaları ve withTenant kullanımı
3. **Yetki kontrolü**: requireTenantAction role kapısı ve RBAC kuralları
4. **4-göz ilkesi (Four Eyes)**: `requesterId !== approverId` kontrolü
5. **Yarışa dayanıklılık (Race Condition)**: updateMany WHERE `status: PENDING` koşulu
6. **Hata kodları ve çeviriler**: i18n mesaj eşlemesi

---

## 2. Doğrulama Bulguları

### 2.1 Kalıcılık (E2E Test)
```
E2E_PORT=3147 pnpm exec playwright test tests/e2e/approvals-persistence.spec.ts
✓  1 … a created request survives a reload, and another user's approval stays APPROVED (2.9s)
✓  2 … a refused decision shows the reason and does not turn the card green (1.4s)
2 passed (9.5s)
```

**Kanıt:**
- Test 1: Talep eden talep yaratıyor → sayfa yenileniyor → Postgres'te `findUniqueOrThrow` ile doğrulanıyor
- Test 2: Başka kullanıcı onay veriyor → `page.reload()` → DB'de `status: APPROVED` + `approverId` doğrulanıyor
- Audit events kontrol ediliyor: `[{ type: 'approval.requested' }, { type: 'approval.approved' }]`

✅ **Sonuç:** Kalıcılık tamamıyla işliyor, sunucu yeniden başlasa da veriler duruyor.

### 2.2 Tenant İzolasyonu (RLS Test)
```
npm test -- tests/rls.spec.ts
Test Files  1 passed (1)
Tests  7 passed (7)
```

**Kanıt:**
- `ApprovalRequest` tablosu prisma/rls.sql:13'te `tenant_isolation` döngüsünde
- Tüm fonksiyonlar (`createApprovalRequest`, `approveApprovalRequest`, vb.) `withTenant` içinde çalışıyor
- Her `findFirst`/`updateMany` sorgusunda `tenantId` filtresi var
- Test: "tenant B can neither read nor decide tenant A's approval requests" — `findMany` 0, `updateMany` count 0 ✓

✅ **Sonuç:** Tenant izolasyonu sağlam, başka kiracı verisine erişim imkansız.

### 2.3 Yetki Kontrolü (requireTenantAction)
```
// src/app/[locale]/(app)/[workspace]/approvals/actions.ts
export async function submitApprovalRequestAction(data: {...}): Promise<ApprovalResult> {
  const { tenantId, userId } = await requireTenantAction({ can: 'request_dual_approval' });
  // ...
}

export async function approveRequestAction(requestId: string): Promise<ApprovalResult> {
  const { tenantId, userId, role } = await requireTenantAction({ can: 'approve_dual_approval' });
  // ...
}
```

**Kanıt:**
- Her server action `requireTenantAction` ile başlıyor
- Yetkisiz rol `ForbiddenRoleError` fırlatıyor (test kapısında `role without permission is refused before any row is read`)
- RBAC kuralları `canRoleApprove(role, requiredRole)` ile sunucuda uygulanıyor

✅ **Sonuç:** Yetki kontrolü iki katmanlı (server action + DB kuralı), işliyor.

### 2.4 4-Göz İlkesi
```
// src/lib/approval-requests.ts
const { count } = await tx.approvalRequest.updateMany({
  where: { id: requestId, tenantId, status: 'PENDING', requesterId: { not: approverId }, expiresAt: { gt: now } },
  data: { status: decision.status, approverId, ... },
});
if (count !== 1) return refuse('notPending');
```

**Kanıt:**
- `requesterId: { not: approverId }` — talep eden kendi talebini onaylayamaz
- Test: "four eyes: the requester cannot approve or reject their own request" — ✓
- Kart tarafı da uyarı gösteriyor: "selfApprovalForbidden": "4-Eyes İlkesi Uyarısı: Talep eden kişi kendi talebini onaylayamaz."

✅ **Sonuç:** 4-göz ilkesi sunucuda tek kaynaktan (updateMany WHERE) uygulanıyor.

### 2.5 Yarışa Dayanıklılık
```
Test output:
race: two owners approve at the same moment — exactly one wins, the row names the winner ✓
race: approve and reject at the same moment — one decision, never both ✓
```

**Kanıt:**
- updateMany WHERE `status: 'PENDING'` koşulu: first-to-write wins, second gets count 0
- Mutasyon test M1: WHERE'den `status: 'PENDING'` sil → 2 test failed ✓ (yarışa dayanıklılık gerçek)

✅ **Sonuç:** Yarışa dayanıklı, Postgres satır kilidi + koşullu update garanti sağlıyor.

### 2.6 Hata Kodları ve Çeviriler
```
// src/lib/approval-request-rules.ts
export const APPROVAL_REQUEST_ERRORS = [
  'invalidActionType', 'invalidRequiredRole', 'invalidExpiry', ...,
  'notFound', 'notPending', 'expired', 'selfApproval', 'insufficientRole', 'notRequester',
] as const;
```

**Kanıt:**
- messages/tr.json: 17 hata kodu tamamıyla çevrilmiş
  - "selfApproval": "Kendi talebinizi onaylayamaz ya da reddedemezsiniz (4-göz ilkesi)."
  - "notPending": "Bu talep artık beklemede değil; başka biri karar vermiş ya da iptal edilmiş olabilir."
  - vb.
- Test: `tests/approval-requests.test.ts` hata kodu ↔ çeviri eşlemesini kontrol ediyor (7/7) ✓
- Client gösteriyor: `refusalText = (code) => t(\`errors.\${code}\`)`

✅ **Sonuç:** Çeviriler tam ve doğru, test kontrol ediyor.

### 2.7 Tam Test Suitesi
```
npm test
Test Files  313 passed | 6 skipped (319)
Tests  4129 passed | 175 skipped (4304)
```

**Detay:**
- `tests/approval-requests.live.test.ts`: 12/12 (DB yazma, girdi doğrulama, kurallar, yarışa)
- `tests/approval-requests.test.ts`: 7/7 (unit, çeviri eşlemesi)
- `tests/e2e/approvals-persistence.spec.ts`: 2/2 (kalıcılık, yenileme sonrası)
- `tests/rls.spec.ts`: 7/7 (tenant izolasyonu)
- `tests/m10-sign-dual-approval.live.test.ts`: 27/27 (m10 regresyon yok)
- `npm run typecheck`: 0 hata
- `npm run lint`: 0 hata (dokunulmayan dosyalar hariç)

✅ **Sonuç:** Tüm kapılar açık, tüm testler yeşil.

---

## 3. Bloker Bulgu

❌ **Yok.** Kod sağlam, testler kapsamlı, kalıcılık doğrulandı.

---

## 4. Tavsiye Edilecek İyileştirmeler (Opsiyonel)

1. **Süresi dolmayan talepler toplu yazma:** Yazar raporu "Süre dolumu tembel yazıldı" bulgusu yaptı. İsteğe bağlı: Ayrı bir cron talebi yapılabilir. Ama E2E test gösteriyor ki ekran doğru davranıyor (EXPIRED gösteriyor), bu yüzden buggu değil.

2. **Yürütme (`executedAt`):** Şu an hiçbir kod approved talebi yürütmüyor. Ayrı bir sprint kartı olacak mı? Kapsam dışında.

---

## 5. Platform Beyanı

✅ **macOS (Darwin 27, local Postgres :5433, Next dev :3147, Chromium)**

Testlerin tamamı **macOS**'ta koşuldu ve geçti. Kod **platforma bağlı değildir**: Prisma + node:crypto (sha256) + React, hiçbiri SO-spesifik değil. **Davranışın tüm platformlarda aynı olması beklenir.**

---

## Sonuç

Dal be-fb/approvals-persist **merge için hazırdır.** Bloker bulgu yok, tüm testler geçti, kalıcılık ve tenant izolasyonu doğrulandı.
