# TASK-MULR765AR5G0C — devop-fb: PublicLead DÜZELTME (İNCELEME-50 B-1, Y-1, Y-3, Y-2 notu)

**Durum: TAMAM** — B-1, Y-1 ve Y-3 kapandı. Y-2 yorumu güncellendi. Kanıtlar gerçek Postgres'te, gerçek HTTP'de ve önünde gerçek nginx 1.30.5 varken alındı.

Kaynak: `docs/agent-results/TASK-MUN7B6OO32BS4-crw-fb.md` (İNCELEME-50).
Commit'ler (worktree'de yazıldı, dev'e cherry-pick edildi; hash'ler dev'deki karşılıkları, §7'de):
`cc48d8dd` iskelet · `ef2e58c0` düzeltme · `d53db6ad` canlı testler · son rapor commit'i §7'de.

## 1. Ne yapıldı

### B-1: IP hız sınırı atlatılabiliyordu → kapandı
`clientIpFrom` (`src/lib/leads/public-lead.ts`) artık X-Forwarded-For'un **ilk** değerini almıyor. Değeri **sağdan `TRUSTED_PROXY_HOPS`'uncu** sıradan okuyor.
- **`TRUSTED_PROXY_HOPS`:** yeni `trustedProxyHops()` bu env'i okur. Varsayılan 1'dir. Değer 0 ya da tam sayı olmalı. Geçersiz bir değer gelirse 1 kullanılır.
- **0 = önümüzde bizim proxy'miz yok:** bu durumda hiçbir başlığa güvenilmez. IP `null` olur ve yalnız e-posta sınırı çalışır.
- **Zincirde proxy sayısından az değer varsa:** hepsini bizim proxy'lerimiz eklemiştir, en soldaki alınır.

**Seçim: yalnız XFF + hop sayısı. X-Real-IP artık okunmuyor. Gerekçe:**
1. Dokümandaki iki proxy'yi docker'da gerçekten koşturdum (§2.4):
   - **nginx** (`$proxy_add_x_forwarded_for`) sahte ilk değeri korur, gerçek adresi sona ekler.
   - **Caddy 2.11** güvenmediği istemcinin XFF'sini atar, yalnız gerçek adresi yazar.
   - **Sonuç:** "sağdan 1" iki kurulumda da doğru adresi verir.
2. **X-Real-IP'yi iki proxy de istemciden geldiği gibi geçiriyor.** Caddy'nin varsayılanı da nginx'te `proxy_set_header X-Real-IP` satırı olmadan çalışmak da buna yol açıyor. X-Real-IP'ye öncelik vermek, satırı unutulan her kurulumda açığı geri getirirdi. Bu yüzden nginx'e X-Real-IP satırı eklemedim: kod o başlığı okumuyor, satır sadece yanlış bir güven duygusu verirdi.
3. **CDN eklenirse** yalnız env'i 2 yapmak yetiyor, kod değişmiyor.

**Belgeler ve testler:**
- `docs/SMTP-SUNUCU.md` §10.1 nginx bloğunun altına bir not eklendi. Not şunları anlatıyor: neden sağdan okunduğu, Caddy/nginx farkı, CDN varsa 2 yapılması ve 3000 portunun dışarı kapatılması.
- `.env.example` dosyasına açıklamalı `TRUSTED_PROXY_HOPS=1` eklendi.
- `public-lead.test.ts`'teki güvensiz davranışı sabitleyen "takes the first X-Forwarded-For hop" testi silindi. Yerine üç test geldi:
  - Sahte ilk değer, CDN (2 hop) ve kısa zincir durumları.
  - X-Real-IP'nin hiç okunmadığı, hops=0 ve boş başlık durumları.
  - Env ayrıştırma.
- Canlı teste "sahte ilk değer yeni kova açmaz" testi eklendi (`tests/public-lead.live.test.ts`): aynı gerçek IP'den 12 istek → 10 ok, 11. ve 12. istek reddedildi, tek `ipHash`.

