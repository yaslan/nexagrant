# TASK-MVCH2R3VSLAJN — FO-61 PS-K3 Partner Search API, plan/limit ve ULTRA export (be-fb)

**Hüküm:** Kod tamam. Gerçek HTTP ile doğrulandı (izole DB + dev sunucu). Tam `pnpm gate` yeşil (exit 0). PR CRW-FB incelemesine hazır; merge edilmedi.
**Dal:** `be-fb/fo61-partner-search-api`. #163'ün dalı `be-fb/fo120-partner-search-fixes` (@1e551f7b) üzerine yığılı. PR base'i de o dal; #163 merge olunca rebase edilip base `dev` yapılacak.
**Sonuç dosyası yolu:** Wrapper `/Users/macbook/alan/docs/agent-results/...` diyor, lider ise repo içini istedi. Repo içine yazıldı: `FONBRIDGE/docs/agent-results/TASK-MVCH2R3VSLAJN-be-fb.md`. `results:index` script'i repoda yok, atlandı.

## Ne yapıldı

| # | Kart maddesi | Uygulama |
|---|---|---|
| 1 | `GET /api/partner-search/announcements?topic&country&type&orgType&q&page` + zod | `partnerSearchQuerySchema`: ülke 2 harfe büyütülür, type/orgType enum, `page` 1..10000. Bozuk sorgu → `400 invalid_query`. Sayfa 20 kayıt. |
| 1 | PRO/ULTRA sınırsız, Discover ayda 10, atomik sayaç | Limit katalogda `PlanGrant.limits.partner_search_queries_monthly` (limitKey). Kodda sabit rakam yok. Sayaç tek SQL: `INSERT … ON CONFLICT (tenantId, month) DO UPDATE SET count = count + 1 WHERE count < limit RETURNING count`. Satır dönmezse `429 PARTNER_SEARCH_QUOTA_EXCEEDED` + `Retry-After`. Sayaç sayfayı okuyan işlemle aynı `withTenant` içinde artar; okuma düşerse sayaç geri alınır. |
| 2 | `GET /api/organizations/:pic/announcements` | Aynı filtreler, aynı kota. PIC `^\d{6,12}$`. |
| 3 | `GET /api/topics/:identifier/partner-signal` | Saf fonksiyon `computePartnerSignal` → `{total, requests, offers, byCountry, byOrgType, trCount}`. Birim testli. Yalnız sayı döner, sayaçtan düşmez. |
| 4 | Partner REST API (ApiKey) | `/api/v1/partner-search/announcements`, `/api/v1/organizations/:pic/announcements`, `/api/v1/topics/:identifier/partner-signal`. `authenticateApiKey` (M1 kapısı) + oturum yoluyla aynı handler (`http.ts`). |
| 4 | ULTRA JSON/CSV export + kaynak + CC BY 4.0 | `GET /api/partner-search/announcements/export?format=csv\|json`. Yetki `PlanGrant.limits.partner_search_export` (yalnız Ultra). CSV'nin ilk iki satırı `# Source: EU Funding & Tenders Portal, fetched <tarih> (url)` ve `# License: CC BY 4.0 …`. JSON'da `source` nesnesi ve `notice` var. CSV hücreleri formül kaçışlı (`csvCell`). En fazla 10.000 satır. |
| 5 | `requireModule('M1')` + `can()`, geri çekilen ilan yok | M1 kararı modül kapısının kullandığı `decideModuleAccess` ile veriliyor (ModuleState + entitlement), ayrıca `can(role, 'view_partner_search')` (GUEST_PARTNER hariç). `announcementWhere` her sorguya `withdrawnAt: null` ekler. |
| — | Sözleşme tipleri | `src/core/contracts/partner-search.ts` (sorgu, DTO, sayfa, kota, sinyal, ret/429 gövdeleri, export JSON). |
| — | maskContact | Özetler ingest sırasında maskeleniyordu. API bunları **sunucuda `maskContact`'tan bir kez daha geçirir** (`toAnnouncementDto`). Eski ya da maskelenmemiş bir satır bile dışarıya `[email]`/`[phone]` olarak çıkar. |

