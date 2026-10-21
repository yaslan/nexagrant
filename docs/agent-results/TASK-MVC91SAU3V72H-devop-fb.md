# FO-51 · TASK-MVC91SAU3V72H — Canlı `TRUSTED_PROXY_HOPS` ölçümü ve belgeleme

**Ajan:** devop-fb · **Sprint:** FB-UZMAN · **Tip:** runtime (güvenlik konfigürasyonu) · **Dal:** `devop-fb/fo51-trusted-proxy-hops` (taban: `origin/dev` @ edda63cc) · **PR:** YOK — dal push edilemedi (aşağıda), PR açılmadı

## Hüküm

Canlı topoloji **tek ters vekil**: `fonbridge.com` → `77.92.144.187` (LiteSpeed) → Passenger → Node. CDN yok.
Doğru değer **`TRUSTED_PROXY_HOPS=1`**. Kod varsayılanı da 1 (`src/lib/leads/public-lead.ts` `trustedProxyHops`), yani env girilmese de canlı 1 ile çalışır. Değeri açıkça girmek sabitleme içindir.

Durum: **kod ve testler yeşil, ama dal henüz `origin`'de değil.** Pre-push gate'in son adımı (`pnpm test:e2e`) port 3000 meşgul olduğu için koşamadı (aşağıda). Push ve PR bu yüzden yapılmadı.

## Ne yapıldı

1. **Ölçüm (yalnız okuma):** DNS, HTTP başlıkları, kod, deploy belgeleri.
2. **Değer:** 1 (aşağıdaki kanıta göre).
3. **Belge ve test:** `.env.example`, `docs/RELEASE_CHECKLIST.md` satırı, `clientIpFrom` için sahte-XFF birim testi. Bu üçü dalda zaten vardı (commit `b2e6d8ed`, 17.10.2026, aynı değer). Bu oturumda doğrulandı ve kanıtlandı.
4. **Canlı sunucu env'i değiştirilmedi, deploy yapılmadı.** Erişimim yok, yetkim de yok.
5. **Push denemesi (normal push, `--no-verify` yok):** iki deneme yapıldı, ikisi de pre-push gate'te durdu. Ayrıntı aşağıda.

## Kanıt (ham çıktı)

**DNS** (`dig`):
```
fonbridge.com        A      77.92.144.187
fonbridge.com        CNAME  (yok)
www.fonbridge.com    CNAME  (yok)
fonbridge.com        NS     ns1.iyisunucu.com.tr. / ns2.iyisunucu.com.tr.
```
A kaydı doğrudan sunucu IP'sine gidiyor. Önde CDN CNAME'i yok. NS Türkiye'deki barındırma sağlayıcısına ait.

**HTTP başlıkları** (`curl -sI https://fonbridge.com`, tarayıcı User-Agent ile):
```
HTTP/2 307
location: /tr
set-cookie: NEXT_LOCALE=tr; Path=/; SameSite=lax; secure
x-frame-options: DENY
x-content-type-options: nosniff
content-security-policy: default-src 'self'; ... report-uri /api/csp-report
alt-svc: h3=":443"; ...
```
Yanıtta `cf-ray`, `x-cache`, `via`, CDN başlığı ve `server` başlığı yok. Başlıklar Next.js uygulamasından geliyor.

**Not (ölçüm tuzağı):** `curl -sI` varsayılan User-Agent ile `HTTP/2 403` döndü. Tarayıcı User-Agent ile 307 döndü. Bu bir UA filtresi (sunucu tarafı WAF). Kararı etkilemiyor. İleride ölçüm yapan kişi User-Agent vermeli.

**Yurt dışı CDN:** İstek yolunda gözlemlenmedi. Tek dış bağımlılık CSP'deki `images.unsplash.com` (görsel kaynağı, vekil değil) ve `accounts.google.com` (form-action, giriş). KVKK için "yurt içi barındırma" beyanını etkileyen bir CDN bulunmadı.

