# PROJECT.md — Fabrika: Avrupa Proje Fabrikası SaaS

> Bu dosya projenin **tek doğruluk kaynağıdır**. Claude Code ve tüm geliştiriciler önce bunu, sonra `CLAUDE.md`'yi, sonra `docs/` altındaki ilgili dosyayı okur. Bir karar burada yazmıyorsa `docs/ROADMAP.md`'deki "Açık kararlar" bölümüne eklenir; asla sessizce varsayılmaz.

## 0. Özet

**Fabrika**, KOBİ'lerin, danışmanlık firmalarının ve üniversite proje ofislerinin Avrupa fonlarına (Ufuk Avrupa, EIC, Eurostars/Eureka, CETPartnership, DUT, Erasmus+, Digital Europe, EIT, NEB, Missions) sürekli ve sistematik başvurmasını sağlayan çok kiracılı (multi-tenant) bir web SaaS'ıdır. Çekirdek altı veri katmanı (K1–K6) ve iş modüllerini içerir (güncel liste ve sayı: `src/lib/modules/registry.ts`, `getModuleCounts()`; henüz yayında olmayanlar `statusBadge: 'soon'`); modüller kiracı yöneticisi tarafından plana/eklentiye göre açılıp kapatılır. Gelir modeli: abonelik + modül eklentileri + hizmet paketleri + veri/API lisansı (`docs/BUSINESS_MODEL.md`; pazar yeri kaldırıldı — ADR-0005).

Dil: arayüz **Türkçe (varsayılan) ve İngilizce**; kod, tablo/alan adları ve commit mesajları **İngilizce**.

## 1. Hedefler ve hedef olmayanlar

**Hedefler (MVP, 16 hafta):**
1. Bir kiracı kaydolur, plan seçer (Stripe), ekip davet eder.
2. K1: Funding & Tenders + Eurostars + TÜBİTAK duyuruları her gece çekilir; kiracı profiline göre uyum skoru üretilir; kayıtlı aramalar ve e-posta uyarıları.
3. K2/M1: CORDIS dökümleri aylık işlenir; kurum kartları, konu bazlı liderler, iş birliği grafı.
4. K5/M5: Fırsat → Teklif → Konsorsiyum koltuğu → Ortak veri modeli; G0–G4 kapıları; kişi-gün kaydı; KPI panosu.
5. M3 Evidence Pack, M2 Concept Note (YZ taslak), M4 Focal Point, M8 Consortium Matching.
6. Yönetici konsolu: modül durumları (kapalı/geliştirmede/pilot/açık), bağımlılık kontrolü, kademeli kapanış, olay kaydı, plan/eklenti eşlemesi.
7. Faturalama: planlar, eklentiler, koltuk, YZ kredileri, yıllık indirim; Stripe (EUR) + iyzico (TL, faz 2).

**MVP sonrası (v1.1–v1.3):** M6 Evaluator Lens, M9 Meeting Briefs, M10 Follow-up Documents, M11 Full Application Production, M7 TTO Accelerator, API lisansı. (Pazar yeri kaldırıldı — ADR-0005.)

**Hedef olmayanlar:** Funding & Tenders portalına otomatik gönderim (yasak/desteklenmiyor — kullanıcı portalda kendisi gönderir); proje yürütme/muhasebe (EMDESK alanı; entegrasyon olarak düşünülür); hakemlik otomasyonu (YZ yalnızca iç ön değerlendirme; Komisyon kuralı).

## 2. Kullanıcı rolleri

| Rol | Kapsam |
|---|---|
| `platform_admin` | Fabrika ekibi; tüm kiracılar, modül kataloğu, fiyat/plan tanımları, sistem işleri |
| `tenant_owner` | Kiracının sahibi; faturalama, plan, kullanıcılar, **modül aç/kapa** |
| `tenant_admin` | Sahip gibi ama faturalama hariç |
| `pipeline_manager` | Tüm açık ve pilot modüller; kapı kararları; çalışma alanı yönetimi |
| `writer` | M2, M3, M11, M6 kullanımı; teklif düzenleme |
| `member` | Görüntüleme + atanmış görevler |
| `guest_partner` | Yalnızca davet edildiği teklifin ortak katkı alanları (M11 ortak portalı) |

