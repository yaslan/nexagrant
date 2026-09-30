# TASK-MUNUT64LZHQY7 — fe-fb — İNCELEME-71: be-fb sayfa hataları düzeltmesi (TASK-MUNRB2037NA5V)

**Durum: TAMAM**
**Karar: ONAY.** Üç düzeltme de amaçladığı işi yapıyor ve regresyon bulunmadı. Düzeltmeden bağımsız ama artık görünür hale gelen 2 ORTA bulgu için ayrı kart öneriyorum (B-1, B-2). Merge'ü engellemiyorlar.

İncelenen commit: `fbc3de1b` (merge `8089aa27`), dev HEAD `75f093d5`. Çalışma ortamı: ayrı worktree (scratchpad, detached dev), kendi izole DB'm `fefb-71-pg` (pgvector:pg16, 127.0.0.1:55571). DB şu sırayla kuruldu: `db push` → `db:rls-role` → `apply-migrations.sh` ×2 (39 dosya, ikisi de exit 0) → `db:rls` (28 → 112) → `db:seed`. Paylaşılan :5433'e ne okuma ne yazma yapıldı. Kod değiştirilmedi. Yalnız bu rapor ve kareler commit'lendi.

**Platform:** yalnız macOS'ta doğrulandı (Darwin 27, Node 26.5, `next build` + `next start`, sistem Chrome'u headless, Playwright). İncelenen kod platformdan bağımsız: bir rota render modu, bir Next görsel izin deseni ve saf bir TS yardımcısı. Süreç, dosya yolu, kabuk ya da DPI kodu yok, bu yüzden Linux/Windows'ta farklı davranış beklenmiyor. Linux/Windows koşulamadı, çünkü bu makinede o ortamlar yok.

## 1. Ne yapıldı / bulgular

### Ö-2 `calls/[region]` → force-dynamic: DOĞRU
- 6 region URL'i tr/en 200 dönüyor. CSP nonce'u her istekte farklı ve HTML'deki bütün `<script>` etiketleri başlıktaki nonce'u taşıyor (28/28). `DYNAMIC_SERVER_USAGE` sayısı 0.
- Bilinmeyen region (`eu`, `atlantis`, `GERMANY`, `germany%2F`) 404 dönüyor, 500 değil. 404 sayfası da nonce'lu (19/19) ve `robots noindex` taşıyor.
- **SEO/performans etkisi:** kabul edilebilir. Tam SSR HTML dönüyor, canonical ve og:url mutlak (`https://fonbridge.com/tr/calls/germany`). TTFB p50 0,017 s (10 istek); diğer ƒ sayfalarla aynı (turkey 0,020 s, pricing 0,019 s). Sorgu `Topic_nextDeadlineAt_idx` ile 0,09 ms sürüyor. `Cache-Control: private, no-store` diğer bütün sayfalarla aynı; nonce-CSP zaten CDN önbelleğine izin vermiyor. Sitemap yok, yani kaybedilen bir ön-render yok.
- **MB eşdeğer mutant:** `export const dynamic` satırı silinince rota yine ƒ oluyor ve 200 + nonce dönüyor, çünkü kök layout'un `cookies()` çağrısı rotayı zaten dinamik yapıyor. Yani `force-dynamic` işlevsel olarak fazladan, ama niyeti belgelediği ve bir sonraki SSG girişimine karşı açık bir işaret olduğu için kalmalı.

### Ö-3 concept-note seed şablonu: DOĞRU. Kenar durumlarında 1 DÜŞÜK bulgu (B-3)
Gerçek tarayıcı, en locale, oturum alice. Her notta editöre gerçekten tıklandı ve "Hello fefb71 words" klavyeyle yazıldı:

| Şablon şeması | Sonuç |
|---|---|
| seed dizisi (`cetp_pre`) | 200 · h2 "Excellence" · sayaç 3/1000 · hata yok |
| `{sections:[alpha,beta]}` | 200 · h2 "Alpha Section" · 3/50 · hata yok |
| `"oops"` (string) | 200 · varsayılan 3 bölüm · 3/1000 |
| `{sections:[]}` | 200 · varsayılan 3 bölüm |
| şablon yok (`no-such-template`) | 200 · h1 "Concept Note" · varsayılan |
| `[null]` | **500** · "Bir Hata Oluştu" · `TypeError: Cannot read properties of null (reading 'key')` |
| `[1,"x",{}]` | 200, ama editör **boş**; 3 sekmenin hepsi "0/ words" |

### Ö-5 Google avatarı: DOĞRU
Alice'e lh3 avatarı verildi; UserMenu'deki iki `<img>` de `/_next/image?url=https%3A%2F%2Flh3…` üzerinden yüklendi (`complete && naturalWidth=32`). Kare: `avatar-lh3.png`.

`/_next/image` host matrisi:

