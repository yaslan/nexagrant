# B5 Tam Beyaz Etiket — Tasarım rev. 2

**Durum:** tasarım, uygulanmadı. Uygulama 2. yılda (patron kararı 30.09). Ürün kodu bu belgeyle değişmedi.
**Rev. 1:** `docs/agent-results/TASK-MULRSKF51ZLTW-fe-fb.md` (fe-fb). Kod haritası (§1), tema (§3), e-posta
seçenekleri (§4.1-4.2) ve A/B/C karşılaştırması (§6) orada. Bu belge yalnız değişen kararları taşır. Çelişki olursa
**bu belge geçerlidir**.
**Güvenlik incelemesi:** İNCELEME-111, `docs/agent-results/TASK-MUODXZR2BQ2L6-se-fb.md` (se-fb): TASARIM DÜZELTMESİ
GEREKLİ, 2 B · 6 Y · 7 Ö. Bu revizyon o bulguları kapatmak için yazıldı (TASK-MUOEJVUECL28A).
**Yeni ölçümler:** `docs/agent-results/TASK-MUOEJVUECL28A-fe-fb-ekler/` (statik blok iptali, HSTS çift başlığı).

---

## 0. Özet

1. **Host kapısı iki katman.** Caddy katmanı her yolu kapsar: açık site bloğu, `strict_sni_host on`, eşleşmeyen Host
   için 421. Uygulama katmanında proxy matcher'ı `/api/*`'yi de kapsar ve tek fonksiyon `resolveBrandHost()` çağrılır.
   Askıdaki ya da bilinmeyen host her istekte 421 alır. Önceden alınmış sertifika bunu değiştirmez (§2).
2. **Oturum host'a bağlı.** Çerez host-only kalır (Domain yok). JWT'ye `host` claim'i yazılır. Auth.js `jwt`
   callback'i her oturum okumasında bu claim'i isteğin host'uyla karşılaştırır, eşleşmezse `null` döner ve oturum
   silinir. C yolunda devir, tek kullanımlık, 60 sn geçerli, hedef host'a ve tarayıcıya bağlı bir belirteçle yapılır (§3).
3. **Alan politikası (30.09, lider önerisi, patron onayı teyit edilmedi → önerilen):** kök alan YOK, yalnız alt alan
   (`panel.<ajans>`). Ajans kök alanını alt alana yönlendirmek isterse bunu kendi tarafında kurar.
4. **HSTS:** ajans host'unda `includeSubDomains` yok. `fonbridge.com` HSTS'inin yalnız Caddy'de ayarlanması önerildi
   (patron onayı bekliyor, §5).
5. **Efor:** B yolu ≈ **24-35 kişi-gün** (rev. 1: 17-24). C yolu ek ≈ **+11-17** (rev. 1: +8-12). §7.

---

## 1. rev. 1 → rev. 2 değişen kararlar

| Konu | rev. 1 | rev. 2 | Bulgu |
|---|---|---|---|
| Host kapısının yeri | yalnız `src/proxy.ts` | Caddy (her yol) + proxy matcher `/api` dahil + `resolveBrandHost()` | B-1 |
| Oturum izolasyonu | "host-only çerez yeter" | host-only çerez + JWT `host` claim + her okumada karşılaştırma | B-2 |
| Kiracılar arası kapı | yalnız girişte | `jwt` callback'inde, rebind ve varsayılan üyelik dahil, her okumada | Y-1 |
| Platform alanları (`mail.*`, `mode`) | `Tenant.settings.cobrand` içinde | ayrı `AgencyWhitelabel` tablosu, yalnız platform yöneticisi yazar | Y-2 |
| Askıya alma | "Caddy depodan sil, işletme adımı" | tek otomatik adım: DB + önbellek + Caddy bloğu + reload + Google `redirect_uri` + doğrulama | Y-3 |
| C devri | "60 sn, hedef-host'a bağlı kod" | + tarayıcı nonce'u, DB'de tek kullanım, POST ile taşıma, Google kodu aracıda kalır | Y-4 |
| E1 önkoşulu | yok | `fonbridge.com` DMARC `p=reject` (en az `quarantine`) | Y-5 |
| `From` | dize | `{ name, address }` nesnesi + ad politikası | Y-6 |
| Kök alan | patron sorusu | desteklenmez (önerilen karar) | §8-2 |
| HSTS | "bizde `includeSubDomains` yok" (yanlıştı) | ajans host'unda yok. Kök için Caddy'ye taşıma önerisi | Ö-3 |

