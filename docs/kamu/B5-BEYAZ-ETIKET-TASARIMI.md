# B5 Tam Beyaz Etiket — Tasarım rev. 4

**Durum:** tasarım, uygulanmadı. Uygulama 2. yılda (patron kararı 30.09). Ürün kodu bu belgeyle değişmedi.
**Rev. 1:** `docs/agent-results/TASK-MULRSKF51ZLTW-fe-fb.md` (fe-fb). Kod haritası (§1), tema (§3), e-posta
seçenekleri (§4.1-4.2) ve A/B/C karşılaştırması (§6) orada. Bu belge yalnız değişen kararları taşır. Çelişki olursa
**bu belge geçerlidir**.
**Güvenlik incelemeleri:**
- İNCELEME-111, `docs/agent-results/TASK-MUODXZR2BQ2L6-se-fb.md`: 2 B · 6 Y · 7 Ö. Rev. 2 bunları kapattı.
- İNCELEME-114, `docs/agent-results/TASK-MUOFKI8C1009Z-se-fb.md` (dal `se-fb/inceleme114`, `95c5cbf3`): B-1/B-2 kapandı,
  16 bulgudan 15'i kapandı, Y-4 kısmen. Yeni bulgular: 3 Y + 5 Ö (R2-Y1..Y3, R2-Ö1..Ö5). Rev. 3 bunları kapatır ve belgeyi
  30.09 patron kararlarıyla (Karar-1 C, Karar-2 A) uyumlu yapar (TASK-MUOEJVUECL28A). Yanıt tablosu: §6.2.
- İNCELEME-120, `docs/agent-results/TASK-MUOK1S09J2W3C-crw2-fb.md` (crw2-fb, rev. 3 `dc1c1baf`): İNCELEME-114'ün 8
  bulgusundan 6'sı kapandı, 2'si kısmen. Yeni bulgular: 2 Y + 5 Ö (Y-1, Y-2, Ö-1..Ö-5), B yok. Rev. 4 bunları kapatır.
  Yanıt tablosu: §6.3. Bu revizyondaki "İNCELEME-120 Y-1" gibi atıflar bu raporun numaralarıdır, İNCELEME-111'inkiler
  değil.
**Ölçümler:** rev. 2 `docs/agent-results/TASK-MUOEJVUECL28A-fe-fb-ekler/`, İNCELEME-114 `…/TASK-MUOFKI8C1009Z-se-fb-ekler/`,
İNCELEME-120 `…/TASK-MUOK1S09J2W3C-crw2-fb-ekler/`, rev. 4 `…/TASK-MUOEJVUECL28A-fe-fb-3-ekler/`.
Rev. 3 ve rev. 4 yalnız belge değişikliğidir. Rev. 4'ün iki Y çözümü crw2-fb'nin ölçüm düzeniyle yeniden ölçüldü
(`caddy:2.11.4`, Chromium 151, WebKit 26.6, `postgres:16`).

---

## 0. Özet

1. **Host kapısı iki katman.** Caddy katmanı her yolu kapsar: açık site bloğu, `strict_sni_host on`, eşleşmeyen Host
   için 421. Uygulama katmanında proxy matcher'ı `/api/*`'yi de kapsar ve tek fonksiyon `resolveBrandHost()` çağrılır.
   Askıdaki ya da bilinmeyen host her istekte 421 alır. Önceden alınmış sertifika bunu değiştirmez (§2, ölçüldü:
   İNCELEME-114 §1.3).
2. **Oturum host'a bağlı.** Çerez host-only kalır (Domain yok) ve üretimde `__Secure-` önekli ve `Secure` bayraklıdır.
   Bunun için `useSecureCookies` açıkça verilir, `AUTH_URL`/`NEXTAUTH_URL` üretimde yoktur (§3.2-1, R2-Y1). JWT'ye
   `host` claim'i yazılır. Auth.js `jwt` callback'i her oturum okumasında bu claim'i isteğin host'uyla karşılaştırır,
   eşleşmezse `null` döner ve oturum silinir. C yolunda devir, tek kullanımlık, 60 sn geçerli, hedef host'a ve
   tarayıcıya bağlı bir belirteçle yapılır. Tarayıcı bağı iki adımlı inişle `SameSite=Lax` altında çalışır (§3.3, R2-Y3).
3. **Kenar yapılandırmasını web uygulaması yazmaz (R2-Y2).** Caddy'deki ajans blokları, ana makinede ayrı bir
   eşitleyicinin (`fb-edge-sync`) DB'den çekip sabit şablonla ürettiği bir dosyadır. Web konteynerinin Caddy'ye, admin
   API'sine, docker soketine ya da `/etc/caddy`'ye erişimi yoktur. Hostname üç yerde doğrulanır (§4.3). Eşitleyici yeni
   dosyayı yerleştirmeden önce denetler, yüklendikten sonra da Caddy'nin çalışan yapılandırmasını denetler (§4.3-4,
   rev. 4, ölçüldü).
4. **Alan politikası — Karar-2 A (patron, 30.09):** kök alan YOK, yalnız alt alan (`panel.<ajans>`). Ajans kök alanını
   alt alana yönlendirmek isterse bunu kendi tarafında kurar.