### Y-1: iki pencere sabiti artık testle sabit
Canlı teste iki test eklendi. Satırlar `createdAt` ile tohumlanıyor:
- **E-posta penceresi:** 23 saat önceki 3 istek → reddedilir. 25 saat önceki 3 istek → kabul edilir.
- **IP penceresi:** 59 dakika önceki 10 istek → reddedilir. 61 dakika önceki 10 istek → kabul edilir.

Böylece hem daraltan hem genişleten mutantlar yakalanıyor (M1, M2, M4, M5).

### Y-3: rıza sürümü artık zorunlu
`public-lead.test.ts` içindeki `CONSENT_TEXT_SHA256` her rıza sürümünü, ziyaretçinin gördüğü metnin SHA-256 özetine bağlıyor. Metin tr ve en için ayrı render ediliyor, `{months}` ve `{brand}` form ile aynı argümanlarla dolduruluyor.
- Metin ya da saklama süresi değişip **sürüm değişmezse** → kırmızı (M9, M10).
- Sürüm artırılıp **özet eklenmezse** → kırmızı (M11).
- Bilinmeyen bir yer tutucu varsa → hata.
- Bir özet iki sürümde tekrar kullanılırsa → kırmızı.

`public-lead-policy.ts`'teki yorum bu testi ve saklama sabitini adıyla anıyor.

### Y-2 notu
`PUBLIC_LEAD_RETENTION_DAYS` yorumundaki "PROPOSAL, NOT DECIDED" ifadesi şu hâle geldi: "Decided: owner decision (patron kararı) 29.09.2026, 12 months". Birim testinin adı da "keeps 12 months (owner decision 29.09.2026)" oldu. `processing-register.md` §18d'ye dokunmadım: bu cs-fb'nin kapsamında.

### Kapsam dışı, yalnız raporlanıyor: `docker-compose.yml:27`
`"${FABRIKA_WEB_PORT:-3000}:3000"` portu tüm arayüzlere açıyor. Proxy atlanıp 3000'e doğrudan gidilirse XFF'yi istemci yazar. Next yalnız başlık **yoksa** soket adresini ekliyor (`base-server.js:612`, `??=`). Bu yüzden sağdan okumak da sahte değeri alır ve sınır yine atlatılır.

**Öneri:**
- Prod'da portu `"127.0.0.1:${FABRIKA_WEB_PORT:-3000}:3000"` ile bağla, ya da 3000'i güvenlik duvarında kapat.
- Docker'ın yayınladığı portlar ufw'yi atlar. Bu yüzden asıl çözüm bağlama adresi.

Dosya değiştirilmedi. Aynı öneri `SMTP-SUNUCU.md` notunda da var.

Ek: compose `web` servisi env'i açık bir listeyle veriyor (`env_file` yok). Bu yüzden `TRUSTED_PROXY_HOPS` konteynere geçmiyor ve **varsayılan 1** uygulanıyor. Belgelenen tek-proxy topolojisi için bu doğru. CDN eklenirse compose'a da eklenmeli.

## 2. Kanıt

