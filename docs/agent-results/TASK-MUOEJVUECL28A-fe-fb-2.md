Hüküm: Bitti: B5 beyaz etiket tasarım rev. 3 yazıldı. İNCELEME-114'ün 3 Y + 5 Ö bulgusu ve §5.1/§5.2 notları belgede karara bağlandı, belge Karar-1 C ve Karar-2 A ile uyumlu. Yalnız belge değişti, kod yok.
Entegrasyona hazır: fe-fb/b5-design-rev3 dc1c1baf (belge commit'i `1c88821b`, üstünde bu raporun commit'i; taban dev `0779e8f8`)
**Platform beyanı:** mac'te (Darwin 27.0, zsh) yazıldı ve doğrulandı. Değişiklik yalnız bir Markdown tasarım belgesi. Çalışan bir kod yolu yok, bu yüzden platforma bağlı davranış yok. Belgenin tarif ettiği hedef ortam Linux VPS: Docker + Caddy + systemd eşitleyicisi. Bu ortam koşulmadı, çünkü görev "yalnız tasarım belgesi, kod yok" diyor ve se-fb §6 "yeni spike gerekmez" diyor. Windows koşulmadı: hedef değil, dokunulan yol platforma bağlı değil.

# TASK-MUOEJVUECL28A — B5 beyaz etiket tasarım rev. 3 (fe-fb)

## 1. Ne yapıldı
- `docs/kamu/B5-BEYAZ-ETIKET-TASARIMI.md` rev. 2'den rev. 3'e getirildi. Aynı belge üzerinde çalışıldı.
- Kaynak: se-fb İNCELEME-114 (`TASK-MUOFKI8C1009Z-se-fb.md`, dal `se-fb/inceleme114`, `95c5cbf3`). Hükmü "TASARIM DÜZELTMESİ GEREKLİ (küçük)" idi.
- Her R2 bulgusunun yanıtı belgenin §6.2 tablosunda (bulgu → karar → belgede nerede). Özeti:

| # | Karar | Belgede |
|---|---|---|
| R2-Y1 | Üretimde `AUTH_URL`/`NEXTAUTH_URL` olmayacak. `useSecureCookies: NODE_ENV==='production'` açıkça yazılacak. Açılış kontrolü ekleniyor (`AUTH_REDIRECT_PROXY_URL` ile aynı yerde). `docker-compose.yml:39` kaldırılacak, `.env.example:41-42` yeniden yazılacak. Sıralama şartı: env satırı ancak iki host katmanı canlıdayken ya da aynı sürümde kalkar. Yan bulgu lider için §8-L1'de. | §0-2, §3.2-1, §2.3, §8.2 |
| R2-Y2 | Çekme modeli seçildi. `fb-edge-sync` ana makinede `caddy` kullanıcısıyla çalışır, sahibi devop-fb. Ayrı bir DB rolü var: yalnız görünüm SELECT'i ve `AgencyDomainEdgeState` yazma yetkisi. Web uygulaması yalnız DB'ye yazar. Admin API unix soketinde (`0600`). Hostname üç katmanda doğrulanır: web (regex + PSL), DB `CHECK`, eşitleyici. `caddy adapt` JSON'unda değişmezler denetlenir (`strict_sni_host`, catch-all 421, unix admin) ve üretilen host kümesi DB kümesine eşit olmalı. Dosya atomik `rename` ile yerleşir. Compose bekçisi eklenir (docker.sock, `/etc/caddy`, `network_mode: host` yasak). | §0-3, §2.1, §4.1-4.3 |
| R2-Y3 | İniş iki adımlı: `/api/auth/handoff` çerezsiz ve yan etkisiz, oradan aynı kökene `/api/auth/handoff/complete` gider. Tüketme, nonce karşılaştırması ve oturum basma ikinci adımda. Aracı girişi `303` ile GET'e döner, durum `HandoffRequest`'te tutulur. Çıkış senkronu da düzeltildi: rev. 2'deki siteler arası logout POST'unda da aynı Lax sorunu vardı. `SameSite=None` gerekçesiyle reddedildi. Nonce kontrolü "kaldırılamaz" olarak işaretlendi ve testi var. | §3.3 |
| R2-Ö1 | `signIn`'de önce claim yazılır, sonra karşılaştırma yapılır. Kod parçası yeniden yazıldı, üç test eklendi. | §3.2-3, §2.3 |
| R2-Ö2 | Matrise `POST /x.png` + `Next-Action` sütunu eklendi. Oturumsuz eylemler `assertBrandHost()` çağırır (bugün tek örnek `submitReadinessLead`). `'use server'` bekçisi eklendi. | §2.2, §2.3 |
| R2-Ö3 | `next-auth/jwt`, `@auth/core/jwt` ve `decode(` yasak. Kaynak bekçisi eklendi. | §3.2-5 |
| R2-Ö4 | Aracı girişinde `Origin` tam eşleşmeli. Yoksa `Sec-Fetch-Site` ve `Referer` kökeni bakılır, ikisi de yoksa ret. İnişin 2. adımında aynı kökenden `Origin` şartı var. | §3.3-2/6 |
| R2-Ö5 | Web tek örnekteyken süreç içi boşaltma ve TTL yeterli. `LISTEN`'i eşitleyici yapar. Web'de `LISTEN` ikinci örnek gelince eklenir. | §2.2, §4.3-3 |
| §5.1 | Aşama 1'in alt ucu düzeltildi (13,5 değil 13). | §7 |
| §5.2 | Karar-1 C: HSTS yalnız Caddy'de, `has: host` yedek planı silindi, `>` için gerekçe "savunma derinliği" oldu. Karar-2 A: kök alan desteklenmez, bu karar KAPANDI. | §0, §1.1, §5, §8 |

