# TASK-MUPVLWSIPC5WU — E2E Global Fixture Setup (devop-fb)

**Hüküm:** BLOKE - Database migration broken; fixture setup'ı önlenemez duruma geldi

**Tip:** bug  
**Platform:** macOS (M1, Darwin 27.0.0)

---

## Kök Neden

1. **playground.config.ts loadEnvConfig** ✅ FIXED
   - Eklendi: `import { loadEnvConfig } from '@next/env'` + `loadEnvConfig(process.cwd(), true)`
   - Sonuç: DATABASE_URL test worker'ına ulaşıyor

2. **global-setup.ts Fixture Setup** ✅ IMPLEMENTED
   - pg Client ile idempotent tenant/user/membership oluşturma
   - System scope ile RLS bypass
   - Debug logging `/tmp/e2e-setup.log`

3. **admin/documents/page.tsx Null Check** ✅ FIXED
   - `result?.documents` null safety check eklendi
   - Graceful error state handling (loadError flag)

4. **Database Schema** ❌ BROKEN
   - Migration `add-m10-dual-approval-persistence` failed state'inde
   - Shadow DB'de `relation "FollowupDoc" does not exist` error
   - Prisma migrate resolve yapılamıyor (migrations table eksik)

---

## Yapılan Değişiklikler

### 1. playwright.config.ts - DATABASE_URL Loading

```typescript
import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd(), true);
```

**Sonuç:** playwright.config.ts process'inde DATABASE_URL load edildi ✅

### 2. tests/e2e/global-setup.ts - Fixture Setup

- pg Client ile idempotent tenant/user/membership oluşturma
- system_scope ile membership RLS bypass
- Debug logging file'ına (`/tmp/e2e-setup.log`)

```log
=== E2E Setup Start ===
Dev server info: PID=49931
Test data: INVOICE_SUPPLIER_NAME loaded
DATABASE_URL found: localhost:5433/fabrika
Connecting to database...
Connected to database
Fixture setup failed: relation "tenant" does not exist
```

**Sonuç:** DATABASE_URL yüklü ama schema eksik ❌

### 3. src/app/[locale]/admin/documents/page.tsx - Null Handling

```typescript
if (result?.documents) {
  documents = result.documents.map((d) => ({ ...d, createdAt: d.createdAt.toISOString() }));
  total = result.total;
} else {
  console.error(`[AdminDocumentsPage] DB query returned null result`);
  loadError = true;
}
```

**Sonuç:** page crash yerine graceful error render ✅

---

## Kanıt - Test Çıktısı (Fail State)

```
DATABASE_URL found: localhost:5433/fabrika
Connecting to database...
Connected to database
Fixture setup failed: relation "tenant" does not exist
```

Migration error:
```
Error: P3006
Migration `add-m10-dual-approval-persistence` failed to apply cleanly to the shadow database.
Database error: ERROR: relation "FollowupDoc" does not exist
```

---

## Değişen Dosyalar

1. **playwright.config.ts** (+3 satır)
   - loadEnvConfig import + call

2. **tests/e2e/global-setup.ts** (40 satır)
   - pg Client connection + fixture setup
   - Idempotent tenant/user/membership creation
   - Debug logging

3. **src/app/[locale]/admin/documents/page.tsx** (+6 satır)
   - result?.documents null check
   - loadError flag handling

---

## Riskler & Açık Sorunlar

### 🔴 BLOCKER: Database Migration Broken

- Migration state corrupted (shadow DB inconsistent)
- DB reset gerekli (lokal dev DB'sinde)
- `pnpm db:migrate` fail ediyor
- Fixture setup başlamasına rağmen tenant table'ı create edilemiyor

**Çözüm yolları:**
1. Local DB'yi reset et (docker-compose down -v + up)
2. Veya CI ortamında test koş (CI DB'isi migrate edilmiş olabilir)
3. Veya migration history'yi düzelt (riskli, data kaybı riski)

### ⚠️ loadEnvConfig Limitation

- .env dosyası yoksa (gitignore'da) loadEnvConfig çalışmıyor
- CI ortamında DATABASE_URL env var olarak set edilmesi gerekli
- Lokal dev'de .env.local yaratıp gerekirse dumpit...

### ✅ DONE: Fixture Architecture

- Global setup hook'ta idempotent create
- System scope with RLS membership create
- Specification-level fixtures (evidence-tenant.ts vs) ile uyum

---

## Sonraki Adımlar (Devop-fb Ya Devlet Yönetici)

1. **Database reset et (ZORUNLU)**
   ```bash
   docker-compose down -v
   docker-compose up -d  
   export DATABASE_URL="postgresql://fabrika:fabrika@localhost:5433/fabrika"
   pnpm db:migrate
   ```

2. **Test koş**
   ```bash
   export DATABASE_URL="postgresql://fabrika:fabrika@localhost:5433/fabrika"
   cd /Users/macbook/alan/FONBRIDGE-wt-devopfb-e2e
   E2E_PORT=3105 pnpm exec playwright test
   ```

3. **Kontrol:** Full takım sayıları ve "membership lookup failed" = 0 doğru

---

## Doğrulama Tarihi

2026-10-02 · Haiku 4.5

**Commit SHA:** devop-fb/e2e-global-fixture (merged from origin/dev)

**Dal:** /Users/macbook/alan/FONBRIDGE-wt-devopfb-e2e

---

## Öğrenilen

1. **loadEnvConfig forceReload** — next.js 16+ monorepo'larda gerekli, .env file eksikliğinde silent fail eder
2. **Database migration state** — broken state'de Prisma CLI dead lock'a girebilir, reset gerekli
3. **Playwright globalSetup stdout** — console.log visible ama /tmp file logging daha güvenilir

---

**DoD Durumu:**
- [ ] DATABASE_URL yüklenmesi ✅ (loadEnvConfig fixed)
- [ ] Global fixture setup ✅ (pg Client implementation done)
- [ ] Null handling ✅ (page.tsx fixed)
- [ ] Tam takım sayıları ❌ (DB migration broken)
- [ ] "membership lookup failed" = 0 ❌ (DB migration broken)

**Platform:** macOS (M1, Darwin 27.0.0) — diğer platformlarda migrate state'i kontrol et
