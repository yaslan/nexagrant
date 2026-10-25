# TASK-MVCH2J271U5VY — PS-K2 PartnerSearchIngestor, zamanlayıcı, alarm ve global bayrak

**Ajan:** be-fb · **Sprint:** SPRINT-FONBRIDGE-PS2 · **Dal:** `be-fb/fo60-partner-search-ingestor` (origin/dev tabanlı)

**Hüküm: KISMEN TAMAM.** Adapter, ingestor, zamanlayıcı, bayrak, alarm ve gerçek portal koşusu çalışıyor. İki açık kalıyor: (1) 90 gün arşivleme uygulanmadı, (2) tam paket tek koşuda yeşil değil (dört dosya ortam yükünden düştü, tek tek koşunca geçiyor). Ayrıntı aşağıda.

## Ne yapıldı

- **Adapter** `src/lib/adapters/partner-search.ts`: anonim `topicOrganisations.json?ccm2Id=` (POST), zod şeması, alan allowlist'i (`projectOrgRow`), `ecasId` ve kişi alanları hiç okunmuyor ve hiç yazılmıyor. Şema uyuşmazlığı → `drift` (ingestor alarm üretir, veri silmez). Politika: en fazla 1 istek/sn, 5xx'te 1/2/4 sn geri çekilme, 403/429'da durma + alarm, transport hatalarında devre kesici (3 ardışık hata).
- **Ingestor** `src/modules/m1/server/partner-search/ingestor.ts`: getir → normalize → `externalId` ile upsert → iki ardışık taramada yok → `withdrawnAt` (`missedScans` sayacı) → PIC eşleşmesi → `CordisOrganization.hasActiveAnnouncements` / `lastAnnouncementAt` güncelleme. Kişi (PERSON) satırı saydırılır, saklanmaz; `PartnerSearchTopicStat.personAnnouncementCount` tutulur.
- **Bayrak** `partner_search_ingestion_enabled`: `PlatformSetting` tablosunda, varsayılan `false`. Kapalıyken koşu no-op (kayıt yazmaz, `skipped/flag-off` döner).
- **Koşu kaydı** `PartnerSearchIngestionRun` her koşuda bir satır.
- **Zamanlayıcı**: `src/lib/jobs/schedule.ts` içinde `partner-search`, cron `0 3 * * *` (UTC). K1 tarafında yalnızca olay yayımı eklendi (`queuePartnerSearchIncremental`, try/catch); k1-daily-calls davranışı değişmedi.
- **Manuel koşu**: `pnpm jobs:partner-search -- --topic <id>`.
- **Testler**: `tests/partner-search-core.test.ts`, `tests/partner-search-adapter.test.ts`, `tests/partner-search-ingest.live.test.ts` (7 canlı test: bayrak kapalı no-op; bayrak açık, 3 satır, `ecas` yok; aynı tarama → yeni RawFetch yok; sıra değişince → yeni RawFetch yok; iki taramada geri çekilme; şema uyuşmazlığı → FAILED + alarm + silme yok; 403 → FAILED + alarm).

## Kanıt

**Gerçek portal koşusu** (izole DB `fabrika_fo60`, bayrak yalnızca orada açık, konu `CERV-2026-DAPHNE-PREVENTION`, ccm2Id 51179580, OPEN):

Koşu 1 — ilk gerçek yanıt, şema uyuşmadı (doğru davranış):
```
[WARN] [partner_search] schema drift detected {"count":1,"sample":["topicOrganisations envelope: Invalid input: expected object, received array"]}
run cmvjvur420000a4xkmy7lxb3u status=FAILED { topicsScanned: 0, created: 0, ... }
```
Neden: canlı portal `topicOrganisationsWithdraw` ve `topicPersonsWithdraw` alanlarını **tam satır dizisi** olarak döndürüyor; kart/notlardaki "sayım" varsayımı canlıda yanlış çıktı. Düzeltme: iki biçim de kabul edilir, dizide uzunluk sayılır, `topicPersonsWithdraw` hiç ayrıştırılmaz.

