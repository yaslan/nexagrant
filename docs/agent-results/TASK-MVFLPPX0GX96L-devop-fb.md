# TASK-MVFLPPX0GX96L · FO-103 — Uygulama portu yalnız proxy'den erişilebilir mi (XFF IP sınırı kontrolü)

**Ajan:** devop-fb · **Sprint:** FB-UZMAN · **Bağlam:** FO-21 (TASK-MVBIYRGLU5EMX) se-fb raporu D1 — `docs/agent-results/TASK-MVBIYRGLU5EMX-se-fb.md`

**HÜKÜM: ONAY (dış erişim kapalı, kanıtlı) — ama XFF'nin proxy'de nasıl kurulduğu sunucu tarafında doğrulanamadı; açık madde, aşağıda.**

**platform:** mac (salt-okunur dış ölçüm). Sunucuya shell erişimi YOK; prod'a dokunulmadı (form gönderimi, XFF ile sınır denemesi, yapılandırma değişikliği yok). Staging ortamı bu oturumda erişilebilir değil.

## Ne yapıldı

### 1. Dinleme adresi (kod ve deploy dokümanından)

| Dağıtım | Port bağı | Kaynak |
|---|---|---|
| Docker (compose) | `127.0.0.1:${FABRIKA_WEB_PORT:-3000}:3000` — loopback'e bağlı | `docker-compose.yml:26-31` |
| Docker içi | `ENV HOSTNAME="0.0.0.0"` — konteyner içinde tüm arayüzler; host'a yalnız loopback yayınlanır | `Dockerfile:51-52`, `:67` |
| cPanel / Passenger | Passenger kendi soketini kullanır, `listen()` yerine geçer; TCP portu yok. Elle `node app.js` çalışırsa `FB_LISTEN_HOST` yoksa `127.0.0.1` | `deploy/cpanel/app.js` (commit `2bf57bdb`), `deploy/cpanel/ENV-LISTESI.md:76` |
| Ters vekil dokümanı | `reverse_proxy 127.0.0.1:3000` (Caddy) ve `proxy_pass http://127.0.0.1:3000` (nginx) | `docs/SMTP-SUNUCU.md:533`, `:577` |

Sonuç: repodaki her üç dağıtım yolu da uygulamayı dışarıya doğrudan açmıyor.

### 2. Dışarıdan doğrudan erişim denemesi (ham çıktı)

Hedef: `fonbridge.com` → DNS A kaydı `77.92.144.187` (AAAA yok).

```
$ dig +short fonbridge.com A
77.92.144.187
$ dig +short fonbridge.com AAAA
(boş)

$ nc -vz -G 5 77.92.144.187 3000
nc: connectx to 77.92.144.187 port 3000 (tcp) failed: Connection refused
exit=1

$ nc -vz -G 5 77.92.144.187 3121
nc: connectx to 77.92.144.187 port 3121 (tcp) failed: Connection refused
exit=1

$ nc -vz -G 5 77.92.144.187 443
Connection to 77.92.144.187 port 443 [tcp/https] succeeded!
exit=0

$ curl -sS -I --max-time 8 http://77.92.144.187:3000/
curl: (7) Failed to connect to 77.92.144.187 port 3000 after 19 ms: Couldn't connect to server
```

Yorum: uygulama portu (3000 ve yerel geliştirme portu 3121) dış IP'den kapalı. Dışarıdan yalnız 443 açık; bu da ters vekile (LiteSpeed) ait.

Ek not (ölçüm hatası değil, kayıt): `curl -I https://fonbridge.com/` (varsayılan curl UA, HEAD) `HTTP/2 403` döndü. Tarayıcı UA ile `GET https://fonbridge.com/tr` → `HTTP/2 200` (`x-frame-options: DENY`, `set-cookie: NEXT_LOCALE=tr`). 403 HEAD/curl-UA filtresinden geliyor olabilir; bu sınır kararını etkilemiyor, ayrıca incelenmedi.

### 3. XFF davranışı (proxy)