5. **HSTS — Karar-1 C (patron, 30.09, uygulandı):** HSTS yalnız Caddy'de. Uygulama başlık göndermiyor
   (`devop-fb/merge-hsts`, dev'de). Ajans bloğunda `includeSubDomains` yok (§5).
6. **Efor:** B yolu ≈ **25-36 kişi-gün** (rev. 2: 24-35). C yolu ek ≈ **+11-17** (değişmedi). §7.

---

## 1. Değişen kararlar

### 1.1 rev. 3 → rev. 4

| Konu | rev. 3 | rev. 4 | Bulgu (İNCELEME-120) |
|---|---|---|---|
| Eşitleyicinin denetlediği dosya | `caddy adapt --config Caddyfile`, ana dosya eski `agencies.caddy`'yi içe aktarıyordu. Döngü kendi değişikliğini hiç görmüyor, küme denetimi her değişiklikte "dur" diyordu | ana dosyada `import {$FB_AGENCIES:/etc/caddy/agencies.d/agencies.caddy}`. `adapt` yalnız o komutta `FB_AGENCIES=<.tmp>` ile koşar. `rename`'den sonra yer tutucusuz `reload` yapılır. Ardından çalışan yapılandırma admin soketinden okunup yeniden denetlenir | Y-1 |
| C ara sayfalarının `Referrer-Policy`'si | `no-referrer`: form POST'unda `Origin: null` gönderiliyor, adım 2 ve 6 her meşru devri reddediyordu | `strict-origin`. `Origin: null` açıkça ret. `Origin` hiç yoksa (eski tarayıcı) `Referer` yedeği | Y-2 |
| PSL kuralı | `getDomain(h) !== h`: `org.tr` → `null` → kabul | `d = getDomain(h, { allowPrivateDomains: true }); d === null \|\| d === h` → ret. Kütüphaneler sabit: web `tldts`, eşitleyici `tldextract` (gömülü liste, ağ yok) | Ö-1 |
| Giriş eylemlerinin yan etkileri | "`jwt` `signIn` dalında reddedilir" (ama `authorize` ondan önce satır açıyor) | `authorize` ve `signIn` callback'i ilk satırda host'u çözer. Giriş eylemleri `assertBrandHost()` çağırır. Bekçi dosya düzeyinde değil, dışa aktarılan her eylem düzeyinde | Ö-2 |
| `useSecureCookies` gerekçesi | "Caddy arkasında upstream `http://` konuşur" | "Caddy'nin `X-Forwarded-Proto`'suna bağımlı kalınmaz" | Ö-3 |
| `AgencyDomainEdgeState` yazma yetkisi | "yalnız `fb_edge_sync`", zorlayan kısıt yok | GRANT kısıtı yazıldı. Web bugün SUPERUSER ile bağlandığı için bu kısıt DB'de ancak web bağlantısı değişince zorlanır. O güne kadar kaynak bekçisi var ve alarmı eşitleyici kendisi verir | Ö-4 |
| Metin | soket `0600`, `cobrand-store.ts:112-115` | `0200` (Caddy varsayılanı), `src/lib/agency/cobrand-store.ts:113-116` | Ö-5 |

### 1.2 rev. 2 → rev. 3

| Konu | rev. 2 | rev. 3 | Bulgu |
|---|---|---|---|
| Auth taban URL'si ve çerez öneki | yazılmamıştı; "önekler korunur" iddiası bugünkü env ile tutmuyordu | üretimde `AUTH_URL`/`NEXTAUTH_URL` yok, `useSecureCookies` açık, açılışta kontrol, sıralama şartı | R2-Y1 |
| Caddy'yi kim yapılandırır | "Caddyfile üretilir, reload" (özne yok) | ana makinede `fb-edge-sync` çeker ve üretir. Web uygulaması yalnız DB'ye yazar. Hostname üç katmanda doğrulanır. `caddy adapt` ile şablon değişmezleri denetlenir | R2-Y2 |
| C: nonce çerezinin gelişi | tek siteler arası POST'ta `Lax` nonce karşılaştırılıyordu (çalışmaz) | iki adımlı iniş (`/api/auth/handoff` → aynı köken `/api/auth/handoff/complete`). Aracı girişi `303` → GET. Çıkış senkronu onaylı GET → aynı köken POST | R2-Y3 |
| `jwt` kod parçasında sıra | karşılaştırma callback'in başında | `signIn` dalı önce, karşılaştırma sonra. Üç test | R2-Ö1 |
| Kök `[locale]` + uzantılı yol | test matrisinde yoktu | matris satırı + oturumsuz eylemler `assertBrandHost()` çağırır | R2-Ö2 |
| Oturum okumasının tek noktası | yalnız `jwt` callback'i | + kaynak bekçisi: `next-auth/jwt`, `@auth/core/jwt`, `decode(` içe aktarımı yasak | R2-Ö3 |
| C aracısı girişi | Origin kontrolü yoktu | `Origin` (yoksa `Sec-Fetch-Site`) `https://<target>` ile tam eşleşir | R2-Ö4 |
| Önbellek geçersizleştirme | `pg_notify` + web'de `LISTEN` + TTL 30 sn | web tek örnekte süreç içi boşaltma + TTL 30 sn. `LISTEN`'i web'de değil eşitleyici yapar. Web'de `LISTEN` ikinci örnek gelince | R2-Ö5 |
| Kök alan | desteklenmez (önerilen) | desteklenmez (**Karar-2 A**, kesin) | §8-2 |
| HSTS | kök için Caddy'ye taşıma önerisi, yedek plan `has: host` | **Karar-1 C uygulandı.** Yedek plan silindi. `>` savunma derinliği olarak kalır | Ö-3, §8-9 |
| Efor | B 24-35, aşama 1 alt ucu 13,5 (aritmetik hatası) | B 25-36, aşama 1 alt ucu düzeltildi | İNCELEME-114 §5.1 |

### 1.3 rev. 1 → rev. 2 (tarihçe; güncel hâli yukarıdaki tablolarda)

| Konu | rev. 1 | rev. 2 | Bulgu |
|---|---|---|---|
| Host kapısının yeri | yalnız `src/proxy.ts` | Caddy (her yol) + proxy matcher `/api` dahil + `resolveBrandHost()` | B-1 |
| Oturum izolasyonu | "host-only çerez yeter" | host-only çerez + JWT `host` claim + her okumada karşılaştırma | B-2 |
| Kiracılar arası kapı | yalnız girişte | `jwt` callback'inde, rebind ve varsayılan üyelik dahil, her okumada | Y-1 |
| Platform alanları (`mail.*`, `mode`) | `Tenant.settings.cobrand` içinde | ayrı `AgencyWhitelabel` tablosu, yalnız platform yöneticisi yazar | Y-2 |
| Askıya alma | "Caddy depodan sil, işletme adımı" | tek otomatik akış: DB + önbellek + Caddy bloğu + reload + Google `redirect_uri` + doğrulama (rev. 3: Caddy adımını eşitleyici yapar) | Y-3 |
| C devri | "60 sn, hedef-host'a bağlı kod" | + tarayıcı nonce'u, DB'de tek kullanım, POST ile taşıma, Google kodu aracıda kalır | Y-4 |
| E1 önkoşulu | yok | `nexagrant.com` DMARC `p=reject` (en az `quarantine`) | Y-5 |
| `From` | dize | `{ name, address }` nesnesi + ad politikası | Y-6 |

---

## 2. Host kapısı (B-1)

### 2.1 Katman 1 — Caddy (birincil, her yolu kapsar)

On-demand TLS kullanılmaz. Ajans evreni ≤26, pilot tek ajans. Her ajans alanı açık bir site bloğudur. Caddyfile iki
parçadır: **sabit ana dosya** (elle, sürüm kontrolünde, `docs/SMTP-SUNUCU.md` §10.1'deki dosyanın genişletilmiş hâli)
ve eşitleyicinin ürettiği **ajans dosyası** (§4.3). Ana dosya:

```caddy
{
	default_bind tcp4/0.0.0.0          # SMTP-SUNUCU.md §10.1 (patron 30.09: AAAA yok)
	admin unix//run/caddy/admin.sock   # R2-Y2: admin API TCP'de değil; soket 0200 (Caddy varsayılanı), sahibi caddy
	servers {
		strict_sni_host on              # SNI ≠ Host → 421 (İNCELEME-114 §1.2 ölçtü)
	}
}
nexagrant.com {
	encode zstd gzip
	header >Strict-Transport-Security "max-age=31536000"   # Karar-1 C: HSTS yalnız burada (§5)
	reverse_proxy 127.0.0.1:3000
}
www.nexagrant.com, http://www.nexagrant.com, http://nexagrant.com {
	redir https://nexagrant.com{uri} permanent
}
import {$FB_AGENCIES:/etc/caddy/agencies.d/agencies.caddy}   # YALNIZ fb-edge-sync yazar (§4.3); boş dosya geçerlidir.
                                   # Yer tutucu yalnız eşitleyicinin denetim komutunda verilir (İNCELEME-120 Y-1)
:443 {
	tls internal                    # yedek: hiçbir bloğa uymayan istek upstream'e değil 421'e düşer
	respond 421
}
```

Üretilen ajans dosyası (host başına bir blok, şablonun tek değişkeni doğrulanmış hostname'dir):

```caddy
panel.oka.org.tr {                  # kaynak: AgencyDomain.status = ACTIVE
	header >Strict-Transport-Security "max-age=31536000"   # includeSubDomains YOK (Ö-3)
	reverse_proxy 127.0.0.1:3000
}
```

İNCELEME-114'ün ölçümleri (§1.1-1.4, `tls internal`, `caddy:2.11.4`) bu yapıyla tutarlı:
- `:443 { tls internal }` yedeği adlı alanların LE sertifikasını etkilemez ve bilinmeyen SNI için sertifika üretmez
  (on-demand kapalı). Sertifika bombalaması yüzeyi yok.
- ACTIVE host'ta 6 yolun hepsi 200. SNI≠Host 421. İstemcinin `X-Forwarded-Host`'u silinir. Büyük harf Host geçer
  (uygulama normalize eder, §2.2). Sonda noktalı Host 421. Bilinmeyen SNI ve SNI'sız istek TLS'te kapanır.
- Blok silinip `caddy reload` yapılınca sertifika depoda dursa da askıdaki host'ta `/api/*` dahil 6 yolun hepsi TLS'te
  reddedilir (`tlsv1 alert internal error`). Yeniden başlatma gerekmez.
- `strict_sni_host` yanlışlıkla kalkarsa `:443` yedeği askıdaki/bilinmeyen host'u yine 421'e düşürür. Açılan tek yüzey
  iki ACTIVE site arasındaki geçiştir, onu uygulama katmanı (`resolveBrandHost` + `jwt` host claim'i) kapatır.

Notlar:
- Next yalnız `127.0.0.1:3000`'e bağlı kalır (`docker-compose.yml:31`). Böylece uygulamaya giden her istek Caddy'den
  geçer ve `X-Forwarded-Host`'u Caddy yazar.
- Caddy bu katmanda yolu ayırt etmez: `/`, `/api/*`, `/_next/*` ve statik dosyalar aynı kapıdan geçer.
- Ana dosyadaki `strict_sni_host`, `:443 → 421` ve `admin unix//…` satırları **değişmezdir**: eşitleyici her
  üretimden sonra bunları `caddy adapt` çıktısında denetler (§4.3-4). `devop-fb`'nin bugünkü §10.1 dosyasında bu üç
  satır yok. Tek site varken doğru, B5 aşama 1'de eklenir.
- `import` satırındaki `{$FB_AGENCIES:…}` yer tutucusu, Caddy'nin Caddyfile ayrıştırırken çözdüğü ortam değişkenidir.
  Değişken yoksa varsayılan canlı yol kullanılır. **Caddy'nin kendi servisine (`caddy.service`, `EnvironmentFile`)
  `FB_AGENCIES` verilmez.** Verilirse Caddy yeniden başlatıldığında `.tmp` dosyasını arar ve açılmaz. Değişkeni yalnız
  eşitleyici, yalnız denetim komutunun ortamında verir (§4.3-4). Ölçüldü (`caddy:2.11.4`): değişken yokken `adapt`
  canlı dosyayı okur, değişken `.tmp`'yi gösterince `.tmp`'deki host'lar çıktıda görünür. Değişken `rename`'den sonra
  ortamda kalırsa `reload` "File to import not found: …agencies.caddy.tmp" hatasıyla durur. Bu durumda Caddy son geçerli
  yapılandırmada kalır.
- On-demand'ın neden çıktığı (rev. 2): on-demand yönetilen sertifikayı bellekte tutar ve reload yetmez (se-fb
  İNCELEME-111 1.2-E), statik blok config'ten türetilir. Self-servis alan ekleme istenirse yeniden değerlendirilir
  (§6.1 Ö-2).

### 2.2 Katman 2 — uygulama (zorunlu; Caddy yanlış kurulursa da kapalı kalır)

**Tek fonksiyon:** `src/lib/brand/host.ts`

```ts
type BrandHost =
  | { kind: 'root' }                                  // nexagrant.com (+ yerel geliştirmede localhost)
  | { kind: 'agency'; agencyId: string; hostname: string };

export function normalizeHost(raw: string | null): string | null;   // Ö-1: küçük harf, port at, sondaki '.' at, IDN → punycode
export function isValidAgencyHostname(h: string): boolean;          // §4.3-1; normalizeHost'tan SONRA çağrılır
export async function resolveBrandHost(headers: Headers): Promise<BrandHost | null>; // null = reddet (421)
export async function assertBrandHost(): Promise<BrandHost>;        // R2-Ö2: oturumsuz server action'lar için; null → hata
```

- Girdi: `Host` başlığı. `X-Forwarded-Host` varsa normalize edilmiş hâli `Host` ile aynı olmalıdır, değilse `null`.
  Caddy ikisini de aynı yazar. Fark varsa istek Caddy'den gelmemiştir.
- Kaynak: `AgencyDomain` tablosunda yalnız `status = ACTIVE` satırlar. Bellekte `Map<hostname, agencyId>` tutulur. DB'ye
  el sıkışma ya da istek başına gidilmez.
- **Geçersizleştirme (R2-Ö5):** web bugün tek örnek (`fabrika-web`). Yazma yapan eylem kendi sürecinde haritayı hemen
  boşaltır, TTL 30 sn yedektir. Askıya alma bu yüzden TTL'i beklemez (Y-3). Eylem ayrıca
  `pg_notify('agency_domain_edge')` yayınlar, ama bunu **eşitleyici** dinler (§4.3), web dinlemez. Prisma `LISTEN`
  desteklemediği için web'de ayrı bir `pg` bağlantısı gerekirdi, sessizce koparsa geçersizleştirme dururdu. İkinci web
  örneği eklenince `LISTEN` (ayrı `pg` bağlantısı + kopunca yeniden bağlanma + bağlantı sağlığı metriği) o kartın işidir.
- `null` dönen durumlar: bilinmeyen host, `PENDING`/`VERIFIED`/`SUSPENDED` host, XFH ≠ Host, normalize edilemeyen
  değer.

**Çağrıldığı yerler (hepsi aynı fonksiyon, aynı 421):**

| Yol | Nerede | Not |
|---|---|---|
| Sayfalar ve server action'lar | `src/proxy.ts` | Server action, sayfa yoluna POST'tur, bugünkü matcher'da zaten var |
| Kök `[locale]` + statik uzantılı yol (`/x.png`) | **proxy çalışmaz** (`src/proxy.ts:83` uzantıyı hariç tutar). Oturumlu eylemler `jwt` katmanında kapalı. Oturumsuz eylemler `assertBrandHost()`'u kendileri çağırır | R2-Ö2, İNCELEME-120 Ö-2. Bugün oturumsuz eylemler: `submitReadinessLead` (`src/app/[locale]/fon-hazirlik/actions.ts:11`) ve giriş eylemleri (`src/lib/actions/auth.ts`: `loginWithCredentialsAction`, `loginWithSocialAction`, `logoutAction`). Hepsi **ilk satırda** `assertBrandHost()` çağırır, çerez yazmadan ve `signIn`'i çağırmadan önce. Giriş yolunun kendisi de kapalıdır: `authorize` ve `signIn` callback'i host'u ilk satırda çözer (aşağıda). Kaynak bekçisi aşağıda |
| `/api/*` (Auth.js dahil) | `src/proxy.ts`, matcher'a `'/api/:path*'` eklenir | `/api` dalında **yalnız** host kontrolü yapılır. CSP nonce ve locale işlemi yapılmaz, API CSP'si `next.config.ts`'ten gelmeye devam eder |
| Oturum okuması | `auth.ts` `jwt` callback'i (§3.2) | Proxy regresyona uğrarsa oturumlu her yol yine de kapalıdır |
| `/api/brand/logo`, `/api/brand/favicon` | route içinde, markayı host'tan çözerken | Oturumsuz uçlar, çözüm zaten host'a dayanıyor |
| Statik dosyalar, `/_next/*` | **uygulamada yok**, yalnız Caddy | Bu yollar host'tan bağımsız, herkese açık derleme çıktısıdır. Oturum ve marka taşımaz. Caddy katmanı onları da kapsar (ölçüldü: askıda TLS'te kapalı, çapraz SNI 421) |

- `/api/webhooks/*` (Stripe vb.) yalnız `root` host'ta kabul edilir. Ajans host'undan gelen webhook 421 alır.
- `/api/internal/*` (varsa) yalnız `root`. Caddy dışarıya açmaz.
- 421 gövdesi boştur ve `Cache-Control: no-store` taşır. Yönlendirme yapılmaz: askıdaki alandan `nexagrant.com`'a
  otomatik 30x, alanı ele geçiren tarafa meşruiyet kazandırır.
- `matcher` testi (`src/lib/security-headers.test.ts`, İNCELEME-57 Y-2 kalıbı) `/api/auth/callback/google`,
  `/api/brand/logo` ve `/api/v1/...` örneklerinin proxy'den geçtiğini sabitler.

**Giriş yolunun host kapısı (İNCELEME-120 Ö-2).** `jwt` callback'i girişi reddetse de ondan önce çalışan kod yan etki
bırakabilir. `@auth/core@0.41.3` sırası (`lib/actions/callback/index.js`, bu revizyonda okundu):
- credentials: `provider.authorize(credentials, request)` (satır 231) → `signIn` callback'i → `jwt`. Bizim `authorize`
  kullanıcı satırı açabilir ve reddedilen davet kodunu yazabilir (`src/lib/auth.ts:401-590`).
- OAuth: Google kod değişimi → `signIn` callback'i (satır 63) → adaptörün yazması → `jwt`. Bizim `signIn` callback'i
  `decideOAuthSignIn` içinde davet reddini yazabilir ve kayıt çerezlerini temizler (`auth.ts:610…`).

Bu yüzden host kapısı yazma yapan her noktanın **ilk satırına** konur:
```ts
// authorize(credentials, request): Auth.js özgün isteğin başlıklarını ikinci argümanda verir
if (!(await resolveBrandHost(request.headers))) return null;        // DB'ye gitmeden
// callbacks.signIn(...)
if (!(await resolveBrandHost(await headers()))) return false;        // decideOAuthSignIn'den önce
```
Giriş eylemleri de `assertBrandHost()`'u ilk satırda çağırır. Böylece kayıt çerezleri (`setRegistration…Cookie`)
askıdaki host'ta hiç yazılmaz. `jwt`'deki kontrol yerinde kalır. Üç katman birbirinin yedeğidir.

**Eylem bekçisi (dışa aktarım düzeyinde).** Dosya düzeyindeki rev. 3 kuralı (`'use server'` dosyasında `auth()` yoksa
`assertBrandHost()` şart) bugün `src/lib/actions/auth.ts`'i de yakalıyor ve kuralla belge çelişiyordu. Yeni kural:
`'use server'` dosyasından dışa aktarılan **her** async fonksiyonun gövdesinde bu çağrılardan biri olmalı: `auth()`,
bir `requireX()` yardımcısı ya da `assertBrandHost()`. Oturumsuz eylemlerde (`auth()`/`requireX()` çağırmayanlar)
`assertBrandHost()` gövdenin ilk ifadesidir. Bekçi TypeScript AST'si üzerinde çalışır (dışa aktarılan
fonksiyon bildirimi, `export const x = async …`, yeniden dışa aktarım). Düzenli ifadeyle yazılmaz. Kasıtlı olarak
kapısız bırakılan bir eylemle kırmızıya döndüğü test edilir.

### 2.3 Test matrisi (uygulama kartının DoD'u)

{kök, ACTIVE, SUSPENDED, PENDING, bilinmeyen, XFH≠Host, BÜYÜK HARF, sonda nokta} × {sayfa, server action,
**`POST /x.png` + `Next-Action` (R2-Ö2)**, `/api/auth/signin/google`, `/api/auth/callback/google`, `/api/auth/session`,
`/api/brand/logo`, `/api/v1/*`, `/api/webhooks/stripe`}. Beklenen: kök ve ACTIVE → normal. Normalize edilebilenler →
karşılığı. Diğerleri → 421 (ya da eylem hatası; eylem **çalışmamış** olmalı: DB'de satır yok).

Giriş satırı (İNCELEME-120 Ö-2): SUSPENDED ve bilinmeyen host'ta `POST /x.png` + `Next-Action` →
`loginWithCredentialsAction` (yeni e-posta ve geçersiz davet koduyla) ve doğrudan `POST /api/auth/callback/credentials`.
Beklenen: `User` satırı yok, davet reddi kaydı yok, yanıtta `Set-Cookie` ile kayıt çerezi yok, oturum çerezi yok.

Ek testler (bu revizyon):
- **R2-Ö1:** ajans host'unda giriş başarılı (token'da `host = panel…`). Kökte basılan token ajans host'unda `null`.
  Claim'siz eski token ajans host'unda `null`, kökte geçerli.
- **R2-Y1:** üretim modunda `Set-Cookie` adı `__Secure-authjs.session-token`, `Secure` bayrağı var, `Domain=` yok.
  `AUTH_URL` ya da `NEXTAUTH_URL` verilmiş üretim süreci açılışta çıkar (sıfırdan farklı çıkış kodu).
- **R2-Ö3:** kaynak bekçisi (`src/` altında `next-auth/jwt`, `@auth/core/jwt`, `decode(` içe aktarımı yok) kasıtlı bir
  içe aktarımla kırmızıya döner.
- **R2-Y2:** compose bekçisi, `fabrika-web` hizmetinde `docker.sock`, `/etc/caddy`, `/run/caddy` bağı ve
  `network_mode: host` olmadığını doğrular (§4.3-5).
- **İNCELEME-120 Y-1 (eşitleyici kartı):** gerçek `caddy` konteynerinde (a) `.tmp`'ye eklenen host `FB_AGENCIES`'li
  `adapt` çıktısında görünür, yer tutucusuz çıktıda görünmez; (b) etkinleştirme, ikinci ajans ve askıya alma
  döngülerinin her birinde `reload`'dan sonra admin soketinden okunan çalışan host kümesi beklenen kümeye eşittir;
  (c) fazladan bir blok küme denetiminde, `:443` satırı `adapt`'ta durur ve iki durumda da canlı dosya değişmez;
  (d) `FB_AGENCIES` ortamda kalırsa `reload`'ın başarısız olduğu ve eşitleyicinin değişkeni yalnız `adapt`'a verdiği
  sabitlenir. Bu dört durum rev. 4'te ölçüldü (`…-fe-fb-3-ekler/caddy-sync.log`).
- **İNCELEME-120 Ö-1:** `org.tr`, `gov.tr`, `com`, `oka.org.tr`, `github.io`, `ajans.github.io` ret.
  `panel.oka.org.tr` ve `panel.ajans.github.io` kabul. Web (`tldts`) ve eşitleyici (`tldextract`) aynı tabloyu verir.
- Caddy katmanı: gerçek konteynerde İNCELEME-114 `matrix.sh`'in 4 durumu (A/B/C/D), üretilen ajans dosyasıyla.

---

## 3. Oturumun host'a bağlanması (B-2, Y-1, Y-4)

### 3.1 Seçim ve gerekçe

se-fb iki seçenek verdi: (a) host başına çerez adı, (b) JWT `host` claim'i. **(b) seçildi.** (a) ek katman olarak
reddedildi. Gerekçe (kaynaktan): NextAuth v5 istek başına yapılandırmayı argümansız `auth()` çağrılarında
`config(undefined)` ile kurar (`next-auth/lib/index.js:61`, yorum: "Should we pass headers() here instead?"). Sunucu
bileşenlerinde ve server action'larda `auth()` argümansız çağrılıyor (`src/lib/tenant.ts:112,169`). Bu yollarda host
başına çerez adı seçilemez; yapılandırma fonksiyonunun içinde `headers()` okumak kırılgan bir çözüm olur. (b) ise tek
bir noktada, her oturum okumasında çalışır. İNCELEME-114 bu seçimi doğruladı.

### 3.2 Tasarım

1. **Taban URL, çerez öneki ve `Secure` (R2-Y1).**
   - Kaynak: `@auth/core/lib/utils/env.js:66-70` `AUTH_URL ?? NEXTAUTH_URL` varsa taban URL'yi oradan kurar, Host'a
     bakmaz. `next-auth/lib/env.js:5-12` isteği de o origin'e yeniden yazar. `@auth/core/lib/init.js:69`
     `useSecureCookies ?? url.protocol === "https:"`. Bugün `docker-compose.yml:39`
     `NEXTAUTH_URL=http://localhost:${FABRIKA_WEB_PORT:-3000}` sabitliyor ve `auth.ts`'te `useSecureCookies` yok
     (yalnız `trustHost: true`, satır 345). Bu env ile her host'ta Google `redirect_uri` aynı sabit adres olur ve oturum
     çerezi `__Secure-` öneksiz ve `Secure` bayraksız basılır.
   - **Karar:** üretimde `AUTH_URL` ve `NEXTAUTH_URL` **yoktur**. Taban URL isteğin (Caddy'nin yazdığı ve
     `resolveBrandHost`'un onayladığı) host'undan kurulur (`trustHost: true`, değişmez).
     `useSecureCookies: process.env.NODE_ENV === 'production'` `auth.ts`'e açıkça yazılır. Caddy'nin
     `X-Forwarded-Proto`'suna bağımlı kalınmaz (İNCELEME-120 Ö-3): Auth.js taban URL'nin protokolünü
     `x-forwarded-proto`'dan alır (`createActionURL`, `@auth/core/lib/utils/env.js`), Caddy de bu başlığı `https`
     olarak yazar, yani Caddy arkasında çıkarım bugün doğru sonuç verir. Açık değer, başlığın olmadığı ya da `http`
     geldiği yolları kapatır: Caddy'yi atlayan istek, yanlış kurulmuş bir proxy, yerel `next start`. Bu yollarda
     çıkarım, çerezi öneksiz ve `Secure` bayraksız basardı.
   - **Açılış kontrolü:** `NODE_ENV === 'production'` iken `AUTH_URL`, `NEXTAUTH_URL` ya da `AUTH_REDIRECT_PROXY_URL`
     tanımlıysa süreç başlamaz (tek yerde, `src/lib/auth-env-guard.ts`, `auth.ts` içe aktarımında çalışır).
   - **Dosyalar:** `docker-compose.yml:39` satırı kaldırılır. `.env.example:41-42` notu şöyle yeniden yazılır: "Auth.js
     taban URL'yi istek host'undan kurar (`trustHost`). Üretimde `AUTH_URL`/`NEXTAUTH_URL` **vermeyin**: beyaz etiket
     host'ları çalışmaz ve açılış kontrolü süreci durdurur. Yerel geliştirmede gerekmez."
   - **Sıralama şartı:** env satırının kaldırılması ve açılış kontrolü, iki host katmanı (Caddy §2.1 + proxy
     `resolveBrandHost` §2.2) canlıya çıktıktan **sonra** ya da aynı sürümde yapılır. Önce kaldırılırsa taban URL
     doğrulanmamış Host'tan kurulur. Uygulama kartının sürüm notu bu sırayı yazar.
   - **Çerez:** host-only kalır (Auth.js varsayılanı, `auth.ts`'te `cookies:` yok). `Domain=` yok, `__Secure-` öneki
     ve `Secure` bayrağı var: §2.3'teki test sabitler.
   - **Kapsam dışı yan bulgu (lider için, §8-L1):** bugünkü `fonbridge.com` dağıtımı bu compose ile yapılıyorsa Google
     dönüşü `http://localhost:3000/...` olur ve çerez `Secure` bayraksız basılır. B5'ten bağımsız, ayrı kart.
2. **Claim:** `jwt` callback'i `trigger === 'signIn'` iken `token.host`'u yazar (sıra 3. maddede). Host
   `resolveBrandHost` ile çözülemezse giriş reddedilir.
3. **Her okumada karşılaştırma (R2-Ö1: sıra açık).** Auth.js JWT stratejisinde `jwt` callback'i her oturum okumasında
   çağrılır ve `null` dönerse oturum çerezi temizlenir (`@auth/core/lib/actions/session.js:28-55`). Callback'in
   **başına** şu gelir. Kiracı filtresi (4. madde) ve mevcut mantık bunun ardından çalışır:
   ```ts
   const here = await resolveBrandHost(await headers());
   if (!here) return null;                                      // askıda / bilinmeyen host: giriş de okuma da yok
   const hereHost = here.kind === 'root' ? ROOT_HOSTNAME : here.hostname;

   if (trigger === 'signIn') {
     token.host = hereHost;                                     // (1) claim ÖNCE yazılır
   }
   const tokenHost = token.host ?? ROOT_HOSTNAME;               // geçiş: claim'siz eski token yalnız kökte geçerli
   if (tokenHost !== hereHost) return null;                     // (2) karşılaştırma SONRA (çapraz host replay, B-2)
   ```
   Karşılaştırma `signIn`'den önce yapılsaydı, claim henüz olmadığı için ajans host'undaki her giriş `ROOT_HOSTNAME`
   ile karşılaştırılıp reddedilirdi. `headers()` bu callback'te istek bağlamındadır. İstek dışında (graphile-worker
   işleri) `auth()` çağrılmaz. Çağrılırsa `headers()` hata atar ve callback `null` döner, yani kapalı kalır.
4. **Kiracılar arası kapı (Y-1):** aynı callback'te `here.kind === 'agency'` iken aday üyelikler
   `tenant.id === here.agencyId || tenant.agencyId === here.agencyId` ile filtrelenir. Bu filtre üç yere uygulanır:
   giriş, `unstable_update({ tenantId })` rebind'i (`auth.ts:696`) ve varsayılan üyelik (`memberships[0]` yerine
   filtrelenmiş kümenin ilki, `auth.ts:747`). Küme boşsa `null` döner ve giriş sayfası "Bu hesap bu ajansın panelinde
   değil, nexagrant.com'dan girin" der. Kiracı yine oturumdan gelir. Host kiracı seçmez, yalnız reddeder.
5. **Tek kontrol noktasının bekçisi (R2-Ö3):** host bağı yalnız `jwt` callback'inde. Onu atlayan bir okuma (çözülmüş
   token'ı doğrudan okuyan route handler) bağı sessizce deler. Bugün yok (`grep -rln "getToken\|next-auth/jwt" src`
   boş). Uygulama kartına kaynak bekçisi eklenir: `src/` altında `next-auth/jwt`, `@auth/core/jwt` içe aktarımı ve
   `decode(` çağrısı yasak (tek istisna yok). Oturum yalnız `auth()` ile okunur.
