# TASK-MUNWZA26VGK0B — FB TAKİP (İNCELEME-68 Y-1/Ö-1/Ö-2): davet kabulünde kiracıya yeniden bağlama

**Durum:** TAMAM · **Ajan:** be-fb · **Tarih:** 30.09.2026
**Dal:** `be-fb/munwza-tenant-rebind`. Kod ve testler `113ca7e1`, dev'in dala merge'ü `c4ca33b1`. Taban dev `1e6e59d8`, merge anında dev `e3304a81`.
**Kaynak bulgu:** `docs/agent-results/TASK-MUNT2439LF7AP-crw-fb.md`: Y-1 (satır 82), Ö-1/M9 (satır 66, 101), Ö-2 (satır 27, 104).
**Platform beyanı:** Doğrulama **mac** üzerinde yapıldı (Darwin 27, arm64). Kullanılan ortam: izole Postgres `befbwz-pg` (`127.0.0.1:55491`, pgvector:pg16), dalın dev sunucusu `:3491`, Chrome (`@playwright/test`, `channel: 'chrome'`). Paylaşılan `fabrika` :5433'e **yazılmadı**. Değişen kod platforma bağlı değil: jwt callback, server action, sayfa yönlendirmesi ve pg hata mesajı eşleşmesi süreç, dosya yolu ya da kabuk kullanmıyor. Bu yüzden Windows ve Linux'ta davranış aynı olur. Windows ve Linux'ta **koşulamadı**, çünkü bu makinede yalnız macOS var. CI (ubuntu) aynı vitest takımını koşuyor.

## 1. Ne yapıldı

### Y-1: iki parçalı düzeltme (seçim ve gerekçesi)
Kartta iki seçenek vardı. **İkisi birlikte yapıldı**, çünkü farklı kullanıcıları kapsıyorlar:

1. **Davet kabulü token'ı açıkça yeni kiracıya bağlıyor (asıl düzeltme).** `acceptInvitationAction` üyelik yazıldıktan sonra `unstable_update({ tenantId })` çağırıyor. Bu çağrı jwt callback'i `trigger: "update"` ile tetikliyor. Callback isteği **yalnız DB'de o kiracıda üyelik varsa** uyguluyor: tek Prisma çağrısıyla istenen ve bağlı kiracıyı `tenantId IN (istenen, bağlı)` ile okuyor. İstenen kiracı varsa ona bağlanıyor. Yoksa bağ olduğu yerde kalıyor.
   - *Neden "sessiz geçiş" değil:* Bağı taşıyan tek şey kullanıcının "Daveti kabul et" düğmesine basması. Yönlendirme zaten o kiracının paneline gidiyor. Düz isteklerde bir değişiklik yok: yalnız bağlı kiracı okunuyor, B'ye kendiliğinden geçiş hâlâ yok (mutant R6 ve canlı `[2]`).
   - *Güvenlik:* Tarayıcı da `useSession().update({ tenantId })` ile aynı POST'u atabilir (Auth.js CSRF korumalı). Bu, kullanıcıya zaten üyesi olduğu kiracılar arasında geçiş imkânı verir, yeni yetki vermez. Üye olmadığı bir kiracı istenirse token olduğu yerde kalır (canlı test "a browser asking…", mutantlar R5 ve R7).
   - *Hâlâ üyesi olduğu A varken C'yi kabul:* Oturum C'ye geçiyor. Kullanıcının az önce seçtiği kiracı bu ve yönlendirme de oraya gidiyor. Önceki davranışta C panelini açıp A verisini gösteriyordu.
2. **Kiracısız oturumda panel `/no-workspace`'e gönderiyor.** Önceden rol kontrolü önce yapılıyordu, kiracısız oturumun rolü de `null` olduğu için ekranda "Erişim Reddedildi — Pipeline Yöneticisi gerekli" çıkıyordu. Artık kiracı kontrolü önce yapılıyor ve diğer kiracı sayfalarının (`requireTenantPage`) kullandığı "Henüz bir çalışma alanınız yok / Tekrar giriş yap" ekranı gösteriyor. Bu, daveti hiç kabul etmeyen çıkarılmış kullanıcıyı ve ikinci cihazı da kapsıyor (aşağıda).

