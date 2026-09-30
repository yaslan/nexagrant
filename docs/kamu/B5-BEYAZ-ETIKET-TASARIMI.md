# B5 Tam Beyaz Etiket — Tasarım rev. 3

**Durum:** tasarım, uygulanmadı. Uygulama 2. yılda (patron kararı 30.09). Ürün kodu bu belgeyle değişmedi.
**Rev. 1:** `docs/agent-results/TASK-MULRSKF51ZLTW-fe-fb.md` (fe-fb). Kod haritası (§1), tema (§3), e-posta
seçenekleri (§4.1-4.2) ve A/B/C karşılaştırması (§6) orada. Bu belge yalnız değişen kararları taşır. Çelişki olursa
**bu belge geçerlidir**.
**Güvenlik incelemeleri:**
- İNCELEME-111, `docs/agent-results/TASK-MUODXZR2BQ2L6-se-fb.md`: 2 B · 6 Y · 7 Ö. Rev. 2 bunları kapattı.
- İNCELEME-114, `docs/agent-results/TASK-MUOFKI8C1009Z-se-fb.md` (dal `se-fb/inceleme114`, `95c5cbf3`): B-1/B-2 kapandı,
  16 bulgudan 15'i kapandı, Y-4 kısmen. Yeni bulgular: 3 Y + 5 Ö (R2-Y1..Y3, R2-Ö1..Ö5). Rev. 3 bunları kapatır ve belgeyi
  30.09 patron kararlarıyla (Karar-1 C, Karar-2 A) uyumlu yapar (TASK-MUOEJVUECL28A). Yanıt tablosu: §6.2.
**Ölçümler:** rev. 2 `docs/agent-results/TASK-MUOEJVUECL28A-fe-fb-ekler/`, İNCELEME-114 `…/TASK-MUOFKI8C1009Z-se-fb-ekler/`.
Rev. 3 yalnız belge değişikliğidir. Yeni spike yok (se-fb §6: "yeni spike gerekmez").

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
   API'sine, docker soketine ya da `/etc/caddy`'ye erişimi yoktur. Hostname üç yerde doğrulanır (§4.3).
4. **Alan politikası — Karar-2 A (patron, 30.09):** kök alan YOK, yalnız alt alan (`panel.<ajans>`). Ajans kök alanını
   alt alana yönlendirmek isterse bunu kendi tarafında kurar.
5. **HSTS — Karar-1 C (patron, 30.09, uygulandı):** HSTS yalnız Caddy'de. Uygulama başlık göndermiyor
   (`devop-fb/merge-hsts`, dev'de). Ajans bloğunda `includeSubDomains` yok (§5).
6. **Efor:** B yolu ≈ **25-36 kişi-gün** (rev. 2: 24-35). C yolu ek ≈ **+11-17** (değişmedi). §7.

---

## 1. Değişen kararlar

### 1.1 rev. 2 → rev. 3

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

### 1.2 rev. 1 → rev. 2 (tarihçe; güncel hâli yukarıdaki tabloda)

| Konu | rev. 1 | rev. 2 | Bulgu |
|---|---|---|---|
| Host kapısının yeri | yalnız `src/proxy.ts` | Caddy (her yol) + proxy matcher `/api` dahil + `resolveBrandHost()` | B-1 |
| Oturum izolasyonu | "host-only çerez yeter" | host-only çerez + JWT `host` claim + her okumada karşılaştırma | B-2 |
| Kiracılar arası kapı | yalnız girişte | `jwt` callback'inde, rebind ve varsayılan üyelik dahil, her okumada | Y-1 |
| Platform alanları (`mail.*`, `mode`) | `Tenant.settings.cobrand` içinde | ayrı `AgencyWhitelabel` tablosu, yalnız platform yöneticisi yazar | Y-2 |
| Askıya alma | "Caddy depodan sil, işletme adımı" | tek otomatik akış: DB + önbellek + Caddy bloğu + reload + Google `redirect_uri` + doğrulama (rev. 3: Caddy adımını eşitleyici yapar) | Y-3 |
| C devri | "60 sn, hedef-host'a bağlı kod" | + tarayıcı nonce'u, DB'de tek kullanım, POST ile taşıma, Google kodu aracıda kalır | Y-4 |
| E1 önkoşulu | yok | `fonbridge.com` DMARC `p=reject` (en az `quarantine`) | Y-5 |
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
	admin unix//run/caddy/admin.sock   # R2-Y2: admin API TCP'de değil; soket 0600 caddy:caddy
	servers {
		strict_sni_host on              # SNI ≠ Host → 421 (İNCELEME-114 §1.2 ölçtü)
	}
}
fonbridge.com {
	encode zstd gzip
	header >Strict-Transport-Security "max-age=31536000"   # Karar-1 C: HSTS yalnız burada (§5)
	reverse_proxy 127.0.0.1:3000
}
www.fonbridge.com, http://www.fonbridge.com, http://fonbridge.com {
	redir https://fonbridge.com{uri} permanent
}
import /etc/caddy/agencies.d/agencies.caddy   # YALNIZ fb-edge-sync yazar (§4.3); boş dosya geçerlidir
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
- On-demand'ın neden çıktığı (rev. 2): on-demand yönetilen sertifikayı bellekte tutar ve reload yetmez (se-fb
  İNCELEME-111 1.2-E), statik blok config'ten türetilir. Self-servis alan ekleme istenirse yeniden değerlendirilir
  (§6.1 Ö-2).

