# TASK-MVCH2J271U5VY — FO-60 düzeltme turu (be-fb-4)

**Hüküm:** Engel 1 (gizlilik) ve Engel 2 (tarih alarmı) kapandı; Öneri 3–6 uygulandı; Öneri 4'ün tamlık kontrolü bilerek atlandı (gerekçe aşağıda). Dal yerel, **push yok**.

**Platform:** mac (darwin), yalnız sunucu tarafı (server-only). Tarayıcı/UI değişikliği yok.

**Dal:** `be-fb/fo60-on-154` (worktree `.claude/worktrees/fo60-on-154`), taban HEAD `c85ba0e9`.

## Ne yapıldı

### Engel 1 — gizlilik (PERSON allowlist)
- `src/lib/adapters/partner-search.ts`: PERSON denylist'i kaldırıldı. Artık allowlist:
  - `type === 'PERSON'` → sayılır, düşürülür, hiçbir alanı okunmaz;
  - `type === 'ORGANISATION'` → şemaya girer;
  - diğer her değer (alan yok, `Person`, boş) → `topicOrganizations[i]: unknown type` drift'i.
- `src/lib/adapters/schemas/partner-search.ts`: `type: z.literal('ORGANISATION')`.
- SQL kanıtı: canlı testte `organizationName = '<masked-person>'` sayısı 0 (kişinin adı da DB'de yok).

### Engel 2 — tarih alarmı
- `requestDate` zod'da `isIsoDate` ile doğrulanıyor (`YYYY-MM-DD` ya da ISO date-time; `Date.parse` NaN değil). `19/10/2026` → drift.
- Drift yolu: `reportSchemaDrift` (SystemAlert, `partner_search:schema-drift`), koşu FAILED, hiçbir satır yazılmaz.
- `ingestor.ts` `publishedAt: new Date(row.requestDate)` artık yalnız doğrulanmış tarihle çalışır; geçersiz Date üretilemez.

### Öneri 4 — boş tarama
- `suspectEmptyScan(seenCount, stored)`: 0 satır ve canlı (withdrawn olmayan) saklı satır varsa şüpheli.
- Şüpheli taramada hiçbir yazma yok; `createAdapterAlert(..., 'warn', ..., 'partner_search:empty_scan:<topic>')`. Kaçırma sayılmaz, kimse withdrawn olmaz.
- **Tamlık kontrolü (`topicOrganisationsCount`) atlandı.** Keşifte portal 128 gösterdi, listede 127 satır vardı; eşitlik kontrolü yanlış alarm üretirdi.

### Öneri 5 — eski PIC
- Görülen satırın önceki `organizationPic` değeri `touchedPics`'e ekleniyor; eski PIC'in bayrağı yeniden hesaplanıyor.

### Öneri 6 — `updated` sayımı
- `announcementChanged(prev, next)`: tarihler anlık (`getTime`) ile karşılaştırılır. `updated` yalnız alan gerçekten değiştiğinde artar. Satır yine de yazılır ki `lastSeenAt` ilerlesin.

### Öneri 3 — withdraw gerekçesi
- Başlık yorumu ve adaptör yorumu düzeltildi: adaptör `topicOrganisationsWithdraw` sayısını okur, id'leri eşleştirmez; kararı yalnız iki farklı UTC günündeki yokluk verir. Id bazlı anında geri çekme uygulanmadı (istenmedi).

### Lider kararı — silme
- `retention.ts` yorumu: kapalı topic ilanları 90 gün sonra **silinir**, arşivlenmez. Kart metni ("arşivlenir") bu kararla değişmeli.

## Kanıt (ham çıktı)

### KIRMIZI — eski kod, yeni testler (unit)
```
 Test Files  3 failed (3)
      Tests  17 failed | 36 passed (53)
 FAIL  tests/partner-search-adapter.test.ts > ... > a row without a type is drift, not an organisation
AssertionError: expected 'ok' to be 'drift' // Object.is equality
 FAIL  tests/partner-search-adapter.test.ts > ... > a row typed "Person" is drift, not an organisation
 FAIL  tests/partner-search-adapter.test.ts > ... > a row typed "" is drift, not an organisation
 FAIL  tests/partner-search-adapter.test.ts > ... > a requestDate that is not a date is drift, not a silent write failure
AssertionError: expected 'ok' to be 'drift' // Object.is equality
 FAIL  tests/partner-search-core.test.ts > announcementChanged ... > the same fields, even as a different Date instance, are not a change
TypeError: announcementChanged is not a function
 FAIL  tests/partner-search-core.test.ts > suspectEmptyScan ... > no rows while live announcements are stored is suspect
TypeError: suspectEmptyScan is not a function
 FAIL  tests/partner-search-ingestor.test.ts > ... > raises one drift alert, writes no topic rows, and the run stops
AssertionError: expected "vi.fn()" to be called 1 times, but got 0 times
 FAIL  tests/partner-search-ingestor.test.ts > ... > a 0-row scan of a topic with stored announcements withdraws nothing and raises one alert
AssertionError: expected "vi.fn()" to not be called at all, but actually been called 1 times
 FAIL  tests/partner-search-ingestor.test.ts > ... > a row seen again refreshes the PIC it had before, so that organisation's flag is recomputed
AssertionError: expected "vi.fn()" to be called with arguments: [ ObjectContaining{…} ]
 FAIL  tests/partner-search-ingestor.test.ts > ... > a scan that changes no field counts zero updated rows
AssertionError: expected "vi.fn()" to be called with arguments: [ ObjectContaining{…} ]
```
Eski kodda Engel 1 (tip, tarih) ve Engel 2 (drift, alarm) ile Öneri 4–6 kırmızı.

### YEŞİL — yeni kod, unit
```
 Test Files  3 passed (3)
      Tests  53 passed (53)
```

### YEŞİL — canlı (izole DB `fo60_iso`, konteyner `fo60-pg-iso-s2`, port 55981)
```
 Test Files  1 passed (1)
      Tests  15 passed (15)
```
Çalıştırma: `DATABASE_URL=postgresql://fabrika:fabrika@127.0.0.1:55981/fo60_iso DATABASE_URL_RLS_TEST=postgresql://fabrika_app:fo60-iso-local@127.0.0.1:55981/fo60_iso` ile `npx vitest run tests/partner-search-ingest.live.test.ts`. Atlanan test yok.

### Tüm partner-search paketi
```
 Test Files  12 passed (12)
      Tests  123 passed (123)
```

### Typecheck ve lint
- `pnpm typecheck` → exit 0, `error TS` sayısı 0 (ilk denemede `topicIdentifier` seçimi eksikti, düzeltildi).
- eslint (değişen dosyalar) → exit 0.

### Kurulum
- `setup.log` sonu: `apply-migrations: 55 files applied as fabrika` ve `SETUP-OK`; iki kez koşuldu (idempotent).

## Değişen dosyalar
- `src/lib/adapters/partner-search.ts` (+13/−)
- `src/lib/adapters/schemas/partner-search.ts` (+15/−)
- `src/modules/m1/server/partner-search/ingestor.ts` (+115/−)
- `src/modules/m1/server/partner-search/retention.ts` (yorum)
- `tests/partner-search-adapter.test.ts`, `tests/partner-search-core.test.ts`, `tests/partner-search-ingestor.test.ts`, `tests/partner-search-ingest.live.test.ts`
- `docs/agent-results/TASK-MVCH2J271U5VY-be-fb-4.md` (bu dosya)

## Riskler ve dürüst notlar
- **Canlı kırmızı çıktı alınmadı.** Yeni canlı testi (geçersiz tarih) eski kodda ayrıca koşturulmadı; kırmızı kanıt unit düzeyinde. Aynı davranış adaptör ve ingestor birim testlerinde kırmızıydı.
- **Canlı testte iki kez assertion düzeltildi** (test kodu, üretim kodu değil): (a) sabit `3` satır sayısı önceki testlerin durumuna bağlıydı, öncesi/sonrası karşılaştırmasına çevrildi; (b) SystemAlert sayısı `+1` beklentisi yanlıştı çünkü `recordAlert` aynı drift'i açık satırda birleştiriyor, test "açık drift alarmı tam 1" olarak yazıldı. İlk koşuda canlı DB'de `DATABASE_URL_RLS_TEST` eksikti; yeniden koşuldu.
- **Boş tarama kuralı:** portal bir topic'in tüm ilanlarını gerçekten kaldırırsa, o satırlar canlı kalır ve alarm tekrar tekrar (tek açık satırda) bekler. Elle kapatılması gerekir.
- **Taşınan satır (portal topic değiştirdi):** eski topic'teki PIC bayrağı bu koşuda yeniden hesaplanmaz; kapsam dışı bırakıldı.

## Açık sorular
- Kart metni ("arşivlenir" → "90 gün sonra silinir") güncellenmeli. Bu turda `update_task` ile işlenecek; sonuç aşağıda kart notunda.

## Sonraki adım
- Lider: diff incelemesi. Push kararı lidere ait; bu turda push yapılmadı.
- Kapanış: yerel konteyner `fo60-pg-iso-s2` durduruldu ve silindi; ortak `:5433`, `:3000`, ortak `node_modules` dokunulmadı.
