# ROADMAP.md — Epikler, sprintler, kabul kriterleri

Sprint = 2 hafta. MVP = 8 sprint (16 hafta). Ekip: 1 full-stack + 1 backend/veri + 0,5 tasarım + Claude Code.

## Faz A — MVP (S1–S8)

### E0 · İskelet ve altyapı (S1)
- [x] `pnpm create next-app` (App Router, TS strict, Tailwind, ESLint), shadcn/ui, next-intl (tr/en), Prisma + Postgres (docker-compose: postgres16+pgvector, redis, mailpit), Vitest, Playwright, GitHub Actions (lint, typecheck, test, migrate check).
  kısmi: `docker-compose.yml`'de yalnız `postgres-vector` (pgvector/pgvector:pg16) + `fabrika-web` var; **redis ve mailpit servisleri yok**. CI (`.github/workflows/ci.yml`) `prisma validate`+lint+typecheck+test çalıştırıyor ama ayrı bir "migrate check" adımı yok.
- [ ] `src/lib/env.ts` (zod ile env), `src/lib/logger.ts`, Sentry, PostHog.
  kısmi: `env.ts`/`logger.ts` var. Sentry gerçekten var ama `@sentry/nextjs` SDK'sı ile değil,
  `src/lib/observability/sentry.ts` içinde elle yazılmış envelope HTTP istemcisiyle (bkz.
  `[[fabrika-sentry-envelope-without-sdk]]`) — `package.json`'da "sentry" aramak yanıltıyor, dosyayı
  doğrudan kontrol et. **PostHog ise yalnız bir stub** (`src/lib/analytics.ts` — `console.log`
  yapıyor, gerçek PostHog SDK/API çağrısı yok) — bu yüzden kutu tam işaretlenmedi.