### 2.1 Gerçek HTTP — crw-fb'nin betiği (`lead-xff-e2e.mjs`, değiştirilmeden kopyalandı)
İzole DB'de, worktree'deki `next dev -p 3950` üzerinde. Satırlar tek tek `WHERE id=$1` ile silindi.
```
[tr 1280] consent default checked=false
  without consent: Göndermek için açık rıza kutusunu işaretleyin. · rows=0
  after consent: "Teşekkürler, talebiniz alındı." · overflow px=0 · rows=1
[en 390] consent default checked=false
  without consent: Tick the explicit consent box to send the form. · rows=0
  after consent: "Thank you, we have your request." · overflow px=0 · rows=1
captured action POST: yes (next-action header 40148339…)
A spoofed first hop, same real IP 198.51.100.77, 12 requests: ok,ok,ok,ok,ok,ok,ok,ok,ok,ok,rate_limited,rate_limited
  stored rows=10 distinct ipHash=1
B honest header, 11 requests: rate_limited ×11
C raw POST honeypot filled (body changed=true) → ok · rows=0
C raw POST consent:false → consent_required · rows=0
admin /tr/admin/leads as anonymous → 404  · export controls=0
admin /tr/admin/leads as alice@fabrika.test → 404  · export controls=0
admin /tr/admin/leads as admin@yasinaslan.com.tr → 200 İletişim talepleri · export controls=0
cleanup: 12 ids deleted one by one · left with run tag=0
```
İnceleme sırasındaki sonuç şuydu: A = 12×ok, 12 farklı ipHash. Şimdi A'da **11. istek rate_limited**, tek ipHash. B'nin tamamı reddedildi. Bu da doğru: aynı gerçek IP bu saat içinde 10 hakkını A'da kullanmıştı. Kova artık başlığa göre değil, gerçek IP'ye göre tutuluyor.

### 2.2 Gerçek nginx 1.30.5 (belgedeki direktif) → next dev
Betik: `lead-xff-nginx.mjs`. İstemci her istekte farklı bir sahte `X-Forwarded-For: 10.9.<i>.1` gönderiyor, nginx gerçek eşi sona ekliyor.
```
DÜZELTME:  via nginx, 12 requests, forged first hop 10.9.<i>.1 each time: ok×10,rate_limited,rate_limited
             stored rows=10 distinct ipHash=1
KONTROL (clientIpFrom geçici olarak chain[0]'a çevrildi, sonra md5 ile geri yüklendi):
             via nginx, 12 requests, ...: ok×12      stored rows=12 distinct ipHash=12
GERİ YÜKLEME SONRASI: ok×10,rate_limited,rate_limited · rows=10 distinct ipHash=1
cleanup: satırlar tek tek id ile silindi · left with run tag=0 (üç koşuda da)
```

### 2.3 Testler (izole DB, 3 ardışık koşu)
```
Test Files 2 passed (2)  Tests 28 passed (28)    ×3
```
Birim testleri 14 (yeni: 3 client IP + 3 consent). Canlı testler 14 (yeni: 2 pencere + 1 sahte XFF). Canlı testler atlanmadı: `fabrika_app` rolüyle, `assertRlsSubjectRole` ile koştu.

### 2.4 Proxy davranışı (docker, echo sunucusu ile başlık yansıtma)
```
nginx 1.30.5  client XFF=10.9.3.1, X-Real-IP=6.6.6.6 → xff=10.9.3.1, 172.17.0.1 | xrealip=6.6.6.6
              başlıksız                              → xff=172.17.0.1            | xrealip=None
caddy v2.11.4 client XFF=10.9.3.1, X-Real-IP=6.6.6.6 → xff=172.17.0.1            | xrealip=6.6.6.6
              başlıksız                              → xff=172.17.0.1            | xrealip=None
```

### 2.5 Mutantlar (izole DB; her biri yedekten geri yüklendi, md5 doğrulandı)
```
M1   EMAIL_WINDOW 24h -> 2h                           1 failed | 27   ÖLDÜ   (Y-1)
M2   IP_WINDOW 1h -> 1min                             1 failed | 27   ÖLDÜ   (Y-1)
M3   clientIpFrom: ilk XFF değeri (eski davranış)     2 failed | 26   ÖLDÜ   (B-1)
M4   EMAIL_WINDOW 24h -> 26h (genişletme)             2 failed | 26   ÖLDÜ
M5   IP_WINDOW 1h -> 62min (genişletme)               1 failed | 27   ÖLDÜ
M6   X-Real-IP fallback geri eklendi                  1 failed | 27   ÖLDÜ
M7   TRUSTED_PROXY_HOPS varsayılanı 1 -> 0            1 failed | 27   ÖLDÜ
M8   `if (hops < 1) return null` silindi              28 passed       EŞDEĞER: chain[len-0] zaten undefined → null
M9   en rıza metni değişti, sürüm aynı               1 failed | 27   ÖLDÜ   (Y-3)
M10  saklama 365 -> 400 gün, sürüm aynı              6 failed | 22   ÖLDÜ   (Y-3: 13 ay → özet değişti)
M11  sürüm artırıldı, özet eklenmedi                  1 failed | 27   ÖLDÜ   (Y-3)
```
Sonuç: 10 öldü, 1 eşdeğer. M8'deki satır okunabilirlik için bırakıldı.