### 2.2 Katman 2 — uygulama (zorunlu; Caddy yanlış kurulursa da kapalı kalır)

**Tek fonksiyon:** `src/lib/brand/host.ts`

```ts
type BrandHost =
  | { kind: 'root' }                                  // fonbridge.com (+ yerel geliştirmede localhost)
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
| Kök `[locale]` + statik uzantılı yol (`/x.png`) | **proxy çalışmaz** (`src/proxy.ts:83` uzantıyı hariç tutar). Oturumlu eylemler `jwt` katmanında kapalı. Oturumsuz eylemler `assertBrandHost()`'u kendileri çağırır | R2-Ö2. Bugün oturumsuz eylem: `submitReadinessLead` (`src/app/[locale]/fon-hazirlik/actions.ts:11`). Giriş eylemleri (`src/lib/actions/auth.ts`) `jwt` `signIn` dalında reddedilir (§3.2-3). Kaynak bekçisi: `'use server'` dosyasında `auth()`/`requireX` çağrısı yoksa `assertBrandHost()` şart |
| `/api/*` (Auth.js dahil) | `src/proxy.ts`, matcher'a `'/api/:path*'` eklenir | `/api` dalında **yalnız** host kontrolü yapılır. CSP nonce ve locale işlemi yapılmaz, API CSP'si `next.config.ts`'ten gelmeye devam eder |
| Oturum okuması | `auth.ts` `jwt` callback'i (§3.2) | Proxy regresyona uğrarsa oturumlu her yol yine de kapalıdır |
| `/api/brand/logo`, `/api/brand/favicon` | route içinde, markayı host'tan çözerken | Oturumsuz uçlar, çözüm zaten host'a dayanıyor |
| Statik dosyalar, `/_next/*` | **uygulamada yok**, yalnız Caddy | Bu yollar host'tan bağımsız, herkese açık derleme çıktısıdır. Oturum ve marka taşımaz. Caddy katmanı onları da kapsar (ölçüldü: askıda TLS'te kapalı, çapraz SNI 421) |

- `/api/webhooks/*` (Stripe vb.) yalnız `root` host'ta kabul edilir. Ajans host'undan gelen webhook 421 alır.
- `/api/internal/*` (varsa) yalnız `root`. Caddy dışarıya açmaz.
- 421 gövdesi boştur ve `Cache-Control: no-store` taşır. Yönlendirme yapılmaz: askıdaki alandan `fonbridge.com`'a
  otomatik 30x, alanı ele geçiren tarafa meşruiyet kazandırır.
- `matcher` testi (`src/lib/security-headers.test.ts`, İNCELEME-57 Y-2 kalıbı) `/api/auth/callback/google`,
  `/api/brand/logo` ve `/api/v1/...` örneklerinin proxy'den geçtiğini sabitler.

### 2.3 Test matrisi (uygulama kartının DoD'u)

{kök, ACTIVE, SUSPENDED, PENDING, bilinmeyen, XFH≠Host, BÜYÜK HARF, sonda nokta} × {sayfa, server action,
**`POST /x.png` + `Next-Action` (R2-Ö2)**, `/api/auth/signin/google`, `/api/auth/callback/google`, `/api/auth/session`,
`/api/brand/logo`, `/api/v1/*`, `/api/webhooks/stripe`}. Beklenen: kök ve ACTIVE → normal. Normalize edilebilenler →
karşılığı. Diğerleri → 421 (ya da eylem hatası; eylem **çalışmamış** olmalı: DB'de satır yok).

Ek testler (bu revizyon):
- **R2-Ö1:** ajans host'unda giriş başarılı (token'da `host = panel…`). Kökte basılan token ajans host'unda `null`.
  Claim'siz eski token ajans host'unda `null`, kökte geçerli.
- **R2-Y1:** üretim modunda `Set-Cookie` adı `__Secure-authjs.session-token`, `Secure` bayrağı var, `Domain=` yok.
  `AUTH_URL` ya da `NEXTAUTH_URL` verilmiş üretim süreci açılışta çıkar (sıfırdan farklı çıkış kodu).
- **R2-Ö3:** kaynak bekçisi (`src/` altında `next-auth/jwt`, `@auth/core/jwt`, `decode(` içe aktarımı yok) kasıtlı bir
  içe aktarımla kırmızıya döner.
- **R2-Y2:** compose bekçisi, `fabrika-web` hizmetinde `docker.sock`, `/etc/caddy`, `/run/caddy` bağı ve
  `network_mode: host` olmadığını doğrular (§4.3-5).
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
     `useSecureCookies: process.env.NODE_ENV === 'production'` `auth.ts`'e açıkça yazılır. Protokol çıkarımına
     bırakılmaz: Caddy arkasında upstream `http://` konuşur.
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
   değil, fonbridge.com'dan girin" der. Kiracı yine oturumdan gelir. Host kiracı seçmez, yalnız reddeder.
5. **Tek kontrol noktasının bekçisi (R2-Ö3):** host bağı yalnız `jwt` callback'inde. Onu atlayan bir okuma (çözülmüş
   token'ı doğrudan okuyan route handler) bağı sessizce deler. Bugün yok (`grep -rln "getToken\|next-auth/jwt" src`
   boş). Uygulama kartına kaynak bekçisi eklenir: `src/` altında `next-auth/jwt`, `@auth/core/jwt` içe aktarımı ve
   `decode(` çağrısı yasak (tek istisna yok). Oturum yalnız `auth()` ile okunur.
6. **Patlama yarıçapı:** ajans alanında basılan token yalnız o alanda ve yalnız o ajansın kurumlarıyla geçerlidir.
   Alanın DNS'ini ele geçiren taraf en fazla o ajansın kurumlarına erişir. `fonbridge.com`'a ve diğer ajanslara
   erişemez.
7. **Google OAuth (Ö-5):** sağlayıcıya `checks: ["pkce", "state"]`. `redirect` callback'i özelleştirilmez (aynı köken).

### 3.3 C yolu: merkezi giriş aracısı (Y-4, R2-Y3, R2-Ö4) — yalnız C'ye geçilirse

**Tarayıcı kuralı (tasarımın dayandığı):** `fonbridge.com` ile `oka.org.tr` farklı kayıtlı alanlardır. Aralarındaki her
istek siteler arasıdır. `SameSite=Lax` çerez siteler arası isteklerde yalnız üst düzey **GET** gezintisinde gönderilir,
POST'ta gönderilmez. Bu yüzden siteler arası her POST **çerezsiz** varsayılır ve çerez gerektiren her iş aynı köken
bir isteğe taşınır. `SameSite=None` kullanılmaz: nonce kimlik doğrulama değil bağ olsa da `None`, çerezi bütün üçüncü
taraf bağlamlarına açar ve tarayıcıların üçüncü taraf çerez kısıtlarına takılır. İki adımlı iniş daha az şaşırtıcıdır.

- Google yetki kodu ajans host'una **hiç** gitmez. `redirect_uri` yalnız `https://fonbridge.com/api/auth/callback/google`.
  Kodu aracı değiştirir.
- Auth.js `redirectProxyUrl` / `AUTH_REDIRECT_PROXY_URL` **yasak** (izin listesi olmadan `state.origin`'e
  yönlendiriyor). §3.2-1'deki açılış kontrolü bu değişkeni de kapsar.
- Otomatik gönderilen formlar CSP nonce'lu tek satırlık bir betikle gönderilir. `<noscript>` içinde "Devam" düğmesi
  vardır. Bu ara sayfalar `Cache-Control: no-store` ve `Referrer-Policy: no-referrer` taşır.

**Akış:**

1. **Başlatma (ajans host'u).** `panel.oka.org.tr/giris` → host-only `__Host-fb-handoff-nonce` çerezi basılır (32 bayt,
   `Secure; Path=/; SameSite=Lax; HttpOnly`, 5 dk). Sayfa `https://fonbridge.com/giris/araci` adresine POST formu
   gönderir: `{ target: 'panel.oka.org.tr', nonceHash }`.
2. **Aracı girişi (siteler arası POST, çerezsiz).**
   - **Origin kontrolü (R2-Ö4):** `Origin` başlığı `https://<target>` ile **tam** eşleşmeli. `Origin` yoksa
     `Sec-Fetch-Site` `cross-site` olmalı ve `Referer`'ın kökeni `https://<target>` olmalı. İkisi de yoksa ret. Bu,
     istek tablosunun üçüncü taraf sitelerden doldurulmasını ve login-CSRF'e benzer tetiklemeleri keser.
   - `target` `resolveBrandHost` mantığıyla doğrulanır: `ACTIVE` olmalı, **tam eşleşme** aranır, sonek eşleşmesi
     yapılmaz, DNS kontrolü son 24 saat içinde olmalı. `nonceHash` 64 hex karakter olmalı.
   - Aracı sunucu tarafında `HandoffRequest { id (32 bayt), targetHost, nonceHash, expiresAt = now + 5 dk, usedAt }`
     yazar (DB'de `sha256(id)`) ve **`303`** ile `GET https://fonbridge.com/giris/araci?r=<id>`'ye yönlendirir. Bu GET
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
   - `Origin` `https://<bu host>` olmalı (aynı köken), değilse ret.
   - `UPDATE … SET usedAt = now() WHERE hash = $1 AND usedAt IS NULL AND expiresAt > now() AND targetHost = $host
     RETURNING …` ile belirteç tek kullanımda tüketilir.
   - `sha256(çerezdeki nonce) === nonceHash` olmalı (sabit zamanlı karşılaştırma). Çerez yoksa ya da eşleşmezse ret.
     Belirteç zaten tüketilmiştir, yeniden denenemez.
   - Nonce çerezi silinir. Oturum §3.2'deki `host` claim'iyle basılır, Y-1 filtresi uygulanır.
   - **Gevşetme yasağı:** nonce kontrolü uygulama kartında "kaldırılamaz" olarak işaretlenir. Test: nonce çerezi
     olmadan (ya da başka tarayıcının nonce'uyla) gelen geçerli belirteç reddedilir.
7. **Çıkış senkronu (aynı kural).** Hedef host'ta çıkış (aynı köken POST, Auth.js `signOut`) yapılınca yanıt `303` ile
   `GET https://fonbridge.com/giris/cikis?from=<host>` adresine gider. Bu üst düzey GET'te aracının oturum çerezi gelir.
   Sayfa "fonbridge.com oturumunu da kapat" onayını gösterir. Onay, aracının kendi kökenine yapılan bir POST'tur
   (Auth.js CSRF belirteciyle). GET ile kendiliğinden çıkış yapılmaz (çıkış-CSRF). Rev. 2'deki siteler arası
   `POST /api/auth/handoff/logout` kaldırıldı: `Lax` altında aracının çerezi o POST'ta gelmezdi.
- CSP `form-action`'a `https://fonbridge.com` eklenir (yalnız ajans host'unda). Aracıda `form-action`'a o ajans host'u
  eklenir. Joker kullanılmaz, liste `AgencyDomain`'den gelir.
- Uygulama kartının e2e'si gerçek tarayıcıda (Chromium + WebKit) iki kayıtlı alanla koşar. İNCELEME-114 bu davranışı
  tarayıcıda koşmadan (belirtimden) çıkardı. Doğrulama kartta yapılır.

---

## 4. Veri modeli (Y-2), askıya alma (Y-3) ve kenar eşitleyicisi (R2-Y2)

### 4.1 Güven sınırı veri modelinde

| Alan | Yer | Kim yazar |
|---|---|---|
| `logoKey`, `name`, `accent`, `accentDark`, `faviconKey` | `Tenant.settings.cobrand` (v2) | ajans `TENANT_OWNER/ADMIN` |
| `mode` (whitelabel açık/kapalı), `mail.displayName`, `replyTo`, `replyToVerifiedAt`, `replyToTokenHash`, `replyToTokenExpiresAt` | yeni `AgencyWhitelabel { agencyId @id, … , updatedAt, updatedBy }` | yalnız platform yöneticisi eylemi |
| `hostname`, `status`, `verifyToken(Hash)`, `lastCheckedAt` | `AgencyDomain` (rev. 1 §2.1) | platform yöneticisi + DNS kontrol işi |
| `hostname`, `syncedGeneration`, `edgeSyncedAt`, `edgeError`, `verifiedAt` | yeni `AgencyDomainEdgeState` | **yalnız** `fb_edge_sync` DB rolü (§4.3) |

- `cobrand` yazımı `jsonb_set` ile yalnız kendi anahtarlarını değiştirir. Bugünkü bütün-nesne değiştirme
  (`cobrand-store.ts:112-115`) v2'de kaldırılır.
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
   olmazsa kayıt "yarım" kalır ve yöneticiye alarm gider. Bu arada uygulama katmanı zaten kapalıdır.
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
     köşeli IPv6 biçimi reddedilir). Kök alanımıza eşit ya da altında olamaz (`fonbridge.com`, `*.fonbridge.com`).
     Karar-2 A gereği kayıtlı alanın kendisi olamaz: Public Suffix List ile `getDomain(h) !== h` (`oka.org.tr` ret,
     `panel.oka.org.tr` kabul). PSL sürümü bağımlılıkla sabitlenir.
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
   eşitleyici yazamaz.
3. **DB erişimi:** ayrı rol `fb_edge_sync`: `AgencyDomain(hostname, status)` üzerinde yalnız `SELECT` (görünüm
   `agency_domain_active_v`), `AgencyDomainEdgeState` üzerinde `INSERT/UPDATE`. Başka tabloya yetki yok, RLS bypass yok.
   Bağlantı dizesi ana makinede `/etc/fb-edge-sync/env` (`0600 caddy`), web konteynerine verilmez. `LISTEN
   agency_domain_edge` + 60 sn zamanlayıcı yedeği (bildirim kaybolursa en geç 60 sn).
4. **Üretim döngüsü:** ACTIVE listesini oku → 3 katman doğrulaması → sayı üst sınırı (≤ 50 host; aşılırsa dur, alarm)
   → `agencies.caddy.tmp`'ye sabit şablonla yaz → `caddy adapt --config /etc/caddy/Caddyfile` → JSON üzerinde
   değişmezleri denetle:
   - `apps.http.servers.*.strict_sni_host === true`,
   - catch-all rotası `static_response` 421,
   - `admin.listen` bir unix soketi,
   - üretilen adlı host kümesi == DB'deki ACTIVE küme ∪ {`fonbridge.com`, `www.fonbridge.com`} (fazlası ya da eksiği
     varsa dur).
   → `rename` ile atomik yerleştir → `caddy reload --address unix//run/caddy/admin.sock` → `curl --resolve` doğrulaması
   (ACTIVE'ler 200, kaldırılanlar TLS hatası/421) → `AgencyDomainEdgeState`'e `syncedGeneration`, sonuç ve hata.
   Herhangi bir adım başarısızsa önceki dosya yerinde kalır (Caddy son geçerli yapılandırmada çalışmaya devam eder).
5. **Web konteynerinin kenara erişemediğinin sabitlenmesi:** compose bekçisi (CI, §2.3): `fabrika-web` hizmetinde
   `/var/run/docker.sock`, `/etc/caddy`, `/run/caddy` bağı ve `network_mode: host` yok. Caddy admin API'si TCP'de
   dinlemez (ana dosyada `admin unix//…`), bu yüzden konteyner ağından `:2019`'a ulaşılamaz. Canlı kontrol listesi:
   `ss -ltn | grep 2019` boş.
6. **Hata ve gözlem:** her döngü `journald`'a tek satır yazar (üretim no, host sayısı, sonuç). Panelde "kenar" sütunu.
   2 dk'dan uzun "bekliyor" → alarm.

---

## 5. HSTS (Ö-3, Karar-1 C)

- **`fonbridge.com`: Karar-1 C (patron, 30.09) uygulandı.** HSTS yalnız Caddy'de. Uygulama başlığı kaldırıldı
  (`devop-fb/merge-hsts`, `c6fad2ac`, dev'de: `security-headers.ts`'te `HSTS_VALUE` yok). Kurulum sırası
  `docs/SMTP-SUNUCU.md` §10.1 ve `docs/RELEASE_CHECKLIST.md` §5.4'te (gün 1 `max-age=300` → sonra `31536000`).
  `includeSubDomains` kökte yok. `RELEASE_CHECKLIST.md` §5.4-3'teki "gün 366: `includeSubDomains` eklenebilir"
  maddesi yalnız `fonbridge.com` bloğu içindir, ajans bloklarına kopyalanmaz.
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
| İNCELEME-114 §5.2 | Belge Karar-1 C ve Karar-2 A ile bayat | **Kabul.** §0-4/5, §1.1, §5, §8-2, §8-9 güncellendi; HSTS yedek planı silindi; `>` gerekçesi yeniden yazıldı | §0, §1.1, §5, §8 |

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
| 8 | Ajans ayrılınca bağlı kurumlar `fonbridge.com`'a taşınsın mı, bildirim süresi? | **AÇIK.** Öneri: 30 gün bildirim, alan 180 gün `SUSPENDED` |
| 9 | `fonbridge.com` HSTS'i yalnız Caddy'de ayarlansın, uygulama göndermesin mi? `includeSubDomains` kalksın mı? | **KAPANDI — Karar-1 C (patron, 30.09), uygulandı** (`devop-fb/merge-hsts`). Yalnız Caddy, `includeSubDomains` yok |
| 10 | İlk uygulama kartından önce C yolu gerekecek mi? (ikinci ajans + Google alan doğrulaması darboğazı) | **AÇIK**, 2. yıl planlamasında. C seçilirse §3.3 zorunlu tasarım girdisi |

### 8.2 Lider için (patron sorusu değil)

| # | Konu | Öneri |
|---|---|---|
| L1 | R2-Y1 yan bulgusu: bugünkü `fonbridge.com` dağıtımı `docker-compose.yml:39` (`NEXTAUTH_URL=http://localhost:3000`) ile mi koşuyor? Evetse Google dönüşü ve çerezin `Secure` bayrağı bugün etkilenir | B5'ten bağımsız ayrı kart (devop-fb): canlı env'i kontrol et; tek site için `AUTH_URL=https://fonbridge.com` bugün doğrudur, B5 aşama 1'de §3.2-1'e göre kalkar |
| L2 | `fb-edge-sync`'in sahibi | devop-fb (işletme güven sınırı). Uygulama kartı aşama 1b |
