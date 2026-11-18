# ARCHITECTURE.md — Fabrika sistem mimarisi

## 1. Genel görünüm

```
┌──────────────┐   ┌────────────────────────────────────────────┐   ┌─────────────────┐
│  Tarayıcı    │──▶│ Next.js 15 (Vercel)                         │──▶│ Postgres 16      │
│  tr / en     │   │  (public) (app)/[ws] admin                  │   │ + pgvector + RLS │
└──────────────┘   │  Server Actions · Route Handlers (/api)     │   └─────────────────┘
                   │  src/core/k1..k6 · src/modules/m1..m11      │          ▲
                   └───────┬───────────────┬─────────────────────┘          │
                           │               │                                │
                    graphile-worker (jobs)  Python worker (Fly.io)        R2 (dosyalar, ham veri)
                    K1 günlük, uyarı,  CORDIS CSV→Parquet→DB,        SMTP (e-posta, kendi)
                    Stripe webhook     graf metrikleri, DuckDB       Stripe / iyzico
                                                                      Anthropic / OpenAI
```

## 2. Uygulama katmanları

- **Rota grupları:** `[locale]/(public)` herkese açık sayfaların hepsi (ana sayfa, yasal metinler, fiyatlandırma, çağrılar, blog, giriş/kayıt, davet, partner portalı); ortak `PublicNavbar` + `PublicFooter` yalnız bu grubun `layout.tsx`'inde, sayfalar kendileri eklemez (FO-68). 404 (`src/app/not-found.tsx`) aynı çifti kendisi çizer. `(app)/[workspaceSlug]/...` kiracı uygulaması; `admin` platform yönetimi (`platform_admin`) — ikisinin kendi kabuğu var.
- **Sunucu tarafı:** Server Components veri okur; yazma Server Actions (zod ile doğrulanmış) ya da `/api/v1/*` Route Handlers (harici API lisansı için de aynı katman).
- **Alan katmanı:** `src/core/*` (K1–K6) ve `src/modules/*` (kayıtlı modüller: `src/lib/modules/registry.ts`) saf TypeScript; Prisma istemcisi `withTenant()` ile sarılı.
- **Olay veri yolu:** `src/core/events` — tipli olaylar (`opportunity.created`, `gate.passed`, `module.state.changed`, `ai.used`, `esr.uploaded`). Modüller birbirini import etmez; olay dinler. Zamanlanmış ve elle kuyruğa eklenen işler ayrıdır: graphile-worker (`src/lib/jobs`, ADR-0008) ayrı bir süreçte koşar; olay veri yolu işlere bağlı değildir.

## 3. Modül sistemi

```ts
// src/modules/m8-consortium-matching/manifest.ts
export const manifest: ModuleManifest = {
  id: "M8", key: "consortium-matching", version: "0.1.0",
  requires: ["M1"], recommends: ["M4"],
  planTiers: ["team", "business", "enterprise"], addOnSku: "addon_m8_pro",
  nav: [{ labelKey: "nav.matching", href: "/matching", icon: "users" }],
  routes: ["/matching", "/matching/[opportunityId]"],
  permissions: ["matching.view", "matching.edit"],
  tables: ["RoleMatrix", "SeatCandidate"],
  settingsSchema: z.object({ maxCandidatesPerSeat: z.number().default(5) }),
};
```

- **Kayıt defteri:** `src/core/modules/registry.ts` tüm manifestleri toplar; derleme zamanında bağımlılık grafını doğrular (döngü yok, bilinmeyen id yok).
- **Durum makinesi:** `src/core/modules/state-machine.ts`
  - `canEnable(tenant, moduleId) → { ok, missing: ModuleId[], planBlocked: boolean }`
  - `enable(tenant, moduleId, target: 'pilot'|'on', actor)`
  - `disable(tenant, moduleId, actor) → cascadedOff: ModuleId[]` (bağımlıları özyinelemeli kapatır)
  - Her geçiş `AuditEvent` yazar (`module.state.changed`).
