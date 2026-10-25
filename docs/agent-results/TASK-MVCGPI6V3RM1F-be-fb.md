---
sözleşme: 3
görev: TASK-MVCGPI6V3RM1F
kod: FO-57
ajan: be-fb
motor: claude
tip: araştırma
okur: ekip
hüküm: Fizibilite evet (koşullu) — Partner ilanları anonim, topic başına iç JSON uç noktasından (topicOrganisations.json) çekilebiliyor (canlı istek 200, 118 ilan); öneri Strateji A + şema alarmı, HTML yedeği (B) uygulanamaz, kişi ilanları saklanmaz.
platform: Sunucu tarafı, OS bağımsız; canlı denemeler macOS (darwin) üzerinde curl ile, Linux/Windows koşulmadı (kod yolu platforma bağlı değil).
sürüm: 1
tarih: 2026-10-17T00:00:00.000Z
---

# TASK-MVCGPI6V3RM1F (FO-57) — M1 Partner Search (SEDIA) · Kart 0 keşif ve fizibilite

**Ajan:** be-fb · **Tip:** spike · **Sprint:** SPRINT-FONBRIDGE-PS0 · **Kod yazılmadı, repo dosyası değiştirilmedi, `fonbridge-etl/` dokunulmadı.**
**Platform beyanı:** Sunucu tarafı, OS bağımsız. Canlı uç nokta denemeleri macOS (darwin) üzerinde `curl` ile yapıldı. Linux/Windows'ta koşulmadı; kod yolu platforma bağlı değil (HTTP istemcisi + Node fetch + Prisma).

## Hüküm

