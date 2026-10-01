Hüküm: PİLOTA KOŞULLU HAZIR — B bulgusu yok; 4 Y bulgusu pilot başlamadan kapatılmalı (en önemlileri Y-1 "davetle katılan üye ilk ekranda Erişim Reddedildi görüyor" ve Y-2 "eşzamanlı davetle 6 koltuk sınırı aşılıyor"), 11 Ö bulgusu.

# TASK-MUOLBPFFDC92B — FB QA: İlkadım pilotunun öncelikli yüzeyleri, uçtan uca (qae-fb)

- **Kod:** FONBRIDGE `dev` @ `6168360b`. Scratchpad'de ayrı worktree kuruldu. Ana checkout'ta hiçbir şey çalıştırılmadı, kod değiştirilmedi, push yapılmadı.
- **Ortam:** İzole Postgres `pgvector/pgvector:pg16` → `127.0.0.1:55871` (:5433'e dokunulmadı). CI sırası uygulandı: şema (`migrate diff` → psql, Prisma 7 db push onay kapısı yerine) → `db:rls-role` → `apply-migrations.sh` ×2 ("41 files applied" ×2) → `db:rls` (28 → 112 politika) → `db:generate` → `db:seed`.
- **Uygulama:** `pnpm build` + `next start -p 3871`, prod modunda. `DEMO_LOGIN_ENABLED=false`, yani demo girişi kullanılmadı.
- **Tarayıcı:** Gerçek Google Chrome (`@playwright/test` `chromium.launch({channel:'chrome'})`); bütün tıklama ve yazmalar bu tarayıcıda yapıldı.
- **Oturum:** Google OAuth yerelde tamamlanamadığı için oturum çerezi `next-auth/jwt encode` ile üretildi. İçinde yalnız `{id,email,name}` var. Kiracı ve rol, uygulamanın kendi `jwt` geri çağrısında veritabanından okunuyor.
- **Temizlik:** Bitince yalnız kendi sunucum (pid'i worktree cwd'siyle doğrulanarak), `qaefb-pg` konteynerim ve worktree'm kaldırıldı.

## 1. Ne yapıldı

**Fikstür**
- `İlkadım Belediyesi QA` kiracısı (MUNICIPALITY): sahibi `owner@ilkadim.test`. Davet edilecek hesaplar `u1…u6@ilkadim.test`. Yanlış hesap: `yanlis@baska.test`.
- Ajans kiracısı: `Orta Karadeniz Kalkınma Ajansı QA` (AGENCY).
- Pilot SQL ile konmadı. Platform yöneticisi (`admin@…`, isPlatformAdmin) **yönetici panelinden** atadı: `/admin/billing/plans` → "Pilot ata".

**Koşulan akışlar (hepsi gerçek tarayıcıda)**

| # | Akış | Sonuç |
|---|------|-------|
| 1 | Yönetici pilot atar (çift tıklama) | ✅ Tek `billing.pilot.granted` yazıldı. `TRIALING/public-team/pilot`, son gün 29 Aralık 2026 (90 gün) |
| 2 | Sahip davet oluşturur: boş form, `a@b`, çift tıklama, 5 davet | ✅ Boş formda tarayıcı doğrulaması çalıştı (istek gitmedi). `a@b` sunucuda 400 aldı. Çift tıklama tek POST gönderdi. Bağlantı ekranda gösterildi (SMTP yok) |
| 3 | 7. kişi (sahip + 5 bekleyen = 6) | ✅ 403 `SEAT_LIMIT_REACHED`. tr, en ve 360 px'te denendi. ⚠ Mesaj için Ö-1'e bakın |
| 4 | Son boş koltuğa eşzamanlı davetler | ❌ **Y-2**: sınır aşıldı |
| 5 | Geçerli davet: anonim (tr/en/360/390), u1 hesabıyla kabul (çift tıklama) | ✅ Kabul tek sefer yazıldı, oturum kiracıya geçti. ❌ **Y-1**: açılan ilk ekran "Erişim Reddedildi" |
| 6 | Kabulden sonra geri tuşu, yenileme, aynı bağlantıyı tekrar açma | ✅ Tekrar açınca panele yönlendiriyor. ⚠ Geri tuşunda Ö-5 |
| 7 | Kullanılmış bağlantı: başka hesap ve anonim | ✅ "Bu davet zaten kullanıldı" |
| 8 | Yanlış e-posta (u3'ün bağlantısı yanlis@ ile açıldı) | ✅ "başka bir adrese gönderildi". Adres maskeli (`u***@ilkadim.test`), kabul düğmesi yok, "Çıkış yap ve hesap değiştir" var |
| 9 | Süresi dolmuş davet (u4, `expires` geçmişe çekildi) | ✅ "Davetin süresi doldu" |
| 10 | Bozuk, boş ya da hiç token | ✅ "Davet bağlantısı geçersiz". 303 ile token URL'den silindi, `/continue` sayfasına gidildi |
| 11 | Başka kiracının üyesi (alice@, demo-tenant) PIPELINE_MANAGER olarak kabul eder | ✅ Oturum yeni kiracıya taşındı, pilot bandı göründü |
| 12 | Yeniden davet (bekleyen adres) | ✅ Yeni koltuk tutmadı, token döndü (eski bağlantı geçersiz) |
| 13 | MEMBER davet göndermeye çalışır | ✅ Sunucu 403 döndü. ⚠ Form yine de gösteriliyor (Ö-10) |
| 14 | **Pilot süresi dolmuş** (`trialEndsAt` = şimdi − 1 saat) | ✅ Amber bant çıktı. Davet sunucuda reddedildi ("Pilot süresi doldu, düzenleme kapalı"). Modül "Etkinleştir" düğmesi devre dışı. u3'ün geçerli bağlantısı "salt-okunur, yeni üye eklenemiyor" kartı gösterdi. Okuma (konsept notları, faturalama) çalışıyor. ❌ Profil sayfası "başarıyla güncellendi" dedi (Y-4) |
| 15 | Yönetici 90 gün uzatır (kutusuz "Ata" + kutulu çift tıklama) | ✅ Tek `billing.pilot.extended` yazıldı, yazma geri geldi, bant indigo oldu. ⚠ Ö-7 |
| 16 | **Karne** `/tr/fon-hazirlik`, `/en/funding-readiness`: boş başlat, cevapsız "İleri", hepsi en düşük (0/100), hepsi en yüksek (100/100), 360 ve 390 px, paylaşım URL'sini kurcalama, iletişim formu (boş, 400 karakter, bozuk e-posta, çift tıklama) | ✅ Doğrulamalar çalışıyor. Yatay taşma yok. Kurcalanmış URL güvenli biçimde başa dönüyor (`il=<script>` atıldı). maxLength 120/254/200/80 uygulanıyor. Çift tıklamada tek POST gidiyor. `PublicLead` satırı yazıldı (tr+en). ⚠ Ö-4 (geri tuşu) |
| 17 | **Radar** `/tr/belediye-cagrilari`, `/en/municipal-calls`: boş veri, dolu veri (6 çağrı, biri 6×100 karakter başlıklı), `orgType` kurcalama, 360 ve 390 px | ✅ Boş durum metni doğru. Dolu veride 4 açık/yakında çağrı ve 1 yakında kapanan var. Türkiye'nin giremediği ülke listeli çağrı süzüldü. Uzun başlık kırılıyor, taşma yok. `<img>` parametresi zararsız |
| 18 | **B1 ajans davet kodu**: ajans panelinden kod üretimi (geçmiş tarih, 80+ karakter etiket, çift tıklama), `/tr/kayit?kod=…` (geçerli, tr/en/360/390, bilinmeyen kod, `<b>x</b>`), Google düğmesi (onaysız ve onaylı) | ✅ Geçmiş tarih tarayıcıda engellendi. Çift tıklama tek kod üretti. Etiket 80 karakterle sınırlı. Afiş metni kaçışlı. Onaysız Google tıklaması engellendi. Onaylı tıklama Google'a yönlendirdi (`fabrika_registration_invite` çerezi kondu). ⚠ Ö-8. Google dönüşü koşulamadı (§5) |
| 19 | Mobil 360/390: panel, üyeler, modüller, kabul kartları, karne, radar, ajans | ✅ Sayfa düzeyinde yatay kaydırma yok (ajans tablosu ve modül sekmeleri kendi kutularında kayıyor). Davet düğmesinin üstünde örtü yok |

## 2. Bulgular

Önem dereceleri: **B** = pilotu engeller / veri kaybı / güvenlik · **Y** = pilot öncesi düzeltilmeli · **Ö** = düşük.

### Y-1 — Davetle katılan MEMBER/WRITER ilk ekranda "Erişim Reddedildi" görüyor
- **Adımlar:**
  1. Sahip, varsayılan rolle (Üye) `u1@` adresini davet eder.
  2. u1 bağlantıyı açar ve "Daveti kabul et"e basar.
- **Beklenen:** Yeni üye çalışma alanının giriş ekranına iner.
- **Gözlenen:** Yönlendirme `/tr/default/dashboard`'a gidiyor. Ekranda "Erişim Reddedildi — Bu sayfayı görmek için Pipeline Yöneticisi veya daha yüksek izne ihtiyacınız var." yazıyor. Kanıt: `12-accept-u1-landed.png`.
  - Kabul akışının hedefi sabit: `continue/actions.ts` `workspacePath()` = `/default/dashboard`. Kodun yorumuna göre giriş ekranının varsayılanı da bu adres.
  - Panel `can(role,'evaluate_gates')` ister (`dashboard/page.tsx:65`). Bu yüzden MEMBER ve WRITER her girişte aynı ekrana düşer.
- **Etki:** Pilotta 6 kişiden 5'i büyük olasılıkla Üye ya da Yazar olacak. İlk izlenimleri "davet çalışmadı" olur. Ö-2 ile birleşince sahip "Kurum Sahibi" seçse bile kişi MEMBER olarak bu ekrana düşer.

### Y-2 — Eşzamanlı davetlerle koltuk sınırı aşılıyor (6 koltuklu kiracıda 8, sonra 10 koltuk)
- **Adımlar:** Sahibin oturumunda 1 koltuk boşken `POST /api/invitations` isteğini farklı adreslerle aynı anda N kez gönder. Bu, iki sekme ya da sahip ile TENANT_ADMIN'in aynı anda çalışmasıyla olur.
- **Beklenen:** Yalnız 1 istek 200 dönmeli, gerisi 403 `SEAT_LIMIT_REACHED` almalı.
- **Gözlenen:**
  - Koşu 1: 4 istekten **3'ü 200** döndü → 1 üye + 7 bekleyen davet = 8/6.
  - Koşu 2: 6 istekten **5'i 200** döndü → 3 üye + 7 bekleyen davet = 10/6.
  - Kanıt: `qa-kosu.log` "S3 race" satırları ve iki DB sayımı (§3).
- **Kök neden (kod okuması):**
  - `readSeatUsage` (`seat-limit.ts`) sayımı kilitsiz ve READ COMMITTED altında yapıyor. Eşzamanlı işlemler birbirinin yazmadığı satırları görmüyor.
  - Kiracı kilidi `lockInvitationMail` yalnız SMTP ve uygulama URL'si tanımlıyken alınıyor (`api/invitations/route.ts`, `if (mailer && mailBaseUrl)`). SMTP'li prod'da da sayım bu kilitten **önce** yapılıyor.
  - Kabul adımı (`acceptInvitation`) koltuğu yeniden kontrol etmiyor. Bu yüzden fazladan davetlerin hepsi üyeye dönüşebilir.
- **Etki:** Sözleşmedeki koltuk sayısı (B11: 2/6/15) aşılabiliyor.

### Y-3 — Üye ve davet yönetimi yok: bekleyen davet iptal edilemiyor, üye çıkarılamıyor, liste görünmüyor
- **Adımlar:** `/tr/default/settings/members`.
- **Gözlenen:**
  - "Aktif Ekip Üyeleri" bölümünde yalnız yer tutucu metin var: "…bu bölümde görüntülenecektir." Kanıt: `80-mobile-members-360.png`.
  - Kodda davet iptal ya da üye çıkarma ucu yok. `invitation.delete` yalnız süresi dolanları silen `retention.ts`'te geçiyor. `membership.delete` hiç yok.
- **Etki:**
  - Yanlış yazılmış bir adrese giden davet 7 gün boyunca 1 koltuk tutar (6 koltukta %17).
  - Yanlış kişi kabul ederse koltuk kalıcı gider. Sahip bunu arayüzden düzeltemez, platform ekibinin veritabanına dokunması gerekir.
  - Sahip kimin katıldığını da göremez. Pilot planı §4 hafta 1 hedefi "6 aktif hesap". Tek bir yazım hatası bu hedefi 7 gün geciktirir.

### Y-4 — "Kurumsal Profil" kaydı sahte: sunucuya gitmiyor, her durumda "başarıyla güncellendi" diyor
- **Adımlar:**
  1. `/tr/default/settings/profile` sayfasında metni değiştir, "Profili Kaydet"e bas.
  2. Sayfayı yenile.
- **Beklenen:** Değişiklik kalıcı olmalı; salt-okunur pilotta reddedilmeli.
- **Gözlenen:**
  - Kaydetme sırasında **0 POST** gitti, yeşil başarı kutusu çıktı (`42-profile-fake-success.png`).
  - Yenileyince metin "Yapay zeka algoritmaları… Horizon Europe Cluster 4" varsayılanına döndü (`43-profile-after-reload-lost.png`).
  - Süresi dolmuş pilotta da aynı başarı mesajı çıkıyor. Amber "düzenleme kapalı" bandıyla çelişiyor (koşu kaydı `S7[expired]`).
- **Kaynak:** `settings/profile/page.tsx` `handleSave` → `// Mock save and vector embedding generation`.
- **Etki:** Belediye ekibi yetkinliklerini yazıp kaydettiğini sanır, veri kaybolur. Varsayılan içerik de belediyeye uymuyor ("Robotics, TRL 6").

### Ö-1 — Koltuk sınırı ve diğer davet hataları pilota uymuyor ve EN'de Türkçe
- Metin: "…Yeni davet için koltuk ekleyin ya da **planınızı yükseltin**." Pilotta satın alma ve yükseltme kapalı (ADR-0007 m.5).
- `/en/...` sayfasında da aynı Türkçe cümle çıkıyor ("Error: Planınızın koltuk sınırına…"). Kanıt: `06-invite-7th-seat-refused-en-1280.png`.
- Geçersiz e-posta ve yetki hataları da Türkçe. Yalnız `PILOT_EXPIRED` koda göre çevriliyor.

### Ö-2 — Rol listesi "Kurum Sahibi (Owner)" sunuyor, sunucu sessizce MEMBER yazıyor
- u1 "Kurum Sahibi" seçilerek davet edildi. DB'de `role = MEMBER` (§3).
- Başarı mesajı rolün değiştiğini söylemiyor. Y-1 ile birleşince kişi "Erişim Reddedildi" ekranına iner.

### Ö-3 — Modül "Etkinleştir" çift tıklamada iki kez çalışıyor
- İki `module.state.changed ON` audit satırı yazıldı ve iki "aktifleştirildi" bildirimi çıktı.
- Sayaç "Aktif Modüller 2 / 11" gösteriyor ama DB'de tek M2 satırı var (`21-modules-m2-enabled.png`). Yenileyince 1'e dönüyor.
- Neden: `client.tsx` `isActive` değerini eski state'ten okuyor, düğme `pending` iken kapanmıyor.

### Ö-4 — Karnede tarayıcı geri tuşu ya da yenileme bütün cevapları siliyor
- Adım 2'de geri tuşu sayfadan çıkarıyor. İleri tuşu giriş ekranına dönüyor, cevaplar kayboluyor (`51-karne-back-midflow.png`).
- Adımlar history'ye yazılmıyor. Android'deki geri hareketi 15 soruluk formu sıfırlıyor.

### Ö-5 — Kabulden sonra geri tuşu "Davet bağlantısı geçersiz" gösteriyor
- Az önce katılan kişiye "bağlantı tanınmadı, yeni davet isteyin" deniyor (`13-accept-u1-back-reload.png`).
- Neden: çerez temizlenmiş.
- Daveti yeniden açmak doğru yönlendiriyor. Sorun yalnız geri tuşunda.

### Ö-6 — Faturalama sayfası koltukları farklı sayıyor; plan adı ham, "PİLOT BİTTİ" rozeti yeşil
- Sayfa "Kullanıcı koltukları 3 / 6" gösteriyor. Aynı anda davet "6 koltuk: 3 üye, 3 bekleyen davet" ile reddediliyor (`40-…`, `41-…`). Bekleyen davetler sayılmıyor.
- Plan adı "PUBLİC-TEAM" olarak görünüyor: ham kimlik, Türkçe büyük harfe çevrilmiş. "Belediye Ekip" olmalı.
- Süresi dolmuş pilotta "PİLOT BİTTİ" rozeti yeşil (`35-expired-billing.png`).

### Ö-7 — Süresi dolmuş pilotta "Ata" (uzat kutusu işaretsiz) yeni bir 90 gün başlatıyor, audit'e `granted` yazılıyor
- ADR'ye göre bu bir uzatma. Denetim izinde `billing.pilot.extended` görünmeli.
- Ardından kutulu uzatma, dönemi bir 90 gün daha ileri taşıdı (29.03.2027). Bu kısım beklenen davranış.

### Ö-8 — Bilinmeyen ya da biçimi bozuk ajans kodu kayıt ekranında hata vermiyor
- `?kod=ZZZZ-ZZZZ-ZZZZ` ve `?kod=<b>x</b>` için afiş "Bir kalkınma ajansının davet koduyla kayıt oluyorsunuz" diyor (`74-kayit-kod-garbage.png`) ve kullanıcıyı Google'a gönderiyor.
- Ret ancak Google dönüşünde gelir (`invite_invalid`).
- `normalizeInviteCode` biçimi istemcide de denetleyebilir; en azından biçimi bozuk kod erkenden reddedilebilir.

### Ö-9 — "Geri bildirim" yüzen düğmesi 1280×900'de M2 "Etkinleştir" düğmesini örtüyor
- `elementFromPoint` ile ölçüldü: `covered-by: Geri bildirim` (`20-modules-pilot-active.png`).
- Sayfa kaydırılınca açılıyor.

### Ö-10 — Davet formu yapamayacak kişilere de açık görünüyor
- MEMBER ve süresi dolmuş pilot için form etkin. Ret ancak gönderince geliyor (`44-member-invite-form-403.png`, `32-expired-invite.png`).
- Sunucu tarafı doğru.

### Ö-11 — Konsept Notları sayfası `/tr` altında İngilizce
- "Concept Notes / Available Templates / Your Notes / No concept notes yet." Kanıt: `22-concept-notes-list.png`.

**Bulgu değil, not:**
- Radar, Türkiye'nin katılamadığı CERV Town-Twinning çağrısını "açık çağrılar" arasında gösteriyor. Kartta kırmızı "Türkiye bu programa katılmıyor" rozeti ve açıklama var (`60-radar-full-tr-1280.png`). Tasarım gereği görünüyor. "Belediyeniz hangi çağrıya girebilir?" başlığıyla birlikte okununca yanıltıcı olabilir, ürün kararı.
- Davet bağlantısının `https://fonbridge.com/...` ile üretilmesi yerel ortamdan kaynaklanıyor (prod modunda `NEXT_PUBLIC_APP_URL=localhost`). Testte adres `localhost:3871`'e çevrildi.

## 3. Kanıt (kopyalanmış çıktı)

Tam koşu günlüğü: `TASK-MUOLBPFFDC92B-qae-fb-ekler/qa-kosu.log` (token'lar gizlendi). 74 ekran görüntüsü aynı klasörde.

```
S1 notice Pilot atandı.            | tenantId=qa-ilk status=TRIALING planId=public-team provider=pilot trialEndsAt=2026-12-29 21:00
S2 u1 (owner role, dblclick) POSTs: 1   → DB: u1@ilkadim.test | MEMBER
S2b 7th tr@1280 role=alert -> Hata: Planınızın koltuk sınırına ulaşıldı (6 koltuk: 1 üye, 5 bekleyen davet). Yeni davet için koltuk ekleyin ya da planınızı yükseltin.
S2b 7th en@1280 role=alert -> Error: Planınızın koltuk sınırına ulaşıldı (6 koltuk: 1 üye, 5 bekleyen davet)...
S3 race [race1:200, race2:200, race3:200, race4:403 SEAT_LIMIT_REACHED]   → pending=7 members=1  (limit 6)
S3 race [r2a..r2e:200 ×5, r2f:403]                                         → members=3 pending=7   (limit 6)
S4 [u1-valid] after accept url: http://localhost:3871/tr/default/dashboard     (ekran: "Erişim Reddedildi")
S4 [u1-valid] after BACK: /tr/accept-invite/continue | Davet bağlantısı geçersiz ...
S4 [used-by-u2] Bu davet zaten kullanıldı ...
S4 [wrong-email] Davet u***@ilkadim.test adresine gönderildi, siz ise yanlis@baska.test ile giriş yaptınız ...
S4 [expired-u4] Davetin süresi doldu Davet bağlantıları 7 gün geçerlidir ...
S4 [token-garbage|empty|none] Davet bağlantısı geçersiz ...
S5 alice after: banner? 1   → Membership alice@fabrika.test PIPELINE_MANAGER
S6 M2 button hit-test after scroll: {"covered":true,"by":"Geri bildirim"}
AuditEvent module.state.changed M2 {"status":"ON"} ×2 (21:14:46.307 / .344); ModuleState: tek satır M2 ON
S7[expired] invite: Pilot süresi doldu, düzenleme kapalı. Uzatma için yöneticinize başvurun.
S7[expired] M3 enable button disabled? true
S7[expired] u3 accept card: Bu çalışma alanı şu an salt-okunur ... Yeni üye eklenemiyor.
S7[expired] profile after reload starts with: Yapay zeka algoritmaları, derin öğrenme, AB Horizon Europe C
S8 grant again w/o extend: Pilot atandı. | extend notice: Pilot 90 gün uzatıldı. | audit: granted ×2, extended ×1
S9 billing seats: Kullanıcı koltukları 3 / 6
S9 invite while billing shows free seats: Hata: ... (6 koltuk: 3 üye, 3 bekleyen davet) ...
S9 profile POST requests during save: 0
K[tr-empty] result url=...?kurum=municipality&cevap=000000000000000&il=Samsun → 0 / 100 Başlangıç
K[tr-high]  result → 100 / 100 Hazır ; K[en-m390] overflow {"scrollW":390,"clientW":390}
K[tr-full] BACK at step 2: /tr/fon-hazirlik -> about:blank ; FORWARD -> giriş ekranı
L2[tr] POSTs: 1 Teşekkürler, talebiniz alındı. | PublicLead: tr ln=120 lo=199 Samsun municipality.101010101010101
R[empty] tr@1280 "Açık ve yakında açılacak çağrılar (0) Bu kurum türü için şu anda listelenecek çağrı yok"
R2 CERV-TOWN-TT:Y ERASMUS-YOUTH-PCOOP:Y HORIZON-MISS-CIT:Y CERV-TOWN-NT:Y DIGITAL:Y CERV-2026-NOTR:-  (TR dışı süzüldü)
C past date -> created? 0 | rows after dblclick: 1
G[valid] google w/o ack -> stayed ... "Devam edebilmek için aydınlatma metnini ... onaylamanız gerekir."
G[valid] google with ack -> REDIRECTED to Google ; cookies: fabrika_registration_invite, authjs.callback-url, authjs.pkce.code_verifier
G[unknown] banner: "Bir kalkınma ajansının davet koduyla kayıt oluyorsunuz: ZZZZ-ZZZZ-ZZZZ" → Google'a gönderiyor
M@360/390 members|dashboard scrollW=360/390, davet düğmesi hit=["ok","ok","ok"]
U1 invite -> Hata: Bu işlem için yetkiniz yok. Yalnızca kurum sahibi veya yöneticisi davet gönderebilir.
```

Temel ekran görüntüleri:
- Y-1: `12-accept-u1-landed.png`
- Y-4: `42-profile-fake-success.png`, `43-profile-after-reload-lost.png`
- Koltuk sınırı: `06-…` (üç dosya), `41-active-invite-refused-while-3of6.png`
- Salt-okunur: `30-expired-dashboard.png`, `32-expired-invite.png`, `34-expired-accept-u3.png`, `35-expired-billing.png`
- Davet kartları: `14`–`17`
- Karne: `50`–`55`
- Radar: `60-*`
- B1: `70`–`76`

## 4. Değişen dosyalar

Ürün kodunda değişiklik **yok**. Yalnız şunlar yazıldı:
- `/Users/macbook/alan/docs/agent-results/TASK-MUOLBPFFDC92B-qae-fb.md` (bu rapor)
- `/Users/macbook/alan/docs/agent-results/TASK-MUOLBPFFDC92B-qae-fb-ekler/` (74 png + `qa-kosu.log`)

Test betikleri geçici worktree'deydi ve onunla birlikte silindi. `/Users/macbook/alan` bir git deposu değil, bu yüzden commit yok.

## 5. Riskler / koşulamayanlar

- **Google OAuth dönüşü koşulamadı.** Yerelde gerçek Google kimliği yok. Sahte istemci kimliğiyle düğme ve yönlendirme doğrulandı, `accounts.google.com` isteği kesildi. Bu yüzden şu adımlar tarayıcıda denenmedi:
  - yeni hesabın davetle açılması (`registerInvitedOAuthUser`);
  - davet koduyla yeni kiracı açılması ve `invite_invalid` dönüşü;
  - aydınlatma onayı olmadan yeni hesap (`disclosure_required`).
  Bunların sunucu kuralları kodda ve se-fb'nin canlı testlerinde var; bu raporda kanıtlanmadı.
- **E-posta gönderimi (SMTP) kapalıydı.** Bağlantı elle iletildi. SMTP'li yolda Y-2'nin penceresi daralabilir ama kapanmaz (sayım kilitten önce yapılıyor), bu koşulmadı.
- **Salt-okunur kapısı** üç yazma yolunda denendi: davet API'si, modül düğmesi, davet kabulü. Diğer bütün server action'lar tek tek denenmedi. İNCELEME-19'daki canlı ONAY bu yolları kapsıyor.
- Süre dolumu ve davet süresi `trialEndsAt` ile `expires` alanları SQL ile geçmişe çekilerek canlandırıldı (saat yolculuğu yok).

## 6. Açık sorular

1. Y-1 için hangisi seçilmeli: MEMBER ve WRITER için ayrı bir giriş ekranı mı (ör. Çağrılar ya da Konsept Notları), yoksa panelin okuma görünümünü rol kapısından çıkarmak mı? Ürün kararı.
2. Y-3: pilot başlamadan en azından "bekleyen davetler + iptal" gerekli mi, yoksa ilk hafta platform ekibi mi elle yönetecek?
3. Radardaki "Türkiye katılamıyor" kartları "açık çağrılar" listesinde kalsın mı?

## 7. Sonraki adım

- Y-1…Y-4 için be-fb/fe-fb kartları açılmalı.
  - Y-2 için öneri: sayımdan önce her durumda kiracı düzeyinde advisory lock ya da SERIALIZABLE kullanılsın; kabul adımında da koltuk yeniden kontrol edilsin.
- Düzeltmeler gelince bu raporun 2, 4, 5, 13 ve 14 numaralı akışları aynı betikle yeniden koşulmalı.

**Platform beyanı:** Bütün akışlar **macOS**'ta (Darwin 27, Apple Silicon) gerçek **Google Chrome** ile headless koşuldu.
- Windows ve Linux'ta koşulmadı: bu makinede yoklar.
- Denenen kod yolları (Next.js sunucu rotaları, server action'lar, Postgres) platforma bağlı değil. Dosya yolu, kabuk, süreç ya da DPI kullanan bir yol yok, bu yüzden bulguların diğer platformlarda aynı olması beklenir.
- Mobil genişlikler (360/390) masaüstü Chrome'un görünüm alanı küçültülerek denendi. Gerçek iOS Safari ve Android Chrome koşulmadı.
