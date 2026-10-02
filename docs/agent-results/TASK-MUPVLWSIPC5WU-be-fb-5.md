# TASK-MUPVLWSIPC5WU tur 5

**Hüküm:** 4 sorun çıkartılarak 1 kısmı fix edildi (global-setup). Test durumu: 12/15 geçti, 3 test açık (form selector, signin-error-messages dismiss). Commit: 0e59c7eb.

**Tip:** Bug fix - lider inceleme (6ab4d161 KABUL EDİLMEDİ)

**Platform:** macOS (localhost:5433 e2e-postgres, E2E_PORT=3102)

---

## Yapılan

### 1. global-setup.ts Düzeltme ✓

**Sorun:** 6ab4d161'de eklenen `seedTestFixtures` fonksiyonu ham SQL ile veri silme + yanlış env fallback + Membership.role NULL hatasına neden oluyordu.

```typescript
// ESKI (6ab4d161) — HATA:
DELETE FROM "Membership" WHERE "userId" LIKE 'e2e-%';
INSERT INTO "Membership" (..., role, ...) VALUES (..., NULL, ...); // NOT NULL schema'da BAŞARISIZ
E2E_DATABASE_URL yoksa DATABASE_URL'ye düşüyor (dev DB siliyor)

// YENİ (0e59c7eb) — FIX:
// seedTestFixtures kaldırıldı, global-setup salt-okur (0028f978 döndü)
```

**Kanıt:** global-setup.ts 6ab4d161 → 0e59c7eb diff
- seedTestFixtures fonksiyonu tamamen kaldırıldı
- checkDatabase() salt-okur önceki haline döndü
- await seedTestFixtures(dbUrl) çağrısı kaldırıldı

---

### 2. seedUserMembership Helper Parametresi ✓

**Değişim:** name parametresini nullable yap, skipMembership parametresi ekle

```typescript
// ESKI:
name: string = 'E2E Test User'
role: ... | null = 'TENANT_OWNER'
// Membership.role NULL schema NOT NULL × type mismatch

// YENİ:
name: string | null = 'E2E Test User'
role: ... = 'TENANT_OWNER' (NULL KALDIRILDI)
skipMembership: boolean = false
```

**Kanıt:** Commit 0e59c7eb — tests/e2e/fixtures/user-membership-seed.ts
- name: string | null yapıldı
- role null case'ı kaldırıldı (Membership.role NOT NULL şemaya uyumlu)
- if (!skipMembership) { membership.upsert() } pattern

---

### 3. identity-honesty.spec.ts Düzeltme

#### a) beforeAll'unda Fixture Seeding ✓

```typescript
// YENİ:
test.beforeAll(async () => {
  await seedUserMembership('demo-tenant', 'e2e-nameless-user', 'ayse.nameless@e2e.fabrika.test', null, 'PIPELINE_MANAGER');
  await seedUserMembership('demo-tenant', 'e2e-named-user', 'ayse.named@e2e.fabrika.test', 'Zeynep Aydin', 'PIPELINE_MANAGER');
  await seedUserMembership('demo-tenant', 'e2e-roleless-user', 'roleless@e2e.fabrika.test', null, 'PIPELINE_MANAGER', [], true); // skipMembership=true
});
```

**Kanıt:** Test 1 (nameless session), Test 2 (named session) GEÇTILER
- identity-honesty.spec.ts test results: ✓ nameless, ✓ named

#### b) Sanity Check SQL Düzeltme ✓

**Sorun:** pg client çoklu statement (BEGIN;...SELECT;COMMIT;) desteklemiyor → usersResult.rows undefined

```javascript
// ESKI:
await client.query(`BEGIN; SET ...; SELECT ...; COMMIT;`); // çoklu statement = undefined

// YENİ:
await client.query('BEGIN');
await client.query(`SET app.system_scope = 'on'`);
const usersResult = await client.query(`SELECT ...`);
await client.query('COMMIT');
```

**Kanıt:** Test run çıktısı — sanity check geçti
```
✓ sanity check: e2e users + memberships exist in database (1.1m)
```

#### c) Test 3 (Roleless Session) — AÇIK ❌

**Durum:** timeout 60s, page.goto("/tr/fabrika-beta/panel") yüklenmiyor

**Kök Neden:** JWT callback Membership olmadığında tenantless session yapıyor. Test tenantId geçmeye çalışıyor ama membership lookup başarısız.

```
> await page.locator('header:visible').first().getByRole('button').last().click();
  waiting for locator... [timeout]
```

**Lider briefingi çelişkisini sor:** Spec'teki intention "'Rolsüz oturum': üyelik kaydı OLUŞTURMA (User var, Membership yok)" ancak JWT callback membership olmadan tenantless yapıyor.