Çok kiracılı model: `Tenant` → birden çok `Workspace` (danışmanlıklar için müşteri başına bir çalışma alanı). Tüm veri satırları `tenantId` taşır; Postgres **Row Level Security** zorunlu (`docs/SECURITY_COMPLIANCE.md`).

## 3. Çekirdek katmanlar (K1–K6)

| Katman | MVP kapsamı | Ayrıntı |
|---|---|---|
| **K1 Çağrı toplama** | F&T (SEDIA) arama API'si + topicDetails; Eurostars/Eureka çağrı sayfaları; TÜBİTAK duyuru RSS/HTML; normalize `Call`/`Topic` tabloları; günlük cron | `docs/ARCHITECTURE.md §4`, `docs/DATA_MODEL.md` |
| **K2 CORDIS** | Aylık HE + H2020 CSV indirme → `Organization`, `Project`, `Participation`; graf metrikleri (derece, eigenvector) | `docs/ARCHITECTURE.md §5` |
| **K3 Taban oranlar** | Horizon Dashboard'dan xlsx yükleme arayüzü (manuel, üç ayda bir) → `TopicStat` | |
| **K4 Outreach** | Dış araç bağlantıları (Portal partner search, GREENET, Ideal-ist, EEN, LinkedIn) derin link; e-posta şablonları | |
| **K5 Pipeline/CRM** | `Opportunity`, `Proposal`, `ConsortiumSeat`, `PartnerOrg`, `Gate`, `Effort` | |
| **K6 YZ** | Sağlayıcıdan bağımsız LLM adaptörü (Anthropic varsayılan), embedding + pgvector, RAG (çalışma programı PDF + topic JSON + CORDIS özet), **kredi sayacı**, **YZ kullanım günlüğü** (şeffaflık beyanı için) | `docs/ARCHITECTURE.md §6` |

## 4. Modüller ve durum makinesi

Durumlar: `off → dev → pilot → on`. Yalnızca `on` kullanıcı menüsünde; `pilot` yalnızca `pipeline_manager` ve üstüne görünür. Bağımlılık kuralı: zorunlu bağımlılıkların hepsi `on|pilot` olmadan modül açılamaz; bir modül `off` yapılınca ona bağımlı `on|pilot` modüller kademeli `off` olur ve yöneticiye listelenir. Plan kuralı: plan/eklenti kapsamı dışındaki modül `on` yapılamaz; konsolda "Eklentiyi satın al" akışı açılır.

| ID | Modül | Zorunlu bağımlılık | Önerilen | Plan | MVP |
|---|---|---|---|---|---|
| M1 | Partner Intelligence Database | — (K2) | — | Ekip | ✓ |
| M2 | Concept Note Architectures | — (K1, K6) | M3 | Başlangıç (3/ay), Ekip | ✓ |
| M3 | Evidence Pack | — | — | Başlangıç | ✓ |
| M4 | Focal Point | M1 | — | Ekip | ✓ |
| M5 | Proposal Production Workflows | — (K5) | — | Başlangıç | ✓ |
| M6 | Evaluator Lens | M2 veya M11 | — | İşletme / eklenti €99 | v1.1 |
| M7 | TTO Accelerator | M1, M4 | — | Kurumsal / eklenti €129 | v1.3 |
| M8 | Consortium Matching | M1 | M4 | Ekip / eklenti €79 | ✓ |
| M9 | Meeting Briefs | M1, M4 | — | İşletme | v1.1 |
| M10 | Follow-up Documents | M4 | M9 | İşletme | v1.2 |
| M11 | Full Application Production | M2, M3, M5, M8 | — | İşletme / eklenti €149 | v1.2 |

Her modülün işlevsel spesifikasyonu `docs/MODULES.md`'de; her modül `src/modules/<id>/` altında `manifest.ts` ile tanımlanır (`docs/ARCHITECTURE.md §3`).

## 5. Stage-gate (M5) — sayısal kurallar (kiracı yöneticisi düzenleyebilir; varsayılanlar)

