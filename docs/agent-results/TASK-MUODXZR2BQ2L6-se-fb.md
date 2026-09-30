# TASK-MUODXZR2BQ2L6 — FB İNCELEME-111: KAMU B5 tam beyaz etiket tasarımı, güvenlik incelemesi (se-fb)

İncelenen: `docs/agent-results/TASK-MULRSKF51ZLTW-fe-fb.md` (tamamı) ve `-ekler/` (spike-Caddyfile, spike-ask.py,
spike-ask.log), `docs/kamu/OKA-KANAL-ONERISI.md:37,87`, `src/lib/agency/cobrand.ts`, `prisma/schema.prisma:32,52-57`.
Ayrıca doğrulama için okunan kodlar: `src/proxy.ts`, `next.config.ts`, `src/lib/auth.ts`, `src/lib/security-headers.ts`,
`src/lib/email/mailer.ts`, `src/lib/email/invitation-email.ts`, `src/lib/agency/cobrand-store.ts`,
`src/app/[locale]/(app)/ajans/cobrand-actions.ts` ve kurulu `@auth/core@0.41.3` / `next-auth@5.0.0-beta.32` kaynağı.
Ürün kodu, `prisma/` ve `dev` dalı değişmedi. Push yapılmadı, :5433'e bağlanılmadı.

**Platform beyanı:** mac (Darwin 27.0, Docker 29.7.2, `caddy:2.11.4`) üzerinde doğrulandı. Spike yalnız Caddy konteyneri
ve yerel Python stub'ı kullandı. İncelenen tasarım Linux VPS'te (Docker) koşacak; ağ düzeyindeki davranış (TLS, SNI,
Host, X-Forwarded-*) aynı Caddy imajıyla Linux'ta aynıdır. Windows **koşulmadı**: hedef platform değil, kod yolu
platforma bağlı değil. Gerçek ACME / Let's Encrypt **koşulamadı**: herkese açık DNS ve 80/443 gerekir. Spike Caddy'nin
`internal` iç CA'sıyla yapıldı. LE hız sınırlarıyla ilgili her şey belgeye dayalıdır ("çıkarım" diye işaretli).

---

## Karar

**TASARIM DÜZELTMESİ GEREKLİ.** 2 B (engelleyici) · 6 Y (yüksek) · 7 Ö (öneri).

Tasarımın yönü doğru: host yalnız markayı seçer, kiracı hep oturumdan gelir (fe-fb §5). `ask` kapısı ve statik blok
önerisi, renk için hex-regex, SVG reddi, görünen adı platform yöneticisinin belirlemesi ve doğrulanmış Reply-To doğru
kararlar. Ama iki temel güvenlik kontrolü tasarımda yazıldığı yerde çalışmıyor:
- **B-1:** host kapısı `src/proxy.ts`'e konmuş, bu dosya `/api/*` için hiç çalışmıyor.
- **B-2:** oturum çerezi host'a bağlı değil. Bir ajans alanında basılan oturum `fonbridge.com`'da da geçerli.

Uygulama kartı bu ikisi düzeltilmeden açılmamalı.

---

## 1. Spike yeniden koşusu (kanıt)

Ortam: scratchpad `…/scratchpad/b5/`. Konteyner `sefb-b5spike` (`-p 18443:443`) + `ask.py` (`:9124`). Stub'ın `/check`
yolu `ask`'tır ve `mode` dosyasıyla `normal | 500 | hang` modlarına geçer. Diğer yollar, gelen `Host`, `X-Forwarded-Host`
ve `X-Forwarded-Proto` başlıklarını geri yazan upstream'dir. İş bitince temizlik doğrulandı:
`docker ps -a --filter name=sefb-b5spike | wc -l → 0` ve `pgrep -f b5/ask.py | wc -l → 0`.

### 1.1 On-demand + `ask` (catch-all `https://`, `tls { on_demand; issuer internal … }`)
```
1 onaylı ad                        [http=200] upstream Host=panel.oka-ornek.test:18443 XFH=panel.oka-ornek.test:18443
2 onaysız ad (ask 404)             [http=000]
5 ask 500, yeni ad                 [http=000 t=0.010s]
6 ask asılı kalıyor, yeni ad       [http=000 t=10.004s]
  caddy: "failed to get permission for on-demand certificate","domain":"yeni2.oka-ornek.test" …
3 SNI=panel, Host: saldirgan.test  [http=200] upstream Host=saldirgan.test XFH=saldirgan.test      ← Host ≠ SNI geçiyor
4 istemci X-Forwarded-Host: evil   [http=200] upstream … XFH=panel.oka-ornek.test:18443            ← Caddy siliyor
7 SNI büyük harf                   [http=200] upstream Host=PANEL.OKA-ORNEK.TEST:18443  (ask: domain=panel.oka-ornek.test)
8 sonda nokta                      upstream Host=panel.oka-ornek.test.:18443            (ask: domain=panel.oka-ornek.test)
```

