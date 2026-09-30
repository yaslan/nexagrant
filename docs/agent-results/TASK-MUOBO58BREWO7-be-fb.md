# TASK-MUOBO58BREWO7 — FB İNCELEME-104 (be-fb): statik dosya harf/yazım varyantları CSP düzeltmesi (TASK-MUOACZNM8GTGU, caa901ab)

**Durum:** TAMAM
**Karar:** **ONAY.** Düzeltme doğru ve performans açısından nötr. İki küçük takip önerim var (Y-1 yorum/gerekçe hatası, D-1 test boşluğu); ikisi de merge'ü bloke etmiyor.
**İncelenen:** dev `5e674e7f` (caa901ab + merge'ü içerir). Taban: dev `c3ba06d2` (düzeltme öncesi). İkisi de ayrı worktree'de, `next build` + `next start` ile, izole DB'ye bağlı (`befb104-pg`, 127.0.0.1:55104) koşuldu. Kod değiştirilmedi; mutantların hepsi geri alındı ve `git status` temiz.

## 1) Ne yapıldı
1. **İzole ortam:** `git worktree add --detach` ile iki worktree açtım (`wt104` = dev, `wt104b` = c3ba06d2), her birinde gerçek `pnpm install` ve `prisma generate` koştum. İzole DB'yi pgvector pg16 konteyneriyle kurdum: `db push` → `db:rls-role` → `apply-migrations` ×2 (41+41) → `db:rls` 28→112 → seed (`db-prep.txt`). Paylaşılan :5433'e dokunmadım.
2. **Matris:** 183 yol denedim: crw-fb'nin 93 yolu, devop-fb'nin 27 ek yolu ve benim 84 yolum (tekrarlar ayıklandı, `paths-befb.txt`). Kendi yollarım şunları kapsıyor: `%2E/%2F/%5F/%6C` kodlaması, harfleri kodlanmış `static`/`image`, çift ve üçlü eğik çizgi, sonda `/`, `.`, `%20`, `%00` ya da `;`, Unicode (`ſ`, `ı`, `İ`, `K`), sorgu dizesi, `/_next/data`, `/_next/webpack-hmr`, `/_vercel/*`, `..` ve `%2e%2e` ile `_next/static` önekinden kaçma denemeleri, `/_next/image` ile harici URL. Curl `--path-as-is` kullandı.
3. **Gerçek varlıklar:** 14 varlık için CSP, Cache-Control ve 304 davranışını ölçtüm: public/, favicon, chunk, css, build manifesti, media ve `/_next/image`. TTFB'yi iki sunucuya sırayla (interleaved) 150'şer istekle ölçtüm.
4. **Tarayıcı:** Chromium headless ile crw-fb'nin `pwned` enjeksiyonunu (`browser.mjs`) 8 yeni varyantta, iki build'de de denedim.
5. **Mutantlar:** devop-fb'nin X2–X4 ve P1–P7 mutantlarını dev HEAD'de yeniden koştum. Buna ek olarak kendi 9 CSP mutantımı (C1–C9) ve 4 Ö-1 mutantımı (S2, S4, S10, S11) iki build'de de koştum.
6. **Kapılar:** tsc, eslint, i18n, build, tam vitest (yerel ve `CI=true`) ve live-skip gate.

## 2) Kanıt
Ekler: `docs/agent-results/TASK-MUOBO58BREWO7-be-fb-ekler/`

**Matris** (`mx-base.tsv`, `mx-yeni.tsv`), 183 yol:
```
taban c3ba06d2: CSP'siz text/html = 19
  crw/devop'un 16'sı + benim 3'üm: /Logo.png?x=1  /_next/Image?url=/logo.png&w=64&q=75  /_NEXT/static/x.js?v=1
yeni  5e674e7f: CSP'siz text/html = 0 · çift CSP = 0 (iki build'de de)
```
Taban ile yeni arasındaki farkların hepsi aynı yönde: satır "CSP yok", `static` ya da `api` iken `nonce` oluyor. `/_Next/yok`, `/_VERCEL/x`, `/_NEXT/image` ve `/_Vercel` daha önce 307 dönüyordu, şimdi nonce CSP'li 404 dönüyor. Hiçbir satırda CSP kaybolmadı.

Kendi varyantlarımdan dikkat çekenler (yeni build):
- **`_next/static` önekinden kaçış yok.** `/_next/static/../../tr/login` ve `/_next/static/%2e%2e/%2e%2e/tr/login` Next tarafından normalize ediliyor ve 200 + nonce CSP dönüyor. `/_next/static/..%2F..%2Ftr%2Flogin`, `/_next/static/x.html`, `/_next/static/YOK` ve `/_next/static/chunks/Yok.html` 404 dönüyor, ama `text/plain` olarak. Script çalışmaz, bu yüzden CSP gerekmiyor.
- **Çift eğik çizgi ve sonda `/`:** `//Logo.png`, `//_NEXT/static/x.js`, `/_next//image`, `/logo.png/` gibi 16 yolun hepsi 308 ile normalize ediliyor. Hedefleri matriste zaten CSP'li.
- **Sonda nokta, `%20`, `%00` ya da `;`:** Uzantı düşüyor, proxy çalışıyor ve nonce CSP geliyor.
- **Unicode:** `/_next/ſtatic/x.js`, `/_next/ımage`, `/_next/%C4%B0mage`, `/%E2%84%AA.png` hepsi nonce CSP alıyor. Tabanda da CSP'liydiler (`static`), yani Next'in header eşleşmesi Unicode'u ASCII'ye katlamıyor.
- **Kodlanmış gerçek dosya:** `/%6Cogo.png` ve `/%6C%6F%67%6F.png` 200 `image/png` dönüyor. Tabanda statik CSP alıyorlardı, şimdi proxy çalışıyor ve nonce CSP alıyorlar. Cache-Control ikisinde de `public, max-age=0`. Zararsız; normal bir tarayıcı bu yolu istemiyor.
- `/logo%2Epng` → 307 `/tr/logo.png`. İki build'de de aynı, önceden var olan davranış.

**Gerçek varlıklar** (`real-base.txt`, `real-yeni.txt`, `r304.txt`): 14 varlığın 14'ü de iki build'de aynı.
```
/logo.png, 5 svg                          200  CSP=0  public, max-age=0
/favicon.ico                              200  CSP=0  public, max-age=0, must-revalidate
chunk .js/.css, _buildManifest, media     200  CSP=0  public, max-age=31536000, immutable
/_next/image?url=%2Flogo.png&w=64&q=75    200  CSP=1 (Next'in kendi başlığı)  public, max-age=14400, must-revalidate
If-None-Match: /logo.png 304 · chunk 304 · /favicon.ico 200 (ETag yok) — iki build'de de aynı
```
CSP=0 olması, proxy'nin bu yollarda hiç çalışmadığını da gösteriyor, çünkü proxy her yanıta CSP koyuyor.

**TTFB** (`ttfb.txt`, 150 tur, iki sunucuya sırayla, medyan/p95 ms):
```
path                                     taban          yeni
/logo.png                                0.98/1.46      0.98/1.38
/favicon.ico                             1.29/2.10      1.29/2.17
/_next/static/chunks/…js                 0.98/1.69      0.96/1.53
/_next/image?url=%2Flogo.png…            1.15/1.74      1.17/1.59
/yok.png                                 5.02/8.23      4.95/8.46
/Logo.png                                4.82/9.43      5.44/10.87   (proxy artık çalışıyor, beklenen)
/_next/Image                             3.00/5.54      3.53/6.48    (proxy artık çalışıyor, beklenen)
/tr/login                                7.50/11.76     7.33/11.07
```
Gerçek varlıklarda gerileme yok, fark gürültü içinde. Yalnız hiçbir dosyanın karşılamadığı 404 varyantları proxy maliyeti nedeniyle ~0,5 ms yavaşladı.

**Tarayıcı** (`browser.txt`):
```
taban: /Logo.png?x=1, /_next/Image?url=…, /_NEXT/static/x.js?v=1  → csp=null  pwned=true
yeni : 8/8 varyant → nonce CSP, pwned=false, nextRan=true, 1 ihlal (enjeksiyonun kendisi)
```

**Mutantlar** (`mut-devop-rerun.out`, `mut-befb.out`):
```
devop-fb, dev HEAD'de yeniden: X2 X3 X4 P1 P2 P3 P4 P5 P6 P7 → 10/10 KILLED (devop-fb'nin sayılarıyla bire bir)
be-fb CSP : C1 default-src none→self unsafe-inline KILLED · C2 script-src-attr KILLED · C3 `_next(…)?$` $'sız KILLED
            C4 sınıfa % KILLED · C6 _next/static/→_next/ KILLED · C7 served istisnası $'sız KILLED · C9 sınıftan _ KILLED
            C5 proxy() _next geçişi ^'sız SURVIVED · C8 proxy() _next geçişi (?:/|$)'sız SURVIVED   → D-1
be-fb Ö-1 : taban  S2 KILLED · S4 KILLED · S10 SURVIVED · S11 KILLED
            yeni   S2 KILLED · S4 KILLED · S10 KILLED  · S11 KILLED
```
S10 şu mutant: il çağrısından sonraki her yanıtta `all.registered` maskeleniyor. Rapor `all`'u il çağrılarından önce aldığı için rapor da panel de doğru kalıyor. Ancak kapanış artık taze bir çağrıyla aynı cevabı vermiyor. Tabanda uç nokta kontrolü ilk çağrıda yapıldığı için bu mutant yaşıyordu, yeni testte ölüyor. Ö-1 kör noktayı gerçekten kapatıyor.

**Kapılar** (`gates.txt`, `gates-ci.txt`); DATABASE_URL koşudan önce echo edildi: `postgresql://***@127.0.0.1:55104/fabrika`
```
tsc exit=0 · eslint exit=0 · i18n exit=0 · next build exit=0 (taban build'i de 0)
vitest (yerel):   Test Files 293 passed | 6 skipped (299); Tests 3766 passed | 113 skipped (3879); exit 0
vitest (CI=true): Test Files 297 passed | 2 skipped (299); Tests 3829 passed | 50 skipped (3879); exit 0; SKIPGATE=0
izole DB xact_commit 8677 → 17324 (testler izole DB'ye gitti)
```
Yerel koşudaki 113 atlama, DB adı `fabrika` ve CI olmadığında bilerek devreye giren paylaşılan DB korumasından geliyor. İzole konteynerde `CI=true` ile koşunca sonuç devop-fb'nin birleşik ağaç sayısıyla (3829/50) aynı.

## 3) Bulgular

### Y-1 (düşük, belgeleme) — "`ı`, /i altında `I`'ya katlanır" gerekçesi yanlış
- `src/proxy.ts` yorumu ve devop-fb raporu §1a şunu söylüyor: "non-ASCII (`ı` folds to `I` under /i)… bu yüzden `[^A-Z]` yetmezdi (P2)". Bu iddia yanlış.
- Node ölçümü: `/favicon/i.test('favıcon') = false`, `/favicon/iu = false`. ES'in /i kuralı ASCII dışı bir karakterin ASCII'ye katlanmasını yasaklıyor. Yalnız `u` bayrağıyla `ſ`→`s` ve `K`→`k` katlanıyor (`/static/iu.test('ſtatic') = true`), ama Next'in header eşleşmesi `u` kullanmıyor. Matriste `/_next/ſtatic/x.js` tabanda da CSP'liydi.
- P2 mutantı altında `/favıcon.ico` gerçekte `static` CSP alıyor, `none` değil. Test bu mutantı yalnız satırda `nonce` beklediği için öldürüyor, CSP'siz bir açık olduğu için değil.
- Sonuç: Seçilen `[-a-z0-9_./]` sınıfı yine doğru ve daha tutucu bir seçim. Yanlış olan yalnız gerekçe.
- Öneri: Yorumu "`%` ve ASCII dışı karakterler de proxy'den geçer; `[^A-Z]` davranış olarak da güvenli olurdu, ama beyaz liste daha dar" şeklinde düzelt. Tek satırlık bir yorum değişikliği; ayrı kart gerekmez, bir sonraki dokunuşta yapılabilir.

### D-1 (düşük, test boşluğu) — `isPolicyOnlyPath`'in `_next` regex'inde iki mutant yaşıyor
- **C5:** `^` çıkarılırsa (`/x/_next/y` next-intl'i atlar) test yeşil kalıyor.
- **C8:** `(?:\/|$)` çıkarılırsa `/_nextfoo` ve `/_vercelx` 307 yönlendirme yerine 404 dönüyor, test yine yeşil.
- İkisinde de CSP korunuyor, çünkü proxy yine çalışıyor. Etkilenen şey güvenlik değil, yalnız yönlendirme davranışı.
- Mevcut `proxy()` testleri yalnız `/_next/Image`, `/_NEXT/yok` ve `/_Vercel/x` pozitif vakalarına bakıyor.
- Öneri: `/_nextfoo` → 307 `/tr/_nextfoo` ve `/tr/x/_next/y` → intl akışı için iki negatif vaka eklenmeli.

### Doğru bulunanlar (bulgu değil)
- Proxy'nin atladığı küme ile header kuralının dışladığı kümenin kesişimi yalnız dört gruptan oluşuyor: `api/*` (kendi CSP'si var), `/_next/static/*` (düz metin 404), küçük harfli `/_next/image` ve public/'teki gerçek dosya adlarının küçük harfli yazımı. Bu gruplarda HTML 404 üretecek bir yol bulamadım; `..`, kodlama ve çift eğik çizgi denemelerinin hepsi normalize ediliyor.
- Yeni davranış olarak `/TR/yok.png` ve `/API/x.png` `static`/`api` yerine `nonce` CSP alıyor, `/_NEXT/image` gibi yollar da 307 yerine 404 dönüyor. Bunlar devop-fb raporunun §4'ünde beyan edilmiş ve ölçümle uyuşuyor.
- Header kuralında değişiklik yok. X2 ve X3 artık testle sabitlenmiş.

## 4) Değişen dosyalar
- `docs/agent-results/TASK-MUOBO58BREWO7-be-fb.md` (bu rapor)
- `docs/agent-results/TASK-MUOBO58BREWO7-be-fb-ekler/` (matris, TTFB, mutant, tarayıcı ve kapı çıktıları, betikler)
- Kod dosyalarında değişiklik yok.

## 5) Riskler
- public/'e büyük harfli bir dosya eklenirse proxy o dosya için de çalışır (devop-fb §4). Test bu durumda kırmızı yanar.
- Kodlanmış yolla istenen gerçek dosyalar (`/%6Cogo.png`) artık proxy'den geçiyor. Maliyeti ihmal edilebilir; normal trafik bu yolu kullanmıyor.

## 6) Açık sorular
- Yok.

## 7) Sonraki adım
- Y-1 yorum düzeltmesi ve D-1'in iki negatif test vakası, bir sonraki proxy dokunuşunda yapılabilir (devop-fb ya da cs-fb). Ayrı kart isteğe bağlı.
- Push lidere ait.

**Platform beyanı:** Yalnız mac'te doğrulandı (Darwin 27, arm64, Next 16.3.4, Chromium headless shell 1243). İncelenen kod, harfe duyarlı Next middleware matcher'ı ile JS regex'i; dosya sistemi, süreç ya da kabuk kullanmıyor. Eşleşme URL pathname'i üzerinde yapıldığı için davranış Linux'ta (CI, `node:22-alpine`) ve Windows'ta aynı. İşletim sisteminin dosya sistemi harf duyarlılığı da etki etmiyor: Next public/ dosyasını kendi dosya listesiyle eşliyor, harfe duyarsız APFS'te de `/Logo.png` 404 döndü. Linux ve Windows bu makinede olmadığı için koşulamadı; Linux'u CI koşacak. Ölçüm betikleri bash ve python3 kullanıyor, `mx.sh`'ta platforma özgü bir şey yok.