Yeni tablo yok. `PartnerSearchQuotaUsage` FO-58'de tablo + RLS + DATA_MODEL ile eklenmişti; bu PR onu ilk kez yazıyor. DATA_MODEL'e "yazan" notu eklendi. BILLING §1.0 (limitKey tablosu) ve API.md (uç noktalar, hatalar) güncellendi.

### Kararlar (seçtim, değiştirebilirsin)
- **Discover'da M1 yok, ama kart "Discover ayda 10 sorgu" diyor.** Pozitif `partner_search_queries_monthly` M1'i olmayan bir planda yalnız iki ilan listesini açar (metered yol). Bu yol yalnız M1 reddi `PLAN_UPGRADE_REQUIRED` olduğunda devreye girer. Kiracının M1'i `OFF` ise ya da ret DEV/PILOT kaynaklıysa yine 403 döner.
- **Basic de 10 aldı** (katalogda Basic'te de M1 yok, Discover'dan az olmasın diye).
- **Partner-signal ve export sayaçtan düşmez.** Sinyal yalnız sayı döndürür. Export'u alan tek plan Ultra, o da sınırsız.
- **v1'de Discover anahtarı 403 alır.** Partner REST API mevcut haliyle M1'e bağlı (`authenticateApiKey`); Discover kotası yalnız oturumla kullanılır.
- **Export yalnız oturumla.** v1'de export uç noktası yok.

## Kanıt (ham çıktı)