**Hop sayısı nasıl çıkarıldı:** Dış ölçümle XFF zincirini okuyamam (yanıtta IP görünmüyor). Sayı şu iki kanıtın birleşimi:
- Dış yol: DNS'te CDN yok, başlıklarda CDN izi yok → istemci ile sunucu arasında bizim tek vekilimiz var.
- Önceki ölçüm (17.10.2026, `.claude-fo49/deploy/cpanel/ENV-LISTESI.md` satır 63 ve `b2e6d8ed`): `77.92.144.187` önünde tek LiteSpeed.

**Sınır:** Canlı sunucuda XFF'in gerçekten tek kez eklendiğini dış taraftan kanıtlayamıyorum. Kesin doğrulama için sunucuda bir XFF yankısı ya da yayın sonrası `PublicLead` `ipHash` izlemesi gerekir (aşağıda).

**Kod kanıtı:** `clientIpFrom` (`src/lib/leads/public-lead.ts`) XFF zincirinin SAĞINDAN `hops`'uncu girdiyi alıyor. `hops=1` için sol taraftaki (istemcinin yazdığı) değerler yok sayılıyor.

## Test

**Birim (FO-51 dosyası):** `perl -e 'alarm 600; exec @ARGV' npx vitest run src/lib/leads/public-lead.test.ts`
- **17/17 geçti** (`Duration 421ms`).

**Mutasyon** (sadece bu oturumda, sonra geri alındı): `return chain[Math.max(0, chain.length - hops)] ?? null;` → `return chain[0] ?? null;` (ilk değeri al, eski güvensiz davranış).
- **2 test kırıldı:** "takes the hop our proxy appended, never the one the client wrote" ve FO-51 testi "with the live value (one proxy) ignores a forged X-Forwarded-For prefix". Yani test sahte önekli XFF'i gerçekten yakalıyor.
- Geri alındı, dal temiz.

**Tip denetimi:** `pnpm typecheck` (`tsc --noEmit`) çalıştırıldı, **çıkış kodu 0**, hata yok. Ham çıktı: `$ tsc --noEmit` (tek satır, hata satırı yok).

**Lint:** `npx eslint src/lib/leads/public-lead.test.ts` → hata yok.

**Pre-push gate (`git push`, `.env` aynı kabukta):**
- Deneme 1 — `.env` yüklenmeden: 14 test dosyası kırmızı, `ECONNREFUSED 127.0.0.1:5432`. Sebep: worktree'de `.env` yok, testler varsayılan 5432 portuna gitti. Postgres (docker) `5433`'te dinliyor. Kod kaynaklı değil.
- Deneme 2 — `.env` (ana checkout'taki) aynı kabukta yüklü:
  - `pnpm lint`: 0 hata, 4 uyarı (`no-unused-vars`, test dosyaları; bu dalın değişiklikleri değil).
  - `pnpm typecheck`: geçti.
  - `pnpm test`: **Test Files 350 passed | 7 skipped (357); Tests 4569 passed | 120 skipped (4689)**.
  - `i18n:check`, `rls:check`, `rls:bypass-check`, `rls:verify --require-db`, `db:rls-role`: geçti (zincir `&&` ile ilerledi).
  - **`pnpm test:e2e`: KIRMIZI, kod hatası değil.** `Error: http://localhost:3000 is already used, make sure that nothing is running on the port/url`. Port 3000'i PID 25179 `next-server` tutuyor (başlangıç 22:25, cwd `/Users/macbook/alan/FONBRIDGE`, ana checkout). Bu süreç bana ait değil; öldürmedim. Playwright `reuseExistingServer` kapalı, e2e 3000'de yeni sunucu başlatamıyor.
  - Son adım `pnpm alerts:check` e2e yüzünden koşmadı.
  - `git push` → `failed to push some refs` (gate çıkış kodu 1).

## Değişen dosyalar

- `.env.example` — canlı topoloji ve değer açıklaması (`b2e6d8ed`)
- `docs/RELEASE_CHECKLIST.md` — `TRUSTED_PROXY_HOPS=1` satırı, "PATRON (cPanel'e tek satır)" (`b2e6d8ed`)
- `src/lib/leads/public-lead.test.ts` — FO-51 sahte-XFF testi (`b2e6d8ed`)
- `docs/agent-results/TASK-MVC91SAU3V72H-devop-fb.md` — bu rapor

Kod (`public-lead.ts`) değişmedi.

## Deploy şablonu hakkında

Kartta `deploy/cpanel/` şablonu isteniyordu. Bu dizin **`origin/dev`'de yok**. Yalnız yerel `dev` dalında var (`.claude-fo49` worktree'sinde, 82 commit pushlanmamış). Bu PR'a girmesi için o commit'lerin de gelmesi gerekir, bu yüzden eklemedim. Yerel `ENV-LISTESI.md` zaten `TRUSTED_PROXY_HOPS = 1` yazıyor (ölçüm 17.10.2026). Güncelleme gerekmiyor. **Açık soru:** `deploy/cpanel/` ne zaman dev'e pushlanacak?

