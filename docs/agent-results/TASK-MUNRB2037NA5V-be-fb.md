# TASK-MUNRB2037NA5V — be-fb — İNCELEME-57 Ö-2 / Ö-3 / Ö-5 sayfa hataları

**Durum: TAMAM**
Dal: `be-fb/munrb2-page-errors` (kendi worktree'm, dev `701706ef`'ten; dev `618dc024` ile birleştirildi) · düzeltme commit'i `fbc3de1b`.
İzole DB: kendi konteynerim `befb-rb2-pg` (pgvector:pg16, 127.0.0.1:55493). Kurulum: `db push` → `db:rls-role` → `apply-migrations.sh` ×2 (ikisi de exit 0) → `db:rls` (28 → 112 politika) → `db:seed`. Paylaşılan `fabrika-postgres` (:5433) konteynerine yazılmadı. Oradan yalnız bir okuma yapıldı: gerçek Google avatarı var mı diye sayım (sonuç 0).
**Platform:** yalnız macOS'ta doğrulandı (Darwin 27, Node 26.5, `next build` + `next start`, sistem Chrome'u headless). Değişikliklerin hiçbiri platforma bağlı değil: bir rota render modu, bir Next görsel izin deseni ve saf bir TS yardımcısı. Süreç, dosya yolu ya da kabuk kodu yok, bu yüzden Linux ve Windows'ta farklı davranış beklenmez. Linux/Windows'ta koşulamadı, çünkü bu makinede o ortamlar yok.

## 1. Ne yapıldı

### Ö-2: `/[locale]/calls/[region]` 500 `DYNAMIC_SERVER_USAGE`
**Kök neden.** Rota `generateStaticParams` export ediyordu, ama yalnız `{ region }` dönüyordu, `locale` yoktu. Build bu yüzden hiçbir yolu önceden üretmedi; rota yine de ● (SSG) olarak işaretlendi. Sonuçta her region URL'i ilk istekte **statik sayfa olarak** render ediliyordu. Kök layout (`src/app/layout.tsx`, `resolveTheme`) ise her istekte `cookies()` ve `headers()` okuyor. Statik render içinde bu çağrılar `DYNAMIC_SERVER_USAGE` fırlatıyor ve sayfa 500 dönüyor. `/tr/calls/turkey` 200 dönüyordu, çünkü ayrı bir statik klasörü (`calls/turkey/`) var ve o ƒ.

**Karar: rota açıkça dinamik yapıldı.** `generateStaticParams` kaldırıldı, yerine `export const dynamic = 'force-dynamic'` kondu (`pricing`, `municipal-calls` ve admin sayfalarıyla aynı desen). Statik kalma seçeneği şu üç nedenle doğru değil:
1. src/proxy.ts'in CSP nonce'u her istekte değişiyor, ve Next bu nonce'u script etiketlerine yalnız dinamik render sırasında basıyor. Statik HTML'de nonce olmaz, `strict-dynamic` politikası da script'leri engeller.
2. Kök layout'taki tema okuması (`cookies`/`headers`) bütün uygulama için geçerli. Onu kaldırmak bu kartın kapsamı dışında.
3. Liste canlı veri gösteriyor (`status OPEN`, `nextDeadlineAt > now`). Build anında dondurulmuş bir liste yanlış olur.

### Ö-3: `concept-notes/[id]` seed şablonlarında çöküyordu
Sayfa `template.schema`'yı `{ sections }` biçimine cast edip `schema.sections` geçiriyordu. Seed şablonlarının yedisi de çıplak dizi (`jsonb_typeof = array`), bu yüzden değer `undefined` oluyordu ve editördeki `sections[0]` fırlatıyordu. `./data.ts`'e `editorSections(template)` eklendi. Bu fonksiyon export route'unun kullandığı `templateSections()` yardımcısını çağırıyor (kopya kod değil) ve iki biçimi de okuyor. Okunabilir bölüm yoksa eski varsayılan üç bölüme düşüyor. Sayfa artık `sections={editorSections(template)}` geçiriyor.

### Ö-5: Google avatarı `/_next/image` 400 dönüyordu
`next.config.ts` `images.remotePatterns` listesine `{ protocol: 'https', hostname: 'lh3.googleusercontent.com' }` eklendi. Desen dar tutuldu: joker yok, http yok. `unoptimized` seçilmedi. Görsel yine `/_next/image` üzerinden, yani `'self'` üzerinden geliyor, bu yüzden CSP `img-src`'ye yeni host eklemek gerekmedi.

### Regresyon testleri (3 yeni dosya, 8 test)
- `tests/no-ssg-under-dynamic-root.test.ts`: kök layout'un `cookies()` okuduğunu (testin öncülü) ve `src/app` altında hiçbir page/layout'un `generateStaticParams` export etmediğini sabitliyor.
- `tests/next-image-remote-patterns.test.ts`: Next'in kendi `hasRemoteMatch` eşleştiricisiyle ölçüyor. Kabul edilmesi gerekenler: lh3 https ve unsplash. Reddedilmesi gerekenler: lh3 http, lh4, `*.googleusercontent.com.example.org` ve rastgele bir host.
- `tests/concept-note-editor-sections.test.ts`: seed dizisi, `{sections}` biçimi, null/boş/tanınmayan şema durumunda varsayılana düşme.

