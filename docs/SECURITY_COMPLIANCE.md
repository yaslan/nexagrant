# SECURITY_COMPLIANCE.md — Güvenlik, KVKK/GDPR, YZ uyumu

## 1. Çok kiracılı izolasyon
**RLS (Row Level Security) Pattern:**
- Her kiracı-bağımlı tablo (`tenantId: String` alanı) PostgreSQL RLS politikası ile korunur.
- Politika iki aşamalı:
  1. `USING` cümlesi: Okunan satırlar filtrelenir → `"tenantId" = current_setting('app.tenant_id', true)`
  2. `WITH CHECK` cümlesi: Yazılan/güncelenen satırlar filtrelenir → simetrik ve aynı koşul
- Nullable tenantId tablolar (Document, Chunk, ConceptTemplate) paylaşılan satırlar için `USING ("tenantId" IS NULL OR "tenantId" = current_setting('app.tenant_id', true))` kuralı.
- Sistem-geneli tablolar (Tenant, User, Call, Topic, Cordis*, SystemAlert) RLS gerektirmez.

**Katmanlı koruma:**
```
┌──────────────────────────────────────────┐
│ Uygulama (withTenant sarmalayıcı)        │
├──────────────────────────────────────────┤
│ Prisma ORM (app.tenant_id session var)   │
├──────────────────────────────────────────┤
│ PostgreSQL RLS Policy (veri tabanı)      │ ← DB-level enforcement
└──────────────────────────────────────────┘
```

**Uygulama tarafı:**
- Tüm Prisma sorguları `src/lib/db.ts`'deki `withTenant(prisma, tenantId)` sarmalayıcısında çalışır:
  ```typescript
  await withTenant(prisma, tenantId, async (client) => {
    return client.opportunity.findMany(...)
  })
  ```
  → İstekte `SET LOCAL app.tenant_id = '<id>'` tetiklenir.
- Server Action / Route Handler dışında yalın `prisma.model.findMany()` çağrısı **yasak** (lint kuralı).
- Modül event bus (`src/core/events`) yapılar arası veri geçişini sağlar (tenantId implicit).

**Policy Yönetimi:**
- Tüm policies `prisma/rls.sql`'de toplu tanımlanır (idempotent).
- Yeni model eklendiğinde:
  1. `schema.prisma`'ya `tenantId String` alanı ekle
  2. Modeli `prisma/rls.sql` FOREACH dizisine ekle
  3. Migration oluştur: `pnpm db:migrate dev`
  4. Policies uygula: `pnpm db:rls`
  5. Doğrula: `pnpm rls:check` → PASS

**CI & Doğrulama:**
- `pnpm rls:check` → `scripts/check-rls.ts` schema.prisma'daki tüm `tenantId` alanlarını tarar, `rls.sql`'deki politikalar ile karşılaştırır; eksik olanları raporlar ve exit code 1 ile çıkar.
- `.github/workflows/check-rls.yml` — PR'da `prisma/schema.prisma` veya `prisma/rls.sql` değiştiğinde otomatik çalışır; başarısız olursa PR yorumu ekler.
- Test ve lint pipelines paralel yürütülür.

**Lokal Test:**
```bash
# 1. Two psql sessions
docker-compose exec db psql -U postgres fabrika_dev

# Session A (Tenant A)
SET app.tenant_id = 'tenant-a-id';
SELECT * FROM "Workspace"; -- görür
SELECT * FROM "Workspace" WHERE "tenantId" = 'tenant-b-id'; -- 0 satır (RLS blocks)

# Session B (Tenant B)
SET app.tenant_id = 'tenant-b-id';
SELECT * FROM "Workspace"; -- sadece B'nin verisi

# 2. E2E Tests
pnpm test:e2e -- tests/e2e/rls.spec.ts
```

**Test Coverage (33 models):**
- ✅ Opportunity, Workspace, Evidence (API isolation)
- ✅ TopicMatch, Claim, Interaction (DB-level isolation)
- ✅ Document, Chunk, ConceptTemplate (nullable tenantId / shared rows)
- ✅ Cross-tenant session variable test

## 2. Kimlik ve erişim
- Auth.js; parola argon2; 2FA (TOTP) faz 2; SSO (SAML/OIDC) Kurumsal.
- Oturum JWT: `userId, tenantId, role, workspaceIds`; kiracı değiştirme yeni oturum.
- `guest_partner`: yalnızca davet bağlantısı + e-posta doğrulama; kapsam tek `Proposal`.

## 3. Veri koruma (KVKK + GDPR)
- Veri envanteri (`docs/data-inventory.md` üretilecek): kişisel veri = kullanıcı hesabı, muhatap adı/e-postası (`Relationship`), toplantı notları.
- Hukuki dayanak: sözleşme (hesap), meşru menfaat (muhatap iletişim bilgisi — kullanıcı girer; "kaynak" alanı zorunlu).
- Haklar: dışa aktarma (`/settings/privacy/export` JSON), silme (kiracı sahibi → 30 gün sonra cascade; `AuditEvent` anonim), muhatap silme isteği formu (herkese açık).
- İşleyici sözleşmesi (DPA) şablonu tr/en; alt işleyiciler listesi: Vercel, Neon/Supabase, Fly.io, Cloudflare R2, Resend, Stripe, Anthropic/OpenAI, PostHog, Sentry.
- Veri yeri: AB bölgesi (Frankfurt) varsayılan; Türkiye için KVKK yurt dışı aktarım — açık rıza + standart sözleşme; kurumsal müşteriye "AB bölgesi model" seçeneği.
- Çerez onayı; analitik yalnızca onayla.

## 4. YZ kullanımı
- Komisyon kuralı: üretken YZ kullanılabilir; başvuran sorumlu; hangi araçların nasıl kullanıldığı şeffaf; kaynaklar listelenir. → `AiUsageLog` + otomatik beyan (`/ai/disclosure`).
- Sağlayıcı ayarı: eğitim için kullanım kapalı, veri saklama sıfır/minimum; sözleşme ekinde.
- Kullanıcıya uyarı: gizli/patentlenebilir içerik için "hassas mod" (yalnızca kurumsal model / yerel) — faz 2.
- Evaluator Lens çıktısı "iç ön değerlendirme"; hakemlik simülasyonu Komisyon değerlendiricileri için değil, başvuranlar için.

## 5. Uygulama güvenliği
- OWASP ASVS L2 hedefi; zod ile tüm girişler; CSRF (Server Actions yerleşik); CSP başlıkları; oran sınırlama (Upstash) giriş/AI uç noktaları; dosya yükleme MIME + boyut + virüs taraması (ClamAV faz 2).
- Sırlar: env; log'da PII maskeleme; Sentry PII kapalı.
- Yedekleme: Neon PITR 7 gün; R2 sürümleme; aylık geri yükleme tatbikatı.
- Olay müdahale: 72 saat bildirim prosedürü (GDPR), KVKK Kurulu bildirimi.

## 6. Lisanslar
- CORDIS / F&T verisi: AB açık veri (CC BY 4.0) — atıf ürün içinde; türev metrikler Fabrika'nın.
- Çalışma programı PDF'leri: Komisyon belgesi; RAG için kullanım, yeniden yayım yok.