Koşu 2 — düzeltmeden sonra:
```
run cmvjw0mqg0000xbxkiko6d2wp status=SUCCESS { topicsScanned: 1, created: 204, updated: 0, withdrawn: 0, personAnnouncementCount: 0 }
```

Koşu 3 (aynı veri, tekrar): `status=SUCCESS created: 0, updated: 204`. Koşu 4 (sıra düzeltmesinden sonra): `status=SUCCESS created: 0, updated: 204`.

**Yakalanan ikinci hata:** Koşu 2 ile 3 arasında `RawFetch` 1 → 2 oldu. Kök neden: aynı satırlar farklı sırada geldi (kanıt: iki payload aynı çokluk, `rows changed in place: 0`, `same order: False`), ve hash sıra duyarlıydı. Düzeltme: `rowsHash` satırları `id`'ye göre sıralıyor. Regresyon testi: "the same rows in a different order store no new RawFetch row". Düzeltmeden sonra `RawFetch` 3'te sabit kaldı (koşu 4 öncesi 3, sonrası 3).

**SQL kanıtı** (izole DB):
```
SELECT count(*) FROM "PartnerSearchAnnouncement" WHERE "topicIdentifier"='CERV-2026-DAPHNE-PREVENTION';  → 204  (active: 204)
SELECT id,status,created,updated,withdrawn,"personAnnouncementCount" FROM "PartnerSearchIngestionRun" ORDER BY "startedAt" DESC;
  cmvjyuvpf0000waxk05p9nj8p | SUCCESS | 0 | 204 | 0 | 0      (son koşu)
  cmvjw0mqg0000xbxkiko6d2wp | SUCCESS | 204 | 0 | 0 | 0      (ilk başarılı)
  cmvjvur420000a4xkmy7lxb3u | FAILED  | 0 | 0 | 0 | 0       (şema uyuşmazlığı)
RawFetch (source='partner_search') ... WHERE payload::text ILIKE '%ecas%'  → 0
PartnerSearchAnnouncement ... WHERE a::text ILIKE '%ecas%'                 → 0
```
Not: `RawFetch` sütunu `raw` değil `payload`'dır; kontrol `payload` üstünde yapıldı (ve satır bütünü üstünde de 0). Canlı kişi-geri-çekme satırlarında `ecasId` gerçekten var (ham yanıtta doğrulandı), yani sıfır sonuç anlamlı.

**Birim + canlı testler** (son durum): `tests/partner-search-ingest.live.test.ts`, `tests/partner-search-core.test.ts`, `tests/partner-search-adapter.test.ts`, `tests/where-guard-src.test.ts` → **4 dosya, 34/34 geçti**. `npx tsc --noEmit` → 0.

**Lint**: `pnpm lint` → exit 0 (0 hata, 4 uyarı; uyarılar bu değişikliğe dokunmayan dosyalarda: `src/lib/invitations/accept.ts`, `tests/e2e/fixtures/concept-template-tenant.ts`, `tests/settings-profile-update.test.ts`).

**Tam paket**: 3 işçi, `DATABASE_URL` tırnaksız, `testTimeout=180000` → `4 failed | 4944 passed | 133 skipped (5081)`. Düşen dört dosya: `src/lib/agency/funnel.attack.test.ts`, `tests/evidence-expiring.live.test.ts`, `tests/invitation-seat-race.live.test.ts` (`Connection terminated due to connection timeout`), `tests/rag-pdf-worker-isolation.test.ts` (3 sn bütçeleri, `expected 7718 ms to be less than 3000`). Bu dört dosya tek tek koşuldu: `alone.log` → 6 dosyadan 5'i geçti; `rag-pdf-worker-isolation` tek başına **25/25 geçti**. Koşu sırasında makine yükü 96 idi (diğer oturumların Electron/TypeScript/VM süreçleri). **Yorum: tam pakette başarısızlıklar ortam kaynaklı; tam paketin tek koşuda yeşil olduğunu iddia etmiyorum.**

## Değişen dosyalar