- Efor: B ≈ **25-36** kişi-gün (rev. 2: 24-35). Aşama 1: 13,5-20. 1b: 2,75-4,75. C değişmedi (+11-17): R2-Y3 ve R2-Ö4, Y-4'ün +3-5 aralığında kalıyor.

## 2. Kanıt
- Belge atıfları bu worktree'de (`0779e8f8`) okundu:
  ```
  docker-compose.yml:39      - NEXTAUTH_URL=http://localhost:${FABRIKA_WEB_PORT:-3000}
  .env.example:41-42         # Auth.js builds its callback from the request host (trustHost). Behind a proxy / that rewrites Host, pin it: AUTH_URL=https://fonbridge.com
  src/lib/auth.ts:345        trustHost: true,     (useSecureCookies yok)
  src/lib/auth.ts:696,747    requestedTenantId … / memberships?.[0]
  src/lib/tenant.ts:112,169  await auth()
  src/lib/agency/cobrand-store.ts:112-115  data: { settings: { ...settings, [COBRAND_KEY]: … } }
  src/app/[locale]/fon-hazirlik/actions.ts:11  export async function submitReadinessLead(…)   ← oturumsuz tek eylem
  grep -rln "getToken\|next-auth/jwt" src   → boş
  git merge-base --is-ancestor c6fad2ac HEAD → HSTS_MERGED   (Karar-1 C dev'de; src/ ve next.config.ts'te Strict-Transport yok)
  docs/SMTP-SUNUCU.md:522    "HSTS başlığı yalnız Caddy tarafından gönderilir"
  ```
