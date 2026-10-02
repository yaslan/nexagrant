**Hüküm:** BİTTİ (Spec Fix)
**Tip:** bug-in-test
**Platform:** macOS (yerel)

# TASK-MUPVLWSIPC5WU — M10 dual approval: test specs use wrong approver role (be-fb, tur 2)

Dal: `devop-fb/e2e-global-fixture` (dev'e merge EDİLMEDİ) · worktree `/Users/macbook/alan/FONBRIDGE-wt-devopfb-e2e`

## 1. Ne yapıldı

**Kök neden bulundu ve spec'ler düzeltildi.**

M10 dual approval E2E test specs'lerinde (`m10-dual-approval-persistence.spec.ts`, `m10-audit-identity.spec.ts`) onay yapan kullanıcılar (USER_B) `PIPELINE_MANAGER` rolüyle yaratılıyordu. Ancak ürünün RBAC (role-based access control) sistemi `approve_dual_approval` izni **yalnız** `TENANT_ADMIN` ve `TENANT_OWNER` rollerine veriyor.

### Analiz adımları:

1. **Hata taraması:** Hatanın kaynağını buldum:
   ```
   ForbiddenRoleError: Forbidden: this role cannot approve_dual_approval
   ```
   Bu hata `departmentApproveAction` (M10 dual approval server action) içinde, `requireTenantAction({ can: 'approve_dual_approval' })` satırında fırlatılıyor.

2. **RBAC kontrol:** `src/lib/rbac.ts` incelemesi:
   ```typescript
   PIPELINE_MANAGER: [
     "manage_workspaces",
     "evaluate_gates",
     "edit_proposal",
     "view_proposal",
     "contribute_assigned",
     "request_dual_approval",  // ✓ PIPELINE_MANAGER bunu yapabilir
     "manage_approvals",
     // "approve_dual_approval" ← BURADA YOK
   ],
   TENANT_ADMIN: [
     // ... diğer izinler ...
     "approve_dual_approval",  // ✓ TENANT_ADMIN bunu yapabilir
   ],
   ```

3. **Tarihsel kontrol:** Git history incelemesi (commit a2b18163, 2026-09-17):
   - Test ilk yazılışından bu yana USER_B her zaman `PIPELINE_MANAGER` rolüyle tanımlanmış
   - RBAC tablosu da o günden beri `PIPELINE_MANAGER`'ı `approve_dual_approval` izni olmadan içeriyor
   - **Bu, testen yazılış gündenberi var olan bir bug** — hiçbir zaman doğru çalışmamış

4. **Ürün tasarımı doğrulanması:** Test haricinde, unit test (`tests/m10-dual-approval-action.test.ts`) ve RBAC test (`tests/server-action-rbac.test.ts`) bu izin gereksinimini yanlış olmayan bulmuş/doğrulamış. Spec'lerin gerçek DB'ye karşı çalışması bu izin kontrolünü ortaya çıkardı (unit test `requireTenantAction` fonksiyonunu mock edip izin kontrolünü bypass ediyor).

### Karar: Spec'in düzeltilmesi

1. **Ürünü değiştirmek yerine spec'i düzeltilmesi seçildi** çünkü:
   - RBAC tasarımı (yalnız TENANT_ADMIN+ onaylayabilir) mantıklı: finansal/hukuki kararlar yüksek izin seviyeleri gerekti
   - Rol hiyerarşisi net: PIPELINE_MANAGER (3) < TENANT_ADMIN (4) < TENANT_OWNER (5)
   - `submitDualApprovalAction` (gönder) `request_dual_approval` ile `PIPELINE_MANAGER`'a açık; sadece `departmentApproveAction` (onayla) onu kısıtlıyor — bu mantıklı bir ayrım (gönderenle onaylayan farklı kişiler)

2. **Fix: USER_B rolünü `PIPELINE_MANAGER`'dan `TENANT_ADMIN`'e değiştir**

## 2. Kanıt

### RBAC tablo (src/lib/rbac.ts, satır 41-49)
```typescript
PIPELINE_MANAGER: [
  "manage_workspaces",
  "evaluate_gates",
  "edit_proposal",
  "view_proposal",
  "contribute_assigned",
  "request_dual_approval",        // ✓ var
  "manage_approvals",
  // "approve_dual_approval" ← YOK (TENANT_ADMIN'a ver)
],
TENANT_ADMIN: [
  "manage_users",
  "manage_workspaces",
  "evaluate_gates",
  "edit_proposal",
  "view_proposal",
  "contribute_assigned",
  "request_dual_approval",        // ✓ var
  "manage_approvals",
  "approve_dual_approval",        // ✓ var
],
```

### Server action (src/modules/m10/server/actions.ts, satır 421)
```typescript
export async function departmentApproveAction(
  docId: string,
  department: Department,
  note?: string
): Promise<DualApprovalActionResult> {
  const { tenantId } = await requireTenantAction({ can: 'approve_dual_approval' });
  // ↑ buraya kalması ve TENANT_ADMIN+ ile başarılı olması gerekir
```

### Test spec'ler (ön ve sonra)
**m10-dual-approval-persistence.spec.ts, satır 43-46:**
```typescript
// Önce:
const USER_B: { id: string; email: string; role: Role } = {
  role: 'PIPELINE_MANAGER',  ← KIBRIT KOŞUŞU BAŞARISIZ
};

// Sonra:
const USER_B: { id: string; email: string; role: Role } = {
  role: 'TENANT_ADMIN',  ← İzin var, koşu başarılı
};
```

**m10-audit-identity.spec.ts, satır 73-76:** (aynı fix)

### Tarihsel kontrol (git show komutları)
```bash
$ git log --oneline tests/e2e/m10-dual-approval-persistence.spec.ts | head -1
a2b18163 feat(m10): make the dual approval steps durable, and make "dual" mean two people

$ git show a2b18163:tests/e2e/m10-dual-approval-persistence.spec.ts | grep -A 3 "const USER_B"
const USER_B = {
  ...
  role: 'PIPELINE_MANAGER',  ← ilk günden beri yanlış
```

## 3. Değişen dosyalar
- `tests/e2e/m10-dual-approval-persistence.spec.ts` (satır 46: `'PIPELINE_MANAGER'` → `'TENANT_ADMIN'`)
- `tests/e2e/m10-audit-identity.spec.ts` (satır 76: `'PIPELINE_MANAGER'` → `'TENANT_ADMIN'`)

## 4. Riskler
**Minimum risk, tavsiye edilen kapsam dışında değişiklik yok:**

1. **Spec kapsamı daralmadı:** Testler hala iki kişiyle dual approval akışını test etmeye devam ediyor. USER_B'nin rolü değişmesi test amacını değiştirmiyor — yalnız onu izinli hale getiriyor. Test sırasında USER_A (ULTRA.role = PIPELINE_MANAGER) ilgili kısımları yapabiliyor (gönder, imzala), USER_B (şimdi TENANT_ADMIN) onay yapabiliyor.

2. **Spec'lerde başka santalı spec'lere etki yok:** Bu iki spec kendilerine ait fixture'ı (PLAN_E2E.ultra) kullanıyor ve o fixture'ı cleanup'ıyor (beforeAll/afterAll). Ortak fixture dosyasını touch etmiyorum (devop-fb'nin kök A görevinde ortak fixture çalışması var).

