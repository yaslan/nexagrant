# TASK-MTVTIU3LAYFOA — `{brand}` placeholder çağrıları + TASK-MTVTN2KSTA0TW (typecheck)

## 1. Ne yapıldı

### (b) Kusuru ölçme — gerçek sonuç next-intl'de FIRLATMA değil, ANAHTAR YOLU
Fabrika dev server'ı (Turbopack) `pnpm dev` ile ayağa kaldırıldı (port 3000 kardeş bir pane'in
süreciydi, gerçek Fabrika 3001'e düştü) ve `/en`, `/en/pricing` gerçek HTTP isteğiyle çekildi.

- Düzeltmeden ÖNCE: `<title>landing.metaTitle</title>`, `<meta name="description" content="landing.metaDescription"/>` — next-intl `{brand}` değeri geçilmeyince **FORMATTING_ERROR** fırlatıyor, next-intl/server bunu içeride yakalayıp konsola logluyor (sayfa 500 OLMUYOR, 200 dönüyor) ve `getMessageFallback` devreye girip **mesaj yerine anahtar yolunu** (`landing.metaTitle`) render ediyor. Ham `{brand}` metni DEĞİL, tamamen anlamsız bir string Google'a ve sekme başlığına gidiyor.
- Dev log'dan ham kanıt:
  ```
  Error: FORMATTING_ERROR: The intl string context variable "brand" was not provided to the string "{brand} — AI-Powered EU Funding Platform for Horizon Europe & Eurostars"
      at Module.generateMetadata (src/app/[locale]/page.tsx:18:17)
    code: 'FORMATTING_ERROR'
  ```
- İzole `createTranslator` testimde (messages objesini elle, minimal olarak kurunca) aynı input FARKLI davranmıştı (ham `{brand}` metnini bastı, hata fırlatmadı) — bu next-intl'in `onError`/mesaj kataloğu bağlamına duyarlı olduğunu gösteriyor; gerçek ölçüm için gerçek server (getTranslations + tam mesaj kataloğu) şart, izole birim test yeter değil. Bu yüzden kart "hangisi olduğunu SEN ölç" diyordu — ölçüldü, anahtar-yolu davranışı doğru olan.

### (c) Düzeltme + repo geneli tarama
`src/app/[locale]/page.tsx` ve `src/app/[locale]/pricing/page.tsx`'e `PRODUCT_NAME` (`@/lib/brand`) import edilip `t('metaTitle', { brand: PRODUCT_NAME })` / `t('metaDescription', { brand: PRODUCT_NAME })` olarak düzeltildi. Düzeltme sonrası aynı curl:
```
<title>FonBridge — AI-Powered EU Funding Platform for Horizon Europe &amp; Eurostars</title>
<meta name="description" content="FonBridge: End-to-end platform for EU research proposals. ..."/>
<title>Pricing — FonBridge AI-Powered EU Funding Platform</title>
```
TR locale'de de doğrulandı (`/tr`, `/tr/pricing` → başlıklar doğru "FonBridge" ile geliyor).

**Repo geneli tarama** (`messages/en.json` içindeki tüm `{var}` yer tutucusu taşıyan 119 anahtar çıkarıldı, en riskli sınıf olan 26 `{brand}` anahtarı tek tek çağrı yerleriyle eşleştirildi). Bulunan 4 EK gerçek bug, hepsi düzeltildi:

| Dosya | Anahtar | Sorun | Görünürlük |
|---|---|---|---|
| `src/app/[locale]/(app)/[workspace]/dashboard/page.tsx:22` | `Dashboard.metaDescription` | `t('metaDescription')` — brand yok | meta description (sayfa `noindex` ama yine de bozuk) |
| `src/lib/modules/guard.tsx:61` | `ModuleGate.askAdmin` | `t('askAdmin')` — brand yok | **ekranda görünen metin** (modül kapalıyken kullanıcının gördüğü uyarı) |
| `src/lib/modules/guard.tsx:53-59` | `ModuleGate.reason.DEV_INTERNAL_ONLY` | dinamik anahtar çağrısı `module`+`plans` geçiyor ama `brand` geçmiyor | **ekranda görünen metin** — en ciddisi: `DEV_INTERNAL_ONLY` durumunda kullanıcı `ModuleGate.reason.DEV_INTERNAL_ONLY` yazısını görürdü |
| `src/app/[locale]/admin/billing/client.tsx:406` | `billingPanels.admin.ssoAcsPlaceholder` | `t('ssoAcsPlaceholder')` — brand yok | input placeholder metni |

