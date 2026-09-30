# TASK-MUNQD2XTNSH9U — devop-fb: İNCELEME-61 B-1 (IPv6) + Y-1 (compose)

**Durum:** TAMAM — yeniden inceleme: cs-fb

Kaynak: `docs/agent-results/TASK-MUNOE32OQH3F8-cs-fb.md` (b870713a). Patron kararı 30.09: prod'da AAAA kaydı açılmayacak.
Dal: `devop-fb/munqd2-ipv6-compose` (taban dev `fbce5bd6`). Commit'ler: `e61e0d00` (düzeltme), `8be96591` (kanıt).
dev'e merge: **`02231b33`** (`--no-ff`). Push YOK (1 Ekim kartında).

| # | Konu | Sonuç |
|---|------|-------|
| B-1 | IPv6 /64 atlatması | **KAPANDI, iki katmanda:** (a) runbook yalnız IPv4 dinliyor: nginx'te `listen [::]` yok, Caddy'de `default_bind tcp4/0.0.0.0`. (b) Kod IPv6'yı /64 önekine göre sayıyor, `::ffff:a.b.c.d` IPv4 sayılıyor (`ipBucket`). Belgeye uyarı eklendi. |
| Y-1 | compose `0.0.0.0:3000` | **KAPANDI:** `127.0.0.1:${FABRIKA_WEB_PORT:-3000}:3000`; `web.environment` listesine `TRUSTED_PROXY_HOPS=${TRUSTED_PROXY_HOPS:-1}` eklendi. `.env.example` ile tutarlı. |
| Ö-1 | pencere sınırı mutantları | **KAPANDI:** ±1 ms canlı test eklendi. gte→gt ×2 ve 60→60,5 dk mutantları artık kırmızı. |
| Ö-2 | geçersiz `TRUSTED_PROXY_HOPS` | **KAPANDI:** yalnız düz ondalık 0..5 kabul ediliyor. Diğer değerler 1'e düşüyor ve bir kez `logger.warn` yazıyor. |
| Ö-3 | `consent_withdraw` özetin dışında | **KAPANDI:** `PUBLIC_LEAD_CONSENT.withdrawKey` eklendi ve tr/en digest'i aynı sürüme sabitlendi. Mevcut `tr`/`en` digest'lerine dokunulmadı. |

## 1. Ne yapıldı
1. **Runbook (`docs/SMTP-SUNUCU.md` §10.1):**
   - nginx bloğundaki üç `listen [::]` satırını çıkardım.
   - Caddyfile'a `{ default_bind tcp4/0.0.0.0 }` global bloğunu ekledim.
   - §10.1 sonuna "Yalnız IPv4" paragrafı ve "IPv6 açılırsa /64" uyarısı ekledim (İNCELEME-61 B-1).
   - Y-1 cümlesini compose'un yeni hâline göre güncelledim.
2. **Gerçek ölçümle yakalanan tuzak:** İlk sürümde Caddy için düz `default_bind 0.0.0.0` yazmıştım. Gerçek Caddy 2.11.4'te bu ayarla **IPv6 yine cevap verdi** (Go, 0.0.0.0'ı çift yığın bağlıyor). Belgedeki doğru değer `tcp4/0.0.0.0` (§2.4).
3. **Kod (`src/lib/leads/public-lead.ts`):**
   - `ipBucket(ip)` eklendi:
     - IPv6 → `xxxx:xxxx:xxxx:xxxx::/64`.
     - `::ffff:a.b.c.d` → `a.b.c.d`.
     - Köşeli parantez ve `%zone` soyuluyor.
     - IPv4 ve adres olmayan değerler olduğu gibi kalıyor.
   - `hashClientIp` bu değeri hash'liyor. IPv4 hash'leri değişmedi, yani mevcut satırlar geriye uyumlu.
   - `trustedProxyHops` artık yalnız `^\d+$` ve ≤ `MAX_TRUSTED_PROXY_HOPS` (5) değerlerini kabul ediyor. Diğer değerler 1'e düşüyor, aynı değer için bir kez warn yazılıyor.
