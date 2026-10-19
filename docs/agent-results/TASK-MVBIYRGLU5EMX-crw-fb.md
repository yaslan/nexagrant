---
sözleşme: 3
görev: TASK-MVBIYRGLU5EMX
kod: TASK-MVBIYRGLU5EMX
ajan: crw-fb
motor: claude
tip: ölçüm
okur: ekip
hüküm: Bitti: Düzeltme gerekli: YAYIN ENGELİ — teknik güvenlik büyük ölçüde sağlam (RLS, yetki, token, founderNumber yarışı, XSS, başlık enjeksiyonu canlı ölçümle temiz), ama dev'deki KVKK metninde unvan yer tutucusu ve saklama işi yok (#94/#92 açık, çakışmalı); ayrıca Türkçe Excel'de CSV formül enjeksiyonu açık.
platform: mac yerel: ayrık worktree (origin/dev 80271979) + izole Postgres pgvector:pg16 (:55421) + Mailpit + `next dev :3121`, uygulama DATABASE_URL = fabrika_app (NOBYPASSRLS). Prod ortamı koşulmadı; Caddy/XFF davranışı prod'da ölçülmedi.
sürüm: 2
tarih: 2026-10-19T19:01:40.909Z
---

# FO-21 · Uzman ön kayıt güvenlik + KVKK incelemesi (dev 80271979)

