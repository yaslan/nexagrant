# TASK-MUNSQUCHUW2AE — fe-fb: İNCELEME-67 (TASK-MUNQD2XTNSH9U yeniden inceleme)

**Durum:** TAMAM
**Karar:** **ONAY.** Engelleyici (B) ya da yüksek (Y) bulgu yok. Aşağıda 4 öneri (Ö) ve 1 bilgi notu (N) var; hiçbiri merge'ü geri almayı gerektirmiyor.

İncelenen: `e61e0d00` (düzeltme), dev merge `02231b33`.
Ortam:
- Ayrı worktree: dev `33b5602d`, detached.
- Kendi izole DB'm: `fefb-67-pg`, pg16, 127.0.0.1:55667. CI sırasıyla hazırlandı: `db push → db:rls-role → apply-migrations ×2 (38+38) → db:rls (28→112) → db:seed`.
- Paylaşılan `fabrika` DB'sine (:5433) hiç bağlanılmadı.
- Kod değiştirilmedi.

| # | Bulgu | Önem |
|---|-------|------|
| Ö-1 | compose Y-1'i koruyan test yok: web portunu `0.0.0.0`'a geri almak, hops varsayılanını 0 yapmak ya da satırı silmek süitte yeşil kalıyor (C1–C3 sağ). | Öneri |
| Ö-2 | `ipBucket` zone-id soyma mutantı (P6) sağ. Etkisi atlatma değil, daha sıkı bir kova. `::ffff:a.b.c.d%zone` ortak `0:0:0:0::/64` kovasına düşer. | Düşük |
| Ö-3 | compose'ta `postgres-vector` (varsayılan parola `fabrika`), `redis` ve `mailpit` hâlâ `0.0.0.0`. devop-fb §5 ile aynı tespit; yeniden doğrulandı. | Öneri (compose prod'da kullanılırsa Y) |
| Ö-4 | Linux Docker Engine'de `127.0.0.1` port bağının aynı L2 komşularına kapalı olması sürüme bağlı. Hatırladığım kadarıyla 28.0 öncesi sürümlerde komşu host'lar bu porta yönlendirme yapabiliyordu; doğrulanmadı. Prod host'ta `docker version` bakılmalı. | Öneri (doğrulanacak) |
| N-1 | /64 kovası tasarım gereği. /56 ya da /48 alan bir saldırgan 256 ya da 65 536 ayrı kova görür (10/saat × kova sayısı). Prod IPv4-only olduğu için bugün etkisiz; e-posta sınırı (3/24 saat) her durumda geçerli. | Bilgi |

## 1. Ne yapıldı
1. Değişikliği okudum: `public-lead.ts` (`ipBucket`, `expandIPv6`, `trustedProxyHops`, `clientIpFrom`), `docker-compose.yml`, `.env.example`, `docs/SMTP-SUNUCU.md` §10.1 ve devop-fb raporu.
2. **Atlatma probu:** `ipBucket`, `hashClientIp`, `clientIpFrom` ve `trustedProxyHops` 35 adres, 6 XFF zinciri ve 15 hops değeriyle denendi. Denenenler:
   - aynı /64'ten farklı adresler,
   - büyük harf ve sıfır dolgulu yazım,
   - zone id, köşeli parantez, boşluk,
   - `::ffff:` IPv4-mapped (noktalı ve hex yazım),
   - `/48` ve `/56` komşuları,
   - NAT64, 6to4, link-local, `::1`,
   - IPv4 varyantları (`01.02.03.04`, `:port`, `[v4]`),
   - sahte ilk hop'lu XFF, hops 0/1/2.
3. **Mutantlar:** kendi 17 mutantım: 14 kod mutantı + 3 compose mutantı, `/64→/128` ve `hop 0` dahil. Her biri `public-lead.test.ts`, `public-lead.live.test.ts` ve `teardown-where-guard` testlerine karşı gerçek DB ile koşuldu. Her mutanttan sonra `git checkout --` yapıldı; sonunda ağaç temiz.
4. **Gerçek `docker compose up`:**
   - İzole proje `fefb67`: ayrı container/volume adları (`isolate67.yml`), web portu 3967.
   - İmaj sıfırdan derlendi; `pnpm build` imajın içinde koştu.
   - Web servisi `--no-deps` ile kalktı; DB/redis'i LAN'a açmamak için bağımlılıklar başlatılmadı.
   - Dinleme adresi 4 yoldan ölçüldü. Aynı imaj, düzeltme öncesi compose dosyasıyla da kaldırıldı ("önce" karşılaştırması).
