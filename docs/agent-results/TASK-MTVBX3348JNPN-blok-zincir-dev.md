# TASK-MTVBX3348JNPN — Test süiti KIRMIZI: marka dönüşünün kalan üç kırığı

**Ajan:** sec-en (rapor dosyası adı kart metninde verildiği gibi) · **Tip:** bug (test tarafı) ·
**Platform:** macOS (darwin 25.6.0, Node/pnpm, vitest) · **Baz:** `dc545d0`

## 1. Ne yapıldı

Üç kırık testin tamamı **test tarafındaydı**; ürün kodu doğru markayı basıyordu. `src/` altında
hiçbir dosyaya dokunulmadı (mutasyon sondası dışında — o da geri alındı, `git diff` ile kanıtlı).

### (a) `tests/brand-surfaces-render.test.tsx` — iki test
Muhafız "Fabrika" döneminde yazıldı: o gün canlı ad `Fabrika`, emekli ad `FonBridge`'di ve satır
`not.toContain('FonBridge')` **emekli markayı** koruyordu. 2026-09-10'da adlar yer değiştirince
literal olduğu yerde kaldı ve artık canlı markayı yasaklıyordu — testin adı ("renders the product
name") ile iddiası çelişiyordu.

`git log -p --follow tests/brand-surfaces-render.test.tsx` tek commit gösteriyor (`aa4341f`,
2026-09-08): dosya doğduğu andan beri bu biçimde, yani niyet **"emekli ad sızmasın"**. Düzeltme o
niyeti korudu, muhafızı silmedi:

- `not.toContain('FonBridge')` → `not.toContain(RETIRED_BRAND)` (`RETIRED_BRAND = 'Fabrika'`)
- `toContain(PRODUCT_NAME)` zaten satır 38'de vardı ve `@/lib/brand`'ten import ediliyordu — dokunulmadı.

`RETIRED_BRAND` deponun yerleşik biçimi: `tests/retired-brand-name.test.ts:25` aynı sabiti
`RETIRED = 'Fabrika'` olarak tutuyor. Emekli ad bilinçli olarak **literal**: o bir tarih kaydı,
`PRODUCT_NAME`'i izlemesi gereken bir değer değil.

### (b) `tests/document-exporter.test.ts` — bir test
Beklenen dize `Fabrika'da` literalini gömüyordu. Literal yerine deponun kendi mekanizması
kullanıldı — `withBrand()` (`src/lib/brand.ts`, senkron/non-React çağıranlar için tam da bu amaçla
export edilmiş; exporter'ın kendisi `document-exporter.ts:164`'te aynı fonksiyonu çağırıyor):

```ts
expect(generatePdfHtml(draft)).toContain(
  withBrand("Bu belge Küçük Danışmanlık Ltd. tarafından {brand}'da hazırlanmıştır.")
);
```

Türkçe ek (`'da`) böylece testte yeniden yazılmıyor: yer tutucu ve ek `messages/tr.json`
(`DocumentExport.provenanceNotice`) içinde kalıyor, test yalnız cümleyi sabitliyor. İngilizce
beklenti de aynı biçimde `{brand}` üzerinden kuruldu.

**Ek olarak** her iki dile `not.toContain(RETIRED_BRAND)` eklendi. Gerekçesi ve maliyeti aşağıda
"Riskler"de açık yazıldı — bu, kartın (iii) maddesindeki mutasyon sondasının bu test için anlamlı
olmasının tek yolu: beklenti `PRODUCT_NAME`'i izlediği için, sonda altında iki taraf birlikte
kayar ve pozitif iddia tek başına YEŞİL kalırdı.

## 2. Kanıt (kopyalanmış çıktı)

### (i) Düzeltme ÖNCESİ — `pnpm test 2>&1 | tail -6`
```
 Test Files  2 failed | 143 passed | 2 skipped (147)
      Tests  3 failed | 1742 passed | 8 skipped (1753)
   Start at  12:48:42
   Duration  9.41s (transform 6.19s, setup 0ms, import 26.24s, tests 42.09s, environment 7.64s)

[ELIFECYCLE] Test failed. See above for more details.
```

### (ii) Düzeltme SONRASI — `pnpm test 2>&1 | tail -6`
```
 Test Files  145 passed | 2 skipped (147)
      Tests  1745 passed | 8 skipped (1753)
   Start at  12:51:15
   Duration  7.09s (transform 6.49s, setup 0ms, import 22.25s, tests 28.01s, environment 5.48s)
```
0 failed. Toplam test sayısı 1742 → 1745: üçü artık koşuyor (sayı artışı yeni test eklendiğinden
değil, kırmızıların yeşile dönmesinden; dosya sayısı 143+2 → 145).

### (iii) ZORUNLU mutasyon sondası
`src/lib/brand.ts:18` geçici olarak `export const PRODUCT_NAME = 'Fabrika';` yapıldı:

```
     × states that no funding body issued the document, in both languages 4ms
     × public footer renders the product name (tr) 40ms
     × public footer renders the product name (en) 6ms
 FAIL  tests/brand-surfaces-render.test.tsx > brand surfaces > public footer renders the product name (tr)
AssertionError: expected '© 2026 Fabrika (Fabrika SaaS). Tüm ha…' not to contain 'Fabrika'
 FAIL  tests/brand-surfaces-render.test.tsx > brand surfaces > public footer renders the product name (en)
AssertionError: expected '© 2026 Fabrika (Fabrika SaaS). All ri…' not to contain 'Fabrika'
 FAIL  tests/document-exporter.test.ts > document provenance > states that no funding body issued the document, in both languages
AssertionError: expected '<!DOCTYPE html>\n<html lang="tr">\n<h…' not to contain 'Fabrika'
 Test Files  2 failed (2)
      Tests  3 failed | 14 passed (17)
```

Üçü de KIRMIZI ve **doğru sebeple**: emekli markanın kullanıcıya giden yüzeye sızması. Rastlantısal
bir literal uyuşmazlığı değil — muhafız gerçekten marka sızmasını yakalıyor.

Geri alma doğrulandı:
```
$ git diff --stat src/lib/brand.ts
brand.ts diff (empty above = restored)
$ grep -n "export const PRODUCT_NAME" src/lib/brand.ts
18:export const PRODUCT_NAME = 'FonBridge';
$ pnpm vitest run tests/brand-surfaces-render.test.tsx tests/document-exporter.test.ts
 Test Files  2 passed (2)
      Tests  17 passed (17)
```

### (iv) `pnpm lint && pnpm typecheck`
```
$ eslint
=== TYPECHECK ===
$ tsc --noEmit
```
İkisi de çıktısız → TEMİZ (görev öncesi de temizdi, temiz kaldı).

## 3. Değişen dosyalar
- `tests/brand-surfaces-render.test.tsx` — `RETIRED_BRAND` sabiti + gerekçe yorumu; satır 41'deki
  literal muhafız emekli adı gösterecek biçimde çevrildi.
- `tests/document-exporter.test.ts` — `withBrand` import'u; provenance beklentileri `{brand}`
  üzerinden kuruldu (tr + en); iki dile emekli-marka muhafızı eklendi.

Ürün kodu (`src/**`, `messages/**`) DEĞİŞMEDİ.

## 4. Riskler
- **Bilinçli örtüşme:** `expect(html).not.toContain(RETIRED_BRAND)` iddiası
  `tests/retired-brand-name.test.ts:107` ile aynı şeyi ölçüyor. Bir satırlık tekrar kabul edildi;
  karşılığında bu testin kendisi mutasyon sondasında ayağa kalkıyor ve müşteriye giden belgenin
  altbilgisi — `src/lib/brand.ts` docblock'unun "en kötü sızıntı yeri" dediği yüzey — kendi
  dosyasında da korunmuş oluyor. Tek kaynağa indirilmek istenirse doğru yer `src/lib/brand.ts`'ten
  bir `RETIRED_PRODUCT_NAME` export'udur; bu kartın kapsamı "ürün kodunu değiştirme" dediği için
  yapılmadı.
- `RETIRED_BRAND` iki test dosyasında + `retired-brand-name.test.ts`'te `RETIRED` adıyla, toplam üç
  yerde literal. Marka bir daha dönerse (FonBridge → X) bu üç satır elle güncellenmeli. Kasıtlı:
  emekli adlar birikimli bir listedir, tek bir değişkenin izlediği değer değil.
- `tests/document-exporter.test.ts` içindeki diğer testler `tenantName: 'Fabrika Teknoloji A.Ş.'`
  kullanıyor — bu bir KİRACI adı, marka değil; yeni muhafız yalnız `Küçük Danışmanlık Ltd.` taslağı
  üzerinde çalıştığı için çakışmıyor. Ancak ileride o taslaklara muhafız eklenirse bu fixture adı
  yanlış alarm üretir.

## 5. Açık sorular
- `messages/tr.json` `{brand}'da` ekini sabitliyor. `FonBridge` için ünlü uyumu tartışmalı
  ("FonBridge'de" mi?); şu an `'da`. Marka/dil kararı — kapsam dışı bırakıldı, ürün sahibine ait.
- `tests/retired-brand-name.test.ts:36` `HISTORICAL_RECORD` listesi 20 dosya sayıyor; bu kart
  kapsamında doğrulanmadı, listenin hâlâ eksiksiz olup olmadığı ayrı bir iş.

## 6. Sonraki adım
Yeşil süite karşı `pnpm gate`'in kalanı (e2e + rls:check + rls:verify) ayrı bir kartta koşulmalı —
bu kart yalnız `test`/`lint`/`typecheck` kapsıyordu.

## Platform beyanı
macOS (darwin 25.6.0) üzerinde doğrulandı: `pnpm test`, `pnpm vitest run`, `pnpm lint`,
`pnpm typecheck`. Windows/Linux **koşulmadı** — gerekmiyor: değişiklik iki test dosyasında saf
string/JSX iddiasından ibaret; süreç öldürme, dosya yolu, kabuk/ikili adı, DPI ya da cihaz izni
içeren tek bir kod yolu yok. `withBrand`/`PRODUCT_NAME` saf JS; `jsdom` ve `vitest` platformdan
bağımsız çalışır, dolayısıyla diğer platformlarda da aynı sonucu verir.