4. **compose + `.env.example`:** Y-1 (tabloda).
5. **Testler:**
   - Birim testleri:
     - /64 ve `::ffff:` eşlemesi (12 girdi).
     - Hash eşitlikleri ve farklılıkları.
     - hops 0..5 kabulü, 7 geçersiz değer, warn sayısı.
     - `withdraw` digest'i.
   - Canlı testler:
     - ±1 ms pencere sınırları.
     - Aynı /64 içinde 12 IPv6 adresi → 10 ok + 2 red, tek ipHash; komşu /64 → ok.

## 2. Kanıt

### 2.1 compose (`docker compose --profile app config`)
```
dev fbce5bd6 (önce)  fabrika-web [('0.0.0.0', '3000')]  TRUSTED_PROXY_HOPS in env: False
dal (sonra)          fabrika-web:
                           TRUSTED_PROXY_HOPS: "1"
                         - mode: ingress
                           host_ip: 127.0.0.1
                           target: 3000
                           published: "3000"
TRUSTED_PROXY_HOPS=2 FABRIKA_WEB_PORT=3999 →  TRUSTED_PROXY_HOPS: "2" · host_ip: 127.0.0.1 · published: "3999"
```

### 2.2 Gerçek nginx 1.30.5 → gerçek kod → izole Postgres (`evidence/nginx-run1.log`, `nginx-run3.log`)
**Düzen:**
- Docker ağı `172.62.0.0/24 + fd62:62:62:62::/64`.
- Her istek, seçilen IP'ye sahip ayrı bir istemci konteynerinden geliyor.
- nginx'te §10.1'deki `location /` bloğu birebir (TLS çıkarıldı). Arkasında `evidence/harness.ts` var: `actions.ts`'teki iki satırın (`clientIpFrom(headers)` + `submitPublicLead`) aynısı.
- Next'in server-action taşıması bu düzende yok. O kısım bu kartta değişmedi, cs-fb §2.2'de tarayıcıyla doğrulanmıştı.

Hops ayarsız (=1). Her senaryo 12 istek, her istekte farklı e-posta:
```
v4forged    (sahte ilk hop 10.9.i.1)        ok×10,rl,rl   rows=10 distinctIpHash=1   ← IPv4 davranışı bozulmadı
v4noxff     (başlıksız)                     ok×10,rl,rl   rows=10 distinctIpHash=1
v4twolines  (iki sahte XFF satırı)          ok×10,rl,rl   rows=10 distinctIpHash=1
v4empty     (boş XFF)                       ok×10,rl,rl   rows=10 distinctIpHash=1
v6same      (tek IPv6 + sahte ilk hop)      ok×10,rl,rl   rows=10 distinctIpHash=1
v6rotate64  (fd62:62:62:62::b1..bc)         ok×10,rl,rl   rows=10 distinctIpHash=1   ← B-1: önce ok×12 / 12 ipHash (cs-fb §2.2 g)
x64sat 11 istek /64-A, ardından x64other 2 istek /64-B, ardından x64again 1 istek /64-A:
            ok×10,rl | ok,ok | rl               rows=12 distinctIpHash=2          ← komşu /64 ayrı kova
y4host31/32/33 (3 ayrı gerçek IPv4 host)    ok,ok,ok      rows=3  distinctIpHash=3
nginx runbook sürümü (listen [::] YOK):
rbv4        IPv4, sahte ilk hop             ok×10,rl,rl   rows=10 distinctIpHash=1
v6 → runbook nginx                          http=000 exit=7 (bağlantı reddi), rows=0
```
Her senaryonun satırları `DELETE … WHERE id` ile tek tek silindi, her seferinde `left=0`.

**Dürüst not:** `nginx-run1.log` içindeki `v4rotate` satırı benim kurulum hatam, geçersiz. IP şablonu hex üretti (`172.62.0.a0`), docker reddetti, sürücü betiği de ara satırları erken sildi. Yerine `y4host` ve `x64*` koşuldu. Bu koşular için `NOCLEAN` seçeneği eklendi.