- Karar-1 kaydı: `TASK-MUOEUYV0GMU12-devop-fb.md:6` "Karar-1 (patron, 30.09): HSTS başlığı yalnız Caddy'de". Karar-2 A'nın repoda ayrı bir kaydı yok. Kaynak olarak görev metni ve İNCELEME-114 §5.2 kullanıldı. Board'un karar aracı "karar kaydı yok (KRR-01 göçü uygulanmamış)" döndü.
- Hostname doğrulamasını ölçtüm (R2-Y2), enjeksiyon örnekleriyle:
  ```
  'panel.oka.org.tr' True   'a{b}.com' False   '*.oka.org.tr' False   '1.2.3.4' False
  'import x.com' False      'a.b/c.com' False  'panel.oka.org.tr.' False
  'panel.oka.org.tr\n' True   ← Python re.match + '$' sondaki satır sonunu kabul ediyor
  fullmatch False  |  js /…$/.test('…\n') false
  ```
  Bu nedenle belgeye "tam eşleşme şartı" eklendi: eşitleyici `re.fullmatch` kullanacak, üç katmanın testleri `\n` ve `\r\n` girdilerini de kapsayacak. İNCELEME-114'ün önerdiği düzenli ifade Python'da `re.match` ile kullanılsaydı satır sonu enjeksiyonu açık kalırdı.
- Commit: `git show --name-only 1c88821b` → yalnız `docs/kamu/B5-BEYAZ-ETIKET-TASARIMI.md` (+361/−163).

## 3. Değişen dosyalar
- `docs/kamu/B5-BEYAZ-ETIKET-TASARIMI.md` (rev. 3)
- `docs/agent-results/TASK-MUOEJVUECL28A-fe-fb-2.md` (bu rapor)

Dal `fe-fb/b5-design-rev3`, dev `0779e8f8`'den açıldı. Worktree scratchpad'de. Push yapılmadı, dev'e merge edilmedi. Ana checkout'a dokunulmadı.

## 4. Riskler
- R2-Y3 çözümü tarayıcı belirtimine dayanıyor (Lax: siteler arası POST'ta çerez yok, üst düzey GET'te var). Tarayıcıda koşulmadı. Belge uygulama kartına Chromium + WebKit e2e'sini zorunlu yazıyor.
- `caddy adapt` JSON anahtar yolları (`strict_sni_host`, `static_response` 421, `admin.listen`) Caddy 2.11 bilgisine dayanıyor, bu revizyonda koşulmadı. Eşitleyici kartı ilk iş olarak bunları sabitleyen bir test yazmalı.
- Karar-2 A'nın yazılı patron kaydı repoda yok. Belge görev metnine dayanarak "KAPANDI" diyor.

## 5. Açık sorular
- §8-L1 (lider): bugünkü `fonbridge.com` dağıtımı `NEXTAUTH_URL=http://localhost:3000` ile mi koşuyor? Evetse ayrı bir devop-fb kartı gerekir.
- §8-L2: `fb-edge-sync`'in sahibi için öneri devop-fb.
- Patron soruları 1, 3, 4, 6, 7, 8 ve 10 açık, değişmedi.

## 6. Sonraki adım
- se-fb: rev. 3'ün belge farkı üzerinden hafif yeniden inceleme (`git diff 0779e8f8..fe-fb/b5-design-rev3 -- docs/kamu/`).
- Onaydan sonra lider dalı dev'e merge eder. Aşama 0/1/1b uygulama kartlarının DoD'u §2.3'ten, eşitleyici kartı §4.3'ten alınır.

## DoD
- [x] R2-Y1, R2-Y2, R2-Y3 ve R2-Ö1..Ö5 için yanıt tablosu var (§6.2: bulgu → karar → belgede nerede)
- [x] Karar-1 C ve Karar-2 A ile uyum sağlandı (§0, §1.1, §5, §8), HSTS yedek planı silindi
- [x] Efor güncellendi (aşama 1 aritmetik hatası düzeltildi, B ≈ 25-36)
- [x] Kod atıfları worktree'de doğrulandı. Hostname kuralı ölçüldü ve Python `$` tuzağı belgeye işlendi
- [x] Commit yalnız belge. Push yok, merge yok, ana checkout'a dokunulmadı
- [x] Platform: mac'te doğrulandı. Linux hedef ortamı ve Windows koşulmadı (gerekçe en üstte)


---

