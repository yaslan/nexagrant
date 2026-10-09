**Hüküm:** ONAY
**Tip:** review
**Platform:** macOS (yerel)

## İnceleme Özeti

Commit 090f3a69: `acceptInvitationIn` fonksiyonundan `tx as TenantTx` cast'inin kaldırılması ve `registerInvitedOAuthUser`'da `client.$transaction` yerine `withTenantOn` kullanımına geçiş.

## Doğrulama Sonuçları

### 1. RLS Bypass Kapısı (rls:bypass-check)
```
✅ SUCCESS: no new tenant bypass. 0 call site(s) allowed with a recorded reason, 36 on the sanctioned cross-tenant path, 0 still owed.
```
Commit hiçbir yeni tenant bypass açmamıştır.

### 2. Invitations Vitest (18/18)
```
Test Files  1 passed (1)
Tests       18 passed (18)
```
Pure fonksiyonlar (classifyInvitation, maskEmail, sameEmail) tüm test case'leri geçmektedir.

### 3. Teknik Analiz

**withTenantOn mekanizması:**
- `withTenantOn` client'ın içinde `client.$transaction()` açıyor (satır 196)
- Transaction BAŞLANGICI'NDA `await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`` çalıştırıyor (satır 201)
- Sonra callback'i çağrıyor ve transaction'daki tüm sorguları kiracı scope'unda yürütüyor (satır 206)

**acceptInvitationIn flow:**
- Önceki hali: `Prisma.TransactionClient` alıyor, `as TenantTx` cast ile type assertion yapıyor → gerçek set_config() çağrısı `bindTransactionToTenant` ile registerInvitedOAuthUser'da yapılıyor
- Yeni hali: `TenantTx` alıyor (brand minted) → withTenantOn içinde set_config() zaten çalışmış, transaction scope'unda doğru tenant'a bağlı

**Diğer çağıranlar:**
- `acceptInvitation` (satır 277): `withTenant(tenantId, (tx) => acceptInvitationIn(tx, ...))` → withTenant de withTenantOn'ı çağırıyor, set_config() yapılıyor ✅
- `registerInvitedOAuthUser` (satır 361): `withTenantOn(client, tenantId, async (tx) => { tx.user.create(); acceptInvitationIn(tx, ...); })` → withTenantOn set_config() yaptıktan sonra callback'te çağrılıyor ✅

**Seat limit + advisory lock (Y-2 korunuyor):**
- acceptInvitationIn (satır 201): `await lockTenantSeats(tx, tenantId)` — TenantTx'i alıyor, advisory lock kuruyor
- satır 202-215: findFirst + membership check + readSeatUsage — tüm sayımlar aynı transaction'da
- satır 216-218: invitation.updateMany — atomic update, WHERE acceptedAt IS NULL ile single-use garantisi
- satır 228-233: membership.create + auditEvent.create + consent.create — tüm yazımlar aynı transaction'da

Tüm işlemler bir transaction'da yapılıyor, advisory lock altında. Y-2 race condition (plan shrinking) koruması geçerli.

**User model RLS analizi:**
- User table RLS listesinde (rls.sql satır 8) YOKTUR → User global table, kiracı-spesifik değil
- User.create() RLS ile korunmaz (doğru, User global ve e-mail unique constraint var)
- Membership table FORCE ROW LEVEL SECURITY'e sahip (satır 8, 18) → Membership.create() RLS ile korunan
- AuditEvent table FORCE ROW LEVEL SECURITY'e sahip → AuditEvent.create() RLS ile korunan
- Consent table FORCE ROW LEVEL SECURITY'e sahip → Consent.createMany() RLS ile korunan
- set_config() transaction başında yapıldığından, tüm yazımlar kiracı scope'unda

## Riskler

- ❌ Yok. Değişiklik emniyetli ve RLS yapısıyla uyumlu.

## Açık Sorular

- ❌ Yok.

## Sonraki Adım

Commit dev dalına merge edilebilir. RLS gate geçiş tamam, test coverage yeterli.