- **Koruma:** `requireModule('M8')` (server) ve `useModuleEnabled('M8')` (client). `pilot` durumunda yalnızca `pipeline_manager+` geçer.
- **Giriş noktaları (FO-164):** kenar menüsü manifest `nav[]`'dan, fırsat detayı sekmeleri manifest `opportunityTabs[]`'dan türetilir (`getSidebarEntries` / `getOpportunityTabs`, `src/lib/modules/registry.ts`); elle liste yok. Görünürlük uygulama kabuğunda `listModuleNav()` (`src/lib/modules/access.ts`) ile, kapıyla aynı `decideModuleAccess` kararından okunur: açık modül → bağlantı (PILOT/DEV ise rozetli), yalnız plan dışı → kilitli bağlantı (modül sayfasındaki kapı hangi planlarda olduğunu söyler), kapalı/yakında → gizli. `validateRegistry()` her girişin kendi modülünün rotasını açtığını, `tests/modules/route-catalog.test.ts` "Yakında" olmayan her modülün en az bir girişi olduğunu denetler.
- **Yeni modül ekleme:** `/new-module` komutu iskeleti üretir: manifest, `server/`, `ui/`, i18n anahtarları, test dosyası, `docs/MODULES.md` bölümü.

## 4. K1 — Çağrı toplama

- **Kaynaklar:** (a) F&T Portal arama API'si `POST https://api.tech.ec.europa.eu/search-api/prod/rest/search?apiKey=SEDIA&text=***&pageSize=100&pageNumber=N` — multipart `query` (Elasticsearch bool: `frameworkProgramme` 43108390 HE, 43152860 DEP; `status` 31094501 forthcoming / 31094502 open) → `identifier, callIdentifier, title, deadlineDate, allDeadlines, status, budget, typesOfAction, url`; (b) topic detay `https://ec.europa.eu/info/funding-tenders/opportunities/data/topicDetails/<id-lowercase>.json`; (c) Eurostars/Eureka çağrı sayfaları (HTML); (d) TÜBİTAK duyuru sayfaları (HTML); (e) yedek: Apify aktörü / EUcalls dışa aktarımı (CSV içe aktarma).
- **Uygulanan yer (2026-09-06):** `src/lib/adapters/{sedia,eurostars,tubitak}.ts`; zod sözleşmeleri `src/lib/adapters/schemas/` altında. Her adaptörün birincil girişi `fetch<Source>Topics()` ve `AdapterResult` döner: `{ status: 'ok'|'error', topics, topicsProcessed, reason?, schemaDrift[] }`. **Adaptörler asla `throw` etmez** — ölü bir kaynak `status:'error'` olarak raporlanır, günlük iş diğer kaynaklarla devam eder.
- **Şema kayması tespiti:** ham yanıt gevşek bir zod zarfına (`SediaSearchEnvelopeSchema` / `SediaRawResultSchema`) karşı doğrulanır; yalnızca **vazgeçilmez alanlar** aranır, EC yeni alan eklerse alarm üretmez. Zarf kırılırsa `SystemAlert(level=warn, source=<kaynak>_adapter)` + ham kayıt (`RawFetch`). HTML kaynaklarda kayma = "200 döndü ama hiçbir çağrı kalıbı eşleşmedi".
- **Kaynak URL'leri (2026-09-06 doğrulandı):** SEDIA arama API'si 200 (1214 konu). Eurostars katılımcı portalı (`eurostars-eureka.eu`) tarayıcı-dışı istemciye **403** döndüğü için `eurekanetwork.org/programmes/eurostars/` kullanılır (`K1_EUROSTARS_URL` ile geçersiz kılınabilir). TÜBİTAK `/en/funding/...` yolu **404**; `tubitak.gov.tr/tr/destekler` destek kataloğu kullanılır (`K1_TUBITAK_URL`).
- **Normalizasyon:** `Programme` → `Call` → `Topic`; `Topic.eligibility` (`{ restricted, eligibleCountries[], countriesExcluded[], notes }` — "EU/EEA/CH only" metin tespiti `eligibleCountries=['EU','EEA','CH']` üretir); lump-sum ve iki-aşamalı bayrakları (`deadlineModel` + metin taraması); `Topic.deadlines[]` (17:00 `Europe/Brussels`); `Call.openDate` ← `plannedOpeningDate`. **`ageInDays` = bugün − açılış tarihi** adaptör çıktısında hesaplanır ama **saklanmaz** — okuma anında `Call.openDate`'ten türetilir, böylece bayatlayamaz.
- **Performans:** konu başına `topicDetails/<id>.json` çağrısı **kaldırıldı** — açıklama (`descriptionByte`) ve uygunluk koşulları (`topicConditions`) zaten arama yanıtında geliyor. Günlük çekim 1214 konu / ~12 sn. `enrichFromTopicDetails` seçeneğiyle opsiyonel ve üst-sınırlı olarak geri açılabilir.
- **Elle tetikleme:** `pnpm jobs:k1` (yazar) · `pnpm jobs:k1 -- --dry-run` (hiçbir tabloya dokunmaz).
- **Uyum skoru (G0 girdisi):** `TenantProfile` (yetkinlik metni, NACE, TRL, önceki projeler, hedef roller) embedding'i ile `Topic` embedding'i kosinüs + kural tabanlı düzeltmeler (ülke uygunluğu, KOBİ rolü). Skor `TopicMatch` tablosunda; gece yeniden hesaplanır.
- **Kayıtlı arama ve uyarı:** `SavedSearch` (filtre JSON) → günlük diff → e-posta (tr/en şablon; kendi SMTP'mizden, nodemailer — Resend 29.09.2026'da kaldırıldı, `fe9fd31c`).