### 2.3 Birim + canlı (izole DB `devfb-qd2-pg`, pg16, 127.0.0.1:55662/fabrika_qd2, fabrika_app rolü)
```
✓ client IP > accepts only a plain 0..5 and says so once when it falls back
✓ client IP > counts an IPv6 address by its /64 and an IPv4-mapped one as the IPv4 address
✓ consent text version > pins the current version to the exact tr/en text a visitor reads
✓ public lead form > both windows include their exact edge and nothing 1 ms before it       131ms
✓ public lead form > addresses rotated inside one IPv6 /64 share one IP bucket              167ms
✓ teardown-where-guard > no test file in the repo has an unguarded where
Test Files  3 passed (3)   Tests  38 passed (38)
```

### 2.4 Caddy 2.11.4 dinleme ölçümü (`evidence/caddy-run2.log`)
```
caddy[default_bind tcp4/0.0.0.0] <- 172.62.0.12          : http=200
caddy[default_bind tcp4/0.0.0.0] <- [fd62:62:62:62::12]  : http=000 exit=7   ← IPv6 kapalı
caddy[default_bind 0.0.0.0]      <- [fd62:62:62:62::14]  : http=200          ← YETMEZ (çift yığın)
caddy[varsayılan]                <- [fd62:62:62:62::13]  : http=200
caddy[tcp4] IPv4, sahte ilk hop ×12 → ok×10,rl,rl  rows=10 distinctIpHash=1
Runbook'taki Caddyfile metni birebir `caddy adapt`: listen {'srv0': ['tcp4/0.0.0.0:443'], 'srv1': ['tcp4/0.0.0.0:80']} · caddy fmt=0
```

### 2.5 Mutantlar (`evidence/mut.py`, her biri `git checkout --` ile geri alındı, sonunda `tree clean: True`)
```
Q1 ipBucket off (full address again)             2 failed  KILLED
Q2 IPv6 bucket /48 instead of /64                2 failed  KILLED
Q3 IPv4-mapped not unwrapped                     1 failed  KILLED
Q4 email window gte->gt                          1 failed  KILLED   (Ö-1, eski N1)
Q5 ip window gte->gt                             1 failed  KILLED   (Ö-1, eski N2)
Q6 IP window 60 -> 60.5 min                      1 failed  KILLED   (Ö-1, eski N4)
Q7 no upper bound on hops                        1 failed  KILLED   (Ö-2)
Q8 no warn on fallback                           1 failed  KILLED   (Ö-2)
Q9 consent_withdraw text changed, version same   1 failed  KILLED   (Ö-3, eski N14)
```

### 2.6 typecheck / lint / tam koşum (CI=true, AUTH_SECRET = ci.yml Test adımındaki değer, izole DB CI sırasıyla hazırlandı)
**DB hazırlığı:**
- `migrate diff --from-empty --to-schema` ile SQL üretildi. `db push` kullanılmadı; cs-fb yöntemi.
- Ardından: `db:rls-role` → `apply-migrations.sh` ×2 (38+38) → `db:rls` (28→112) → `db:seed`.
- Makinede psql yok. psql yalnız kendi konteynerimde `docker exec` ile koştu (`PSQL=` sarmalayıcı).

```
dal e61e0d00:   tsc --noEmit ✓ · eslint ✓
                Test Files 256 passed | 2 skipped (258) · Tests 3126 passed | 9 skipped (3135) · exit=0
merge 02231b33: tsc --noEmit ✓ · eslint ✓
                Test Files 258 passed | 2 skipped (260) · Tests 3132 passed | 22 skipped (3154) · exit=0 · failed=0
```

**Önceki iki tam koşu kırmızıydı (dürüst kayıt):**
- 1. koşu: 12 hata. 2. koşu: 6 hata.
- Makine yükü 50–60 idi.
- 12'si "Test timed out in 5000ms" ya da "Hook timed out", biri 3000 ms'lik süre bütçesi, biri PDF `parse_too_heavy` duvar-saati koruması. Hiçbiri public-lead ile ilgili değildi.
- Aynı dosyalar yük düşünce tek başına geçti (`rag-pdf-worker-isolation` 14/14 ×2). Tam koşu da 0 hatayla geçti.

**Atlanan 22 test** başka kartların dış servis isteyen dosyalarında:
- `evidence-upload-s3.live` 13
- `k1-daily-calls` 4
- `adapters` 2
- `sedia-adapter` 2
- `k1-embeddings.live` 1

