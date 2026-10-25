# TASK-MVIK4YZH8ZA4K (FO-117) — keep.eu ham hata metni sızıntısı: kod ve güvenlik incelemesi

**Hüküm:** DÜZELTME GEREKLİ — 1 orta bulgu (CLI dry-run'da HTTP durumu kayboldu, regresyon). Güvenlik açısından: istemciye ham hata sızıntısı bulunmadı; sabit kod yolu doğru.
**İncelenen commit:** `1a0e4a0b` (dal `feat/partner-search-interreg`), kod değiştirilmedi.
**Platform:** mac (Darwin 27, zsh) üzerinde okuma ve test. Saf TS + statik tarama + i18n; platforma bağlı yol yok. Windows/Linux koşulmadı (bu makinede yalnız mac).

## Kapsam ve yöntem
1. Kart `TASK-MVIK4YZH8ZA4K` `get_task` ile okundu (DoD: guard yeşil, kod bazlı assert, guard testi değişmemiş, UI çevrilmiş mesaj, lint+typecheck).
2. `git show 1a0e4a0b` okundu; `src/lib/keep-eu-sync.ts`, `src/app/[locale]/admin/interreg/actions.ts`, `client.tsx` ve `messages/{en,tr}.json` ilgili kısımlarıyla birlikte okundu.
3. Sızıntı yolları tarandı: `fetchKeepEuOpenData` dönüşü, `syncKeepEuData` dönüşü, action dönüşü, client `catch`, `onProgress.error`, `fetchKeepEuOpenData` çağıranları (`scripts/run-keep-eu-sync.ts`).
4. Testler koşuldu. Ekran görüntüleri açılıp incelendi.

## Testler (ham çıktı, bu koşu)
```
perl -e 'alarm 900;exec @ARGV' pnpm exec vitest run tests/api/api-error-body-guard.test.ts tests/keep-eu-sync.test.ts tests/admin-interreg-actions.test.ts
 Test Files  3 passed (3)
      Tests  50 passed (50)
   Start at  18:24:24
   Duration  27.51s
```
Not: komut ilk çalışmada `pnpm` bağımlılıkları yeniden kurdu (`Packages: +45 -30`, `next 16.3.8 → 16.3.4` ve `eslint-config-next` aynı şekilde). Bu, çalışma ağacındaki `node_modules`'u değiştirdi; kod ağacında değişiklik yok. Lint/typecheck bu incelemede koşulmadı (kart DoD'u be-fb'ye ait).

## Güvenlik bulguları — sızıntı yolları

**Sonuç: istemciye giden yol temiz.**
- `fetchKeepEuOpenData` dönüşü yalnız `KeepEuFetchErrorCode` taşıyor (`missing_api_key | forbidden | upstream_error | timeout | network_error`). `statusText`, `errorMessage(err)` ve env metni dönüşe girmiyor; yalnız `recordAlert` çağrılarında kalıyor (`keep-eu-sync.ts` 481–566).
- `syncKeepEuData` `upstreamError`'ı yalnız sabit kodla dolduruyor (`:838`). `KeepEuSyncResult` içinde ham metin alanı yok. `onProgress.error` (`errorMessage(e)`, `:917`) action'a dönmüyor; action yalnız `syncKeepEuData` dönüşünü döndürüyor (`actions.ts:34`).
- Client `catch` (`client.tsx:77–79`) sabit `t('syncError')` gösteriyor; `console.error` yalnız tarayıcı konsoluna gidiyor (ham hata istemci durumuna girmiyor).
- `programmeIdsSchema.parse` ZodError'u da action'dan fırlıyor; istemci bunu `syncError` ile karşılıyor, mesaj gösterilmiyor. Ayrıca production'da Next server action hata mesajını istemciye taşımaz.
- `recordRawFetch` payload'undaki `url` alanı `KEEP_EU_API_BASE_URL` (anahtarsız). API anahtarı URL'de (`?key=`) ama `recordAlert` mesajlarına ve `meta`ya URL girmiyor.

**Düşük / not (bu commit'in regresyonu değil):** `keep.eu fetch network error: ${message}` (`:561`) fetch'in fırlattığı metni SystemAlert'e yazıyor. Undici hatası URL içermiyorsa sorun yok; içerirse API anahtarı SystemAlert tablosuna girer. Yalnız platform admini görür. Doğrulanmadı; kapsam dışı, not olarak bırakıldı.

## Bulgular (önem sırasıyla)

### B1 — Orta · regresyon · CLI dry-run HTTP durumunu kaybetti
- **Dosya:** `scripts/run-keep-eu-sync.ts:152` (değişmemiş, ama çıktısı değişti); kök: `src/lib/keep-eu-sync.ts:527`.
- **Senaryo:** `scripts/run-keep-eu-sync.ts --dry-run` çalıştırıldığında keep.eu 401 ya da 500 dönerse `❌ keep.eu fetch failed: upstream_error` yazar. Önceki sürümde `HTTP 500 Internal Server Error` yazardı. Dry-run `persist: false` ile çalıştığı için SystemAlert da yazılmaz. Operatör artık `upstream_error`un 401 mi 500 mü olduğunu hiçbir yerden göremez.
- **Neden önemli:** Bu, operasyonel tanıyı kaldırıyor. İstemci sızıntısı değil; CLI'nin güvenilir çıktısı. Kod-bazlı hata tasarımı CLI için fazla dar kaldı.
- **Önerilen düzeltme:** Dry-run/CLI yolu için ayrıntıyı ayrı bir alanla taşı, ör. dönüşe `status?: number` ekle (yalnız sunucu içi çağrılar okur, action'a girmez) ya da `persist: false` iken `console.error`/`console.warn` ile `statusText` yaz. Action/istemci dönüşü değişmez.

### B2 — Düşük · test · sync-düzeyi 403 testi 403 yolunu kanıtlamıyor
- **Dosya:** `tests/keep-eu-sync.test.ts:508–519`.
- **Senaryo:** Test `syncKeepEuData({ programmeIds: [305] })` çağırıyor; `apiKey` geçmiyor, testte `KEEP_EU_API_KEY` ayarlanmıyor. Ortamda anahtar yoksa fetch hiç yapılmadan `missing_api_key` dönüyor; 403 stub'ı hiç çalışmıyor. Test yine yeşil kalıyor çünkü `['missing_api_key','forbidden']` ikisini de kabul ediyor. Yani bu test "403 → forbidden" eşlemesini kanıtlamıyor.
- **Hafifletici:** 403→`forbidden` eşlemesi `:615–625` testinde (`apiKey` açıkça verilmiş, `toBe('forbidden')`) doğrudan kanıtlanıyor. Yani kapsam boşluğu yok, yalnız bu test yanıltıcı.
- **Önerilen düzeltme:** Testte `apiKey` ver (ya da `syncKeepEuData`'ye ilet) ve `toBe('forbidden')` yaz. DoD'daki "kod bazlı assert" maddesi bu test için tam sağlanmış olur.

### B3 — Düşük · latent · `upstreamError` fallback'li yeniden indekslemeyi UI'dan gizliyor
- **Dosya:** `client.tsx:70–74`; `keep-eu-sync.ts:838`.
- **Senaryo:** `syncKeepEuData` `allowDatabaseFallback` ile çağrılırsa upstream hatasında veritabanından yeniden indeksleme yapılır, `source: 'database'` ve `upstreamError` birlikte döner. Client `upstreamError` doluyken `setSyncResult`'ı atlıyor; yeniden indeksleme sonucu kullanıcıdan gizleniyor. Bugün action bu seçeneği geçmiyor (`actions.ts:34`), o yüzden şu an tetiklenmiyor.
- **Önerilen düzeltme:** Şimdilik not; bu seçenek action'a eklendiğinde UI'da `upstreamError` ile `syncResult` birlikte gösterilmeli.

### B4 — Bilgi · ekran görüntüsü kanıtı
- TR ekran görüntüsünde (`tr-admin-interreg-missing-api-key.png`) buton hâlâ "Senkronize Ediliyor…" durumunda; metrikler yeniden çekilirken alınmış. Banner doğru: "keep.eu API anahtarı tanımlı değil…". Başarı banner'ı yok.
- EN görüntüsünde (`en-admin-interreg-missing-api-key.png`) banner "keep.eu API key is not configured. A system administrator must set KEEP_EU_API_KEY." ve buton normal durumda. Başarı banner'ı yok.
- Ham hata metni, HTTP durumu ya da env anahtar adı istemcide görünmüyor. (Banner'daki `KEEP_EU_API_KEY` adı çevrilmiş mesajın parçası; sabit kod değil, i18n metni olduğu için sorun değil, sistem yöneticisine yönelik bilinçli bir ifade.)
- Eksik: TR görüntüsü yarım-yüklü durumda; kanıt olarak yeterli ama temiz bir son durum için bir yeniden çekim faydalı olur.

## i18n kontrolü
- Beş yeni anahtar (`upstreamMissingApiKey`, `upstreamForbidden`, `upstreamErrorResponse`, `upstreamTimeout`, `upstreamNetworkError`) hem `messages/en.json` hem `messages/tr.json` içinde `adminInterreg` altında var.
- Client `useTranslations('adminInterreg')` kullanıyor; `UPSTREAM_ERROR_KEYS` `satisfies Record<KeepEuFetchErrorCode, string>` ile beş kodun tamamını zorluyor. Yeni kod eklenirse derleme hatası verir.
- Diff içinde sabit kullanıcı metni eklenmemiş. Eski `syncError` ve `syncSuccess` yolları `t()` ile.

## Diğer kontroller
- `errorMessage` importu (`keep-eu-sync.ts:21`) hâlâ kullanılıyor (`:553`, `:917`); ölü import yok.
- `KeepEuFetchErrorCode` tipi `client.tsx` ile `keep-eu-sync.ts` arasında paylaşılıyor; tip-düzeyinde sözleşme tutarlı.
- Guard testi (`tests/api/api-error-body-guard.test.ts`) bu commit'te değişmemiş (`git show --stat` yalnız altı dosya gösteriyor; guard dosyası yok). Allowlist eklenmemiş.

## Riskler
- B1 çözülmeden CLI dry-run'da HTTP tanısı yok.
- Test çalıştırması `node_modules`'u değiştirdi (yukarıdaki not).
- Canlı keep.eu ile 403/200 davranışı koşulmadı.

## Açık sorular
- B1 için tercih: dönüşe `status` alanı mı, yoksa yalnız CLI'de `statusText` yazdırma mı? Önerim ikincisi (sunucu içi dönüş sade kalır; CLI yolu yalnız konsol çıktısını etkiler).

## Sonraki adım
1. B1 düzelt (CLI'de ayrıntı kaybolmasın), B2 testini `apiKey` ile sabitle.
2. Düzeltme sonrası yalnız ilgili üç test dosyasını ve `pnpm lint && pnpm typecheck`'i yeniden koş.
3. Kart `review`'a yalnız bu düzeltmelerden sonra alınsın.
