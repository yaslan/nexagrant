# ROADMAP.md — Epikler, sprintler, kabul kriterleri

Sprint = 2 hafta. MVP = 8 sprint (16 hafta). Ekip: 1 full-stack + 1 backend/veri + 0,5 tasarım + Claude Code.

## Faz A — MVP (S1–S8)

### E0 · İskelet ve altyapı (S1)
- [ ] `pnpm create next-app` (App Router, TS strict, Tailwind, ESLint), shadcn/ui, next-intl (tr/en), Prisma + Postgres (docker-compose: postgres16+pgvector, redis, mailpit), Vitest, Playwright, GitHub Actions (lint, typecheck, test, migrate check).
- [ ] `src/lib/env.ts` (zod ile env), `src/lib/logger.ts`, Sentry, PostHog.
- [ ] `docs/UI_GUIDE.md`'ye göre tema tokenleri; boş sayfa kabuğu (sol nav, üst çubuk, çalışma alanı seçici).
- [ ] `npx prisma validate` + ilk migration (`prisma/schema.prisma` hazırlandığı ortamda çevrimdışı olduğu için henüz doğrulanmadı; hata çıkarsa şemayı düzelt ve `docs/DATA_MODEL.md`'yi güncelle).
- Kabul: CI yeşil; `pnpm dev` ile tr/en boş kabuk.

### E1 · Kiracı, kimlik, RLS (S1–S2)
- [ ] Auth.js: e-posta/şifre + Google + Microsoft; kayıt → `Tenant` + `Workspace` + `Membership(TENANT_OWNER)`.
- [ ] `withTenant(prisma, tenantId)` (`SET LOCAL app.tenant_id`), `prisma/rls.sql` tüm kiracı tabloları için; RLS negatif testleri.
- [ ] Davet akışı (e-posta), roller, `can()` yetkilendirme.
- Kabul: PROJECT.md §8 RLS maddesi; 5 dakikada kayıt.

### E2 · Faturalama ve yetkilendirme (S2–S3)
- [ ] `Plan`, `AddOnCatalog` seed; Stripe ürün/fiyat script'i (`scripts/stripe-sync.ts`).
- [ ] Checkout, webhook'lar, Customer Portal, `entitlements()`, kredi defteri (aylık grant cron).
- [ ] `/settings/billing`.
- Kabul: test modunda plan satın alma → yetkiler; eklenti satın alma → modül ON.

### E3 · Modül çekirdeği + yönetici konsolu (S3)
- [ ] `ModuleManifest` tipi, registry, derleme zamanı doğrulama; 11 manifest (boş UI ile).
- [ ] `state-machine.ts` (`canEnable/enable/disable/cascade`) + birim testleri (bağımlılık, kademeli kapanış, plan kısıtı).
- [ ] `requireModule`, `useModuleEnabled`, nav filtreleme; `/settings/modules`, `/admin/modules`.
- Kabul: PROJECT.md §8 modül maddeleri.

### E4 · K1 çağrı toplama, kayıtlı arama, uyarı (S3–S4)
- [ ] `adapters/sedia.ts` (arama + topicDetails; zod şema; ham kayıt; SystemAlert), `adapters/eurostars.ts`, `adapters/tubitak.ts`; Inngest günlük iş; normalize.
- [ ] Uygunluk çıkarımı (ülke listesi, "EU/EEA/CH only" tespiti), lump-sum/iki aşamalı bayrakları.
- [ ] `TenantProfile` formu + embedding; `TopicMatch` gece hesaplama; `/calls` listesi (filtre: program, son tarih, uygunluk, uyum), `/calls/[id]`.
- [ ] `SavedSearch` + günlük diff e-postası (Resend, tr/en).
- Kabul: ≥500 konu; uyarı 24 saat içinde; API şeması değişince alarm.

### E5 · K5/M5 pipeline ve kapılar (S4–S5)
- [ ] `Opportunity` oluşturma (`/calls/[id]` → "pipeline'a al"), kanban, kapı paneli, `evaluateGate` + varsayılan kurallar + `/settings/gates`, T-6 plan şablonu, görevler, çaba kaydı, takvim.
- [ ] G0 puanlama (`src/lib/scoring/g0.ts`, ağırlıklar tenant ayarından).
- Kabul: kapı kuralları test; olay kaydı; kişi-gün raporu.

### E6 · K2/M1 CORDIS ve ortak kartları (S5–S6)
- [ ] Python worker (FastAPI): `/jobs/cordis` — indir, DuckDB, temizle, Parquet, `COPY` → upsert; türev metrikler (networkx); Inngest aylık tetik.
- [ ] `/partners`, `/partners/[pic]`, `/partners/leaders`; graf bileşeni.
- Kabul: aylık iş < 30 dk; liderler < 2 s.

### E7 · M3 Evidence Pack (S6)
- [ ] CRUD, filtreler, geçerlilik uyarıları, dosya yükleme (R2), kanıt çekmecesi bileşeni, CSV dışa aktarım.

### E8 · K6 YZ + M2 Concept Note (S6–S7)
- [ ] `llm.ts` adaptör (Anthropic + OpenAI-uyumlu), `AiUsageLog` + kredi (transaction), RAG (Document/Chunk, pgvector, hnsw), çalışma programı PDF içe aktarma (platform admin).
- [ ] `ConceptTemplate` seed (7 şablon), editör, YZ taslak, sürüm, DOCX dışa aktarım, YZ kullanım beyanı.
- Kabul: taslak < 90 s; kredi/günlük; kör şablon ad tespiti.

### E9 · M4 Focal Point + M8 Consortium Matching (S7)
- [ ] `Relationship/Interaction` CRUD, 60 gün cron, haftalık özet; M1 kartından "ilişki aç".
- [ ] Rol matrisi, `SeatCandidate` puanlama (M8 spesifikasyonu), çakışma uyarısı, "davet et".
- Kabul: 5 aday < 3 s; birim testler.

### E10 · KPI panosu, i18n tamamlama, erişilebilirlik, KVKK (S8)
- [ ] `/dashboard`: teklif sayısı, eşik üstü oranı, isabet, kişi-gün/teklif, G0→G2 süresi, açık modül sayısı.
- [ ] i18n denetimi (`/i18n-check`), Lighthouse a11y ≥ 90, çerez onayı, veri dışa aktarma/silme uç noktaları, DPA şablonu, gizlilik/şartlar sayfaları (tr/en).
- [ ] Marketing sitesi: ana sayfa, fiyatlandırma, "Türkiye'ye açık çağrılar" SEO sayfaları (K1'den).

### E11 · Beta (S8 sonu → 8 hafta)
- 10 tasarım ortağı; haftalık geri bildirim; hata/istek triyajı; fiyat doğrulama; ilk ESR'lerle G0 kalibrasyonu.

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
8. **G0 eşiği hangi sayıya uygulanıyor?** PROJECT.md:75 kapıyı "uyum ≥ 70 **ve** taban oran ≥ %8 **ve** ülke uygun"
   diye tanımlıyor; `/settings/gates` ekranı aynı 70'i "Minimum AI Alignment Score" diye etiketliyor;
   `src/lib/gates/evaluate.ts` ise 70'i **bileşik** skora uyguluyor. Üçü aynı davranış değil — E11.3
   kalibrasyon koşusunda iki okuma arasında 10 puanlık doğruluk farkı ölçüldü
   (bkz. `docs/CORDIS-SAMPLE-CALIBRATION.md`). Karar verilmeden eşik değiştirilmemeli.

## Riskler (teknik)
- F&T API'si resmî değil → adaptör + yedek kaynak + alarm (E4).
- CORDIS dosya adları/sütunları değişebilir → worker'da sütun eşleme tablosu + test fixture'ları.
- LLM maliyeti → kredi modeli, önbellek, küçük model yönlendirme.
- RLS unutulan tablo → CI'da `scripts/check-rls.ts` (tüm kiracı tablolarında politika var mı).