---

## 2. Host kapısı (B-1)

### 2.1 Katman 1 — Caddy (birincil, her yolu kapsar)

On-demand TLS kullanılmaz. Ajans evreni ≤26, pilot tek ajans. Her ajans alanı açık bir site bloğudur:

```caddy
{
	servers {
		strict_sni_host on          # SNI ≠ Host → 421 (se-fb 1.4-K; bu revizyonda tekrar ölçüldü)
	}
}
fonbridge.com {
	header >Strict-Transport-Security "max-age=31536000"   # '>' = upstream başlığını DEĞİŞTİR (§5)
	reverse_proxy 127.0.0.1:3000
}
panel.oka.org.tr {                  # ajans başına bir blok; kaynak: AgencyDomain.status = ACTIVE
	header >Strict-Transport-Security "max-age=31536000"   # includeSubDomains YOK (Ö-3)
	reverse_proxy 127.0.0.1:3000
}
:443 {
	tls internal                    # yedek: hiçbir bloğa uymayan istek boş 200 (se-fb 1.4-H) yerine 421 alsın
	respond 421
}
```

Ölçümde (aşağıda) 421'i `strict_sni_host` verdi. Bilinmeyen SNI'da TLS hiç kurulmadı (`http=000`). `:443` bloğu
yalnız yedek: Host eşleşmesi bir gün gevşerse eşleşmeyen istek upstream'e değil 421'e düşer.

- Next yalnız `127.0.0.1:3000`'e bağlı kalır (`docker-compose.yml:31`). Böylece uygulamaya giden her istek Caddy'den
  geçer ve `X-Forwarded-Host`'u Caddy yazar (se-fb 1.1-4: istemcinin XFH'si siliniyor).
- Caddy bu katmanda yolu ayırt etmez: `/`, `/api/*`, `/_next/*` ve statik dosyalar aynı kapıdan geçer.
- **Önceden alınmış sertifikayla gelen onaysız host (bu revizyonda ölçüldü, ek `spike-static-*.Caddyfile`):**
  ```
  A: panel bloğu var                SNI=panel Host=panel       → site=panel.oka-ornek.test [http=200]
  A: strict_sni_host                SNI=panel Host=saldirgan   → [http=421]
  A: strict_sni_host                SNI=panel Host=fonbridge   → [http=421]   (se-fb 1.4-I kapandı)
  B: panel bloğu silindi + reload   SNI=panel Host=panel       → [http=000] "tlsv1 alert internal error"
     (sertifika hâlâ depoda: /data/caddy/certificates/local/panel.oka-ornek.test)
  B: kök host                       SNI=fonbridge              → [http=200]
  B: SNI=fonbridge Host=panel                                   → [http=421]
  B → A → B döngüsü (aynı konteyner, yalnız reload)             → 200 → 000
  ```
  Sonuç: **statik blokta** blok kaldırılıp `caddy reload` yapılınca sertifika depoda dursa da TLS kurulmuyor.
  Yeniden başlatma gerekmiyor. se-fb'nin 1.2-E ölçümü (reload yetmez) **on-demand** içindi. İki ölçüm birbirini
  tutuyor: on-demand yönetilen sertifikayı bellekte tutar, statik blok ise config'ten türetilir. Bu yüzden on-demand
  tasarımdan çıkarıldı. Self-servis alan ekleme istenirse yeniden değerlendirilir (§6 Ö-2).

### 2.2 Katman 2 — uygulama (zorunlu; Caddy yanlış kurulursa da kapalı kalır)

**Tek fonksiyon:** `src/lib/brand/host.ts`

```ts
type BrandHost =
  | { kind: 'root' }                                  // fonbridge.com (+ yerel geliştirmede localhost)
  | { kind: 'agency'; agencyId: string; hostname: string };

export function normalizeHost(raw: string | null): string | null;   // Ö-1: küçük harf, port at, sondaki '.' at, IDN → punycode
export async function resolveBrandHost(headers: Headers): Promise<BrandHost | null>; // null = reddet (421)
```

- Girdi: `Host` başlığı. `X-Forwarded-Host` varsa normalize edilmiş hâli `Host` ile aynı olmalıdır, değilse `null`.
  Caddy ikisini de aynı yazar (se-fb 1.1-4). Fark varsa istek Caddy'den gelmemiştir.
