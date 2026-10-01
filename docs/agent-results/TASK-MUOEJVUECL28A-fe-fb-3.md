Hüküm: Bitti: B5 beyaz etiket tasarım rev. 4 yazıldı. İNCELEME-120'nin 2 Y ve 5 Ö bulgusu belgede karara bağlandı. Y-1 ve Y-2'nin çözümleri crw2-fb'nin ölçüm düzeniyle ölçüldü ve ikisi de çalışıyor. Ö-4'te bir sınır var: GRANT kısıtı yazıldı, ama web SUPERUSER ile bağlandığı sürece DB bu kısıtı zorlamaz. Bu ölçüldü ve belgede açıkça yazılı. Yalnız belge değişti, kod yok.
Entegrasyona hazır: fe-fb/b5-design-rev3 fc1217c7 (belge + ekler commit'i; dal ucu = üstündeki bu raporun commit'i; taban dev `0779e8f8`)
**Platform beyanı:** mac'te (Darwin 27.0, zsh) doğrulandı. Linux hedef bileşenleri mac Docker'ındaki Linux konteynerlerinde koşuldu: `caddy:2.11.4` ve `postgres:16-alpine` (16.15). Bu yüzden Caddy ve Postgres davranışı hedefle aynı. Tarayıcı ölçümleri Chromium 151.0.7922.34 ve **WebKit 26.6** ile yapıldı. WebKit, playwright-core ile yalnız scratchpad'e kuruldu. İNCELEME-120 WebKit'i koşamamıştı. **Koşulamayanlar:** gerçek HTTPS ve ACME (iki kayıtlı alan ve genel DNS gerekiyor, ölçümler http ve yerel kökenlerle yapıldı), canlı Next + Auth.js (Ö-2 sırası kurulu `@auth/core@0.41.3` kaynağından okundu), systemd (eşitleyici döngüsü konteynerde kabuk betiğiyle koşuldu). Windows koşulmadı: hedef platform değil, dokunulan yollar (Caddy yapılandırması, tarayıcı başlıkları, Postgres yetkileri) platforma bağlı değil.

# TASK-MUOEJVUECL28A — B5 beyaz etiket tasarım rev. 4 (fe-fb)

## 1. Ne yapıldı
- `docs/kamu/B5-BEYAZ-ETIKET-TASARIMI.md` rev. 3'ten rev. 4'e getirildi. Kaynak crw2-fb İNCELEME-120 (`TASK-MUOK1S09J2W3C-crw2-fb.md`, hüküm "DEĞİŞİKLİK GEREKLİ"), rapor ve ekleri baştan sona okundu.
- Yanıt tablosu belgenin §6.3 bölümünde (bulgu → karar → belgede nerede). Rev. 3'ten rev. 4'e değişen kararlar §1.1'de. Özeti:

| # | Karar | Belgede |
|---|---|---|
| **Y-1** | Ana Caddyfile'da `import {$FB_AGENCIES:/etc/caddy/agencies.d/agencies.caddy}` kullanılır. `adapt` yalnız alt süreçte `FB_AGENCIES=<.tmp>` ile koşar, sonra `rename` ve `env -u FB_AGENCIES caddy reload` gelir. **Ek olarak**, yüklenen yapılandırma admin soketinden (`GET /config/`) okunur ve host kümesi ile değişmezler yeniden denetlenir. Bu, denetimden sonra yeniden çevirmeyle ortaya çıkabilecek farkı da kapatır. `caddy.service`'e ve eşitleyici birimine değişken verilmez: Caddy yeniden başladığında `.tmp`'yi arar ve açılmaz. Test satırları (a)-(d) eklendi | §2.1 (ana dosya + not), §4.3-2, §4.3-4, §2.3 |
| **Y-2** | C ara sayfaları `Referrer-Policy: strict-origin` taşır. `same-origin` adım 2'yi kırıyor. `strict-origin-when-cross-origin` Origin'i gönderiyor ama aynı kökende tam URL'yi sızdırıyor. Adım 2'nin kuralı üç dala ayrıldı: `Origin` varsa tam eşleşme gerekir. `Origin: null` gelirse ret, geri düşüş yok. `Origin` hiç yoksa `Sec-Fetch-Site` ve `Referer` kökenine bakılır. Adım 6'da `null` ya da `Origin` yoksa ret. `accept-invite`'taki `no-referrer` kalıbı kopyalanmaz. `sandbox` kullanılmaz. E2E satırları (a)-(d) yazıldı | §3.3 |
| **Ö-1** | `d = getDomain(h, { allowPrivateDomains: true }); if (d === null \|\| d === h) reddet`. Web `tldts` kullanır. Eşitleyici `tldextract` kullanır: gömülü liste, ağ yok, özel bölüm açık | §4.3-1, §2.3 |
| **Ö-2** | `authorize(credentials, request)` ve `signIn` callback'i host'u ilk satırda çözer. Giriş eylemleri (`loginWithCredentialsAction`, `loginWithSocialAction`, `logoutAction`) ilk satırda `assertBrandHost()` çağırır. Bekçi artık dosya düzeyinde değil, dışa aktarılan her eylem düzeyinde ve AST ile çalışır. Matrise giriş satırı eklendi: `User` satırı, davet reddi ve kayıt çerezi yok | §2.2, §2.3 |
| **Ö-3** | Gerekçe "Caddy'nin `X-Forwarded-Proto`'suna bağımlı kalınmaz" oldu. Karar değişmedi | §3.2-1 |
| **Ö-4** | GRANT/REVOKE satırları migrasyona yazıldı. **Sınır:** web `fabrika` rolüyle (SUPERUSER + BYPASSRLS) bağlanıyor ve patron 29.09'da bu bağlantının kalmasına karar verdi (ROADMAP #16). Süper kullanıcı GRANT'a bakmıyor (ölçüldü). Bu yüzden tablo satırı "web kodu yazmaz, DB zorlamaz" oldu. Kenar bundan etkilenmiyor, çünkü katman 3 DB'ye güvenmiyor. 2 dakikalık alarm web'den eşitleyiciye taşındı. Kaynak bekçisi eklendi. Lider notu L3 | §4.1, §4.2-3, §4.3-6, §8.2-L3 |
| **Ö-5** | `0200 (Caddy varsayılanı), sahibi caddy`. Yol: `src/lib/agency/cobrand-store.ts:113-116` | §2.1, §4.1 |