- [x] `docs/UI_GUIDE.md`'ye göre tema tokenleri; boş sayfa kabuğu (sol nav, üst çubuk, çalışma alanı seçici).
- [x] `npx prisma validate` + ilk migration (`prisma/schema.prisma` hazırlandığı ortamda çevrimdışı olduğu için henüz doğrulanmadı; hata çıkarsa şemayı düzelt ve `docs/DATA_MODEL.md`'yi güncelle).
- Kabul: CI yeşil; `pnpm dev` ile tr/en boş kabuk.

### E1 · Kiracı, kimlik, RLS (S1–S2)
- [x] Auth.js: e-posta/şifre + Google + Microsoft; kayıt → `Tenant` + `Workspace` + `Membership(TENANT_OWNER)` (`src/lib/auth.ts`, Google + MicrosoftEntraID sağlayıcıları kayıtlı).
- [x] `withTenant(prisma, tenantId)` (`SET LOCAL app.tenant_id`), `prisma/rls.sql` tüm kiracı tabloları için (döngüyle tüm tablolara `ENABLE/FORCE ROW LEVEL SECURITY` + `tenant_isolation`/`tenant_or_shared` politikası); RLS negatif testleri (`tests/rls.spec.ts`, `tests/e2e/rls.spec.ts` — kiracı A/B izolasyonu `fabrika_app` NOBYPASSRLS rolüyle doğrulanıyor).
- [x] Davet akışı (e-posta) (`src/app/api/invitations`, `Invitation` modeli), roller, `can()` yetkilendirme (`src/lib/rbac.ts`).
- Kabul: PROJECT.md §8 RLS maddesi; 5 dakikada kayıt.

### E2 · Faturalama ve yetkilendirme (S2–S3)
- [x] `Plan`, `AddOnCatalog` seed; Stripe ürün/fiyat script'i (`scripts/stripe-sync.ts`).
- [x] Checkout, webhook'lar (`src/app/api/webhooks/stripe`), Customer Portal, `entitlements()`, kredi defteri (aylık grant cron — `src/lib/inngest/jobs/credits-monthly-grant.ts`).
- [x] `/settings/billing`.
- Kabul: test modunda plan satın alma → yetkiler; eklenti satın alma → modül ON.

### E3 · Modül çekirdeği + yönetici konsolu (S3)
- [x] `ModuleManifest` tipi, registry, derleme zamanı doğrulama; 11 manifest (`src/modules/m1`–`m11`, boş UI ile).
- [x] `state-machine.ts` (`canEnable/enable/disable/cascade`) + birim testleri (`tests/modules/state-machine.test.ts`, `tests/admin-modules.test.ts`).
- [x] `requireModule`, `useModuleEnabled` (`src/lib/modules/access.ts`, `hooks.tsx`), nav filtreleme; `/settings/modules`, `/admin/modules`.
- Kabul: PROJECT.md §8 modül maddeleri.

### E4 · K1 çağrı toplama, kayıtlı arama, uyarı (S3–S4)
- [x] `adapters/sedia.ts` (arama + topicDetails; zod şema; ham kayıt; SystemAlert), `adapters/eurostars.ts`, `adapters/tubitak.ts`; Inngest günlük iş (`k1-daily-calls.ts`, `0 2 * * *`); normalize.
- [ ] Uygunluk çıkarımı (ülke listesi, "EU/EEA/CH only" tespiti), lump-sum/iki aşamalı bayrakları.
  doğrulanmadı: adaptör/normalize kodu içinde bu alanlar taranmadı — ayrıca teyit gerek.
- [ ] `TenantProfile` formu + embedding; `TopicMatch` gece hesaplama; `/calls` listesi (filtre: program, son tarih, uygunluk, uyum), `/calls/[id]`.
  kısmi: `TenantProfile` formu (`settings/profile`) ve `embedding vector(1536)` alanları var; `/calls` listesi + filtre + `/calls/[id]` var. **`TopicMatch` gece hesaplama işi (cron) yok** — model şemada duruyor ama `TopicMatch` yalnız bir yorum satırında (`src/lib/scoring/g0-canonical.ts:29`) geçiyor, onu dolduran bir job bulunamadı.
- [x] `SavedSearch` + günlük diff e-postası (Resend, tr/en) (`SavedSearch` modeli, `src/lib/inngest/jobs/alerts-daily.ts`, Resend kullanımı `src/actions`/`src/lib/feedback` içinde doğrulandı).
- Kabul: ≥500 konu; uyarı 24 saat içinde; API şeması değişince alarm.

### E5 · K5/M5 pipeline ve kapılar (S4–S5)
- [ ] `Opportunity` oluşturma (`/calls/[id]` → "pipeline'a al"), kanban, kapı paneli, `evaluateGate` + varsayılan kurallar + `/settings/gates`, T-6 plan şablonu, görevler, çaba kaydı, takvim.
  kısmi: `Opportunity`, kanban (`pipeline/page.tsx`), `GateDecision` + `/settings/gates` + `tests/gates.test.ts`, çaba kaydı (`Effort` modeli) doğrulandı. **T-6 plan şablonu, ayrı görev (task) listesi ve takvim modeli/ekranı bulunamadı** (şemada `Task`/`Calendar` modeli yok).
- [x] G0 puanlama (`src/lib/scoring/g0-canonical.ts`, 7 faktörlü bileşik skor, ağırlıklar — bkz. Açık karar #8).
- Kabul: kapı kuralları test; olay kaydı; kişi-gün raporu.

### E6 · K2/M1 CORDIS ve ortak kartları (S5–S6)
- [x] Python worker (FastAPI, `workers/cordis/main.py`): indir, temizle, upsert; Inngest aylık tetik (`k2-monthly-cordis.ts`, `0 4 1 * *`).
  doğrulanmadı: DuckDB/Parquet/`COPY` ve networkx türev metrikleri worker kodunda satır satır taranmadı — dosyanın varlığı ve aylık job doğrulandı, iç uygulama detayı teyit edilmedi.
- [x] `/partners`, `/partners/[pic]`, `/partners/leaders`; graf bileşeni (`src/app/api/v1/partners`, workspace `partners` sayfaları).
- Kabul: aylık iş < 30 dk; liderler < 2 s.

### E7 · M3 Evidence Pack (S6)
- [x] CRUD (`evidence/actions.ts`), filtreler, geçerlilik uyarıları (`EvidenceReminder` modeli, `evidence-health.ts`), dosya yükleme (R2 — `src/lib/storage.ts`, `@aws-sdk/client-s3`), kanıt çekmecesi bileşeni (`EvidenceDrawer.tsx`), CSV dışa aktarım.

### E8 · K6 YZ + M2 Concept Note (S6–S7)
- [ ] `llm.ts` adaptör (Anthropic + OpenAI-uyumlu), `AiUsageLog` + kredi (transaction), RAG (Document/Chunk, pgvector, hnsw), çalışma programı PDF içe aktarma (platform admin).
  kısmi: `AiUsageLog`, `Document`/`Chunk` (pgvector) modelleri var. LLM adaptör kodu CLAUDE.md §5'in istediği `src/core/k6-ai/llm.ts` yolunda **değil** — `src/lib/llm.ts` ve `src/lib/ai/llm.ts` olmak üzere **iki ayrı dosya** var; bu mimari sapma ayrı bir teknik-borç maddesi olarak işaretlenmeli. Çalışma programı PDF içe aktarma teyit edilmedi.
- [x] `ConceptTemplate` seed (model + seed), editör (`concept-notes/[id]/editor.tsx`), YZ taslak, sürüm, DOCX dışa aktarım (`api/concept-notes/[id]/export`), YZ kullanım beyanı.
- Kabul: taslak < 90 s; kredi/günlük; kör şablon ad tespiti.

### E9 · M4 Focal Point + M8 Consortium Matching (S7)
- [ ] `Relationship/Interaction` CRUD, 60 gün cron, haftalık özet; M1 kartından "ilişki aç".
  kısmi: `Relationship`/`Interaction` modelleri ve `relationships` sayfası var; haftalık özet cron'u var (`m4-weekly-summary.ts`, Pazartesi 09:00 — vadesi bir hafta içindeki `nextStepDue` eylemlerini gruplayıp bildiriyor). **"60 gün etkileşimsiz ilişkiyi hatırlat" cron'u ayrıca bulunamadı** — yalnızca haftalık vade özeti var.
- [x] Rol matrisi, `SeatCandidate` puanlama (M8 spesifikasyonu, `src/lib/scoring/consortium.ts`), çakışma uyarısı (aynı org'un birden çok koltuğa atanması tespiti), "davet et" (`src/app/api/invitations`).
- Kabul: 5 aday < 3 s; birim testler.

### E10 · KPI panosu, i18n tamamlama, erişilebilirlik, KVKK (S8)
- [ ] `/dashboard`: teklif sayısı, eşik üstü oranı, isabet, kişi-gün/teklif, G0→G2 süresi, açık modül sayısı.
  kısmi: `/dashboard` ekranı ve tüm kartlar var, ama `dashboard/client.tsx` içinde gerçek değer `'0'` geldiğinde kart **sabit rakamlara düşüyor** (`thresholdRate === '0' ? '84.2' : thresholdRate`, `hitRate`→`68.5`, `personDaysPerOpp`→`14.2`, `fundedOpps || 4`) — bu CLAUDE.md §7 "kanıt disiplini" kuralını ihlal ediyor (gösterilen istatistik `Evidence`/`TopicStat`'a değil sabit koda bağlı). Bu satırlar `src/` kapsamında olduğu için bu görevde düzeltilmedi; ayrı bir düzeltme görevi açılmalı.
- [ ] i18n denetimi (`/i18n-check`), Lighthouse a11y ≥ 90, çerez onayı, veri dışa aktarma/silme uç noktaları, DPA şablonu, gizlilik/şartlar sayfaları (tr/en).
  kısmi: i18n denetim aracı (`scripts/i18n-check.ts`, `.github/workflows/i18n-check.yml`), veri dışa aktarma/silme uç noktaları (`api/gdpr/export`, `api/gdpr/delete`, `api/user/export*`), DPA şablonu (`(marketing)/compliance/dpa`), gizlilik/şartlar sayfaları (tr/en) doğrulandı; a11y için ayrı düzeltme commit'i (`a3649ef`) ve elle çalıştırılan bir lighthouse ölçüm reçetesi var
(bkz. `[[fabrika-lighthouse-a11y-two-recurring-defects]]`), ama **CI'da bunu otomatik uygulayan/≥90
eşiğini kesen bir adım yok** (`.github/workflows/ci.yml`'de lighthouse/axe-core adımı yok) — skor
regresyonu ancak elle koşulunca yakalanıyor.
- [x] Marketing sitesi: ana sayfa, fiyatlandırma, "Türkiye'ye açık çağrılar" SEO sayfaları (K1'den) (`src/app/(marketing)`: `calls/[region]`, `pricing`, vb.).

### E11 · Beta (S8 sonu → 8 hafta)
- kısmi: alt yapı hazır ve kısmen işletildi — tasarım-ortağı davet CLI'ı (`scripts/beta-onboarding.ts`), fiyat doğrulama anketi/analizi (`src/lib/beta/pricing-*`), geri bildirim + P0-P3 triyaj + haftalık özet (`feat(e11): in-app beta feedback...` commit'leri), ESR örnekleri ve G0 kalibrasyonu (`src/lib/beta/esr-samples.ts`, `tests/esr-calibration.test.ts`, `feat(m5): calibrate the G0 gate against real evaluation outcomes`). **10 tasarım ortağının gerçekten kayıtlı/aktif olduğu ve 8 haftalık betanın fiilen yürütüldüğü bu depodan doğrulanamaz** (bu, üründen değil operasyondan kanıt ister) — bu satır bilinçli olarak işaretlenmedi.

## Faz B — v1.1 (S9–S12): M6 Evaluator Lens, M9 Meeting Briefs, takvim entegrasyonu, iyzico, SSO.
## Faz C — v1.2 (S13–S16): M10 Follow-up Documents, M11 Full Application Production (ortak portalı, bütçe/lump-sum, Gantt), e-fatura.
## Faz D — v1.3 (S17–S20): M7 TTO Accelerator, pazar yeri (Stripe Connect), Partner Intelligence API, İngilizce pazar açılışı.

## Açık kararlar (yanıtlanmadan varsayılmaz)
1. Marka adı ve alan adı (çalışma adı "Fabrika").
2. Neon mu Supabase mi (RLS ve pgvector ikisinde de var; Supabase Auth kullanılmayacak, Auth.js kalacak).
3. Inngest (yönetilen) mi BullMQ+Redis (kendi) mi — MVP'de Inngest önerilir.
4. Embedding sağlayıcısı (OpenAI text-embedding-3-large 1536 vs Voyage) — şema 1536 varsayıyor.
5. Ücretsiz plan kredisi (10) ve deneme süresi (14 gün) — beta sonrası gözden geçirilir.
6. Başarı primi sunulacak mı, yoksa yalnızca sabit ücret + bonus mu (hukuki görüş).
7. Türkçe e-fatura entegrasyonu için sağlayıcı.
8. **G0 eşiği hangi sayıya uygulanıyor?** — ✅ **KARARLAŞTIRILDI (2026-09-06, patron onayı).**
   Eşik **bileşik skora** uygulanır: `src/lib/scoring/g0-canonical.ts` içindeki 7 faktörlü 0–100
   bileşik skor **≥ 70**, PROJECT.md:75'in sert kurallarıyla birlikte (taban oran ≥ %8, ülke uygun).
   Kanonik kural seti = `DEFAULT_G0_RULES`. `SPEC_LITERAL_G0_RULES` yalnız kalibrasyon karşılaştırması
   için saklanır, kapıda kullanılmaz. Bu karar `/settings/gates` etiketine ve `gates/evaluate.ts`
   çağrısına yansıtılacaktır (bkz. board TASK-MTQ63RR8Z0G8E).

## Riskler (teknik)
- F&T API'si resmî değil → adaptör + yedek kaynak + alarm (E4).
- CORDIS dosya adları/sütunları değişebilir → worker'da sütun eşleme tablosu + test fixture'ları.
- LLM maliyeti → kredi modeli, önbellek, küçük model yönlendirme.
- RLS unutulan tablo → CI'da `scripts/check-rls.ts` (tüm kiracı tablolarında politika var mı).