5. **Runbook Caddy yapılandırmasının ölçülmemiş kısmı:** devop-fb yalnız `:80` + `auto_https off` ölçmüştü. Ben runbook'taki global bloğu TLS'li bir siteyle (`tls internal`) koştum. 443/TCP ve HTTP/3 (UDP 443) dinleyicilerinin IPv6'da açık olup olmadığını soket tablosu ve gerçek istemciyle kontrol ettim.
6. tsc, lint, i18n; tam `npx vitest run` iki kez (CI=true, izole DB); kırmızıların ayrıştırılması.

## 2. Kanıt
Tüm dosyalar `docs/agent-results/TASK-MUNSQUCHUW2AE-fe-fb-evidence/` altında.

### 2.1 Atlatma probu (`probe67.log`, `probe67.test.ts`)
```
"fd62:62:62:62::b1"                            fd62:62:62:62::/64         cb77542e3d
"fd62:62:62:62:ffff:ffff:ffff:ffff"            fd62:62:62:62::/64         cb77542e3d
"FD62:0062:0062:0062:0000:0000:0000:00B1"      fd62:62:62:62::/64         cb77542e3d
"fd62:62:62:62::1%eth0"                        fd62:62:62:62::/64         cb77542e3d
"[fd62:62:62:62::1]"                           fd62:62:62:62::/64         cb77542e3d
" fd62:62:62:62::1 "                           fd62:62:62:62::/64         cb77542e3d   ← hepsi tek kova
"fd62:62:62:63::1"                             fd62:62:62:63::/64         5fa3f3d338   ← /64 komşusu ayrı (beklenen)
"fd62:62:63:62::1"                             fd62:62:63:62::/64         c94c20daee   ← /48 komşusu ayrı (N-1)
"::ffff:1.2.3.4" / "::FFFF:1.2.3.4" / "::ffff:0102:0304" / "0:0:0:0:0:ffff:1.2.3.4"
"0000:…:ffff:0102:0304" / "[::ffff:1.2.3.4]" / "::ffff:1.2.3.4%lo" / "1.2.3.4"   → 1.2.3.4  8c29d7d831 (8'i de aynı)
" 1.2.3.4"            → " 1.2.3.4"   6bb31f5803   ← yalnız çıplak çağrıda; clientIpFrom zaten trim ediyor
"01.02.03.04" / "1.2.3.4:5555" / "[1.2.3.4]" / "[fd62:62:62:62::1]:443"  → olduğu gibi, ayrı kova (bkz. §4)
"::1.2.3.4" "::ffff:0:1.2.3.4" "::" "::1"  → 0:0:0:0::/64 (ortak, daha sıkı)
"64:ff9b::1.2.3.4" = "64:ff9b::5.6.7.8"   → 64:ff9b:0:0::/64 (sunucu NAT64 kaynağı görmez; IPv4 dinliyor)
xff "1.1.1.1, 9.9.9.9"          hops1= 9.9.9.9          hops2= 1.1.1.1   hops0= null
xff " , 9.9.9.9" / "9.9.9.9,,"  hops1= 9.9.9.9 (boş girdiler sayılmıyor, sağdan okuma kayamıyor)
hops: undefined→1 ""→1 "0"→0 "5"→5 " 2 "→2 "01"→1 | "6" "2.0" "-1" "1e0" "0x2" "１" "999…" → 1 + tek WARN
```
**Sonuç:** Gerçek yolda XFF girdisini istemci değil bizim proxy'miz yazıyor (nginx `$remote_addr`, Caddy XFF'i ezer). Bu yüzden istemcinin kontrol ettiği tek şey kendi kaynak adresi. IPv6 yazım varyantlarının hiçbiri kovayı bölmüyor.
Kova dışı varyantlar (`:port`, `[v4]`, `01.x`) yalnız iki durumda istemcinin eline geçer:
- hops yanlış ayarlanırsa: bu zaten tam atlatmadır, `clientIpFrom` testleri bunu kapsıyor;
- proxy portlu XFF yazarsa: bizim topolojide yazmıyor.

