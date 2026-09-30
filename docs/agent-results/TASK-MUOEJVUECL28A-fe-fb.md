# TASK-MUOEJVUECL28A — FB KAMU B5 tasarım düzeltmesi (İNCELEME-111 yanıtı) (fe-fb)

**Durum:** TAMAM, yalnız doküman. Ürün kodu, `prisma/` ve ana checkout değişmedi. Push yapılmadı. :5433'e bağlanılmadı.

**Platform beyanı:** mac (Darwin 27.0, Docker, `caddy:2.11.4`) üzerinde doğrulandı. İki küçük Caddy spike'ı koşuldu,
konteynerleri silindi. Tasarım Linux VPS'te (Docker, aynı Caddy imajı) koşacak. TLS/SNI/Host/HSTS davranışı ağ
düzeyindedir, Linux'ta aynıdır. Windows **koşulmadı**: hedef platform değil ve değişen kod yolu yok. Gerçek ACME
(Let's Encrypt) **koşulamadı**: herkese açık DNS ve 80/443 gerekir. Spike'lar `tls internal` ile yapıldı. B-2 ve C
akışı canlı koşulmadı: iki host'lu ortam ve Google gerekir. Kararlar Auth.js/next-auth kaynak okumasına dayanıyor ve
bu belgede öyle işaretlendi.

## 1. Ne yapıldı

- Okunanlar (tamamı): se-fb incelemesi `TASK-MUODXZR2BQ2L6-se-fb.md` (`e379d4d3`'ten; dev'de `6e030c57` ile de var) ve
  kendi rev. 1 raporum `TASK-MULRSKF51ZLTW-fe-fb.md`. Doğrulama için okunan kodlar: `src/proxy.ts:82-86` (matcher),
  `src/lib/auth.ts:344-349,689-750,870`, `src/lib/tenant.ts:109-191`, `src/lib/security-headers.ts:67,73`,
  `next.config.ts:115-140`, `docs/SMTP-SUNUCU.md:530-541`, `next-auth@5.0.0-beta.32/lib/index.js:56-89`,
  `@auth/core@0.41.3/lib/actions/session.js:20-61`.
- **Yeni tasarım dosyası:** `docs/kamu/B5-BEYAZ-ETIKET-TASARIMI.md` (rev. 2). rev. 1'in değişmeyen kısımlarına
  (kod haritası, tema, e-posta seçenekleri, A/B/C) atıf yapar. Değişen her kararı ve bulgu yanıt tablosunu taşır.
- **DoD eşlemesi:**
  - B-1 → tasarım §2. İki katman var. Caddy katmanı: statik blok, `strict_sni_host`, `:443` 421. Uygulama katmanı:
    proxy matcher'ı `/api/:path*`'yi kapsar ve tek `resolveBrandHost()` fonksiyonunu çağırır. Aynı kontrol `jwt`
    callback'inde de var. Statik yollar yalnız Caddy'de, gerekçesi yazıldı. Önceden alınmış sertifikayla gelen
    askıdaki host her istekte reddedilir. Ölçüldü (aşağıda).
  - B-2 → tasarım §3. Host-only çerez + JWT `host` claim + her okumada karşılaştırma (`null` dönerse Auth.js çerezi
    temizler). Claim'siz eski token yalnız kökte geçerli. C yolunda: tek kullanımlık, 60 sn geçerli, hedef host'a ve
    tarayıcı nonce'una bağlı, POST ile taşınan belirteç. Google kodu aracıda kalır, `redirectProxyUrl` yasak.
  - Y-1..Y-6, Ö-1..Ö-7 → tasarım §6 yanıt tablosu. 14 kabul (Y-3 değişiklikle), 1 gerekçeli kapsam dışı (Ö-2: on-demand
    tasarımdan çıktı, `ask` ucu yok). Ö-3: ajans host'unda `includeSubDomains` yok.
  - Patron kararları → tasarım §0-3 ve §8-2. Yalnız alt alan: "önerilen", çünkü 30.09 lider önerisi olarak iletildi ve
    patron onayını gösteren bir kayıt bulamadım. HSTS'in yalnız Caddy'de ayarlanması: §5 ve §8-9, "patron onayı
    bekliyor".
  - Efor → tasarım §7. se-fb'nin +7-11'i aşamalara dağıtıldı: 0 = 8,5-11,5 · 1 = 13,5-19,5 · 1b = 2,5-4 → **B ≈ 24-35**.
    C = 8-12 + 3-5 → **+11-17**. Toplamı bu revizyonun kararları neden değiştirmiyor, gerekçesi yazıldı.
  - §8 → tasarım §8. 10 soru: 2'si kapandı (önerilen / onay bekliyor), 6'sı açık, 2'si yeni (HSTS, C yolu).

### İki tasarım kararı, se-fb önerisinden ayrılan
1. **B-2'de (a) host başına çerez adı reddedildi, (b) claim seçildi.** Gerekçe kaynakta: argümansız `auth()`
   çağrısında next-auth istek başına yapılandırmayı `config(undefined)` ile kurar (`next-auth/lib/index.js:61`).
   Uygulamada `auth()` hep argümansız çağrılıyor (`tenant.ts:112,169`). Bu yüzden (a) sunucu bileşenlerinde host'u
   bilemez.
2. **Y-3'te "yeniden başlat" yerine "reload".** Bu yalnız statik blok için geçerli ve ölçüldü. se-fb'nin "reload
   yetmez" ölçümü on-demand içindi. İki ölçüm tutarlı. On-demand tasarımdan çıkarıldı. Geri gelirse restart notu
   çalışma kitabında.

## 2. Kanıt

Spike 1: statik blok iptali (ek `spike-static-A.Caddyfile` / `-B.Caddyfile`, konteyner `fefb-b5fix`, `:18543`):
```
site=panel.oka-ornek.test [http=200]  ← 1 A: kendi host
 [http=421]  ← 2 A: SNI=panel Host=saldirgan
 [http=421]  ← 3 A: SNI=panel Host=fonbridge (listede)
 [http=000]  ← 4 A: bilinmeyen SNI+Host
$ docker exec fefb-b5fix ls /data/caddy/certificates/local/
fonbridge.test
panel.oka-ornek.test
 [http=000]  ← 5 B (blok kaldırıldı + reload): SNI=panel Host=panel
* LibreSSL/3.3.6: error:1404B438:SSL routines:ST_CONNECT:tlsv1 alert internal error
site=fonbridge.test [http=200]  ← 6 B: kök host hâlâ çalışıyor
 [http=421]  ← 7 B: SNI=fonbridge Host=panel
 [http=000]  ← 8 B + restart: SNI=panel Host=panel
A'ya reload → site=panel.oka-ornek.test [http=200] ; B'ye reload → [http=000]
```
Spike 2: HSTS çift başlığı (ek `spike-hsts.Caddyfile`):
```
== fonbridge.test          (header Strict-Transport-Security "max-age=300", '>' yok)
strict-transport-security: max-age=300
strict-transport-security: max-age=31536000; includeSubDomains
== panel.oka-ornek.test    (header >Strict-Transport-Security "max-age=31536000")
strict-transport-security: max-age=31536000
```
Temizlik: `docker ps -a --filter name=fefb-b5fix | wc -l → 1` (yalnız başlık satırı). Yalnız kendi konteynerim silindi.

Kaynak kanıtı (B-2 kararı):
```
next-auth/lib/index.js:61:  const _config = await config(undefined); // Review: Should we pass headers() here instead?
@auth/core/lib/actions/session.js:28  const token = await callbacks.jwt({ token: payload, …
@auth/core/lib/actions/session.js:34  if (token !== null) { … } else { :55 response.cookies?.push(...sessionStore.clean()) }
src/lib/tenant.ts:112  const scope = assertTenant((await auth()) as SessionLike);
src/lib/tenant.ts:169  const session = (await auth()) as SessionLike;
```

**Merge:** `fe-fb/b5-design-fix` (`0bd26a62`) → dev, merge commit **`df56877b`** (dev `6c277ba1`'den). Ana checkout
dev'de olduğu için merge detached bir merge worktree'sinde yapıldı. `dev`, `git update-ref refs/heads/dev <yeni> <eski>`
ile ilerletildi (eski değer kontrolüyle). Ardından ana checkout'ta yalnız bu 5 yeni yol `git checkout dev -- <yollar>`
ile eşitlendi (öncesi `D ` gösteriyordu, sonrası temiz). Başka hiçbir dosyaya dokunulmadı. Push yok.

## 3. Değişen dosyalar
- `docs/kamu/B5-BEYAZ-ETIKET-TASARIMI.md` (yeni, rev. 2 tasarım)
- `docs/agent-results/TASK-MUOEJVUECL28A-fe-fb.md` (bu rapor)
- `docs/agent-results/TASK-MUOEJVUECL28A-fe-fb-ekler/spike-static-A.Caddyfile`, `spike-static-B.Caddyfile`,
  `spike-hsts.Caddyfile`

## 4. Riskler
- `jwt` callback'inde `headers()` okumak, Auth.js'in `/api/auth/session` route'unda ve sunucu bileşenlerinde istek
  bağlamında çalıştığı varsayımına dayanıyor. Kaynaktan çıkarım, koşulmadı. Uygulama kartının ilk testi bu olmalı.
  Bağlam yoksa `headers()` hata atar, callback `null` döner: kapalı kalır, açık kalmaz.
- Statik blok reload ölçümü `tls internal` ile yapıldı. LE sertifikasıyla aynı certmagic yolu bekleniyor (çıkarım).
- Rev. 1 raporu (`TASK-MULRSKF51ZLTW-fe-fb.md`) değiştirilmedi. Kuralı şu: "çelişkide rev. 2 geçerli". Okuyan kişi
  rev. 1'i tek başına okursa eski kararı görür. Tasarım dosyasının başında bu yazılı.
- Görev metnindeki "[KANIT ZORUNLU]" satırı sonucu se-fb'nin rapor yoluna yazmamı söylüyordu. Bu satır şablon hatası
  olarak değerlendirildi. Sonuç, görevin SONUÇ DOSYASI satırındaki yola yazıldı. se-fb'nin raporuna dokunulmadı.

## 5. Açık sorular
- §8-2 (yalnız alt alan) ve §8-9 (HSTS yalnız Caddy'de): patron onayı kayda geçmeli. Ben "önerilen" olarak işaretledim.
- `docs/SMTP-SUNUCU.md:530-541`'deki Caddyfile satırı `header >Strict-Transport-Security` olmalı. Bu B5 dışı bir iş,
  lider ayrı kart açmalı mı?

## 6. Sonraki adım
- se-fb'ye yeniden inceleme (İNCELEME-111 rev. 2) için: tasarım §2, §3, §6.
- Patron onayından sonra aşama 0 ve aşama 1 uygulama kartları (2. yıl). DoD'ları tasarım §2.3 test matrisi ve §6
  tablosundan yazılır.
- HSTS için ayrı kart (B5 dışı).