### Ö-1: `delete token.workspaceIds` testle korunuyor
"removed member" testi ve "no database" testi artık `workspaceIds`'in silindiğini doğruluyor. Oturumda da `[]` bekleniyor. M9 mutantı artık **kırmızı** (önceden 18/18 yeşildi).

### Ö-2: 20 paralel istekte tek kiracısız yanıtın nedeni ve düzeltmesi
- **Neden:** `src/lib/db.ts` havuzunda `connectionTimeoutMillis: 1000` ve `idleTimeoutMillis: 5000` var. 5 saniyeden uzun boşta kalan havuz bağlantılarını kapatıyor. Sonraki patlama birkaç yeni bağlantıyı aynı anda açıyor. Yüklü makinede biri 1 saniyede el sıkışmayı bitiremiyor. pg `Connection terminated due to connection timeout` hatasını fırlatıyor, jwt callback'in `catch`'i o istek için kiracı vermiyor. crw-fb'nin dev.log'daki hata metni bu. Önceden token DB'ye sorulmadan kiracıyı taşıdığı için görünmüyordu (Y-2 sonrası her istek DB'ye soruyor).
- **Kanıt:** Yüksüz makinede HTTP ile 120 istekte kiracısız yanıt **0** çıktı, yani kendiliğinden tekrar etmiyor. Mekanizma deterministik olarak üretildi: `befbwz-pg` önüne her 4. yeni bağlantının ilk baytlarını 1300 ms tutan bir TCP proxy'si kondu. Aynı hata ve aynı sonuç çıktı (düzeltme öncesi 60 istekte 7 kiracısız).
- **Düzeltme (dar kapsamlı):** Jwt'deki üyelik okuması **yalnız bu iki "bağlantı açılamadı" hatasında** (pg ve pg-pool mesajları) bir kez yeniden deneniyor. Sorgu hatası yeniden denenmiyor. İkinci deneme de başarısız olursa istek fail-closed kalıyor (kiracısız, bağ korunuyor). Havuz ayarı (`db.ts`) tüm uygulamayı etkilediği için değiştirilmedi. Bkz. §4.

## 2. Kanıt