### 2.2 Mutantlar (`mut67.py`, `mut67.log`)
```
P1 /64 -> /128 (full IPv6 address)               KILLED  Tests  2 failed | 36 passed (38)
P2 unset TRUSTED_PROXY_HOPS -> 0                 KILLED  Tests  1 failed | 37 passed (38)
P3 invalid hops fallback 1 -> 0                  KILLED  Tests  2 failed | 36 passed (38)
P4 clientIpFrom ignores hops (last entry)        KILLED  Tests  1 failed | 37 passed (38)
P5 clientIpFrom reads first entry                KILLED  Tests  3 failed | 35 passed (38)
P6 zone id not stripped                          SURVIVED  Tests  38 passed (38)
P7 brackets not stripped                         KILLED  Tests  1 failed | 37 passed (38)
P8 mapped check ignores ::ffff marker            KILLED  Tests  1 failed | 37 passed (38)
P9 hashClientIp hashes raw ip                    KILLED  Tests  2 failed | 36 passed (38)
P10 hops<1 guard removed                         SURVIVED  Tests  38 passed (38)
P11 lower-case removed                           SURVIVED  Tests  38 passed (38)
P12 hops regex unanchored end                    KILLED  Tests  2 failed | 36 passed (38)
P13 ipBucket trim removed                        SURVIVED  Tests  38 passed (38)
P14 /64 -> /56 (mask 4th group)                  KILLED  Tests  2 failed | 36 passed (38)
C1 compose web port back on 0.0.0.0              SURVIVED  Tests  38 passed (38)
C2 compose TRUSTED_PROXY_HOPS default 0          SURVIVED  Tests  38 passed (38)
C3 compose TRUSTED_PROXY_HOPS line removed       SURVIVED  Tests  38 passed (38)
tree clean (src+compose, excluding probe): True
```
Kod mutantlarında 14'ün 10'u öldü. Sağ kalanların durumu:

**Eşdeğer mutantlar:**
- **P10:** hops=0 iken `chain[chain.length]` zaten `undefined → null` döner.
- **P11:** `parseInt(…, 16)` büyük/küçük harfe duyarsız, çıktı `toString(16)` ile hep küçük harf.
- **P13:** tek çağıran `clientIpFrom` girdiyi zaten trim ediyor.

**Eşdeğer değil:**
- **P6:** Node `isIPv6('::ffff:1.2.3.4%lo') === true`. Zone soyulmazsa bu adres `0:0:0:0::/64` ortak kovasına düşer (ölçüldü). Atlatma değil, daha sıkı. Yine de davranış testsiz (Ö-2).
- **C1–C3:** hiçbir test `docker-compose.yml`'i okumuyor. `grep readFileSync(.*docker-compose` sonucu boş (Ö-1).

### 2.3 Gerçek `docker compose up` (`compose-up67.log`, `compose-before67.log`, `isolate67.yml`, `image-build-excerpt.log`)
**Sonra** (dev `33b5602d` compose dosyası, izole proje `fefb67`, imaj sıfırdan derlendi):
```
== docker compose ps
fefb67-web running 127.0.0.1:3967->3000/tcp
== docker port
3000/tcp -> 127.0.0.1:3967
== inspect HostIp
{"3000/tcp":[{"HostIp":"127.0.0.1","HostPort":"3967"}]} env-hops=TRUSTED_PROXY_HOPS=1
== lsof LISTEN :3967
com.docke 127.0.0.1:3967 (LISTEN)
== LAN ip = 172.20.10.3
http://127.0.0.1:3967/tr -> http=200 exit=0
http://[::1]:3967/tr -> http=000 exit=7
http://172.20.10.3:3967/tr -> http=000 exit=7
== from another container on the default docker bridge (host.docker.internal)
http=200 exit=0     ← aynı host'taki konteynerler ulaşabilir (beklenen; LAN değil)
```