| Kapı | Kural |
|---|---|
| G0 Konu triyajı | uyum ≥ 70/100 **ve** taban oran ≥ %8 **ve** ülke uygun |
| G1 Rol kararı | koordinasyon için erişilebilir koordinatörde ≥1 önceki FP koordinasyonu; yoksa "ortak" |
| G2 Konsorsiyum kilidi | son tarihe ≥14 hafta kala tüm koltuklar dolu + bütçe onayı; G0→G2 ≤ 8 hafta |
| G3 Sahte değerlendirme | her kriter ≥ 4,0 ve toplam ≥ 12/15 (M6 yoksa manuel puan girişi) |
| G4 Gönderim | son tarihten ≥24 saat önce "gönderildi" işareti; ESR yüklenince puanlar kaydedilir |

G0 puanlama ağırlıkları (100): uyum 30, taban oran 15, koordinatör geçmişi 15, araştırma+son kullanıcı 12, ağ merkeziliği 10, bütçe/rol ekonomisi 10, lump-sum/iki aşamalı 8. Ağırlıklar `TenantSettings.scoringWeights` JSON'unda; varsayılanlar `src/lib/scoring/defaults.ts`.

> **⚠️ Doküman/kod farkı (ölçüldü 2026-09-07):** Yukarıdaki kural (satır 75) ve ağırlıklar (bu satır) kanonik `scoreG0()`/`decideG0()` fonksiyonlarında (`src/lib/scoring/g0-canonical.ts`) doğru tanımlı, ama üretim kodunda **hiçbir yerden çağrılmıyor**. `Opportunity.g0Score` bugün ya `prisma/seed-opportunities.ts`'teki sabit değerlerden (75, 82, 85, 88, 92) ya da demo pipeline'daki `Math.random() * 15 + 80`'den geliyor; `src/lib/gates/evaluate.ts` kapı kararını bu üretilmemiş sayıyla veriyor. Yani kullanıcıya gösterilen G0 puanı şu an bu sayfadaki formülün ürünü değil. Kanıt: `docs/agent-results/TASK-MTQ63RR8Z0G8E-blok-zincir-dse.md`, `docs/agent-results/TASK-MTQ63RR8Z0G8E-ui-audit-customer-support.md`. Kapatma işi board'da **TASK-MTQ63RR8Z0G8E** (henüz açık — kanonik fonksiyonu üretime bağlamak kaldı).

## 6. Faturalama ve planlar

`docs/BILLING.md`. Özet: Keşif €0 / Başlangıç €59 / Ekip €249 / İşletme €599 / Kurumsal €1.500+ (aylık, EUR, yıllıkta %20 indirim); eklentiler M6 €99, M11 €149, M7 €129, M8 Pro €79, ek çalışma alanı €49; ek koltuk €19/€29/€39; YZ kredi paketi €49/250. Stripe Billing (EUR) MVP; iyzico (TL) faz 2. Plan → `PlanEntitlement` tablosu (modüller, koltuk, çalışma alanı, kredi).

## 7. Teknoloji yığını (bağlayıcı)

- **Next.js 15 (App Router) + TypeScript (strict)**, React Server Components; UI: Tailwind + shadcn/ui; formlar: react-hook-form + zod.
- **PostgreSQL 16** (Neon veya Supabase) + **Prisma** ORM + **pgvector**; RLS politikaları `prisma/rls.sql`.
- **Auth:** Auth.js (NextAuth v5) — e-posta/şifre + Google + Microsoft; kurumsal SSO (SAML) faz 2.
- **İşler/cron:** Inngest (veya BullMQ + Redis) — K1 günlük, K2 aylık, uyarı e-postaları, Stripe webhook'ları.
- **Veri işleme (Python worker):** `workers/` altında Python 3.12 + DuckDB + pandas: CORDIS CSV → Parquet → Postgres; graf metrikleri (networkx). Node'dan HTTP ile tetiklenir.
- **YZ:** `@anthropic-ai/sdk` varsayılan, OpenAI-uyumlu adaptör; embedding: `text-embedding-3-large` ya da Voyage; RAG: pgvector.
- **E-posta:** Resend; **dosya:** S3 uyumlu (Cloudflare R2); **PDF:** `@react-pdf/renderer`; **DOCX:** `docx`.
- **Ödeme:** Stripe Billing + Customer Portal; iyzico faz 2.
- **Gözlemlenebilirlik:** Sentry, OpenTelemetry, PostHog (ürün analitiği).
- **Test:** Vitest (birim), Playwright (e2e), Prisma test DB; CI GitHub Actions.
- **Dağıtım:** Vercel (web) + Fly.io/Railway (Python worker) + Neon; önizleme ortamları PR başına.
- **i18n:** next-intl; `messages/tr.json`, `messages/en.json`; tüm kullanıcıya görünen metin çeviri anahtarı ile.