## Ne yapıldı
- FO-19 (#75) ve FO-20 (#76) **zaten birleşmiş**; sonrasında aynı yüzeye #78, #84, #85, #86, #87, #95 ve #115 gelmiş. Bu yüzden inceleme yayına çıkacak hâl üzerinde, yani `origin/dev` **80271979** üzerinde yapıldı. **Kod değiştirilmedi.**
- Ortam: scratchpad'de ayrık bir worktree, izole Postgres (`pgvector:pg16`, :55421) ve Mailpit (:55425/55426) kuruldu. Şema `prisma db push` ile basıldı, ardından migrasyonlar → `setup-rls-role` → `apply-rls` → migrasyonlar (bir kez daha) koşuldu. `next dev :3121` **`DATABASE_URL=fabrika_app`** ile (rolsuper=f, rolbypassrls=f) başlatıldı.
- Oturumlar `next-auth/jwt encode` ile basıldı: platform admin, normal kullanıcı ve claim'e `isPlatformAdmin:true, role:SUPER_ADMIN` eklenmiş normal kullanıcı.
- Tüm denemeler gerçek HTTP istekleriyle yapıldı. Betikler ve ham çıktılar `docs/agent-results/TASK-MVBIYRGLU5EMX-se-fb-ekler/` altında.

## Hüküm: **YAYIN ENGELİ**
Engel teknik değil, hukuki: dev'deki aydınlatma metni yayınlanamaz (B1, B2). Teknik tarafta yayından önce kapatılması gereken tek iş O1 (CSV).

## Yayın öncesi zorunlu işler (ayrı liste)
1. **#94 (FO-49, kvkk-v2) birleşmeli.** Unvan "Fonbridge Eğitim, Proje ve Danışmanlık Ltd. Şti." ve `consentTextVersion=kvkk-v2` ile geliyor. Durum: OPEN, **DIRTY** (çakışma var).
2. **#92 (FO-50, 1 yıl silme işi) #94 ile aynı anda birleşmeli.** v2 metni "1 yıl sonra silinir" diyor; dev'de bu veriyi silen bir iş yok (`git grep expert origin/dev -- src/lib/jobs/schedule.ts src/lib/jobs/tasks/index.ts` → boş). Durum: OPEN, **DIRTY**.
3. **O1 CSV düzeltmesi** (tek satır).
4. **O2 ve O3 metin/rıza düzeltmeleri** (hukuk onayıyla). Bunlar #94'e eklenebilir.
5. Deploy kontrolü (D1): Node portu yalnız proxy'den erişilebilir olmalı.

## Bulgular (ciddiyet sırasıyla)

| # | Ciddiyet | Konum | Bulgu |
|---|---|---|---|
| B1 | **Yayın engeli** | `content/kvkk-uzman-v1.md:9`, `.en.md:9`; `constants.ts:12` | Veri sorumlusu `[FonBridge tüzel kişi unvanı]`. Kayıtlar `kvkk-v1` sürümüyle bu metne rıza olarak yazılıyor. |
| B2 | **Yayın engeli** | `content/kvkk-uzman-v1.md:35-37` | Saklama "makul bir süre", yani belirsiz. v2 "1 yıl" diyor ama silme işi yalnız #92'de. |
| O1 | Orta | `src/lib/expert-prereg/server/csv.ts:16` | `;` içeren hücre tırnaklanmıyor. Excel tr-TR'nin liste ayırıcısı `;` olduğu için formül koruması atlanabiliyor. |
| O2 | Orta | `content/kvkk-uzman-v1.md` §2–§7 (v2'de de aynı) | Toplama yöntemi (KVKK m.10/1-d) yok. m.11 hak listesi eksik. Veri sorumlusunun adresi ve yazılı/KEP başvuru kanalı yok. |
| O3 | Orta | `schema.ts:124`; metin §4 | Rehberde yayımlanma rızası **zorunlu** (`z.literal(true)`) ama hukuki sebebi "açık rıza (m.5/1)" olarak yazılmış. Hizmete şart koşulan rıza serbest irade değildir. |
| O4 | Orta-düşük | `prisma/rls.sql:306-328` `system_scope_open` | Tablo `public-intake` dışındaki **her** system-scope amacına açık. `tenant-discovery` kapsamında fabrika_app 5/5 satır okudu. |
| D1 | Düşük (deploy'a bağlı) | `src/lib/leads/public-lead.ts:108-120` | Uygulama proxy'siz erişilebilirse en sağdaki XFF girdisi döndürülerek IP sınırı aşılıyor (7×201). Proxy arkasında sahte sol girdiler işe yaramıyor (5×201, sonra 429). |
| D2 | Düşük (spec gereği) | `route.ts:20-21` | 409 `already_registered` döndüğü için e-posta numaralandırması mümkün. |
| D3 | Düşük | `route.ts:14` | Gövde boyut sınırı yok: 8 MiB JSON kabul edildi (201). |
| D4 | Düşük | `verify/route.ts:16-20`, `verify.ts:52` | Doğrulama GET ile yapılıyor; e-posta link tarayıcıları (SafeLinks vb.) kaydı otomatik doğrular. Doğrulanmış token süresiz olarak `ok + numara` döner. |
| D5 | Düşük (KVKK) | `register.ts:236-259` | Bekleyen kayıt yeniden gönderilince pazarlama kutusu boş bırakılsa bile eski `marketingConsentAt` korunuyor; rızanın geri alınması işlenmiyor. |
| D6 | Düşük (kural) | `register.ts:130` | `process.env.AUTH_SECRET` doğrudan okunuyor (CLAUDE.md: `src/lib/env.ts` kullan; `authSecret()` mevcut). |
| D7 | Bilgi | `verify.ts:58-60` | Numara `max+1` ile veriliyor; en yüksek numaralı satır silinirse aynı numara tekrar verilir. #92'deki `ExpertFounderCounter` bunu çözüyor. |
| D8 | Bilgi | form `marketing_label` | Duyuru e-postası ticari elektronik ileti sayılır (6563 s.K.). Gönderimden önce İYS kaydı ve ETK onay metni gerekir. Şu an gönderim yok. |

### B1 / B2 — kanıt
```
content/kvkk-uzman-v1.md:9   [FonBridge tüzel kişi unvanı] ("FonBridge"). İletişim: info@fonbridge.com
content/kvkk-uzman-v1.md:37  ... Doğrulanmayan kayıtlar makul bir süre sonunda silinir.
origin/dev   constants.ts:12  EXPERT_PREREG_CONSENT_VERSION = 'kvkk-v1'
origin/se-fb/fo49-kvkk-v2   constants.ts:12  = 'kvkk-v2'
gh pr 94 → {"mergeStateStatus":"DIRTY"}   gh pr 92 → {"mergeStateStatus":"DIRTY"}
canlı satır: k1 → t|t|t|kvkk-v1
```
**Etki:** Her yeni kayıt, unvanı olmayan bir metne verilmiş rıza olarak saklanır (KVKK m.10 aydınlatma eksik). **Düzeltme:** #94 ve #92'yi rebase edip birlikte birleştirmek. v1 ile alınmış kayıtlar için yeniden aydınlatma gerekip gerekmediği hukuka sorulmalı.

### O1 — CSV `;` enjeksiyonu (tekrar üretim: `ekler/semi-out.txt`)
```
organization = "Kurum;=cmd|' /C calc'!A0;"   fullName = "Ali;=1+1;"
ham satır     : Ali;=1+1;,semi@fo21.test,Kurum;=cmd|' /C calc'!A0;,Ankara,...
virgül ayrıştırma : ['Ali;=1+1;', 'semi@fo21.test', "Kurum;=cmd|' /C calc'!A0;", ...]   → güvenli
noktalı virgül    : ['Ali', '=1+1', ',semi@fo21.test,Kurum', "=cmd|' /C calc'!A0", ...]  → formül hücresi
```
Mevcut `= + - @ \t \r` öneki ve virgül ayrıştırma doğru çalışıyor (`ekler/probe-out-2.txt`: x2/x3/x5 için `'` öneki var, virgül okuyucu 0 tehlikeli hücre buldu). Gerçek Excel'de **denenmedi**; tr-TR liste ayırıcısının `;` olduğu varsayımına dayanıyor.
**Etki:** Admin CSV'yi çift tıklayıp açtığında formül çalışır (HYPERLINK ile veri sızdırma; DDE açıksa komut çalıştırma). **Düzeltme:** `csv.ts:16` → `/[",;\r\n]/` (Excel `;` modunda da tırnağa uyuyor). İstenirse her `;` sonrası parçaya da önek eklenebilir. Bu kalıp için `csv.test.ts`'e bir test eklenmeli.

### O2 — Aydınlatma metni eksikleri (v1 ve v2)
- **Toplama yöntemi ve hukuki sebep birlikte** (m.10/1-d): "web formu aracılığıyla elektronik ortamda, otomatik yollarla" cümlesi yok.
- **m.11 hak listesi eksik.** Şunlar yazılmamış:
  - (ç) amacına uygun kullanılıp kullanılmadığını öğrenme,
  - aktarıldığı üçüncü kişileri bilme,
  - (e)/(f) düzeltme ve silmenin aktarılan üçüncü kişilere bildirilmesi,
  - (g) münhasıran otomatik analiz sonucu aleyhe çıkan sonuca itiraz,
  - (ğ) zararın giderilmesini talep.
  
  Metin yalnız genel bir "itiraz etme" ifadesi içeriyor.
- **Veri sorumlusunun adresi** (ve varsa MERSİS) ve Başvuru Usul Tebliği'ne uygun kanallar (yazılı, KEP, sistemde kayıtlı e-posta) yok. Yalnız info@ adresi var.
- **Aktarım:** v2 "yurt içi hizmet sağlayıcı" diyor. SMTP ve barındırma sağlayıcısının gerçekten yurt içinde olduğu doğrulanmadı (açık soru).

Metin hukuki tavsiye değildir; bunlar kontrol listesi bulgusudur. Nihai metni hukuk onaylamalı.

### O3 — Zorunlu "açık rıza"
`schema.ts:124` `visibilityConsent: z.literal(true)`; canlı: `visibility missing → 400 consent_required`. Metin §4 bunu "Açık rıza (m.5/1)" sayıyor. **Düzeltme (iki seçenek):**
- (a) Rehberde yayımlanma hizmetin özüyse, hukuki sebep m.5/2-c olarak yazılır ve kutu rıza değil bilgilendirme olarak sunulur.
- (b) Rıza olarak kalacaksa kutu isteğe bağlı olur ve rıza vermeyen kişi rehberde görünmez.

Ürün ve hukuk kararı gerekiyor.

### O4 — Diğer system-scope amaçları tabloyu görüyor
```
fabrika_app: BEGIN; SELECT enter_system_scope('tenant-discovery'); SELECT count(*) FROM "ExpertPreRegistration"; → 5  (tablodaki 5 satırın hepsi)
fabrika_app (kapsam dışı) SELECT → 0 ; INSERT → ERROR new row violates row-level security policy
```
FO-52 yalnız "public-intake → yalnız uzman tabloları" yönünü kapattı. Ters yön açık: uzman kişisel verisi `tenant-discovery`, iş amaçları vb. kapsamlarda okunabiliyor. Sömürmek için başka bir kod hatası gerekir (derinlemesine savunma). **Düzeltme:** `system_scope_open`'a ters bir izin listesi eklenmeli: ExpertPreRegistration yalnız `public-intake`, `platform-admin`, `platform-aggregate` ve saklama işi amacına açık olmalı. Kart TASK-MVC9FW2U15VM6 bu işin doğal yeri.

### D1 — IP sınırı ve X-Forwarded-For (`ekler/probe-out-2.txt`)
```
aynı proxy-görünen IP 192.0.2.50, sol girdiler sahte/dönüyor → [201,201,201,201,201,429,429]   ✓
IPv6 aynı /64, host kısmı dönüyor                          → [201,201,201,201,201,429,429]   ✓
XFF hiç yok (next dev kendi XFF'sini ekliyor)                → [201,201,201,201,201,429,429]   ✓
en sağ girdi dönüyor (yalnız proxy atlanırsa mümkün)        → [201×7]   ✗
en sağ girdi IP değil (junk-N)                              → [201×7]   ✗
```
Next, XFF başlığı varsa kendi değerini eklemiyor. Bu yüzden Node portuna doğrudan ulaşılabiliyorsa istemci başlığı tamamen kontrol eder. **Düzeltme:** Deploy'da uygulama portu 127.0.0.1'e bağlı olmalı ve güvenlik duvarıyla kapatılmalı (doğrulanmalı). İstenirse `clientIpFrom` IP olmayan girdiyi `null`'a çevirebilir; ama bu sınırı kapatır, o yüzden `null` IP için global bir sınır daha iyi olur.

### D2 — Numaralandırma
`register verified a1 again → 409 {"errors":{"email":"already_registered"}}`. Spec gereği kabul. Risk düşük ama "bu kişi FonBridge uzmanı mı" sorusu sorgulanabilir; saatte 5/IP sınırı yavaşlatıyor. **Öneri:** Lansman sonrası 201 + "zaten kayıtlıysanız e-postanızı kontrol edin" mesajı ve kayıtlı adrese bilgi maili gönderilebilir. Şimdilik dokümante edilmesi yeterli.

## Geçen kontroller (kanıtla)
**1. RLS / erişim** (`ekler/probe-out-1.txt`, `ekler/rlsverify.txt`)
```
app role select (kapsam dışı): 0      app role insert: ERROR new row violates row-level security policy
CSV  anon           -> 401   PAGE anon           -> 404
CSV  u-plain        -> 403   PAGE u-plain        -> 404
CSV  u-plain-forged -> 403   PAGE u-plain-forged -> 404   (/api/auth/session → isPlatformAdmin:false; claim DB'den yeniden okunuyor)
CSV  u-admin        -> 200 text/csv   PAGE u-admin -> 200
rls:verify --require-db (ölçüm rolü fabrika_app, rolbypassrls=false):
 ✓ ExpertPreRegistration: kapsam dışı okuma 0, INSERT reddedildi
 ✓ public-intake: 49 system_scope tablosunda kapsam dışıyla aynı satır (yalnız ExpertPreRegistration, ExpertPreRegAttempt açık)
 ✓ public-intake: AuditEvent INSERT reddedildi; ExpertPreRegistration INSERT kabul (pozitif kontrol)
 ✅ 47 kiracıya özel tabloda izolasyon fabrika_app ile ölçüldü
```
**2. Token**
```
db: sha256(raw)==stored True · ham token satır metninde: 0 · TTL 1 day
random 64hex / malformed / empty / UPPERCASE / 63 char → invalid
gerçek token → ok n=1 · replay → ok n=1 (değişmez) · b1 kendi token'ı → n=2 (a1 etkilenmez)
süresi geçmiş → expired, satır pending · cooldown içinde yeniden kayıt → 429 · sonrası 201, ESKİ link → invalid, ad korunuyor
```
Not: Token imzalı değil, 256-bit rastgele + sha256. Tahmin edilemez; yönlendirmedeki `?r=` sonucu HMAC ile imzalı.

**3. founderNumber** (`ekler/race-out.txt`; kendi koşum)
```
N=110 clicks=220 (her token 2×, karışık) workers=64 → http 307×220
verified 110 · numbered 100 · distinct 100 · min/max 1|100 · 1..100 boşluk 0 · numarasız verified 10
UNIQUE INDEX "ExpertPreRegistration_founderNumber_key"
```
**4. Girdi:** Sunucuda zod uygulanıyor. Bilinmeyen il, alan, rol, dil ve locale → `400 unknown_slug`. Fazla uzun ad, kurum, projectCodes ve e-posta → `too_long`. CRLF içeren e-posta → `invalid_email`. `javascript:` ve `linkedin.com.evil.test` → `invalid_url`. `kvkkAccepted:"true"` (string) → `consent_required`. 9 alan → `too_many`. Fazladan gönderilen `status:verified, founderNumber:1` alanları yok sayıldı (satır `pending|null`). Admin sayfasında ham `<script>`/`<svg onload` yok, `&lt;script&gt;` var (kaçışlı). `mailto:` yalnız doğrulanmış e-postayla oluşuyor.

**5. Spam:** Honeypot → 201, satır 0, mail 0. IP sınırı → yukarıdaki D1 tablosu.

**6. KVKK (teknik):** Kolon listesinde düz IP yok, yalnız `ipHash` var (64 hex, HMAC; anahtar `EXPERT_PREREG_IP_SALT`, yoksa AUTH_SECRET'tan türetiliyor). Satırlarda düz IP metni 0. Üç rıza ayrı kolonlarda tutuluyor: pazarlama=true → `t|t|t`, yok → `t|t|f`. `consentTextVersion` yazılıyor. SSR HTML'inde 75 checkbox var, hiçbiri `checked` değil (state `useState(false)`).

**7. E-posta:** Host ve X-Forwarded-Host `evil.attacker.test` gönderildi; maildeki link yine `http://localhost:3121/...` (APP_URL'den üretiliyor). Doğrulama yönlendirmesi de APP_URL'e gidiyor. Ad alanında `\r\nBcc: evil@…\r\nX-Inj: 1` denendi: başlıklarda Bcc/X-Inj yok, alıcı yalnız `a1@fo21.test`. HTML `escapeHtml` ile kaçışlı.

**8. Bağımlılık:** #75/#76/#78/#84/#85/#86/#87/#95/#115'in hiçbiri `package.json` ya da `pnpm-lock.yaml` değiştirmedi (`gh pr view --json files`). Yeni paket yok, audit gerekmedi.

**Testler:** `vitest run src/lib/expert-prereg tests/expert-prereg` (canlı DB ile) → **10 dosya, 99/99 geçti**, atlanan yok (`ekler/vitest-out.txt`).

## Değişen dosyalar
Kod yok. Yalnız bu rapor ve `docs/agent-results/TASK-MVBIYRGLU5EMX-se-fb-ekler/` (probe.py, probe2.py, race.py, semi.py, mint.mjs ve ham çıktılar). Betiklerdeki parolalar yalnız silinmiş geçici konteynere ait.

## Riskler
- CSV bulgusu gerçek Excel'de değil, ayrıştırıcı simülasyonuyla gösterildi.
- XFF davranışı prod Caddy'de ölçülmedi.
- KVKK maddeleri hukuki görüş değildir.

## Notlar (ürün + hukuk netleştirecek)
- O3: Rehberde yayımlanma rıza mı, hizmetin kendisi mi? (ürün + hukuk)
- SMTP ve barındırma sağlayıcısı yurt içinde mi? (v2'deki "yurt dışına aktarılmaz" beyanı buna bağlı)
- v1 ile alınmış kayıtlar (varsa) için yeniden aydınlatma gerekiyor mu?

## Sonraki adım
- #94 ve #92'yi rebase edip birlikte birleştirmek. O2 metin eksikleri #94'e eklenebilir.
- O1 için tek satırlık düzeltme ve test (BE).
- O4 TASK-MVC9FW2U15VM6 kapsamında yapılmalı.
- D1 deploy kontrolü (DevOps).