### 2.7 Temizlik
```
PublicLead count (izole DB, kaldırmadan önce) = 0
docker rm -f devfb-qd2-pg · nginx ×2 · caddy ×3 · network rm devfb-qd2-net, devfb-qd2-net2  → ps -a | grep devfb-qd2 = 0
harness (kendi pid'im, :3962) durduruldu → lsof :3962 = 0 · worktree wtqd2 kaldırıldı (dal duruyor)
```
Paylaşılan `fabrika` DB'sine (5433) hiç bağlanılmadı.

## 3. Değişen dosyalar
- `src/lib/leads/public-lead.ts`: `ipBucket`, `expandIPv6`, `MAX_TRUSTED_PROXY_HOPS`, `trustedProxyHops` doğrulama + warn.
- `src/lib/leads/public-lead-policy.ts`: `PUBLIC_LEAD_CONSENT.withdrawKey`.
- `src/lib/leads/public-lead.test.ts`, `tests/public-lead.live.test.ts`: yeni testler.
- `docker-compose.yml`, `.env.example`, `docs/SMTP-SUNUCU.md`.
- `docs/agent-results/TASK-MUNQD2XTNSH9U-devop-fb-evidence/`: `harness.ts`, `drive.sh`, `mut.py`, nginx ×2 conf, Caddyfile ×3, loglar.
- Bu rapor.

## 4. Riskler
- **/64 kovası:** aynı /64'ü paylaşan kullanıcılar (bazı kurumsal ağlar, tek hat üstündeki ev LAN'ı) tek kovaya düşer. 10/saat sınırı bunlar için ortak olur. Bu, IPv4 NAT ile aynı ödünleşim. Bugün etkisiz, çünkü prod IPv6 dinlemiyor.
- **Geri alma:** `git revert -m 1 02231b33`. DB şeması değişmedi.
  - IPv4 hash'leri aynı kaldı. Yalnız IPv6 ve `::ffff:` satırlarının kovası değişti; bu satırlar en fazla 1 saatlik pencereyi etkiler.
  - compose'u geri almak portu yeniden 0.0.0.0'a açar, bunu yapmayın.
- **`TRUSTED_PROXY_HOPS` sıkılaştı:** `0x2`, `1e0`, `-0` ve 5'ten büyük değerler artık 1 sayılıyor ve warn yazıyor. Bugünkü `.env.example` değeri (1) etkilenmiyor.
- **Yerel geliştirme:** compose'lu `fabrika-web` artık yalnız `localhost:3000`'den erişilebilir. Aynı ağdaki başka bir cihaz (ör. telefonla test) doğrudan bağlanamaz. Bu bilinçli bir tercih.

## 5. Açık sorular
- compose'ta `postgres-vector` (5433, varsayılan parola `fabrika`), `redis` (6379) ve `mailpit` (1025/8025) hâlâ `0.0.0.0`'a bağlı (`docker compose config` çıktısı). Bu kartın kapsamı dışında kaldığı için dokunmadım. Bu dosya prod'da da kullanılacaksa ayrı bir kart önerilir.
- Rapor iskeleti erken açıldı ama yalnız worktree'de kaldı, hedef yola ancak iş bitince yazıldı. Süreç kuralından küçük bir sapma.

## 6. Sonraki adım
- cs-fb: yeniden inceleme (B-1/Y-1/Ö-1..3). Kanıt betikleri `evidence/` altında, `drive.sh` + `harness.ts` ile yeniden koşulabilir.
- 1 Ekim push kartı: `02231b33` dahil.

**Platform beyanı:**
- Doğrulama **mac**'te yapıldı (Darwin 27, Docker Desktop). nginx 1.30.5, Caddy 2.11.4 ve Postgres 16 Linux konteynerlerinde koştu. IPv4/IPv6 istemci adresleri docker ağında gerçekti.
- Kod yolu platformdan bağımsız: yalnız başlık metnini ayrıştırıyor (`node:net` `isIPv4/isIPv6`) ve env okuyor. Dosya yolu, süreç ya da kabuk çağrısı yok.
- `127.0.0.1` port bağı Linux prod'daki Docker Engine'de de aynı anlamı taşır: yalnız loopback.
- Windows koşulamadı: FONBRIDGE Windows'ta dağıtılmıyor ve kod yolunda platforma bağlı bir dal yok.