- Kaynak: `AgencyDomain` tablosunda yalnız `status = ACTIVE` satırlar. Bellekte `Map<hostname, agencyId>` tutulur. DB'ye
  el sıkışma ya da istek başına gidilmez. Geçersizleştirme: yazma yapan eylem kendi sürecinde haritayı hemen boşaltır
  ve `pg_notify('agency_domain')` yayınlar. Diğer süreçler `LISTEN` ile boşaltır. Yedek olarak TTL 30 sn (rev. 1'de
  60 sn idi). Askıya alma bu yüzden TTL'i beklemez (Y-3).
- `null` dönen durumlar: bilinmeyen host, `PENDING`/`VERIFIED`/`SUSPENDED` host, XFH ≠ Host, normalize edilemeyen
  değer.

**Çağrıldığı yerler (hepsi aynı fonksiyon, aynı 421):**

| Yol | Nerede | Not |
|---|---|---|
| Sayfalar ve server action'lar | `src/proxy.ts` | Server action, sayfa yoluna POST'tur, bugünkü matcher'da zaten var |
| `/api/*` (Auth.js dahil) | `src/proxy.ts`, matcher'a `'/api/:path*'` eklenir | `/api` dalında **yalnız** host kontrolü yapılır. CSP nonce ve locale işlemi yapılmaz, API CSP'si `next.config.ts`'ten gelmeye devam eder |
| Oturum okuması | `auth.ts` `jwt` callback'i (§3.2) | Proxy regresyona uğrarsa oturumlu her yol yine de kapalıdır |
| `/api/brand/logo`, `/api/brand/favicon` | route içinde, markayı host'tan çözerken | Oturumsuz uçlar, çözüm zaten host'a dayanıyor |
| Statik dosyalar, `/_next/*` | **uygulamada yok**, yalnız Caddy | Gerekçe: bu yollar host'tan bağımsız, herkese açık derleme çıktısıdır. Oturum ve marka taşımaz, proxy maliyeti gereksiz. Caddy katmanı onları da kapsar |

- `/api/webhooks/*` (Stripe vb.) yalnız `root` host'ta kabul edilir. Ajans host'undan gelen webhook 421 alır.
- `/api/internal/*` (varsa) yalnız `root`. Caddy dışarıya açmaz.
- 421 gövdesi boştur ve `Cache-Control: no-store` taşır. Yönlendirme yapılmaz: askıdaki alandan `fonbridge.com`'a
  otomatik 30x, alanı ele geçiren tarafa meşruiyet kazandırır.
- `matcher` testi (`src/lib/security-headers.test.ts`, İNCELEME-57 Y-2 kalıbı) `/api/auth/callback/google`,
  `/api/brand/logo` ve `/api/v1/...` örneklerinin proxy'den geçtiğini sabitler.

### 2.3 Test matrisi (uygulama kartının DoD'u)

{kök, ACTIVE, SUSPENDED, PENDING, bilinmeyen, XFH≠Host, BÜYÜK HARF, sonda nokta} × {sayfa, server action,
`/api/auth/signin/google`, `/api/auth/callback/google`, `/api/auth/session`, `/api/brand/logo`, `/api/v1/*`,
`/api/webhooks/stripe`}. Beklenen: kök ve ACTIVE → normal. Normalize edilebilenler → karşılığı. Diğerleri → 421.
Ayrıca Caddy katmanı için gerçek konteynerde §2.1'deki 7 satır (canlı Caddy kurulumunun parçası).

---

## 3. Oturumun host'a bağlanması (B-2, Y-1, Y-4)

### 3.1 Seçim ve gerekçe

se-fb iki seçenek verdi: (a) host başına çerez adı, (b) JWT `host` claim'i. **(b) seçildi.** (a) ek katman olarak
reddedildi. Gerekçe (kaynaktan): NextAuth v5 istek başına yapılandırmayı argümansız `auth()` çağrılarında
`config(undefined)` ile kurar (`next-auth/lib/index.js:61`, yorum: "Should we pass headers() here instead?"). Sunucu
bileşenlerinde ve server action'larda `auth()` argümansız çağrılıyor (`src/lib/tenant.ts:112,169`). Bu yollarda host
başına çerez adı seçilemez; yapılandırma fonksiyonunun içinde `headers()` okumak kırılgan bir çözüm olur. (b) ise tek
bir noktada, her oturum okumasında çalışır.