6. **Patlama yarıçapı:** ajans alanında basılan token yalnız o alanda ve yalnız o ajansın kurumlarıyla geçerlidir.
   Alanın DNS'ini ele geçiren taraf en fazla o ajansın kurumlarına erişir. `nexagrant.com`'a ve diğer ajanslara
   erişemez.
7. **Google OAuth (Ö-5):** sağlayıcıya `checks: ["pkce", "state"]`. `redirect` callback'i özelleştirilmez (aynı köken).

### 3.3 C yolu: merkezi giriş aracısı (Y-4, R2-Y3, R2-Ö4) — yalnız C'ye geçilirse

**Tarayıcı kuralı (tasarımın dayandığı):** `nexagrant.com` ile `oka.org.tr` farklı kayıtlı alanlardır. Aralarındaki her
istek siteler arasıdır. `SameSite=Lax` çerez siteler arası isteklerde yalnız üst düzey **GET** gezintisinde gönderilir,
POST'ta gönderilmez. Bu yüzden siteler arası her POST **çerezsiz** varsayılır ve çerez gerektiren her iş aynı köken
bir isteğe taşınır. `SameSite=None` kullanılmaz: nonce kimlik doğrulama değil bağ olsa da `None`, çerezi bütün üçüncü
taraf bağlamlarına açar ve tarayıcıların üçüncü taraf çerez kısıtlarına takılır. İki adımlı iniş daha az şaşırtıcıdır.

