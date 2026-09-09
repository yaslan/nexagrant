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
- [x] `adapters/sedia.ts` (arama; zod sözleşmeleri `adapters/schemas/`; ham kayıt; SystemAlert), `adapters/eurostars.ts`, `adapters/tubitak.ts`; Inngest günlük iş (`k1-daily-calls.ts`, `0 2 * * *`); normalize; elle tetikleme `pnpm jobs:k1`.
- [x] Uygunluk çıkarımı (`eligibility.eligibleCountries`, "EU/EEA/CH only" → `['EU','EEA','CH']`), lump-sum/iki aşamalı bayrakları, `ageInDays`.
  doğrulandı 2026-09-06 (`pnpm jobs:k1 -- --dry-run`): SEDIA 1214 konu / 12 sn · lumpSum 453 · twoStage 592 · EU-EEA-CH-only 25 · ageInDays 1214/1214. Eurostars 2 çağrı, TÜBİTAK 54 program. Birim testler: `tests/k1-adapters.test.ts` (16 test, ağsız fixture).
- [ ] `TenantProfile` formu + embedding; `TopicMatch` gece hesaplama; `/calls` listesi (filtre: program, son tarih, uygunluk, uyum), `/calls/[id]`.
  kısmi: `TenantProfile` formu (`settings/profile`) ve `embedding vector(1536)` alanları var; `/calls` listesi + filtre + `/calls/[id]` var. **`TopicMatch` gece hesaplama işi (cron) yok** — model şemada duruyor ama `TopicMatch` yalnız bir yorum satırında (`src/lib/scoring/g0-canonical.ts:29`) geçiyor, onu dolduran bir job bulunamadı.
- [x] `SavedSearch` + günlük diff e-postası (Resend, tr/en) (`SavedSearch` modeli, `src/lib/inngest/jobs/alerts-daily.ts`, Resend kullanımı `src/actions`/`src/lib/feedback` içinde doğrulandı).
- Kabul: ≥500 konu **(karşılandı: 1214)**; uyarı 24 saat içinde; API şeması değişince alarm **(zarf zod doğrulaması → `SystemAlert`; testle kanıtlandı)**.

### E5 · K5/M5 pipeline ve kapılar (S4–S5)
- [ ] `Opportunity` oluşturma (`/calls/[id]` → "pipeline'a al"), kanban, kapı paneli, `evaluateGate` + varsayılan kurallar + `/settings/gates`, T-6 plan şablonu, görevler, çaba kaydı, takvim.
  kısmi: `Opportunity`, kanban (`pipeline/page.tsx`), `GateDecision` + `/settings/gates` + `tests/gates.test.ts`, çaba kaydı (`Effort` modeli) doğrulandı. **T-6 plan şablonu, ayrı görev (task) listesi ve takvim modeli/ekranı bulunamadı** (şemada `Task`/`Calendar` modeli yok).