**Önce** (aynı imaj, `02231b33^1:docker-compose.yml`):
```
3000/tcp -> 0.0.0.0:3967
3000/tcp -> [::]:3967
LAN 172.20.10.3:3967 -> http=200 exit=0      (istek sahte X-Forwarded-For: 203.0.113.77 taşıyordu)
```

**İmaj derlemesi:** `RUN pnpm build` → `✓ Compiled successfully in 106s` → `Generating static pages (31/31)` → `#15 DONE 256.5s` → `Image fefb67-fabrika-web Built` · `build exit=0`. i18n denetimi de derleme içinde geçti.

### 2.4 Runbook Caddy: TLS + HTTP/3 IPv6'da da kapalı mı? (`Caddyfile.runbook-tls`, `caddy-runbook-tls.log`)
```
caddy log: "enabling HTTP/3 listener","addr":"0.0.0.0:443" · protocols [h1 h2 h3]
tcp : 0.0.0.0:80  0.0.0.0:443      tcp6: (yok)
udp : 0.0.0.0:443 (HTTP/3)         udp6: (yok)
<- 172.67.0.10 :443         => "ok 172.67.0.2" http=200
<- fd67:67:67:67::10 :443   => http=000 exit=7
<- fd67:67:67:67::10 :80    => http=000 exit=7
```
`tcp4/` bağı Caddy'nin HTTP/3 UDP dinleyicisini de yalnız IPv4'e çekiyor. HTTP/3 istemci testi koşulamadı: curl imajında `--http3-only` yok. Kanıt olarak `udp6` soket tablosunun boş olması kullanıldı.

### 2.5 tsc / lint / i18n / build
```
tsc exit=0 · $ eslint → lint exit=0 · ✅ i18n check passed … → i18n exit=0
next build: §2.3 (imaj içinde, exit=0)
```

### 2.6 Tam `npx vitest run` (CI=true, AUTH_SECRET = ci.yml değeri, izole DB) — `vitest-full.log`
```
koşu 1 (load 22/38/35): Test Files 2 failed | 256 passed | 2 skipped (260) · Tests 2 failed | 3130 passed | 22 skipped (3154)
   × withholding-rounding "every net 1..3000" → Test timed out in 5000ms (5407ms)
   × rag-pdf-worker-isolation İNCELEME-52 → PdfLimitError parse_too_heavy (duvar-saati koruması), 30153ms
   bu iki dosya tek başına ×2 (load 34/30): Test Files 2 passed · Tests 22 passed (her iki koşuda)
koşu 2 (load 23/35/34): Tests 7 failed | 3125 passed | 22 skipped — 5× "Test timed out", 1× "5415ms < 3000" süre bütçesi, 1× parse_too_heavy
   aynı 6 dosya tek başına (load 56): 5 failed · --testTimeout=120000 ile (load 48): 112/113, kalan 1 = parse_too_heavy
   git diff 02231b33^1..02231b33 bu 6 dosyaya ve src/lib/{agency,billing,rag}'a: boş
```
**public-lead testleri iki tam koşuda da yeşil.**

Kırmızıların hepsi süre kaynaklı: 5 sn zaman aşımı, 3000 ms bütçe ya da PDF duvar-saati koruması. Makine yükü bu sırada 22–56 arasındaydı (başka ajanların süitleri). Merge bu dosyalara dokunmuyor. Aynı örüntüyü devop-fb de §2.6'da kaydetmişti.

Dürüst kayıt: bu oturumda **0 kırmızılı bir tam koşu elde edemedim**. Bunun nedeni makine yükü; kodla ilgili bir kırmızı bulunmadı.

### 2.7 Temizlik
```
PublicLead count (izole DB, kaldırmadan önce) = 0
docker rm -f fefb-67-pg · fefb67-web (compose down) · fefb67-caddy · network fefb67-net / fefb67_default
docker rmi fefb67-fabrika-web · docker volume rm fefb67_pgdata fefb67_redisdata (label project=fefb67)
docker ps -a | grep fefb67|fefb-67 = 0 · volume ls | grep fefb67 = 0 · fabrika_pgdata yerinde (1)
git worktree remove wt67 · geçici docker-compose.before67.yml silindi (git status temiz)
```