## 8. Kabul kriterleri (MVP "bitti" tanımı)

- [ ] Yeni kiracı 5 dakikada kaydolup Keşif planında bir kayıtlı arama oluşturabilir ve 24 saat içinde e-posta uyarısı alır.
- [ ] K1 günlük iş, F&T'den en az 500 açık/yaklaşan konuyu normalize eder; API değişince alarm üretir; başarısız çalıştırma yeniden denenir.
- [ ] K2 aylık iş, CORDIS HE dökümünü 30 dakikanın altında işler; M1'de "HORIZON-CL5-2026-09-D4" öneki için ilk 20 koordinatör 2 saniyenin altında listelenir.
- [ ] Bir fırsat G0→G4 kapılarından geçirilebilir; her kapı kararı olay kaydında; kişi-gün toplamı raporda.
- [ ] Yönetici konsolunda M4 açılmaya çalışıldığında M1 kapalıysa engellenir; M1 kapatılınca M4/M8/M9 kademeli kapanır ve liste gösterilir.
- [ ] Ekip planındaki kiracı M6'yı açmaya çalışınca eklenti satın alma akışı açılır; Stripe test modunda ödeme sonrası M6 `on` olur.
- [ ] Concept note taslağı (M2) 90 saniyenin altında üretilir; kredi düşer; YZ kullanım günlüğüne yazılır; "YZ kullanım beyanı" tek tıkla dışa aktarılır.
- [ ] RLS testi: A kiracısının kullanıcısı B kiracısının hiçbir satırını okuyamaz (otomatik test).
- [ ] Lighthouse erişilebilirlik ≥ 90; tüm metinler tr/en.
- [ ] KVKK/GDPR: veri işleme kaydı, silme isteği akışı, çerez onayı.

## 9. Depo yapısı

```
fabrika/
  PROJECT.md            ← bu dosya
  CLAUDE.md             ← Claude Code çalışma kuralları
  README.md
  docs/                 ← BUSINESS_MODEL, ARCHITECTURE, DATA_MODEL, MODULES, API, BILLING, SECURITY_COMPLIANCE, ROADMAP, UI_GUIDE
  prisma/schema.prisma, prisma/rls.sql, prisma/seed.ts
  src/app/              ← Next.js rotaları: [locale]/(public) (app)/[workspace]/... admin
  src/modules/<m1..m11>/manifest.ts, server/, ui/
  src/core/             ← k1-calls, k2-cordis, k3-stats, k4-outreach, k5-pipeline, k6-ai
  src/lib/              ← auth, billing, scoring, i18n, rls, events
  workers/              ← Python worker (CORDIS, graf)
  messages/tr.json, en.json
  .claude/commands/     ← yeniden kullanılabilir Claude Code komutları
  .env.example
```

## 10. Çalışma sırası (epik düzeyi; ayrıntı `docs/ROADMAP.md`)

E0 İskelet ve altyapı → E1 Kiracı/auth/RLS → E2 Faturalama ve yetkilendirme → E3 Modül çekirdeği + yönetici konsolu → E4 K1 çağrı toplama + kayıtlı arama + uyarı → E5 K5/M5 pipeline ve kapılar → E6 K2/M1 CORDIS ve ortak kartları → E7 M3 Evidence Pack → E8 K6 YZ + M2 Concept Note → E9 M4 + M8 → E10 KPI panosu, i18n, erişilebilirlik, KVKK → E11 Beta (tasarım ortakları) → v1.1+ M6, M9, M10, M11, M7, API.

## 11. Kaynak dosya

Bu spesifikasyon "Avrupa Proje Fabrikası" proje dosyasından (2 Eylül 2026) türetilmiştir; program tarihleri, başarı oranları ve kanıtlar orada kaynaklıdır. Ürün içi metinlerde rakam kullanılacaksa kaynak alanı zorunludur (`Evidence.sourceUrl`).
