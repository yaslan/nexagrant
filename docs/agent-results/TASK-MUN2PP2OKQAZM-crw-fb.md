# TASK-MUN2PP2OKQAZM — crw-fb — İNCELEME-32: TASK-MUN23OJ8L9DV0 (be-fb, `fc763927`)

**İncelenen:** `fc763927` fix(invitations): 10 dk içindeki yeniden davet token'ı korur ve bağlantı döndürmez (İNCELEME-26 Ö-1..Ö-4).
**Kaynak bulgular:** `docs/agent-results/TASK-MUMT3R1WRRM9S-crw-fb.md` §1.4. **be-fb raporu:** `docs/agent-results/TASK-MUN23OJ8L9DV0-be-fb.md`.
**Kod değiştirilmedi.** Bu commit yalnız bu raporu ve 3 ekran görüntüsünü ekliyor.

## KARAR: **ONAY**, bloke eden bulgu yok

Ö-1 kapandı. İki ardışık POST sonrasında token hash'i değişmiyor, ilk e-postadaki bağlantı DB'de geçerli, 200 yanıtında `inviteLink` yok ve arayüz tr/en doğru metni gösteriyor. Ö-2 ve Ö-3 kapandı. Ö-4 zaten kapalıydı (`631c7d4c`). Eşzamanlı POST'lar kilit altında doğru davranıyor.

Aşağıdaki üç bulgu öneri düzeyinde. En önemlisi **Ö-1**: 10 dk içindeki yeniden davet, e-postası zaten gönderilmiş bir davetin rolünü iz bırakmadan değiştiriyor. Yetki yükseltmesi değil, ama lider kararı gerektiriyor.

---

## 1. Kontrol listesi

| Kontrol | Sonuç | Kanıt |
| --- | --- | --- |
| İki ardışık POST, token hash'i aynı mı? | ✔ | §2.2: 4 POST sonucunda mailpit'te 2 e-posta var. `sha256(e-postadaki token) = tokenHash` sonucu `t` (tr ve en). |
| İlk e-postadaki bağlantı geçerli mi? | ✔ (DB düzeyinde) | Aynı satır. Kabul sayfası bu inceleme sırasında `0ae3175b` ile dev'e girdi, ama canlı koşumda yoktu (worktree `77c8b625`). Geçerlilik görevde istendiği gibi DB hash eşleşmesiyle gösterildi. |
| 200 yanıtında `inviteLink` yok mu? | ✔ | `hasInviteLink:false`, `reason:"recently_sent"` |
| tr/en metni | ✔ | TR: "Davet e-postası az önce gönderildi; davetli e-postadaki bağlantıyı kullanabilir". EN: "The invitation email was sent a moment ago; the invitee can use the link in that email". Ekran görüntüleri §2.2'de. `pnpm i18n:check` geçti. |
| Rol/expires güncellemesinin yetki etkisi | **Ö-1** | Yetki yükseltmesi yok: yalnız OWNER/ADMIN davet edebiliyor ve ADMIN zaten doğrudan TENANT_ADMIN daveti gönderebiliyor. Ancak ADMIN, OWNER'ın gönderdiği davetin rolünü davetlinin elindeki bağlantı üzerinden sessizce yükseltip düşürebiliyor ve bu değişiklik hiçbir yerde iz bırakmıyor. §2.3'te kanıtı var. |
| Eşzamanlı POST | ✔ | §2.4: gerçek oturumla 3 tur × 2 paralel `fetch`. Her turda 1 e-posta gidiyor, e-postadaki token geçerli kalıyor, yarışı kaybeden istek token'ı yenilemiyor. Kilit mutantı (Y10) ölüyor. |
| En az 3 mutant | ✔ 5 mutant: 3 öldü, 2 hayatta kaldı | §2.1 |
| typecheck / i18n | ✔ | `tc=0`, i18n passed. `build`'i be-fb aynı içerikle koştu, ben yeniden koşmadım. |

## 2. Kanıt

Ortam: temiz worktree `77c8b625`. Bu commit ile `fc763927` arasında incelenen dosyalara dokunan commit yok (`git log fc763927..HEAD -- <yollar>` boş). İzole DB `crwfb_mun2pp`: `migrate diff --from-empty` + `db:rls` (0 → 112 politika) + `db:rls-role`, `fabrika_app` NOBYPASSRLS. Kendi `next dev -p 3332` sunucum (worktree'nin kendi `.next`'i), kendi mailpit'im `crwfb-mun2pp-mailpit` (11332/18332). Paylaşılan `fabrika` DB'sine ve :3000'e dokunulmadı.