## 2. Kanıt

**Düzeltme ÖNCESİ** (aynı worktree, dev kodu, `next build` EXIT=0 + `next start -p 47993`):
```
Route: ├ ● /[locale]/calls/[region]      (build-before.log; legend: ●  (SSG) prerendered as static HTML (uses generateStaticParams))
/tr/calls/germany 500 csp=nonce-GFqRnkkVP1wU5yHeFnQ7dA== scripts=0 nonced=0
/en/calls/france  500 csp=nonce-kNg/Ov/4jG8TvdhrUFtz6A== scripts=0 nonced=0
/tr/calls/eu      500 csp=nonce-RAgn2BccYXqbUsNSOv6UrQ== scripts=0 nonced=0
/tr/calls/belgium 500 · /en/calls/italy 500
/tr/calls/turkey  200 (ayrı statik klasör)
sunucu logu: [Error: An error occurred in the Server Components render …]  digest: 'DYNAMIC_SERVER_USAGE'
IMG https://lh3.googleusercontent.com/a/… -> 400 "url" parameter is not allowed
```

**Düzeltme SONRASI** (`next build` EXIT=0, `●` satırı 1 → 0, `next start -p 47993`):
```
Route: ├ ƒ /[locale]/calls/[region]
/tr/calls/germany 200 csp=nonce-BsMoYM52Uy8NfzcSnwdN4g== scripts=28 nonced=28 | Cache-Control: private, no-cache, no-store, max-age=0, must-revalidate
/en/calls/france  200 csp=nonce-pfuRCSFfTsRoHt85n/F2vw== scripts=28 nonced=28 | (aynı)
/tr/calls/eu      404 csp=nonce-wuVTh3ZsOquZ342pxENhhw== scripts=19 nonced=19 | (aynı)
/tr/calls/belgium 200 … 28/28 nonced · /en/calls/italy 200 … 28/28 nonced · /tr/calls/turkey 200 … 46/46 nonced
DYNAMIC_SERVER_USAGE in start log: 0
content-security-policy: default-src 'self'; script-src 'self' 'nonce-pmZJ+3BifJI8lx4JZWDFRg==' 'strict-dynamic'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://images.unsplash.c…
```
`/tr/calls/eu` → **404, 200 değil, bilinçli olarak.** `eu`, `REGIONS` tablosunda yok (turkey, germany, belgium, france, italy), ve sayfa tanımsız region için `notFound()` çağırıyor. Önceki 500 bu `notFound()`'a hiç ulaşılamamasından geliyordu. Artık doğru cevap dönüyor ve 404 sayfası da nonce'lu (19/19). Kartta "3 region URL'i 200" yazıyor, ama `eu` bir region değil. Bkz. Açık sorular.

**Avatar** (düzeltme sonrası):
```
direct                    https://lh3.googleusercontent.com/a/default-user=s96-c → 200 image/png
via /_next/image          200 image/png 400B   (file: PNG image data, 64 x 64)
https://evil.example.com/x.png        -> 400 "url" parameter is not allowed
http://lh3.googleusercontent.com/a/x  -> 400 "url" parameter is not allowed
https://lh4.googleusercontent.com/a/x -> 400 "url" parameter is not allowed
```
Paylaşılan DB'de gerçek bir Google avatarı bulunmadı (`count = 0`). Bu yüzden Google'ın herkese açık varsayılan avatar URL'i kullanıldı. Sahte bir `/a/ACg8oc…` yolu gönderildiğinde yanıt `"url" parameter is valid but upstream response is invalid` oluyor: izin verildiğini gösteriyor, 400 ise upstream'den geliyor.