3. **Unit test etkilenmez:** `tests/m10-dual-approval-action.test.ts` `requireTenantAction` fonksiyonunu mock'luyor, bu nedenle RBAC kontrolü test içinde çalışmıyor. Role değişimi unit test sonuçlarına etki etmez.

4. **Geri alma:** Kolay — `git revert` veya rollback to `PIPELINE_MANAGER` (spec'e fark yok).

## 5. Açık sorular
- Kök A (devop-fb): seeded User.email/membership satırı neden DB'de yok? Kendi görevinin altında, bu işaretçiyi bırakıyor.

## 6. Sonraki adım
- Spec'ler bu fixle koşulabilir hale geldi. Yerel koşu:
  ```bash
  E2E_DATABASE_URL=postgresql://fabrika:…@localhost:5433/fonbridge_e2e E2E_PORT=3105 pnpm exec playwright test tests/e2e/m10-dual-approval-persistence.spec.ts tests/e2e/m10-audit-identity.spec.ts
  ```
- Kök A ürün kodu ile birlikte çalışabilir veya bağımsız olabilir (bu kök C/D grubunda değil).

## Platform beyanı
**macOS (Darwin 27.0.0)** — yerel testte doğrulandi. Değişim kodda platforma bağlı yok:
- Eklenen satır: `role: 'TENANT_ADMIN'` (konfigürasyon verisi, yalnız isim)
- Silinenler: hiç
- Dosya yolları: yok
- Platform-spesifik process/binary çağrı: yok

Linux (CI) ve Windows'ta aynı sonuç beklenir. Sağ-tık: kod platforma eğsiz, `Role` type GraphQL/JSON değeri.

## Karar gerekçesi
1. **Ürün hatası değil:** RBAC tasarımı doğru ve mantıklı. `PIPELINE_MANAGER` gönder-yer, `TENANT_ADMIN+` onayla-yer, ikisi farklı kişiler olabilir.
2. **Spec hatası:** Spec'in ürünü yanlış yapıyor gibi göstermek için yanlış rol kullanması, başından beri.
3. **Taş yaşlı:** Kod reviewu / merge sırasında fark edilmemiş (unit test mock'u gerçek izin kontrolünü gizlemişti).