### 3.2 Tasarım

1. **Çerez:** host-only kalır (Auth.js varsayılanı, `auth.ts`'te `cookies:` yok). Uygulama kartına bir test eklenir:
   `Set-Cookie`'de `Domain=` yoktur. `__Secure-` / `__Host-` önekleri korunur.
2. **Claim:** `jwt` callback'i `trigger === 'signIn'` iken `token.host = normalizeHost(headers().get('host'))` yazar.
   Host `resolveBrandHost` ile çözülemezse giriş reddedilir.
3. **Her okumada karşılaştırma:** Auth.js JWT stratejisinde `jwt` callback'i her oturum okumasında çağrılır ve `null`
   dönerse oturum çerezi temizlenir (`@auth/core/lib/actions/session.js:28-55`). Callback'in başına şu eklenir:
   ```ts
   const here = await resolveBrandHost(await headers());
   if (!here) return null;                                      // askıda / bilinmeyen host: oturum yok
   const tokenHost = token.host ?? ROOT_HOSTNAME;               // geçiş: claim'siz eski token yalnız kökte geçerli
   if (tokenHost !== hostnameOf(here)) return null;             // çapraz host replay (B-2)
   ```
   `headers()` bu callback'te istek bağlamındadır. `auth()` zaten `headers()`/`cookies()` okuyor. İstek dışında
   (graphile-worker işleri) `auth()` çağrılmaz. Çağrılırsa `headers()` hata atar ve callback `null` döner, yani
   kapalı kalır.
4. **Kiracılar arası kapı (Y-1):** aynı callback'te `here.kind === 'agency'` iken aday üyelikler
   `tenant.id === here.agencyId || tenant.agencyId === here.agencyId` ile filtrelenir. Bu filtre üç yere uygulanır:
   giriş, `unstable_update({ tenantId })` rebind'i (`auth.ts:696`) ve varsayılan üyelik (`memberships[0]` yerine
   filtrelenmiş kümenin ilki, `auth.ts:747`). Küme boşsa `null` döner ve giriş sayfası "Bu hesap bu ajansın panelinde
   değil, fonbridge.com'dan girin" der. Kiracı yine oturumdan gelir. Host kiracı seçmez, yalnız reddeder (rev. 1 §5
   ilkesi aynen geçerli).
5. **Patlama yarıçapı:** ajans alanında basılan token yalnız o alanda ve yalnız o ajansın kurumlarıyla geçerlidir.
   Alanın DNS'ini ele geçiren taraf en fazla o ajansın kurumlarına erişir. `fonbridge.com`'a ve diğer ajanslara
   erişemez. se-fb'nin kabul edilebilir bulduğu sınır budur.
6. **Google OAuth (Ö-5):** sağlayıcıya `checks: ["pkce", "state"]`. `redirect` callback'i özelleştirilmez (aynı köken).

### 3.3 C yolu: merkezi giriş aracısı (Y-4) — yalnız C'ye geçilirse

- Google yetki kodu ajans host'una **hiç** gitmez. `redirect_uri` yalnız `https://fonbridge.com/api/auth/callback/google`.
  Kodu aracı değiştirir.
- Auth.js `redirectProxyUrl` / `AUTH_REDIRECT_PROXY_URL` **yasak** (izin listesi olmadan `state.origin`'e
  yönlendiriyor, se-fb Y-4). Uygulama kartına bir test eklenir: env'de bu değişken varsa açılış hata verir.
