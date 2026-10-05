# TASK-MUNOE32OQH3F8 — cs-fb: İNCELEME-61 — PublicLead XFF düzeltmesi (TASK-MULR765AR5G0C, devop-fb)

**Durum: TAMAM**
**Karar: DÜZELTME GEREKLİ** (küçük). Düzeltme, belgelenen IPv4 topolojisinde doğru. Sahte ilk hop, birden çok XFF başlığı, boş XFF ve geçersiz env değerlerinin hiçbiri kovayı döndürmüyor. Tek açık: aynı runbook'un açtığı **IPv6** yolu. Bu yolda tek bir makine, kendi /64 bloğu içinde adres değiştirerek IP sınırını yine atlatıyor (B-1). Bu, İNCELEME-50 B-1 ile aynı saldırı sınıfı.

İncelenen: `20940f42` fix(leads) · `30c12233` test(leads) · rapor `docs/agent-results/TASK-MULR765AR5G0C-devop-fb.md`.
Kaynak bulgular: İNCELEME-50 B-1 / Y-1 / Y-3. Taban: dev `05cf050f`, ayrı worktree (`--detach`).

| # | Önem | Konu | Durum |
|---|------|------|-------|
| B-1 | Engelleyici | IPv6: kova tam adrese göre tutuluyor. Aynı /64 içinde 12 farklı adres = 12 ok, 12 ipHash (nginx 1.30.5 üzerinden gerçek HTTP). Runbook §10.1'deki nginx bloğu `listen [::]:443` içeriyor. | AÇIK |
| Y-1 | Yüksek (taşınan) | `docker-compose.yml:27` hâlâ `0.0.0.0:3000`. nginx atlanıp 3000'e gidilince sahte XFF = 12 ok, 12 ipHash. Compose'un `web.environment` listesinde `TRUSTED_PROXY_HOPS` yok. | AÇIK (devop-fb §5'te sorulmuştu, kart yok) |
| Ö-1 | Düşük | Pencerelerin tam sınırı testte yok: `gte`→`gt` (×2) ve IP penceresi 60→60,5 dk mutantları yaşıyor. Davranış bugün doğru (±1 ms ölçüldü). | öneri |
| Ö-2 | Düşük | Geçersiz `TRUSTED_PROXY_HOPS` (`-1`, `abc`, `1.5`) sessizce 1'e düşüyor, log yok. `0x2`→2 ve `99`→99 kabul ediliyor, üst sınır yok. | öneri |
| Ö-3 | Düşük | Rıza özeti yalnız `consent_label`'ı sabitliyor. Kutunun hemen altındaki `consent_withdraw` metni değişince test yeşil kalıyor (N14). | öneri |
| Ö-4 | Bilgi | İki hop'lu bir kurulumda (CDN) ara katman `ip:port` yazarsa değer olduğu gibi hash'lenir ve port değişimi yeni kova açar. Bugünkü tek-proxy kurulumunda nginx port yazmadığı için bu etkisiz. | not |

Kapanan kaynak bulgular: **İNCELEME-50 B-1 (IPv4) kapandı · Y-1 kapandı (Ö-1 notuyla) · Y-3 kapandı (Ö-3 notuyla).**

## 1. Ne yapıldı
1. Kodu, testleri, `.env.example` dosyasını, `docs/SMTP-SUNUCU.md` §10.1'i (nginx + Caddy) ve `docker-compose.yml`'ı okudum.
2. **İzole DB kurdum:** `csfb-i61-pg` (pgvector:pg16, 127.0.0.1:55661/csfb_i61).
   - Prisma `db push`, AI koruması yüzünden reddedildi. Korumayı atlatmadım: `prisma migrate diff --from-empty --script` ile SQL ürettim (salt-okur) ve boş konteynerime psql ile uyguladım.
   - Ardından: `apply-migrations.sh` (38) → `db:rls-role` → `db:rls` (28→112 politika) → `apply-migrations.sh` → `db:seed`.
   - Paylaşılan `fabrika` DB'sine (5433) hiç bağlanmadım.
3. **Gerçek nginx 1.30.5 kurdum.** Runbook'taki `location /` bloğunu birebir aldım; yalnız TLS çıkarıldı. Önüne IPv4+IPv6 docker ağı (`fd61:61:61:61::/64`) koydum, arkasına worktree'deki `next dev :3961`'i bağladım.
4. **Formu tarayıcıyla bir kez gerçekten doldurup gönderdim** (Chrome, gerçek tıklama). Yakalanan server-action POST'u, her istekte seçilen IP'ye sahip ayrı bir istemci konteynerinden nginx üzerinden yeniden oynattım.
5. `TRUSTED_PROXY_HOPS` için 0 / 1 / 2 / -1 / abc / eksik değerlerinin her birinde sunucuyu yeniden başlatıp denedim.
6. Birim matrisini, ±1 ms pencere sınırlarını ve kendi 15 mutantımı koştum.
7. Kanıt betikleri: `docs/agent-results/TASK-MUNOE32OQH3F8-cs-fb-evidence/`.

## 2. Kanıt

### 2.1 nginx'in upstream'e gönderdiği XFF (`/__echo` = `$proxy_add_x_forwarded_for`)
```
iki XFF satırı 10.9.3.1 + 10.9.4.1  → xff_sent_upstream=10.9.3.1, 10.9.4.1, 172.61.0.21
IPv6 istemci                       → xff_sent_upstream=10.9.3.1, fd61:61:61:61::21
boş XFF başlığı                    → xff_sent_upstream=, 172.61.0.29
sahte port'lu değerler             → xff_sent_upstream=1.1.1.1:5555, [2001:db8::1]:80, 172.61.0.22
```
nginx birden çok satırı tek bir satırda birleştiriyor ve en sona her zaman portsuz `$remote_addr` ekliyor. Boş değer `filter(Boolean)` ile atılıyor.

### 2.2 Gerçek HTTP, nginx üzerinden, 12'şer istek (her istekte farklı e-posta)
```
TRUSTED_PROXY_HOPS=1
a1-forged-first        (sahte 10.9.<i>.1)          ok×10,rate_limited,rate_limited  rows=10 distinct ipHash=1
b-two-xff-lines        (iki sahte XFF satırı)      ok×10,rate_limited,rate_limited  rows=10 distinct ipHash=1
c-forged-port-and-v6   ("1.1.1.i:5555, [2001:db8::i]:80") ok×10,rl,rl            rows=10 distinct ipHash=1
d-empty-xff            (boş başlık)                ok×10,rate_limited,rate_limited  rows=10 distinct ipHash=1
e-no-xff               (başlıksız)                 ok×10,rate_limited,rate_limited  rows=10 distinct ipHash=1
f-ipv6-same-host       (tek IPv6 + sahte ilk hop)  ok×10,rate_limited,rate_limited  rows=10 distinct ipHash=1
g-ipv6-rotate-in-64    (fd61:61:61:61::b1..::bc)   ok×12                            rows=12 distinct ipHash=12   ← B-1
TRUSTED_PROXY_HOPS=0
h0-forged              ok×12                       rows=12 distinct ipHash=0 null ipHash=12  (IP hiç kullanılmıyor)
h0-same-email (×4)     ok,ok,ok,rate_limited       rows=3  null ipHash=3                     (e-posta sınırı çalışıyor)
TRUSTED_PROXY_HOPS=2 (tek nginx; topolojiden FAZLA)
h2-forged-one-proxy    ok×12                       rows=12 distinct ipHash=12   (belgelenen risk: fazla hop = sahte değer okunur)
h2-honest-short-chain  ok×10,rate_limited,rate_limited rows=10 distinct ipHash=1 (kısa zincir → en soldaki = gerçek)
TRUSTED_PROXY_HOPS=-1 / abc / (eksik)
hx-1-forged            ok×10,rate_limited,rate_limited  rows=10 distinct ipHash=1   (1'e düştü)
hxabc-forged           ok×10,rate_limited,rate_limited  rows=10 distinct ipHash=1
hxunset-forged         ok×10,rate_limited,rate_limited  rows=10 distinct ipHash=1
nginx ATLANDI (doğrudan :3961 = prod'da açık 3000), hops=1
z-direct-3000-forged   ok×12                       rows=12 distinct ipHash=12   ← Y-1
```
Her senaryonun satırları `DELETE … WHERE id=$1` ile tek tek silindi, her koşuda `left=0`. Konteyner kaldırılmadan önce tablo sayımı: `0`.
Düz tarayıcı kontrolü (nginx yok): "Teşekkürler, talebiniz alındı." · 1 satır · tek id ile silindi.

### 2.3 Birim matrisi (`matrix.ts`, gerçek `Headers` nesnesi)
```
TRUSTED_PROXY_HOPS: undefined→1 ""→1 "0"→0 "1"→1 "2"→2 "-1"→1 "-0"→0 "1.5"→1 "abc"→1 "NaN"→1
                    "Infinity"→1 " 2 "→2 "0x2"→2 "1e0"→1 "2abc"→1 "99"→99
two XFF headers (Headers.append)  hops=1 → "198.51.100.77"
IPv6 bracket+port                 hops=1 → "[2001:db8::1]:4711"   (Ö-4: normalleştirme yok)
IPv4 with port                    hops=1 → "198.51.100.77:4711"
IPv4-mapped v6                    hops=1 → "::ffff:198.51.100.77" (198.51.100.77'den ayrı kova)
empty / only commas               hops=1 → null
short chain                       hops=2 → "198.51.100.77"
forged + CDN bypassed             hops=2 → "6.6.6.6"
hops0                             hops=0 → null
```

### 2.4 Pencerelerin tam sınırları (izole DB'de canlı, `edges-test-snippet.ts`)
```
I61 EDGES mail@-24h:{"ok":false,"error":"rate_limited"} | mail@-24h-1ms:{"ok":true}
        | ip@-1h:{"ok":false,"error":"rate_limited"}   | ip@-1h-1ms:{"ok":true}
I61 cleanup: 28 rows deleted one id at a time
```
Tam 24 sa / 1 sa önceki istek sayılıyor (`gte`), 1 ms öncesi sayılmıyor. Davranış tutarlı.

### 2.5 Mevcut takım (izole DB, 3 ardışık koşu)
```
Test Files  2 passed (2)   Tests  28 passed (28)   ×3
```

### 2.6 Kendi mutantlarım (`mut.py`; her biri geri yüklendi, md5 doğrulandı; `git status` yalnız benim scratch dosyalarım)
```
N1  email window gte→gt (edge exclusive)                     28 passed           YAŞADI  (Ö-1)
N2  ip window gte→gt (edge exclusive)                        28 passed           YAŞADI  (Ö-1)
N3  EMAIL_WINDOW 24h→24h30m                                  1 failed            ÖLDÜ
N4  IP_WINDOW 60→60.5 min                                    28 passed           YAŞADI  (Ö-1: 59/61 dk arası kör)
N5  clientIpFrom hops'u yok sayar (hep son)                  1 failed            ÖLDÜ
N6  kısa zincir kıskacı kaldırıldı                           1 failed            ÖLDÜ
N7  negatif hops kabul                                       1 failed            ÖLDÜ
N8  geçersiz env → 0                                         1 failed            ÖLDÜ
N9  env yok → 2                                              1 failed            ÖLDÜ
N10 hop'lar trim edilmiyor                                   3 failed            ÖLDÜ
N11 boş hop'lar tutuluyor                                    1 failed            ÖLDÜ
N12 tr rıza metni değişti, sürüm aynı                        1 failed            ÖLDÜ   (Y-3 tutuyor)
N13 saklama 365→380 gün (metin hâlâ 12 ay), sürüm aynı       5 failed            ÖLDÜ
N14 consent_withdraw metni değişti, sürüm aynı               28 passed           YAŞADI  (Ö-3)
N15 X-Real-IP XFF'nin önüne alındı                           1 failed            ÖLDÜ
```
Sonuç: 11 öldü, 4 yaşadı. Yaşayan 4'ünün hiçbiri güvenlik açığı değil, hepsi test boşluğu.

### 2.7 Runbook / yapılandırma tutarlılığı
- **`SMTP-SUNUCU.md` §10.1, nginx:** `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for` + tek proxy → `TRUSTED_PROXY_HOPS=1` (varsayılan). Bu tutarlı, gerçek nginx ile doğrulandı. Aynı blokta `listen [::]:80` ve `listen [::]:443` var ("yalnız AAAA kaydı varsa"), yani IPv6 yolu belgede açık → B-1.
- **Caddy:** `reverse_proxy 127.0.0.1:3000` varsayılanı güvenilmeyen istemcinin XFF'sini atıyor (devop-fb §2.4). Hops=1 ile tutarlı. Caddy de IPv6'yı dinler, B-1 orada da geçerli.
- **`.env.example`** `TRUSTED_PROXY_HOPS=1` ve açıklaması koddakiyle tutarlı.
- **`docker-compose.yml`:** port `"${FABRIKA_WEB_PORT:-3000}:3000"` (0.0.0.0). `web.environment` açık liste, `TRUSTED_PROXY_HOPS` geçmiyor, kod varsayılan 1'i kullanıyor. Runbook "127.0.0.1'e bağla ya da güvenlik duvarında kapat" diyor ama compose dosyası değişmedi (son değişiklik `435f8f7d`) → Y-1.
- **`docs/ARCHITECTURE.md:88`** bir `preview (Vercel …)` ortamından bahsediyor. Vercel XFF'yi kendisi yazıyor, bu yüzden hops=1 orada da doğru. Koşulamadı, yalnız belge üzerinden değerlendirildi.

## 3. Önerilen düzeltmeler
- **B-1:** `hashClientIp`'ten önce bir `ipBucket(ip)` adımı ekle.
  - IPv6 → ilk 64 bit (`2001:db8:1:2::/64`).
  - `::ffff:a.b.c.d` → `a.b.c.d`.
  - Birim testi: aynı /64'ten iki adres → aynı hash. Farklı /64 → farklı hash.
  - Canlı test: /64 içinde 12 adres → 10 ok + 2 rate_limited.
  - **Alternatif:** runbook'tan `listen [::]` satırlarını çıkar ve AAAA kaydı açılmayacağını yaz. Ama Caddy varsayılan olarak IPv6'yı dinlediği için bu daha kırılgan bir çözüm.
- **Y-1:** ayrı küçük kart. Compose portunu `"127.0.0.1:${FABRIKA_WEB_PORT:-3000}:3000"` yap. `web.environment` listesine `TRUSTED_PROXY_HOPS=${TRUSTED_PROXY_HOPS:-1}` ekle.
- **Ö-1:** canlı teste ±1 ms sınır testi ekle (§2.4'teki snippet hazır).
- **Ö-2:** `trustedProxyHops` geçersiz değerde bir kez `logger.warn` yazsın. Üst sınır makul bir değer olabilir (ör. ≤ 5).
- **Ö-3:** özet testine `consent_withdraw` metnini de ekle, ya da neden dışarıda kaldığını yorumda yaz.

## 4. Değişen dosyalar
- `docs/agent-results/TASK-MUNOE32OQH3F8-cs-fb.md` (bu rapor).
- `docs/agent-results/TASK-MUNOE32OQH3F8-cs-fb-evidence/`: `capture.mjs`, `replay.mjs`, `cleanup.mjs`, `matrix.ts`, `mut.py`, `edges-test-snippet.ts`, `nginx-default.conf`, `restart.sh`.
- Kod değiştirilmedi. `tests/i61-edges.live.test.ts` scratch dosyasıydı, commit edilmedi.

## 5. Riskler
- **B-1 bugün canlı değil:** §10.1 "şimdilik kurulmuyor" diyor. AAAA kaydı açılırsa ya da Caddy/nginx IPv6'dan istemci alırsa canlıya çıkar. Bu açılırken e-posta sınırı yine çalışır (3/24 sa), ama saldırgan e-posta adresini de değiştirir.
- **/64 kovası bir yan etki getiriyor:** aynı /64'ü paylaşan kullanıcılar (bazı kurumsal ağlar) tek kovaya düşer. Bu, IPv4 NAT ile aynı ödünleşim.

## 6. Açık sorular
- Prod'da AAAA kaydı açılacak mı? Açılmayacaksa B-1 "runbook'tan `[::]` çıkar" ile de kapanabilir. Bu karar patronun / devop-fb'nin.

## 7. Sonraki adım
- devop-fb: B-1 (+ Ö-1..Ö-3 isteğe bağlı), ardından yeniden inceleme. Y-1 için ayrı kart.
- Ortam temizlendi: `next dev :3961` (benim pid) durduruldu. `csfb-i61-pg` ve `csfb-i61-nginx` konteynerleri ile `csfb-i61-net` ağı kaldırıldı. `docker ps -a | grep csfb-i61` → yok.

**Platform beyanı:** Doğrulama **mac**'te yapıldı (Darwin 27, Docker Desktop). nginx 1.30.5 ve Postgres, Linux konteynerlerinde koştu. İstemci IPv4/IPv6 adresleri docker ağında gerçekti. İncelenen kod platformdan bağımsız: yalnız başlık metnini ayrıştırıyor ve env okuyor. Dosya yolu, süreç ya da kabuk çağrısı yok. Linux prod'da davranışı belirleyen şey proxy topolojisi, o da Linux konteynerinde koşturuldu. Windows koşulamadı: FONBRIDGE Windows'ta dağıtılmıyor ve kod yolunda platforma bağlı bir dal yok.