## 3. Değişen dosyalar
- Bu rapor.
- `docs/agent-results/TASK-MUNSQUCHUW2AE-fe-fb-evidence/`: mutant betiği ve günlüğü, prob testi ve günlüğü, `isolate67.yml`, compose önce/sonra günlükleri, imaj derleme özeti, Caddyfile ve günlüğü, vitest özeti.
- Kod değişmedi.

## 4. Riskler
- **Ö-1: Y-1 testsiz.** Biri port satırını eski hâline döndürürse (ör. telefonla test için) süit yeşil kalır.
  Öneri: `docker-compose.yml`'i YAML olarak okuyan küçük bir test. Test şunları doğrulamalı:
  - `fabrika-web.ports[*]` `127.0.0.1:` ile başlıyor;
  - `environment` içinde `TRUSTED_PROXY_HOPS=${TRUSTED_PROXY_HOPS:-1}` var.

  C1–C3'ü öldürmek için bu yeterli.
- **Ö-2: P6 testsiz.** `ipBucket('fd62:62:62:62::1%eth0')` ve `ipBucket('::ffff:1.2.3.4%lo')` için birer satır yeter. Bugün proxy zone yazmadığı için etkisi yok.
- **Ö-3:** compose'u prod host'ta kullanan biri Postgres'i `0.0.0.0:5433`'te varsayılan parolayla açmış olur. Web'e yapılanın aynısı (`127.0.0.1:`) ayrı bir kartta yapılmalı. Dosyanın başı "Local development stack" diyor, ama runbook web için bu dosyayı referans veriyor.
- **Ö-4:** `127.0.0.1` bağı macOS Docker Desktop'ta ölçüldü (LAN'dan kapalı). Linux Docker Engine'de loopback yayınının aynı L2 ağındaki komşulara kapalı olması eski sürümlerde güvence değildi (iptables/`route_localnet` davranışı). Prod host'ta `docker version` ile güncel olduğu doğrulanmalı. Ek güvence için 3000'in güvenlik duvarında da kapalı olması yeterli; runbook bunu zaten söylüyor.
- **Dağıtım yöntemi sabit değil:** `package.json` `start` = `next start`, bu da varsayılan olarak `0.0.0.0:3000` dinler. compose dışı bir dağıtımda koruma yalnız runbook'taki "3000'i dışa açmayın / güvenlik duvarında kapatın" cümlesine kalıyor.

## 5. Açık sorular
- Prod'da uygulama compose ile mi, `next start`/systemd ile mi çalışacak? Ö-3 ve Ö-4'ün önemi buna bağlı. Karar patron/devop'ta.

## 6. Sonraki adım
- devop-fb (ya da ops kartı): Ö-1 testi + Ö-3 (compose'taki diğer 3 servisin `127.0.0.1` bağı) tek küçük kartta. Ö-2 testi aynı karta eklenebilir.
- Prod host kurulumunda Ö-4 kontrolü: `docker version` ve 3000/5433'ün dışarıdan `nc -z` ile kapalı olduğu.
- 1 Ekim push kartı: `02231b33` bu incelemeyle ONAY.

**Platform beyanı:**
- Doğrulama **mac**'te yapıldı (Darwin 27, Docker Desktop). Postgres 16, Caddy 2.11.4, curl ve `fabrika-web` imajı (node:22-alpine, arm64) Linux konteynerlerinde koştu.
- İncelenen kod yolu platformdan bağımsız: yalnız başlık metnini ayrıştırıyor (`node:net` `isIPv4`/`isIPv6`) ve env okuyor. Dosya yolu, süreç ya da kabuk çağrısı yok.
- compose `127.0.0.1:` bağı Linux Docker Engine'de de yalnız loopback anlamına gelir; eski sürüm istisnası Ö-4'te.
- **Linux host** (Docker Engine, prod benzeri) ve **Windows** koşulamadı: bu makinede yalnız Docker Desktop var. FONBRIDGE Windows'ta dağıtılmıyor.