- Repo belgesi: `$proxy_add_x_forwarded_for` (nginx) istemcinin gönderdiği `X-Forwarded-For`'u KORUR ve sağa yeni adres ekler; Caddy ise istemcinin başlığını atıp yalnız gerçek adresi yazar (`docs/SMTP-SUNUCU.md:580-584`). Yani "append" mi "overwrite" mı, kullanılan vekile bağlı.
- Prod'da kullanılan vekil LiteSpeed (cPanel). Onun XFF davranışı repoda belgelenmemiş ve bu oturumda ölçülemedi. Dış isteklerle XFF sahteciliği denemek prod'da form kaydı üretir ve IP sayacını değiştirir, bu yüzden yapılmadı.
- `TRUSTED_PROXY_HOPS=1` ölçümü (17.10.2026, `ENV-LISTESI.md:62`): "77.92.144.187 önünde tek LiteSpeed, CDN başlığı yok" → 1. Bu ölçüm hop sayısını doğruluyor; LiteSpeed'in XFF'yi ekleyip eklemediği/üzerine yazıp yazmadığı ayrıca doğrulanmadı.

### Hüküm gerekçesi

- Uygulama portu dış IP'den **kapalı** (kanıt: `Connection refused`, 3000 ve 3121).
- Dolayısıyla se-fb'nin D1 senaryosu (istemcinin doğrudan porta gidip sağ-en XFF'yi kontrol etmesi) **bu ortamda uygulanamıyor**.
- Açık madde: LiteSpeed'in XFF'yi nasıl kurduğu (ekleme/üzerine yazma) — yalnız sunucu tarafında (LiteSpeed/cPanel yapılandırması ya da sunucu sahibinin kontrollü testi) kapanır.

## Değişen dosyalar

- `docs/agent-results/TASK-MVFLPPX0GX96L-devop-fb.md` (bu rapor). Kod, yapılandırma ve prod'a dokunulmadı.

## Riskler

- **Orta:** LiteSpeed XFF'yi sahte değerle koruyorsa ve gelecekte bir port/bağlama değişikliğiyle uygulama dışarı açılırsa, IP sınırı aşılır (se-fb D1). Şu an port kapalı; bu risk bir değişikliğe bağlı.
- **Düşük:** `TRUSTED_PROXY_HOPS` yanlış değer alırsa (vekil sayısı değişirse) sınır yanlış IP'yi sayar. Ölçüm 17.10.2026 tarihli; vekil değişikliğinde yeniden ölçülmeli.
- **Bilgi:** dış IP'ye `curl` HEAD isteği 403 dönüyor; tarayıcı GET'i 200. Güvenlik sınırı değil, izleme için not.

## Açık sorular

1. Sunucu sahibi (yetkili) LiteSpeed'de XFF'nin nasıl kurulduğunu doğrulayabilir mi? Önerilen salt-okunur kontrol: LiteSpeed'in proxy/header ayarlarını göstermek; onaysız değişiklik yok.
2. cPanel/Passenger'da `node app.js` elle mi başlatılıyor, yoksa Passenger mi? Passenger ise TCP portu hiç açılmaz (`app.js` yorumu); elle başlatılıyorsa `FB_LISTEN_HOST` değeri 127.0.0.1 olmalı — bu sunucu tarafında doğrulanmalı.

## Öneri (prod'a dokunmadan, patron onayına)

- Mevcut durum uygun: port dışarı kapalı. Kalıcı güvence için: güvenlik duvarında 3000 ve 3121'in dışarıdan kapalı kalmasını belgeli bir kontrol olarak tutmak (`docs/SMTP-SUNUCU.md` §10.1 notuna ek).
- LiteSpeed XFF davranışı sunucu tarafında bir kez ölçülsün; sonuç bu rapora eklensin. Bu, FO-21 D1'i tamamen kapatır.

## Sonraki adım

- Patron/sunucu sahibi: LiteSpeed XFF yapılandırmasını (salt-okunur) paylaşsın veya bir kez test etsin.
- Hüküm yalnız dış port kapalılığına dayanıyor; XFF tarafı açık kalıyor.

## Definition of Done

- [x] Dinleme adresi kanıtlı (repo kodu + deploy dokümanı: loopback / Passenger soketi)
- [x] Dış erişim denemesi ham çıktı (3000, 3121 → refused; 443 açık)
- [ ] XFF davranışı belgelendi — **kısmen**: repo ve dokümanda belgelendi, LiteSpeed'in gerçek davranışı sunucu tarafında ölçülmedi (açık madde)
- [x] Platform beyanı: mac üzerinden salt-okunur dış ölçüm; prod'a dokunulmadı; staging erişilemedi; sunucuya shell yok