- Efor değişmedi: B ≈ 25-36, C +11-17. Gerekçesi §7'de.

## 2. Kanıt (bu oturumda koşuldu; ekler `docs/agent-results/TASK-MUOEJVUECL28A-fe-fb-3-ekler/`)

**Y-1**: `caddy:2.11.4`, ana dosya rev. 4 §2.1 ile birebir (`Caddyfile`). `sync.sh`, §4.3-4'ün 2-6. adımlarının kabuk karşılığı. Ham çıktı `caddy-sync.log`:
```
s-w-------    1 root     root             0 … /run/caddy/admin.sock
== 0. rev.3 hatası: .tmp içinde yeni host, yer tutucusuz adapt:
["fonbridge.com","www.fonbridge.com"]
   aynı .tmp, FB_AGENCIES ile:
["fonbridge.com","panel.oka.org.tr","www.fonbridge.com"]
== 1. etkinleştirme: OKA
adapt(tmp) host kümesi: [fonbridge.com panel.oka.org.tr www.fonbridge.com]  beklenen: [fonbridge.com panel.oka.org.tr www.fonbridge.com]
reload rc=0
çalışan host kümesi:     [fonbridge.com panel.oka.org.tr www.fonbridge.com]
SONUÇ: senkron
== 2. ikinci ajans … SONUÇ: senkron
== 3. askıya alma: OKA
adapt(tmp) host kümesi: [fonbridge.com panel.baka.gov.tr www.fonbridge.com]  beklenen: [fonbridge.com panel.baka.gov.tr www.fonbridge.com]
reload rc=0
çalışan host kümesi:     [fonbridge.com panel.baka.gov.tr www.fonbridge.com]
SONUÇ: senkron
== 4. fazladan blok
adapt(tmp) host kümesi: [evil.example.com fonbridge.com panel.baka.gov.tr www.fonbridge.com]  beklenen: […]
DUR: küme farkı
   rc=1  canlı dosya md5 önce=0bbb6dcb7ae9 sonra=0bbb6dcb7ae9
== 5. :443 satırı
DUR: adapt hatası: Error: ambiguous site definition: :443
   rc=1  canlı dosya md5 önce=0bbb6dcb7ae9 sonra=0bbb6dcb7ae9
== 6. FB_AGENCIES rename sonrası ortamda kalırsa:
Error: adapting config using caddyfile: File to import not found: /etc/caddy/agencies.d/agencies.caddy.tmp, at /etc/caddy/Caddyfile:16
   çalışan küme hâlâ: ["fonbridge.com","panel.baka.gov.tr","www.fonbridge.com"]
```
"Çalışan host kümesi", Caddy'nin admin soketinden okunan yüklü JSON'dur. Döngü artık kendi değişikliğini görüyor. Askıya alma ve etkinleştirme Caddy'ye ulaşıyor. Küme denetimi yalnız gerçek sapmada "dur" diyor.