Hepsi `PRODUCT_NAME` import edilip `{ brand: PRODUCT_NAME }` eklenerek düzeltildi. `createTranslator` ile 4'ü de tekrar ölçüldü, `onError` sayacı **0** (ham çıktı):
```
askAdmin: If you need access, talk to your workspace administrator or the FonBridge team.
reason.DEV_INTERNAL_ONLY: The M9 module is in development and is open to the FonBridge team only.
ssoAcsPlaceholder: e.g. https://FonBridge.app/api/auth/saml/acs
metaDescription: FonBridge pipeline KPI dashboard — proposal count, above-threshold rate, hit rate and time to G2 on one screen.
Total formatting errors: 0
```
TR karşılıkları da aynı yapıya sahip olduğu doğrulandı (`messages/tr.json` içinde aynı 4 anahtar `{brand}`/`{module}` taşıyor).

**KAPANMADI:** Yok — taranan 119 placeholder-taşıyan anahtarın geri kalanı (count, date, id, tenant, module, org gibi çalışma-zamanı değerleri) örnek çağrı yerlerinde zaten değer alıyordu; `DocumentExport.*` ve `invoice.linePeriodFallback` next-intl'i hiç kullanmıyor — `src/lib/document-exporter.ts` / `src/lib/efatura.ts` kendi `labels()`+`withBrand()` (`.replaceAll('{brand}', PRODUCT_NAME)`) mekanizmasıyla senkron olarak dolduruyor, doğru çalışıyor, dokunulmadı.

### (d) Kalıcı kapı — `scripts/i18n-check.ts`'e Check 5 eklendi
`pnpm i18n:check` içine **5. kontrol** eklendi: `messages/{tr,en}.json`'da basit `{var}` interpolasyonu taşıyan her anahtar için, kaynak kodda o anahtarı çağıran `t('key')` (template-literal olmayan, sabit string) çağrısı **hiç ikinci argüman almıyorsa** kapı KIRMIZI olur ve tam olarak hangi dosya/satır/eksik değişken(ler) olduğunu basar.

Kapının gerçekten çalıştığını kanıtlamak için `page.tsx`'teki düzeltmeyi geçici olarak geri aldım:
```
❌ Placeholder key called with no value — next-intl will render the key path, not the message (1):
   - src/app/[locale]/page.tsx:18  landing.metaTitle  needs { brand }
```
sonra geri getirdim, kapı tekrar yeşile döndü. Bugünkü tam repo taramasında **0 ihlal**.