<!-- Entegrasyon birleştirmesi (TASK-MUOLBW7PZ7HM4): aşağıdaki içerik fe-fb/b5-design-rev3 dalındaki aynı yol sürümüdür; dev sürümü yukarıda aynen korundu. -->

Hüküm: Bitti: B5 beyaz etiket tasarım rev. 3 yazıldı. İNCELEME-114'ün 3 Y + 5 Ö bulgusu ve §5.1/§5.2 notları belgede karara bağlandı, belge Karar-1 C ve Karar-2 A ile uyumlu. Yalnız belge değişti, kod yok.
Entegrasyona hazır: fe-fb/b5-design-rev3 (dal ucu = bu raporun commit'i; belge commit'i `1c88821b`, üstünde bu raporun commit'i; taban dev `0779e8f8`)
**Platform beyanı:** mac'te (Darwin 27.0, zsh) yazıldı ve doğrulandı. Değişiklik yalnız bir Markdown tasarım belgesi. Çalışan bir kod yolu yok, bu yüzden platforma bağlı davranış yok. Belgenin tarif ettiği hedef ortam Linux VPS: Docker + Caddy + systemd eşitleyicisi. Bu ortam koşulmadı, çünkü görev "yalnız tasarım belgesi, kod yok" diyor ve se-fb §6 "yeni spike gerekmez" diyor. Windows koşulmadı: hedef değil, dokunulan yol platforma bağlı değil.

# TASK-MUOEJVUECL28A — B5 beyaz etiket tasarım rev. 3 (fe-fb)

## 1. Ne yapıldı
- `docs/kamu/B5-BEYAZ-ETIKET-TASARIMI.md` rev. 2'den rev. 3'e getirildi. Aynı belge üzerinde çalışıldı.
- Kaynak: se-fb İNCELEME-114 (`TASK-MUOFKI8C1009Z-se-fb.md`, dal `se-fb/inceleme114`, `95c5cbf3`). Hükmü "TASARIM DÜZELTMESİ GEREKLİ (küçük)" idi.
- Her R2 bulgusunun yanıtı belgenin §6.2 tablosunda (bulgu → karar → belgede nerede). Özeti:

| # | Karar | Belgede |
|---|---|---|
| R2-Y1 | Üretimde `AUTH_URL`/`NEXTAUTH_URL` olmayacak. `useSecureCookies: NODE_ENV==='production'` açıkça yazılacak. Açılış kontrolü ekleniyor (`AUTH_REDIRECT_PROXY_URL` ile aynı yerde). `docker-compose.yml:39` kaldırılacak, `.env.example:41-42` yeniden yazılacak. Sıralama şartı: env satırı ancak iki host katmanı canlıdayken ya da aynı sürümde kalkar. Yan bulgu lider için §8-L1'de. | §0-2, §3.2-1, §2.3, §8.2 |
| R2-Y2 | Çekme modeli seçildi. `fb-edge-sync` ana makinede `caddy` kullanıcısıyla çalışır, sahibi devop-fb. Ayrı bir DB rolü var: yalnız görünüm SELECT'i ve `AgencyDomainEdgeState` yazma yetkisi. Web uygulaması yalnız DB'ye yazar. Admin API unix soketinde (`0600`). Hostname üç katmanda doğrulanır: web (regex + PSL), DB `CHECK`, eşitleyici. `caddy adapt` JSON'unda değişmezler denetlenir (`strict_sni_host`, catch-all 421, unix admin) ve üretilen host kümesi DB kümesine eşit olmalı. Dosya atomik `rename` ile yerleşir. Compose bekçisi eklenir (docker.sock, `/etc/caddy`, `network_mode: host` yasak). | §0-3, §2.1, §4.1-4.3 |
| R2-Y3 | İniş iki adımlı: `/api/auth/handoff` çerezsiz ve yan etkisiz, oradan aynı kökene `/api/auth/handoff/complete` gider. Tüketme, nonce karşılaştırması ve oturum basma ikinci adımda. Aracı girişi `303` ile GET'e döner, durum `HandoffRequest`'te tutulur. Çıkış senkronu da düzeltildi: rev. 2'deki siteler arası logout POST'unda da aynı Lax sorunu vardı. `SameSite=None` gerekçesiyle reddedildi. Nonce kontrolü "kaldırılamaz" olarak işaretlendi ve testi var. | §3.3 |
| R2-Ö1 | `signIn`'de önce claim yazılır, sonra karşılaştırma yapılır. Kod parçası yeniden yazıldı, üç test eklendi. | §3.2-3, §2.3 |
| R2-Ö2 | Matrise `POST /x.png` + `Next-Action` sütunu eklendi. Oturumsuz eylemler `assertBrandHost()` çağırır (bugün tek örnek `submitReadinessLead`). `'use server'` bekçisi eklendi. | §2.2, §2.3 |
| R2-Ö3 | `next-auth/jwt`, `@auth/core/jwt` ve `decode(` yasak. Kaynak bekçisi eklendi. | §3.2-5 |
| R2-Ö4 | Aracı girişinde `Origin` tam eşleşmeli. Yoksa `Sec-Fetch-Site` ve `Referer` kökeni bakılır, ikisi de yoksa ret. İnişin 2. adımında aynı kökenden `Origin` şartı var. | §3.3-2/6 |
| R2-Ö5 | Web tek örnekteyken süreç içi boşaltma ve TTL yeterli. `LISTEN`'i eşitleyici yapar. Web'de `LISTEN` ikinci örnek gelince eklenir. | §2.2, §4.3-3 |
| §5.1 | Aşama 1'in alt ucu düzeltildi (13,5 değil 13). | §7 |
| §5.2 | Karar-1 C: HSTS yalnız Caddy'de, `has: host` yedek planı silindi, `>` için gerekçe "savunma derinliği" oldu. Karar-2 A: kök alan desteklenmez, bu karar KAPANDI. | §0, §1.1, §5, §8 |

- Efor: B ≈ **25-36** kişi-gün (rev. 2: 24-35). Aşama 1: 13,5-20. 1b: 2,75-4,75. C değişmedi (+11-17): R2-Y3 ve R2-Ö4, Y-4'ün +3-5 aralığında kalıyor.

## 2. Kanıt
- Belge atıfları bu worktree'de (`0779e8f8`) okundu:
  ```
  docker-compose.yml:39      - NEXTAUTH_URL=http://localhost:${FABRIKA_WEB_PORT:-3000}
  .env.example:41-42         # Auth.js builds its callback from the request host (trustHost). Behind a proxy / that rewrites Host, pin it: AUTH_URL=https://fonbridge.com
  src/lib/auth.ts:345        trustHost: true,     (useSecureCookies yok)
  src/lib/auth.ts:696,747    requestedTenantId … / memberships?.[0]
  src/lib/tenant.ts:112,169  await auth()
  src/lib/agency/cobrand-store.ts:112-115  data: { settings: { ...settings, [COBRAND_KEY]: … } }
  src/app/[locale]/fon-hazirlik/actions.ts:11  export async function submitReadinessLead(…)   ← oturumsuz tek eylem
  grep -rln "getToken\|next-auth/jwt" src   → boş
  git merge-base --is-ancestor c6fad2ac HEAD → HSTS_MERGED   (Karar-1 C dev'de; src/ ve next.config.ts'te Strict-Transport yok)
  docs/SMTP-SUNUCU.md:522    "HSTS başlığı yalnız Caddy tarafından gönderilir"
  ```
- Karar-1 kaydı: `TASK-MUOEUYV0GMU12-devop-fb.md:6` "Karar-1 (patron, 30.09): HSTS başlığı yalnız Caddy'de". Karar-2 A'nın repoda ayrı bir kaydı yok. Kaynak olarak görev metni ve İNCELEME-114 §5.2 kullanıldı. Board'un karar aracı "karar kaydı yok (KRR-01 göçü uygulanmamış)" döndü.
- Hostname doğrulamasını ölçtüm (R2-Y2), enjeksiyon örnekleriyle:
  ```
  'panel.oka.org.tr' True   'a{b}.com' False   '*.oka.org.tr' False   '1.2.3.4' False
  'import x.com' False      'a.b/c.com' False  'panel.oka.org.tr.' False
  'panel.oka.org.tr\n' True   ← Python re.match + '$' sondaki satır sonunu kabul ediyor
  fullmatch False  |  js /…$/.test('…\n') false
  ```
  Bu nedenle belgeye "tam eşleşme şartı" eklendi: eşitleyici `re.fullmatch` kullanacak, üç katmanın testleri `\n` ve `\r\n` girdilerini de kapsayacak. İNCELEME-114'ün önerdiği düzenli ifade Python'da `re.match` ile kullanılsaydı satır sonu enjeksiyonu açık kalırdı.
- Commit: `git show --name-only 1c88821b` → yalnız `docs/kamu/B5-BEYAZ-ETIKET-TASARIMI.md` (+361/−163).

## 3. Değişen dosyalar
- `docs/kamu/B5-BEYAZ-ETIKET-TASARIMI.md` (rev. 3)
- `docs/agent-results/TASK-MUOEJVUECL28A-fe-fb-2.md` (bu rapor)

Dal `fe-fb/b5-design-rev3`, dev `0779e8f8`'den açıldı. Worktree scratchpad'de. Push yapılmadı, dev'e merge edilmedi. Ana checkout'a dokunulmadı.

## 4. Riskler
- R2-Y3 çözümü tarayıcı belirtimine dayanıyor (Lax: siteler arası POST'ta çerez yok, üst düzey GET'te var). Tarayıcıda koşulmadı. Belge uygulama kartına Chromium + WebKit e2e'sini zorunlu yazıyor.
- `caddy adapt` JSON anahtar yolları (`strict_sni_host`, `static_response` 421, `admin.listen`) Caddy 2.11 bilgisine dayanıyor, bu revizyonda koşulmadı. Eşitleyici kartı ilk iş olarak bunları sabitleyen bir test yazmalı.
- Karar-2 A'nın yazılı patron kaydı repoda yok. Belge görev metnine dayanarak "KAPANDI" diyor.

## 5. Açık sorular
- §8-L1 (lider): bugünkü `fonbridge.com` dağıtımı `NEXTAUTH_URL=http://localhost:3000` ile mi koşuyor? Evetse ayrı bir devop-fb kartı gerekir.
- §8-L2: `fb-edge-sync`'in sahibi için öneri devop-fb.
- Patron soruları 1, 3, 4, 6, 7, 8 ve 10 açık, değişmedi.

## 6. Sonraki adım
- se-fb: rev. 3'ün belge farkı üzerinden hafif yeniden inceleme (`git diff 0779e8f8..fe-fb/b5-design-rev3 -- docs/kamu/`).
- Onaydan sonra lider dalı dev'e merge eder. Aşama 0/1/1b uygulama kartlarının DoD'u §2.3'ten, eşitleyici kartı §4.3'ten alınır.

## DoD
- [x] R2-Y1, R2-Y2, R2-Y3 ve R2-Ö1..Ö5 için yanıt tablosu var (§6.2: bulgu → karar → belgede nerede)
- [x] Karar-1 C ve Karar-2 A ile uyum sağlandı (§0, §1.1, §5, §8), HSTS yedek planı silindi
- [x] Efor güncellendi (aşama 1 aritmetik hatası düzeltildi, B ≈ 25-36)
- [x] Kod atıfları worktree'de doğrulandı. Hostname kuralı ölçüldü ve Python `$` tuzağı belgeye işlendi
- [x] Commit yalnız belge. Push yok, merge yok, ana checkout'a dokunulmadı
- [x] Platform: mac'te doğrulandı. Linux hedef ortamı ve Windows koşulmadı (gerekçe en üstte)