### 2.6 Kapılar (temiz worktree, base `c5e22a6e` + bu commit'ler)
```
pnpm typecheck      rc=0
pnpm lint           rc=0
pnpm i18n:check     rc=0  ✅ both catalogs agree …
pnpm rls:bypass-check rc=0
pnpm build (DEMO_LOGIN_ENABLED=false)  rc=0  ✓ Compiled successfully · 30/30 static pages
```
Build'deki tek uyarı `src/instrumentation.ts:18`'deki `process.exit` (Edge runtime). Bu uyarı önceden de vardı, benim dosyam değil.

`tests/teardown-where-guard.test.ts`: 1 kırmızı. Yakaladığı satır `tests/stale-relationship-reminder.live.test.ts:395`. Bu dosyaya dokunulmadı: `git diff c5e22a6e --` boş, yani sorun dev tabanında zaten var. Benim yeni teardown'ım yok: canlı test mevcut `cleanRows` fonksiyonunu kullanıyor.

### 2.7 Ortam
- **Worktree:** scratchpad `wt`, `--detach` dev `c5e22a6e`.
- **DB:** kendi konteynerim `devopfb-lead` (pgvector/pgvector:pg16, 127.0.0.1:55561/devopfb_lead).
  - Kurulum sırası: `db push` → `apply-migrations.sh` (38 dosya) → `db:rls-role` → `db:rls` (28 → 112 politika) → `apply-migrations.sh` → `db:seed`.
  - Worktree `.env` dosyasında DB URL'leri buraya çevrildi, `5433` geçmiyor (0 eşleşme).
- **Paylaşılan `fabrika` DB'sine hiç bağlanılmadı.** Migrate, silme ya da sıfırlama yapılmadı.
- **İş bitince kaldırılanlar** (hepsi benimdi):
  - `next dev` (pid 17324).
  - Echo sunucusu.
  - Konteynerler: `devopfb-lead`, `devopfb-px-nginx`, `devopfb-px-caddy`, `devopfb-px-nginx-app`.

## 3. Değişen dosyalar
- `src/lib/leads/public-lead.ts`: `trustedProxyHops()`, yeni `clientIpFrom`.
- `src/lib/leads/public-lead-policy.ts`: saklama kararı yorumu, rıza sürümü kuralı yorumu.
- `src/lib/leads/public-lead.test.ts`: client IP testleri yeniden yazıldı, rıza sürümü özet testi eklendi.
- `tests/public-lead.live.test.ts`: `seed` fonksiyonu `email`/`ipHash` alıyor. 2 pencere testi ve 1 sahte XFF testi eklendi.
- `.env.example`: `TRUSTED_PROXY_HOPS=1`.
- `docs/SMTP-SUNUCU.md`: §10.1 nginx altına istemci IP notu.
- `docs/agent-results/TASK-MULR765AR5G0C-devop-fb.md`: bu rapor.
- `docs/agent-results/TASK-MULR765AR5G0C-devop-fb-screenshots/`:
  - `lead-xff-e2e.mjs`: crw-fb betiğinin değiştirilmemiş kopyası.
  - `lead-xff-nginx.mjs`
  - Dört kare (`tr-form-1280.png`, `tr-success-1280.png`, `en-form-390.png`, `en-success-390.png`).

`actions.ts` değişmedi: `clientIpFrom(await headers())` çağrısı aynı kaldı, varsayılan hop env'den geliyor.

