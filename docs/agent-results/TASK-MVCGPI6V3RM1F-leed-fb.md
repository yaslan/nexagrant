---
sözleşme: 3
görev: TASK-MVCGPI6V3RM1F
kod: TASK-MVCGPI6V3RM1F
ajan: leed-fb
motor: claude
tip: karar
okur: kullanıcı
hüküm: Bitti: Keşif kanıtlı (anonim iç JSON uç noktası 200, topic başına ilan listesi) — Strateji A ile 4 fazlı, 9 kartlık uygulama planı hazır; onay bekliyor.
platform: Plan dokümanı; çalıştırılan kod yok. Keşif istekleri BE-FB tarafından macOS'ta curl ile yapıldı; uygulama sunucu tarafı, OS bağımsız.
sürüm: 1
tarih: 2026-10-17T14:08:02.999Z
---

# M1 Partner Search (SEDIA) — keşif analizi ve uygulama planı

## Kanıt
- Keşif raporu: `docs/agent-results/TASK-MVCGPI6V3RM1F-be-fb.md` + fixture'lar (`TASK-MVCGPI6V3RM1F-fixtures/`, maskeli; ecasId değeri yok — grep ile doğrulandı). Commit `e073c00e`.
- Canlı istekler: `POST /api/partnerSearch/topicOrganisations.json?ccm2Id=50127991` → 200 (118 kurum ilanı, 7 geri çekilmiş, 2 geri çekilmiş kişi); `topicDetails.json` → 200; `availablefullRightOrganisations.json` → 401 (kullanılmayacak); SEDIA arama → 200 ve `allowPartnerSearch` alanı mevcut.
- robots.txt `/info/funding-tenders/` ve `.../api/` yollarını yasaklamıyor; EC legal notice CC BY 4.0 (atıf zorunlu).

## Analiz — patron spesifikasyonuyla farklar ve verdiğim kararlar (değiştirebilirsin)
1. **Strateji: A.** B (HTML) bu portalda mümkün değil; "C"nin yedeği = son başarılı veriyi koru + alarm. `source` enum'u ileride HTML eklenebilsin diye korunur, şimdilik yalnız `PORTAL_API`.
2. **EU Login kullanılmaz.** `search.json` anonimde boş dönüyor ama topic bazlı uç nokta yeterli; oturum taklidi CLAUDE.md'ye aykırı.
3. **Kişi ilanları:** satır olarak HİÇ saklanmaz; topic başına anonim `personAnnouncementCount` tutulur. `ecasId` yazma yoluna allowlist ile asla girmez.
4. **Gerçek tablo adları:** spesifikasyondaki `organization` = `CordisOrganization` (PK `organisationId` = PIC). İstenen 3 alan (`hasActiveAnnouncements`, `lastAnnouncementAt`, `portalProfileFetchedAt`) buraya additive eklenir; CORDIS verisine dokunulmaz.
5. **Yeni tablolar global referans verisi** (`SYSTEM_WIDE`, tenantId yok); Discover sorgu sayacı tenant×ay tablosudur → tenantId + RLS.
6. **Zamanlama:** spesifikasyondaki gibi Open+Forthcoming topic'ler için gece tam tarama (~1000 topic, 1 sn aralık, eşzamanlılık 2 → ~10–17 dk) + K1 senkronu yeni topic ekleyince artımlı çekim. Ayrı kuyruk; `k1-daily-calls` değişmez, yalnız olay yayar.
7. **Durum kaynağı:** hangi topic'in açık olduğu Çağrılar senkronunun `Topic` tablosundan okunur (portal topicDetails çelişkisi raporda var; tek kaynak K1).
8. **Geri çekilme:** API'nin `topicOrganisationsWithdraw` listesi + "iki ardışık taramada yok" kuralı birlikte.
9. **Feature flag altyapısı repoda yok** → Kart 2'de minimal global bayrak (`partner_search_ingestion_enabled`, varsayılan kapalı).
10. **Portal'a özgü kullanım koşulu doğrulanamadı** → SE-FB hukuk/GDPR denetimi bayrak prod'da açılmadan önce zorunlu (bayrağı sen açacaksın).
11. Yeniden kullanım: `SediaAdapter`, `SediaCircuitBreaker`, `reportSchemaDrift`/`createAdapterAlert`, `RawFetch`, `src/lib/jobs/schedule.ts`, `plansGrantingModule`, `src/lib/rbac.ts` (`src/lib/authz` ve `PlanEntitlement` repoda yok).

## Plan — fazlar, kartlar, kişiler
| Faz / Sprint | Kart | Kim | Bağımlılık | Efor |
|---|---|---|---|---|
| PS1 Temel | K1 Veri modeli + migration + PIC eşleme fonksiyonu | BE-FB | — | 1,5 g |
| PS1 Temel | K6b Admin > Tenants iç plan ataması (internal etiketi + audit) | FE-FB | — (paralel; şema değişikliği gerekirse K1'e eklenir) | 1 g |
| PS2 Ingestion | K2 PartnerSearchIngestor + job + flag + alarm + IngestionRun | BE-FB | K1 | 3 g |
| PS3 Ürün | K3 API (3 uç nokta + Partner REST API + ULTRA export + Discover limiti) | BE-FB | K2 | 2 g |
| PS3 Ürün | K4 UI: Çağrı detayında Partner Sinyali, M1 sekme/rozet, filtreler, i18n | FE-FB | K3 sözleşmesi | 3 g |
| PS3 Ürün | K5 M8 live_demand_signal + gerekçe satırı | BE-FB | K3 | 1,5 g |
| PS4 Operasyon | K6 Admin "Partner Search Ingestion" sayfası + unmatched kuyruğu | FE-FB | K2 | 2 g |
| PS4 Operasyon | K7 Test + 5 kabul kriteri kanıtı (fixture e2e, DB'de kişi verisi yok sorgusu) | BE-FB + FE-FB | K1–K6 | 1,5 g |
| PS4 Operasyon | SE Güvenlik/GDPR/ToS denetimi | SE-FB | K2 | 0,5 g |

Her kart ayrı branch/PR; her PR CRW-FB incelemesinden geçer. Paralel başlangıç: K1 (BE-FB) + K6b (FE-FB). **Toplam ≈ 13–16 iş günü efor.**

## Riskler
- İç API belgesiz → şema koruması + alarm + son başarılı veri.
- Portal ToS belirsiz → SE-FB denetimi ve bayrak varsayılan kapalı.
- Yük/limit: 403/429'da job durur ve alarm üretir.