**Bilinen sınır (dürüstçe):** Bu kontrol yalnız "hiç ikinci argüman yok" durumunu yakalar — `ModuleGate.reason.DEV_INTERNAL_ONLY` gibi ikinci argüman VAR ama içindeki anahtarlardan biri (brand) eksik olan durumu yakalamaz; bunun için çağrının geçtiği obje literalinin gerçek anahtarlarını mesajın ihtiyaç duyduğu değişkenlerle eşleştirmek gerekir (daha ağır bir statik analiz, gerçek bir parser ister). Ayrıca yalnız basit `{var}` interpolasyonunu tanır; ICU plural/select (`{count, plural, ...}`) biçimlerini bilerek dışarıda bırakır (bir literal `{` ile ICU sözdizimini ayırt etmek gerçek ICU parse'ı ister, günün birinde yanlış-pozitif riskini almamak için erteledim). Template-literal (dinamik) anahtarlar da kapsam dışı — onlar zaten check 3'ün (dynamic key shape) alanı.

### (e) TASK-MTVTN2KSTA0TW — typecheck 2 → 0
`tests/e2e/document-export-tenant-isolation.spec.ts:70-71` — `noUncheckedIndexedAccess` altında `matchAll` capture group'ları (`body`, `run`) `string | undefined` tipleniyor (regex her zaman bu grubu yakalasa da TS bunu bilemiyor). `!`/`as` ile susturmak yerine gerçek bir `undefined` kontrolü eklendi (asla tetiklenmeyecek ama testin ANLAMINI değiştirmeyen, tip-güvenli bir dal):
```ts
return [...xml.matchAll(/<w:p(?:\s[^>]*)?>([\s\S]*?)<\/w:p>/g)].map(([, body]) => {
  if (body === undefined) return '';
  return [...body.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)]
    .map(([, run]) => (run === undefined ? '' : unescapeXml(run)))
    .join('');
});
```

## 2. Kanıt (ham çıktı)

```
$ pnpm typecheck
$ tsc --noEmit
(exit 0, hiçbir satır yok)

$ pnpm lint
$ eslint
(exit 0, hiçbir satır yok)

$ pnpm test
 Test Files  160 passed | 2 skipped (162)
      Tests  1890 passed | 8 skipped (1898)

$ pnpm i18n:check
✅ i18n check passed: both catalogs agree, every key used in src/ resolves, and no file gained hard-coded text.
```

**Not — dikkat çekilmesi gereken geçici anomali:** `pnpm test`'in İLK çalıştırmasında (bu görev üzerindeyken) 3 test kırmızıydı, hepsi `src/app/api/concept-notes/[id]/export/route.test.ts` ve `src/modules/m2/server/templates.ts` içindeydi — `assertTenantScope` mock'ta yoktu. `git status` bu dosyaların BENİM dokunmadığım, paralel çalışan başka bir ajanın (ConceptTemplate/M2 görevi — aynı görev partisinin (b) parçası, farklı bir ajana atanmış) o anda üzerinde çalıştığı, henüz commit edilmemiş dosyalar olduğunu gösterdi (`git status --short`: `M src/modules/m2/server/actions.ts`, `?? src/modules/m2/server/templates.ts` vb.). İkinci çalıştırmada aynı 3 test yeşildi (160/162 dosya). Bu benim değişikliklerimle **alakasız** — dosyaya dokunmadım, kapsam dışı bıraktım.

## 3. Değişen dosyalar
- `src/app/[locale]/page.tsx` — landing metaTitle/metaDescription `{brand}` fix
- `src/app/[locale]/pricing/page.tsx` — pricing metaTitle/metaDescription `{brand}` fix + import
- `src/app/[locale]/(app)/[workspace]/dashboard/page.tsx` — Dashboard.metaDescription `{brand}` fix
- `src/lib/modules/guard.tsx` — ModuleGate.askAdmin + reason.DEV_INTERNAL_ONLY `{brand}` fix + import
- `src/app/[locale]/admin/billing/client.tsx` — ssoAcsPlaceholder `{brand}` fix + import
- `scripts/i18n-check.ts` — yeni Check 5 (placeholder-bearing key çağrı denetimi)
- `tests/e2e/document-export-tenant-isolation.spec.ts` — TS18048/TS2345 tip-güvenli düzeltme (nUIA borcu, `!`/`as` kullanılmadı)

## 4. Riskler
- Check 5'in bilinen sınırı (kısmi eksik parametre, ICU plural/select) yukarıda açıkça yazıldı — bir sonraki geliştirici bunu tam kapsamlı sanmamalı.
- `withBrand()`/`document-exporter.ts` yolu next-intl dışı; bu görev onu değiştirmedi ama i18n-check'in kapsamına da girmiyor (namespace hiç `useTranslations`/`getTranslations` ile çağrılmıyor) — gelecekte biri o dosyaya yeni bir `{var}` eklerse Check 5 bunu GÖRMEZ, çünkü tarama yalnız `t()` çağrılarını izliyor.

## 5. Açık sorular
Yok.

## 6. Sonraki adım
- Check 5'i "kısmi eksik parametre" durumunu da yakalayacak şekilde genişletmek (obje literalinin anahtarlarını mesajın ihtiyaç duyduğu değişkenlerle karşılaştırma) — bugünkü kapsamda değildi, gelecekte ayrı bir görev olabilir.
- `pnpm i18n:check --update-baseline` bu görevde ÇALIŞTIRILMADI (hardcoded-literal baseline'ı bu görev değiştirmedi, 325/325 sabit kaldı).

## Platform beyanı
**mac (Darwin 25.6.0)** üzerinde doğrulandı — `pnpm dev` (Next.js 16.3.4 Turbopack, port 3001), gerçek `curl` ile HTML `<title>`/`<meta description>` okundu; `pnpm lint/typecheck/test/i18n:check` mac'te çalıştırıldı. Dokunulan kod platforma bağlı değil (saf React/Next.js server components + next-intl + bir Node regex script'i, süreç/dosya-yolu/kabuk/DPI/mikrofon-kamera gibi platforma özgü hiçbir şey yok) — Windows/Linux'ta davranış farkı beklenmiyor.