| url | yanıt |
|---|---|
| `https://lh3…/a/default-user=s96-c` | 200 image/png |
| aynısı büyük harfle (`LH3.GOOGLEUSERCONTENT.COM`) | 200 (host normalize ediliyor) |
| `http://lh3…` | 400 not allowed |
| `lh4.` · `evil.lh3.` · `lh3-googleusercontent.com` · `lh3….com.evil.example` · `%2F@evil` | 400 not allowed |
| `//lh3…` | 400 protocol-relative |
| `https://evil.example.com/x.png` | 400 |
| `https://lh3…:8443/a/x` | **504 upstream timed out** (izin verildi; bkz. B-5) |
| `https://user@lh3…` | 500 (Next'in kendi `Request` hatası; bu değişiklikten bağımsız) |

### Bulgular

- **B-1 (ORTA, önceden vardı, düzeltmenin ardından görünür oldu):** `REGIONS[region]` sıradan bir nesne üzerinde arama yapıyor. Bu yüzden prototip anahtarları geçerli region sayılıyor:
  - `/tr/calls/constructor` → **200**, h1 ve title "Object — FonBridge"
  - `/tr/calls/toString` ve `hasOwnProperty` → 200
  - `/tr/calls/__proto__` → 200, h1 boş

  Bu sayfalar indexlenebilir canonical'a sahip (soft-404). Eskiden bunlar da 500'dü. Düzeltme: sayfada ve `generateMetadata`'da `Object.hasOwn(REGIONS, region)` kullanmak, ya da `Map` kullanmak.
- **B-2 (ORTA, önceden vardı; be-fb'nin 2. açık sorusu):** Herkese açık `/tr/calls` listesindeki **her kart** `/tr/calls/<topic.identifier>` adresine gidiyor. Bu adres `[region]` rotasına düşüyor ve 404 dönüyor. Ölçülen: `HORIZON-CL5-2026-D4-01` → 404, `HORIZON-CL2-2026-D1-01` → 404. Kullanıcının tıklayacağı ana akış bu, bu yüzden ayrı kart gerekiyor.
- **B-3 (DÜŞÜK):** `templateSections` dizinin elemanlarını doğrulamıyor. `[null]` şeması 500 hata sayfası veriyor, geçersiz elemanlar ise boş bir editör açıyor. Şablon yazan bir API yok (şablonlar yalnız seed/DB'den geliyor), bu yüzden etkisi düşük. Öneri: dizi `key: string` ve `maxWords: number` alanlarına göre filtrelensin, kalan boşsa varsayılana düşülsün. Ek olarak `src/modules/m2/types.ts:12` yorumu hâlâ yalnız `{ sections }` biçiminden söz ediyor; eski kaldı.
- **B-4 (DÜŞÜK, test kör noktası):** `tests/no-ssg-under-dynamic-root.test.ts` yalnız `generateStaticParams`'a bakıyor. Hayatta kalan mutantlar:
  - **MA** `dynamic = 'force-static'`: 8/8 test geçti. Build'de rota ○. Yayında `Cache-Control: s-maxage=31536000`, yani "açık, son tarihi geçmemiş" listesi CDN'de bir yıl donar.
  - **MF** `revalidate = 3600`: 8/8 geçti.

  Öneri: bekçi `force-static` / `error` değerli `dynamic` export'larını ve `revalidate > 0` değerlerini de reddetsin.
- **B-5 (DÜŞÜK):** `remotePatterns` girdilerinde `port` belirtilmemiş, bu da "her port" demek. `lh3…:8443` optimizer'a kabul edildi ve 504'e kadar upstream beklendi. Unsplash girdisinde de aynı durum var. Öneri: iki girdiye de `port: ''` eklensin. **MG** mutantı (lh3 için protokolsüz, `port:'8080'` ek girdi) 8/8 geçti.
- **B-6 (bilgi, önceden vardı):** Region sayfası listeyi region'a göre filtrelemiyor. germany, france ve constructor sayfalarındaki 18 kart birebir aynı (h3 md5 `a85f565e…`); yani 10 URL'de yinelenen içerik var. `/en/calls/germany` sayfasında h1 ve title Türkçe ("Almanya — FonBridge"). Bu sayfa hataları kartının kapsamı dışında.

## 2. Kanıt

```
next build (temiz dev)  EXIT=0 · "├ ƒ /[locale]/calls/[region]" · ● satırı 0
tsc --noEmit            EXIT 0
eslint                  EXIT 0
i18n:check              EXIT 0  ✅ i18n check passed: both catalogs agree, …
npx vitest run          EXIT 0  Test Files 265 passed | 6 skipped (271) · Tests 3170 passed | 73 skipped (3243)
```
Region yoklaması (`next start -p 47171`, izole DB):
```
tr/calls/germany 200 nonce-nh0UulF06ImvhdFciabNhw== scripts=28 nonced=28 h1=[Almanya] | Cache-Control: private, no-cache, no-store, max-age=0, must-revalidate
en/calls/germany 200 nonce-eCAz8ykoUij089VbwDm4fg== scripts=28 nonced=28
tr/calls/france 200 … 28/28 · en/calls/france 200 … 28/28 · tr/calls/belgium 200 … 28/28 · en/calls/italy 200 … 28/28
tr/calls/turkey 200 … 46/46 · en/calls/turkey 200 … 46/46
tr/calls/eu 404 … 19/19 (<meta name="robots" content="noindex"/>) · en/calls/atlantis 404 · tr/calls/GERMANY 404 · tr/calls/germany%2F 404
tr/calls/constructor 200 h1=[Object] <title>Object — FonBridge</title> <link rel="canonical" href="https://fonbridge.com/tr/calls/constructor"/>
tr/calls/__proto__ 200 h1=[ ] · tr/calls/toString 200 h1=[toString] · tr/calls/hasOwnProperty 200
tr/calls → kart linkleri /tr/calls/HORIZON-CL5-2026-D4-01 404, /tr/calls/HORIZON-CL2-2026-D1-01 404
TTFB (10 istek): tr/calls/germany p50=0.017s max=0.021s · tr/calls/turkey p50=0.020s · tr/pricing p50=0.019s
EXPLAIN: Execution Time: 0.094 ms (Topic_nextDeadlineAt_idx)
```
Tarayıcı çıktısı (`fefb71-walk.mjs`, Chrome headless 1280×900):
```
{"n":"arr","status":200,"h1":"CETPartnership Pre-proposal","typed":"h2=Excellence Words: 3/1000","errs":[]}
{"n":"obj","status":200,"h1":"FEFB71 Obj Template","typed":"h2=Alpha Section Words: 3/50","errs":[]}
{"n":"null","status":500,"h1":"Bir Hata Oluştu","errs":["…TypeError: Cannot read properties of null (reading 'key')…"]}
{"n":"junk","status":200,"h1":"FEFB71 Junk","typed":"h2=- ","errs":[]}
{"n":"str"|"empty"|"notpl", "status":200, "typed":"h2=Excellence & Innovation Words: 3/1000","errs":[]}
{"avatar":[{"src":"…/_next/image?url=https%3A%2F%2Flh3.googleusercontent.com%2Fa%2Fdefault-user%3Ds96-c&w=32&q=75","ok":true,"w":32}, {…aynı…}]}
```
Kareler: `docs/agent-results/TASK-MUNUT64LZHQY7-fe-fb/`, dosyalar: `note-arr.png`, `note-obj.png`, `note-null.png`, `note-junk.png`, `note-str.png`, `note-empty.png`, `note-notpl.png`, `avatar-lh3.png`.

Mutantlar (her biri `git checkout` ile geri alındı; taban 8/8 yeşil):

| # | Mutant | Test | Build/canlı |
|---|---|---|---|
| MA | `dynamic='force-static'` | **8/8 sağ** | ○, 200, `s-maxage=31536000` → B-4 |
| MB | `dynamic` export silindi | 8/8 sağ | ƒ, 200, 28/28 nonce → eşdeğer (zararsız) |
| MC | sayfa `templateSections()`'ı doğrudan çağırıyor | 8/8 sağ | (import eksik; tsc yakalar) |
| ME | `editorSections` varsayılana düşmüyor | ✗ öldü | – |
| MF | `revalidate = 3600` eklendi | **8/8 sağ** | → B-4 |
| MG | lh3 için protokolsüz, `port:'8080'` ek girdi | **8/8 sağ** | → B-5 |
| MH | lh3'e `pathname:'/a/**'` | 8/8 sağ | daraltma (güvenli yönde); öneri değil, eski `/-…` avatar yollarını kırar |
| MI | dizi biçimi ilk elemana kırpıldı | ✗ öldü | – |

## 3. Değişen dosyalar
- `docs/agent-results/TASK-MUNUT64LZHQY7-fe-fb.md` (bu rapor) ve `docs/agent-results/TASK-MUNUT64LZHQY7-fe-fb/*.png` (8 kare). Kod değişmedi.

## 4. Riskler
- B-1 ve B-2 düzeltmeden önce de vardı; düzeltme 500'ü kaldırdığı için görünür oldular. İkisi de herkese açık sayfalarda ve SEO'ya açık.
- MA/MF'e karşı test koruması yok. Birisi "SEO için statik yapalım" derse testler yeşil kalır.

## 5. Açık sorular
- B-2: `/calls` kartları nereye gitmeli, `/[locale]/[workspace]/calls/[id]` (giriş ister) mi, yoksa herkese açık bir detay sayfası mı? Bu bir ürün kararı.
- Görev metnindeki "KANIT ZORUNLU" satırı sonucun `/Users/macbook/alan/docs/agent-results/TASK-MUN80T8IVTPM7-fe-fb-inceleme57.md` yoluna yazılmasını istiyor. Bu yol İNCELEME-57'nin eski rapor adı ve repo dışında. Orada dosya yoktu, bu yüzden oraya yalnız bu rapora işaret eden kısa bir yönlendirme bıraktım. Asıl rapor kartın verdiği repo içi yolda.

## 6. Sonraki adım
- B-1 + B-2 için tek bir kart (herkese açık calls rotaları: `Object.hasOwn` ve kart linkleri) önerilir. B-3, B-4 ve B-5 aynı karta ya da düşük öncelikli ayrı bir karta konabilir.
- İzole konteyner `fefb-71-pg` ve worktree iş sonunda kaldırıldı.