## 5. K2 — CORDIS ve M1

- Aylık graphile-worker cron'u (`k2-monthly-cordis`) → Python worker `/jobs/cordis?month=YYYY-MM`: HE ve H2020 CSV zip indir (`cordis-HORIZONprojects-csv.zip` ve `cordis-h2020projects-csv.zip`; ad değişirse `config`), DuckDB'de `project`, `organization`, `topics`, `euroSciVoc` yükle, temizle, Parquet'e yaz, Postgres'e upsert (`Project`, `Organization`, `Participation`).
- **Türev metrikler** (worker, networkx): kurum başına `coordinatorCount`, `participationCount`, `ecContributionSum`, konu öneki başına aynı sayılar (`OrgTopicStat`), iş birliği çiftleri (`Collab` — proje sayısı), derece ve eigenvector merkeziliği (`Organization.centrality`).
- **M1 ortak kartı** = `Organization` + `OrgTopicStat` + kiracıya özel `PartnerNote`/`Relationship` (M4). CORDIS verisi paylaşımlı (tenant-agnostik), notlar kiracıya özel.
- Sorgu hedefi: "konu öneki için ilk 20 koordinatör" < 2 s → `OrgTopicStat(topicPrefix, coordinatorCount)` indeksi.

## 6. K6 — YZ katmanı

- `llm.ts`: `complete({ tenantId, userId, module, purpose, messages, model?, maxTokens })` → sağlayıcı adaptörü (Anthropic varsayılan; OpenAI-uyumlu ikinci). Yanıt + kullanım → `AiUsageLog`; kredi düşümü `CreditLedger` (atomik).
- **RAG:** `Document`(çalışma programı PDF, topic JSON, CORDIS özet) → parça (`Chunk`, pgvector). `retrieve(tenantId, query, scope)`; kiracı belgeleri kiracıya özel, kamusal belgeler paylaşımlı.
- **Prompt'lar:** `src/core/k6-ai/prompts/*.md` (concept-note.md, evaluator-lens.md, meeting-brief.md, followup.md, fit-score.md). Her prompt sürümlü; `promptHash` günlüğe yazılır.
- **Şeffaflık beyanı:** `AiUsageLog` → teklif başına "YZ kullanım beyanı" (hangi bölümde, hangi araç, amaç) PDF/DOCX; Komisyon'un Part B beyan gereğini karşılar.
- **Güvenlik:** kullanıcı verisi eğitim için gönderilmez; sağlayıcıda veri saklama kapalı; kiracı isterse "yalnızca AB bölgesi model" seçeneği (faz 2).

## 7. Faturalama akışı (özet; `docs/BILLING.md`)

Stripe Checkout → webhook `checkout.session.completed` → `Subscription` + `PlanEntitlement` → modül varsayılan durumlarını uygula (`applyPlanDefaults`). Eklenti satın alma: Stripe fiyatı `addon_*` → `AddOn` satırı → ilgili modül `on` (bağımlılıklar tamamsa; değilse `pilot` + uyarı). Kredi: `CreditLedger` aylık yenileme + paket satın alma.

## 8. Güvenlik ve uyum (özet; `docs/SECURITY_COMPLIANCE.md`)

RLS her tabloda; oturum JWT'sinde `tenantId` + `workspaceIds`; `SET LOCAL app.tenant_id` her istekte. Denetim: `AuditEvent`. KVKK/GDPR: veri envanteri, silme/dışa aktarma uç noktaları, DPA şablonu. Sırlar: Vercel/Fly env; `.env.example` referans.

## 9. Ortamlar

`local` (docker-compose: postgres+pgvector, redis, mailpit) · `preview` (Vercel PR + Neon branch) · `staging` · `prod`. Migration'lar CI'da `prisma migrate deploy`.

## 10. Performans hedefleri

Liste sayfaları < 300 ms TTFB (RSC + indeks); K1 günlük iş < 15 dk; K2 aylık < 30 dk; concept note üretimi < 90 s; eşzamanlı 200 kiracı.
