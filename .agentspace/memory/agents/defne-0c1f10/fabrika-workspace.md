---
name: fabrika-workspace
description: Fabrika SaaS projesi — Next.js 15, Prisma, multi-tenant, i18n, modüler mimari
metadata:
  type: project
  updatedAt: 2026-09-06
---

## Proje Yapısı
- **Ürün:** Fabrika — Avrupa fonları için çok kiracılı proje pipeline SaaS
- **Stack:** Next.js 15, TypeScript, Prisma, Postgres/pgvector, Python worker
- **Dil:** UI Türkçe (varsayılan) + İngilizce (`next-intl`)
- **Komutlar:** `pnpm dev` (Next.js :3000), `pnpm db:migrate`, `pnpm test`, `pnpm typecheck && pnpm lint`

## Mimari Kurallar (İhlal etme)
1. **Multi-tenancy:** Tüm iş tablolarında `tenantId` zorunlu, sorgular `withTenant()` sarmalayıcısından geçer
2. **Modüller (M1-M8):** `src/modules/mX/manifest.ts` kaydı zorunlu, aralarında direkt import yok; olay yolu (`src/core/events`) ve kontrat (`src/core/contracts`) ile konuş
3. **RLS politikaları:** Yeni tablo = RLS, yoksa PR geçmez
4. **Yetkilendirme:** `can(user, action, resource)` (`src/lib/authz`), token `PlanEntitlement` + `ModuleState` + rol kontrol edilir
5. **i18n:** User-facing sabit metin yok; `t('...')` kullan, iki dile ekle
6. **Para:** Int minor unit (cent) + currency, hesaplamalar `src/lib/money.ts`
7. **Tarih/saat:** DB UTC, çağrı deadline = `deadlineAt` (UTC) + `deadlineTz` (user saat dilimi için)
8. **Soft-delete:** User'lar `deletedAt` alanıyla silinir, sorgular `IS NULL` kontrol eder
9. **LLM:** `src/core/k6-ai/llm.ts` üzerinden, prompt dosya `/prompts/*.md`'de, kodda gömülü string yok

## Çalışma Usulü
1. Görev detayını oku (DoD içinde)
2. Etkilenen dosyaları listele + plan yaz (tasarım)
3. Kodla + test: `pnpm test && pnpm lint && pnpm typecheck`
4. Real tıklama/e2e doğrulama (offscreen test YETMEZ)
5. Kanıt dosyası: `docs/agent-results/<GÖREV-ID>-defne-0c1f10.md` (screenshot + çıktı)
6. Commit: `feat(m5): kpi dashboard` biçimi, co-authored

## İlgili Moduller
- **M5:** Pipeline metrics, KPI dashboard, rapor
- **M7:** Compliance (KVKK/GDPR, soft-delete, veri dışa aktarma)
- **M1:** Authentication, user management

## Sonraki Adım
E10.1 (Dashboard) başlandı — 6 KPI kartı, Recharts, dönem filtreleri, CSV export