### 1.2 Önbellekteki sertifika ve iptal (normal ömür, `issuer internal`)
```
A ilk el sıkışma → sertifika alındı         [http=200]   ask çağrısı: 1
B ikinci el sıkışma                         [http=200]   ask çağrısı: yine 1 (önbellekteyken ask sorulmuyor)
C ask artık 404 (askıya alındı)             [http=200]   ← hâlâ sunuluyor
D ask kapalı                                [http=502]   ← TLS başarılı (502 = upstream stub da kapalı)
E depodan sil + `caddy reload --force`      [http=502]   ← TLS HÂLÂ başarılı: bellek önbelleği reload'da boşalmıyor
F konteyneri yeniden başlat                 [http=000]   ← ancak şimdi sunulmuyor
```

### 1.3 Yenileme penceresinde `ask` (`lifetime 3m` ile sertifika acil yenileme penceresine sokuldu)
```
caddy: "certificate is in emergency renewal window" … "attempting certificate renewal"
ask 404 → caddy: "certificate should not be obtained … decision func: … not allowed by permission module"  → [http=200] eski sertifika sunuldu
ask 500 → [http=000] ;  ask kapalı → [http=000] "failed to get permission … connection refused"
```

### 1.4 Statik site bloğu (`panel.oka-ornek.test, fonbridge.test { tls internal … }`)
```
G kendi host'u                               [http=200]
H SNI=panel, Host: saldirgan.test             [http=200] (boş gövde; upstream'e gitmedi)
I SNI=panel, Host: fonbridge.test (listede)   [http=200] upstream Host=fonbridge.test   ← çapraz site geçiyor
J bilinmeyen SNI                              [http=000]
K + global `servers { strict_sni_host on }`, SNI=panel, Host: fonbridge.test   [http=421]
L + strict_sni_host, kendi host'u             [http=200]
```