Yeni: `src/lib/adapters/partner-search.ts`, `src/lib/adapters/schemas/partner-search.ts`, `src/modules/m1/server/partner-search/flag.ts`, `src/modules/m1/server/partner-search/ingestor.ts`, `src/lib/jobs/tasks/partner-search.ts`, `scripts/run-partner-search.ts`, `prisma/migrations/add-platform-setting.sql` (+`.down.sql`), `prisma/migrations/add-partner-search-missed-scans.sql` (+`.down.sql`), `tests/partner-search-core.test.ts`, `tests/partner-search-adapter.test.ts`, `tests/partner-search-ingest.live.test.ts`, `tests/fixtures/partner-search/` (fixture + README), `docs/agent-results/TASK-MVCH2J271U5VY-be-fb.md`.

Değişen: `prisma/schema.prisma` (`PlatformSetting`, `PartnerSearchAnnouncement.missedScans`), `prisma/migrations/apply-order.txt`, `prisma/rls.sql` (PlatformSetting DISABLE listesi), `scripts/rls-models.ts`, `package.json` (`jobs:partner-search`), `src/lib/jobs/schedule.ts`, `src/lib/jobs/tasks/index.ts`, `src/lib/jobs/tasks/k1-daily-calls.ts` (yalnızca olay yayımı), `tests/jobs-schedule.test.ts`, `tests/rls-coverage.test.ts`, `docs/DATA_MODEL.md`.

## Riskler

1. **Canlı şema tahminleri fixture'dan saptı.** Fixture (maskeli türetilmiş) withdraw alanlarını sayım olarak gösteriyor; canlı portal satır dizisi döndürüyor. Fixture güncellenmedi; şema artık iki biçimi de kabul ediyor, ama bu tür sapma yeniden olabilir. Uyuşmazlık alarm + koşu durdurma olarak yakalanır, veri silinmez.
2. **Kişi sayısı.** Canlı konuda `topicOrganizations` içinde 0 PERSON satırı var; `topicPersonsWithdraw` içinde 1 satır var ve bu sayılmıyor (geri çekilmiş kişi duyurusu aktif kişi sayısı değildir). `personAnnouncementCount` = 0 bu yüzden doğru.
3. **Geri çekilme = yokluk kuralı.** Canlı konuda 10 geri çekilmiş organizasyon satırı var ama id'leri saklanmıyor; iki ardışık taramada yokluk gerekir. Yani geri çekilme en az iki koşu gecikir.
4. **User-Agent sapması.** Kart metni "iletişim" diyordu; `ş` (U+015F) HTTP başlığında ByteString dışı olduğu için `fetch` her istekte patlardı. Kullanılan: `FonBridge/0.1.0 (iletisim: info@fonbridge.com)`. Test bunu zorluyor.
5. **Arşivleme yok.** Kapanıştan 90 gün sonra arşivleme uygulanmadı.
6. **Sıra duyarlılığı.** Hash artık `id`'ye göre sıralı; aynı içerik farklı sırada gelse de yeni ham satır yazılmaz. Sıralama dışında bir alan değişirse yeni satır yazılır (beklenen).
7. **Bayrak OFF.** İzole DB'de bayrak koşudan sonra `false`'a döndürüldü. Paylaşılan `fabrika` DB'sine dokunulmadı; `fabrika_fo60` yerel bir kopya, rol şifresi yalnızca bu kopyada ayarlandı.

## Açık sorular

- Arşivleme (kapanıştan 90 gün) bu kart kapsamında mı, yoksa ayrı bir karta mı? Şu an uygulanmadı.
- `topicPersonsWithdraw` sayısını ileride istatistik olarak göstermek isteniyor mu? Şu an hiç saklanmıyor.

## Sonraki adım

1. Arşivleme kararını almak (bu kartta veya ayrı kart).
2. Fixture'ı canlı yanıta göre güncellemek (yeniden kaydetme; kişi alanları maskeli kalmalı).
3. Tam paketi, paylaşılan yük yokken (veya CI'da) tek koşuda yeşile getirmek.
4. CRW-FB incelemesi ve PR birleştirme kararı (birleştirme yapılmadı).