**Y-2**: gerçek tarayıcı, üç ayrı site: panel `127.0.0.1`, aracı `localhost`, saldırgan `[::1]`. Sunucu belgedeki adım 2 ve adım 6 kurallarını birebir uygular (`flow2.js`). Chromium `flow2.log`, WebKit `flow2-webkit.log`, iki tarayıcıda satır satır aynı sonuç:
```
chromium 151.0.7922.34   |   webkit 26.6
no-referrer                      2. aracı girişi   origin=null                     → RET (Origin=null)
no-referrer                      6. complete       origin=null  cookie=nonce=abc   → RET (Origin=null)
strict-origin                    2. aracı girişi   origin=http://127.0.0.1:187x1   → KABUL
strict-origin                    6. complete       origin=http://127.0.0.1:187x1  cookie=nonce=abc → KABUL
strict-origin-when-cross-origin  2. / 6.           panel kökeni                    → KABUL / KABUL
saldırgan(no-referrer)→aracı     2. aracı girişi   origin=null                     → RET (Origin=null)
saldırgan(unsafe-url)→aracı      2. aracı girişi   origin=http://[::1]:187x3       → RET
saldırgan(no-referrer)→complete  6. complete       origin=null  cookie=(yok)       → RET + nonce çerezi YOK
saldırgan(unsafe-url)→complete   6. complete       origin=http://[::1]:187x3 cookie=(yok) → RET + nonce çerezi YOK
```
(Test sunucusu ret verdikten sonra akışı durdurmuyor. Bu yüzden loglarda saldırgan satırlarından sonra 5. ve 6. adım satırları da görünüyor. O satırlarda da nonce çerezi yok ve gerçek uygulamada 6. adım bu nedenle ret verir.)

**Ö-1**: `psl.log` (tldts 7.4.16), `psl-py.log` (tldextract 5.3.0):
```
org.tr   getDomain=null   rev3: kabul  rev4: ret   | tldextract: ret
gov.tr   getDomain=null   rev3: kabul  rev4: ret   | tldextract: ret
ajans.github.io  varsayılan getDomain=github.io → rev4 kabul (!)  | allowPrivateDomains: ajans.github.io → ret | tldextract: ret
panel.oka.org.tr → kabul (iki kütüphane)          oka.org.tr → ret (iki kütüphane)
```
tldts'in varsayılanıyla `ajans.github.io` kabul ediliyordu. `allowPrivateDomains: true` bu yüzden şart. Belgeye yazıldı.

**Ö-4**: `grant.sql` / `grant.log`, `postgres:16.15`, compose'daki gibi `POSTGRES_USER=fabrika`:
```
 fabrika | rolsuper=t | rolbypassrls=t
--- fabrika_app (NOSUPERUSER) yazamaz, okur
ERROR:  permission denied for table AgencyDomainEdgeState      app_okur = 1
--- fabrika (SUPERUSER, bugünkü web bağlantısı): REVOKE sonrası
 panel.oka.org.tr | 999          ← REVOKE'a rağmen UPDATE geçti
```
Web'in `fabrika` ile bağlandığının kaynağı: `docker-compose.yml:36` (`DATABASE_URL=postgresql://fabrika:…`), `docs/ROADMAP.md` #16 (patron 29.09: bağlantı `fabrika_app`'e geçmiyor).