### crw-fb senaryo 10'un canlı tekrarı (gerçek HTTP ve Chrome, `:3491`, `ekler/scenario10-live.txt`)
```
[1] signed in (A oldest)        : tenant=wz-a role=TENANT_OWNER
[2] removed from A (B kept)     : tenant=None role=None                      ← B'ye sessiz geçiş yok (Y-2 korunuyor)
[3] invited to C (PIPELINE_MANAGER), token parked for the browser
[B1] tenantless /tr/default/dashboard -> 200 http://localhost:3491/tr/no-workspace | session {"tenantId":null,"role":null}
     text: 🔑 Henüz bir çalışma alanınız yok …                                 ← önceden "Erişim Reddedildi"
     cookie dialog buttons: ["Gerekli Çerezler","Tümünü Kabul Et"]
[B2] accept screen -> http://localhost:3491/tr/accept-invite/continue | token in URL? false
[B3] after "Kabul Et" -> http://localhost:3491/tr/default/dashboard | session {"tenantId":"wz-c","role":"PIPELINE_MANAGER"}
     text: ÇALIŞMA ALANI Panel Çağrılar … Wz Kullanıcı Panel Gerçek zamanlı ölçümler ve eğilimler …
[B4] reload, same browser  | session {"tenantId":"wz-c","role":"PIPELINE_MANAGER"}
DB: wz-b|TENANT_OWNER · wz-c|PIPELINE_MANAGER · Invitation.acceptedAt set · AuditEvent invitation.accepted
--- old curl jar (other device, never accepted): None None
```
Tarayıcı kareleri: `ekler/shot-1-tenantless-no-workspace.png` (kiracısız panel artık "çalışma alanınız yok" ekranı), `ekler/shot-2-accept-screen.png`, `ekler/shot-3-after-accept-dashboard-C.png` (kabulden hemen sonra, **yeniden giriş yapmadan**, C'nin paneli).

### Canlı vitest (gerçek `auth()` ve gerçek `acceptInvitationAction`, izole DB, `ekler/live-test-green.txt`)
```
Y1_REBIND {"stranded":{"tenantA":false,"tenantB":false,"tenantId":null,"role":null},"accepted":"throw:NEXT_REDIRECT;replace;/tr/default/dashboard;307;","joined":{"c":true,"role":"WRITER"},"again":true}
 ✓ removed from the bound tenant, accepting C makes the very next request C, with the same browser
 ✓ still a member of A, accepting C moves the session to C too: it is the tenant just chosen
 ✓ a browser asking to be bound to a tenant it is not in stays where it was
```

### Ö-2 ölçümü (`ekler/o2-*.txt`, proxy `ekler/slowproxy.cjs.txt`, koşu `ekler/o2-burst.test.ts.txt`)
```
HTTP, yüksüz, 7 sn boşluk + 20 paralel ×6 tur (düzeltme öncesi): 120/120 wz-b, 0 kiracısız
proxy her 4. bağlantı 1300 ms, düzeltme ÖNCESİ:
  O2 round 1: {"undefined":3,"wz-b":17}  round 2: {"wz-b":19,"undefined":1}  round 3: {"wz-b":17,"undefined":3}
  O2 warnings: 7 ["[Auth.jwt] membership lookup failed, session stays tenantless: Connection terminated due to connection timeout"]
aynı proxy, düzeltme SONRASI:  round 1-3: {"wz-b":20} ×3, warnings: 0
proxy HER bağlantı 1300 ms (fail-closed kontrolü): {"undefined":20}, "…timeout exceeded when trying to connect" ×20
HTTP, düzeltme sonrası 3 tur: 20 wz-b ×3
```

### Mutantlar (`ekler/mutants.py.txt`, `ekler/mutants-out.txt`; 3 dosya, 33 test)
| Mutant | Sonuç |
|---|---|
| M9 `delete token.workspaceIds` kaldır (Ö-1) | 2 kırmızı ✅ (önce yaşıyordu) |
| R1 kabulde `unstable_update` yok | 2 kırmızı ✅ |
| R2 update isteği yok sayılır | 5 kırmızı ✅ |
| R3 istenen tercih edilmez (ilk satır) | 2 kırmızı ✅ |
| R4 `take` hep 1 | 2 kırmızı ✅ |
| R5 üyelik yoksa da istenene bağla | 1 kırmızı ✅ |
| R6 trigger kontrolü yok (her istekte istenen) | 1 kırmızı ✅ |
| R7 bağ yedeği yok (yalnız istenen sorgulanır) | 2 kırmızı ✅ |
| D1 panel eski sıra (rol önce) | 1 kırmızı ✅ |
| O1 yeniden deneme yok | 3 kırmızı ✅ |
| O2 her hatada yeniden dene | 1 kırmızı ✅ |
| O3 pool kuyruk mesajı eşleşmez | 1 kırmızı ✅ |

12/12 kırmızı. Her mutanttan sonra dosya geri yazıldı ve testler yeniden yeşil koştu (33/33).

### Kapılar (dev'in merge edildiği ağaç `c4ca33b1`)
```
npx tsc --noEmit                 → exit 0
pnpm lint                        → exit 0
npx tsx scripts/i18n-check.ts    → ✅ i18n check passed … exit 0
npx vitest run (tam)             → Test Files 278 passed | 6 skipped (284) · Tests 3359 passed | 81 skipped (3440) · exit 0
pnpm build                       → exit 0 (i18n ratchet dahil)
```
Atlananlar: `check-live-skips` 22 izinli atlama raporluyor (S3/MinIO, gerçek OpenAI). 48 test yerelde **bilerek** atlanıyor, çünkü DB adı `fabrika` ve `CI` yok (`SHARED` koruması, paylaşılan DB'de tarihe göre silme yapmasın diye). Benim DB'm izole bir konteyner olduğu için bu 5 dosya `CI=true` ile ayrıca koşuldu: **`Tests 53 passed | 1 skipped (54)`**. Kalan tek atlama gerçek OpenAI testi (izinli). CI'da hepsi koşuyor.

## 3. Değişen dosyalar
- `src/lib/auth.ts`: jwt'de `trigger: "update"` ile yeniden bağlama (`requestedTenantOf`, tek sorguda istenen+bağlı), `retryOnceIfNotConnected`, `unstable_update` export'u
- `src/app/[locale]/accept-invite/continue/actions.ts`: kabul sonrası `unstable_update({ tenantId })`. Hata kabulü bozmuyor, yalnız hata adı loglanıyor.
- `src/app/[locale]/(app)/[workspace]/dashboard/page.tsx`: kiracısız → `/no-workspace` (rol kontrolünden önce). `/panel` aynı bileşeni kullanıyor.
- `src/lib/auth-callbacks.test.ts`: Ö-1 beklentileri, 5 yeniden bağlama testi, 4 yeniden deneme testi (25 test)
- `tests/auth-jwt-membership-refresh.live.test.ts`: çerez kavanozu Map oldu (sunucunun yazdığı çerez geri gidiyor), 3 canlı yeniden bağlama testi
- `tests/dashboard-tenantless.test.ts` (yeni): kiracısız / düşük rol / yeterli rol
- `docs/agent-results/TASK-MUNWZA26VGK0B-be-fb.md` ve `…-ekler/` (kanıtlar)

## 4. Riskler
- **İkinci cihaz:** Kabul hangi tarayıcıda yapıldıysa o oturum taşınıyor. Aynı kullanıcının başka cihazdaki oturumu eski bağda (kiracısız) kalıyor ve artık "çalışma alanınız yok / tekrar giriş yap" ekranını görüyor (canlı: `old curl jar … None None`). Yeniden giriş en eski üyeliği seçiyor. Bilerek böyle bırakıldı: o cihazda kullanıcı bir seçim yapmadı.
- **Kiracı değiştirme yüzeyi:** `POST /api/auth/session` ile gelen `{ tenantId }` artık kullanıcının üyesi olduğu kiracılar arasında geçiş yapabiliyor. Bu yeni yetki değil, ama UI'da henüz bir kiracı seçici yok. İleride biri eklenirse aynı yolu kullanabilir.
- **Ö-2 yeniden denemesi:** Hata mesajı metnine bağlı (pg 8 ve pg-pool). Kütüphane mesajı değişirse yeniden deneme sessizce devre dışı kalır ama davranış fail-closed kalır (O3 mutantı mesaj eşleşmesini koruyor). Etkilenen istekte gecikme en fazla +1 sn.
- `db.ts`'deki `connectionTimeoutMillis: 1000` ("dev'de hızlı fallback" yorumu) prod için kısa olabilir. Tüm sorguları etkilediği için bu kartta değiştirilmedi.
- `Dashboard.sessionErrorTitle/Body` i18n anahtarları artık kullanılmıyor. i18n kontrolü kullanılmayan anahtarı hata saymıyor, katalog temizliğine bırakıldı.

## 5. Açık sorular
- Prod havuzunda `connectionTimeoutMillis` ayrı bir kartla yükseltilsin mi (örneğin 5 sn, `db.ts`, tüm sorgular)? Önerim: prod bağlantı gecikmesi ölçülene kadar bu kartın tek yeniden denemesi yeterli.

## 6. Sonraki adım
- crw-fb incelemesi: `be-fb/munwza-tenant-rebind` (`113ca7e1` + merge `c4ca33b1`). Dev'e merge edildi, push yok.
- (İsteğe bağlı kart) Kiracı seçici UI'ı aynı `unstable_update` yolunu kullanabilir.