Ortam: izole Docker `pgvector/pgvector:pg16`, `127.0.0.1:55461/fabrika_fo61` (paylaşılan 5433'e dokunulmadı). `pnpm db:setup` exit 0. Uygulama `fabrika_app` (NOBYPASSRLS) ile `next dev -p 3461`. Kiracılar: fo61-pro (Pro, M1 ON), fo61-pro-off (Pro, M1 OFF), fo61-discover (abonelik yok = free), fo61-ultra (Ultra, M1 ON). 4 ilan: biri geri çekilmiş, biri e-posta/telefon, biri `=HYPERLINK` içeriyor. Ham dosyalar: `docs/agent-results/TASK-MVCH2R3VSLAJN-evidence/`.

**Pro 200 / M1-off 403 / doğrulama / oturum** (`curl-session.txt`):
```
### 1) Pro (M1 ON) — list, default (withdrawn excluded)
{"success":true,"meta":{"page":1,"pageSize":20,"total":3},"data":[...]}   <HTTP 200>   (4 satırdan geri çekilen hariç 3)
### 4) Pro — partner signal
{"success":true,"topicIdentifier":"HORIZON-CL5-2026-D4-01","data":{"total":2,"requests":1,"offers":1,"byCountry":{"TR":1,"DE":1},"byOrgType":{"HES":1,"REC":0,"PRC":1,"PUB":0,"OTH":0},"trCount":1}}
<HTTP 200>
### 5) Pro M1 OFF — list / org / signal
{"error":"MODULE_ACCESS_DENIED","module":"M1","reason":"MODULE_OFF"}   <HTTP 403>  (×3)
### 6) Bad query
{"error":"invalid_query"}   <HTTP 400>
### 7) No session
{"error":"Unauthorized",...,"code":"TENANT_SCOPE_REQUIRED"}   <HTTP 401>
```

**Discover: 10 sorgu, 11.'si limit** (`curl-quota-export.txt`):
```
### 8) Discover — signal does not spend quota      <HTTP 200>
q1  {"limit": 10, "used": 1, "remaining": 9, "month": "2026-10", ...} <HTTP 200>
...
q10 {"limit": 10, "used": 10, "remaining": 0, ...} <HTTP 200>
q11 {"error": "PARTNER_SEARCH_QUOTA_EXCEEDED", "quota": {"limit": 10, "used": 10, ...}} <HTTP 429>
HTTP/1.1 429 Too Many Requests
retry-after: 577183
### 11) DB counter
fo61-discover|2026-10|10
### 12) Export: Discover / Pro
{"error":"MODULE_ACCESS_DENIED","module":"M1","reason":"EXPORT_NOT_IN_PLAN","requiredPlans":["Ultra"]}  <HTTP 403> (×2)
```

**ULTRA export** (`curl-export-ultra.txt`, `ultra-export.csv`, `ultra-export.json`):
```
HTTP/1.1 200 OK
content-disposition: attachment; filename="partner-search-2026-10-25.csv"
"# Source: EU Funding & Tenders Portal, fetched 2026-10-22T06:00:00.000Z (https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/how-to-participate/partner-search)"
# License: CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). © European Union. Contact details in summaries are masked.
id,topicIdentifier,...
fo61-a4,...,"'=HYPERLINK(""http://x"") municipality offering test site."
fo61-a1,...,Battery recycling SME. Contact [email] or [phone].
```
JSON: `"source":{"name":"EU Funding & Tenders Portal",...,"fetchedAt":"2026-10-22T06:00:00.000Z","license":"CC BY 4.0",...}`, `"count":3`.

**REST API (ApiKey)** (`curl-v1-apikey.txt`): Pro anahtarıyla list, org ve signal `200`. Discover anahtarı `403 {"error":"MODULE_ACCESS_DENIED","module":"M1"}`. Anahtar yoksa `401 AUTH_MISSING_API_KEY`.

**Atomik sayaç, canlı DB** (`tests/partner-search-quota.live.test.ts`, `fabrika_app` NOBYPASSRLS doğrulamalı): 25 eşzamanlı istekte tam 10 geçer, `used` 1..10, sayaç 10'da durur. Yeni UTC ayında yeni satır 1'den başlar. Başka kiracının kapsamı satırı göremez ve onun adına sayamaz (RLS reddeder).

**lint + typecheck + hedefli vitest** (izole DB'ye karşı):
```
pnpm typecheck → exit 0 ;  eslint (değişen dosyalar) → exit 0
vitest run tests/partner-search-*.test.ts tests/api-key-rate-limit.live.test.ts tests/api-module-gate.live.test.ts
           tests/billing-*.test.ts(x) tests/server-action-rbac*.test.ts tests/where-guard-src.test.ts
           tests/teardown-where-guard.test.ts tests/modules tests/api tests/billing
 Test Files  62 passed (62)
      Tests  931 passed (931)          atlanan: 0
```
Not: aynı batch'in ilk koşusunda `partner-search-ingest.live.test.ts › flag ON: closed-topic rows…` bir kez düştü (1/931). Sonraki koşular temiz: tek başına 3/3, canlı suite'lerle birlikte 3/3, tam batch 2/2. Bu dosya #163 dalından geliyor, bu PR'da değişmedi. Flaky (paralel koşuda global satırlar) olarak işaretliyorum.

**Tam `pnpm gate`** (`gate-lock` ile; devop-fb'nin ce702 gate'i bitene kadar kilitte bekledi, aynı anda koşmadı). Temiz konteyner `fo61-gate` `127.0.0.1:55462/fabrika_gate` (DB adı `fabrika` değil, SHARED korumalı canlı testler atlanmasın diye). Özet: `evidence/gate-summary.txt`.
```
pnpm db:generate && lint && typecheck && test && i18n:check && rls:check && rls:bypass-check && rls:verify --require-db && db:rls-role && test:e2e && alerts:check
 Test Files  404 passed | 3 skipped (407)
      Tests  5345 passed | 57 skipped (5402)
✅ i18n check passed
✅ SUCCESS: All 48 tenant-scoped models have RLS policies registered.
✅ SUCCESS: no new tenant bypass.
✅ 48 kiracıya özel tabloda politika yerinde ve izolasyon fabrika_app rolüyle GERÇEKTEN ölçüldü
  e2e: 395 passed, 11 skipped (8.3m)
✅ Öksüz alarm yok
GATE_EXIT=0
```
Atlananlar: vitest 57 test / 3 dosya, e2e 11. Bunlar ortam koşullu atlamalar (bu PR yeni bir atlama eklemedi). Log'daki `[alerts-sweep] failed …` satırları testlerin bilerek ürettiği hata yolu çıktılarıdır.

## Değişen dosyalar
- `src/core/contracts/partner-search.ts` (yeni)
- `src/modules/m1/server/partner-search/{api,http,session}.ts` (yeni)
- `src/app/api/partner-search/announcements/route.ts`, `…/announcements/export/route.ts`, `src/app/api/organizations/[pic]/announcements/route.ts`, `src/app/api/topics/[identifier]/partner-signal/route.ts` (yeni)
- `src/app/api/v1/{partner-search/announcements,organizations/[pic]/announcements,topics/[identifier]/partner-signal}/route.ts` (yeni)
- `src/lib/billing/catalog.ts` (`PlanGrant.limits`, `PLAN_LIMIT_KEYS`, `partnerSearchGrant`, `planNamesGrantingPartnerSearchExport`)
- `src/lib/billing.ts` (`Entitlements.planId`), `src/lib/rbac.ts` (`view_partner_search`), `src/lib/api-auth.ts` (`API_KEY_VIEWER` export)
- `tests/partner-search-api.test.ts` (29 birim), `tests/partner-search-quota.live.test.ts` (3 canlı)
- `docs/API.md`, `docs/BILLING.md` §1.0, `docs/DATA_MODEL.md`
- `docs/agent-results/TASK-MVCH2R3VSLAJN-evidence/*`

## Riskler
- **Metered yol M1 kapısının bir istisnası.** Yalnız `PLAN_UPGRADE_REQUIRED` + pozitif kota ile açılıyor; birim testteki erişim matrisi bunu kilitliyor. UI ileride Discover için M1 menüsünü göstermezse bu iki uç noktaya yalnız API'den ulaşılır.
- `getEntitlements` dönüşüne `planId` eklendi (additive). Mevcut tüketiciler etkilenmiyor (typecheck temiz).
- Kota sayacı, `withTenant` işlemi bitene kadar `(tenantId, month)` satırını kilitli tutar. Aynı kiracının eşzamanlı sorguları sıraya girer. Yalnız metered planlarda; sayfa okuması kısa.
- `partner-search-ingest.live` retention testi paralel koşuda bir kez flaky çıktı (bu PR'ın dışında).

## Açık sorular
1. Basic'in 10 hakkı doğru mu? (Discover'dan az olmasın diye 10 verildi.) Basic + M1 eklentisi alan kiracı Basic'in 10'unu korur, sınırsıza çıkmaz. Ürün kararı.
2. Discover'ın metered yolu M1 kapısını yalnız iki liste uç noktası için deliyor. Kabul mü, yoksa Discover için ayrı bir modül/feature mı istenir?
3. Ultra export v1 (ApiKey) üzerinden de gerekli mi? Şu an yalnız oturumla.
4. CSV'nin `# Source` satırı virgül içerdiği için `csvCell` onu tırnaklıyor; `# License` satırı tırnaksız. İkisi de geçerli CSV, ama görünüş farklı. Tek biçim istenirse küçük bir değişiklik.

## Sonraki adım
- CRW-FB incelemesi (PR base `be-fb/fo120-partner-search-fixes`).
- #163 merge edilince rebase + base → `dev`.
- UI kartı (Partner Search ekranı) bu sözleşme tiplerini kullanabilir.

## PLATFORM BEYANI
macOS (darwin, arm64) üzerinde izole Docker Postgres ile doğrulandı. Değişiklik yalnız sunucu tarafı (Next.js route handler + Prisma/SQL). OS'a özgü kod yok; Linux/Windows sunucusunda aynı davranır. UI yok.