## Patron için cPanel talimatı (canlıya uygulanmadı)

cPanel → **Setup Node.js App** → FonBridge uygulaması → **Environment variables** → **ADD VARIABLE**: `TRUSTED_PROXY_HOPS` = `1` → **SAVE** → **RESTART**.

Değer zaten varsayılan 1 olduğundan bu adım zorunlu değil. Yine de açık yazılması önerilir.

## Riskler

- **Hop sayısı yanlış olursa** (ör. ileride CDN eklenirse 2 olmalı): sahte XFF ile ön kayıt IP sınırı (5/saat) aşılır, ya da az ayarlanırsa tüm istemciler proxy IP'sini paylaşır ve form kilitlenir. Bu yüzden CDN eklenirse değer ve `docker-compose.yml` birlikte güncellenmeli.
- **Canlı env'in gerçek değeri bilinmiyor.** Erişim olmadığı için cPanel'deki değişkeni görmedim. Kod varsayılanı 1 olduğundan, boşsa da 1 kullanılır.
- **Ölçüm UA filtresi:** Varsayılan curl User-Agent ile sunucu 403 veriyor. Ölçüm belgesine not düşüldü.
- **Dal origin/dev'in 125 commit gerisinde** (`ahead 2, behind 125`). PR açılırsa birleşme çakışması olabilir; gate bu dalda koştu, rebase edilmiş dalda değil.

## Açık sorular

1. **Port 3000'i tutan `next-server` (PID 25179) kime ait?** Kapatılırsa e2e koşar ve push tamamlanır. Ben dokunmadım.
2. `deploy/cpanel/` ne zaman dev'e pushlanacak?
3. Canlıda XFF tek kez ekleniyor mu? Kesin kanıt için yayın sonrası izleme: `PublicLead` tablosunda saatlik `count(DISTINCT "ipHash") / count(*)` oranına bak. Oran 1'e yakınsa her istek ayrı IP'den geliyor (değer az). Bir IP sürekli 10'da takılıyorsa değer fazla ya da tüm trafik proxy IP'sine düşüyor.

## Platform beyanı

- **Koşuldu:** macOS (darwin). Vitest, eslint, tsc, Playwright (kuruldu, port çakışmasında durdu), DNS ve `curl` burada.
- **Canlı hedef:** Linux (cPanel/Passenger). Değiştirilen kod yolu (`clientIpFrom`) platforma bağlı değil: yalnız HTTP başlıklarını okuyor. İşletim sistemi dallanması yok.
- **Windows / Linux:** koşulmadı. Gerekçe: değişiklik yalnız belge ve test; platforma bağlı kod yolu içermiyor.

## Sonraki adım

1. Port 3000'deki süreç kapanınca (sahibi onaylarsa) `.env` yüklü kabukta `git push -u origin devop-fb/fo51-trusted-proxy-hops` yeniden çalıştırılır; gate tamamen yeşilse `dev` tabanına PR açılır (merge yok).
2. Patron cPanel'e `TRUSTED_PROXY_HOPS=1` satırını girer (zorunlu değil).
3. Yayın sonrası `ipHash` oranı izlenir.
4. Kart `review`'a yalnız PR açıldıktan sonra alınır.