### 1.5 `ask` iddiasının hükmü
- **Fail-closed: DOĞRULANDI.** Onaysız ad (2), `ask` 500 (5), zaman aşımı (6, Caddy yaklaşık 10 sn'de keser) ve `ask`
  kapalıyken (fe-fb) yeni sertifika alınmıyor, TLS kuruluyor.
- **"Önceden alınmış sertifika ask kapansa da sunuluyor": DOĞRULANDI ve genişletildi.** Sertifika `ask` 404'te de
  sunuluyor (C). `caddy reload --force` ve depodan silme bellek önbelleğini boşaltmıyor (E). Yalnız süreç yeniden
  başlatılınca sunulmuyor (F).
- **fe-fb'nin açık sorusu ("yenilemede ask çağrılıyor mu?"): EVET** (1.3). Yenileme reddedilirse eski sertifika süresi
  dolana dek sunulmaya devam ediyor. Yani askıya alınan bir alan, uygulama katmanı kapatmazsa sertifikanın geri kalan
  ömrü boyunca açık kalır. LE için bu 90 güne kadar sürebilir (çıkarım: LE varsayılan ömrü).
- **"Her istekte host doğrulaması yeterli mi?": Tasarımdaki yerinde YETERSİZ.** Gerekçe: B-1 (`/api/*` kapsam dışı),
  bulgu 3 (Host, SNI'dan bağımsız ve saldırganın seçimi) ve bulgu I (statik blokta da çapraz site geçiyor). Yeterli
  olması için iki katman gerekir: Caddy'de `strict_sni_host on` ve bilinmeyen Host için 421, uygulamada da `/api` dahil
  her yol için host kontrolü.

---

## 2. Bulgular

### B-1 — Host kapısı `src/proxy.ts`'te; proxy `/api/*` için çalışmıyor
- **Konum:** fe-fb §2.1 ("`src/proxy.ts` her istekte host'u okur … bilinmeyen host → 404/421") ve §5 ("İptal uygulama
  katmanında (proxy host kapısı)"). Kod: `src/proxy.ts:83` matcher'ı `(?!api(?:/|$)|…)` ile `/api`'yi dışarıda bırakıyor.
  `next.config.ts:134` açıkça yazıyor: "The proxy does not run for /api". Statik uzantılar da dışarıda (`proxy.ts:57-63`).
- **Kanıt:** matcher satırı yukarıda. Bulgu 3 ve I'ya göre Host, TLS adından bağımsız olarak herhangi bir değer alabiliyor.
- **Etki:** Askıya alınmış ya da bilinmeyen bir host'tan `/api/auth/*` (Google girişi, geri dönüş, oturum çerezi
  basma), `/api/brand/*` ve tüm `requireTenantApi` uçları cevap vermeye devam eder. fe-fb'nin "önbellekteki sertifika"
  riskine önerdiği tek önlem bu uçları kapsamıyor. Kod artık `trustHost: true` (`auth.ts:345`) ve `AUTH_URL`'nin
  sabitlenmemesi önerisiyle birleşince Auth.js geri dönüş adresini saldırganın Host'undan kurar
  (`@auth/core/lib/utils/env.js:81` `x-forwarded-host ?? host`). Bugün Google, kayıtsız `redirect_uri`'yi reddettiği için
  kod çalınmıyor. Ama §C yolunda (Y-4) bu doğrudan hesap ele geçirmeye dönüşür.
- **Tasarım değişikliği:**
  1. **Caddy katmanı (birincil):** her ajans için açık site bloğu (on-demand değil, pilotta zaten öneriliyor), global
     `servers { strict_sni_host on }` (ölçüldü: K → 421) ve bilinmeyen Host için catch-all `abort` / 421. Next yalnız
     `127.0.0.1`'e bağlı kalmalı (bugün öyle: `docker-compose.yml:31`). Böylece bulgu 4'teki XFH silme davranışı
     garanti olur.
  2. **Uygulama katmanı (ikincil, zorunlu):** tek bir `resolveBrandHost(request)` fonksiyonu. Proxy, `/api/auth/[...]`
     sarmalayıcısı, `requireTenantApi` / `requireTenantAction` ve `/api/brand/*` bu fonksiyonu çağırmalı. Bilinmeyen ya da
     `SUSPENDED` host → 421. Alternatif: matcher'ı `/api` için genişletip yalnız host kontrolü yapmak (CSP'ye dokunmadan).
  3. Test matrisi: {kök, ACTIVE, SUSPENDED, bilinmeyen} × {sayfa, `/api/auth/signin`, `/api/auth/callback/google`,
     `/api/brand/logo`, server action}.

### B-2 — Oturum (JWT) host'a bağlı değil; ajans alanında basılan oturum her alanda geçerli
- **Konum:** fe-fb §2.4 "Cookie: … alanlar arası oturum paylaşımı **yok**". Kod: tek `secret` (`auth.ts:349`), tek çerez
  adı (Auth.js varsayılanı; `auth.ts`'te `cookies:` yok), JWT yalnız `secret` + çerez adıyla şifreleniyor. Oturum
  stratejisi `jwt` (`auth.ts:344`).
- **Kanıt (kod okuması + çıkarım):** Host-only çerez yalnız tarayıcının çerezi *kendiliğinden* göndermesini engeller.
  `panel.oka.org.tr` üzerinde basılan `__Secure-authjs.session-token` değeri `fonbridge.com`'a elle konursa aynı
  secret'la çözülür ve geçerlidir. Canlı olarak koşulmadı: 2 host'lu test ortamı yok.
- **Etki:** Ajans alanının DNS'ini kontrol eden taraf, oturum çerezlerini ve Google geri dönüşlerini toplayabilir. Bu
  taraf kötü niyetli ya da ele geçirilmiş bir ajans BT'si olabilir, ya da ajans DNS'inde subdomain takeover yapan biri.
  Yöntem: DNS'i kendi sunucusuna çevirir, alan kendisinin olduğu için kendi LE sertifikasını alır ve trafiği bize aktarır.
  Toplanan çerezle kullanıcının **tüm kiracılarına** (başka ajansların kurumları dahil) `fonbridge.com` üzerinden girer.
  B yolunda ajans alanı doğası gereği o alandaki oturumlar için "güvenilir"dir; bu kabul edilebilir. Kabul edilemez olan,
  patlama yarıçapının ajansın kendi kurumlarıyla sınırlı kalmaması.
- **Tasarım değişikliği:** oturumu host'a bağla. Seçenekler:
  (a) NextAuth v5'in istek başına yapılandırmasıyla (`NextAuth(async req => config)`) host başına çerez adı. Çerez adı
  JWT salt'ı olduğu için başka host'ta çözülmez.
  (b) JWT'ye `host` claim'i ekle ve B-1'deki tek kontrol noktasında `token.host === resolveBrandHost()` şartını ara.
  Ayrıca ajans host'unda basılan token'da kiracı yalnız o ajansa bağlı üyeliklerle sınırlanır (Y-1).

### Y-1 — Kiracılar arası kapı yalnız girişte; kiracı değiştirme ve `memberships[0]` varsayılanı kapıyı atlar
- **Konum:** fe-fb §2.1 ("o alanda giriş yaparsa oturum açılmaz"). Kod: `auth.ts:689-750`. `unstable_update({ tenantId })`
  ile kiracı yeniden bağlanabiliyor (`requestedTenantId`, satır 696). Varsayılan üyelik `memberships[0]` (satır 747).
- **Etki:** A ve B ajanslarına bağlı iki kurumda üyeliği olan bir kullanıcı A alanında giriş yapar, sonra kurum
  değiştirir ve B'nin kurumuyla A'nın markası altında çalışır. Bu marka sızıntısı ve oltalama zemini demek. Tersi de var:
  A'ya bağlı bir üyeliği olup ilk üyeliği başka yerde olan kullanıcı yanlışlıkla reddedilir. Veri sızıntısı yok, çünkü
  kiracı hâlâ kullanıcının kendi üyeliği.
- **Değişiklik:** `jwt` callback'i host'u bilmeli. Ajans host'unda aday üyelikler `tenant.agencyId === hostAgency`
  olanlarla (ve ajansın kendisiyle) filtrelenmeli; rebind bu kümenin dışına izin vermemeli. Kontrol her istekte de
  yapılmalı (B-1'deki tek nokta), yalnız `signIn`'de değil.

### Y-2 — Platform yöneticisine ait marka alanları, ajansın yazabildiği JSON nesnesinin içinde
- **Konum:** fe-fb §3.1 `AgencyBrand.mail { displayName, replyTo, replyToVerifiedAt }` ve `mode` alanları
  `Tenant.settings.cobrand` içinde. §4.3'e göre ise "displayName ajans panelinden değil platform yöneticisinden" gelmeli.
  Kod: `cobrand-store.ts:112-115` `cobrand` anahtarını **bütün olarak** `{ logoKey, name, updatedAt }` ile değiştiriyor.
  Yazan: ajansın `TENANT_OWNER/ADMIN`'i (`cobrand-actions.ts:18-23`). Oku-birleştir-yaz kilitsiz ve işlemsiz.
- **Etki:** (i) Bugünkü B4 formu bir kez kaydedilince yöneticinin koyduğu `mail.*` ve `mode` alanları silinir. (ii) v2
  formu nesneyi birleştirirse ajans `displayName` ve `replyToVerifiedAt` alanlarını kendi yazabilir. Bu, §4.3'teki
  sahtecilik önleminin ve Reply-To doğrulamasının atlanması demek. (iii) Yönetici ile ajans aynı anda yazarsa
  güncellemelerden biri kaybolur.
- **Değişiklik:** güven sınırını veri modeline taşı. Ajansın düzenleyebileceği alanlar `cobrand` v2'de kalır: `logoKey`,
  `name`, `accent`, `accentDark`, `faviconKey`. Platform alanları ayrı bir tabloya ya da `AgencyDomain`'e taşınır:
  `mail.displayName`, Reply-To ve doğrulama durumu, `whitelabel` açık/kapalı. Bu alanları yalnız platform yöneticisi
  eylemi yazar, her değişiklik `AuditEvent`'e düşer. Yazma işlem içinde yapılır (`SELECT … FOR UPDATE` ya da JSON
  `jsonb_set`).

### Y-3 — Askıya alma / iptal çalışma kitabı eksik: reload yetmez, Google `redirect_uri` kalır
- **Konum:** fe-fb §2.2 ve §5 ("Caddy depolamasından sertifikayı silmek ayrıca işletme adımı"), §2.3 (60 sn bellek
  önbelleği).
- **Kanıt:** 1.2-E / F. Depodan silip `caddy reload --force` yapılınca TLS hâlâ kuruluyor, yalnız yeniden başlatma
  kapatıyor. 1.3: yenileme reddedilse de eski sertifika süresi dolana dek sunuluyor.
- **Etki:** Askıdaki alan TLS'te açık kalır (B-1 düzeltilmezse uygulamada da açık kalır). Google istemcisinde kayıtlı
  kalan `https://<eski alan>/api/auth/callback/google`, alanın yeni sahibine bizim istemcimiz için yetki kodu teslim
  edilmesine izin verir. Kodun kullanılması için secret + PKCE gerekir; ama B-2 senaryosunda trafik bize aktarılarak
  kullanılabilir.
- **Değişiklik:** askıya alma tek bir otomatik adım olmalı: (1) `AgencyDomain.status = SUSPENDED` ve önbellek
  geçersizleştirme (60 sn TTL'i beklemeden, tüm örneklerde). (2) Caddyfile'dan bloğu çıkar, depodan sertifikayı sil,
  Caddy'yi **yeniden başlat** (reload değil). Sertifika depoda olduğundan yeniden başlatma LE'den yeni sertifika istemez
  (çıkarım: 1.2-A/B, önbellekten yükleme). (3) Google istemcisinden `redirect_uri`'yi ve Authorized domain'i kaldır.
  (4) Ajansa "CNAME'i kaldırın" e-postası. Adımın sonunda `curl --resolve` ile TLS'in kapandığı doğrulanır.

### Y-4 — C yolu (merkezi giriş aracısı): kod/oturum devri tarayıcıya bağlı değil; Auth.js `redirectProxyUrl` kullanılmamalı
- **Konum:** fe-fb §6 C ("tek kullanımlık, 60 sn, hedef-host'a bağlı kodla oturum devri"), §7 aşama 3.
- **Kanıt (kaynak):** Auth.js'in hazır "OAuth vekili" `@auth/core/lib/actions/callback/index.js:28-34`. Bu kod `state`
  içindeki `origin`'e **izin listesi olmadan** `?code=…&state=…` ile yönlendiriyor. `origin` ise
  `authorization-url.js:36-40`'ta `provider.callbackUrl`'den geliyor, o da istek Host'undan kuruluyor (`env.js:81`).
  Buna bulgu 3 (Host ≠ SNI geçiyor) eklenince zincir şöyle işler: saldırgan kendi tarayıcısıyla `Host: evil` üzerinden
  giriş başlatır. Kurbana Google URL'sini gönderir. Kurbanın kodu `evil`'e düşer. Saldırgan kodu kendi PKCE/state
  çerezleriyle gerçek geri dönüşe verir ve kurbanın hesabına girer. Canlı koşulmadı (Google gerekir); kaynak okumasına
  dayalı zincir.
- **Etki:** hesap ele geçirme. Hedefte kullanıcının tüm kiracıları vardır.
- **Değişiklik:** C'de Google yetki kodu **asla** ajans host'una aktarılmaz; değişimi aracı (`fonbridge.com`) kendisi
  yapar. Devir belirteci için:
  - Hedef host `ACTIVE` ve DNS'i o an doğrulanmış olmalı. Tam eşleşme yapılır, sonek eşleşmesi değil.
  - Belirteç tarayıcıya bağlanır: hedef host yönlendirmeden önce host-only bir nonce çerezi basar, aracı bu nonce'un
    hash'ini belirtece gömer.
  - Belirteç DB'de tek kullanımlıktır ve 60 sn geçerlidir.
  - Belirteç URL sorgusunda değil, otomatik gönderilen POST formuyla taşınır: `Referer` ve günlüklere sızmaz.
  - Basılan oturum B-2'deki host bağıyla basılır.
  - İlk kez görülen bir host için aracıda "X ajans paneline giriş yapıyorsunuz" ara ekranı gösterilir.
  - Çıkış senkronu yapılır.
  `form-action` bu durumda `https://fonbridge.com` eklenerek genişler (fe-fb §2.4, doğru).

### Y-5 — `fonbridge.com` DMARC'ı `p=reject` olmadan E1 başlamamalı
- **Konum:** fe-fb §4.1 E1 (`"<Ajans>" <bildirim@fonbridge.com>`). `docs/SMTP-SUNUCU.md:101,117` planı `p=none` ile
  başlıyor, `:138` "2-4 hafta sonra quarantine → reject" diyor. Yayında DNS kaydı henüz yok (`SMTP-SUNUCU.md:59`).
- **Etki:** `p=none` ya da kayıt yokken herkes `"Ankara Kalkınma Ajansı" <bildirim@fonbridge.com>` gönderebilir. Beyaz
  etiket, alıcıya "ajans postası bu adresten gelir" diye öğretir ve sahte postayı meşru gösterir.
- **Değişiklik:** aşama 0'ın E1 kısmına önkoşul ekle: SPF `-all`, DKIM hizalı, DMARC `p=reject; adkim=s` (ya da en az
  `p=quarantine`). Önkoşul, 2-4 haftalık temiz rapordan sonra sağlanmış sayılır. Bu takvim bağımlılığıdır, efor değildir.

### Y-6 — Görünen ad `From`'a dize olarak girerse başlık/adres enjeksiyonu; ad politikası eksik
- **Konum:** fe-fb §4.1 ve §4.3. Kod: `mailer.ts:20-21` ve `:119` `from` alanını **dize** olarak alıp nodemailer'a
  veriyor. Şablonlama `\`"${name}" <addr>\`` biçiminde olacak.
- **Etki:** ad içindeki `"` ya da `<saldirgan@x>` görünen adresi değiştirebilir. Ad yönetici kontrolünde olduğu için
  istismar zor (bu yüzden B değil Y). Ayrıca ad politikası yok: yönetici bile `FonBridge Güvenlik`, `T.C. … Bakanlığı`
  ya da `destek@oka.org.tr` (içinde `@` olan ad) girebilir. Yalnız görünen adı gösteren istemcilerde bu doğrudan
  sahteciliktir.
- **Değişiklik:** `MailMessage.from` alanı `{ name, address }` nesnesi olarak tanımlanır (nodemailer RFC 2047
  kodlamasını yapar). `address` sabittir (`bildirim@fonbridge.com`). Ad için: denetim kaydıyla yazılır, sözleşmedeki
  resmi addır, ≤64 karakterdir; `@`, `<>`, `"`, CR/LF içeremez; `fonbridge`, `güvenlik`, `destek`, `bakanlık` ve `T.C.`
  içeren adlar ikinci bir yönetici onayı ister. Konu satırı için mevcut CR/LF temizliği (`invitation-email.ts:23`)
  korunur. HTML kaçışı zaten var (`invitation-email.ts:32-33` `escapeHtml`); fe-fb'nin "HTML kaçışı da test edilmeli"
  notu karşılanmış.

### Ö-1 — Host normalizasyonu
Caddy SNI'yı küçük harfe çevirip sondaki noktayı atarak `ask`'a veriyor, ama upstream `Host`'unu **olduğu gibi**
iletiyor. Ölçüm 7/8: `PANEL.OKA-ORNEK.TEST:18443` ve `panel.oka-ornek.test.:18443`. `resolveBrandHost` şunu yapmalı:
küçük harf, port atma, sondaki noktayı atma, IDN → punycode. `AgencyDomain.hostname` da aynı biçimde saklanmalı
(fe-fb §2.1 saklamayı söylüyor, istekte normalizasyonu söylemiyor).

### Ö-2 — `ask` ucu: olumsuz sonucu önbellek yok, her el sıkışmada çağrılıyor
fe-fb günlüğünde `saldirgan.test` iki kez soruldu (`spike-ask.log:2-3`); benim koşumda da her bilinmeyen SNI yeni bir
çağrı. On-demand'a geçilirse `/api/internal/tls-ask` bellek içi küme üzerinden O(1) çalışmalı (DB'ye her el sıkışmada
gitmemeli), yalnız loopback'ten erişilebilmeli ve IP başına sınırlanmalı. LE açısından `ask` kapısı yalnız doğrulanmış
adlara sertifika aldırır. Sertifika bombalamasıyla hız sınırını tüketme (belgeye göre kayıtlı alan başına haftada 50
sertifika, hesap başına 3 saatte 300 sipariş; çıkarım, LE belgesi) ancak doğrulanmış ama DNS'i kopmuş bir adın başarısız
doğrulamayla tekrar tekrar denenmesiyle olur. Günlük DNS kontrolü (fe-fb §2.3) bu adı `SUSPENDED` yapınca durur. Pilotta
statik blokla bu yüzey sıfırdır.

### Ö-3 — HSTS `includeSubDomains` iddiası kodla çelişiyor
fe-fb §2.2 "`includeSubDomains` bizim tarafımızda yok" diyor. Ama uygulama her yanıtta
`max-age=31536000; includeSubDomains` gönderiyor (`security-headers.ts:67,73`; `next.config.ts:125-131`
`source: '/:path*'`). Ajans alt alanında (`panel.oka.org.tr`) etkisi yalnız `*.panel.oka.org.tr` ile sınırlı; bu
kabul edilebilir. Ama patron §8-2'de kök alanı (`oka.org.tr`) seçerse ajansın **bütün** alt alanları bir yıl boyunca
HTTPS'e zorlanır. Değişiklik: ajans host'unda HSTS `includeSubDomains` olmadan gönderilmeli (host'a göre başlık).
**Kapsam dışı yan bulgu:** aynı başlık bugün `fonbridge.com`'da da `includeSubDomains` taşıyor. Bu,
`docs/SMTP-SUNUCU.md:540-541`'deki "koymayın (`mail.`, `cpanel.`, `webmail.`)" kararıyla çelişiyor. Lider ayrı bir kartla
değerlendirmeli.

### Ö-4 — Tema: logo/favicon/renk sağlam; iki not
- SVG ve poliglot riski: B4 PNG sanitizer'ı (`cobrand.ts:56-104`) SVG'yi reddediyor, IEND sonrası veriyi reddediyor ve
  metadata parçalarını atıyor. Favicon'a da uygulanması (fe-fb §3.1) doğru. ICO / SVG favicon kabul edilmemeli.
- CSS enjeksiyonu: `^#[0-9a-fA-F]{6}$` ve sunucuda yeniden biçimleme (fe-fb §3.3) `</style>` kaçışını da engelliyor;
  nonce'lu `<style>` doğru. Serbest CSS ve font yok: ONAY.
- E-posta şablonu: tasarım HTML şablon yüklemeye izin **vermiyor**, yalnız `brandName`, CID logo ve renk şeridi var
  (fe-fb §3.5): ONAY. Bu, uygulama kartında açık bir yasak olarak yazılmalı. Görev metnindeki "e-posta şablonu yükleme"
  ifadesi serbest HTML olarak yorumlanmamalı.
- Oturumsuz `/api/brand/*`: `Cache-Control: public` + `Vary: Host` yetmeyebilir (bazı CDN'ler `Vary`'yi yok sayar).
  fe-fb'nin önerdiği host-hash'li URL ile birlikte kullanılmalı. Bu uçlar da B-1'deki host kontrolünden geçmeli.
- Ajans `name`'i (≤40, `cobrand.ts:111-119`) beyaz etikette `<title>` olur. `FonBridge Giriş` gibi adlar Y-6'daki ad
  politikasına tabi tutulmalı.

### Ö-5 — Google OAuth B yolu: çerez / state / redirect sağlam
Kaynaktan doğrulandı: Google sağlayıcısı `checks: ["pkce"]` kullanıyor (`@auth/core/lib/utils/providers.js:52`), OIDC
`nonce` kullanılmıyor. PKCE, state ve CSRF çerezleri host-only ve `SameSite=Lax`; CSRF `__Host-` önekli
(`lib/utils/cookie.js:45-72`). `redirect` callback'i özelleştirilmemiş, yani varsayılan yalnız aynı kökene izin verir
(`lib/init.js:13-18`): açık yönlendirme yok. `redirect_uri` Google'da tam eşleşmeyle doğrulanır (fe-fb §2.4, doğru).
Öneri: sağlayıcıya `checks: ["pkce", "state"]` eklenmeli; C yolu ve login-CSRF savunması için ek maliyet düşük.
`allowDangerousEmailAccountLinking: true` (`auth.ts:374`) değişmiyor, B5'e özgü değil.

### Ö-6 — Reply-To doğrulaması ayrıntısı
fe-fb §4.3 yeterli yönde. Eklenmesi gerekenler: adres ajansın `ACTIVE` alanının altında ya da sözleşmede adı geçen adres
olmalı. Doğrulama belirteci 32 bayt olmalı, DB'de hash'li saklanmalı, 24 saatte bitmeli ve tek kullanımlık olmalı.
Adres değişince doğrulama sıfırlanmalı. Alan `SUSPENDED` olunca Reply-To kullanımdan düşmeli.

### Ö-7 — E2 (ajans alanından gönderim) için SPF/DKIM/DMARC gereksinimleri
- Ajans alt alanında bizim seçicimiz `CNAME` olmalı (`fb2026._domainkey.panel.oka.org.tr → …fonbridge.com`); anahtar
  döndürme bizde kalır. Seçici TXT olursa ajansla elle koordinasyon gerekir.
- SPF `include:` bizim alanımıza, `-all`.
- DMARC ajansın politikası. Hizalama DKIM ile yeterli (fe-fb §4.2, doğru). Ajansın `sp=` politikası kontrol edilmeli.
- MTA, yalnız `AgencyDomain` ACTIVE ve DKIM kaydı doğrulanmış alanlar için imzalamalı. İmza anahtarı ajans başına ayrı
  olmalı: sızıntı tek ajansı etkiler.
- Bounce ve Return-Path bizim alanımızda kalır.
- E3 (ajansın SMTP kimlik bilgisi bizde) önerilmez. fe-fb'nin kararıyla aynı görüşteyim.

---

## 3. Görev maddelerine göre hükümler

| Alan | Hüküm | Bulgular |
|---|---|---|
| TLS / `ask` | fail-closed **doğrulandı**. Önbellek riski **doğrulandı + genişletildi** (reload yetmez, yenilemede eski sertifika sunuluyor) | B-1, Y-3, Ö-1, Ö-2 |
| Host zehirlemesi | Host ≠ SNI geçiyor (ölçüldü). XFH Caddy'de siliniyor (ölçüldü). Proxy kapısı `/api`'yi kapsamıyor | B-1 |
| Kiracı karışması | Veri: tasarım doğru (kiracı oturumdan). Oturum: host'a bağlı değil. Marka: rebind ile atlanıyor | B-2, Y-1 |
| Silinmiş/askıdaki alan | Uygulama + Caddy **yeniden başlatma** + Google `redirect_uri` kaldırma gerekli | Y-3 |
| LE oran sınırı / DoS | `ask` ya da statik blok ile düşük. `ask` ucu ucuz ve loopback-only olmalı | Ö-2 |
| OAuth B | Sağlam (PKCE, host-only Lax çerez, aynı köken redirect). `state` eklenmeli | Ö-5, B-2 |
| OAuth C | Tasarım eksik: tarayıcı bağı yok. `redirectProxyUrl` kullanılırsa hesap ele geçirme | Y-4 |
| E-posta | E1 kabul, şartlı: DMARC reject önkoşulu, adres nesnesi, ad politikası | Y-5, Y-6, Ö-6, Ö-7 |
| Tema | ONAY (PNG sanitizer, hex-only, HTML şablon yok) | Ö-4, Y-2 (veri modeli) |

---

## 4. Efor düzeltmesi

fe-fb §7'nin tahmini (B: 0+1+1b = 17-24 kişi-gün, C: +8-12) şu güvenlik işlerini **kapsamıyor** ya da eksik kapsıyor.
Kişi-gün, tek geliştirici, test dahil (çıkarım, ±%30):

| # | İş | Bulgu | + kişi-gün |
|---|---|---|---|
| 1 | Host kontrolünü `/api/*` + Auth.js + `/api/brand` kapsayacak şekilde tek noktaya almak; Caddy `strict_sni_host` + catch-all 421; test matrisi | B-1 | 1-1,5 |
| 2 | Host'a bağlı oturum (host başına çerez adı ya da `host` claim'i) + çapraz host replay testi | B-2 | 2-3 |
| 3 | Kiracılar arası kapıyı `jwt` rebind'ine ve her isteğe taşımak | Y-1 | 0,5-1 |
| 4 | Platform alanlarını ayrı tabloya ayırmak + denetim kaydı + işlemli yazma | Y-2 | 1-1,5 |
| 5 | Askıya alma otomasyonu (depo silme + yeniden başlatma + doğrulama) + Google `redirect_uri` adımı | Y-3 | 0,5-1 |
| 6 | E-posta: `from` adres nesnesi, ad politikası, Reply-To belirteç akışı ayrıntıları + testler | Y-6, Ö-6 | 0,5-1 |
| 7 | Aşama 1 canlıya çıkmadan bağımsız güvenlik incelemesi + iki alanlı sızma testi | tümü | 1,5-2 |
| | **B yolu toplam ek** | | **+7-11** |

**Düzeltilmiş B yolu: ≈ 24-35 kişi-gün** (17-24 + 7-11).

**C yolu:** fe-fb'nin +8-12'si "güvenlik incelemesi"ni içeriyor, ama Y-4'teki tarayıcı bağını, DB'de tek kullanımlık
belirteci, POST ile taşımayı, ara ekranı ve çıkış senkronu testlerini içermiyor: **+3-5**. Düzeltilmiş: **C ek ≈ +11-17**.

Takvim bağımlılıkları (efor değil): DMARC `p=reject` için 2-4 haftalık rapor gözlemi (Y-5); Caddy'nin canlı kurulumu
(`RELEASE_CHECKLIST.md:32`, fe-fb'de belirtilmiş).

---

## 5. Öncelikli aksiyon listesi (uygulama kartına girecekler)

1. B-1: host kontrolünü iki katmana al (Caddy `strict_sni_host` + 421; uygulamada `/api` dahil tek fonksiyon).
2. B-2: oturumu host'a bağla.
3. Y-1: `jwt` rebind'ini host'un ajansıyla sınırla.
4. Y-2: platform ve ajans marka alanlarını ayır.
5. Y-3: askıya alma çalışma kitabına "yeniden başlat" ve "Google `redirect_uri` kaldır" adımlarını ekle.
6. Y-5 / Y-6: E1'den önce DMARC reject; `from` adres nesnesi + ad politikası.
7. C'ye geçilirse Y-4 zorunlu tasarım girdisi; Auth.js `redirectProxyUrl` yasak.

---

## Kanıt
- Spike komutları ve çıktıları §1'de kopyalandı (30.09, mac, `caddy:2.11.4`). Konteyner ve stub kaldırıldı:
  `docker ps -a --filter name=sefb-b5spike → 0`, `pgrep -f b5/ask.py → 0`.
- Kod referansları bu oturumda `sed -n` / `grep -n` ile okundu. Çalışma ağacı HEAD'i `4ef6eba4` (paylaşımlı ağaç, oturum
  içinde ilerledi; referans verilen satırlar okunduğu anki dosyalardan).
- Auth.js kaynağı: `node_modules/.pnpm/@auth+core@0.41.3_nodemailer@10.0.12/node_modules/@auth/core/lib/utils/env.js:66-95`,
  `lib/actions/callback/index.js:20-35`, `lib/actions/signin/authorization-url.js:36-66`,
  `lib/actions/callback/oauth/checks.js:103-125`, `lib/utils/providers.js:52`, `lib/utils/cookie.js:45-101`,
  `lib/init.js:13-18`.

## Değişen dosyalar
- `docs/agent-results/TASK-MUODXZR2BQ2L6-se-fb.md` (bu rapor). Başka dosya yok.

## Riskler
- B-2 ve Y-4 kaynak okumasına dayalı zincirler. İki host'lu ortam ve Google gerektirdiği için canlı koşulmadı; uygulama
  kartında e2e olarak ölçülmeli.
- Yenileme davranışı kısa ömürlü (`3m`) iç CA sertifikasıyla ölçüldü. LE ile aynı kod yolu (certmagic) beklenir; bu bir
  çıkarım.
- Statik blokta blok kaldırılıp reload yapılınca bellekteki sertifikanın akıbeti ölçülmedi (yalnız on-demand ölçüldü).
  Y-3'teki "yeniden başlat" önerisi iki durumu da güvenle kapatır.

## Açık sorular
- Ö-3 yan bulgusu: `fonbridge.com`'daki `includeSubDomains`, `SMTP-SUNUCU.md` kararıyla çelişiyor. Kim karar verecek?
- Patron §8-2 (kök alan) kararı Ö-3'ü B5 için Y'ye yükseltir.

## Sonraki adım
fe-fb raporunun §2.1, §2.4, §3.1, §4, §6-C ve §7 kısımlarının bu bulgulara göre güncellenmesi. Ardından aşama 0/1
uygulama kartlarına §5'teki maddelerin DoD olarak yazılması (2. yıl planı).