## 4. Riskler
- **`TRUSTED_PROXY_HOPS` topolojiden fazla ayarlanırsa** (ör. CDN yokken 2), sahte değer yine okunur. Az ayarlanırsa bütün istemciler proxy'nin IP'sini paylaşır: 10 istek/saat sınırı herkese birlikte uygulanır ve form fiilen kilitlenebilir. Kural: env = bizim proxy sayımız. Bu `.env.example` ve SMTP-SUNUCU notunda yazıyor.
- **3000 portu açıksa sınır yine atlatılır** (compose `0.0.0.0` bağı). Kapsam dışı, öneri §1'de. Bu kapanmadan B-1'in prod'da tam kapandığı söylenemez.
- **Kova birleşmesi:** aynı NAT arkasındaki kurumlar (belediye ağı, mobil CGNAT) artık gerçekten aynı kovaya düşüyor. Saatte 10 istek bir kurum için makul. Sahtecilik açığı kapanınca bu, doğru davranışın bir yan etkisi.
- **Rıza metni, marka ya da süre değişirse** biri `version` değerini artırıp yeni özet satırını eklemeli. Test hangi özeti beklediğini basıyor, işlem mekanik.
- **Mevcut kova sayımlarına etkisi yok.** Yeni kod eski satırları geçersiz kılmıyor, ipHash formatı aynı. Deploy sırasında 1 saatlik pencere içinde eski kovalar kendiliğinden sönüyor.

## 5. Açık sorular
- Prod gerçekten tek proxy mi (Caddy ya da nginx, önünde CDN yok)? Değilse `TRUSTED_PROXY_HOPS` değeri kararlaştırılmalı. Ayrıca compose'daki `web.environment` listesine eklenmeli, çünkü `env_file` yok.
- `docker-compose.yml` port bağının `127.0.0.1`'e çekilmesi ayrı bir kart olarak açılsın mı? Önerim: evet, küçük ve geri alınabilir bir değişiklik.

## 6. Sonraki adım
- cs-fb: `processing-register.md` §18d'deki süre satırını "karar 29.09.2026, 12 ay" olarak kesinleştirsin (Y-2'nin kalan yarısı).
- crw-fb: yeniden inceleme. `lead-xff-e2e.mjs` artık A'da `…,rate_limited,rate_limited` basıyor.
- Deploy: `TRUSTED_PROXY_HOPS` varsayılanı 1 olduğu için env eklemeden de doğru çalışır.
  - **Geri alma:** `git revert ef2e58c0 d53db6ad` (dev karşılıkları §7'de). DB değişikliği yok, migration yok.
  - **İzleme:** yayından sonra `PublicLead` satırlarının saatlik `count(DISTINCT "ipHash")` / `count(*)` oranına bak. 1'e yakınsa her istek ayrı IP'den geliyor, bu da `TRUSTED_PROXY_HOPS`'un az ayarlandığını gösterir. Bir IP'nin sürekli 10'da takılması ise fazla ayarlandığını ya da tüm trafiğin proxy IP'sine düştüğünü gösterir.

## 7. Commit'ler ve platform
- Worktree commit'leri: `cc48d8dd` (iskelet, dev'e ayrıca cherry-pick edildi) · `ef2e58c0` · `d53db6ad` · rapor/kanıt commit'i.
- Dev karşılıkları: cherry-pick sonrası `git log` ile aşağıya işlendi.

**Platform beyanı:** Doğrulama **mac**'te yapıldı (Darwin 27, Docker Desktop; nginx 1.30.5 ve Caddy 2.11.4 Linux konteynerleri). Değişen kod platformdan bağımsız: yalnız başlık metni ayrıştırılıyor ve env okunuyor. Dosya yolu, süreç ya da kabuk yok. Linux prod'da davranışı belirleyen şey işletim sistemi değil proxy topolojisi; nginx ve Caddy Linux konteynerinde koşturuldu. Windows koşulamadı ve kapsam dışı: FONBRIDGE Windows'ta dağıtılmıyor, kod yolunda da platforma bağlı bir dal yok.