- Akış:
  1. `panel.oka.org.tr/giris` → host-only `__Host-fb-handoff-nonce` çerezi basılır (32 bayt, `SameSite=Lax`, 5 dk).
     Tarayıcı `https://fonbridge.com/giris/aracı` adresine POST ile `{ target: 'panel.oka.org.tr', nonceHash }` gönderir.
  2. Aracı `target`'ı `resolveBrandHost` mantığıyla doğrular: `ACTIVE` olmalı, **tam eşleşme** aranır, sonek eşleşmesi
     yapılmaz, DNS kontrolü son 24 saat içinde olmalı. Google girişi aracıda yapılır.
  3. Aracı `HandoffToken { id (32 bayt), userId, targetHost, nonceHash, expiresAt = now + 60 sn, usedAt }` satırını
     yazar. DB'de yalnız `sha256(id)` saklanır.
  4. Tarayıcıya otomatik gönderilen bir **POST formu** döner (`action="https://panel.oka.org.tr/api/auth/handoff"`).
     Belirteç URL'de taşınmaz: `Referer`'a ve günlüklere düşmez.
  5. Hedef: `UPDATE … SET usedAt = now() WHERE hash = $1 AND usedAt IS NULL AND expiresAt > now() AND targetHost = $host
     RETURNING …` ile belirteci tek kullanımda tüketir. Çerezdeki nonce'un hash'i `nonceHash`'e eşit olmalı, sonra
     nonce çerezi silinir. Oturum §3.2'deki `host` claim'iyle basılır ve Y-1 filtresi uygulanır.
  6. Bir tarayıcı bir host'u ilk kez görüyorsa aracıda "Ankara Kalkınma Ajansı paneline giriş yapıyorsunuz
     (panel.oka.org.tr)" ara ekranı çıkar.
  7. Çıkış senkronu: çıkış iki alanda da yapılır (aracıdaki oturum + hedef host'taki oturum). Hedef host'tan çıkış
     yapılınca aracıya `POST /api/auth/handoff/logout` gider.
- CSP `form-action`'a `https://fonbridge.com` eklenir (yalnız ajans host'unda). Aracıda `form-action`'a o ajans host'u
  eklenir. Joker kullanılmaz, liste `AgencyDomain`'den gelir.

---

## 4. Veri modeli (Y-2) ve askıya alma (Y-3)

### 4.1 Güven sınırı veri modelinde

| Alan | Yer | Kim yazar |
|---|---|---|
| `logoKey`, `name`, `accent`, `accentDark`, `faviconKey` | `Tenant.settings.cobrand` (v2) | ajans `TENANT_OWNER/ADMIN` |
| `mode` (whitelabel açık/kapalı), `mail.displayName`, `replyTo`, `replyToVerifiedAt`, `replyToTokenHash`, `replyToTokenExpiresAt` | yeni `AgencyWhitelabel { agencyId @id, … , updatedAt, updatedBy }` | yalnız platform yöneticisi eylemi |
| `hostname`, `status`, `verifyToken(Hash)`, `lastCheckedAt` | `AgencyDomain` (rev. 1 §2.1) | platform yöneticisi + DNS kontrol işi |

- `cobrand` yazımı `jsonb_set` ile yalnız kendi anahtarlarını değiştirir. Bugünkü bütün-nesne değiştirme
  (`cobrand-store.ts:112-115`) v2'de kaldırılır. Kilit gerekmez: platform alanları artık bu JSON'da değil.
- `AgencyWhitelabel` ve `AgencyDomain` üzerindeki her değişiklik `AuditEvent`'e yazılır (eski ve yeni değer; Reply-To
  belirteci hariç).
- İki yeni tablo için FONBRIDGE'in yeni-tablo kapıları uygulama kartına not edilir: `where-guard-src`, teardown guard,
  `rls:bypass-check` izin listesi. `resolveBrandHost` oturum öncesi okuduğu için tek bir sistem-okuma fonksiyonuna
  sınırlanır.

### 4.2 Askıya alma: tek otomatik adım

Platform yöneticisi paneli "askıya al" → tek eylem, sırayla:

1. `AgencyDomain.status = SUSPENDED` + `AuditEvent` + `pg_notify`. Uygulama katmanı bu andan itibaren 421 döner (§2.2).
   Açık oturumlar bir sonraki okumada `null` olur (§3.2-3).
2. Caddy: bloğu kaldıran Caddyfile üretilir, `caddy validate`, sonra `caddy reload`. Statik blokta reload TLS'i
   kapatır (§2.1 ölçümü). Sertifika depodan da silinir: tekrar eklenirse LE'den yeni sertifika alınır, eskisi dönmez.
3. Doğrulama: `curl --resolve <host>:443:127.0.0.1 https://<host>/` → TLS hatası ya da 421. Sonuç panelde görünür.
   Başarısızsa adım "yarım" durumda kalır ve yöneticiye alarm gider.
4. Google Cloud: ilgili `redirect_uri` ve yetkili alan istemciden kaldırılır. Bu adım elle yapılır, panelde işaretlenir,
   Google API'si ile otomatikleştirilmez (istemci yönetimi API'si yok). Adım işaretlenmeden kayıt "tamamlandı" sayılmaz.