- Google yetki kodu ajans host'una **hiç** gitmez. `redirect_uri` yalnız `https://nexagrant.com/api/auth/callback/google`.
  Kodu aracı değiştirir.
- Auth.js `redirectProxyUrl` / `AUTH_REDIRECT_PROXY_URL` **yasak** (izin listesi olmadan `state.origin`'e
  yönlendiriyor). §3.2-1'deki açılış kontrolü bu değişkeni de kapsar.
- Otomatik gönderilen formlar CSP nonce'lu tek satırlık bir betikle gönderilir. `<noscript>` içinde "Devam" düğmesi
  vardır. Bu ara sayfalar `Cache-Control: no-store` ve **`Referrer-Policy: strict-origin`** taşır (İNCELEME-120 Y-2).
- **Neden `strict-origin`:** Fetch belirtimine göre CORS dışı bir POST'ta (form gönderimi) sayfanın politikası
  `no-referrer` ise tarayıcı `Origin: null` gönderir. Rev. 3'teki `no-referrer` bu yüzden adım 2 ve 6'daki Origin
  kontrollerini her meşru devirde düşürüyordu. `same-origin` politikası da siteler arası adım 2'de `null` verir.
  `strict-origin` her iki adımda gerçek kökeni gönderir. `Referer`'a yalnız kökeni koyar, yolu ve sorguyu hiç koymaz
  (aynı kökende de koymaz). Belirteç gövdede taşındığı için sızan bir şey yok. Aracıdaki `?r=<id>` de sızmaz.
  Uygulamanın genel `strict-origin-when-cross-origin`'i de Origin'i gönderir, ama aynı kökende tam URL'yi `Referer`'a
  koyar. Bu yüzden ara sayfalar değeri açıkça yazar. Ölçüm (`…-fe-fb-3-ekler/flow2*.log`, üç ayrı site, gerçek
  tarayıcı):

  | Politika | Adım 2 `Origin` | Adım 6 `Origin` | Adım 6 nonce çerezi | Chromium 151 | WebKit 26.6 |
  |---|---|---|---|---|---|
  | `no-referrer` (rev. 3) | `null` → ret | `null` → ret | var | aynı | aynı |
  | **`strict-origin` (rev. 4)** | panel kökeni → kabul | panel kökeni → kabul | var | aynı | aynı |
  | `strict-origin-when-cross-origin` | panel kökeni → kabul | panel kökeni → kabul | var | aynı | aynı |

  Saldırgan sitesi (üçüncü köken) iki politikayla da denendi (`no-referrer`, `unsafe-url`): aracıya POST'ta `Origin`
  `null` ya da saldırganın kökeni → ret. Doğrudan `complete`'e POST'ta `Origin` saldırganın kökeni ya da `null` → ret.
  Kurbanın `Lax` nonce çerezi de bu siteler arası POST'ta gelmez. İki tarayıcıda aynı sonuç.
- Uygulama notu: `next.config.ts`'teki `accept-invite` girdisinin `no-referrer` kalıbı (URL'de belirteç taşıyan GET
  sayfası için doğru) handoff yollarına **kopyalanmaz**. Handoff yolları için ayrı bir `headers()` girdisi
  `strict-origin` yazar. Ara sayfalar CSP'de `sandbox` taşımaz: `sandbox` kökeni opak yapar ve `Origin: null` gönderilir.

**Akış:**

1. **Başlatma (ajans host'u).** `panel.oka.org.tr/giris` → host-only `__Host-fb-handoff-nonce` çerezi basılır (32 bayt,
   `Secure; Path=/; SameSite=Lax; HttpOnly`, 5 dk). Sayfa `https://nexagrant.com/giris/araci` adresine POST formu
   gönderir: `{ target: 'panel.oka.org.tr', nonceHash }`.