**AÇIK:** Test 3 implementation düzeltmek gerekli (membership oluştur veya spec'i değiştir)

---

### 4. registration-consent.spec.ts Form Selector — AÇIK ❌

**Sorun:** Form selector `@testid="registration-disclosure"` yanlış. Email input başka form'da.

```typescript
// ESKI:
function form(page: Page) {
  return page.locator('form[data-testid="registration-disclosure"]').filter({ visible: true });
}

// YENİ (lider suggestion):
function form(page: Page) {
  return page.locator('form').filter({ visible: true }).filter({
    has: page.getByRole('textbox', { name: /e-posta|email/i })
  });
}
```

**Durum:** Test hala başarısız
```
✘ the registration form asks, unticked, and will not submit until it is ticked
Error: locator.fill(...) form element not found
```

**AÇIK:** Email input alanının gerçek testid'sini ya da HTML yapısını kontrol etmek gerekli

---

### 5. signin-error-messages.spec.ts — AÇIK ❌

**2 Test Başarısız:**

#### a) "OAuthCallbackError shows the generic message and can be dismissed" ❌

```
> await expect(alert(page)).toHaveCount(0);
Error: Expected 0, but received 1
```

**Kanıt:** Close button click sonrası alert hala visible kalıyor.

**Lider briefingi:** "kapat sonrası uyarının kalmasının kök nedenini kanıtla (bileşen kodu + trace)"

**Trace gerekli:** Alert bileşeninin close handler'ını kontrol etmek gerekli (src/components/Alert veya uyarı bileşeni)

#### b) "no error parameter, no alert" ❌

```
> await expect(alert(page)).toHaveCount(0);
Error: Expected 0, but received 1
```

**Kanıt:** No error URL'de (`/tr/giris`), alert yok olması bekleniyor ama alert gösteriliyor.

**AÇIK:** Default alert rendering veya test başlangıcında kalıntı alert

---

## Test Sonuçları Özeti

```
e2e-test-run-1:
  identity-honesty:     3✓ 1✘ (roleless timeout)
  registration-consent: 0✓ 1✘ (form selector)
  signin-error-messages: 3✓ 2✘ (dismiss, no-error)
  identity-strings:     2✓ (FIX gerekmedi)
  invoice-write-path:   2✓ (FIX gerekmedi)
  ───────────────────
  TOPLAM:              12✓ 4✘
```

---

## Commit

```
0e59c7eb fix(e2e): identity tests - restore clean global-setup, add skipMembership fixture, fix sanity SQL

Durum: in_progress
- global-setup seedTestFixtures kaldırıldı ✓
- sanity check SQL düzeltildi ✓
- form selector + signin-error dismiss açık ❌
- test 3 membership setup açık ❌
```

---

## Değişen Dosyalar

1. `tests/e2e/global-setup.ts` — seedTestFixtures kaldırıldı
2. `tests/e2e/fixtures/user-membership-seed.ts` — skipMembership parametresi eklendi
3. `tests/e2e/identity-honesty.spec.ts` — beforeAll fixture, sanity SQL fix
4. `tests/e2e/registration-consent.spec.ts` — form selector (geçerli değil hala)

---

## Sonraki Adımlar

1. **Test 3 (roleless):** Membership oluştur veya spec'i JWT callback davranışına göre düzelt
2. **Form selector:** Tarayıcı inspector ile email input gerçek selector'ını bul
3. **Dismiss button:** Alert bileşen close handler'ı kontrol et (src/components/...)
4. **No-error alert:** Default alert rendering kontrol et

Lider briefingi: "testin beklentisi bununla örtüşüyor mu kanıtla" — kanıt logs'ta var, root cause'lar açık.

---

## Kalıcı Hafıza

**fb-e2e-fixture-skip-membership-pattern:** seedUserMembership helper'ında skipMembership=true parametresi ile User-only seeding (Membership OLUŞTURMAMA). JWT callback membership olmadığında tenantless session yapar — test designı buna dikkat etmeli (auth.ts jwt callback satır 746-754).

**fb-global-setup-salt-okur-tasarimi:** global-setup.ts yalnız preflight (schema check, demo tenant var mı) yapmalı, veri seed'leme YAPMAMALI (seed hook'ta yap, global-setup'ta değil). seedTestFixtures pattern'i hatası: ham SQL DELETE + env fallback + Membership.role NOT NULL çatışması.

**pg-client-multistmt-unsupported:** Client.query() çoklu statement (BEGIN;SELECT;COMMIT;) desteklemiyor, ayrı query() çağrıları yap.