**Ö-2**: kurulu `@auth/core@0.41.3`, `lib/actions/callback/index.js`. Credentials sırası: `provider.authorize(credentials, new Request(url, { headers, … }))` (satır 231) → `handleAuthorized` (`signIn` callback'i, satır 244) → `jwt` (satır 258). OAuth sırası: `handleOAuth` → `handleAuthorized` (satır 63) → `handleLoginOrRegister` (adaptör, satır 70) → `jwt`. `next-auth/lib/actions.js:7` isteğin başlıklarını `nextHeaders()`'tan alıyor, bu yüzden `request.headers` içinde Host var. Depoda: `src/lib/actions/auth.ts` `'use server'` ve dışa aktarımlar `:27,116,182`. `authorize` `src/lib/auth.ts:401`, `signIn` callback'i `:610`.

**Belge**:
```
$ git show --stat --oneline fc1217c7   → docs/kamu/B5-BEYAZ-ETIKET-TASARIMI.md | 257 +++--- ve 13 ek dosyası
$ git diff 0779e8f8 HEAD --name-only -- . ':!docs'   → (boş)   yalnız belge
$ git diff --check   → temiz
$ docker ps -a --filter name=fefb-r4 -q | wc -l   → 0   (kendi konteynerlerim silindi)
```

## 3. Değişen dosyalar
- `docs/kamu/B5-BEYAZ-ETIKET-TASARIMI.md` (rev. 4)
- `docs/agent-results/TASK-MUOEJVUECL28A-fe-fb-3-ekler/` (13 dosya: `Caddyfile`, `sync.sh`, `caddy-sync.log`, `flow2.js`, `flow2.log`, `flow2-webkit.js`, `flow2-webkit.log`, `psl.js`, `psl.log`, `psl.py`, `psl-py.log`, `grant.sql`, `grant.log`)
- `docs/agent-results/TASK-MUOEJVUECL28A-fe-fb-3.md` (bu rapor)

Dal `fe-fb/b5-design-rev3`, rev. 3'ün worktree'sinde (scratchpad, ana checkout'tan ayrı) devam edildi. Ana checkout'ta (`/Users/macbook/alan/FONBRIDGE`) komut koşulmadı. Push ve merge yapılmadı.

## 4. Riskler
- **Merge notu:** `git merge-tree --write-tree dev HEAD` (dev `6168360b`), `docs/agent-results/TASK-MUOEJVUECL28A-fe-fb-2.md` dosyasında tek satırlık bir add/add çakışması veriyor. Nedeni: devop-fb'nin `6168360b` commit'i (TASK-MUOK1PQDND4RS) rev. 3 raporunun ana checkout'taki eski kopyasını dev'e koymuş. Tek fark 2. satır (`Entegrasyona hazır: … dc1c1baf`). Çözüm: dalın sürümü alınır. Belge ve eklerde çakışma yok.
- Y-2 ölçümleri http üstünde ve yerel kökenlerle yapıldı. `strict-origin` https → https geçişinde de kökeni gönderir (belirtim), ama gerçek alanlarla ölçüm kartta yapılacak (§3.3 e2e satırları).
- Ö-4: web'de bir RCE, süper kullanıcı DB bağlantısıyla B5'in DB kısıtlarını (`CHECK`, GRANT) aşar. Tasarım kenar güvenliğini buna dayandırmıyor. Ama "iki katman" iddiası DB katmanı için ancak ROADMAP #16 yeniden açılırsa tam olur. Lider notu L3.
- Ö-2'nin dışa aktarım düzeyindeki bekçisi AST ile yazılacak. Efor aşama 1'in bekçi kalemi içinde varsayıldı. ±%30 bandının üstüne çıkarsa kart bunu söylemeli.
- İki PSL kütüphanesinin listeleri farklı tarihli olabilir. Anlaşmazlıkta eşitleyici durur (kapalı kalır), bu da ajans eklenirken yanlış alarma yol açabilir. İşletme notu.

## 5. Açık sorular
- Tasarım dışı yok. §8.1'deki patron soruları değişmedi (1, 3, 4, 6, 7, 8, 10 açık). §8.2'ye L3 eklendi (bilgi amaçlı, karar istemiyor).

## 6. Sonraki adım
- crw2-fb: rev. 4'ün belge farkı üzerinden yeniden inceleme (`git diff dc1c1baf..fe-fb/b5-design-rev3 -- docs/kamu/`). Ölçümler eklerde, aynı düzenle yeniden koşulabilir.
- Onaydan sonra lider dalı dev'e merge eder. `fe-fb-2.md` çakışmasında dalın sürümü alınır.
- Uygulama kartları: aşama 1'in DoD'u §2.3'ten (giriş satırı dahil), eşitleyici kartı (1b) §4.3 ve §2.3'ün Y-1 (a)-(d) satırlarından, C kartı §3.3'ün e2e satırlarından (a)-(d) alınır.

## DoD
- [x] İNCELEME-120'nin Y-1, Y-2 ve Ö-1..Ö-5 bulgularının hepsi için yanıt tablosu var (§6.3: bulgu → karar → belgede nerede) ve §1.1'de değişiklik özeti var
- [x] Y-1 çözümü `caddy:2.11.4` ile ölçüldü: 3 senkron döngü, 2 enjeksiyon durdu, canlı dosya md5'i değişmedi, değişken sızıntısı durumu da ölçüldü
- [x] Y-2 çözümü Chromium 151 ve WebKit 26.6 ile ölçüldü, saldırgan kökeni dahil
- [x] Ö-1 (iki kütüphane) ve Ö-4 (Postgres 16) ölçüldü. Ö-2, Auth.js kaynağından ve depo satırlarından doğrulandı
- [x] Yalnız belge ve ekler değişti. Ana checkout'ta komut yok, push yok, merge yok, konteynerler silindi (0)
- [x] Platform: mac'te (Linux konteynerleri, Chromium ve WebKit ile) doğrulandı. HTTPS/ACME, canlı Next ve Windows koşulamadı (gerekçeler en üstte)
