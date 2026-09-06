# SECURITY_COMPLIANCE.md — Güvenlik, KVKK/GDPR, YZ uyumu

## 1. Çok kiracılı izolasyon
**RLS (Row Level Security) Pattern:**
- Her kiracı-bağımlı tablo (`tenantId: String` alanı) PostgreSQL RLS politikası ile korunur.
- Politika: `USING ("tenantId" = current_setting('app.tenant_id'))` ve `WITH CHECK (...)` simetrik.
- Nullable tenantId tablolar (Document, Chunk, ConceptTemplate) paylaşılan satırlar için `USING ("tenantId" IS NULL OR ...)` kuralı.
- Sistem-geneli tablolar (Tenant, User, Call, Topic, Cordis*) RLS gerektirmez.

**Uygulama tarafı:**
- Tüm Prisma sorguları `withTenant(prisma, tenantId)` sarmalayıcısında çalışır → istekte `SET LOCAL app.tenant_id = '<id>'`.
- Server Action / Route Handler dışında yalın Prisma çağrısı yasak (lint kuralı).
- Yeni model eklendiğinde tenantId varsa otomatik olarak `prisma/rls.sql`'e politika eklenir.

**CI & Doğrulama:**
- `pnpm rls:check` → `scripts/check-rls.ts` schema.prisma'daki tüm `tenantId` alanlarını tarar, eksik politikaları raporlar.
- `.github/workflows/check-rls.yml` — PR'da schema/rls.sql değiştiğinde otomatik çalışır.

**Test:**
- `tests/e2e/rls.spec.ts` — A kiracısı B'nin verilerine erişemesin (API + DB düzeyinde).
- Lokal: `docker-compose exec db psql` → iki session, farklı `app.tenant_id`, veri izolasyonunu doğrula.

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