5. Ajansa "CNAME'i kaldırın" e-postası. Alan 180 gün `SUSPENDED` kalır. Aynı hostname yeniden talep edilirse yeni TXT
   doğrulaması gerekir (rev. 1 §5).

On-demand'a geçilirse 2. adım "yeniden başlat" olur (se-fb 1.2-F). Bu davranış farkı çalışma kitabına yazılır.

---

## 5. HSTS (Ö-3)

- **Ajans host'u:** `max-age=31536000`, `includeSubDomains` **yok**. Kök alan desteklenmediği için (§0-3) etki
  `*.panel.<ajans>` ile sınırlıydı. Yine de gönderilmez: ajansın alt alan düzenine karışmıyoruz.
- **`fonbridge.com` (yan bulgu, B5 kapsamı dışında, patron onayı bekliyor):** bugün uygulama her yanıtta
  `max-age=31536000; includeSubDomains` gönderiyor (`security-headers.ts:67,73`; `next.config.ts` `source: '/:path*'`).
  Bu, `docs/SMTP-SUNUCU.md:540-541`'deki "`includeSubDomains` koymayın" kararıyla çelişiyor. **Öneri (lider, 30.09):**
  HSTS yalnız Caddy'de ayarlansın, uygulama göndermesin.
- **Ölçüm (bu revizyon, ek `spike-hsts.Caddyfile`):** SMTP-SUNUCU.md'deki planlı satır (`header Strict-Transport-Security
  "max-age=300"`, `>` olmadan) upstream'in başlığını **silmiyor**. İki başlık çıkıyor:
  ```
  fonbridge.test  (header, '>' yok)  → strict-transport-security: max-age=300
                                       strict-transport-security: max-age=31536000; includeSubDomains
  panel…          (header >…)        → strict-transport-security: max-age=31536000
  ```
  RFC 6797 §8.1'e göre tarayıcı yalnız ilk başlığı işler. Bugün sonuç tesadüfen doğru, ama sıra değişirse yanlışa
  döner. Caddy'de `>` (defer, değiştir) kullanılmalı. Uygulama kartı: `SMTP-SUNUCU.md`'deki Caddyfile satırı
  `header >Strict-Transport-Security …` olarak düzeltilir.
- Patron "yalnız Caddy" önerisini onaylamazsa yedek plan: `next.config.ts` başlık kuralları `has: [{ type: 'host' }]`
  ile ikiye ayrılır (kök ve ajans host'u). Yine de Caddy'de `>` kalır.

---

## 6. Bulgu yanıt tablosu

| # | Bulgu (kısa) | Yanıt | Nerede |
|---|---|---|---|
| **B-1** | Host kapısı `/api/*`'yi kapsamıyor | **Kabul.** Caddy katmanı (statik blok + `strict_sni_host` + `:443` 421) her yolu kapsar. Proxy matcher'ı `/api/:path*`'yi de kapsar ve tek `resolveBrandHost()` fonksiyonunu çağırır. Aynı kontrol `jwt` callback'inde de var. Önceden alınmış sertifikayla gelen askıdaki host her istekte reddedilir (statik blokta TLS'te, her durumda uygulamada). Ölçüldü | §2 |
| **B-2** | Oturum host'a bağlı değil | **Kabul, seçenek (b).** Host-only çerez + JWT `host` claim + her okumada karşılaştırma (`null` dönerse oturum silinir). (a) gerekçeyle reddedildi: `auth()` argümansızken `config(undefined)` | §3.1-3.2 |
| **Y-1** | Kiracı kapısı yalnız girişte | **Kabul.** Filtre giriş, rebind ve varsayılan üyelikte uygulanır, her okumada | §3.2-4 |
| **Y-2** | Platform alanları ajansın yazdığı JSON'da | **Kabul.** Ayrı `AgencyWhitelabel` tablosu, `jsonb_set` ile kısmi yazma, denetim kaydı | §4.1 |
| **Y-3** | Askıya alma çalışma kitabı eksik | **Kabul, değişiklikle.** Tek otomatik adım + doğrulama + Google adımı. "Yeniden başlat" yerine reload: statik blokta reload'un TLS'i kapattığı ölçüldü. On-demand için restart notu korunur | §4.2 |
| **Y-4** | C devri tarayıcıya bağlı değil | **Kabul.** Google kodu aracıda kalır, `redirectProxyUrl` yasak, nonce çerezi, DB'de tek kullanımlık 60 sn belirteç, POST ile taşıma, ara ekran, çıkış senkronu | §3.3 |
| **Y-5** | DMARC `p=reject` olmadan E1 olmaz | **Kabul.** Aşama 0'daki E1 için önkoşul: SPF `-all`, DKIM hizalı, DMARC `p=reject; adkim=s` (en az `p=quarantine`), 2-4 haftalık temiz rapordan sonra. Takvim bağımlılığıdır, efor değildir | §7 |
| **Y-6** | `From` dize + ad politikası yok | **Kabul.** `MailMessage.from: { name, address }`. `address` sabit. Ad ≤64 karakter; `@ < > "` ve CR/LF içeremez; hassas sözcükler (`fonbridge`, `güvenlik`, `destek`, `bakanlık`, `T.C.`) ikinci yönetici onayı ister. Aynı politika beyaz etikette `<title>` olan `cobrand.name`'e de uygulanır (Ö-4) | §4.1, §7 |
| Ö-1 | Host normalizasyonu | **Kabul.** `normalizeHost()`: küçük harf, port, sondaki nokta, punycode. Saklama ve istek aynı fonksiyonu kullanır | §2.2 |
| Ö-2 | `ask` ucu | **Kapsam dışı (gerekçeli).** On-demand tasarımdan çıktı, `ask` ucu yok. Self-servis alan istenirse se-fb'nin şartları geçerli: bellek içi küme, loopback, IP başına sınır | §2.1 |
| Ö-3 | HSTS `includeSubDomains` | **Kabul.** Ajans host'unda yok. Kök için Caddy'ye taşıma önerisi (patron onayı bekliyor). Caddy `header >` şartı ölçümle eklendi | §5 |
| Ö-4 | Tema notları | **Kabul.** ICO/SVG favicon reddi. E-posta HTML şablon yükleme **yasak** (uygulama kartında açıkça yazılır). `/api/brand/*` host-hash'li URL + `Vary: Host` ile sunulur ve host kapısından geçer. `name` ad politikasına tabi | §2.2, §6 Y-6 |
| Ö-5 | OAuth B: `state` ekle | **Kabul.** `checks: ["pkce", "state"]` | §3.2-6 |
| Ö-6 | Reply-To ayrıntısı | **Kabul.** Adres ajansın `ACTIVE` alanının altında ya da sözleşmede adı geçen adres olmalı. Belirteç 32 bayt, DB'de hash'li, 24 saat geçerli, tek kullanımlık. Adres değişince doğrulama sıfırlanır. Alan `SUSPENDED` olunca Reply-To kullanılmaz | §4.1 |
| Ö-7 | E2 SPF/DKIM/DMARC | **Kabul (aşama 2'ye).** Seçici CNAME ile bizde. Ajans başına ayrı anahtar. Yalnız ACTIVE ve DKIM kaydı doğrulanmış alan imzalanır. Return-Path bizde. `sp=` kontrolü. E3 önerilmez | rev. 1 §4, aşama 2 |

---

## 7. Efor (se-fb §4 düzeltmesi aşamalara dağıtıldı)

Kişi-gün, tek geliştirici, test + inceleme dahil, ±%30.

| Aşama | rev. 1 | Eklenen (bulgu) | rev. 2 |
|---|---|---|---|
| **0 — Alan adsız markalama + E1** | 7-9 | Y-2 veri modeli ayrımı + denetim + `jsonb_set` (1-1,5); Y-6/Ö-6 `from` nesnesi, ad politikası, Reply-To belirteci (0,5-1) | **8,5-11,5** |
| **1 — Ajans alan adı (B)** | 8-12 | B-1 iki katmanlı kapı + matcher + test matrisi (1-1,5); B-2 `host` claim + çapraz host replay testi (2-3); Y-1 filtre (0,5-1); canlı öncesi bağımsız inceleme + iki alanlı sızma testi (1,5-2) | **13,5-19,5** |
| **1b — İşletme** | 2-3 | Y-3 askıya alma otomasyonu + doğrulama + Google adımı (0,5-1) | **2,5-4** |
| **B toplamı (0+1+1b)** | 17-24 | +7-11 | **≈ 24-35** |
| 2 — E2 (ajans alanından e-posta) | 5-8 | Ö-7 (rev. 1'de vardı) | 5-8 (+MTA) |
| **3 — C (koşullu)** | +8-12 | Y-4: nonce bağı, DB tek kullanım, POST taşıma, ara ekran, çıkış senkronu testleri (+3-5) | **≈ +11-17** |

Gerekçe:
- Rakamlar se-fb'nin tablosuyla aynı. Burada yalnız aşamalara dağıtıldı. Bu revizyonun kararları toplamı değiştirmiyor:
  - On-demand'ın çıkması `ask` ucunu siliyor (-). Statik blok üretimi ve reload otomasyonu ekleniyor (+). Birbirini
    götürüyor.
  - B-2'de (b) seçeneği, (a)'nın istek başına yapılandırma işini gerektirmiyor. Tahmin se-fb'nin 2-3 aralığının alt
    ucuna yakın. Aralık korundu çünkü claim'siz eski token geçişi ve `headers()` bağlamı testleri ekleniyor.
  - HSTS'in Caddy'ye taşınması (§5) B5 dışı bir kart. Burada sayılmadı (≈0,25 gün).
- Kök alanın desteklenmemesi (§0-3) eforu azaltmaz. rev. 1 zaten yalnız alt alanı hesaplamıştı. Kök alan A kaydı ve
  IP bağımlılığı riski tamamen kalkar.
- Takvim bağımlılıkları (efor değil): DMARC reject için 2-4 hafta gözlem (Y-5). Caddy'nin canlıda kurulması
  (`RELEASE_CHECKLIST.md:32`). Ajans BT'sinin 3 DNS kaydı. Google Cloud'da redirect URI + Search Console doğrulaması.

Sıra: 0 (DMARC gözlemi paralel başlar) → Caddy canlı → 1 + 1b → talep olursa 2 → gerekirse 3.

---

## 8. Patron soruları (güncel hâl)

| # | Soru | Durum |
|---|---|---|
| 1 | Beyaz etikette giriş ekranı ve e-posta altbilgisinde küçük "FonBridge altyapısıyla" ibaresi kalsın mı? (KVKK/DPA işleyeni FonBridge diye adlandırmak zorunda) | **AÇIK.** Öneri: evet (hukuk + oltalama önlemi) |
| 2 | Kök alan mı, alt alan mı? | **KAPANDI (önerilen, 30.09 lider önerisi; patron onayı teyit edilmedi).** Yalnız alt alan (`panel.<ajans>`). Kök alan yönlendirmesi ajansın işi |
| 3 | Google onay ekranı "FonBridge" gösterir. Ajans başına ayrı OAuth istemcisi istenir mi? | **AÇIK.** Öneri: hayır (tek istemci, kullanıcıya ipucu da olur) |
| 4 | E2 (ajansın kendi alanından e-posta, kendi MTA) 2. yıl kapsamına girer mi? | **AÇIK.** Ek bilgi: E1 de DMARC reject önkoşuluna bağlandı (Y-5) |
| 5 | Görünen adı kim belirler? | **KAPANDI (tasarım kararı, onay bekliyor):** platform yöneticisi, sözleşmedeki resmi ad. Veri modelinde de ajans yazamaz (Y-2) |
| 6 | B5 OKA lisansına mı dahil, ayrı kalem mi? | **AÇIK** (`OKA-KANAL-ONERISI.md:73-75` lisans tutarı hâlâ açık). Efor artık 24-35 kişi-gün |
| 7 | Beyaz etikette birinci hat destek ajans mı, biz mi? | **AÇIK** |
| 8 | Ajans ayrılınca bağlı kurumlar `fonbridge.com`'a taşınsın mı, bildirim süresi? | **AÇIK.** Öneri: 30 gün bildirim, alan 180 gün `SUSPENDED` |
| 9 (yeni) | `fonbridge.com` HSTS'i yalnız Caddy'de ayarlansın, uygulama göndermesin mi? `includeSubDomains` kalksın mı? | **AÇIK (lider önerisi 30.09, patron onayı bekliyor).** B5 dışı, ayrı kart |
| 10 (yeni) | İlk uygulama kartından önce C yolu gerekecek mi? (ikinci ajans + Google alan doğrulaması darboğazı) | **AÇIK**, 2. yıl planlamasında. C seçilirse §3.3 zorunlu tasarım girdisi |