### 2.1 Hedefli vitest ve mutantlar (izole DB)
```
tests/invitation-mail-limit.live.test.ts + src/lib/email/__tests__/mailer.test.ts → Tests 31 passed (31)
```
Mutantlar benim, be-fb'nin M1–M4'ünden bağımsız. Her biri koşudan sonra `git checkout` ile geri alındı ve `git diff --stat` boş döndü.
```
Y2  inviteLink yalnız "gönderilmedi"de dönüyor (mail.sent ? {} : link)       → 2 failed | 9 passed   ÖLDÜ
Y8  link gizleme koşulu recently_sent → daily_limit                           → 3 failed              ÖLDÜ
Y10 lockInvitationMail silindi                                                → 1 failed | 10 passed  ÖLDÜ (eşzamanlı test)
Y3  keepToken dalında expires güncellenmiyor ({ role })                        → 11 passed             HAYATTA → Ö-3
Y11 policy: günlük sınır kontrolü soğumadan ÖNCE yapılıyor                    → 11 passed             HAYATTA → Ö-2
```

### 2.2 Gerçek tıklama (Playwright + system Chrome, `/tr/giris` formundan kayıt/giriş)
Owner `crw-owner@example.test` kayıt formundan kaydoldu. İzole DB'de tenant'a `Subscription(free, seatsExtra=20)` eklendi, çünkü varsayılan 1 koltuk daveti engelliyordu. E-posta alanı her başarılı davetten sonra temizlendiği için ikinci "tıklama" adresin yeniden yazılıp **Davet Gönder**'e basılması anlamına geliyor.
```
TR click1 POST 200 {"emailSent":true,"reason":null,"hasInviteLink":true,"role":"MEMBER"}
TR click1 UI: Davet e-postası gönderildi. Bağlantı: http://localhost:3332/tr/accept-invite?token=8f514848…
TR click2 POST 200 {"emailSent":false,"reason":"recently_sent","hasInviteLink":false,"role":"MEMBER"}
TR click2 UI: Davet e-postası az önce gönderildi; davetli e-postadaki bağlantıyı kullanabilir
EN click1 POST 200 {"emailSent":true,"reason":null,"hasInviteLink":true,"role":"MEMBER"}
EN click2 POST 200 {"emailSent":false,"reason":"recently_sent","hasInviteLink":false,"role":"WRITER"}
EN click2 UI: The invitation email was sent a moment ago; the invitee can use the link in that email
mailpit total 2
davetli-en@example.test token 9185cada… → WRITER | mailed_token_valid = t
davetli-tr@example.test token 8f514848… → MEMBER | mailed_token_valid = t
```
Ekran görüntüleri: `docs/agent-results/TASK-MUN2PP2OKQAZM-crw-fb/members-recently-sent-tr.png`, `…/members-recently-sent-en.png`

### 2.3 Yetki: ADMIN, OWNER'ın davetini 10 dk içinde yeniden gönderiyor
DB'de aynı tenant'a `crw-admin@example.test` TENANT_ADMIN olarak eklendi. Admin `/tr/giris` formundan girdi.
```
OWNER POST 200 {"emailSent":true, ...,"role":"TENANT_ADMIN"}   rol-down@
OWNER POST 200 {"emailSent":true, ...,"role":"MEMBER"}         rol-up@
ADMIN POST 200 {"emailSent":false,"reason":"recently_sent","hasInviteLink":false,"role":"MEMBER"}        rol-down@
ADMIN POST 200 {"emailSent":false,"reason":"recently_sent","hasInviteLink":false,"role":"TENANT_ADMIN"}  rol-up@
rol-up@example.test   TENANT_ADMIN | mailed_token_valid = t     ← OWNER'ın MEMBER olarak gönderdiği bağlantı artık yönetici yapıyor
rol-down@example.test MEMBER       | mailed_token_valid = t
AuditEvent (bu iki davet için, tamamı):
  invitation.email_sent | crw-owner@example.test | rol-down@
  invitation.email_sent | crw-owner@example.test | rol-up@        ← ADMIN'in değişikliğinden iz yok
```
Ekran görüntüsü: `…/members-admin-reinvite.png`