**Fizibilite: EVET, koşullu.** Partner ilanlarının **anonim** erişimle, topic başına JSON uç noktasından çekilebildiği canlı istekle kanıtlandı (`POST .../partnerSearch/topicOrganisations.json?ccm2Id=…` → 200, 118 ilan). Öneri **Strateji A** (iç JSON uç noktaları) + şema alarmı. Strateji B (HTML parse) bu portalda **uygulanabilir değil** (topic sayfası JS ile render ediliyor; ilan verisi topic JSON'unda yok). Kişisel veri (Person Profile) ilanları saklanmamalı.

---

## 1. Repo envanteri (her yol `ls`/`python os.path` ile doğrulandı)

| Konu | Dosya:satır | Not |
|---|---|---|
| SEDIA istemcisi | `src/lib/adapters/sedia.ts:112` (`class SediaAdapter`), `:44` `SEDIA_TIMEOUT_MS=10_000`, `searchSedia` (multipart `query` + `languages` parçaları), `fetchSediaTopics` (`:~430`) | Yeniden kullanılacak. Sayfalama `pageSize=100`, `maxPages=13`. |
| SEDIA şema | `src/lib/adapters/schemas/sedia.ts:35` (`SEDIA_STATUS_CODES`: FORTHCOMING=31094501, OPEN=31094502, CLOSED=31094503) | Ham şema bilerek gevşek; drift → alarm mantığı burada. |
| Devre kesici | `src/lib/adapters/sedia-circuit-breaker.ts:10` (`class SediaCircuitBreaker`) | Partner uç noktası için de kullanılabilir. |
| Alarm | `src/lib/adapters/alerts.ts:18` (`createAdapterAlert`), `:41` (`reportSchemaDrift`) | Şema değişikliği alarmı için hazır. |
| Çağrı senkron job'u | `src/lib/jobs/tasks/k1-daily-calls.ts:127` (`syncK1Topics`), `:114` SEDIA çağrısı | Kuyruk/cron: `src/lib/jobs/schedule.ts:53` → `k1-daily-calls` `cron: '0 2 * * *'`; ardından `k1-embeddings` (02:15), `k1-topic-match` (02:30, kendi kuyruğu). |
| Kuyruk/olaylar | `src/lib/jobs/events.ts` (olay tanımları), `src/lib/jobs/schedule.ts` (cron tablosu), `alerts-daily` (08:00) | Yeni job buraya eklenir. |
| Çağrılar sayfası (SEDIA Live) | `src/app/api/cagrilar/route.ts:94-95` (`new SediaAdapter().searchSedia`), `:113` (`sedia_unavailable`) | Mevcut UI bunu kullanıyor — yeniden kullanım noktası. |
| CORDIS ham veri | `src/lib/k2-cordis/raw-fetch.ts:47` (`recordRawFetch`), `src/lib/jobs/tasks/k2-monthly-cordis.ts:42` (`runK2MonthlyCordis`) | Değişmeyen payload için hash kontrolü `k1-daily-calls.ts:190-193`. |
| CORDIS normalize | `src/lib/k2-cordis/importer.ts` (719 satır), `rows.ts`, `cordisSchema.ts`, `csv.ts`, `api-query.ts` | |
| CORDIS partner profili | `src/lib/k2-cordis/partnerProfileJob.ts:231` (`generatePartnerProfiles`) | Türetilmiş profil (top topics/countries/partners). |
| CORDIS delta / sync | `src/lib/cordis-sync.ts`, `src/lib/cordis-delta.ts` | |
| M1 manifest | `src/modules/m1/manifest.ts` (`key: 'partner-intel'`, `tables`: CordisOrganization, CordisProject, CordisParticipation, CordisProjectTopic, CordisCoParticipation, CordisPartnerProfile, PartnerOrg) | |
| M1 UI | `src/app/[locale]/(app)/[workspace]/partners/page.tsx`, `partners/[pic]/page.tsx`, `partners/leaders/page.tsx` | |
| M1 API | `src/app/api/v1/partners/route.ts` (`GET`, SYSTEM_WIDE tablolar, `withTenant` kullanılmıyor), `src/app/api/v1/partners/[pic]/route.ts` | |
| M1 / CORDIS veri modeli | `prisma/schema.prisma`: `CordisOrganization` :758 (PK `organisationId` = PIC), `CordisParticipation` :785, `CordisProject` :727, `CordisPartnerProfile` :838, `PartnerOrg` :967 | Kartta geçen `Organization`/`Project`/`Participation` **adları yok**; gerçek adlar bunlar. |
| Topic modeli | `prisma/schema.prisma:531` (`Topic`, `identifier @unique`, `callId`, `deadlines Json`, `embedding vector(1536)`) | Tenant alanı yok. |
| RawFetch | `prisma/schema.prisma:582` | `source`, `key`, `hash`, `payload Json`. |
| SystemAlert | `prisma/schema.prisma:596` | Tenant-agnostik; RLS dışı. |
| M8 girdi/skor | `src/modules/m8/manifest.ts` (`requires: ['M1']`), `src/modules/m8/server/matching.ts`, `src/lib/scoring/consortium.ts:33` (`ScoringBreakdown`: topicExperience, networkCentrality, countryDiversity, smeBonus, warmthBonus, total), `:55` (`scoreCandidatesForSeat`), `:191` (`detectConflicts`) | Partner ilanları için yeni özellik (feature) adayı: `warmthBonus` veya ayrı `announcementSignal`. |
| Plan / limit | `prisma/schema.prisma:266` (`Plan`), `:285` (`PlanVersion`), `:308` (`PlanFeature`, `kind: module|limit|text`, `limitKey`), `:324` (`PlanAssignment`); `src/lib/billing/catalog.ts:594` (`plansGrantingModule`) | **`PlanEntitlement` adı repoda yok** — kartın ifadesi yerine bu kullanılmalı. |
| Yetki | `src/lib/rbac.ts:72` (`can(role, action)`) | Kartta `src/lib/authz` yazıyor; **o klasör yok**, doğrusu `src/lib/rbac.ts`. |
| Feature flag | **Yok.** `settings/gates` sayfası G0–G4 kapılarını yönetir, feature flag değil. | |
| Admin / alarm | `src/app/[locale]/admin/alerts/` (page, client, actions), `admin/tenants/`, `admin/cordis/` | |
| API anahtarı | `src/app/[locale]/(app)/[workspace]/settings/api-keys/page.tsx`, `prisma/schema.prisma:1545` (`ApiKey`) | |
| Export | `src/app/api/dashboard/export-csv/route.ts:10` (`GET`), `src/lib/k3-topic-stats/xlsx.ts`, `src/lib/storage.ts` | CSV ve XLSX yolları var. |
| Global (tenant'sız) tablo listesi | `scripts/rls-models.ts:24` (`SYSTEM_WIDE`) | `Topic`, `RawFetch`, `Cordis*`, `SystemAlert` burada. Yeni partner tabloları buraya eklenmeli. |

**Dokunulmadı:** `fonbridge-etl/` (kapsam kararı), `prisma/` (yazma yok), `src/` (yazma yok).

---

## 2. Partner Search uç nokta keşfi (gerçek istekler, anonim)

**Yöntem:** Portal ana JS paketi (`main-4ILR4IWP.js`, 3.9 MB) ve config tabloları incelendi; uç noktalar `apiBase = https://ec.europa.eu/info/funding-tenders/opportunities/api/` (portal `base href` = `.../portal/`, config `sedia.api.base = "../api"`) altında. Her istek **≥1 sn** aralıkla. Kimlik bilgisi, çerez, oturum **kullanılmadı**. Ham HAR/örnekler: `docs/agent-results/TASK-MVCGPI6V3RM1F-fixtures/`.

| Uç nokta | Metot | Anonim sonuç (kanıt) | Yorum |
|---|---|---|---|
| `/partnerSearch/topicDetails.json?pic=&ccm2Id=50127991` | GET | **200**, `expertiseList: [Expertise_request, Expertise_offer]`, `topic.identifier=HORIZON-CL4-2027-01-MAT-PROD-22`, `topicPersonsWithdraw` (2 kayıt) | Anonim çalışıyor. `ccm2Id` = topic'in CCM2 kimliği (arama metadata'sında `ccm2Id`). |
| `/partnerSearch/topicOrganisationsCount.json` | POST `{"ccm2Id":"50127991"}` | **200**, gövde `128` | GET → 500 "Request method 'GET' not supported". |
| `/partnerSearch/topicOrganisations.json?ccm2Id=50127991` | POST (query param) | **200**, `topicOrganizations`: **118 kayıt** (hepsi `type: ORGANISATION`, `interestStatus: Published`), `topicOrganisationsWithdraw`: 7 | **Asıl ilan uç noktası.** `ccm2Id` JSON gövdesinde değil query'de bekleniyor (gövdede → 500 "Required request parameter 'ccm2Id'…"). |
| `/partnerSearch/search.json` | POST | `{}` ve `{ccm2Id,pageNumber,pageSize}` gövdeleriyle **200 `[]`**; GET → 500 | Gövde şeması bundle'dan çıkarılamadı (ilgili bileşen uzak modülde: `sedia-htp-eui19-remote-el-ui`). **Anonimde boş dönüyor — kimlik gerekebilir; doğrulanamadı.** |
| `/partnerSearch/availablefullRightOrganisations.json?ccm2Id=` | GET | **401** `REUSE-TOKEN-FILTER: No valid access token found` | **Kimlik gerektirir.** Kullanılmayacak. |
| `/orgProfile/data.json?pic=<PIC>` | GET | **200**; `publicOrganizationData.detailsViewable: false` (gerçek bir org PIC'i ile), `collaborations` (29), `portalKeywords` (16), `tagsAndKeywords` (26) | Anonim okunuyor ama `detailsViewable=false`: detay görünürlüğü kurum ayarına bağlı. Profil zenginliği için ek kaynak **şartlı**. |
| `/partnerSearch/announcementDetail.json?annId=` | GET | Bundle'da tanımlı; **denenmedi** (annId gerekli). | |
| Bundle'daki diğer: `topicOrganisations`, `isTopicPresentOnPPDB`, `partnerSearchDetails`, `topicAndOrganisationDetails`, `getTopicsWithOrganisationInterest`, `partnerSearchCountsByPics` | — | Adları bundle'da; **denenmedi** (gereksiz hacim). | |

**Arama (SEDIA) doğrulaması:** `POST https://api.tech.ec.europa.eu/search-api/prod/rest/search?apiKey=SEDIA&text=***&pageSize=100&pageNumber=1` → **200**, `totalResults: 1001`, 100 sonuç; metadata'da `allowPartnerSearch` alanı var (ilk sayfa: **98 `true`, 2 `false`**). Bu alan kartta yok ve repoda hiç kullanılmıyor. İlan çekiminde filtre olarak kullanılabilir.

**Yanıt şeması — `topicOrganizations[]` (118 kayıtta gözlenen):**
`id, requestDate (2025-12-16 … 2026-10-17), organisationName, organisationType, country, pic, summary (max 500 karakter, ort. 456), expertise (Expertise_offer 114 / Expertise_request 4), interestStatus (Published), actions, hasPermission, topicIdentifier, topicTitle, type (ORGANISATION), actionLinks`. Ülke sayısı 34; tür dağılımı: Private for profit 46, SME 31, Higher-ed 14, NGO 11, Research Org 10, Other 4, Public 1, International 1. **Kişi (`type: PERSON`) kaydı bu listede yok.**

**Çelişki/bulgu (açık):**
- Aynı topic için arama metadata'sı `status=31094502` (Open) ama `topicDetails.topic.status = "Forthcoming"`. Durum eşlemesinde hangi kaynağın esas alınacağı netleştirilmeli.
- `topicOrganisationsCount` = 128, liste = 118 + withdraw 7 + person withdraw 2 = 127. Tam örtüşmüyor; sayım kaynağı kesin değil. Sayımı kanıt olarak göstermeyin; liste uzunluğunu kullanın.

**Auth ve rate limit:** Anonim erişim topic-bazlı ilan listesi için yeterli. `robots.txt`'te `Crawl-delay` yok. Rate limit belirtisi gözlenmedi (≈30 istek, 1 sn aralıkla; 5xx/429 gözlenmedi, yalnız tasarım gereği 500/401 yanıtları). API host'u (`api.tech.ec.europa.eu`) için robots kontrolü yapılmadı.

---

## 3. ToS / robots.txt / GDPR

**robots.txt** (`https://ec.europa.eu/robots.txt`, `User-agent: *`): 201 `Disallow` satırı var; **`/info/`, `funding`, `opportunit`, `api` içeren Disallow yok**. Yani `/info/funding-tenders/...` ve `.../opportunities/api/...` yolları robots tarafından yasaklanmıyor.

**Kullanım koşulu (EC Legal notice, `commission.europa.eu/legal-notice_en`) — alıntı:**
> "Unless otherwise indicated (e.g. in individual copyright notices), content owned by the EU on this website is licensed under the Creative Commons Attribution 4.0 International (CC BY 4.0) licence. This means that reuse is allowed, provided appropriate credit is given and changes are indicated. You may be required to clear additional rights if a specific content depicts identifiable private individuals or includes third-party works."

→ Kurum ilanlarının (organizasyon adı, ülke, özet) yeniden kullanımı **CC BY 4.0** ile mümkün; **atıf zorunlu** (kaynak: EU Funding & Tenders Portal). Kişi içeren/üçüncü taraf içerik için ek hak kontrolü gerekir.

**Portal'a özgü ToS / "Terms of use" metni:** Bulunamadı / okunamadı. Partner Search'e özel kullanım koşulu **doğrulanmadı**. Açık madde (Bkz. §6).

**GDPR (EC gizlilik politikası, `commission.europa.eu/privacy-policy-websites-managed-european-commission_en`):** EC'nin kendi işlemesi Regülasyon (EU) 2018/1725 kapsamında. **Bizim işlememiz GDPR (EU) 2016/679** kapsamında; veri sorumlusu olarak biz yükümlüyüz.

**DPO kaydı** `DPR-EC-04670.3` (bundle'da referans): sayfa 1 KB JS-only çıktı verdi, **okunamadı**. Partner Search'e özgü işleme kaydı doğrulanmadı.

**Öneri (GDPR):**
1. **Kurum ilanları** (`type: ORGANISATION`): saklanabilir. Saklanacak alanlar: `organisationName, country, organisationType, summary (≤500), expertise, requestDate, topicIdentifier, pic`. Atıf: kaynak URL + "EU Funding & Tenders Portal, CC BY 4.0".
2. **Kişi ilanları** (`PERSON`, `topicPersonsWithdraw`, `ecasId` içeren kayıtlar): **saklanmaz.** `ecasId` **asla** persist edilmez (kanıt: `topicPersonsWithdraw` anahtarlarında `ecasId` var, değer kaydedilmedi). Gerekirse yalnız anonim sayı (`personCount` per topic).
3. Özet metinlerinde kişi adı/iletişim bilgisi çıkarımı yapılmaz; `summary` olduğu gibi tutulur, log'a yazılmaz.
4. Saklama süresi: topic kapandıktan sonra X gün (öneri 90) sonra silme job'u; `withdrawn_at` dolu kayıtlar 30 gün içinde silinir.

---

## 4. Strateji karşılaştırması

| Kriter | **A — İç JSON** (`topicOrganisations.json` + `topicOrganisationsCount.json`) | **B — Topic sayfası HTML parse** | **C — Hibrit (A birincil, B yedek)** |
|---|---|---|---|
| Zenginlik | Yüksek: 118 kayıt, tür, ülke, özet, expertise, tarih | Düşük: topic HTML'i SPA kabuğu (`portal.html` 59 KB, ilan verisi yok); ilanlar JS ile yükleniyor | Yüksek (A) |
| Kırılganlık | Orta: iç API, şema değişebilir; ama JSON + zod → alarm kolay | Yüksek: DOM yapısı + JS render; headless tarayıcı gerekir | Orta |
| Hız / maliyet | ~1 istek/topic; 1 sn aralıkla ~1000 topic ≈ 17 dk | Headless tarayıcı: topic başına saniyeler + bellek | A + B yükü |
| Hukuki risk | Düşük-orta: CC BY 4.0 + robots serbest; iç API kullanımı ToS'ta açıkça yasaklanmış mı **doğrulanmadı** | Düşük (genel sayfa), ama headless render "oturum taklidi" riskine yaklaşır | Orta |
| Efor | Düşük-orta | Yüksek | Orta-yüksek |
| Anonim çalışma | **Evet** (kanıtlandı) | Sayfa içeriği JS ile geliyor | Evet |

**Öneri: Strateji A**, ek olarak:
- Şema drift alarmı (`reportSchemaDrift`, `createAdapterAlert` — mevcut mekanizma), devre kesici (`SediaCircuitBreaker`) ile.
- **B uygulanmaz.** Yedek olarak "son başarılı snapshot'ı göster" (last_seen_at) kullanılır, HTML scrape değil.
- Çekim takvimi: topic'ler için günlük değil; **yakın deadline (≤120 gün) günlük, diğerleri haftalık.** Böylece ~1000 topic yükü düşer.
- Ön filtre: `allowPartnerSearch=true` olan topic'ler (örneklemde %98).

**Bu öneri onay bekliyor** (kartta "ONAY BEKLE" var).

---

## 5. Şema taslağı (Prisma, **uygulanmadı** — taslak)

Kurallar: repo konvansiyonu (PascalCase tekil model, camelCase alan), `SYSTEM_WIDE` (tenant'sız, `scripts/rls-models.ts`), `topicIdentifier` = mevcut `Topic.identifier` (string FK, `Topic.id` değil). Global referans veri olduğu için **`tenantId` yok, RLS politikası yok, `SYSTEM_WIDE`'a eklenir.** Tenant'a ait "ilgilendiğim" işaretleri ayrıca tenant tablosunda tutulur (Kart kapsamı dışı).

```prisma
// Taslak — uygulanmadı. Migration additive + idempotent olacak (CLAUDE.md).
model PartnerSearchAnnouncement {
  id                 String    @id @default(cuid())
  externalKey        String    @unique          // portal kaydının stabil anahtarı (id yoksa topicIdentifier+pic+requestDate)
  topicIdentifier    String                     // Topic.identifier
  topicCcm2Id        String?                    // ccm2Id (kaynak sorgu)
  expertise          String                     // EXPERTISE_REQUEST | EXPERTISE_OFFER
  interestStatus     String?                    // Published …
  pic                String?                    // kurum PIC (PERSON kaydı burada YOK)
  organisationName   String
  organisationType   String?
  country            String?                    // ISO2
  summary            String?    @db.VarChar(500)
  requestDate        DateTime?
  withdrawnAt        DateTime?
  firstSeenAt        DateTime   @default(now())
  lastSeenAt         DateTime
  sourceRunId        String?
  raw                Json?                      // maskeli; ecasId ASLA yazılmaz
  topic              Topic      @relation(fields: [topicIdentifier], references: [identifier], onDelete: Cascade)
  @@index([topicIdentifier, expertise])
  @@index([pic])
}

model PartnerProfileSnapshot {
  organisationId     String    @id              // CordisOrganization.organisationId (= PIC)
  fetchedAt          DateTime  @default(now())
  publicDetailsViewable Boolean @default(false)
  collaborationsCount Int      @default(0)
  portalKeywords     String[]
  raw                Json?
  organization       CordisOrganization @relation(fields: [organisationId], references: [organisationId], onDelete: Cascade)
}

model IngestionRun {
  id          String    @id @default(cuid())
  source      String                           // 'sedia-partner-search'
  startedAt   DateTime  @default(now())
  finishedAt  DateTime?
  topicsSeen  Int       @default(0)
  rowsUpserted Int      @default(0)
  driftCount  Int       @default(0)
  status      String                           // ok | partial | failed
  errorSummary String?
  @@index([source, startedAt])
}

model UnmatchedOrganization {
  pic          String   @id
  name         String
  country      String?
  firstSeenAt  DateTime @default(now())
  lastSeenAt   DateTime
  // CordisOrganization'da karşılığı olmayan kurumlar; eşleşince silinebilir.
}
```

`CordisOrganization` için ek alanlar **önerilmez**; partner profili zaten `CordisPartnerProfile` ile türetiliyor. Gerekirse yalnızca `publicDetailsViewable` `PartnerProfileSnapshot` içinde tutulur.

**Migration / güvenlik:** `scripts/rls-models.ts` `SYSTEM_WIDE` listesine iki yeni model eklenecek (`PartnerSearchAnnouncement`, `PartnerProfileSnapshot`, `IngestionRun`, `UnmatchedOrganization`); `prisma/rls.sql` değişikliği gerekmez (tenant'sız). Geri-alma SQL'i Kart 1'de yazılacak.

---

## 6. Kart 1–7 efor tahmini ve açık sorular

**Not:** Kart açıklamasında Kart 1 tanımlı ("veri modeli ve migration"); Kart 2–7 başlıkları patronun metninde kesik geldi. Aşağıdaki dağılım **varsayımdır**; onay bekler.

| Kart (varsayım) | İçerik | Efor (geliştirici-gün) |
|---|---|---|
| 1 | Veri modeli + additive migration + geri-alma SQL + `SYSTEM_WIDE` güncellemesi | 1 |
| 2 | Partner istemcisi (`topicOrganisations`, `…Count`) — `SediaAdapter`'a paralel, zod şema, devre kesici | 2 |
| 3 | Ingestion job (cron: yakın-deadline günlük / diğer haftalık), `IngestionRun`, drift alarmı, `RawFetch` hash | 2 |
| 4 | M1 UI: çağrı kartında ilan sayısı, `partners/[pic]` ilan listesi (`PERSON` yok) | 2–3 |
| 5 | M8 girdi: ilan sinyali → `scoreCandidatesForSeat` (yeni özellik + test) | 2 |
| 6 | Plan/limit (`PlanFeature` kind=limit), `can()` yetkisi, admin/alert görünürlüğü | 1 |
| 7 | Export (CSV/XLSX), API (`/api/v1/partners`), GDPR saklama/silme job'u, e2e "mutlu yol" | 2 |
| **Toplam** | | **≈12–13 gün** |

**Açık sorular (karar bekliyor):**
1. **`search.json` için kimlik şart mı?** Anonim POST `[]` döndü. Bu ilan listesinin "giriş yapmış kullanıcıya" özel olduğunu gösterebilir. Doğrulama için **yetkili bir EU Login hesabı** gerekir; otomatik giriş yapılmadı (CLAUDE.md: "portal oturumu taklidi yok"). Patron kararı: hesap kullanılacak mı?
2. **Portal ToS:** Partner Search'e özel kullanım koşulu okunamadı. Hukuki görüş gerekir: iç JSON uç noktasını periyodik çekmek ToS'a uygun mu?
3. **Kişi ilanları:** Bizim örneklemde yalnızca `topicPersonsWithdraw` (geri çekilmiş) kişi kayıtları görüldü; aktif kişi ilanlarının yapısı anonim erişimle görülemedi. Kişi ilanlarını hiç saklamama kararı onaylansın mı?
4. **Status kaynağı:** Arama (Open) vs `topicDetails` (Forthcoming) çelişkisi — hangisi esas?
5. **Yayın/atıf:** CC BY 4.0 atfı UI'da nasıl gösterilecek? (Kart 4)
6. **Remote modül:** Partner Search UI'sinin POST gövde şeması `sedia-htp-eui19-remote-el-ui` uzak paketinde; o paket bulunup okunmadı. Bulunursa `search.json` gövdesi netleşir.

---

## 7. Ne yapıldı / Kanıt

- Repo: `ls`/`python os.path` ile 26 yol doğrulandı; sembol satırları `grep -n` ile alındı.
- Canlı istekler (anonim, ≥1 sn): SEDIA arama (200, 1001 toplam), topicDetails (200), topicOrganisationsCount (200 → `128`), topicOrganisations (200 → 118 kayıt), search.json (200 `[]`; GET 500), availablefullRightOrganisations (401), orgProfile (200), robots.txt, EC legal notice, EC privacy policy, DPO kaydı (okunamadı).
- Fixture (maskeli, kişisel veri sızıntısı taraması: **yok**): `docs/agent-results/TASK-MVCGPI6V3RM1F-fixtures/` — `partner-search-probes.har`, `topicOrganisations.masked.json`, `topicDetails.masked.json`, `sedia-search.sample.json`.

**Ham kanıt özeti:**
```
GET  .../api/partnerSearch/topicDetails.json?pic=&ccm2Id=50127991      → 200 application/json
POST .../api/partnerSearch/topicOrganisationsCount.json {"ccm2Id":"50127991"} → 200 "128"
POST .../api/partnerSearch/topicOrganisations.json?ccm2Id=50127991     → 200 {topicOrganizations:[118], topicOrganisationsWithdraw:[7], topicPersonsWithdraw:[2]}
POST .../api/partnerSearch/search.json {}                              → 200 []
GET  .../api/partnerSearch/search.json                                 → 500 "Request method 'GET' not supported"
GET  .../api/partnerSearch/availablefullRightOrganisations.json?ccm2Id=… → 401 "No valid access token found"
POST https://api.tech.ec.europa.eu/search-api/prod/rest/search?apiKey=SEDIA&text=***&pageSize=100&pageNumber=1 → 200, totalResults 1001
```

## 8. Değişen dosyalar

- Repo (`/Users/macbook/alan/FONBRIDGE`): **yok.**
- Rapor: `/Users/macbook/alan/docs/agent-results/TASK-MVCGPI6V3RM1F-be-fb.md` (bu dosya).
- Fixture: `/Users/macbook/alan/docs/agent-results/TASK-MVCGPI6V3RM1F-fixtures/` (4 dosya).

## 9. Riskler

- **İç API değişikliği:** Uç noktalar belgelenmemiş; sessiz şema kayması olabilir → drift alarmı zorunlu.
- **ToS belirsizliği:** Partner Search'e özel koşul okunamadı (§6-2).
- **Kişisel veri:** `ecasId` içeren yanıtlar mevcut; yanlışlıkla loglama/kaydetme riski (kanıt: anahtar var). Yazma yolunda allowlist şart.
- **Status çelişkisi** (§2) — yanlış "açık çağrı" gösterme riski.
- **Yük:** ~1000 topic; haftalık/günlük ayrımı olmadan 1 sn aralık ≈ 17 dk/çekim.

## 10. Sonraki adım

1. Patron onayı: **Strateji A**, şema taslağı (§5), Kart 1–7 dağılımı (§6).
2. Açık sorular §6-1 ve §6-2 yanıtlanmadan Kart 2 başlamasın (kimlik gerekiyorsa tasarım değişir).
3. Onaydan sonra Kart 1 (migration) — geri-alma SQL'i ile.

## Definition of Done

- [x] Repo envanteri dosya yollarıyla yazıldı (§1)
- [x] Partner Search endpoint'leri gerçek istek kanıtıyla belgelendi; `search.json` gövdesi **kısmen** (anonim `[]`, kimlik şartı doğrulanmadı)
- [x] ToS/robots.txt alıntıları ve GDPR önerisi yazıldı; **portal-özel ToS ve DPO kaydı okunamadı** (§3)
- [x] A/B/C karşılaştırma tablosu + tek öneri (§4)
- [x] Şema taslağı + Kart 1–7 efor tahmini + açık sorular (§5, §6)
- [ ] **Rapor commitlendi — YAPILMADI.** Sonuç dosyası `/Users/macbook/alan/docs/` altında; bu dizin bir git reposu değil (`git rev-parse` → "not a git repository"). Kart "FONBRIDGE" reposunda commit istiyor; ama sonuç yolu olarak verilen yol FONBRIDGE dışında. Lider karar versin: dosya bu yerde mi kalsın, yoksa FONBRIDGE'e kopyalanıp commitlensin mi.
- [x] Platform beyanı: sunucu tarafı, OS bağımsız; canlı denemeler macOS'ta koştu, Linux/Windows koşulmadı (koşulamadı: gerek yok, kod yolu platforma bağlı değil).

Yeni bilgi (hafıza): iç partner uç noktaları anonim topic-bazlı JSON ile çalışıyor; `allowPartnerSearch` alanı kullanılmıyor; `PlanEntitlement`, `src/lib/authz` ve `Organization`/`Project` modelleri repoda yok. Bu bilgi yazılacak.