- [ ] G0 puanlama (`src/lib/scoring/g0-canonical.ts`, 7 faktörlü bileşik skor, ağırlıklar — bkz. Açık karar #8).
  kısmi: `scoreG0()`/`decideG0()` kanonik ve test edilmiş (27 test, `tests/g0-scoring.test.ts`) ama **üretimde hiç çağrılmıyor** — ölçüldü 2026-09-07. `Opportunity.g0Score` seed'den statik (75/82/85/88/92) veya demo pipeline'da `Math.random()`'dan geliyor; `src/lib/gates/evaluate.ts` bu sayıyla kapı kararı veriyor. Eski 4-faktörlü `src/lib/scoring/g0.ts` de ölü kod (hiç import edilmiyor). Kapanmamış iş: kanonik fonksiyonu bir üretim çağrı noktasına bağlamak (fırsat oluşturma/güncelleme anı). Bkz. `docs/agent-results/TASK-MTQ63RR8Z0G8E-blok-zincir-dse.md`, board TASK-MTQ63RR8Z0G8E (açık), PROJECT.md:81 dipnotu.
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
  kısmi: `AiUsageLog`, `Document`/`Chunk` (pgvector) modelleri var. LLM adaptörü artık **tek dosya**: `src/lib/llm.ts` (TASK-MTSXGXBCJ007W; ikinci adaptör `src/lib/ai/llm.ts` silindi, CLAUDE.md §5 gerçek yolu gösterecek şekilde düzeltildi). Kredi formülü tek yerde (`creditsForUsage`) toplandı; `docs/BILLING.md`'nin eylem-başına kredi tablosunu koda taşımak **hâlâ açık** bir fiyat kararı. Çalışma programı PDF içe aktarma teyit edilmedi.
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
  **Ek bulgu — ÇÖZÜLDÜ (TASK-MTQTYXC0NUT0B, 2026-09-07):** `Proposal.outcome` karşılaştırması `['SUBMITTED','FUNDED','ABOVE_THRESHOLD']` ile büyük harf arıyordu, veri küçük harf (`above_threshold`); eşleşme olmadığı için oran %20 yerine %0 çıkıyordu. Sözlük artık tek kaynakta (`src/lib/proposal-outcome.ts`) ve okuyucular ham sütunu değil `isAboveThreshold()`'ü çağırıyor; `src/lib/beta/esr-samples.ts` de aynı listeden türüyor. Ölçüm: canlı uç nokta önce `Başarı Oranı,0.0,%` → sonra `Başarı Oranı,20.0,%`, SQL elle hesabı 1/5 = %20. Kanıt: `docs/agent-results/TASK-MTQTYXC0NUT0B-blok-zincir-dse.md`.
  **Açık kalan:** `outcome`'a dayanan **"Eşik Üstü Oranı" kartı panoda hiç render edilmiyor** — `Dashboard.thresholdRate` anahtarı tr+en'de var ama hiçbir bileşen kullanmıyor; bu satırdaki KPI listesi bu yüzden hâlâ eksik. Düzeltme yalnız CSV dışa aktarımında görünür durumda.
- [x] i18n denetimi (`/i18n-check`), Lighthouse a11y ≥ 90, çerez onayı, veri dışa aktarma/silme uç noktaları, DPA şablonu, gizlilik/şartlar sayfaları (tr/en).
  i18n denetim aracı (`scripts/i18n-check.ts`, `.github/workflows/i18n-check.yml`), veri dışa aktarma/silme uç noktaları (`api/gdpr/export`, `api/gdpr/delete`, `api/user/export*`), DPA şablonu (`(marketing)/compliance/dpa`), gizlilik/şartlar sayfaları (tr/en) doğrulandı. A11y artık **CI kapısı**: `scripts/a11y-check.ts` + `.github/workflows/a11y-check.yml`
uygulamayı derleyip başlatıyor, `/tr`, `/tr/privacy`, `/en`, `/en/privacy` sayfalarını Lighthouse ile ölçüyor ve
≥90 eşiğinin altında adımı kırıyor (eşik workflow'daki `A11Y_MIN_SCORE`; yerelde `pnpm a11y:check`).
Ölçülen skor dört sayfada da 100. Tekrar eden iki kusur için bkz. `[[fabrika-lighthouse-a11y-two-recurring-defects]]`.
- [x] Marketing sitesi: ana sayfa, fiyatlandırma, "Türkiye'ye açık çağrılar" SEO sayfaları (K1'den) (`src/app/(marketing)`: `calls/[region]`, `pricing`, vb.).

### E11 · Beta (S8 sonu → 8 hafta)
- kısmi: alt yapı hazır ve kısmen işletildi — tasarım-ortağı davet CLI'ı (`scripts/beta-onboarding.ts`), fiyat doğrulama anketi/analizi (`src/lib/beta/pricing-*`), geri bildirim + P0-P3 triyaj + haftalık özet (`feat(e11): in-app beta feedback...` commit'leri), ESR örnekleri ve G0 kalibrasyonu (`src/lib/beta/esr-samples.ts`, `tests/esr-calibration.test.ts`, `feat(m5): calibrate the G0 gate against real evaluation outcomes`). **10 tasarım ortağının gerçekten kayıtlı/aktif olduğu ve 8 haftalık betanın fiilen yürütüldüğü bu depodan doğrulanamaz** (bu, üründen değil operasyondan kanıt ister) — bu satır bilinçli olarak işaretlenmedi.

## Faz B — v1.1 (S9–S12): M6 Evaluator Lens, M9 Meeting Briefs, takvim entegrasyonu, iyzico, SSO.

Durum (S9–S10 dalgası, ölçüldü 2026-09-07 — kartların çoğu **`review`** durumunda; S8–S10 kapanış doğrulaması board TASK-MTQTZNLS2CO2L'de hâlâ sürüyor, aşağıdaki maddeler koda dayanır, kart statüsüne değil):

- [ ] **M6 Evaluator Lens** (veri modeli + puanlama + UI) — `src/modules/m6/`.
  - Veri modeli, puanlama motoru (`server/scoring.ts`, panel/ESR karşılaştırma, uzlaşı hesabı) ve iki UI yüzeyi (`ui/EvaluatorForm.tsx`, `ui/EvaluationDashboard.tsx`) mevcut ve gerçek kiracı verisine bağlı (`listPanelScores`, session tenant — bkz. `docs/agent-results/TASK-MTQ5ZF5ZRU5SM-geli-tirici.md`).
  - "İç ön değerlendirme" etiketi (CLAUDE.md "Yapma" §, `messages/*.json:internalPreAssessment`) **her iki UI yüzeyinde de mevcut** (`EvaluatorForm.tsx:94`, `EvaluationDashboard.tsx:42`, `data-testid="m6-internal-badge"`) — bu, board'daki açık **TASK-MTQTYE287FERM** ("etiket yok") ve `docs/agent-results/TASK-MTQ63RR8Z0G8E-ui-audit-customer-support.md` bulgu #1'in **doğrulanamadığı** anlamına gelir; kod tarihi (`02f7fd2`) bu bulgudan önceye dayanıyor. M6'nın PDF/dışa aktarım yüzeyi yok, dolayısıyla kontrol edilecek başka ekran da yok. Kart kapatılmadan önce bu çelişki not düşülsün.
  - Kabul edilmemiş: `M6.3 Scoring Logic` (board TASK-MTPZHMSPMDA66, todo).
- [ ] **M9 Meeting Briefs** — `src/modules/m9/`, `opportunities/[id]/briefs/`.
  - Brief oluşturma/listeleme/detay + saat dilimi (UTC saklama, Brüksel gösterimi, CLAUDE.md kural 10) + `.ics` indirme çalışır durumda (`docs/agent-results/TASK-MTPZL5YDY9TAW-blok-zincir-dse.md`, commit `318cec4`).
  - i18n kataloğu var (`src/locales/{tr,en}/briefs.json`, 40+ anahtar) ama UI'da henüz **bağlanmadı** — `client.tsx` hâlâ Türkçe metni doğrudan kod içine yazıyor (kendi raporunun "Sonraki Adımlar"ı, S11'e bırakılmış). CLAUDE.md §8 "kullanıcıya görünen sabit metin yok" kuralı bu ekranda şu an karşılanmıyor.
  - Takvim senkronizasyonu (Google/Outlook) **altyapı düzeyinde** kuruldu (`src/lib/calendar/`, `CalendarProvider` sözleşmesi + ICS/Google/Outlook sağlayıcıları, `docs/agent-results/TASK-MTPZLC9PI5VEH-blok-zincir-dse.md`, commit `6866353`) ama **production'a hazır değil**: Google/Outlook sağlayıcıları OAuth anahtarı olmadığı için mock (yalnız log), `CalendarConnection` token'ları şifresiz saklanıyor (`CALENDAR_ENCRYPTION_KEY` yok, OWASP-A02 açığı), CLAUDE.md'nin işaret ettiği `src/core/events` olay veri yolu henüz yok (senkron doğrudan fonksiyon çağrısıyla yapılıyor). ICS indirme yolu (üçünün yedeği) tam çalışır.
  - **S10 dogfood tamamlandı (2026-09-07, board `TASK-MTQU053U24RYH`, `docs/agent-results/TASK-MTQU053U24RYH-customer-support.md`, 24 senaryo + DB doğrulama + gerçek `.ics` denetimi) — sonuç: özellik uçtan uca kullanılamıyor. 14 bulgu (2×P0, 4×P1, 5×P2, 3×P3) + 6 doğrulanmış "çalışıyor" maddesi.**
    - **P0-1** — brief hiçbir zaman kaydedilmiyor: sunucu `{success:false, error:"BRIEF_NOT_PERSISTED"}` dönüyor (ayaktaki dev sürecinin Prisma istemcisi `prisma db push` sonrası yenilenmemiş — operasyonel, `pnpm prisma generate` + yeniden başlatma ile düzelir) **ve** `client.tsx` bu `success:false`'ı hiç okumuyor — kalıcı ürün kusuru, kredi/AI-log yazılıp yazılmadığını kullanıcı asla öğrenemiyor. DB doğrulandı: `MeetingBrief`/`CreditLedger`/`AiUsageLog` üçü de 0 satır, 4 denemeden sonra.
    - **P0-2** — var olmayan ya da başka kiracının fırsat id'sinde sabit kodlu "Fraunhofer Institute / PIC 999984059 / 142 katılım" verisi **hiçbir "örnek veri" etiketi olmadan** gerçekmiş gibi gösteriliyor (`page.tsx` fallback dalı). CLAUDE.md §7 ihlali; kiracı izolasyonu bu yönüyle sağlam (gerçek veri sızmıyor), ama uydurma veri her iki durumda da çıkıyor.
    - Board: `TASK-MTQURC2H4E0WF`, `TASK-MTQUS5JH4DXJM` (todo, P0), `TASK-MTQUTBH8Q9VMK` (todo, P1: `.ics` RFC 5545 uyumsuzluğu + takvim bağlama yüzeyi yok + i18n hâlâ bağlı değil + 3×P3); aktif düzeltme `TASK-MTQUX5IZ9I5VP` (in_progress, @blok-zincir-dse, P0'lar için).
    - Ayrıca (kart açılmadı, düşük öncelik): toplantı-sonrası notlar sessizce siliniyor (P1-3, geri döndürülemez veri kaybı — bkz. Açık karar #15), `MeetingBrief.opportunityId` şema alanı yok (P2-7, bkz. Açık karar #14), aksiyon maddesi tekrar/uzunluk denetimi yok (P2-10).
    - Çalışan taraf (regresyon korumalı, tekrar test edilirken bozulmamalı): DST sınırı doğru geçiliyor, XSS kaçışlanıyor, kiracı izolasyonu tutuyor, sunucu eylemleri kimliği oturumdan okuyor (istemciden değil), 390px mobilde taşma yok, ham hata/stack trace hiçbir noktada sızmıyor.
    - **`TASK-MTPZL5YDY9TAW` ve `TASK-MTPZLC9PI5VEH`'in `review`→`done` geçişi bu bulgular kapanmadan yapılmamalı** (PM kararı, `docs/agent-results/TASK-MTQTZNLS2CO2L-blockzincir-pm.md`); ikisi de hâlâ `in_progress`.
- [x] **iyzico ödeme + entitlement akışı** — `docs/agent-results/TASK-MTPZL9GK4TFS1-geli-tirici.md`, commit `5bd921a`. Webhook imza doğrulaması (`x-iyz-signature-v3`, HMAC-SHA256), sonucun yalnız sağlayıcı `.../detail` çağrısından okunması, `pg_advisory_xact_lock` ile aynı olayın iki kez işlenmesinin engellenmesi, tutarların `Int` kuruş + `currency` (`src/lib/money.ts`) olması doğrulandı. Ortamda iyzico sandbox anahtarı olmadığı için gerçek sağlayıcıya değil yerel mock sunucuya karşı test edildi (Fabrika tarafı kod gerçek çalıştı).
  **Yan bulgu (Stripe tarafında, bu kartın kapsamı dışı, ayrı teknik borç):** Stripe webhook idempotency sorgusu (`auditEvent.findFirst({ where: { data: { equals: {...} } } })`) Prisma JSON `equals` semantiği yüzünden **hiçbir zaman eşleşmiyor** — Stripe'ın çift-işlem koruması fiilen kapalı. Ayrı bir düzeltme görevi açılmalı.
- [ ] SSO (kurumsal SAML) — bu dalgada dokunulmadı, PROJECT.md §7'de faz 2 olarak zaten işaretli.

**CI/kalite kapısı riski (bu fazı etkiler):** Lint kapısı kırmızı — 777 sorun / 561 hata (ölçüldü 2026-09-06, board TASK-MTQ60SGW45T0X, todo). CI kapısı henüz bunu kırmıyor; sıfırlanana kadar yeni PR'larda regresyon sessizce birikebilir.

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
9. **G0 kanonik fonksiyonu üretime ne zaman/nerede bağlanacak?** — Ağırlıklar ve eşik kararlaştırıldı (madde 8), ama `scoreG0()`/`decideG0()` bugün hâlâ hiçbir üretim çağrı noktasında kullanılmıyor (ölçüldü 2026-09-07, PROJECT.md:81 dipnotu). Karar bekliyor: çağrı fırsat oluşturma anında mı, günlük bir job'da mı, yoksa her `gates/evaluate.ts` çağrısında canlı mı hesaplanacak? Kanıt: `docs/agent-results/TASK-MTQ63RR8Z0G8E-blok-zincir-dse.md`.
10. **Evaluator Lens "iç ön değerlendirme" etiketi bulgusu çelişkili — kim doğrulayacak?** — Board'da açık **TASK-MTQTYE287FERM** ve `docs/agent-results/TASK-MTQ63RR8Z0G8E-ui-audit-customer-support.md` bulgu #1, etiketin `EvaluationDashboard.tsx`'te olmadığını iddia ediyor; kod incelemesi (2026-09-07) etiketi **hem `EvaluatorForm.tsx:94` hem `EvaluationDashboard.tsx:42`'de** buluyor (`internalPreAssessment` anahtarı, tr+en). Kart kapatılmadan önce bu çelişki bir kişi tarafından ekran görüntüsüyle çözülmeli — stale bulgu mu, yoksa görülmeyen bir yüzey mi var?
11. **Dashboard "Başarı Oranı" case-mismatch — KAPANDI (TASK-MTQTYXC0NUT0B, 2026-09-07).** Düzeltildi (yukarıda E10). Tarama yapıldı: uygulamanın literal ile karşılaştırdığı 9 serbest-string sütunun (`Opportunity.stage/status/intendedRole`, `Proposal.outcome`, `ModuleState.status`, `Evaluation.status/readerType`, `GateDecision.gate`, `Reviewer.status`) canlı değerleri koddaki literallerle tek tek karşılaştırıldı; **kasa uyuşmazlığı yalnızca `Proposal.outcome`'da** çıktı, diğer sekizi yazan ve okuyan tarafta aynı kasada. Yeni soru: aynı sınıftan hatayı sessiz bırakmamak için bu sütunlar Prisma `enum`'una mı taşınmalı, yoksa `proposal-outcome.ts` gibi sözlük modülleri mi yeterli?
12. **M9 takvim entegrasyonunun (Google/Outlook) production ön koşulları kimin sorumluluğunda?** — OAuth anahtarları (`GOOGLE_OAUTH_*`, `MICROSOFT_OAUTH_*`) yok, `src/core/events` olay veri yolu (CLAUDE.md kural 2) henüz kurulmadı. Şu an yalnız ICS indirme yolu üretime hazır.
    - **Şifreleme uygulandı (TASK-MTPZLC9PI5VEH-2, 2026-09-08).** `CalendarConnection.accessToken`/`refreshToken` sütunları için `CALENDAR_ENCRYPTION_KEY` env değişkeni (src/lib/env.ts) ile AES-256-GCM algoritması üzerinden şifreleme ve çözme uygulandı (`src/lib/calendar/encryption.ts`, `src/lib/calendar/sync.ts`). Yazma yolunda `saveCalendarConnectionTokens`, okuma yolunda `syncMeetingBriefToCalendar` ve `getDecryptedCalendarTokens` üzerinden çalışır. `fkenc1:<iv_hex>:<tag_hex>:<cipher_hex>` zarf formatı üretilir ve `src/lib/db.ts`'teki Prisma `$extends` sorgu gate'i (`withCalendarTokenGate`) ile düz metin yazılması kesin olarak engellenir. Anahtar eksikliğinde 503 (`CalendarEncryptionNotConfiguredError`) fırlatılır. Canlı DB testi (`tests/calendar-token-db.live.test.ts`) ile Postgres'e yazılan token'ın cleartext olmadığı ve başarıyla çözüldüğü kanıtlandı.
    - **§8.3 tarama (aynı sınıftan başka açık-metin sır sütunu) — bulundu, düzeltilmedi (kapsam dışı bırakıldı).** `Account.access_token`/`refresh_token`/`id_token` (NextAuth `@auth/prisma-adapter`, Google + Microsoft Entra ID login sağlayıcıları için **canlı ve aktif olarak yazılıyor** — `CalendarConnection`'ın aksine 0 satır değil), `ApplicationPart.magicToken` (ortak portalı erişim bearer token'ı, `crypto.randomBytes(32)` ile üretilip düz metin yazılıyor — `ApiKey.keyHash`'in tersine hash'lenmiyor), `Invitation.token`, `Session.sessionToken`, `VerificationToken.token`. Detay ve önceliklendirme: `docs/agent-results/TASK-MTSJIXP9V3JD7-blockzincir-pm.md` §"Şema taraması".
    Kanıt (ön ölçüm): `docs/agent-results/TASK-MTPZLC9PI5VEH-blok-zincir-dse.md` Riskler §.
13. **M9 briefs sayfasındaki uydurma fallback verisi (P0-2) neden var, ne olacak?** — Var olmayan ya da başka kiracının fırsat id'sinde `page.tsx` sabit kodlu "Fraunhofer Institute / PIC 999984059" verisini gerçekmiş gibi gösteriyor, hiçbir "örnek veri" etiketi yok. Demo/onboarding amaçlıysa açık bir rozet + yalnızca `demo-tenant` koşuluyla sınırlanmalı; değilse kaldırılıp 404/boş durum konmalı. Ürün kararı — kanıt: `docs/agent-results/TASK-MTQU053U24RYH-customer-support.md` §2 P0-2, board `TASK-MTQUS5JH4DXJM`.
14. **`MeetingBrief` fırsata (`Opportunity`) bağlanacak mı?** — Şemada `opportunityId` alanı yok; `/opportunities/[id]/briefs` rotası fırsata göre filtrelemiyor, kiracının tüm brief'lerini her fırsat sayfasında listeliyor (kod/şema seviyesinde kesin, P0-1 nedeniyle ampirik doğrulanamadı — tablo şu an 0 satır). Rota bu haliyle kaldığı sürece alan eklenmesi gerekiyor. Kanıt: `docs/agent-results/TASK-MTQU053U24RYH-customer-support.md` §2 P2-7, `prisma/schema.prisma:998`.
15. **Toplantı-sonrası notların sessizce kaybolması (P1-3) ne zaman düzeltilecek?** — `savePostMeetingNotes` başarısız (`{success:false}`) dönüyor ama `client.tsx` dönüş değerine bakmadan formu temizliyor; kullanıcı kararlar + notlar + aksiyon maddelerini kaybediyor, hiçbir hata görmüyor. Şu an `TASK-MTQURC2H4E0WF`'e (P0 kartı) iliştirilmiş değil — ayrı mı ele alınacak yoksa aynı kart mı genişletilecek, netleşmedi. Kanıt: `docs/agent-results/TASK-MTQU053U24RYH-customer-support.md` §2 P1-3.
16. **Admin konsolunda "RLS Protected" / "RLS Policy %100 Enforced" / "RLS Güvenlik: 30/30 Tablo" rozetleri kaldırıldı (TASK-MTUGKEF9KENK, 2026-09-09) — üretim bağlantısında bu iddia doğru değildi.** `src/lib/db.ts:6` ile açılan ana `DATABASE_URL`, `fabrika` rolüyle bağlanıyor; bu rol `SUPERUSER` + `BYPASSRLS` (`prisma/rls-app-role.sql:1-9`, `docs/SECURITY_COMPLIANCE.md:51-52,83-84`), yani RLS politikaları üretim/dev bağlantısında hiç değerlendirilmiyor. Politikaların gerçekten uygulandığı tek yer, ayrı `fabrika_app` (NOBYPASSRLS) rolüyle çalışan `DATABASE_URL_RLS_TEST` + `tests/rls.spec.ts`. CLAUDE.md kural 7 gereği kod içine gömülü, Evidence/TopicStat'e bağlı olmayan bu üç rakam/iddia `src/app/[locale]/admin/layout.tsx`'ten kaldırıldı; yerine sahte bir "ölçülmüş" rakam konmadı. **Açık karar:** ana `DATABASE_URL`'i `fabrika_app`'e çevirmek (RLS'i üretimde gerçekten zorlamak) ayrı ve `withTenant()` kapsamının tüm sorgulara yayılmasını gerektiren çok daha büyük bir iş — bu kartın kapsamı dışında bırakıldı. Kanıt: `docs/agent-results/TASK-MTUGKEF9KENK-customer-support.md`.
17. **Plan silme muhafızı (`countLiveSubscriptions`, `plan-repository.ts:752`) `planId` mi `planVersionId` mi saymalı? — ÖLÇÜLDÜ: `planId` doğru, KOD DEĞİŞTİRİLMEDİ (TASK-MTUI9R0FOOY2J, 2026-09-09).** `Subscription` yazan her yol tarandı (`subscription-sync.ts`, `iyzico.ts`, `publishVersion`'ın abonelik taşıma adımı, `getEntitlements`, `computePublishImpact`, seed'ler): `planId` her create/update'te koşulsuz yazılıyor ve "bu abonelik hangi plana ait" sorusunun tek güvenilir kaynağı; `planVersionId` ayrı bir kavram (hangi *sürümün şartlarından* yararlanıyor), `NULL` olabiliyor ve yalnız plan değişince + hedefte yayınlanmış sürüm varsa güncelleniyor — hedefte yayınlanmış sürüm yoksa **bilerek** eski değerinde bırakılıyor (`subscription-sync.ts:307-311`, aynı kural `iyzico.ts:627-633`). Muhafızı `planVersionId → planVersion.planId` üzerinden saymaya çevirmek TERSİNE dönerdi: nullable ve gecikmeli bir alana bağımlı kılardı. `docs/agent-results/TASK-MTU4AYW5R9DGL-blok-zincir-dev-5.md`'nin bulduğu çelişkili satır (`planId=ultra`, `planVersionId→pro`) bu yüzden bir guard kusuru değildi — kaynağı `tests/e2e/plan-entitlement.spec.ts`'in eski `setPlan()`'ı: paylaşılan `demo-tenant` üzerinde yalnız `planId` yazıyordu, `afterAll` kesintiye uğrarsa kiracı kalıcı olarak yanlış planda kalıyordu (tek yönlü cırcır). O kök neden ayrı bir kartta (**TASK-MTUI9ZBK7W4JY**, blok-zincir-dev, eşzamanlı) zaten düzeltiliyor: spec kendi `PLAN_E2E.lens` kiracısına taşınıyor ve yeni `setPlan()` `planVersionId`'yi de birlikte temizliyor. Kilit: `src/lib/billing/plan-admin.test.ts`'e gerçek bozuk-veri şeklini üreten iki adversarial test eklendi (canlı abonelik varken silinemez + boş plan, başka bir aboneliğin bayat `planVersionId`'si ona işaret etse de silinebilir) — 25/25 yeşil, `pnpm test` tam koşum 1655/1655 yeşil. Kanıt: `docs/agent-results/TASK-MTUI9R0FOOY2J-blok-zincir-denet-i.md`.

### E10 kapanışına bırakılan uyum boşlukları (patron kararı, 2026-09-08)

`docs/legal/processing-register.md` §22, envanteri çıkarırken bulunan **8 açık boşluğu**
listeliyor (VKN/TCKN saklama süresi tanımsız · `Document`/`Chunk` silme akışı yok ·
`AuditEvent.actorId` kimliksizleştirilmiyor · `CalendarConnection` token'ları açık metin, vb.).

**Karar: bunlar için ayrı kart AÇILMAYACAK; E10 kapanışında topluca ele alınacak.**
Kayıt burada tutuluyor ki kapanışta unutulmasın — tek kaynak §22'dir, liste burada
kopyalanmaz (kopyalanan liste bayatlar).

Ayrıca §21: Anthropic, OpenAI, Google, Microsoft, Stripe, Resend, Cloudflare için repoda
**imzalı SCC/ek sözleşme bulunamadı** — bu da kapanış kapsamında.

## Riskler (teknik)
- F&T API'si resmî değil → adaptör + yedek kaynak + alarm (E4).
- CORDIS dosya adları/sütunları değişebilir → worker'da sütun eşleme tablosu + test fixture'ları.
- LLM maliyeti → kredi modeli, önbellek, küçük model yönlendirme.
- RLS unutulan tablo → CI'da `scripts/check-rls.ts` (tüm kiracı tablolarında politika var mı).
- **`src/locales/<dil>/<modül>.json` deseni ölü kod tuzağı.** `next-intl` yalnızca `messages/{locale}.json`'ı okuyor (`src/i18n/request.ts`); bu deseni kullanan bir modül (M9 briefs örneği) "40+ anahtar, i18n tamam" diye raporlanabilir ama UI hiçbir yerden import etmez, `pnpm i18n:check` de `messages/` dışını taramadığı için yakalamaz. Kanıt: `docs/agent-results/TASK-MTQTZNLS2CO2L-blockzincir-pm.md` Riskler §1, `docs/agent-results/TASK-MTQU053U24RYH-customer-support.md` P1-4.
- **`prisma db push` sonradan migration dosyası yazmayla çakışıyor.** Şemayı `db push` ile uygulayıp sonra migration dosyası eklemek `prisma migrate deploy`'u P3005 ("schema not empty") ile kilitliyor; ayrıca ayaktaki dev sürecinin Prisma istemcisi yenilenmediği için yeni alanlar "yok" gibi davranıyor (M9'da `BRIEF_NOT_PERSISTED`'a yol açan kök neden). S9/S10'da iki kez tekrarladı. Kural: `db push` kullandıysan migration dosyası da ekleme, ya da ekleyip `migrate resolve --applied` ile baseline'la — ve şemayı değiştiren her ajan `pnpm prisma generate` + dev sunucusunu yeniden başlatmayı görev bitiminde yapmalı.