### 2.4 Eşzamanlı POST (gerçek oturum çerezi, sayfa içinden 2 paralel `fetch`, roller MEMBER ve WRITER)
```
yaris-1 [{"s":200,"sent":true,"link":"62403d9b","role":"MEMBER"},{"s":200,"sent":false,"reason":"recently_sent","link":null,"role":"WRITER"}]
yaris-2 [{"s":200,"sent":true,"link":"019bd6c3",...},{"sent":false,"reason":"recently_sent","link":null,...}]
yaris-3 [{"s":200,"sent":true,"link":"6065493b",...},{"sent":false,"reason":"recently_sent","link":null,...}]
mailpit: her adrese 1 e-posta · yaris-1/2/3 mailed token → WRITER | t
```
Her turda tek e-posta gidiyor, e-postadaki token geçerli kalıyor ve kaybeden istek token'ı yenilemiyor. Son yazanın rolü kalıyor (WRITER). Kazanan davet edenin ekranında ise rol MEMBER görünüyor. Bu durum Ö-1'in eşzamanlı hali.

## 3. Bulgular (önem sırasına göre, hiçbiri bloke etmiyor)

- **Ö-1 (orta, lider kararı): 10 dk içindeki yeniden davet, e-postası gönderilmiş davetin rolünü iz bırakmadan değiştiriyor.** `route.ts:126` (`fc763927`; dev HEAD'de `:128`) `update: keepToken ? { role, expires } : …`
  - Senaryo (§2.3, canlı): OWNER `x@` adresini MEMBER olarak davet ediyor ve e-posta gidiyor. 5 dk içinde bir ADMIN aynı adresi TENANT_ADMIN olarak yeniden davet ediyor. Yanıt `recently_sent` oluyor, e-posta gitmiyor ve **davetlinin elindeki bağlantı artık TENANT_ADMIN veriyor**. Tersi de mümkün: OWNER'ın yönetici daveti sessizce MEMBER'a düşürülebiliyor. `AuditEvent`'te yalnız OWNER'ın gönderim satırı var. Rolü kimin değiştirdiği hiçbir yerde kayıtlı değil. OWNER'ın ekranı hâlâ "MEMBER" diyor.
  - Neden yükseltme değil: ADMIN aynı rolü yeni bir davetle zaten verebilir (`INVITABLE_ROLES` TENANT_ADMIN içeriyor). Kişinin kendi yetkisini aşan bir durum yok.
  - `fc763927` öncesiyle farkı: eskiden 10 dk içinde yapılan yeniden davet token'ı yeniliyordu. OWNER'ın e-postasındaki bağlantı ölüyor, yeni rol ancak ADMIN'in eline verilen bağlantıyla davetliye ulaşabiliyordu, yani açık bir işlem gerekiyordu. Şimdi rol değişikliği davetlinin elindeki bağlantıya sessizce bağlanıyor. Karar metni "role/expires güncellenir" diyor (be-fb §1), yani davranış karara uygun. İz eksikliği ise karardan bağımsız.
  - Öneri (en küçüğü önce): (a) `recently_sent` dalında rol değiştiyse bir `AuditEvent` yazılsın (`type: 'invitation.role_changed'`, `actorId`, `target` = davet id'si, `meta: { from, to }`, adres yok). (b) Lider isterse: `recently_sent` iken rol farklıysa rol değiştirilmesin ve `reason: 'recently_sent_role_unchanged'` dönsün. Arayüz de "10 dk sonra yeniden gönderin" desin. Hangisi seçilirse bir test onu sabitlemeli.
- **Ö-2 (test boşluğu): `recently_sent` ile `daily_limit` arasındaki öncelik sırası sabitlenmemiş.** Y11 (`invitation-mail-policy.ts:69-90`'da iki kontrolün yer değiştirmesi) hayatta kaldı.
  - Senaryo: tenant günlük 50 sınırına ulaşmış ve 50. e-posta 5 dk önce `x@` adresine gitmiş. `x@` yeniden davet ediliyor. Bugünkü sıra `recently_sent` döndürüyor ve token korunuyor, bu doğru. Sıra değişirse `daily_limit` dönüyor, token yenileniyor ve **e-postadaki bağlantı ölüyor**. Ö-1'in (İNCELEME-26) kapattığı hata, bu yoldan fark edilmeden geri gelebilir.
  - Öneri: tek test. Bir SENT satırı (2 dk önce, hedef = davet), üstüne 49 satır daha (1 sa önce) eklenmeli. Yeniden davet `recently_sent` dönmeli ve `tokenIsCurrent(mailed)` true olmalı.
- **Ö-3 (düşük, tasarım): `recently_sent` iken `expires` 7 gün ileri alınıyor, ama bu hiçbir testle sabitlenmemiş.** Y3 hayatta kaldı.
  - Etkisi: e-postada yazan tarih (`until`) gerçek sona erme tarihinden en fazla 10 dk önce kalıyor. Zararsız bir yön (bağlantı daha uzun geçerli), be-fb bunu §1'de yazmış.
  - Öneri: ya korunmalı ya da hiç uzatılmamalı. Uzatılmazsa e-postadaki tarih birebir doğru olur ve e-posta gitmeden yapılan uzatma diye bir durum kalmaz. Hangisi seçilirse test onu sabitlemeli (şu an `>=` her ikisini de kabul ediyor).

### Kapsam dışı (bilgi, bu kartın sorumluluğu değil)
- **K-1:** Az önce dev'e giren `0ae3175b` (TASK-MUN2793A57Z9I) `recently_sent` dalında `acceptedAt`'i sıfırlamıyor. Kabul edilmiş bir davet için 10 dk içinde yeniden davet yapılırsa token korunuyor, `acceptedAt` dolu kalıyor ve bağlantı `used` oluyor. Buna rağmen arayüz "davetli e-postadaki bağlantıyı kullanabilir" diyor. Bugün tetiklenemiyor: kabul üyelik oluşturuyor, üyelik varken route 400 dönüyor ve kodda üyelik silen bir yol yok (`membership.delete*` araması boş). Üye çıkarma özelliği yazıldığında `keepToken` koşuluna `acceptedAt === null` eklenmeli. Bu inceleme o commit'i incelemedi.
- **K-2 (önceden vardı):** Members sayfası "Kurum Sahibi (Owner)" seçeneğini gösteriyor, route ise bunu sessizce MEMBER'a çeviriyor (`route.ts:67`).

## 4. Değişen dosyalar
- `docs/agent-results/TASK-MUN2PP2OKQAZM-crw-fb.md` (bu rapor)
- `docs/agent-results/TASK-MUN2PP2OKQAZM-crw-fb/members-recently-sent-tr.png`, `members-recently-sent-en.png`, `members-admin-reinvite.png`

## 5. Riskler
- Ö-1 çözülene kadar 10 dk içindeki çift davette rol değişikliğinin kim tarafından yapıldığı bilinmiyor. Pilot ölçeğinde düşük risk.
- Ö-2 testi eklenmeden policy'deki iki kontrolün yeri değişirse e-postadaki bağlantının ölmesi fark edilmeden geri gelebilir.

## 6. Açık sorular
1. (Lider) Ö-1: 10 dk içinde yeniden davette rol değişikliği (a) audit satırıyla serbest mi kalsın, yoksa (b) reddedilsin mi?

## 7. Sonraki adım
- be-fb: Ö-2 testi; Ö-1 için lider kararına göre (a) ya da (b); Ö-3 için bir seçim ve test.
- cs-fb / TASK-MUN2793A57Z9I incelemesi: K-1 not edilmeli. Bu senaryo (iki tıklama, sonra ilk e-postadaki bağlantıyla kabul) artık kabul sayfası olduğu için uçtan uca koşulabilir.

## 8. Temizlik
Hepsi kapatıldı ya da silindi: dev sunucum (:3332, yalnız cwd'si benim worktree'm olan pid öldürüldü, `lsof` → 0), `crwfb-mun2pp-mailpit` konteyneri, `crwfb_mun2pp` DB'si (`drop … with (force)`), worktree (`git worktree remove`). Paylaşılan `fabrika` DB'si, :3000 ve ana ağaçtaki başka ajanların dosyaları (`FON_BRIDGE.md`, `tests/action-missing-id.live.test.ts`, `TASK-MUN26P5IDKGST-crw-fb.md`) olduğu gibi bırakıldı.

## 9. Not: sonuç yolu
Görev sarmalayıcısı ikinci bir yol verdi: `/Users/macbook/alan/docs/agent-results/TASK-MUN23OJ8L9DV0-be-fb.md`. Bu yol başka bir ajanın (be-fb) rapor adı ve git reposu olmayan bir dizinde duruyor. Görev metnindeki **SONUÇ DOSYASI** yolu esas alındı. be-fb'nin raporunun üzerine ya da onun adıyla bir dosya yazılmadı.

**Platform beyanı:** mac (Darwin 27, zsh, Docker Desktop, Postgres @5433, Node 26 + pnpm 11, system Chrome/Playwright). Windows ve Linux'ta koşulmadı, çünkü bu makinede yalnız macOS var. Koddan bakıldığında incelenen yollar platformdan bağımsız: Prisma upsert, `pg_advisory_xact_lock`, SHA-256 (`node:crypto`), WHATWG `URL`, React istemci metni. Süreç öldürme, dosya yolu, kabuk ya da ikili adı kullanımı yok.