2. **Aracı girişi (siteler arası POST, çerezsiz).**
   - **Origin kontrolü (R2-Ö4, İNCELEME-120 Y-2):** üç dal, sırayla:
     1. `Origin` başlığı **var ve `null` değil** → `https://<target>` ile **tam** eşleşmeli, değilse ret.
     2. `Origin: null` → **ret**. Geri düşüş yok. `null`'u opak köken üretir: `no-referrer` politikalı bir sayfa, `sandbox`
        ya da `data:` gibi. Meşru akışın ara sayfası `strict-origin` taşıdığı için gerçek kökeni gönderir.
     3. `Origin` başlığı **hiç yok** (form POST'unda Origin göndermeyen eski tarayıcı) → `Sec-Fetch-Site` `cross-site`
        olmalı ve `Referer`'ın kökeni `https://<target>` olmalı. İkisinden biri eksikse ret.

     Bu, istek tablosunun üçüncü taraf sitelerden doldurulmasını ve login-CSRF'e benzer tetiklemeleri keser.
   - `target` `resolveBrandHost` mantığıyla doğrulanır: `ACTIVE` olmalı, **tam eşleşme** aranır, sonek eşleşmesi
     yapılmaz, DNS kontrolü son 24 saat içinde olmalı. `nonceHash` 64 hex karakter olmalı.
   - Aracı sunucu tarafında `HandoffRequest { id (32 bayt), targetHost, nonceHash, expiresAt = now + 5 dk, usedAt }`
     yazar (DB'de `sha256(id)`) ve **`303`** ile `GET https://nexagrant.com/giris/araci?r=<id>`'ye yönlendirir. Bu GET
     üst düzey gezinti olduğu için aracının kendi `Lax` oturum çerezleri gelir (R2-Y3'ün 1. adım yarısı). `r` bir
     kimlik bilgisi değildir: yalnız hedef ve `nonceHash`'e işaret eder, tek kullanımlıktır ve sonucu yalnız o nonce
     çerezini taşıyan tarayıcı kullanabilir.
3. **Aracıda giriş.** `r` tüketilir (`UPDATE … SET usedAt = now() WHERE … AND usedAt IS NULL AND expiresAt > now()
   RETURNING …`). Oturum yoksa Google girişi aracıda yapılır, dönüşte `r`'nin sonucu sunucu tarafında oturuma bağlı
   tutulur. Bir tarayıcı bir host'u ilk kez görüyorsa "Ankara Kalkınma Ajansı paneline giriş yapıyorsunuz
   (panel.oka.org.tr)" ara ekranı çıkar.
4. **Belirteç.** Aracı `HandoffToken { id (32 bayt), userId, targetHost, nonceHash, expiresAt = now + 60 sn, usedAt }`
   yazar. DB'de yalnız `sha256(id)` saklanır. Tarayıcıya otomatik gönderilen bir **POST formu** döner
   (`action="https://panel.oka.org.tr/api/auth/handoff"`). Belirteç URL'de taşınmaz.
5. **İniş, 1. adım: `POST /api/auth/handoff` (siteler arası, çerezsiz).** Hedef belirteci **tüketmez**, DB'ye gitmez.
   Yalnız biçimi (uzunluk, karakter kümesi) ve host'u (`resolveBrandHost` → `ACTIVE`) denetler. Aynı kökene otomatik
   gönderilen ikinci bir POST formu döner (`action="/api/auth/handoff/complete"`, belirteç gövdede). Bu adımın hiçbir
   yan etkisi yoktur. Saldırganın buraya POST'lamasının getirisi yoktur.
6. **İniş, 2. adım: `POST /api/auth/handoff/complete` (aynı köken, `Lax` nonce çerezi gelir).**
   - `Origin` `https://<bu host>` olmalı (aynı köken). `null`, yok ya da başka bir değer → ret (İNCELEME-120 Y-2: 5.
     adımdaki ara sayfa `strict-origin` taşıdığı için meşru istekte `Origin` bu host'tur, ölçüldü).
   - `UPDATE … SET usedAt = now() WHERE hash = $1 AND usedAt IS NULL AND expiresAt > now() AND targetHost = $host
     RETURNING …` ile belirteç tek kullanımda tüketilir.
   - `sha256(çerezdeki nonce) === nonceHash` olmalı (sabit zamanlı karşılaştırma). Çerez yoksa ya da eşleşmezse ret.
     Belirteç zaten tüketilmiştir, yeniden denenemez.
   - Nonce çerezi silinir. Oturum §3.2'deki `host` claim'iyle basılır, Y-1 filtresi uygulanır.
   - **Gevşetme yasağı:** nonce kontrolü uygulama kartında "kaldırılamaz" olarak işaretlenir. Test: nonce çerezi
     olmadan (ya da başka tarayıcının nonce'uyla) gelen geçerli belirteç reddedilir.
7. **Çıkış senkronu (aynı kural).** Hedef host'ta çıkış (aynı köken POST, Auth.js `signOut`) yapılınca yanıt `303` ile
   `GET https://nexagrant.com/giris/cikis?from=<host>` adresine gider. Bu üst düzey GET'te aracının oturum çerezi gelir.
   Sayfa "nexagrant.com oturumunu da kapat" onayını gösterir. Onay, aracının kendi kökenine yapılan bir POST'tur
   (Auth.js CSRF belirteciyle). GET ile kendiliğinden çıkış yapılmaz (çıkış-CSRF). Rev. 2'deki siteler arası
   `POST /api/auth/handoff/logout` kaldırıldı: `Lax` altında aracının çerezi o POST'ta gelmezdi.
- CSP `form-action`'a `https://nexagrant.com` eklenir (yalnız ajans host'unda). Aracıda `form-action`'a o ajans host'u
  eklenir. Joker kullanılmaz, liste `AgencyDomain`'den gelir.
- Uygulama kartının e2e'si gerçek tarayıcıda (Chromium + WebKit) iki kayıtlı alanla koşar. İNCELEME-114 bu davranışı
  tarayıcıda koşmadan (belirtimden) çıkardı. İNCELEME-120 ve rev. 4 iki adımlı inişi, `Lax` nonce çerezinin gelişini ve
  Origin'i yerel düzende ölçtü (http, `127.0.0.1` / `localhost` / `[::1]` üç ayrı site). HTTPS'teki davranış kartta
  doğrulanır. E2E'de şu satırlar zorunludur: (a) ara sayfaların yanıt başlığında `Referrer-Policy: strict-origin`;
  (b) adım 2 ve adım 6'ya gelen `Origin` beklenen köken; (c) ara sayfa politikası `no-referrer`'a çevrilince adım 2
  ve 6 ret (politikanın neden seçildiğini sabitleyen negatif test); (d) üçüncü köken ve `Origin: null` ret.

---

## 4. Veri modeli (Y-2), askıya alma (Y-3) ve kenar eşitleyicisi (R2-Y2)

### 4.1 Güven sınırı veri modelinde

| Alan | Yer | Kim yazar |
|---|---|---|
| `logoKey`, `name`, `accent`, `accentDark`, `faviconKey` | `Tenant.settings.cobrand` (v2) | ajans `TENANT_OWNER/ADMIN` |
| `mode` (whitelabel açık/kapalı), `mail.displayName`, `replyTo`, `replyToVerifiedAt`, `replyToTokenHash`, `replyToTokenExpiresAt` | yeni `AgencyWhitelabel { agencyId @id, … , updatedAt, updatedBy }` | yalnız platform yöneticisi eylemi |
| `hostname`, `status`, `verifyToken(Hash)`, `lastCheckedAt` | `AgencyDomain` (rev. 1 §2.1) | platform yöneticisi + DNS kontrol işi |
| `hostname`, `syncedGeneration`, `edgeSyncedAt`, `edgeError`, `verifiedAt` | yeni `AgencyDomainEdgeState` | `fb_edge_sync` DB rolü (§4.3). Web kodu yazmaz. DB'de nasıl zorlandığı aşağıda (İNCELEME-120 Ö-4) |

- **`AgencyDomainEdgeState` yazma yetkisi (İNCELEME-120 Ö-4, İNCELEME-122 Ö-6).** Tabloyu açan migrasyon dosyası
  (düz `.sql`, `prisma/migrations/apply-order.txt`'e eklenir; `scripts/apply-migrations.sh` her dosyayı
  `psql -v ON_ERROR_STOP=1` ile, tablo sahibi rolle koşar ve zinciri **iki kez** koşar: CI idempotensi kapısı)
  depodaki desene uyar: rol var mı diye bakan `DO` bloğu (`prisma/migrations/add-public-lead.sql:49-54`,
  `add-agency-funnel.sql:84-89`). Çıplak `GRANT … TO fb_edge_sync` yazılmaz: rol yoksa `ERROR: role does not exist`
  ile zincir durur (ölçüldü, aşağıda).
  ```sql
  REVOKE ALL ON "AgencyDomainEdgeState" FROM PUBLIC;
  DO $$
  BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fabrika_app') THEN
      -- ALTER DEFAULT PRIVILEGES (rls-app-role.sql:62-76) bu tabloya zaten SELECT/INSERT/UPDATE/DELETE verdi.
      -- GRANT SELECT onu daraltmaz, bu REVOKE şart.
      REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON "AgencyDomainEdgeState" FROM fabrika_app;
      GRANT SELECT ON "AgencyDomainEdgeState" TO fabrika_app;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fb_edge_sync') THEN
      GRANT SELECT, INSERT, UPDATE ON "AgencyDomainEdgeState" TO fb_edge_sync;
    END IF;
  END $$;
  REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON "AgencyDomainEdgeState" FROM fabrika;  -- bugünkü web bağlantısı (etkisiz, aşağıya bak)
  ```
  **Boru hattında üç şey yazıldığı gibi çalışmıyordu (İNCELEME-122 Ö-6), ölçüldü** (`postgres:16`, `fabrika` SUPERUSER,
  sıra `prisma/rls-app-role.sql` → tablo + bu blok; yöntem sonuç raporu fe-fb-4):
  1. **`fabrika_app` zaten yazabiliyor.** `rls-app-role.sql:59` mevcut tablolara, `:62-76` sahip rolün (`fabrika`,
     `fabrika_migrate`) sonradan açacağı tablolara DML verir. Eski blokta yalnız `GRANT SELECT` vardı; GRANT eklemelidir,
     daraltmaz. Ölçüm: eski blok sonrası `fabrika_app` INSERT/UPDATE/DELETE = `t|t|t`, gerçek `INSERT` başarılı. Üstteki
     `REVOKE … FROM fabrika_app` ile `f|f|f`. (Önceki ek `grant.sql` bunu görmedi: `rls-app-role.sql` koşmadan kuruldu.)
  2. **`db:rls-role` yeniden koşunca REVOKE geri alınır.** `setup-rls-role.ts` her koşuda `rls-app-role.sql:59`
     `GRANT … ON ALL TABLES` verir. REVOKE sonrası `pnpm db:rls-role` tekrar koşulursa `fabrika_app` yine `t|t|t`
     (ölçüldü). `RELEASE_CHECKLIST.md` §2 sırası (`db:rls-role` → migrasyonlar) ve CI sırası bunu karşılar, çünkü
     migrasyon sonra gelir. Ama canlıda `db:rls-role` tek başına (parola döndürme) koşulursa kısıt düşer. Uygulama
     kartı iki şeyden birini yapar: `rls-app-role.sql` adım 3'ü bu tabloyu dışarıda bırakacak şekilde değiştirmek
     **(kod, bu belgenin kapsamı dışı)**, ya da `db:rls-role` sonrası `apply-migrations.sh`'in her zaman koşmasını
     checklist'e zorunlu yazmak. Öneri: ilki; ikincisi bir insan adımına bağlı kalır.
  3. **`fb_edge_sync` rolünü depodaki hiçbir betik açmıyor** (`fabrika_migrate` da yalnız `.env.example:21` ve
     `rls-app-role.sql:65`'te adıyla geçer). Rol, apply-migrations'tan **önce** ve parolası `.sql` dosyasına yazılmadan
     açılmalıdır (`setup-rls-role.ts` deseni: parola ortam değişkeninden). Yeni bir `db:edge-sync-role` adımı, uygulama
     kartının işi; checklist §2'ye `db:rls-role`'den sonra, `apply-migrations`'tan önce girer. Rol sonradan açılırsa
     `DO` bloğu o koşuda atlanmıştır: `apply-migrations.sh` bir kez daha koşulur (idempotent).
  **Sınır, açıkça:** web bugün `DATABASE_URL` ile `fabrika` rolüne bağlanıyor. Bu rol SUPERUSER + BYPASSRLS
  (`docs/ROADMAP.md` #16; patron 29.09: bağlantı `fabrika_app`'e geçmiyor). Süper kullanıcı GRANT'a bakmaz. Ölçüldü
  (`postgres:16`, `…-fe-fb-3-ekler/grant.log`): `fabrika_app` `INSERT` → `permission denied`, `fb_edge_sync` yazar,
  `fabrika` REVOKE'tan sonra da `UPDATE` yapar. Yani kısıt web bağlantısı NOSUPERUSER bir role geçtiği gün etkin
  olur. O güne kadar tablo satırı şu anlama gelir: **web kodu yazmaz, DB bunu zorlamaz.** Web'de RCE olursa saldırgan
  bu tabloyu, `AgencyDomain`'i ve `CHECK` kısıtını istediği gibi değiştirebilir. Bu risk B5'e özgü değil, bugünkü
  bağlantının genel riskidir. B5 tasarımı buna şöyle dayanır:
  - Kenar etkilenmez. Katman 3 (eşitleyicinin kendi doğrulaması + `adapt` değişmezleri, §4.3) DB'ye güvenmez.
  - Paneldeki "kenar: senkron" yazısı yanıltılabilir. Bu yüzden 2 dakikalık alarmı web değil **eşitleyici kendisi
    verir** (journald + kendi bildirim kanalı, §4.3-6). Panel yalnız gösterir.
  - Kaynak bekçisi (aşama 1b): `src/` altında `agencyDomainEdgeState` üzerinde `create`/`update`/`upsert`/`delete`
    ve tablo adını içeren `$executeRaw` yok.
  Web bağlantısının değişmesi B5'in işi değil. Lider notu: §8.2-L3.
- `cobrand` yazımı `jsonb_set` ile yalnız kendi anahtarlarını değiştirir. Bugünkü bütün-nesne değiştirme
  (`src/lib/agency/cobrand-store.ts:113-116`) v2'de kaldırılır.
- `AgencyWhitelabel` ve `AgencyDomain` üzerindeki her değişiklik `AuditEvent`'e yazılır (eski ve yeni değer; Reply-To
  belirteci hariç).
- `AgencyDomain.hostname` üzerinde DB `CHECK` kısıtı: §4.3-1'deki düzenli ifade (`~`) ve kök alan dışlaması. Uygulama
  doğrulamasına ek, üçüncü katman.
- Üç yeni tablo için FONBRIDGE'in yeni-tablo kapıları uygulama kartına not edilir: `where-guard-src`, teardown guard,
  `rls:bypass-check` izin listesi. `resolveBrandHost` oturum öncesi okuduğu için tek bir sistem-okuma fonksiyonuna
  sınırlanır.

### 4.2 Askıya alma

Platform yöneticisi paneli "askıya al" → **web uygulamasında** tek eylem (yalnız DB):

1. `AgencyDomain.status = SUSPENDED` + `AuditEvent` + süreç içi harita boşaltma + `pg_notify('agency_domain_edge')`,
   aynı işlemde. Uygulama katmanı bu andan itibaren 421 döner (§2.2). Açık oturumlar bir sonraki okumada `null` olur
   (§3.2-3).
2. **Kenar (eşitleyici, §4.3):** bildirimle ya da en geç 60 sn'lik zamanlayıcıyla uyanır, bloğu içermeyen ajans
   dosyasını üretir, doğrular, `caddy reload` yapar ve kaldırılan host'un sertifikasını depodan siler (tekrar eklenirse
   LE'den yeni sertifika alınır). Statik blokta reload TLS'i kapatır (§2.1, ölçüldü).
3. **Doğrulama (eşitleyici):** `curl --resolve <host>:443:127.0.0.1 https://<host>/` → TLS hatası ya da 421. Sonuç
   `AgencyDomainEdgeState`'e yazılır. Panel bunu okur: "kenar: senkron / bekliyor / hata". 2 dk içinde senkron
   olmazsa kayıt "yarım" kalır ve eşitleyici yöneticiye alarm gönderir (alarm DB'deki duruma değil, eşitleyicinin
   kendi sonucuna dayanır, §4.1 Ö-4). Bu arada uygulama katmanı zaten kapalıdır.
4. Google Cloud: ilgili `redirect_uri` ve yetkili alan istemciden kaldırılır. Bu adım elle yapılır ve panelde
   işaretlenir (istemci yönetimi API'si yok). Adım işaretlenmeden kayıt "tamamlandı" sayılmaz.
5. Ajansa "CNAME'i kaldırın" e-postası. Alan 180 gün `SUSPENDED` kalır. Aynı hostname yeniden talep edilirse yeni TXT
   doğrulaması gerekir (rev. 1 §5).

Etkinleştirme aynı yoldan simetriktir: `ACTIVE` → eşitleyici bloğu ekler → Caddy LE'den sertifika alır → eşitleyici
`curl --resolve` ile 200 doğrular. On-demand'a geçilirse 2. adım "yeniden başlat" olur (se-fb İNCELEME-111 1.2-F). Bu
fark çalışma kitabına yazılır.

### 4.3 Kenar eşitleyicisi `fb-edge-sync` (R2-Y2: çekme modeli)

**İlke:** web uygulaması kenar yapılandırmasına **hiç** erişmez. Web'de bir RCE ya da SSRF, kenarı ele geçirmeye
(`strict_sni_host`'u kaldırma, kendi host'unu ekleme, TLS'i yönetme) dönüşmez. Web'in kenara etkisi DB'deki
`AgencyDomain` satırlarıyla sınırlıdır, onlar da §4.3-1'deki doğrulamadan geçer.

**Sahibi:** devop-fb (işletme güven sınırı). Kod depoda `ops/edge-sync/`. Uygulama kartı aşama 1b.

1. **Hostname doğrulaması (üç katman, aynı kural):**
   - Kural: `normalizeHost` sonrası (küçük harf, punycode)
     `^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$`. Joker (`*`) yok. IP değil (IPv4 ya da
     köşeli IPv6 biçimi reddedilir). Kök alanımıza eşit ya da altında olamaz (`nexagrant.com`, `*.nexagrant.com`).
     Karar-2 A gereği kayıtlı alanın kendisi ya da bir genel son ek olamaz (İNCELEME-120 Ö-1):
     ```ts
     const d = getDomain(h, { allowPrivateDomains: true });   // tldts
     if (d === null || d === h) reddet;                       // null = h genel son ekin kendisi (org.tr, gov.tr, com)
     ```
     Rev. 3'teki `getDomain(h) !== h`, `org.tr` için `null !== 'org.tr'` olduğundan kabul veriyordu.
     `allowPrivateDomains: true` PSL'in özel bölümünü de sayar: `github.io` bir son ektir, `ajans.github.io` kayıtlı
     alandır ve reddedilir, `panel.ajans.github.io` kabul edilir. `tldts`'in varsayılanı özel bölümü saymaz. O zaman
     `ajans.github.io` kabul edilirdi.
     **Kütüphaneler:** web `tldts` (sürüm sabit), eşitleyici `tldextract` (`suffix_list_urls=()`, `cache_dir=None`,
     `include_psl_private_domains=True`, yani pakete gömülü liste, çalışma anında ağ yok, sürüm sabit). Ölçüldü:
     `tldts` 7.4.16 ve `tldextract` 5.3.0, 9 örnekte aynı sonucu verdi (`…-fe-fb-3-ekler/psl*.log`). İki listenin tarihi
     farklı olabilir. Katman 1 ile 3 anlaşamazsa eşitleyici durur ve alarm verir (kapalı kalır). Kök alanımız
     (`nexagrant.com`) ayrıca açık listeyle dışlanır.
   - Katman 1: web, yazma anında (`isValidAgencyHostname`, platform yöneticisi eylemi): düzenli ifade + PSL.
   - Katman 2: DB `CHECK` kısıtı (§4.1): düzenli ifade + kök alan dışlaması (PSL DB'de yok, katman 1 ve 3 yapar).
   - Katman 3: eşitleyici, şablona koymadan hemen önce, bağımsız kendi kopyasıyla. Tek bir geçersiz satır bütün
     üretimi durdurur (kısmi dosya yazılmaz), hata `AgencyDomainEdgeState`'e ve alarma gider.
   - Düzenli ifade `{`, `}`, boşluk, satır sonu, `#`, `import`, `*`, `/`, `:` gibi Caddyfile sözdizimi karakterlerini
     yapısal olarak dışlar. Enjeksiyon yüzeyi kalmaz.
   - **Tam eşleşme şartı (rev. 3'te ölçüldü):** Python'da `re.match(r'^…$', 'panel.oka.org.tr\n')` **True** döner:
     `$` sondaki satır sonundan önce de eşleşir. Satır sonu, Caddyfile'a yeni satır enjeksiyonunun tam aracıdır.
     Eşitleyici `re.fullmatch` kullanır (ölçüldü: aynı girdiye `False`). JS'te `m` bayrağı olmadan `test()`
     yeterlidir. Postgres `~` ARE'de `$` dize sonudur. Üç katmanın testi de `'<geçerli>\n'` ve `'<geçerli>\r\n'`
     girdisinin reddini içerir.
2. **Çalışma biçimi:** ana makinede systemd servisi, `caddy` kullanıcısı olarak (root değil). Yazma izni yalnız
   `/etc/caddy/agencies.d/` (sahibi `caddy`, `0750`) ve Caddy sertifika deposu. Ana Caddyfile `root:root 0644`,
   eşitleyici yazamaz. `.tmp` aynı dizinde durur, bu yüzden `rename` aynı dosya sisteminde ve atomiktir. Eşitleyici
   biriminin ortamında `FB_AGENCIES` **tanımlı değildir**. Değişkeni yalnız 4. adımdaki `adapt` alt sürecine verir.
3. **DB erişimi:** ayrı rol `fb_edge_sync`: `AgencyDomain(hostname, status)` üzerinde yalnız `SELECT` (görünüm
   `agency_domain_active_v`), `AgencyDomainEdgeState` üzerinde `INSERT/UPDATE`. Başka tabloya yetki yok, RLS bypass yok.
   Bağlantı dizesi ana makinede `/etc/fb-edge-sync/env` (`0600 caddy`), web konteynerine verilmez. `LISTEN
   agency_domain_edge` + 60 sn zamanlayıcı yedeği (bildirim kaybolursa en geç 60 sn).
4. **Üretim döngüsü (İNCELEME-120 Y-1: denetim yeni dosyada yapılır):**
   1. ACTIVE listesini oku → 3 katman doğrulaması → sayı üst sınırı (≤ 50 host; aşılırsa dur, alarm).
   2. `/etc/caddy/agencies.d/agencies.caddy.tmp`'ye sabit şablonla yaz.
   3. **Yeni dosyayı denetle.** `FB_AGENCIES=/etc/caddy/agencies.d/agencies.caddy.tmp caddy adapt --config
      /etc/caddy/Caddyfile`. Değişken yalnız bu alt sürecin ortamındadır. Ana dosyanın `import
      {$FB_AGENCIES:…}` satırı (§2.1) bu çağrıda `.tmp`'yi okur. JSON üzerinde değişmezler denetlenir:
      - `apps.http.servers.*.strict_sni_host === true` (her sunucu),
      - tam bir `static_response` 421 rotası (catch-all),
      - `admin.listen` bir unix soketi,
      - rotalardaki `match[].host[]` birleşim kümesi == DB'deki ACTIVE küme ∪ {`nexagrant.com`, `www.nexagrant.com`}.
        Fazlası ya da eksiği varsa dur.

      `adapt` hata verirse ya da bir denetim tutmazsa `.tmp` silinir, canlı dosyaya dokunulmaz, sonuç ve hata yazılır.
      Yer tutucusuz `adapt` canlı dosyayı okur (rev. 3'ün hatası). Test bunu sabitler (§2.3).
   4. `rename(.tmp → agencies.caddy)`: atomik yerleştirme.
   5. `env -u FB_AGENCIES caddy reload --config /etc/caddy/Caddyfile --address unix//run/caddy/admin.sock`.
      Yer tutucusuz olduğu için canlı yolu okur. Biraz önce denetlenen dosya artık o yoldadır.
   6. **Çalışan yapılandırmayı denetle:** `GET /config/` admin soketinden (`curl --unix-socket /run/caddy/admin.sock
      http://localhost/config/`). 3. adımdaki host kümesi ve değişmezler Caddy'nin **yüklediği** JSON'da yeniden
      denetlenir. Bu, denetim (3) ile yükleme (5) arasındaki yeniden çevirmenin farkını kapatır: yükleme sırasında ana
      dosya ya da ortam değişmişse fark burada yakalanır.
   7. `curl --resolve` doğrulaması (ACTIVE'ler 200, kaldırılanlar TLS hatası/421) → `AgencyDomainEdgeState`'e
      `syncedGeneration`, sonuç ve hata.

   5-7'den biri başarısızsa dosya yerleşmiş ama doğrulanmamıştır: sonuç "hata" yazılır, alarm gider ve bir sonraki
   döngü aynı adımları yeniden koşar. `reload` hatasında Caddy son geçerli yapılandırmada çalışmaya devam eder
   (ölçüldü). Ölçüm (`caddy:2.11.4`, bu adımların kabuk karşılığı `…-fe-fb-3-ekler/sync.sh`, ham çıktı `caddy-sync.log`, özet):
   ```
   0. rev.3 hatası: yer tutucusuz adapt   → ["nexagrant.com","www.nexagrant.com"]            (.tmp'deki panel.oka.org.tr YOK)
      aynı .tmp, FB_AGENCIES ile          → ["nexagrant.com","panel.oka.org.tr","www.nexagrant.com"]
   1. etkinleştirme OKA   adapt(tmp) = beklenen · reload rc=0 · çalışan küme = beklenen → senkron
   2. ikinci ajans        adapt(tmp) = beklenen · reload rc=0 · çalışan küme = beklenen → senkron
   3. askıya alma OKA     adapt(tmp) = {nexagrant.com panel.baka.gov.tr www.nexagrant.com} · çalışan küme aynı → senkron
   4. fazladan blok       adapt(tmp) kümesinde evil.example.com → DUR: küme farkı (canlı dosya değişmedi)
   5. ":443 {…}" satırı   DUR: adapt hatası: ambiguous site definition: :443
   6. FB_AGENCIES rename sonrası ortamda → reload: File to import not found: …agencies.caddy.tmp
   ```
5. **Web konteynerinin kenara erişemediğinin sabitlenmesi:** compose bekçisi (CI, §2.3): `fabrika-web` hizmetinde
   `/var/run/docker.sock`, `/etc/caddy`, `/run/caddy` bağı ve `network_mode: host` yok. Caddy admin API'si TCP'de
   dinlemez (ana dosyada `admin unix//…`), bu yüzden konteyner ağından `:2019`'a ulaşılamaz. Canlı kontrol listesi:
   `ss -ltn | grep 2019` boş.
6. **Hata ve gözlem:** her döngü `journald`'a tek satır yazar (üretim no, host sayısı, sonuç). Panelde "kenar" sütunu.
   2 dk'dan uzun "bekliyor" ya da "hata" → alarmı eşitleyici kendisi gönderir (§4.1 Ö-4). Web'in bu tabloya
   yazabilmesi alarmı bastıramaz.

---

## 5. HSTS (Ö-3, Karar-1 C)

- **`fonbridge.com`: Karar-1 C (patron, 30.09) uygulandı.** HSTS yalnız Caddy'de. Uygulama başlığı kaldırıldı
  (`devop-fb/merge-hsts`, `c6fad2ac`, dev'de: `security-headers.ts`'te `HSTS_VALUE` yok). Kurulum sırası
  `docs/SMTP-SUNUCU.md` §10.1 ve `docs/RELEASE_CHECKLIST.md` §5.4'te (gün 1 `max-age=300` → sonra `31536000`).
  `includeSubDomains` kökte yok. `RELEASE_CHECKLIST.md` §5.4-3'teki "gün 366: `includeSubDomains` eklenebilir"
  maddesi yalnız `nexagrant.com` bloğu içindir, ajans bloklarına kopyalanmaz.
- **Ajans host'u:** `max-age=31536000`, `includeSubDomains` **yok**. Karar-2 A ile yalnız alt alan desteklendiği için
  etki `*.panel.<ajans>` ile sınırlı olurdu. Yine de gönderilmez: ajansın alt alan düzenine karışmıyoruz. Başlık
  şablonun sabit kısmındadır (§2.1), eşitleyici değiştiremez.
- **`header >` (değiştir) kalır, gerekçe değişti:** uygulama artık başlık göndermediği için bugün tek başlık çıkar.
  `>` savunma derinliğidir: uygulama bir gün başlığı yeniden eklerse Caddy'ninki onu değiştirir ve tek başlık kalır.
  Rev. 2'nin ölçümü (ek `spike-hsts.Caddyfile`: `>` olmadan iki başlık çıkıyor, RFC 6797 §8.1'e göre tarayıcı ilkini
  işliyor) bu gerekçenin kanıtıdır. Uygulama kartı: SMTP-SUNUCU.md §10.1'deki satır `header >Strict-Transport-Security …`
  olarak yazılır (B5 aşama 1'de ana dosya zaten değişiyor).
- Rev. 2'deki yedek plan (`next.config.ts` başlık kurallarını `has: host` ile ikiye bölmek) **silindi**: Karar-1 C ile
  gereksiz.

---

## 6. Bulgu yanıt tabloları

### 6.1 İNCELEME-111 (rev. 2'de kapatıldı; İNCELEME-114 hükmüyle)

| # | Bulgu (kısa) | Yanıt | İNCELEME-114 | Nerede |
|---|---|---|---|---|
| **B-1** | Host kapısı `/api/*`'yi kapsamıyor | Caddy katmanı + proxy `/api/:path*` + `resolveBrandHost()` + `jwt` callback | KAPANDI (ölçüldü) | §2 |
| **B-2** | Oturum host'a bağlı değil | seçenek (b): host-only çerez + JWT `host` claim + her okumada karşılaştırma | KAPANDI | §3.1-3.2 |
| **Y-1** | Kiracı kapısı yalnız girişte | filtre giriş, rebind ve varsayılan üyelikte, her okumada | KAPANDI | §3.2-4 |
| **Y-2** | Platform alanları ajansın yazdığı JSON'da | ayrı `AgencyWhitelabel`, `jsonb_set`, denetim kaydı | KAPANDI | §4.1 |
| **Y-3** | Askıya alma çalışma kitabı eksik | tek eylem + doğrulama + Google adımı, reload | KAPANDI (içerik); mekanizma → R2-Y2 | §4.2 |
| **Y-4** | C devri tarayıcıya bağlı değil | Google kodu aracıda, `redirectProxyUrl` yasak, nonce, tek kullanım, POST | KISMEN → rev. 3'te R2-Y3 ile tamamlandı | §3.3 |
| **Y-5** | DMARC `p=reject` önkoşulu | E1 önkoşulu, takvim bağımlılığı | KAPANDI | §7 |
| **Y-6** | `From` dize, ad politikası yok | `{ name, address }` + ad kuralları + ikinci onay; `cobrand.name` dahil | KAPANDI | §4.1, §7 |
| Ö-1 | Host normalizasyonu | `normalizeHost()` | KAPANDI (büyük harf Caddy'den geçiyor, şart) | §2.2 |
| Ö-2 | `ask` ucu | kapsam dışı: on-demand yok | KAPANDI | §2.1 |
| Ö-3 | HSTS `includeSubDomains` | ajansta yok; kökte Karar-1 C | KAPANDI (Karar-1 C); belge metni rev. 3'te güncellendi | §5 |
| Ö-4 | Tema notları | ICO/SVG favicon reddi, HTML şablon yasağı, `/api/brand/*` host kapısından | KAPANDI | §2.2 |
| Ö-5 | OAuth `state` | `checks: ["pkce", "state"]` | KAPANDI | §3.2-7 |
| Ö-6 | Reply-To ayrıntısı | 32 bayt, hash, 24 sa, tek kullanım, sıfırlama, askıda kullanılmaz | KAPANDI | §4.1 |
| Ö-7 | E2 SPF/DKIM/DMARC | aşama 2'ye | KAPANDI (ertelendi) | rev. 1 §4 |

### 6.2 İNCELEME-114 (rev. 3)

| # | Bulgu | Karar | Belgede nerede |
|---|---|---|---|
| **R2-Y1** | `AUTH_URL`/`NEXTAUTH_URL` ve `useSecureCookies` tasarımda yok. `docker-compose.yml:39` `NEXTAUTH_URL=http://localhost:3000` sabit, `__Secure-` iddiası tutmuyor | **Kabul.** Üretimde iki değişken de yok; `useSecureCookies: NODE_ENV === 'production'` açık; açılış kontrolü (`AUTH_REDIRECT_PROXY_URL` ile aynı yerde); compose satırı kaldırılır, `.env.example` notu yeniden yazılır; sıralama şartı: iki host katmanı canlıdayken ya da aynı sürümde. Test: çerez adı/`Secure`/`Domain`, açılış çıkışı. Yan bulgu lidere | §0-2, §3.2-1, §2.3, §8-L1 |
| **R2-Y2** | Askıya alma otomasyonu Caddy'yi kimin, hangi yetkiyle yazdığını söylemiyor; web'e kenar yetkisi ve Caddyfile enjeksiyonu | **Kabul, se-fb'nin çekme modeli.** `fb-edge-sync` (devop-fb, `caddy` kullanıcısı, ayrı salt-okur+durum DB rolü) üretir; web yalnız DB'ye yazar; admin API unix soketinde; hostname üç katmanda (web, DB `CHECK`, eşitleyici); `caddy adapt` ile değişmez denetimi ve küme eşitliği; atomik yerleştirme; compose bekçisi | §0-3, §2.1, §4.1, §4.2, §4.3, §2.3 |
| **R2-Y3** | C: `SameSite=Lax` nonce çerezi siteler arası otomatik POST'ta gönderilmez | **Kabul, iki adımlı iniş.** `/api/auth/handoff` (çerezsiz, yan etkisiz) → aynı köken `/api/auth/handoff/complete` (tüketme + nonce + oturum). Aracı girişi `303` → GET, durum sunucu tarafı `HandoffRequest`'te. Çıkış senkronu da düzeltildi (üst düzey GET + onaylı aynı köken POST). `SameSite=None` gerekçeyle reddedildi. Nonce kontrolü "kaldırılamaz" + test | §3.3 |
| **R2-Ö1** | `jwt` parçasında claim/karşılaştırma sırası | **Kabul.** `signIn`'de önce claim, sonra karşılaştırma; kod parçası yeniden yazıldı; üç test | §3.2-3, §2.3 |
| **R2-Ö2** | Kök `[locale]` + statik uzantılı yolda server action proxy'yi atlıyor | **Kabul.** Matris sütunu `POST /x.png` + `Next-Action`; oturumsuz eylemler `assertBrandHost()` çağırır (bugün `submitReadinessLead`); `'use server'` bekçisi | §2.2, §2.3 |
| **R2-Ö3** | `getToken`/`decode` bekçisi | **Kabul.** `next-auth/jwt`, `@auth/core/jwt`, `decode(` yasak; kaynak bekçisi + kasıtlı kırma testi | §3.2-5, §2.3 |
| **R2-Ö4** | C aracısı girişinde Origin kontrolü | **Kabul.** `Origin` == `https://<target>` tam eşleşme; yoksa `Sec-Fetch-Site` + `Referer` kökeni; ikisi de yoksa ret. İniş 2. adımında aynı köken `Origin` | §3.3-2, §3.3-6 |
| **R2-Ö5** | `pg_notify`/`LISTEN` | **Kabul, sadeleştirme.** Web tek örnekte süreç içi boşaltma + TTL 30 sn; `LISTEN`'i eşitleyici yapar (ayrı süreç, zaten `pg` kullanır); web'de `LISTEN` ikinci örnek kartına | §2.2, §4.3-3 |
| İNCELEME-114 §5.1 | Aşama 1 alt ucu 13,5 yazılmış, doğrusu 13 | **Kabul.** Düzeltildi, yeni kalemler eklendi | §7 |
| İNCELEME-114 §5.2 | Belge Karar-1 C ve Karar-2 A ile bayat | **Kabul.** §0-4/5, §1.2 (rev. 3 numarası: §1.1), §5, §8-2, §8-9 güncellendi; HSTS yedek planı silindi; `>` gerekçesi yeniden yazıldı | §0, §1.2, §5, §8 |

İNCELEME-120'nin bu tablo için hükmü: R2-Y1, R2-Ö1..Ö5, §5.1, §5.2 KAPANDI. R2-Y2 ve R2-Y3 KISMEN. Eksik kalan kısımlar
§6.3'te Y-1 ve Y-2 olarak kapatıldı.

### 6.3 İNCELEME-120 (rev. 4)

| # | Bulgu | Karar | Belgede nerede |
|---|---|---|---|
| **Y-1** | §4.3-4 döngüsü `caddy adapt`'ı yeni `.tmp` üzerinde değil, ana dosyanın içe aktardığı eski `agencies.caddy` üzerinde koşuyor. Küme denetimi her değişiklikte "dur" diyor | **Kabul, crw2-fb'nin tercih ettiği env yer tutucusu.** Ana dosyada `import {$FB_AGENCIES:/etc/caddy/agencies.d/agencies.caddy}`. `adapt` yalnız alt süreçte `FB_AGENCIES=<.tmp>` ile koşar → `rename` → `env -u FB_AGENCIES caddy reload`. Buna ek olarak çalışan yapılandırma admin soketinden (`GET /config/`) okunur ve yeniden denetlenir. Böylece denetimle yükleme arasındaki yeniden çevirme de kapanır. `caddy.service`'e ve eşitleyici birimine değişken verilmez. Test: (a)-(d). **Ölçüldü** (`caddy:2.11.4`): etkinleştirme, ikinci ajans ve askıya alma "senkron". Fazladan blok ve `:443` duruyor, canlı dosya değişmiyor. Değişken ortamda kalırsa `reload` başarısız oluyor | §2.1 (ana dosya + not), §4.3-2, §4.3-4, §2.3 |
| **Y-2** | §3.3 ara sayfalardaki `Referrer-Policy: no-referrer` → `Origin: null`. Adım 2 ve 6 her devri reddediyor | **Kabul.** Ara sayfalar `strict-origin` taşır (yol ve sorgu hiç sızmaz, Origin gerçek köken). `same-origin` adım 2'yi kırdığı, `strict-origin-when-cross-origin` de aynı kökende tam URL'yi koyduğu için seçilmedi. Adım 2 üç dala ayrıldı: `Origin` var → tam eşleşme; `Origin: null` → ret, geri düşüş yok; `Origin` yok → `Sec-Fetch-Site` + `Referer` kökeni. Adım 6'da `null`/yok → ret. `accept-invite`'ın `no-referrer` kalıbı kopyalanmaz, `sandbox` yok. **Ölçüldü:** Chromium 151 **ve WebKit 26.6** (İNCELEME-120'de WebKit koşulamamıştı), üç ayrı site, saldırgan kökeni dahil | §3.3 (giriş notu + tablo, adım 2, adım 6, e2e satırları) |
| **Ö-1** | PSL kuralı `getDomain(h) !== h` genel son eki kabul ediyor | **Kabul.** `d = getDomain(h, { allowPrivateDomains: true }); d === null \|\| d === h` → ret. Kütüphaneler ve seçenekler yazıldı: web `tldts`, eşitleyici `tldextract` (gömülü liste). **Ölçüldü:** iki kütüphane 9 örnekte aynı sonuç (`org.tr`/`gov.tr`/`com`/`ajans.github.io` ret, `panel.*` kabul) | §4.3-1, §2.3 |
| **Ö-2** | Giriş eylemlerinin yan etkileri `jwt`'den önce çalışıyor. Bekçi kuralı `src/lib/actions/auth.ts`'i de yakalıyor ve belgeyle çelişiyor | **Kabul.** `authorize(credentials, request)` ve `signIn` callback'i ilk satırda `resolveBrandHost`. Giriş eylemleri ilk satırda `assertBrandHost()`. Sıra `@auth/core@0.41.3` kaynağından (`callback/index.js:63,231`). Bekçi: dışa aktarılan her eylem, AST ile. Matrise giriş satırı eklendi (`User` satırı, davet reddi ve kayıt çerezi yok) | §2.2 (tablo + "Giriş yolunun host kapısı" + "Eylem bekçisi"), §2.3 |
| **Ö-3** | §3.2-1 gerekçe: Auth.js `X-Forwarded-Proto`'yu okuyor | **Kabul.** Gerekçe "Caddy'nin `X-Forwarded-Proto`'suna bağımlı kalınmaz" oldu. Karar değişmedi | §3.2-1 |
| **Ö-4** | "yalnız `fb_edge_sync` yazar" GRANT kısıtı olmadan tutmuyor | **Kabul, sınırıyla.** GRANT/REVOKE satırları migrasyona yazıldı. Ancak web bugün `fabrika` (SUPERUSER + BYPASSRLS, patron 29.09 kararıyla kalıyor) ile bağlanıyor. Süper kullanıcı GRANT'a bakmıyor (**ölçüldü**, `postgres:16`). Tablo satırı "web kodu yazmaz, DB zorlamaz" olarak düzeltildi. Kenarın güvenliği buna dayanmıyor (katman 3). Alarm web'den eşitleyiciye taşındı. Kaynak bekçisi eklendi. Lider notu L3 | §4.1, §4.2-3, §4.3-6, §8.2-L3 |
| **Ö-5** | Soket izni `0600` değil `0200`; `cobrand-store.ts` yolu | **Kabul.** `0200 (Caddy varsayılanı), sahibi caddy`. `src/lib/agency/cobrand-store.ts:113-116` | §2.1, §4.1 |

---

## 7. Efor

Kişi-gün, tek geliştirici, test + inceleme dahil, ±%30.

| Aşama | rev. 1 | rev. 2 eklenen | rev. 3 eklenen | rev. 3 |
|---|---|---|---|---|
| **0 — Alan adsız markalama + E1** | 7-9 | Y-2 veri modeli ayrımı + denetim + `jsonb_set` (1-1,5); Y-6/Ö-6 (0,5-1) | — | **8,5-11,5** |
| **1 — Ajans alan adı (B)** | 8-12 | B-1 (1-1,5); B-2 (2-3); Y-1 (0,5-1); canlı öncesi bağımsız inceleme + iki alanlı sızma testi (1,5-2) → **13-19,5** (rev. 2 tablosunda 13,5 yazıyordu, aritmetik hatası) | R2-Y1 env + açılış kontrolü + çerez testi (0,25); R2-Ö1/Ö2/Ö3 testleri ve iki bekçi (0,25) | **13,5-20** |
| **1b — İşletme** | 2-3 | Y-3 askıya alma otomasyonu + doğrulama + Google adımı (0,5-1) → 2,5-4 | R2-Y2 eşitleyici: DB rolü + tablo, üretim döngüsü, `adapt` denetimi, compose bekçisi (0,5-1); R2-Ö5 web'de `LISTEN` yok (−0,25) | **2,75-4,75** |
| **B toplamı (0+1+1b)** | 17-24 | +7-11 → 24-35 | +0,75-1,25 | **≈ 25-36** |
| 2 — E2 (ajans alanından e-posta) | 5-8 | Ö-7 (rev. 1'de vardı) | — | 5-8 (+MTA) |
| **3 — C (koşullu)** | +8-12 | Y-4 (+3-5) → +11-17 | R2-Y3 iki adımlı iniş + çıkış onayı, R2-Ö4 Origin: Y-4'ün +3-5 aralığında (se-fb ile aynı değerlendirme) | **≈ +11-17** |

Gerekçe:
- B toplamı 24,75-36,25, yuvarlanmış ≈ 25-36. İNCELEME-114'ün önerisiyle aynı.
- **Rev. 4 eforu değiştirmez** (İNCELEME-120: "Y-1 ve Y-2'nin düzeltmesi efor aralığını değiştirmez"). Y-1: aynı
  döngüye bir env değişkeni ve bir admin `GET` eklendi, 1b'nin eşitleyici kalemi içinde. Y-2: bir başlık değeri ve bir
  dal. Ö-1/Ö-3/Ö-5 metin. Ö-2: üç tek satırlık kapı ve bekçinin AST ile dışa aktarım düzeyinde yazılması. Aşama 1'in
  "iki bekçi (0,25)" kalemi içinde, ±%30 bandında. Ö-4: migrasyonda dört satır, bir kaynak bekçisi ve alarmın
  eşitleyiciye taşınması, 1b kalemi içinde.
- R2-Y2'nin maliyeti rev. 2'nin "statik blok üretimi `ask`'ın çıkmasıyla birbirini götürür" varsayımının kapsamadığı
  ayrı süreçtir, 1b'ye yazıldı. R2-Ö5 sadeleştirmesi bunu kısmen karşılar.
- HSTS'in Caddy'ye taşınması (Karar-1 C) devop-fb'nin kartında yapıldı. Burada sayılmadı. Ana Caddyfile'a `>` ve üç
  değişmez satır eklemek aşama 1b'nin içinde.
- Karar-2 A (yalnız alt alan) eforu azaltmaz. Rev. 1 zaten yalnız alt alanı hesaplamıştı. Kök alan A kaydı ve IP
  bağımlılığı riski tamamen kalkar.
- Takvim bağımlılıkları (efor değil): DMARC reject için 2-4 hafta gözlem (Y-5). Caddy'nin canlıda kurulması
  (`RELEASE_CHECKLIST.md`). Ajans BT'sinin 3 DNS kaydı. Google Cloud'da redirect URI + Search Console doğrulaması.

Sıra: 0 (DMARC gözlemi paralel başlar) → Caddy canlı → 1 + 1b (eşitleyici 1b'de, ilk ajans alanından önce;
R2-Y1'deki env kaldırma aynı sürümde) → talep olursa 2 → gerekirse 3.

---

## 8. Açık konular

### 8.1 Patron soruları (güncel hâl)

| # | Soru | Durum |
|---|---|---|
| 1 | Beyaz etikette giriş ekranı ve e-posta altbilgisinde küçük "FonBridge altyapısıyla" ibaresi kalsın mı? (KVKK/DPA işleyeni FonBridge diye adlandırmak zorunda) | **AÇIK.** Öneri: evet (hukuk + oltalama önlemi) |
| 2 | Kök alan mı, alt alan mı? | **KAPANDI — Karar-2 A (patron, 30.09):** yalnız alt alan (`panel.<ajans>`). Kök alan yönlendirmesi ajansın işi. §4.3-1 doğrulaması bunu uygular |
| 3 | Google onay ekranı "FonBridge" gösterir. Ajans başına ayrı OAuth istemcisi istenir mi? | **AÇIK.** Öneri: hayır (tek istemci, kullanıcıya ipucu da olur) |
| 4 | E2 (ajansın kendi alanından e-posta, kendi MTA) 2. yıl kapsamına girer mi? | **AÇIK.** Ek bilgi: E1 de DMARC reject önkoşuluna bağlandı (Y-5) |
| 5 | Görünen adı kim belirler? | **KAPANDI (tasarım kararı, onay bekliyor):** platform yöneticisi, sözleşmedeki resmi ad. Veri modelinde de ajans yazamaz (Y-2) |
| 6 | B5 OKA lisansına mı dahil, ayrı kalem mi? | **AÇIK** (`OKA-KANAL-ONERISI.md:73-75` lisans tutarı hâlâ açık). Efor artık ≈ 25-36 kişi-gün |
| 7 | Beyaz etikette birinci hat destek ajans mı, biz mi? | **AÇIK** |
| 8 | Ajans ayrılınca bağlı kurumlar `nexagrant.com`'a taşınsın mı, bildirim süresi? | **AÇIK.** Öneri: 30 gün bildirim, alan 180 gün `SUSPENDED` |
| 9 | `fonbridge.com` HSTS'i yalnız Caddy'de ayarlansın, uygulama göndermesin mi? `includeSubDomains` kalksın mı? | **KAPANDI — Karar-1 C (patron, 30.09), uygulandı** (`devop-fb/merge-hsts`). Yalnız Caddy, `includeSubDomains` yok |
| 10 | İlk uygulama kartından önce C yolu gerekecek mi? (ikinci ajans + Google alan doğrulaması darboğazı) | **AÇIK**, 2. yıl planlamasında. C seçilirse §3.3 zorunlu tasarım girdisi |

### 8.2 Lider için (patron sorusu değil)

| # | Konu | Öneri |
|---|---|---|
| L1 | R2-Y1 yan bulgusu: bugünkü `fonbridge.com` dağıtımı `docker-compose.yml:39` (`NEXTAUTH_URL=http://localhost:3000`) ile mi koşuyor? Evetse Google dönüşü ve çerezin `Secure` bayrağı bugün etkilenir | B5'ten bağımsız ayrı kart (devop-fb): canlı env'i kontrol et; tek site için `AUTH_URL=https://fonbridge.com` bugün doğrudur, B5 aşama 1'de §3.2-1'e göre kalkar |
| L2 | `fb-edge-sync`'in sahibi | devop-fb (işletme güven sınırı). Uygulama kartı aşama 1b |
| L3 | İNCELEME-120 Ö-4: web `fabrika` (SUPERUSER + BYPASSRLS) ile bağlandığı sürece B5'in DB düzeyindeki yetki kısıtları (`AgencyDomainEdgeState` GRANT'ı, `AgencyDomain` `CHECK`'i) web'de bir RCE'ye karşı zorlanmaz (ölçüldü). Patron 29.09'da bağlantının kalmasına karar verdi (ROADMAP #16). B5 tasarımı buna dayanmıyor: kenar katman 3 ile korunuyor, alarm eşitleyicide | Karar yeniden açılmıyor. Bu yalnız bilgi: ROADMAP #16 bir gün yeniden açılırsa B5'in GRANT satırları kendiliğinden etkin olur. B5 canlı öncesi sızma testinin (aşama 1) kapsamına "web RCE varsayımıyla kenar" senaryosu eklenir |