**Concept note, gerçek tarayıcı** (Chrome headless, 1280×900; oturum `authjs.session-token`, alice@fabrika.test / demo-tenant; izole DB'de `cetp_pre` seed şablonuyla (dizi biçimi) bir not `befb-rb2-note`):
- Düzeltme sonrası: `status 200`, h1 `CETPartnership Pre-proposal`, bölümler `Excellence / Impact / Implementation`. "Impact" sekmesine gerçekten tıklandı ve klavyeyle "Impact metni yazıldı." yazıldı; sayaç 3/1000 gösterdi. `errors: []`. Kare: `docs/agent-results/TASK-MUNRB2037NA5V-be-fb/concept-note-after.png`.
- Mutant M6 (yalnız `page.tsx` dev sürümüne geri alındı, yeniden build): `status 500`, sayfada "Bir Hata Oluştu … Cannot read properties of undefined (reading '0')" yazıyor, sunucu logunda `⨯ TypeError: Cannot read properties of undefined (reading '0')`. Kare: `docs/agent-results/TASK-MUNRB2037NA5V-be-fb/concept-note-m6-before.png`.

**Mutantlar** (commit sonrası uygulandı, her biri `git checkout` ile geri alındı; taban 8/8 yeşil):
| # | Mutant | Sonuç |
|---|--------|-------|
| M1 | `calls/[region]`'a `generateStaticParams` geri kondu | ✗ `none exports generateStaticParams`, 1 failed / 7 passed |
| M2 | `editorSections` yalnız `schema.sections` okuyor | ✗ `reads a seeded template (bare array)` |
| M3 | lh3 deseni silindi | ✗ `lets a Google sign-in's profile picture through` |
| M4 | lh3 deseninden `protocol: 'https'` kaldırıldı | ✗ `refuses plain http, sibling hosts…` |
| M5 | host `**.googleusercontent.com` yapıldı | ✗ `refuses plain http, sibling hosts…` |
| M6 | sayfa çağrı yeri eski haline döndürüldü (build + tarayıcı) | 500 + `TypeError … reading '0'` (yukarıda) |

M6 birim testiyle yakalanmıyor: test yardımcıyı sınıyor, sayfanın o yardımcıyı çağırdığını değil. Çağrı yeri gerçek build ve tarayıcıyla kanıtlandı.

**Kapılar** (worktree, izole DB):
```
tsc --noEmit        EXIT 0   (dev 618dc024 merge'ünden sonra da 0)
pnpm lint           EXIT 0
pnpm i18n:check     EXIT 0   ✅ i18n check passed: both catalogs agree, every key used in src/ resolves, and no file gained hard-coded text.
pnpm build          EXIT 0   (Ecmascript/instrumentation.ts process.exit uyarısı önceden var, build-before.log'da da aynı)
npx vitest run      Test Files 4 failed | 253 passed | 6 skipped (263) · Tests 4 failed | 3049 passed | 109 skipped (3162)
  kırmızı 4: rag-pdf-real-parse (3236ms > 3000), rag-pdf-worker-isolation, withholding-rounding (5 s timeout), billing/invoice-writer (5 s timeout)
  → aynı 4 dosya tek başına: Test Files 4 passed (4) · Tests 67 passed (67); o sırada yük ortalaması 22–38. Bu dosyalara dokunulmadı (git diff dev boş).
merge sonrası: 3 yeni test + accept-invite-headers + security-headers = 30/30
```

## 3. Değişen dosyalar
- `src/app/[locale]/calls/[region]/page.tsx`: `generateStaticParams` → `export const dynamic = 'force-dynamic'`, gerekçesi yorumda.
- `src/app/[locale]/(app)/[workspace]/concept-notes/[id]/data.ts`: `editorSections()` ve `DEFAULT_SECTIONS`, `templateSections` üzerine kurulu.
- `src/app/[locale]/(app)/[workspace]/concept-notes/[id]/page.tsx`: cast ve satır içi varsayılan kaldırıldı, `editorSections(template)` kullanılıyor.
- `next.config.ts`: `remotePatterns`'e lh3 https eklendi.
- `tests/no-ssg-under-dynamic-root.test.ts`, `tests/next-image-remote-patterns.test.ts`, `tests/concept-note-editor-sections.test.ts`: yeni.
- `src/proxy.ts`, `src/lib/security-headers.ts` ve `/api/cagrilar` değişmedi.

## 4. Riskler
- `calls/[region]` artık her istekte DB'ye gidiyor (20 satırlık `take`, `nextDeadlineAt` sıralı). Diğer bütün sayfalar zaten ƒ olduğu için davranış uygulamanın geri kalanıyla aynı. Önbellek gerekirse sayfa değil veri katmanı önbelleklenmeli, çünkü nonce var.
- `DEFAULT_SECTIONS` İngilizce etiketler taşıyor. Bunlar sayfada zaten vardı, yalnız taşındı. i18n kapısı temiz.
- Bir şablonun bölüm dizisi boşsa editör artık boş kalmıyor, varsayılan üç bölümü gösteriyor. Eskiden bu durumda `[]` ile boş editör açılıyordu.

## 5. Açık sorular
1. `/tr/calls/eu` → 404. Bir "AB geneli" region'ı isteniyorsa `REGIONS`'a `eu` eklenmeli; bu bir ürün kararı ve kapsam dışında bırakıldı. Kodda `/calls/eu`'ya giden bir link bulunmadı.
2. Kapsam dışı ama ilgili: `src/app/[locale]/calls/page.tsx:46` `/${locale}/calls/${topic.identifier}` linki veriyor. Bu link `[region]` rotasına düşüyor ve topic kimliği bir region olmadığı için 404 dönüyor (önceden 500'dü). Ayrı bir kart gerekebilir.

## 6. Sonraki adım
- dev'e merge edildi (push yok). İnceleme için: `git show fbc3de1b`.
- İzole konteyner `befb-rb2-pg` ve worktree iş sonunda kaldırıldı.
